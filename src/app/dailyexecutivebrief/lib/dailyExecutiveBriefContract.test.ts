import { describe, expect, it } from "vitest";

import { calculateDailyExecutiveBriefPlan } from "./dailyExecutiveBriefPlanning";
import { buildDailyExecutiveBriefSummary, createDailyExecutiveBriefSnapshot } from "./dailyExecutiveBriefContract";

describe("Daily Executive Brief contract", () => {
  it("creates explicit empty and insufficient-data statuses", () => {
    const emptyPlan = calculateDailyExecutiveBriefPlan({ todayDate: "2026-08-07", tasks: [], availability: {} });
    const empty = createDailyExecutiveBriefSnapshot({ date: "2026-08-07", plan: emptyPlan, sourceVersion: "a".repeat(64), generatedAtMs: Date.parse("2026-08-07T09:00:00Z") });
    expect(empty.status).toBe("EMPTY");
    expect(empty.summary).toContain("no active tasks");

    const unknownPlan = calculateDailyExecutiveBriefPlan({ todayDate: "2026-08-07", tasks: [{ id: "task-1", estimatedMinutes: null }], availability: {} });
    const unknown = createDailyExecutiveBriefSnapshot({ date: "2026-08-07", plan: unknownPlan, sourceVersion: "b".repeat(64), generatedAtMs: Date.parse("2026-08-07T09:00:00Z") });
    expect(unknown.status).toBe("INSUFFICIENT_DATA");
  });

  it("uses only deterministic plan facts in the summary", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      todayDate: "2026-08-07",
      tasks: [{ id: "task-1", estimatedMinutes: 90 }],
      availability: { userSelectedMinutes: 30 },
    });
    expect(buildDailyExecutiveBriefSummary(plan)).toBe("Today has 90 minutes of remaining work; 23-30 minutes is a realistic range. Consider reviewing the suggested adjustments.");
  });
});
