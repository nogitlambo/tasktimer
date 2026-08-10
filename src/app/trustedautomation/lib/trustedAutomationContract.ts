import { z } from "zod";

export const TRUSTED_AUTOMATION_SCHEMA_VERSION = 1;

export const AUTOMATION_TRUST_LEVEL_VALUES = ["OFF", "ASSISTED", "TRUSTED", "AUTONOMOUS"] as const;
export const AUTOMATION_RULE_TRUST_LEVEL_VALUES = ["ASSISTED", "TRUSTED"] as const;
export const AUTOMATION_PRIORITY_VALUES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export const AUTOMATION_TRIGGER_TYPE_VALUES = ["TIME", "EVENT", "USER", "SYSTEM"] as const;
export const AUTOMATION_ENTITY_TYPE_VALUES = [
  "BRAIN_DUMP_SESSION",
  "TASK_CLARIFICATION",
  "RECOMMENDATION",
  "NEXT_BEST_ACTION",
  "CAPACITY_SNAPSHOT",
  "DAILY_BRIEF",
  "SCHEDULE_REPAIR",
  "RECOVERY_SESSION",
  "TASK",
  "AUTOMATION_EXECUTION",
] as const;
export const AUTOMATION_RULE_TYPE_VALUES = [
  "REFRESH_DAILY_BRIEF",
  "REFRESH_CAPACITY_SNAPSHOT",
  "REFRESH_NEXT_BEST_ACTION",
  "EXPIRE_RECOMMENDATIONS",
  "REFRESH_SCHEDULE_REPAIR",
  "REFRESH_RECOVERY_MODE",
  "MAINTAIN_BRAIN_DUMP",
  "REFRESH_TASK_CLARIFICATION",
] as const;
export const AUTOMATION_ACTION_VALUES = [
  "REFRESH_DAILY_BRIEF",
  "REFRESH_CAPACITY_SNAPSHOT",
  "REFRESH_NEXT_BEST_ACTION",
  "EXPIRE_RECOMMENDATIONS",
  "REFRESH_SCHEDULE_REPAIR",
  "REFRESH_RECOVERY_MODE",
  "MAINTAIN_BRAIN_DUMP",
  "REFRESH_TASK_CLARIFICATION",
] as const;
export const UNSUPPORTED_HIGH_IMPACT_ACTION_VALUES = [
  "MOVE_TASK",
  "MODIFY_DEADLINE",
  "CHANGE_RECURRING_SCHEDULE",
  "REPRIORITISE_TASK",
  "ARCHIVE_TASK",
  "DELETE_TASK",
  "CREATE_TASK",
] as const;
export const AUTOMATION_EXECUTION_STATE_VALUES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED", "CANCELLED"] as const;
export const AUTOMATION_ERROR_CATEGORY_VALUES = [
  "VALIDATION",
  "AUTHORIZATION",
  "CONFLICT",
  "TIMEOUT",
  "DEPENDENCY",
  "TRANSIENT",
  "UNKNOWN",
] as const;
export const AUTOMATION_ERROR_CODE_VALUES = [
  "INVALID_SCHEMA",
  "INVALID_ENUM",
  "MISSING_FIELD",
  "UNSUPPORTED_VERSION",
  "UNKNOWN_RULE_TYPE",
  "HIGH_IMPACT_ACTION_PROHIBITED",
  "ENTITY_NOT_FOUND",
  "ENTITY_STALE",
  "OWNERSHIP_FAILED",
  "LOCK_CONFLICT",
  "RULE_DISABLED",
  "TRUST_LEVEL_TOO_LOW",
  "IDEMPOTENCY_CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
  "UNKNOWN",
] as const;
export const AUTOMATION_ROLLBACK_POLICY_VALUES = ["NONE", "LOGICAL", "COMPENSATING_ACTION"] as const;
export const AUTOMATION_AUDIT_CATEGORY_VALUES = ["REFRESH", "STATE_MAINTENANCE", "GUIDED_EXECUTION"] as const;
export const AUTOMATION_EVENT_TYPE_VALUES = [
  "DAILY_BRIEF_GENERATED",
  "DAILY_BRIEF_STALE",
  "CAPACITY_UPDATED",
  "NEXT_BEST_ACTION_CREATED",
  "NEXT_BEST_ACTION_STARTED",
  "NEXT_BEST_ACTION_DISMISSED",
  "SCHEDULE_REPAIR_CREATED",
  "SCHEDULE_REPAIR_APPLIED",
  "RECOVERY_STARTED",
  "RECOVERY_COMPLETED",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMPLETED",
  "TASK_POSTPONED",
  "AUTOMATION_TRIGGERED",
  "AUTOMATION_COMPLETED",
  "AUTOMATION_FAILED",
] as const;

export const AutomationTrustLevelSchema = z.enum(AUTOMATION_TRUST_LEVEL_VALUES);
export const AutomationRuleTrustLevelSchema = z.enum(AUTOMATION_RULE_TRUST_LEVEL_VALUES);
export const AutomationPrioritySchema = z.enum(AUTOMATION_PRIORITY_VALUES);
export const AutomationTriggerTypeSchema = z.enum(AUTOMATION_TRIGGER_TYPE_VALUES);
export const AutomationEntityTypeSchema = z.enum(AUTOMATION_ENTITY_TYPE_VALUES);
export const AutomationRuleTypeSchema = z.enum(AUTOMATION_RULE_TYPE_VALUES);
export const AutomationActionSchema = z.enum(AUTOMATION_ACTION_VALUES);
export const UnsupportedHighImpactActionSchema = z.enum(UNSUPPORTED_HIGH_IMPACT_ACTION_VALUES);
export const AutomationExecutionStateSchema = z.enum(AUTOMATION_EXECUTION_STATE_VALUES);
export const AutomationErrorCategorySchema = z.enum(AUTOMATION_ERROR_CATEGORY_VALUES);
export const AutomationErrorCodeSchema = z.enum(AUTOMATION_ERROR_CODE_VALUES);
export const AutomationRollbackPolicySchema = z.enum(AUTOMATION_ROLLBACK_POLICY_VALUES);
export const AutomationAuditCategorySchema = z.enum(AUTOMATION_AUDIT_CATEGORY_VALUES);
export const AutomationEventTypeSchema = z.enum(AUTOMATION_EVENT_TYPE_VALUES);

const idSchema = z.string().trim().min(1).max(180);
const versionSchema = z.string().trim().min(1).max(200);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const AutomationTriggerSchema = z.object({
  type: AutomationTriggerTypeSchema,
  eventType: AutomationEventTypeSchema.optional(),
  entityType: AutomationEntityTypeSchema,
});

export const AutomationRetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  retryableCategories: z.array(AutomationErrorCategorySchema).max(AUTOMATION_ERROR_CATEGORY_VALUES.length),
  backoffMs: z.number().int().min(0).max(86_400_000),
});

export const AutomationAuditMetadataSchema = z.object({
  category: AutomationAuditCategorySchema,
  label: z.string().trim().min(1).max(160),
});

const AutomationRuleBaseSchema = z.object({
  id: idSchema,
  enabled: z.boolean(),
  trustLevel: AutomationRuleTrustLevelSchema,
  priority: AutomationPrioritySchema,
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  trigger: AutomationTriggerSchema,
  rollbackPolicy: AutomationRollbackPolicySchema,
  retryPolicy: AutomationRetryPolicySchema,
  auditMetadata: AutomationAuditMetadataSchema,
});

const RefreshDailyBriefRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_DAILY_BRIEF"),
  action: z.literal("REFRESH_DAILY_BRIEF"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("DAILY_BRIEF") }),
});

const RefreshCapacitySnapshotRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_CAPACITY_SNAPSHOT"),
  action: z.literal("REFRESH_CAPACITY_SNAPSHOT"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("CAPACITY_SNAPSHOT") }),
});

const RefreshNextBestActionRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_NEXT_BEST_ACTION"),
  action: z.literal("REFRESH_NEXT_BEST_ACTION"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("NEXT_BEST_ACTION") }),
});

const ExpireRecommendationsRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("EXPIRE_RECOMMENDATIONS"),
  action: z.literal("EXPIRE_RECOMMENDATIONS"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("RECOMMENDATION") }),
});

const RefreshScheduleRepairRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_SCHEDULE_REPAIR"),
  action: z.literal("REFRESH_SCHEDULE_REPAIR"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("SCHEDULE_REPAIR") }),
});

const RefreshRecoveryModeRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_RECOVERY_MODE"),
  action: z.literal("REFRESH_RECOVERY_MODE"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("RECOVERY_SESSION") }),
});

const MaintainBrainDumpRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("MAINTAIN_BRAIN_DUMP"),
  action: z.literal("MAINTAIN_BRAIN_DUMP"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("BRAIN_DUMP_SESSION") }),
});

const RefreshTaskClarificationRuleSchema = AutomationRuleBaseSchema.extend({
  type: z.literal("REFRESH_TASK_CLARIFICATION"),
  action: z.literal("REFRESH_TASK_CLARIFICATION"),
  trigger: AutomationTriggerSchema.extend({ entityType: z.literal("TASK_CLARIFICATION") }),
});

export const AutomationRuleSchema = z.discriminatedUnion("type", [
  RefreshDailyBriefRuleSchema,
  RefreshCapacitySnapshotRuleSchema,
  RefreshNextBestActionRuleSchema,
  ExpireRecommendationsRuleSchema,
  RefreshScheduleRepairRuleSchema,
  RefreshRecoveryModeRuleSchema,
  MaintainBrainDumpRuleSchema,
  RefreshTaskClarificationRuleSchema,
]);

export const AutomationErrorSchema = z.object({
  category: AutomationErrorCategorySchema,
  code: AutomationErrorCodeSchema,
  message: z.string().trim().min(1).max(240),
});

export const AutomationExecutionSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  id: idSchema,
  ruleId: idSchema,
  entityId: idSchema,
  entityType: AutomationEntityTypeSchema,
  entityVersion: versionSchema,
  state: AutomationExecutionStateSchema,
  idempotencyKey: z.string().trim().min(1).max(240),
  retryCount: z.number().int().min(0).max(10),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable().optional(),
  finishedAt: isoDateTimeSchema.nullable().optional(),
  error: AutomationErrorSchema.nullable().optional(),
});

export const AutomationEventEnvelopeSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  eventId: idSchema,
  eventType: AutomationEventTypeSchema,
  entityType: AutomationEntityTypeSchema,
  entityId: idSchema,
  entityVersion: versionSchema,
  userId: z.string().trim().min(1).max(120),
  timestamp: isoDateTimeSchema,
});

export type AutomationTrustLevel = z.infer<typeof AutomationTrustLevelSchema>;
export type AutomationRuleTrustLevel = z.infer<typeof AutomationRuleTrustLevelSchema>;
export type AutomationPriority = z.infer<typeof AutomationPrioritySchema>;
export type AutomationTriggerType = z.infer<typeof AutomationTriggerTypeSchema>;
export type AutomationEntityType = z.infer<typeof AutomationEntityTypeSchema>;
export type AutomationRuleType = z.infer<typeof AutomationRuleTypeSchema>;
export type AutomationAction = z.infer<typeof AutomationActionSchema>;
export type UnsupportedHighImpactAction = z.infer<typeof UnsupportedHighImpactActionSchema>;
export type AutomationExecutionState = z.infer<typeof AutomationExecutionStateSchema>;
export type AutomationErrorCategory = z.infer<typeof AutomationErrorCategorySchema>;
export type AutomationErrorCode = z.infer<typeof AutomationErrorCodeSchema>;
export type AutomationRollbackPolicy = z.infer<typeof AutomationRollbackPolicySchema>;
export type AutomationEventType = z.infer<typeof AutomationEventTypeSchema>;
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;
export type AutomationRetryPolicy = z.infer<typeof AutomationRetryPolicySchema>;
export type AutomationAuditMetadata = z.infer<typeof AutomationAuditMetadataSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export type AutomationError = z.infer<typeof AutomationErrorSchema>;
export type AutomationExecution = z.infer<typeof AutomationExecutionSchema>;
export type AutomationEventEnvelope = z.infer<typeof AutomationEventEnvelopeSchema>;

export type AutomationContractParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: Pick<AutomationError, "code" | "message"> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function contractFailure(code: AutomationError["code"], message: string) {
  return { success: false as const, error: { code, message } };
}

export function parseAutomationRule(value: unknown): AutomationContractParseResult<AutomationRule> {
  if (!isRecord(value)) return contractFailure("INVALID_SCHEMA", "Automation rule must be an object.");

  if (UNSUPPORTED_HIGH_IMPACT_ACTION_VALUES.includes(value.action as UnsupportedHighImpactAction)) {
    return contractFailure("HIGH_IMPACT_ACTION_PROHIBITED", "High-impact actions are not supported by Trusted Automation.");
  }
  if (!AutomationRuleTypeSchema.safeParse(value.type).success) {
    return contractFailure("UNKNOWN_RULE_TYPE", "Unknown automation rule types fail closed.");
  }
  if (value.schemaVersion !== TRUSTED_AUTOMATION_SCHEMA_VERSION) {
    return contractFailure("UNSUPPORTED_VERSION", "Unsupported automation rule schema versions fail closed.");
  }

  const parsed = AutomationRuleSchema.safeParse(value);
  return parsed.success
    ? parsed
    : contractFailure("INVALID_SCHEMA", "Automation rule does not satisfy the canonical contract.");
}

export function parseAutomationEventEnvelope(value: unknown): AutomationContractParseResult<AutomationEventEnvelope> {
  if (!isRecord(value)) return contractFailure("INVALID_SCHEMA", "Automation events must be objects.");
  if (value.schemaVersion !== TRUSTED_AUTOMATION_SCHEMA_VERSION) {
    return contractFailure("UNSUPPORTED_VERSION", "Unsupported automation event schema versions fail closed.");
  }
  const parsed = AutomationEventEnvelopeSchema.safeParse(value);
  return parsed.success
    ? parsed
    : contractFailure("INVALID_SCHEMA", "Automation event does not satisfy the canonical envelope.");
}

export function isTerminalAutomationExecutionState(state: AutomationExecutionState) {
  return state === "SUCCEEDED" || state === "FAILED" || state === "SKIPPED" || state === "CANCELLED";
}

const allowedExecutionTransitions: Record<AutomationExecutionState, readonly AutomationExecutionState[]> = {
  QUEUED: ["RUNNING", "SKIPPED", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "SKIPPED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  SKIPPED: [],
  CANCELLED: [],
};

export function canTransitionAutomationExecution(from: AutomationExecutionState, to: AutomationExecutionState) {
  return allowedExecutionTransitions[from].includes(to);
}
