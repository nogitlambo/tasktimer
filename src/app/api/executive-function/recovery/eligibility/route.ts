import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { createFirestoreRecoveryEligibilityRepository } from "@/app/recovery/lib/recoveryRepository";
import { loadRecoveryEligibility } from "@/app/recovery/lib/recoveryEligibilityService";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    const url = new URL(req.url);
    const timezone = asString(url.searchParams.get("timezone"), 120) || "UTC";
    const nowMs = Date.now();
    const localDate = localDateForRecommendationTimezone(timezone, nowMs);
    const result = await loadRecoveryEligibility({
      uid,
      localDate,
      timezone,
      nowMs,
      userRequested: url.searchParams.get("userRequested") === "true",
      repository: createFirestoreRecoveryEligibilityRepository(db),
      capacityLoader: async () => {
        const capacity = await getDailyCapacity({ uid, localDate, timezone, nowMs, forceRefresh: false, repository: createFirestoreDailyCapacityRepository(db) });
        return capacity.snapshot;
      },
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, eligibility: result.eligibility }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "recovery/eligibility-internal");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not check Recovery Mode eligibility right now.";
    if (status >= 500) console.error("[api/executive-function/recovery/eligibility] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    await createFirestoreRecoveryEligibilityRepository(db).recordDismissal(uid, Date.now());
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, status: "DISMISSED" }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "recovery/dismissal-internal");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not dismiss Recovery Mode right now.";
    if (status >= 500) console.error("[api/executive-function/recovery/eligibility] Dismissal failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}
