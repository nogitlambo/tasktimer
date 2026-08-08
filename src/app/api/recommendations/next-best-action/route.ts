import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { buildNextBestActionExplanation } from "@/app/nextbestaction/lib/nextBestActionExplanation";
import { resolveNextBestActionExplanation } from "@/app/nextbestaction/lib/nextBestActionExplanationProvider";
import { rankNextBestActionCandidates } from "@/app/nextbestaction/lib/nextBestActionRanking";
import {
  createFirestoreNextBestActionRepository,
  createRecommendationForRanking,
  localDateForRecommendationTimezone,
} from "@/app/nextbestaction/lib/nextBestActionRepository";
import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";

const NO_ELIGIBLE_TASKS_MESSAGE = "Nothing needs your attention right now.";
const GENERATION_FAILURE_MESSAGE = "TaskLaunch could not choose a recommendation right now.";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeAvailableMinutes(value: unknown) {
  if (value == null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw Object.assign(new Error("Available time must be between 1 and 1440 minutes."), { status: 400, code: "recommendation/invalid-available-time" });
  return minutes;
}

function normalizeExcludedTaskIds(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Object.assign(new Error("Excluded tasks must be a list."), { status: 400, code: "recommendation/invalid-exclusions" });
  return Array.from(new Set(value.map((entry) => asString(entry, 160)).filter(Boolean))).slice(0, 20);
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function errorCode(error: unknown) {
  return asString((error as { code?: unknown })?.code, 120) || "recommendation/internal";
}

function safeResponseRecommendation(recommendation: ReturnType<typeof createRecommendationForRanking>) {
  return {
    recommendationId: recommendation.id,
    type: recommendation.type,
    taskId: recommendation.taskId,
    firstAction: recommendation.payload.firstAction,
    title: recommendation.payload.title,
    estimatedMinutes: recommendation.payload.durationMinutes,
    durationSource: recommendation.payload.durationSource,
    score: recommendation.payload.score,
    confidence: recommendation.payload.confidence,
    reasonCodes: recommendation.payload.reasonCodes,
    focusWindowMatched: recommendation.payload.focusWindowMatched,
    alternativeIndex: recommendation.payload.alternativeIndex,
    explanation: recommendation.payload.explanation,
    createdAt: recommendation.createdAt,
    expiresAt: recommendation.expiresAt,
  };
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    await enforceUidRateLimit({ namespace: "next-best-action/explanation", uid, windowMs: 60_000, maxEvents: 10, code: "next-best-action/rate-limited", message: "Please wait before requesting another recommendation." });

    const availableMinutes = normalizeAvailableMinutes(body.availableMinutes);
    const excludedTaskIds = normalizeExcludedTaskIds(body.excludeTaskIds);
    const timezone = asString(body.timezone, 120) || "UTC";
    const nowMs = Date.now();
    const repository = createFirestoreNextBestActionRepository(db);
    const candidates = await repository.loadCandidates({ uid, nowMs, timezone });
    let remainingCapacityRange: { min: number; max: number } | null = null;
    try {
      const capacity = await getDailyCapacity({
        uid,
        localDate: localDateForRecommendationTimezone(timezone, nowMs),
        timezone,
        nowMs,
        availableMinutesCeiling: availableMinutes,
        repository: createFirestoreDailyCapacityRepository(db),
      });
      remainingCapacityRange = capacity.snapshot.remainingRange;
    } catch {
      remainingCapacityRange = null;
    }
    const ranked = rankNextBestActionCandidates({
      userId: uid,
      nowMs,
      todayDate: localDateForRecommendationTimezone(timezone, nowMs),
      availableMinutes,
      remainingCapacityRange,
      excludedTaskIds,
      candidates,
    });
    if (!ranked.primary) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json({ ok: true, recommendation: null, empty: true, message: NO_ELIGIBLE_TASKS_MESSAGE })
      );
    }

    const deterministicExplanation = buildNextBestActionExplanation(ranked.primary.reasonCodes, availableMinutes);
    const explanation = await resolveNextBestActionExplanation({ reasonCodes: ranked.primary.reasonCodes, confidence: ranked.primary.confidence, availableMinutes }, deterministicExplanation);
    const recommendation = createRecommendationForRanking({
      id: randomUUID(),
      uid,
      ranked: ranked.primary,
      availableMinutes,
      explanation,
      nowMs,
    });
    await repository.saveRecommendation(uid, recommendation);
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, recommendation: safeResponseRecommendation(recommendation) }));
  } catch (error) {
    const status = errorStatus(error);
    const code = errorCode(error);
    if (status >= 400 && status < 500) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    }
    if (status === 410 || status === 503) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : GENERATION_FAILURE_MESSAGE, code }, { status }));
    }
    console.error("[api/recommendations/next-best-action] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: GENERATION_FAILURE_MESSAGE, code: "recommendation/internal" }, { status: 500 }));
  }
}
