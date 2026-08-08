import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

import { createFirestoreDailyExecutiveBriefRepository } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefRepository";
import { generateDailyExecutiveBrief } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefService";
import { resolveDailyBriefNextBestAction } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefNextBestAction";
import { createFirestoreNextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { getDailyExecutiveBriefSummaryProvider } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefSummaryProvider";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function normalizeAvailableMinutes(value: unknown) {
  if (value == null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw Object.assign(new Error("Available time must be between 1 and 1440 minutes."), { status: 400, code: "brief/invalid-available-time" });
  }
  return minutes;
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
    const timezone = asString(body.timezone, 120) || "UTC";
    const availableMinutes = normalizeAvailableMinutes(body.availableMinutes);
    const nowMs = Date.now();
    const date = localDateForRecommendationTimezone(timezone, nowMs);
    const nextBestActionRepository = createFirestoreNextBestActionRepository(db);
    const capacityRepository = createFirestoreDailyCapacityRepository(db);
    let adaptiveRemainingCapacityRange: { min: number; max: number } | null = null;
    const result = await generateDailyExecutiveBrief({
      uid,
      date,
      repository: createFirestoreDailyExecutiveBriefRepository(db),
      forceRefresh: body.forceRefresh === true,
      availableMinutes,
      nowMs,
      nextBestActionLoader: () => resolveDailyBriefNextBestAction({ uid, date, nowMs, timezone, repository: nextBestActionRepository, remainingCapacityRange: adaptiveRemainingCapacityRange }),
      capacityLoader: async () => {
        const capacity = await getDailyCapacity({
          uid,
          localDate: date,
          timezone,
          nowMs,
          availableMinutesCeiling: availableMinutes,
          forceRefresh: body.forceRefresh === true,
          repository: capacityRepository,
        });
        adaptiveRemainingCapacityRange = capacity.snapshot.remainingRange;
        return {
          fullDayRange: capacity.snapshot.fullDayRange,
          remainingRange: capacity.snapshot.remainingRange,
          state: capacity.snapshot.state,
          confidence: capacity.snapshot.confidence,
          primarySource: capacity.snapshot.primarySource,
          sourceSignals: capacity.snapshot.sourceSignals,
          completedMinutesToday: capacity.snapshot.completedMinutesToday,
          availableMinutesCeiling: capacity.snapshot.availableMinutesCeiling ?? null,
          sourceVersion: capacity.snapshot.sourceVersion,
        };
      },
      summaryProvider: getDailyExecutiveBriefSummaryProvider(),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, brief: result.snapshot }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "brief/internal");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not prepare the daily brief right now.";
    if (status >= 500) console.error("[api/daily-executive-brief] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}
