import { describe, expect, it } from "vitest";

import { buildRecoveryBacklogPlan } from "./recoveryPlanning";
import { buildRecoveryEvaluationFixtures, evaluateRecoveryFixtureEligibility, RECOVERY_EVALUATION_FIXTURES } from "./recoveryEvaluationFixtures";
import { buildRecoverySession } from "./recoverySessionPlanning";

describe("Recovery deterministic evaluation fixtures", () => {
  it("contains a repeatable dataset with broad recovery coverage", () => {
    expect(RECOVERY_EVALUATION_FIXTURES).toHaveLength(120);
    expect(new Set(RECOVERY_EVALUATION_FIXTURES.map((fixture) => fixture.id)).size).toBe(120);
    expect(buildRecoveryEvaluationFixtures()).toEqual(buildRecoveryEvaluationFixtures());
    expect(RECOVERY_EVALUATION_FIXTURES.some((fixture) => fixture.eligibilityInput.inactiveLocalDays === 3)).toBe(true);
    expect(RECOVERY_EVALUATION_FIXTURES.some((fixture) => fixture.eligibilityInput.inactiveLocalDays === 7)).toBe(true);
    expect(RECOVERY_EVALUATION_FIXTURES.some((fixture) => fixture.eligibilityInput.overdueCount === 0)).toBe(true);
    expect(RECOVERY_EVALUATION_FIXTURES.some((fixture) => fixture.eligibilityInput.overdueCount >= 4)).toBe(true);
  });

  it("keeps eligibility and reason ordering deterministic", () => {
    for (const fixture of RECOVERY_EVALUATION_FIXTURES) {
      const first = evaluateRecoveryFixtureEligibility(fixture);
      const second = evaluateRecoveryFixtureEligibility(fixture);
      expect(first).toEqual(second);
      expect(first.eligible).toBe(fixture.expectedEligible);
      expect(first.reasonCodes.every((code) => typeof code === "string" && code.length > 0)).toBe(true);
    }
  });

  it("protects hard constraints, preserves safe flexibility, and bounds visibility", () => {
    for (const fixture of RECOVERY_EVALUATION_FIXTURES) {
      const first = buildRecoveryBacklogPlan({ userId: "fixture-user", localDate: fixture.localDate, remainingCapacityRange: { min: 15, max: 60 }, tasks: fixture.tasks });
      const second = buildRecoveryBacklogPlan({ userId: "fixture-user", localDate: fixture.localDate, remainingCapacityRange: { min: 15, max: 60 }, tasks: fixture.tasks });
      expect(first).toEqual(second);
      expect(new Set(first.visibleTaskIds).size).toBe(first.visibleTaskIds.length);
      expect(first.attentionTaskIds.length).toBeLessThanOrEqual(first.visibleLimits.attention);
      expect(first.flexibleTaskIds.length).toBeLessThanOrEqual(first.visibleLimits.flexible);
      expect(first.classifications.every((classification) => fixture.expectedClassificationCoverage.has(classification.taskId))).toBe(true);
      for (const classification of first.classifications) {
        if (classification.reasonCodes.includes("OVERDUE_HARD_DEADLINE")) expect(classification.movableByDefault).toBe(false);
      }
      for (const task of fixture.tasks.filter((candidate) => candidate.flexible && candidate.dueDate == null && !candidate.hardDeadline && !candidate.pinned && !candidate.inProgress && !candidate.blocksImportantWork)) {
        expect(first.classifications.find((classification) => classification.taskId === task.taskId)?.movableByDefault).toBe(true);
      }
    }
  });

  it("uses only non-destructive recovery action categories", () => {
    const allowed = new Set(["KEEP_ACTIVE", "DEFER_TO_LATER_DAY", "REMOVE_FROM_TODAY", "REVIEW_DEADLINE", "CLARIFY_TASK", "MARK_FOR_LATER_REVIEW"]);
    for (const fixture of RECOVERY_EVALUATION_FIXTURES) {
      const plan = buildRecoveryBacklogPlan({ userId: "fixture-user", localDate: fixture.localDate, remainingCapacityRange: { min: 15, max: 60 }, tasks: fixture.tasks });
      const session = buildRecoverySession({ id: fixture.id, userId: "fixture-user", localDate: fixture.localDate, nowMs: fixture.eligibilityInput.evaluatedAtMs, triggerCodes: ["USER_REQUESTED_RECOVERY"], remainingCapacity: { min: 15, max: 60 }, tasks: fixture.tasks, plan, scheduleRepairActions: [], sourceTaskVersionHash: "a".repeat(64) });
      expect(session.actions.every((action) => allowed.has(action.type))).toBe(true);
      expect(session.actions.some((action) => ["DELETE", "ARCHIVE"].includes(action.type as string))).toBe(false);
    }
  });
});
