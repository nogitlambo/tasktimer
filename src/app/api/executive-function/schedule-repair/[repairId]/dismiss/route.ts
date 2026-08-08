import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { createFirestoreScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

type RouteContext = { params: Promise<{ repairId?: string }> };

function asString(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    await enforceUidRateLimit({ namespace: "schedule-repair/dismiss", uid, windowMs: 60_000, maxEvents: 12, code: "schedule-repair/rate-limited", message: "Please wait before dismissing another schedule repair." });
    const repairId = asString((await context.params).repairId);
    const repository = createFirestoreScheduleRepairRepository(db);
    const proposal = await repository.loadProposal(uid, repairId);
    if (!proposal || proposal.userId !== uid) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Schedule repair not found.", code: "schedule-repair/not-found" }, { status: 404 }));
    if (proposal.status === "APPLIED" || proposal.status === "PARTIALLY_APPLIED") return withAuthenticatedApiCors(req, NextResponse.json({ error: "An applied schedule repair cannot be dismissed.", code: "schedule-repair/already-applied" }, { status: 409 }));
    const dismissed = { ...proposal, status: "DISMISSED" as const, actions: proposal.actions.map((action) => ({ ...action, selected: false, status: action.status === "PROPOSED" ? "REJECTED" as const : action.status })), auditEvents: [...(proposal.auditEvents || []), { type: "DISMISSED" as const, at: new Date().toISOString(), actionIds: proposal.actions.map((action) => action.id) }].slice(-20) };
    await repository.saveProposal(uid, dismissed);
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, proposal: dismissed }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    if (safeStatus < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code: "schedule-repair/request-failed" }, { status: safeStatus }));
    console.error("[api/executive-function/schedule-repair/dismiss] Request failed", { error });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not dismiss the schedule repair right now.", code: "schedule-repair/internal" }, { status: 500 }));
  }
}
