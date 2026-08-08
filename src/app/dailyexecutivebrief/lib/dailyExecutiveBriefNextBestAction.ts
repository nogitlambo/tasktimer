import { randomUUID } from "node:crypto";

import { buildNextBestActionExplanation } from "@/app/nextbestaction/lib/nextBestActionExplanation";
import {
  createFirestoreNextBestActionRepository,
  createRecommendationForRanking,
  type NextBestActionRepository,
} from "@/app/nextbestaction/lib/nextBestActionRepository";
import { rankNextBestActionCandidates } from "@/app/nextbestaction/lib/nextBestActionRanking";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import type { DailyExecutiveBriefSnapshot } from "./dailyExecutiveBriefContract";

export type DailyBriefNextBestAction = NonNullable<DailyExecutiveBriefSnapshot["nextBestAction"]>;

export async function resolveDailyBriefNextBestAction(input: {
  uid: string;
  date: string;
  nowMs: number;
  timezone: string;
  remainingCapacityRange?: { min: number; max: number } | null;
  repository?: NextBestActionRepository;
}): Promise<{ recommendation: DailyBriefNextBestAction | null; clarificationTaskIds: string[] }> {
  const repository = input.repository || createFirestoreNextBestActionRepository();
  const candidates = await repository.loadCandidates({ uid: input.uid, nowMs: input.nowMs, timezone: input.timezone });
  const ranked = rankNextBestActionCandidates({
    userId: input.uid,
    nowMs: input.nowMs,
    todayDate: input.date || localDateForRecommendationTimezone(input.timezone, input.nowMs),
    remainingCapacityRange: input.remainingCapacityRange ?? null,
    candidates,
  });
  const clarificationTaskIds = candidates
    .filter((candidate) => candidate.clarification?.status === "ACTIVE")
    .map((candidate) => candidate.task.id)
    .filter((taskId, index, all) => !!taskId && all.indexOf(taskId) === index)
    .slice(0, 20);
  if (!ranked.primary) return { recommendation: null, clarificationTaskIds };

  const explanation = buildNextBestActionExplanation(ranked.primary.reasonCodes, null);
  const created = createRecommendationForRanking({
    id: randomUUID(),
    uid: input.uid,
    ranked: ranked.primary,
    availableMinutes: null,
    explanation,
    nowMs: input.nowMs,
  });
  await repository.saveRecommendation(input.uid, created);
  return {
    clarificationTaskIds,
    recommendation: {
      recommendationId: String(created.id),
      taskId: ranked.primary.taskId,
      title: ranked.primary.title,
      firstAction: ranked.primary.firstAction,
      estimatedMinutes: ranked.primary.durationMinutes,
      confidence: ranked.primary.confidence,
      reasonCodes: ranked.primary.reasonCodes,
      sourceTaskVersion: ranked.primary.taskVersion,
    },
  };
}
