import { z } from "zod";

export const EXECUTIVE_NUDGE_SCHEMA_VERSION = 1;

export const EXECUTIVE_NUDGE_TYPE_VALUES = [
  "START_OPPORTUNITY",
  "FOCUS_WINDOW_START",
  "DEADLINE_RISK",
  "PLAN_OVERLOAD",
  "RECOVERY_SUGGESTED",
  "FIRST_ACTION_AVAILABLE",
  "RESUME_TASK",
  "PLAN_CHANGED",
] as const;

export const EXECUTIVE_NUDGE_PRIORITY_VALUES = ["CRITICAL_ATTENTION", "HIGH", "NORMAL", "LOW"] as const;

export const EXECUTIVE_NUDGE_REASON_CODE_VALUES = [
  "CAPACITY_AVAILABLE",
  "FOCUS_WINDOW_OPEN",
  "DEADLINE_RISK",
  "PLAN_OVERLOADED",
  "RECOVERY_ELIGIBLE",
  "FIRST_ACTION_AVAILABLE",
  "RECENT_SESSION",
  "PLAN_CHANGED",
] as const;

export const EXECUTIVE_NUDGE_SOURCE_FEATURE_VALUES = [
  "NEXT_BEST_ACTION",
  "ADAPTIVE_DAILY_CAPACITY",
  "FOCUS_WINDOW",
  "DAILY_EXECUTIVE_BRIEF",
  "SCHEDULE_REPAIR",
  "RECOVERY_MODE",
  "TASK_CLARIFICATION",
  "SESSION_HISTORY",
  "TRUSTED_AUTOMATION",
] as const;

export const ExecutiveNudgeTypeSchema = z.enum(EXECUTIVE_NUDGE_TYPE_VALUES);
export const ExecutiveNudgePrioritySchema = z.enum(EXECUTIVE_NUDGE_PRIORITY_VALUES);
export const ExecutiveNudgeReasonCodeSchema = z.enum(EXECUTIVE_NUDGE_REASON_CODE_VALUES);
export const ExecutiveNudgeSourceFeatureSchema = z.enum(EXECUTIVE_NUDGE_SOURCE_FEATURE_VALUES);

const idSchema = z.string().trim().min(1).max(180);
const optionalIdSchema = idSchema.nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const ExecutiveNudgeActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START_TASK"), taskId: idSchema }),
  z.object({ type: z.literal("VIEW_TASK"), taskId: idSchema }),
  z.object({ type: z.literal("OPEN_EXECUTIVE") }),
  z.object({ type: z.literal("OPEN_SCHEDULE_REPAIR"), repairId: optionalIdSchema }),
  z.object({ type: z.literal("OPEN_RECOVERY_MODE"), recoveryId: optionalIdSchema }),
  z.object({ type: z.literal("OPEN_TASK_CLARIFICATION"), taskId: idSchema }),
  z.object({ type: z.literal("RESUME_TASK"), taskId: idSchema }),
]);

export const ExecutiveNudgeCandidateSchema = z.object({
  id: idSchema,
  userId: z.string().trim().min(1).max(120),
  type: ExecutiveNudgeTypeSchema,
  sourceFeature: ExecutiveNudgeSourceFeatureSchema,
  sourceEntityId: optionalIdSchema,
  sourceEntityVersion: z.string().trim().min(1).max(200).nullable().optional(),
  priority: ExecutiveNudgePrioritySchema,
  urgency: z.number().int().min(0).max(100),
  usefulness: z.number().int().min(0).max(100),
  interruptionCost: z.number().int().min(0).max(100),
  reasonCodes: z.array(ExecutiveNudgeReasonCodeSchema).min(1).max(EXECUTIVE_NUDGE_REASON_CODE_VALUES.length),
  action: ExecutiveNudgeActionSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});

export type ExecutiveNudgeType = z.infer<typeof ExecutiveNudgeTypeSchema>;
export type ExecutiveNudgePriority = z.infer<typeof ExecutiveNudgePrioritySchema>;
export type ExecutiveNudgeReasonCode = z.infer<typeof ExecutiveNudgeReasonCodeSchema>;
export type ExecutiveNudgeSourceFeature = z.infer<typeof ExecutiveNudgeSourceFeatureSchema>;
export type ExecutiveNudgeAction = z.infer<typeof ExecutiveNudgeActionSchema>;
export type ExecutiveNudgeCandidate = z.infer<typeof ExecutiveNudgeCandidateSchema>;

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ExecutiveNudgeTypeEnabledSchema = z.object({
  START_OPPORTUNITY: z.boolean(),
  FOCUS_WINDOW_START: z.boolean(),
  DEADLINE_RISK: z.boolean(),
  PLAN_OVERLOAD: z.boolean(),
  RECOVERY_SUGGESTED: z.boolean(),
  FIRST_ACTION_AVAILABLE: z.boolean(),
  RESUME_TASK: z.boolean(),
  PLAN_CHANGED: z.boolean(),
});

export const ExecutiveNudgePreferencesSchema = z.object({
  schemaVersion: z.literal(EXECUTIVE_NUDGE_SCHEMA_VERSION),
  userId: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  paused: z.boolean(),
  typeEnabled: ExecutiveNudgeTypeEnabledSchema,
  quietHours: z.object({
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  }),
  maximumPushNudgesPerDay: z.number().int().min(0).max(20),
  timezone: z.string().trim().min(1).max(120).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ExecutiveNudgePreferences = z.infer<typeof ExecutiveNudgePreferencesSchema>;

export const EXECUTIVE_NUDGE_DELIVERY_CHANNEL_VALUES = ["IN_APP", "ANDROID_PUSH"] as const;
export const EXECUTIVE_NUDGE_DELIVERY_STATUS_VALUES = [
  "DELIVERED",
  "OPENED",
  "ACTIONED",
  "DISMISSED",
  "EXPIRED",
  "SUPPRESSED",
] as const;
export const EXECUTIVE_NUDGE_SUPPRESSION_CODE_VALUES = [
  "NUDGES_DISABLED",
  "NUDGES_PAUSED",
  "NUDGE_TYPE_DISABLED",
  "QUIET_HOURS",
  "ACTIVE_TASK_SESSION",
  "GLOBAL_COOLDOWN",
  "TYPE_COOLDOWN",
  "DUPLICATE",
  "RECENTLY_DISMISSED",
  "SOURCE_STALE",
  "SOURCE_INVALID",
  "ACTION_NO_LONGER_AVAILABLE",
  "LOW_VALUE",
  "HIGHER_PRIORITY_SELECTED",
  "DAILY_LIMIT_REACHED",
] as const;

export const ExecutiveNudgeDeliveryChannelSchema = z.enum(EXECUTIVE_NUDGE_DELIVERY_CHANNEL_VALUES);
export const ExecutiveNudgeDeliveryStatusSchema = z.enum(EXECUTIVE_NUDGE_DELIVERY_STATUS_VALUES);
export const ExecutiveNudgeSuppressionCodeSchema = z.enum(EXECUTIVE_NUDGE_SUPPRESSION_CODE_VALUES);

export const ExecutiveNudgeDeliverySchema = z.object({
  schemaVersion: z.literal(EXECUTIVE_NUDGE_SCHEMA_VERSION).default(EXECUTIVE_NUDGE_SCHEMA_VERSION),
  id: idSchema,
  userId: z.string().trim().min(1).max(120),
  candidateId: idSchema,
  candidateType: ExecutiveNudgeTypeSchema,
  sourceFeature: ExecutiveNudgeSourceFeatureSchema,
  sourceEntityId: optionalIdSchema,
  sourceEntityVersion: z.string().trim().min(1).max(200).nullable().optional(),
  channel: ExecutiveNudgeDeliveryChannelSchema,
  reasonCodes: z.array(ExecutiveNudgeReasonCodeSchema).min(1).max(EXECUTIVE_NUDGE_REASON_CODE_VALUES.length),
  status: ExecutiveNudgeDeliveryStatusSchema,
  action: ExecutiveNudgeActionSchema,
  suppressionCode: ExecutiveNudgeSuppressionCodeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  deliveredAt: isoDateTimeSchema.nullable().optional(),
  openedAt: isoDateTimeSchema.nullable().optional(),
  actionedAt: isoDateTimeSchema.nullable().optional(),
  dismissedAt: isoDateTimeSchema.nullable().optional(),
  expiredAt: isoDateTimeSchema.nullable().optional(),
});

export type ExecutiveNudgeDeliveryChannel = z.infer<typeof ExecutiveNudgeDeliveryChannelSchema>;
export type ExecutiveNudgeDeliveryStatus = z.infer<typeof ExecutiveNudgeDeliveryStatusSchema>;
export type ExecutiveNudgeSuppressionCode = z.infer<typeof ExecutiveNudgeSuppressionCodeSchema>;
export type ExecutiveNudgeDelivery = z.infer<typeof ExecutiveNudgeDeliverySchema>;
export type ExecutiveNudgeDeliveryInput = z.input<typeof ExecutiveNudgeDeliverySchema>;

export function createDefaultExecutiveNudgePreferences(userId: string, nowMs = Date.now()): ExecutiveNudgePreferences {
  const timestamp = new Date(Math.max(0, Math.floor(nowMs))).toISOString();
  return ExecutiveNudgePreferencesSchema.parse({
    schemaVersion: EXECUTIVE_NUDGE_SCHEMA_VERSION,
    userId,
    enabled: false,
    paused: false,
    typeEnabled: Object.fromEntries(EXECUTIVE_NUDGE_TYPE_VALUES.map((type) => [type, true])),
    quietHours: { startTime: "22:00", endTime: "08:00" },
    maximumPushNudgesPerDay: 3,
    timezone: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
