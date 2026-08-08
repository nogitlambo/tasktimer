import {
  RECOVERY_PLAN_VERSION,
  RECOVERY_REASON_CODE_VALUES,
  RECOVERY_SCHEMA_VERSION,
  RECOVERY_TRIGGER_CODE_VALUES,
  RecoveryEligibilityInputSchema,
  RecoveryEligibilityResultSchema,
  type RecoveryEligibilityInput,
  type RecoveryEligibilityResult,
  type RecoveryReasonCode,
  type RecoveryTriggerCode,
} from "./recoveryContract";

export { RECOVERY_DEFAULT_THRESHOLDS } from "./recoveryContract";
export type { RecoveryEligibilityInput, RecoveryEligibilityResult } from "./recoveryContract";

const triggerReasons: Partial<Record<RecoveryTriggerCode, RecoveryReasonCode>> = {
  INACTIVE_MULTIPLE_DAYS: "LONG_INACTIVE_PERIOD",
  BACKLOG_THRESHOLD_EXCEEDED: "REPEATEDLY_POSTPONED",
  OVERDUE_TASK_THRESHOLD_EXCEEDED: "OVERDUE_HARD_DEADLINE",
  MULTIPLE_MISSED_SCHEDULED_DAYS: "LONG_INACTIVE_PERIOD",
  CAPACITY_BACKLOG_MISMATCH: "BACKLOG_EXCEEDS_CAPACITY",
};

export function evaluateRecoveryEligibility(rawInput: RecoveryEligibilityInput): RecoveryEligibilityResult {
  const input = RecoveryEligibilityInputSchema.parse(rawInput);
  const { thresholds } = input;
  const matches: Record<RecoveryTriggerCode, boolean> = {
    INACTIVE_MULTIPLE_DAYS: input.inactiveLocalDays >= thresholds.inactivityDays,
    BACKLOG_THRESHOLD_EXCEEDED: input.actionableBacklogCount >= thresholds.actionableBacklogCount,
    OVERDUE_TASK_THRESHOLD_EXCEEDED: input.overdueCount >= thresholds.overdueCount,
    MULTIPLE_MISSED_SCHEDULED_DAYS: input.missedScheduledDays >= thresholds.missedScheduledDays,
    REPEATED_PLAN_OVERLOAD: input.repeatedPlanOverloadCount >= thresholds.repeatedPlanOverloadCount,
    REPEATED_REPAIR_DISMISSAL: input.repeatedRepairDismissalCount >= thresholds.repeatedRepairDismissalCount,
    CAPACITY_BACKLOG_MISMATCH:
      input.capacityMaxMinutes != null &&
      input.capacityMaxMinutes > 0 &&
      input.backlogEstimatedMinutes > input.capacityMaxMinutes * thresholds.capacityBacklogMultiplier,
    USER_REQUESTED_RECOVERY: input.userRequested,
  };
  const triggerCodes = RECOVERY_TRIGGER_CODE_VALUES.filter((code) => matches[code]);
  const eligible = triggerCodes.length > 0;
  const suppressionUntilMs = input.lastDismissedAtMs == null
    ? null
    : input.lastDismissedAtMs + thresholds.suppressionWindowMs;
  const suppressed =
    eligible &&
    !input.userRequested &&
    suppressionUntilMs != null &&
    input.evaluatedAtMs < suppressionUntilMs;
  const reasonCodes = RECOVERY_REASON_CODE_VALUES.filter((reason) =>
    triggerCodes.some((code) => triggerReasons[code] === reason)
  );
  const result = {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    planVersion: RECOVERY_PLAN_VERSION,
    localDate: input.localDate,
    evaluatedAt: new Date(input.evaluatedAtMs).toISOString(),
    eligible,
    offered: eligible && !suppressed,
    suppressed,
    suppressionUntil: suppressed && suppressionUntilMs != null ? new Date(suppressionUntilMs).toISOString() : null,
    manualAvailable: true as const,
    triggerCodes,
    reasonCodes,
    counts: {
      inactiveLocalDays: input.inactiveLocalDays,
      actionableBacklogCount: input.actionableBacklogCount,
      overdueCount: input.overdueCount,
      missedScheduledDays: input.missedScheduledDays,
      repeatedPlanOverloadCount: input.repeatedPlanOverloadCount,
      repeatedRepairDismissalCount: input.repeatedRepairDismissalCount,
      backlogEstimatedMinutes: input.backlogEstimatedMinutes,
      capacityMaxMinutes: input.capacityMaxMinutes,
    },
    thresholds,
  };
  return RecoveryEligibilityResultSchema.parse(result);
}
