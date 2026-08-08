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
import { createFirestoreNextBestActionRepository, createRecommendationForRanking, localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

type RouteContext = { params: Promise<{ recommendationId?: string }> };

function asString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function responseRecommendation(recommendation: ReturnType<typeof createRecommendationForRanking>) {
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

function normalizeAvailableMinutes(value: unknown) {
  if (value == null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw Object.assign(new Error("Available time must be between 1 and 1440 minutes."), { status: 400, code: "recommendation/invalid-available-time" });
  return minutes;
}

function normalizeExcludedTaskIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => asString(entry)).filter(Boolean))).slice(0, 4);
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
    await enforceUidRateLimit({ namespace: "next-best-action/explanation", uid, windowMs: 60_000, maxEvents: 10, code: "next-best-action/rate-limited", message: "Please wait before requesting another recommendation." });
    const recommendationId = asString((await context.params).recommendationId);
    const availableMinutes = normalizeAvailableMinutes(body.availableMinutes);
    const timezone = asString(body.timezone, 120) || "UTC";
    const repository = createFirestoreNextBestActionRepository(db);
    const previous = await repository.loadRecommendation(uid, recommendationId);
    if (!previous || previous.userId !== uid) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Next Best Action recommendation not found.", code: "recommendation/not-found" }, { status: 404 }));
    const nextIndex = previous.payload.alternativeIndex + 1;
    if (nextIndex > 3) return withAuthenticatedApiCors(req, NextResponse.json({ error: "You have reached the alternative limit. Review your task list for more options.", code: "recommendation/alternative-limit" }, { status: 409 }));
    const skipResult = await repository.skipRecommendation({ uid, recommendationId, nowMs: Date.now() });
    if (skipResult === "idempotent") return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: true, recommendation: null }));
    if (skipResult === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation has expired. Refresh to choose again.", code: "recommendation/expired" }, { status: 409 }));
    if (skipResult === "not-active" || skipResult === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation is no longer active. Refresh to choose again.", code: "recommendation/not-active" }, { status: 409 }));
    const nowMs = Date.now();
    const excludedTaskIds = Array.from(new Set([...normalizeExcludedTaskIds(body.excludeTaskIds), previous.taskId]));
    const candidates = await repository.loadCandidates({ uid, nowMs, timezone });
    const ranked = rankNextBestActionCandidates({ userId: uid, nowMs, todayDate: localDateForRecommendationTimezone(timezone, nowMs), availableMinutes, excludedTaskIds, candidates });
    if (!ranked.primary) return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, recommendation: null, empty: true, alternativeIndex: nextIndex }));
    const deterministicExplanation = buildNextBestActionExplanation(ranked.primary.reasonCodes, availableMinutes);
    const explanation = await resolveNextBestActionExplanation({ reasonCodes: ranked.primary.reasonCodes, confidence: ranked.primary.confidence, availableMinutes }, deterministicExplanation);
    const recommendation = createRecommendationForRanking({ id: randomUUID(), uid, ranked: ranked.primary, availableMinutes, alternativeIndex: nextIndex, explanation, nowMs });
    await repository.saveRecommendation(uid, recommendation);
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, recommendation: responseRecommendation(recommendation) }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const code = asString((error as { code?: unknown })?.code, 120) || "recommendation/internal";
    if (Number.isInteger(status) && status >= 400 && status <= 599) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/recommendations/next-best-action/alternative] Request failed", { code, status: 500 });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "Could not find an alternative right now.", code: "recommendation/internal" }, { status: 500 }));
  }
}
