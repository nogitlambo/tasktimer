import { z } from "zod";

import {
  DailyCapacityConfidenceSchema,
  DailyCapacityManualOverrideSchema,
  DailyCapacityPrimarySourceSchema,
  DailyCapacityStateSchema,
} from "@/app/adaptivecapacity/lib/dailyCapacityContract";

export const SCHEDULE_REPAIR_SCHEMA_VERSION = 1;
export const SCHEDULE_REPAIR_PLAN_VERSION = "schedule-repair-v1";
export const SCHEDULE_REPAIR_DEFAULT_CAPACITY_RANGE = { min: 45, max: 60 } as const;
export const SCHEDULE_REPAIR_TRIGGER_VALUES = [
  "PLAN_OVERLOADED",
  "PLAN_SIGNIFICANTLY_OVERLOADED",
  "AVAILABLE_TIME_REDUCED",
  "CAPACITY_REDUCED",
  "TASK_OVERRAN_ESTIMATE",
  "FOCUS_WINDOW_MISSED",
  "NEW_URGENT_TASK",
  "MULTIPLE_TASKS_SKIPPED",
  "DEADLINE_AT_RISK",
  "MANUAL_REFRESH",
] as const;
export const SCHEDULE_REPAIR_REASON_CODE_VALUES = [
  "TODAY_OVERLOADED",
  "TODAY_SIGNIFICANTLY_OVERLOADED",
  "TASK_FLEXIBLE",
  "TASK_LOW_PRIORITY",
  "TASK_NO_NEAR_DEADLINE",
  "TASK_DUE_SOON",
  "TASK_FIXED",
  "TASK_PINNED",
  "TASK_IN_PROGRESS",
  "TASK_BLOCKING",
  "TARGET_DAY_HAS_ROOM",
  "TARGET_DAY_OVERLOADED",
  "LIMITED_REMAINING_CAPACITY",
  "PARTIAL_PROGRESS_USEFUL",
  "HARD_DEADLINE_PROTECTED",
  "CAPACITY_REDUCED",
  "AVAILABLE_TIME_REDUCED",
  "RECENTLY_MOVED",
  "NO_SAFE_MOVE_AVAILABLE",
] as const;
export const SCHEDULE_REPAIR_ACTION_TYPE_VALUES = [
  "MOVE_TO_LATER_DAY",
  "REMOVE_FROM_TODAY",
  "REDUCE_TODAY_TARGET",
  "KEEP_TODAY",
  "REVIEW_DEADLINE",
  "CLARIFY_TASK",
] as const;
export const SCHEDULE_REPAIR_STATUS_VALUES = ["ACTIVE", "PARTIALLY_APPLIED", "APPLIED", "DISMISSED", "EXPIRED", "REVERSED"] as const;
export const SCHEDULE_REPAIR_ACTION_STATUS_VALUES = ["PROPOSED", "APPLIED", "REJECTED", "FAILED", "REVERSED"] as const;
export const SCHEDULE_REPAIR_APPLY_OUTCOME_VALUES = ["APPLIED", "STALE", "REJECTED", "FAILED", "SKIPPED"] as const;
export const SCHEDULE_REPAIR_AUDIT_EVENT_VALUES = ["GENERATED", "DISMISSED", "APPLIED", "PARTIALLY_APPLIED", "UNDONE", "EXPIRED"] as const;
export const SCHEDULE_REPAIR_OUTCOME_VALUES = ["INSUFFICIENT_DATA", "NO_REPAIR_NEEDED", "REPAIR_REQUIRED", "NO_SAFE_SOLUTION"] as const;
export const SCHEDULE_REPAIR_CLASSIFICATION_VALUES = ["FIXED", "LIMITED", "FLEXIBLE", "UNKNOWN"] as const;
export const SCHEDULE_REPAIR_CONSTRAINT_VALUES = [
  "TASK_NOT_OWNED",
  "TASK_NOT_EDITABLE",
  "TASK_COMPLETED",
  "TASK_INACTIVE",
  "HARD_DEADLINE",
  "TASK_PINNED",
  "RECURRENCE_RULE",
  "UNAVAILABLE_DAY",
  "SCHEDULE_HORIZON",
  "SCHEDULE_EXCLUSION",
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const minutesSchema = z.number().int().min(0).max(1440);

export const ScheduleRepairRangeSchema = z.object({
  min: minutesSchema,
  max: minutesSchema,
}).refine((range) => range.min <= range.max, "Schedule repair range minimum cannot exceed maximum.");

export const ScheduleRepairTaskSchema = z.object({
  id: z.string().trim().min(1).max(160),
  taskVersion: z.string().trim().max(200).optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  completedMinutes: minutesSchema.default(0),
  dueDate: dateSchema.nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  hardDeadline: z.boolean().optional(),
  flexible: z.boolean().optional(),
  pinned: z.boolean().optional(),
  inProgress: z.boolean().optional(),
  requiresClarification: z.boolean().optional(),
  blocksImportantWork: z.boolean().optional(),
  plannedDate: dateSchema.nullable().optional(),
  dependencySensitive: z.boolean().optional(),
  partialProgressUseful: z.boolean().optional(),
  recentlyMoved: z.boolean().optional(),
  recurrenceLocked: z.boolean().optional(),
  allowedTargetDates: z.array(dateSchema).max(370).optional(),
  ownerUid: z.string().trim().max(120).optional(),
  editable: z.boolean().default(true),
  active: z.boolean().default(true),
  completed: z.boolean().default(false),
});

export const ScheduleRepairCapacitySchema = z.object({
  remainingRange: ScheduleRepairRangeSchema,
  state: DailyCapacityStateSchema,
  confidence: DailyCapacityConfidenceSchema,
  primarySource: DailyCapacityPrimarySourceSchema,
  manualOverride: DailyCapacityManualOverrideSchema,
  source: z.enum(["ADAPTIVE_CAPACITY", "DAILY_EXECUTIVE_BRIEF_FALLBACK", "PRODUCT_DEFAULT"]),
});

export const ScheduleRepairActionSchema = z.object({
  id: z.string().trim().min(1).max(180),
  type: z.enum(SCHEDULE_REPAIR_ACTION_TYPE_VALUES),
  taskId: z.string().trim().min(1).max(160),
  taskVersion: z.string().trim().min(1).max(200),
  fromDate: dateSchema.nullable().optional(),
  toDate: dateSchema.nullable().optional(),
  fromMinutes: minutesSchema.nullable().optional(),
  toMinutes: minutesSchema.nullable().optional(),
  reasonCodes: z.array(z.enum(SCHEDULE_REPAIR_REASON_CODE_VALUES)).max(20),
  selected: z.boolean(),
  status: z.enum(SCHEDULE_REPAIR_ACTION_STATUS_VALUES),
});

export const ScheduleRepairApplyActionResultSchema = z.object({
  actionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(160),
  outcome: z.enum(SCHEDULE_REPAIR_APPLY_OUTCOME_VALUES),
  reason: z.string().trim().max(240),
});

export const ScheduleRepairApplyHistorySchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(180),
  status: z.enum(["ACTIVE", "PARTIALLY_APPLIED", "APPLIED"]),
  results: z.array(ScheduleRepairApplyActionResultSchema).max(20),
});

export const ScheduleRepairUndoRecordSchema = z.object({
  actionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(160),
  appliedTaskVersion: z.string().regex(/^[a-f0-9]{64}$/),
  originalFields: z.record(z.string(), z.unknown()),
  undone: z.boolean(),
});

export const ScheduleRepairAuditEventSchema = z.object({
  type: z.enum(SCHEDULE_REPAIR_AUDIT_EVENT_VALUES),
  at: isoDateTimeSchema,
  actionIds: z.array(z.string().trim().min(1).max(180)).max(20),
});

export const ScheduleRepairProposalSchema = z.object({
  schemaVersion: z.literal(SCHEDULE_REPAIR_SCHEMA_VERSION),
  id: z.string().trim().min(1).max(180),
  userId: z.string().trim().min(1).max(120),
  localDate: dateSchema,
  planHealthBefore: z.enum(["REALISTIC", "SLIGHTLY_OVERLOADED", "SIGNIFICANTLY_OVERLOADED", "INSUFFICIENT_DATA"]),
  remainingPlannedMinutesBefore: minutesSchema,
  remainingCapacity: ScheduleRepairRangeSchema,
  estimatedPlannedMinutesAfter: minutesSchema,
  actions: z.array(ScheduleRepairActionSchema).max(20),
  sourceTaskVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
  capacitySnapshotId: z.string().trim().max(180).nullable().optional(),
  dailyBriefId: z.string().trim().max(180).nullable().optional(),
  status: z.enum(SCHEDULE_REPAIR_STATUS_VALUES),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  appliedAt: isoDateTimeSchema.nullable().optional(),
  applyIdempotencyKey: z.string().trim().max(180).nullable().optional(),
  applyResults: z.array(ScheduleRepairApplyActionResultSchema).max(20).optional(),
  applyHistory: z.array(ScheduleRepairApplyHistorySchema).max(10).optional(),
  undoRecords: z.array(ScheduleRepairUndoRecordSchema).max(20).optional(),
  reversibleUntil: isoDateTimeSchema.nullable().optional(),
  undoIdempotencyKey: z.string().trim().max(180).nullable().optional(),
  undoResults: z.array(ScheduleRepairApplyActionResultSchema).max(20).optional(),
  auditEvents: z.array(ScheduleRepairAuditEventSchema).max(20).optional(),
  downstreamInvalidationId: z.string().trim().max(180).nullable().optional(),
});

export const ScheduleRepairEvaluationResultSchema = z.object({
  schemaVersion: z.literal(SCHEDULE_REPAIR_SCHEMA_VERSION),
  planVersion: z.literal(SCHEDULE_REPAIR_PLAN_VERSION),
  localDate: dateSchema,
  outcome: z.enum(SCHEDULE_REPAIR_OUTCOME_VALUES),
  planHealthBefore: z.enum(["REALISTIC", "SLIGHTLY_OVERLOADED", "SIGNIFICANTLY_OVERLOADED", "INSUFFICIENT_DATA"]),
  remainingPlannedMinutesBefore: minutesSchema,
  remainingCapacity: ScheduleRepairCapacitySchema,
  triggerCodes: z.array(z.enum(SCHEDULE_REPAIR_TRIGGER_VALUES)),
  reasonCodes: z.array(z.enum(SCHEDULE_REPAIR_REASON_CODE_VALUES)),
});

export const ScheduleRepairTaskClassificationSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  classification: z.enum(SCHEDULE_REPAIR_CLASSIFICATION_VALUES),
  movableByDefault: z.boolean(),
  reasonCodes: z.array(z.enum(SCHEDULE_REPAIR_REASON_CODE_VALUES)).max(20),
});

export const ScheduleRepairConstraintResultSchema = z.object({
  allowed: z.boolean(),
  violations: z.array(z.enum(SCHEDULE_REPAIR_CONSTRAINT_VALUES)).max(20),
});

export const ScheduleRepairGenerationResultSchema = z.object({
  evaluation: ScheduleRepairEvaluationResultSchema,
  actions: z.array(ScheduleRepairActionSchema).max(20),
  estimatedPlannedMinutesAfter: minutesSchema,
  relievedMinutes: minutesSchema,
});

export type ScheduleRepairTrigger = (typeof SCHEDULE_REPAIR_TRIGGER_VALUES)[number];
export type ScheduleRepairReasonCode = (typeof SCHEDULE_REPAIR_REASON_CODE_VALUES)[number];
export type ScheduleRepairActionType = (typeof SCHEDULE_REPAIR_ACTION_TYPE_VALUES)[number];
export type ScheduleRepairStatus = (typeof SCHEDULE_REPAIR_STATUS_VALUES)[number];
export type ScheduleRepairActionStatus = (typeof SCHEDULE_REPAIR_ACTION_STATUS_VALUES)[number];
export type ScheduleRepairApplyOutcome = (typeof SCHEDULE_REPAIR_APPLY_OUTCOME_VALUES)[number];
export type ScheduleRepairOutcome = (typeof SCHEDULE_REPAIR_OUTCOME_VALUES)[number];
export type ScheduleRepairRange = z.infer<typeof ScheduleRepairRangeSchema>;
export type ScheduleRepairTask = z.infer<typeof ScheduleRepairTaskSchema>;
export type ScheduleRepairCapacity = z.infer<typeof ScheduleRepairCapacitySchema>;
export type ScheduleRepairAction = z.infer<typeof ScheduleRepairActionSchema>;
export type ScheduleRepairApplyActionResult = z.infer<typeof ScheduleRepairApplyActionResultSchema>;
export type ScheduleRepairApplyHistory = z.infer<typeof ScheduleRepairApplyHistorySchema>;
export type ScheduleRepairUndoRecord = z.infer<typeof ScheduleRepairUndoRecordSchema>;
export type ScheduleRepairAuditEvent = z.infer<typeof ScheduleRepairAuditEventSchema>;
export type ScheduleRepairProposal = z.infer<typeof ScheduleRepairProposalSchema>;
export type ScheduleRepairEvaluationResult = z.infer<typeof ScheduleRepairEvaluationResultSchema>;
export type ScheduleRepairTaskClassification = z.infer<typeof ScheduleRepairTaskClassificationSchema>;
export type ScheduleRepairConstraint = (typeof SCHEDULE_REPAIR_CONSTRAINT_VALUES)[number];
export type ScheduleRepairConstraintResult = z.infer<typeof ScheduleRepairConstraintResultSchema>;
export type ScheduleRepairGenerationResult = z.infer<typeof ScheduleRepairGenerationResultSchema>;
