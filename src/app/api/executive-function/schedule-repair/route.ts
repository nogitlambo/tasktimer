import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { createFirestoreScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { generateScheduleRepairProposal } from "@/app/schedulerepair/lib/scheduleRepairService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

function asString(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function errorCode(error: unknown) {
  return asString((error as { code?: unknown })?.code) || "schedule-repair/internal";
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    await enforceUidRateLimit({ namespace: "schedule-repair/generate", uid, windowMs: 60_000, maxEvents: 6, code: "schedule-repair/rate-limited", message: "Please wait before generating another schedule repair." });
    const timezone = asString(body.timezone) || "UTC";
    const nowMs = Date.now();
    const localDate = localDateForRecommendationTimezone(timezone, nowMs);
    const result = await generateScheduleRepairProposal({
      uid,
      localDate,
      nowMs,
      forceRefresh: body.forceRefresh === true,
      repository: createFirestoreScheduleRepairRepository(db),
      capacityLoader: async () => {
        const capacity = await getDailyCapacity({
          uid,
          localDate,
          timezone,
          nowMs,
          forceRefresh: body.forceRefresh === true,
          repository: createFirestoreDailyCapacityRepository(db),
        });
        return { snapshot: capacity.snapshot };
      },
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, outcome: result.outcome.evaluation, proposal: result.proposal }));
  } catch (error) {
    const status = errorStatus(error);
    const code = errorCode(error);
    if (status < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/executive-function/schedule-repair] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not prepare a schedule repair right now.", code: "schedule-repair/internal" }, { status: 500 }));
  }
}
