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
    await enforceUidRateLimit({ namespace: "schedule-repair/undo", uid, windowMs: 60_000, maxEvents: 6, code: "schedule-repair/rate-limited", message: "Please wait before undoing another schedule repair." });
    const repairId = asString((await context.params).repairId);
    const idempotencyKey = asString(body.idempotencyKey);
    if (!repairId || !idempotencyKey) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A repair id and undo idempotency key are required.", code: "schedule-repair/invalid-undo" }, { status: 400 }));
    const result = await createFirestoreScheduleRepairRepository(db).undoProposal({ uid, repairId, idempotencyKey, nowMs: Date.now() });
    if (result.kind === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Schedule repair not found.", code: "schedule-repair/not-found" }, { status: 404 }));
    if (result.kind === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "The undo window has expired.", code: "schedule-repair/undo-expired", proposal: result.proposal || null, results: result.results || [] }, { status: 409 }));
    if (result.kind === "invalid") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This schedule repair cannot be undone in its current state.", code: "schedule-repair/invalid-undo", proposal: result.proposal || null, results: result.results || [] }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result.kind === "idempotent", proposal: result.proposal || null, results: result.results || [] }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    if (safeStatus < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code: "schedule-repair/request-failed" }, { status: safeStatus }));
    console.error("[api/executive-function/schedule-repair/undo] Request failed", { error });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not undo the schedule repair right now.", code: "schedule-repair/internal" }, { status: 500 }));
  }
}
