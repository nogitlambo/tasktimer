import { describe, expect, it } from "vitest";

import {
  RECOVERY_DEFAULT_THRESHOLDS,
  evaluateRecoveryEligibility,
  type RecoveryEligibilityInput,
} from "./recoveryEligibility";

function input(overrides: Partial<RecoveryEligibilityInput> = {}): RecoveryEligibilityInput {
  return {
    localDate: "2026-08-08",
    evaluatedAtMs: Date.parse("2026-08-08T01:00:00.000Z"),
    inactiveLocalDays: 0,
    actionableBacklogCount: 0,
    overdueCount: 0,
    missedScheduledDays: 0,
    repeatedPlanOverloadCount: 0,
    repeatedRepairDismissalCount: 0,
    backlogEstimatedMinutes: 0,
    capacityMaxMinutes: null,
    lastDismissedAtMs: null,
    userRequested: false,
    thresholds: RECOVERY_DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

describe("Recovery Mode eligibility", () => {
  it("does not offer recovery when no deterministic condition is met", () => {
    const result = evaluateRecoveryEligibility(input());

    expect(result).toMatchObject({
      eligible: false,
      offered: false,
      suppressed: false,
      triggerCodes: [],
      manualAvailable: true,
    });
  });

  it("offers recovery with stable trigger and reason codes when thresholds are met", () => {
    const result = evaluateRecoveryEligibility(input({
      inactiveLocalDays: 3,
      actionableBacklogCount: 8,
      overdueCount: 4,
      missedScheduledDays: 3,
      repeatedPlanOverloadCount: 2,
      repeatedRepairDismissalCount: 2,
      backlogEstimatedMinutes: 200,
      capacityMaxMinutes: 60,
    }));

    expect(result.eligible).toBe(true);
    expect(result.offered).toBe(true);
    expect(result.triggerCodes).toEqual([
      "INACTIVE_MULTIPLE_DAYS",
      "BACKLOG_THRESHOLD_EXCEEDED",
      "OVERDUE_TASK_THRESHOLD_EXCEEDED",
      "MULTIPLE_MISSED_SCHEDULED_DAYS",
      "REPEATED_PLAN_OVERLOAD",
      "REPEATED_REPAIR_DISMISSAL",
      "CAPACITY_BACKLOG_MISMATCH",
    ]);
    expect(result.reasonCodes).toEqual([
      "OVERDUE_HARD_DEADLINE",
      "REPEATEDLY_POSTPONED",
      "LONG_INACTIVE_PERIOD",
      "BACKLOG_EXCEEDS_CAPACITY",
    ]);
  });

  it("suppresses automatic offers during the configured window but preserves manual activation", () => {
    const dismissedAtMs = Date.parse("2026-08-07T12:00:00.000Z");
    const automatic = evaluateRecoveryEligibility(input({
      actionableBacklogCount: 8,
      lastDismissedAtMs: dismissedAtMs,
    }));
    const manual = evaluateRecoveryEligibility(input({
      actionableBacklogCount: 8,
      lastDismissedAtMs: dismissedAtMs,
      userRequested: true,
    }));

    expect(automatic).toMatchObject({ eligible: true, offered: false, suppressed: true });
    expect(automatic.suppressionUntil).toBe("2026-08-08T12:00:00.000Z");
    expect(manual).toMatchObject({ eligible: true, offered: true, suppressed: false, manualAvailable: true });
  });
});
