import { createHash } from "node:crypto";

import { calculateDailyExecutiveBriefPlan } from "./dailyExecutiveBriefPlanning";
import { buildDailyExecutiveBriefSummary, createDailyExecutiveBriefSnapshot, type DailyExecutiveBriefCapacitySummary, type DailyExecutiveBriefSnapshot } from "./dailyExecutiveBriefContract";
import type { DailyExecutiveBriefRepository } from "./dailyExecutiveBriefRepository";
import type { DailyBriefNextBestAction } from "./dailyExecutiveBriefNextBestAction";
import type { DailyExecutiveBriefSummaryInput } from "./dailyExecutiveBriefSummaryProvider";

export async function generateDailyExecutiveBrief(input: {
  uid: string;
  date: string;
  repository: DailyExecutiveBriefRepository;
  nowMs?: number;
  forceRefresh?: boolean;
  availableMinutes?: number | null;
  nextBestActionLoader?: () => Promise<{ recommendation: DailyBriefNextBestAction | null; clarificationTaskIds: string[] }>;
  capacityLoader?: () => Promise<DailyExecutiveBriefCapacitySummary>;
  summaryProvider?: { summarize(input: DailyExecutiveBriefSummaryInput): Promise<string> } | null;
}): Promise<{ snapshot: DailyExecutiveBriefSnapshot; reused: boolean }> {
  const nowMs = Math.max(1, Math.floor(input.nowMs ?? Date.now()));
  const existing = await input.repository.loadBrief(input.uid, input.date);
  let source;
  try {
    source = await input.repository.loadSourceContext(input.uid);
  } catch (error) {
    if (!input.forceRefresh && existing && existing.date === input.date && Date.parse(existing.expiresAt) > nowMs) return { snapshot: existing, reused: true };
    throw error;
  }
  let adaptiveCapacity: DailyExecutiveBriefCapacitySummary | null = null;
  if (input.capacityLoader) {
    try { adaptiveCapacity = await input.capacityLoader(); } catch { adaptiveCapacity = null; }
  }
  const availability = input.availableMinutes == null ? source.availability : { ...source.availability, userSelectedMinutes: input.availableMinutes };
  const baseSourceVersion = input.availableMinutes == null
    ? source.sourceVersion
    : createHash("sha256").update(`${source.sourceVersion}:available-minutes:${input.availableMinutes}`).digest("hex");
  const sourceVersion = adaptiveCapacity
    ? createHash("sha256").update(`${baseSourceVersion}:adaptive-capacity:${adaptiveCapacity.sourceVersion}`).digest("hex")
    : baseSourceVersion;
  if (!input.forceRefresh && existing && existing.date === input.date && existing.sourceVersion === sourceVersion && Date.parse(existing.expiresAt) > nowMs) {
    return { snapshot: existing, reused: true };
  }
  let plan = calculateDailyExecutiveBriefPlan({ todayDate: input.date, tasks: source.tasks, availability: adaptiveCapacity ? { ...availability, userSelectedMinutes: adaptiveCapacity.remainingRange.max } : availability });
  if (adaptiveCapacity) {
    const capacitySource = adaptiveCapacity.primarySource === "USER_CUSTOM" || adaptiveCapacity.primarySource === "USER_STATE"
      ? "USER_SELECTED" as const
      : adaptiveCapacity.primarySource === "WEEKDAY_HISTORY" || adaptiveCapacity.primarySource === "ROLLING_HISTORY"
        ? "HISTORICAL_BASELINE" as const
        : "PRODUCT_DEFAULT" as const;
    const nextReasons = new Set(plan.reasonCodes);
    nextReasons.delete("OVER_CAPACITY");
    nextReasons.delete("INSUFFICIENT_REMAINING_TIME");
    if (plan.remainingMinutes > adaptiveCapacity.remainingRange.max) {
      nextReasons.add("OVER_CAPACITY");
      nextReasons.add("INSUFFICIENT_REMAINING_TIME");
    }
    const planHealth = plan.activeTaskCount === 0 || plan.planHealth === "INSUFFICIENT_DATA"
      ? plan.planHealth
      : plan.remainingMinutes > adaptiveCapacity.remainingRange.max * 1.5
        ? "SIGNIFICANTLY_OVERLOADED" as const
        : plan.remainingMinutes > adaptiveCapacity.remainingRange.max
          ? "SLIGHTLY_OVERLOADED" as const
          : "REALISTIC" as const;
    plan = {
      ...plan,
      realisticWorkloadRange: { minMinutes: adaptiveCapacity.remainingRange.min, maxMinutes: adaptiveCapacity.remainingRange.max },
      capacityMinutes: adaptiveCapacity.remainingRange.max,
      capacitySource,
      planHealth,
      reasonCodes: Array.from(nextReasons),
    };
  }
  let nextBestAction = { recommendation: null, clarificationTaskIds: [] } as { recommendation: DailyBriefNextBestAction | null; clarificationTaskIds: string[] };
  if (input.nextBestActionLoader) {
    try { nextBestAction = await input.nextBestActionLoader(); } catch { nextBestAction = { recommendation: null, clarificationTaskIds: [] }; }
  }
  const deterministicSummary = buildDailyExecutiveBriefSummary(plan);
  let summary = deterministicSummary;
  if (input.summaryProvider) {
    try { summary = await input.summaryProvider.summarize(plan); } catch { summary = deterministicSummary; }
  }
  const snapshot = createDailyExecutiveBriefSnapshot({
    date: input.date,
    plan,
    nextBestAction: nextBestAction.recommendation,
    clarificationTaskIds: nextBestAction.clarificationTaskIds,
    adaptiveCapacity,
    summary,
    sourceVersion,
    generatedAtMs: nowMs,
  });
  await input.repository.saveBrief(input.uid, snapshot);
  return { snapshot, reused: false };
}
