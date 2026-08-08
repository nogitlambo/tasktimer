import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { createFirestoreRecoveryEligibilityRepository } from "@/app/recovery/lib/recoveryRepository";
import { loadRecoveryEligibility } from "@/app/recovery/lib/recoveryEligibilityService";
import { createFirestoreRecoveryPlanningRepository } from "@/app/recovery/lib/recoveryPlanningRepository";
import { createFirestoreRecoverySessionRepository } from "@/app/recovery/lib/recoverySessionRepository";
import { generateRecoverySession } from "@/app/recovery/lib/recoveryService";
import { createFirestoreScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asString(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function errorCode(error: unknown) {
  return asString((error as { code?: unknown })?.code, 120) || "recovery/internal";
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
    await enforceUidRateLimit({
      namespace: "recovery/generate",
      uid,
      windowMs: 60_000,
      maxEvents: 6,
      code: "recovery/rate-limited",
      message: "Please wait before generating another Recovery Mode session.",
    });
    const timezone = asString(body.timezone, 120) || "UTC";
    const nowMs = Date.now();
    const localDate = localDateForRecommendationTimezone(timezone, nowMs);
    const userRequested = body.userRequested === true;
    const eligibilityRepository = createFirestoreRecoveryEligibilityRepository(db);
    const eligibilityResult = await loadRecoveryEligibility({
      uid,
      localDate,
      timezone,
      nowMs,
      userRequested,
      repository: eligibilityRepository,
      capacityLoader: async () => {
        const capacity = await getDailyCapacity({
          uid,
          localDate,
          timezone,
          nowMs,
          forceRefresh: body.forceRefresh === true,
          repository: createFirestoreDailyCapacityRepository(db),
        });
        return capacity.snapshot;
      },
    });
    if (!eligibilityResult.eligibility.eligible && !userRequested) {
      return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, empty: true, session: null, eligibility: eligibilityResult.eligibility }));
    }
    const result = await generateRecoverySession({
      uid,
      localDate,
      timezone,
      nowMs,
      triggerCodes: eligibilityResult.eligibility.triggerCodes,
      sessionId: asString(body.recoveryId) || null,
      forceRefresh: body.forceRefresh === true,
      capacitySnapshot: eligibilityResult.capacitySnapshot,
      sessionRepository: createFirestoreRecoverySessionRepository(db),
      planningRepository: createFirestoreRecoveryPlanningRepository(db),
      scheduleRepairRepository: createFirestoreScheduleRepairRepository(db),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, eligibility: eligibilityResult.eligibility, session: result.session }));
  } catch (error) {
    const status = errorStatus(error);
    const code = errorCode(error);
    if (status < 500) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    }
    console.error("[api/executive-function/recovery] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not prepare Recovery Mode right now.", code: "recovery/internal" }, { status: 500 }));
  }
}
