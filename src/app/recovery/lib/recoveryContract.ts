import { z } from "zod";

export const RECOVERY_SCHEMA_VERSION = 1 as const;
export const RECOVERY_PLAN_VERSION = "recovery-mode-v1" as const;
export const RECOVERY_DEFAULT_THRESHOLDS = {
  inactivityDays: 3,
  actionableBacklogCount: 8,
  overdueCount: 4,
  missedScheduledDays: 3,
  repeatedPlanOverloadCount: 2,
  repeatedRepairDismissalCount: 2,
  capacityBacklogMultiplier: 3,
  suppressionWindowMs: 24 * 60 * 60 * 1000,
} as const;

export const RECOVERY_TRIGGER_CODE_VALUES = [
  "INACTIVE_MULTIPLE_DAYS",
  "BACKLOG_THRESHOLD_EXCEEDED",
  "OVERDUE_TASK_THRESHOLD_EXCEEDED",
  "MULTIPLE_MISSED_SCHEDULED_DAYS",
  "REPEATED_PLAN_OVERLOAD",
  "REPEATED_REPAIR_DISMISSAL",
  "CAPACITY_BACKLOG_MISMATCH",
  "USER_REQUESTED_RECOVERY",
] as const;

export const RECOVERY_CLASSIFICATION_VALUES = ["URGENT", "IMPORTANT", "FLEXIBLE", "STALE", "UNCLEAR"] as const;

export const RECOVERY_ACTION_TYPE_VALUES = [
  "KEEP_ACTIVE",
  "DEFER_TO_LATER_DAY",
  "REMOVE_FROM_TODAY",
  "REVIEW_DEADLINE",
  "CLARIFY_TASK",
  "MARK_FOR_LATER_REVIEW",
] as const;

export const RECOVERY_SESSION_STATUS_VALUES = ["ACTIVE", "PARTIALLY_APPLIED", "COMPLETED", "DISMISSED", "EXPIRED"] as const;
export const RECOVERY_ACTION_STATUS_VALUES = ["PROPOSED", "APPLIED", "REJECTED", "FAILED"] as const;
export const RECOVERY_APPLY_OUTCOME_VALUES = ["APPLIED", "STALE", "REJECTED", "FAILED", "SKIPPED"] as const;

export const RECOVERY_REASON_CODE_VALUES = [
  "OVERDUE_HARD_DEADLINE",
  "DUE_TODAY",
  "DUE_SOON",
  "HIGH_PRIORITY",
  "BLOCKING_OTHER_WORK",
  "FLEXIBLE_BACKLOG",
  "REPEATEDLY_POSTPONED",
  "LONG_INACTIVE_PERIOD",
  "TASK_STALE",
  "TASK_NEEDS_CLARIFICATION",
  "BACKLOG_EXCEEDS_CAPACITY",
  "SAFE_TO_DEFER",
  "RESTART_ACTION_AVAILABLE",
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const nonNegativeIntegerSchema = z.number().int().min(0).max(1000000);

export const RecoveryEligibilityThresholdsSchema = z.object({
  inactivityDays: z.number().int().min(1).max(365),
  actionableBacklogCount: z.number().int().min(1).max(100000),
  overdueCount: z.number().int().min(1).max(100000),
  missedScheduledDays: z.number().int().min(1).max(365),
  repeatedPlanOverloadCount: z.number().int().min(1).max(100000),
  repeatedRepairDismissalCount: z.number().int().min(1).max(100000),
  capacityBacklogMultiplier: z.number().positive().max(100),
  suppressionWindowMs: z.number().int().min(0).max(365 * 24 * 60 * 60 * 1000),
}).strict();

export const RecoveryEligibilityCountsSchema = z.object({
  inactiveLocalDays: nonNegativeIntegerSchema,
  actionableBacklogCount: nonNegativeIntegerSchema,
  overdueCount: nonNegativeIntegerSchema,
  missedScheduledDays: nonNegativeIntegerSchema,
  repeatedPlanOverloadCount: nonNegativeIntegerSchema,
  repeatedRepairDismissalCount: nonNegativeIntegerSchema,
  backlogEstimatedMinutes: nonNegativeIntegerSchema,
  capacityMaxMinutes: nonNegativeIntegerSchema.nullable(),
}).strict();

export const RecoveryEligibilityInputSchema = z.object({
  localDate: dateSchema,
  evaluatedAtMs: z.number().int().nonnegative(),
  inactiveLocalDays: nonNegativeIntegerSchema,
  actionableBacklogCount: nonNegativeIntegerSchema,
  overdueCount: nonNegativeIntegerSchema,
  missedScheduledDays: nonNegativeIntegerSchema,
  repeatedPlanOverloadCount: nonNegativeIntegerSchema,
  repeatedRepairDismissalCount: nonNegativeIntegerSchema,
  backlogEstimatedMinutes: nonNegativeIntegerSchema,
  capacityMaxMinutes: nonNegativeIntegerSchema.nullable(),
  lastDismissedAtMs: z.number().int().positive().nullable(),
  userRequested: z.boolean().default(false),
  thresholds: RecoveryEligibilityThresholdsSchema,
}).strict();

export const RecoveryEligibilityResultSchema = z.object({
  schemaVersion: z.literal(RECOVERY_SCHEMA_VERSION),
  planVersion: z.literal(RECOVERY_PLAN_VERSION),
  localDate: dateSchema,
  evaluatedAt: z.string().datetime({ offset: true }),
  eligible: z.boolean(),
  offered: z.boolean(),
  suppressed: z.boolean(),
  suppressionUntil: z.string().datetime({ offset: true }).nullable(),
  manualAvailable: z.literal(true),
  triggerCodes: z.array(z.enum(RECOVERY_TRIGGER_CODE_VALUES)),
  reasonCodes: z.array(z.enum(RECOVERY_REASON_CODE_VALUES)),
  counts: RecoveryEligibilityCountsSchema,
  thresholds: RecoveryEligibilityThresholdsSchema,
}).strict();

export const RecoveryTaskClassificationSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  classification: z.enum(RECOVERY_CLASSIFICATION_VALUES),
  movableByDefault: z.boolean(),
  reasonCodes: z.array(z.enum(RECOVERY_REASON_CODE_VALUES)).max(20),
}).strict();

export const RecoveryVisibleTaskLimitsSchema = z.object({
  attention: z.number().int().min(1).max(20),
  flexible: z.number().int().min(1).max(20),
}).strict();

export const RecoveryBacklogPlanSchema = z.object({
  classifications: z.array(RecoveryTaskClassificationSchema).max(1000),
  restartTaskId: z.string().trim().max(160).nullable(),
  restartNeedsClarification: z.boolean(),
  attentionTaskIds: z.array(z.string().trim().min(1).max(160)).max(20),
  flexibleTaskIds: z.array(z.string().trim().min(1).max(160)).max(20),
  visibleTaskIds: z.array(z.string().trim().min(1).max(160)).max(40),
  visibleLimits: RecoveryVisibleTaskLimitsSchema,
}).strict();

export const RecoveryActionSchema = z.object({
  id: z.string().trim().min(1).max(180),
  type: z.enum(RECOVERY_ACTION_TYPE_VALUES),
  classification: z.enum(RECOVERY_CLASSIFICATION_VALUES).optional(),
  taskId: z.string().trim().min(1).max(160),
  taskVersion: z.string().trim().min(1).max(200),
  fromDate: dateSchema.nullable().optional(),
  toDate: dateSchema.nullable().optional(),
  reasonCodes: z.array(z.enum(RECOVERY_REASON_CODE_VALUES)).max(20),
  selected: z.boolean(),
  status: z.enum(RECOVERY_ACTION_STATUS_VALUES),
}).strict();

export const RecoverySessionStatusSchema = z.enum(RECOVERY_SESSION_STATUS_VALUES);
export const RecoveryActionStatusSchema = z.enum(RECOVERY_ACTION_STATUS_VALUES);
export const RecoveryApplyActionResultSchema = z.object({
  actionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(160),
  outcome: z.enum(RECOVERY_APPLY_OUTCOME_VALUES),
  reason: z.string().trim().max(240),
  before: z.object({
    onceOffTargetDate: dateSchema.nullable(),
    plannedStartDay: z.string().trim().max(8).nullable(),
    plannedStartTime: z.string().trim().max(8).nullable(),
  }).strict().optional(),
  after: z.object({
    onceOffTargetDate: dateSchema.nullable(),
    plannedStartDay: z.string().trim().max(8).nullable(),
    plannedStartTime: z.string().trim().max(8).nullable(),
  }).strict().optional(),
}).strict();
export const RecoveryApplyHistorySchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(180),
  status: z.enum(["ACTIVE", "PARTIALLY_APPLIED"]),
  results: z.array(RecoveryApplyActionResultSchema).max(100),
}).strict();
export const RecoveryUndoRecordSchema = z.object({
  actionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(160),
  appliedTaskVersion: z.string().regex(/^[a-f0-9]{64}$/),
  originalFields: z.record(z.string(), z.unknown()),
  undone: z.boolean(),
}).strict();

export const RecoveryCapacityRangeSchema = z.object({
  min: z.number().int().min(0).max(1440),
  max: z.number().int().min(0).max(1440),
}).refine((range) => range.min <= range.max, "Recovery capacity minimum cannot exceed maximum.");

export const RecoverySessionSchema = z.object({
  schemaVersion: z.literal(RECOVERY_SCHEMA_VERSION),
  id: z.string().trim().min(1).max(180),
  userId: z.string().trim().min(1).max(120),
  localDate: dateSchema,
  triggerCodes: z.array(z.enum(RECOVERY_TRIGGER_CODE_VALUES)).max(20),
  backlogCount: z.number().int().min(0).max(1000000),
  overdueCount: z.number().int().min(0).max(1000000),
  urgentCount: z.number().int().min(0).max(1000000),
  flexibleCount: z.number().int().min(0).max(1000000),
  staleCount: z.number().int().min(0).max(1000000),
  remainingCapacity: RecoveryCapacityRangeSchema.nullable().optional(),
  targetDayCapacityMax: z.number().int().min(0).max(1440).nullable().optional(),
  restartTaskId: z.string().trim().max(160).nullable().optional(),
  nextBestActionRecommendationId: z.string().trim().max(180).nullable().optional(),
  actions: z.array(RecoveryActionSchema).max(1000),
  sourceTaskVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: RecoverySessionStatusSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable().optional(),
  applyIdempotencyKey: z.string().trim().max(180).nullable().optional(),
  applyResults: z.array(RecoveryApplyActionResultSchema).max(100).optional(),
  applyHistory: z.array(RecoveryApplyHistorySchema).max(10).optional(),
  downstreamInvalidationId: z.string().trim().max(180).nullable().optional(),
  undoRecords: z.array(RecoveryUndoRecordSchema).max(100).optional(),
  reversibleUntil: isoDateTimeSchema.nullable().optional(),
  undoIdempotencyKey: z.string().trim().max(180).nullable().optional(),
  undoResults: z.array(RecoveryApplyActionResultSchema).max(100).optional(),
}).strict();

export type RecoveryTriggerCode = (typeof RECOVERY_TRIGGER_CODE_VALUES)[number];
export type RecoveryClassification = (typeof RECOVERY_CLASSIFICATION_VALUES)[number];
export type RecoveryActionType = (typeof RECOVERY_ACTION_TYPE_VALUES)[number];
export type RecoverySessionStatus = (typeof RECOVERY_SESSION_STATUS_VALUES)[number];
export type RecoveryActionStatus = (typeof RECOVERY_ACTION_STATUS_VALUES)[number];
export type RecoveryApplyOutcome = (typeof RECOVERY_APPLY_OUTCOME_VALUES)[number];
export type RecoveryReasonCode = (typeof RECOVERY_REASON_CODE_VALUES)[number];
export type RecoveryEligibilityThresholds = z.infer<typeof RecoveryEligibilityThresholdsSchema>;
export type RecoveryEligibilityInput = z.infer<typeof RecoveryEligibilityInputSchema>;
export type RecoveryEligibilityCounts = z.infer<typeof RecoveryEligibilityCountsSchema>;
export type RecoveryEligibilityResult = z.infer<typeof RecoveryEligibilityResultSchema>;
export type RecoveryTaskClassification = z.infer<typeof RecoveryTaskClassificationSchema>;
export type RecoveryVisibleTaskLimits = z.infer<typeof RecoveryVisibleTaskLimitsSchema>;
export type RecoveryBacklogPlan = z.infer<typeof RecoveryBacklogPlanSchema>;
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;
export type RecoveryCapacityRange = z.infer<typeof RecoveryCapacityRangeSchema>;
export type RecoverySession = z.infer<typeof RecoverySessionSchema>;
export type RecoveryApplyActionResult = z.infer<typeof RecoveryApplyActionResultSchema>;
export type RecoveryApplyHistory = z.infer<typeof RecoveryApplyHistorySchema>;
export type RecoveryUndoRecord = z.infer<typeof RecoveryUndoRecordSchema>;
