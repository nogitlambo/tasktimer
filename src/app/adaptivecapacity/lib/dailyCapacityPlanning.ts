import { createHash } from "node:crypto";

import {
  DAILY_CAPACITY_DEFAULT_MINUTES,
  DAILY_CAPACITY_PLAN_VERSION,
  DailyCapacityReasonCodeSchema,
  type DailyCapacityConfidence,
  type DailyCapacityPrimarySource,
  type DailyCapacityRange,
  type DailyCapacityReasonCode,
  type DailyCapacitySnapshot,
  type DailyCapacityState,
} from "./dailyCapacityContract";

export type DailyCapacityPlanningInput = {
  localDate: string;
  completedMinutesToday: number;
  availableMinutesCeiling?: number | null;
  nowMs: number;
  baselineRange?: DailyCapacityRange;
  state?: DailyCapacityState;
  confidence?: DailyCapacityConfidence;
  primarySource?: DailyCapacityPrimarySource;
  sourceSignals?: DailyCapacityReasonCode[];
  historicalSampleSize?: number;
  manualOverride?: DailyCapacitySnapshot["manualOverride"];
  sourceVersion?: string;
};

export const DEFAULT_DAILY_CAPACITY_PLANNING_CONFIG = {
  version: DAILY_CAPACITY_PLAN_VERSION,
  defaultRange: DAILY_CAPACITY_DEFAULT_MINUTES,
  stateMultipliers: { REDUCED: 0.5, LIGHT: 0.75, STANDARD: 1, STRONG: 1.25 } as const,
};

function safeMinutes(value: unknown, fallback = 0) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) ? Math.max(0, Math.min(1440, minutes)) : fallback;
}

function safeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Capacity local date is invalid.");
  return value;
}

function stableSourceVersion(input: Omit<DailyCapacityPlanningInput, "nowMs" | "sourceVersion">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function withCeiling(range: DailyCapacityRange, ceiling: number | null): DailyCapacityRange {
  if (ceiling == null) return range;
  const cappedMax = Math.min(range.max, ceiling);
  return { min: Math.min(range.min, cappedMax), max: cappedMax };
}

function subtractCompleted(range: DailyCapacityRange, completedMinutes: number): DailyCapacityRange {
  return {
    min: Math.max(0, range.min - completedMinutes),
    max: Math.max(0, range.max - completedMinutes),
  };
}

export function calculateDailyCapacity(input: DailyCapacityPlanningInput): DailyCapacitySnapshot {
  const localDate = safeDate(input.localDate);
  const completedMinutesToday = safeMinutes(input.completedMinutesToday);
  const availableMinutesCeiling = input.availableMinutesCeiling == null ? null : safeMinutes(input.availableMinutesCeiling);
  const override = input.manualOverride ?? null;
  let baselineRange = input.baselineRange ?? DAILY_CAPACITY_DEFAULT_MINUTES;
  let state = input.state ?? "STANDARD";
  let primarySource = input.primarySource ?? "DEFAULT";
  const signals = new Set<DailyCapacityReasonCode>(input.sourceSignals ?? ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"]);
  if (override?.type === "MINUTES" && Number.isInteger(override.minutes)) {
    const minutes = safeMinutes(override.minutes);
    baselineRange = { min: minutes, max: minutes };
    state = "USER_DEFINED";
    primarySource = "USER_CUSTOM";
    signals.clear();
    signals.add("USER_OVERRIDE");
    signals.add("CUSTOM_MINUTES");
  } else if (override?.type === "STATE" && override.state && override.state in DEFAULT_DAILY_CAPACITY_PLANNING_CONFIG.stateMultipliers) {
    const multiplier = DEFAULT_DAILY_CAPACITY_PLANNING_CONFIG.stateMultipliers[override.state as keyof typeof DEFAULT_DAILY_CAPACITY_PLANNING_CONFIG.stateMultipliers];
    baselineRange = { min: Math.round(baselineRange.min * multiplier), max: Math.round(baselineRange.max * multiplier) };
    state = override.state;
    primarySource = "USER_STATE";
    signals.clear();
    signals.add("USER_OVERRIDE");
  }
  const fullDayRange = withCeiling(
    {
      min: Math.max(0, Math.min(1440, Math.floor(baselineRange.min))),
      max: Math.max(0, Math.min(1440, Math.floor(baselineRange.max))),
    },
    availableMinutesCeiling,
  );
  const remainingRange = subtractCompleted(fullDayRange, completedMinutesToday);
  if (completedMinutesToday > 0) signals.add("TODAY_COMPLETED_WORK");
  if (availableMinutesCeiling != null) signals.add("AVAILABLE_TIME_CAP");
  const sourceSignals = Array.from(signals).filter((signal): signal is DailyCapacityReasonCode => DailyCapacityReasonCodeSchema.safeParse(signal).success);
  const generatedAt = new Date(input.nowMs).toISOString();
  const sourceVersion = input.sourceVersion || stableSourceVersion({
    ...input,
    completedMinutesToday,
    availableMinutesCeiling,
    baselineRange: fullDayRange,
    sourceSignals,
  });
  return {
    schemaVersion: 1,
    id: `${localDate}-${sourceVersion.slice(0, 16)}`,
    userId: "",
    localDate,
    fullDayRange,
    remainingRange,
    completedMinutesToday,
    availableMinutesCeiling,
    state,
    confidence: input.confidence ?? "LOW",
    primarySource,
    sourceSignals,
    manualOverride: input.manualOverride ?? null,
    historicalSampleSize: Math.max(0, Math.floor(Number(input.historicalSampleSize) || 0)),
    generatedAt,
    expiresAt: new Date(input.nowMs + 15 * 60 * 1000).toISOString(),
    sourceVersion,
  };
}

export function withDailyCapacityOwner(snapshot: DailyCapacitySnapshot, userId: string): DailyCapacitySnapshot {
  return { ...snapshot, userId, id: `${userId}-${snapshot.id}` };
}
