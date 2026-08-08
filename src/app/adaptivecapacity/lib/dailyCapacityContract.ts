import { z } from "zod";

export const DAILY_CAPACITY_SCHEMA_VERSION = 1;
export const DAILY_CAPACITY_PLAN_VERSION = "adaptive-capacity-v1";
export const DAILY_CAPACITY_DEFAULT_MINUTES = { min: 30, max: 60 } as const;
export const DAILY_CAPACITY_TTL_MS = 15 * 60 * 1000;

export const dailyCapacityStateValues = [
  "REDUCED",
  "LIGHT",
  "STANDARD",
  "STRONG",
  "USER_DEFINED",
  "INSUFFICIENT_DATA",
] as const;

export const dailyCapacityConfidenceValues = ["LOW", "MEDIUM", "HIGH"] as const;
export const dailyCapacityPrimarySourceValues = ["USER_CUSTOM", "USER_STATE", "WEEKDAY_HISTORY", "ROLLING_HISTORY", "DEFAULT"] as const;
export const dailyCapacityReasonCodeValues = [
  "USER_OVERRIDE",
  "CUSTOM_MINUTES",
  "FOCUS_WINDOW_REMAINING",
  "SCHEDULE_AVAILABILITY",
  "WEEKDAY_HISTORY",
  "ROLLING_HISTORY",
  "TODAY_COMPLETED_WORK",
  "DEFAULT_BASELINE",
  "AVAILABLE_TIME_CAP",
  "INSUFFICIENT_HISTORY",
  "HIGH_VARIANCE",
] as const;

export const DailyCapacityStateSchema = z.enum(dailyCapacityStateValues);
export const DailyCapacityConfidenceSchema = z.enum(dailyCapacityConfidenceValues);
export const DailyCapacityPrimarySourceSchema = z.enum(dailyCapacityPrimarySourceValues);
export const DailyCapacityReasonCodeSchema = z.enum(dailyCapacityReasonCodeValues);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const minutesSchema = z.number().int().min(0).max(1440);

export const DailyCapacityRangeSchema = z.object({
  min: minutesSchema,
  max: minutesSchema,
}).refine((range) => range.min <= range.max, "Capacity range minimum cannot exceed maximum.");

export const DailyCapacityManualOverrideSchema = z.object({
  type: z.enum(["STATE", "MINUTES"]),
  state: DailyCapacityStateSchema.optional(),
  minutes: z.number().int().min(1).max(1440).optional(),
  createdAt: isoDateTimeSchema,
}).nullable();

export const DailyCapacitySnapshotSchema = z.object({
  schemaVersion: z.literal(DAILY_CAPACITY_SCHEMA_VERSION),
  id: z.string().min(1).max(180),
  userId: z.string().min(1).max(120),
  localDate: dateSchema,
  fullDayRange: DailyCapacityRangeSchema,
  remainingRange: DailyCapacityRangeSchema,
  completedMinutesToday: minutesSchema,
  availableMinutesCeiling: minutesSchema.nullable().optional(),
  state: DailyCapacityStateSchema,
  confidence: DailyCapacityConfidenceSchema,
  primarySource: DailyCapacityPrimarySourceSchema,
  sourceSignals: z.array(DailyCapacityReasonCodeSchema).max(20),
  manualOverride: DailyCapacityManualOverrideSchema,
  historicalSampleSize: z.number().int().min(0).max(100000),
  generatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
});

export type DailyCapacityState = z.infer<typeof DailyCapacityStateSchema>;
export type DailyCapacityConfidence = z.infer<typeof DailyCapacityConfidenceSchema>;
export type DailyCapacityPrimarySource = z.infer<typeof DailyCapacityPrimarySourceSchema>;
export type DailyCapacityReasonCode = z.infer<typeof DailyCapacityReasonCodeSchema>;
export type DailyCapacityRange = z.infer<typeof DailyCapacityRangeSchema>;
export type DailyCapacityManualOverride = z.infer<typeof DailyCapacityManualOverrideSchema>;
export type DailyCapacitySnapshot = z.infer<typeof DailyCapacitySnapshotSchema>;
