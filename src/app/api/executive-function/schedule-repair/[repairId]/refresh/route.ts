import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { createFirestoreScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { generateScheduleRepairProposal } from "@/app/schedulerepair/lib/scheduleRepairService";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

type RouteContext = { params: Promise<{ repairId?: string }> };

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
    await enforceUidRateLimit({ namespace: "schedule-repair/refresh", uid, windowMs: 60_000, maxEvents: 6, code: "schedule-repair/rate-limited", message: "Please wait before refreshing another schedule repair." });
    const repairId = asString((await context.params).repairId);
    const repository = createFirestoreScheduleRepairRepository(db);
    const existing = await repository.loadProposal(uid, repairId);
    if (!existing || existing.userId !== uid) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Schedule repair not found.", code: "schedule-repair/not-found" }, { status: 404 }));
    const timezone = asString(body.timezone, 120) || "UTC";
    const nowMs = Date.now();
    const localDate = localDateForRecommendationTimezone(timezone, nowMs);
    const result = await generateScheduleRepairProposal({
      uid,
      localDate,
      nowMs,
      proposalId: existing.id,
      forceRefresh: true,
      repository,
      capacityLoader: async () => {
        const capacity = await getDailyCapacity({ uid, localDate, timezone, nowMs, forceRefresh: true, repository: createFirestoreDailyCapacityRepository(db) });
        return { snapshot: capacity.snapshot };
      },
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: false, outcome: result.outcome.evaluation, proposal: result.proposal }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || "schedule-repair/internal";
    if (status < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/executive-function/schedule-repair/refresh] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not refresh the schedule repair right now.", code: "schedule-repair/internal" }, { status: 500 }));
  }
}
