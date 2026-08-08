import type { DailyExecutiveBriefPlanningInput, DailyExecutiveBriefTask } from "../lib/dailyExecutiveBriefPlanning";

export type DailyExecutiveBriefEvaluationFixture = {
  id: string;
  category: "empty" | "light" | "realistic" | "slightly-overloaded" | "significantly-overloaded";
  nextBestActionAvailable: boolean;
  clarificationNeeded: boolean;
  input: DailyExecutiveBriefPlanningInput;
  expectedPlanHealth: "REALISTIC" | "SLIGHTLY_OVERLOADED" | "SIGNIFICANTLY_OVERLOADED" | "INSUFFICIENT_DATA";
  expectedDeadlineRisk: "NONE" | "WATCH" | "CRITICAL";
};

const categories = [
  ["empty", 0, "INSUFFICIENT_DATA"],
  ["light", 30, "REALISTIC"],
  ["realistic", 60, "REALISTIC"],
  ["slightly-overloaded", 70, "SLIGHTLY_OVERLOADED"],
  ["significantly-overloaded", 100, "SIGNIFICANTLY_OVERLOADED"],
] as const;

const deadlines = [
  ["none", null, "NONE"],
  ["today", "2026-08-07", "WATCH"],
  ["overdue", "2026-08-06", "CRITICAL"],
  ["clustered", "2026-08-08", "WATCH"],
] as const;

export function buildDailyExecutiveBriefEvaluationDataset(): DailyExecutiveBriefEvaluationFixture[] {
  const fixtures: DailyExecutiveBriefEvaluationFixture[] = [];
  for (const [category, minutes, expectedPlanHealth] of categories) {
    for (const [deadlineName, dueDate, expectedDeadlineRisk] of deadlines) {
      for (const focus of ["none", "short", "normal"] as const) {
        for (const unknown of [false, true]) {
          const tasks: DailyExecutiveBriefTask[] = minutes === 0 && !unknown
            ? []
            : [{ id: `${category}-${deadlineName}`, estimatedMinutes: minutes > 0 ? minutes : null, dueDate, flexible: true, requiresClarification: unknown }];
          if (deadlineName === "clustered" && minutes > 0) tasks.push({ id: `${category}-${deadlineName}-second`, estimatedMinutes: null, dueDate: "2026-08-09", flexible: true, requiresClarification: false });
          const capacity = focus === "short" ? 20 : 60;
          const fixturePlanHealth = minutes === 0 && unknown
            ? "INSUFFICIENT_DATA"
            : minutes > capacity * 1.5
              ? "SIGNIFICANTLY_OVERLOADED"
              : minutes > capacity
                ? "SLIGHTLY_OVERLOADED"
                : expectedPlanHealth;
          fixtures.push({
            id: `${category}-${deadlineName}-${focus}-${unknown ? "unknown" : "known"}`,
            category,
            nextBestActionAvailable: category !== "empty",
            clarificationNeeded: unknown,
            input: {
              todayDate: "2026-08-07",
              tasks,
              availability: { remainingFocusWindowMinutes: focus === "short" ? 20 : null, focusWindowPresent: focus !== "none", productDefaultMinutes: 60 },
            },
            expectedPlanHealth: fixturePlanHealth,
            expectedDeadlineRisk: minutes === 0 && !unknown ? "NONE" : expectedDeadlineRisk,
          });
        }
      }
    }
  }
  return fixtures;
}
