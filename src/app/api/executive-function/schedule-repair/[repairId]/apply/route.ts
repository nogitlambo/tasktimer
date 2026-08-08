import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { createFirestoreScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { applyScheduleRepairProposal } from "@/app/schedulerepair/lib/scheduleRepairService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
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
    await enforceUidRateLimit({ namespace: "schedule-repair/apply", uid, windowMs: 60_000, maxEvents: 6, code: "schedule-repair/rate-limited", message: "Please wait before applying another schedule repair." });
    const repairId = asString((await context.params).repairId);
    const idempotencyKey = asString(body.idempotencyKey);
    const timezone = asString(body.timezone, 120) || "UTC";
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    const actions = rawActions.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const action = value as Record<string, unknown>;
      const id = asString(action.id);
      if (!id) return [];
      return [{ id, selected: action.selected === true, toDate: action.toDate == null ? null : asString(action.toDate, 10), toMinutes: action.toMinutes == null ? null : Number(action.toMinutes) }];
    }).slice(0, 20);
    if (!repairId || !idempotencyKey || !actions.length) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A repair id, idempotency key, and selected action list are required.", code: "schedule-repair/invalid-apply" }, { status: 400 }));
    const result = await applyScheduleRepairProposal({ uid, repairId, idempotencyKey, localDate: localDateForRecommendationTimezone(timezone, Date.now()), actions, nowMs: Date.now(), repository: createFirestoreScheduleRepairRepository(db) });
    if (result.kind === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Schedule repair not found.", code: "schedule-repair/not-found" }, { status: 404 }));
    if (result.kind === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This schedule repair has expired. Refresh it before applying.", code: "schedule-repair/expired", proposal: result.proposal || null, results: result.results || [] }, { status: 409 }));
    if (result.kind === "invalid") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This schedule repair cannot be applied in its current state.", code: "schedule-repair/invalid-apply", proposal: result.proposal || null, results: result.results || [] }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result.kind === "idempotent", proposal: result.proposal || null, results: result.results || [] }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    if (safeStatus < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code: "schedule-repair/request-failed" }, { status: safeStatus }));
    console.error("[api/executive-function/schedule-repair/apply] Request failed", { error });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not apply the schedule repair right now.", code: "schedule-repair/internal" }, { status: 500 }));
  }
}
