import type { DailyCapacityManualOverride } from "@/app/adaptivecapacity/lib/dailyCapacityContract";
import type { DailyCapacityPlanningInput } from "@/app/adaptivecapacity/lib/dailyCapacityPlanning";

type BaselineVariant = {
  name: string;
  baselineRange?: { min: number; max: number };
  state?: "REDUCED" | "LIGHT" | "STANDARD" | "STRONG";
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  primarySource?: "WEEKDAY_HISTORY" | "ROLLING_HISTORY" | "DEFAULT";
  sourceSignals?: ("WEEKDAY_HISTORY" | "ROLLING_HISTORY" | "DEFAULT_BASELINE" | "INSUFFICIENT_HISTORY")[];
};

const baselines: BaselineVariant[] = [
  { name: "default", primarySource: "DEFAULT", confidence: "LOW", sourceSignals: ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"] },
  { name: "weekday-history", baselineRange: { min: 40, max: 80 }, state: "STANDARD", confidence: "MEDIUM", primarySource: "WEEKDAY_HISTORY", sourceSignals: ["WEEKDAY_HISTORY"] },
  { name: "rolling-history", baselineRange: { min: 35, max: 65 }, state: "STANDARD", confidence: "MEDIUM", primarySource: "ROLLING_HISTORY", sourceSignals: ["ROLLING_HISTORY"] },
];

const completedMinutes = [0, 5, 20, 60];
const ceilings: Array<number | null> = [null, 15, 45];
const overrides: Array<{ name: string; value?: DailyCapacityManualOverride }> = [
  { name: "inferred" },
  { name: "reduced", value: { type: "STATE", state: "REDUCED", createdAt: "2026-08-07T09:00:00.000Z" } },
  { name: "strong", value: { type: "STATE", state: "STRONG", createdAt: "2026-08-07T09:00:00.000Z" } },
  { name: "custom", value: { type: "MINUTES", minutes: 45, createdAt: "2026-08-07T09:00:00.000Z" } },
];

export type DailyCapacityEvaluationFixture = {
  name: string;
  input: DailyCapacityPlanningInput;
  expectedPrimarySource: "DEFAULT" | "WEEKDAY_HISTORY" | "ROLLING_HISTORY" | "USER_STATE" | "USER_CUSTOM";
};

export function buildDailyCapacityEvaluationFixtures(): DailyCapacityEvaluationFixture[] {
  const fixtures: DailyCapacityEvaluationFixture[] = [];
  baselines.forEach((baseline) => completedMinutes.forEach((completed) => ceilings.forEach((ceiling) => overrides.forEach((override) => {
    const input: DailyCapacityPlanningInput = {
      localDate: "2026-08-07",
      completedMinutesToday: completed,
      availableMinutesCeiling: ceiling,
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      baselineRange: baseline.baselineRange,
      state: baseline.state,
      confidence: baseline.confidence,
      primarySource: baseline.primarySource,
      sourceSignals: baseline.sourceSignals,
      manualOverride: override.value,
    };
    fixtures.push({
      name: `${baseline.name}-${completed}m-${ceiling == null ? "no-ceiling" : `${ceiling}m-ceiling`}-${override.name}`,
      input,
      expectedPrimarySource: override.value?.type === "MINUTES" ? "USER_CUSTOM" : override.value?.type === "STATE" ? "USER_STATE" : baseline.primarySource || "DEFAULT",
    });
  }))));
  return fixtures;
}

export const dailyCapacityHistoricalEdgeCases = [
  { name: "untracked-day", days: [{ date: "2026-08-01", sessionCount: 0, completedMinutes: 0 }] },
  { name: "zero-duration-session", days: [{ date: "2026-08-02", sessionCount: 1, completedMinutes: 0 }] },
  { name: "excluded-day", days: [{ date: "2026-08-03", sessionCount: 1, completedMinutes: 30, excluded: true }] },
  { name: "corrupt-day", days: [{ date: "2026-08-04", sessionCount: 1, completedMinutes: 30, corrupted: true }] },
  { name: "outlier-day", days: [{ date: "2026-08-05", sessionCount: 1, completedMinutes: 30 }, { date: "2026-08-06", sessionCount: 1, completedMinutes: 1440 }] },
] as const;
