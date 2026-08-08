import { describe, expect, it } from "vitest";

import { calculateDailyExecutiveBriefPlan } from "../lib/dailyExecutiveBriefPlanning";
import { buildDailyExecutiveBriefEvaluationDataset } from "./dailyExecutiveBriefEvaluationDataset";

describe("Daily Executive Brief evaluation fixtures", () => {
  it("provides at least 100 independent deterministic public-behaviour fixtures", () => {
    const fixtures = buildDailyExecutiveBriefEvaluationDataset();
    expect(fixtures.length).toBeGreaterThanOrEqual(100);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    for (const fixture of fixtures) {
      const plan = calculateDailyExecutiveBriefPlan(fixture.input);
      expect(plan.planHealth, fixture.id).toBe(fixture.expectedPlanHealth);
      expect(plan.deadlineRisk, fixture.id).toBe(fixture.expectedDeadlineRisk);
      expect(plan.reasonCodes).not.toContain("TASK_TITLE");
    }
  });

  it("covers next-best-action availability, clarification signals, focus windows, and unknown durations", () => {
    const fixtures = buildDailyExecutiveBriefEvaluationDataset();
    expect(fixtures.some((fixture) => fixture.nextBestActionAvailable)).toBe(true);
    expect(fixtures.some((fixture) => !fixture.nextBestActionAvailable)).toBe(true);
    expect(fixtures.some((fixture) => fixture.clarificationNeeded)).toBe(true);
    expect(fixtures.some((fixture) => fixture.input.availability.focusWindowPresent === false)).toBe(true);
    expect(fixtures.some((fixture) => fixture.input.tasks.some((task) => task.estimatedMinutes == null))).toBe(true);
  });

  it("never returns an unsafe adjustment for hard deadlines, blockers, pinned, or in-progress tasks", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      todayDate: "2026-08-07",
      availability: { productDefaultMinutes: 30 },
      tasks: [
        { id: "hard", estimatedMinutes: 60, flexible: true, hardDeadline: true },
        { id: "high", estimatedMinutes: 60, flexible: true, priority: "high" },
        { id: "pinned", estimatedMinutes: 60, flexible: true, pinned: true },
        { id: "running", estimatedMinutes: 60, flexible: true, inProgress: true },
        { id: "safe", estimatedMinutes: 60, flexible: true },
      ],
    });
    expect(plan.adjustments.map((adjustment) => adjustment.taskId)).not.toEqual(expect.arrayContaining(["hard", "high", "pinned", "running"]));
  });
});
