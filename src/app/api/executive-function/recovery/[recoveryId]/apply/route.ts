import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { createFirestoreRecoveryApplyRepository } from "@/app/recovery/lib/recoveryApplyRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

type RouteContext = { params: Promise<{ recoveryId?: string }> };

function asString(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
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
    await enforceUidRateLimit({ namespace: "recovery/apply", uid, windowMs: 60_000, maxEvents: 6, code: "recovery/rate-limited", message: "Please wait before applying another Recovery Mode change." });
    const recoveryId = asString((await context.params).recoveryId);
    const idempotencyKey = asString(body.idempotencyKey);
    const timezone = asString(body.timezone, 120) || "UTC";
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    const actions = rawActions.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const action = value as Record<string, unknown>;
      const id = asString(action.id);
      if (!id) return [];
      return [{ id, selected: action.selected === true, toDate: action.toDate == null ? null : asString(action.toDate, 10) }];
    }).slice(0, 100);
    if (!recoveryId || !idempotencyKey || !actions.length) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A recovery id, idempotency key, and action list are required.", code: "recovery/invalid-apply" }, { status: 400 }));
    const nowMs = Date.now();
    let targetDayCapacityMax: number | null = null;
    try {
      const capacity = await getDailyCapacity({ uid, localDate: localDateForRecommendationTimezone(timezone, nowMs), timezone, nowMs, forceRefresh: true, repository: createFirestoreDailyCapacityRepository(db) });
      targetDayCapacityMax = capacity.snapshot.fullDayRange?.max ?? capacity.snapshot.remainingRange.max;
    } catch {
      targetDayCapacityMax = null;
    }
    const result = await createFirestoreRecoveryApplyRepository(db).applySession({
      uid,
      recoveryId,
      idempotencyKey,
      localDate: localDateForRecommendationTimezone(timezone, nowMs),
      actions,
      nowMs,
      targetDayCapacityMax,
    });
    if (result.kind === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Recovery Mode session not found.", code: "recovery/not-found" }, { status: 404 }));
    if (result.kind === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This Recovery Mode session has expired. Refresh it before applying.", code: "recovery/expired", session: result.session || null, results: result.results || [] }, { status: 409 }));
    if (result.kind === "invalid") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This Recovery Mode session cannot be applied in its current state.", code: "recovery/invalid-apply", session: result.session || null, results: result.results || [] }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result.kind === "idempotent", session: result.session || null, results: result.results || [] }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || "recovery/internal";
    if (status < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/executive-function/recovery/apply] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not apply the Recovery Mode changes right now.", code: "recovery/internal" }, { status: 500 }));
  }
}
