import { createHash } from "node:crypto";

import { z } from "zod";

import type { DailyCapacityPrimarySource, DailyCapacityRange, DailyCapacityReasonCode, DailyCapacityState } from "./dailyCapacityContract";

export type HistoricalDayInput = {
  date: string;
  sessionCount: number;
  completedMinutes: number;
  explicitAvailabilityMinutes?: number | null;
  excluded?: boolean;
  corrupted?: boolean;
};

export type HistoricalDayStats = {
  sampleSize: number;
  p25Minutes: number;
  medianMinutes: number;
  p75Minutes: number;
};

export const CapacityHistoryFeaturesSchema = z.object({
  rolling7DayMedianMinutes: z.number().int().min(0).optional(),
  rolling28DayMedianMinutes: z.number().int().min(0).optional(),
  rolling28DayP25Minutes: z.number().int().min(0).optional(),
  rolling28DayP75Minutes: z.number().int().min(0).optional(),
  weekdayStats: z.record(z.string(), z.object({
    sampleSize: z.number().int().min(0),
    p25Minutes: z.number().int().min(0),
    medianMinutes: z.number().int().min(0),
    p75Minutes: z.number().int().min(0),
  })),
  validDayCount: z.number().int().min(0),
  varianceBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
  calculatedAt: z.string().datetime({ offset: true }),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
});

export type CapacityHistoryFeatures = z.infer<typeof CapacityHistoryFeaturesSchema>;

export type HistoricalBaselineSelection = {
  range: DailyCapacityRange;
  primarySource: DailyCapacityPrimarySource;
  sampleSize: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  state: DailyCapacityState;
  sourceSignals: DailyCapacityReasonCode[];
};

function safeMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) ? Math.max(0, Math.min(1440, minutes)) : 0;
}

function dayNumber(date: string) {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? new Date(timestamp).getUTCDay().toString() : "";
}

export function classifyValidHistoricalDay(day: HistoricalDayInput) {
  return !day.excluded && !day.corrupted && (Math.max(0, Math.floor(Number(day.sessionCount) || 0)) > 0 || day.explicitAvailabilityMinutes != null);
}

export function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.max(0, Math.min(1, fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stats(values: number[]): HistoricalDayStats {
  const capped = values.map(safeMinutes);
  return {
    sampleSize: capped.length,
    p25Minutes: Math.round(percentile(capped, 0.25)),
    medianMinutes: Math.round(percentile(capped, 0.5)),
    p75Minutes: Math.round(percentile(capped, 0.75)),
  };
}

function varianceBand(statsValue: HistoricalDayStats) {
  const spreadRatio = (statsValue.p75Minutes - statsValue.p25Minutes) / Math.max(1, statsValue.medianMinutes);
  return spreadRatio <= 0.5 ? "LOW" as const : spreadRatio <= 1 ? "MEDIUM" as const : "HIGH" as const;
}

function stateForMedian(medianMinutes: number): DailyCapacityState {
  if (medianMinutes < 30) return "LIGHT";
  if (medianMinutes > 60) return "STRONG";
  return "STANDARD";
}

export function aggregateCapacityHistory(days: HistoricalDayInput[], options: { calculatedAtMs: number }): CapacityHistoryFeatures {
  const validDays = days
    .filter(classifyValidHistoricalDay)
    .map((day) => ({
      date: day.date,
      weekday: dayNumber(day.date),
      completedMinutes: day.explicitAvailabilityMinutes != null ? safeMinutes(day.explicitAvailabilityMinutes) : safeMinutes(day.completedMinutes),
    }))
    .filter((day) => day.weekday);
  const activeValues = validDays.map((day) => day.completedMinutes);
  const cap = percentile(activeValues, 0.95);
  const cappedDays = validDays.map((day) => ({ ...day, completedMinutes: Math.min(day.completedMinutes, Math.round(cap)) }));
  const allStats = stats(cappedDays.map((day) => day.completedMinutes));
  const sortedDays = [...cappedDays].sort((a, b) => b.date.localeCompare(a.date));
  const rolling7 = stats(sortedDays.slice(0, 7).map((day) => day.completedMinutes));
  const rolling28 = stats(sortedDays.slice(0, 28).map((day) => day.completedMinutes));
  const weekdayStats = Object.fromEntries(Array.from({ length: 7 }, (_, weekday) => {
    const values = cappedDays.filter((day) => day.weekday === String(weekday)).map((day) => day.completedMinutes);
    return [String(weekday), stats(values)];
  }));
  const sourceVersion = createHash("sha256").update(JSON.stringify(cappedDays.sort((a, b) => a.date.localeCompare(b.date)))).digest("hex");
  return CapacityHistoryFeaturesSchema.parse({
    rolling7DayMedianMinutes: rolling7.sampleSize ? rolling7.medianMinutes : undefined,
    rolling28DayMedianMinutes: rolling28.sampleSize ? rolling28.medianMinutes : undefined,
    rolling28DayP25Minutes: rolling28.sampleSize ? rolling28.p25Minutes : undefined,
    rolling28DayP75Minutes: rolling28.sampleSize ? rolling28.p75Minutes : undefined,
    weekdayStats,
    validDayCount: cappedDays.length,
    varianceBand: varianceBand(allStats),
    calculatedAt: new Date(options.calculatedAtMs).toISOString(),
    sourceVersion,
  });
}

export function selectHistoricalBaseline(features: CapacityHistoryFeatures, localDate: string): HistoricalBaselineSelection {
  const weekday = features.weekdayStats[dayNumber(localDate)];
  const sourceSignals: DailyCapacityReasonCode[] = [];
  if (weekday?.sampleSize >= 4) {
    sourceSignals.push("WEEKDAY_HISTORY");
    if (features.varianceBand === "HIGH") sourceSignals.push("HIGH_VARIANCE");
    return {
      range: { min: weekday.p25Minutes, max: weekday.p75Minutes },
      primarySource: "WEEKDAY_HISTORY",
      sampleSize: weekday.sampleSize,
      confidence: features.validDayCount >= 14 && features.varianceBand !== "HIGH" ? "HIGH" : "MEDIUM",
      state: stateForMedian(weekday.medianMinutes),
      sourceSignals,
    };
  }
  if (features.validDayCount >= 7 && features.rolling28DayP25Minutes != null && features.rolling28DayP75Minutes != null) {
    sourceSignals.push("ROLLING_HISTORY");
    if (features.varianceBand === "HIGH") sourceSignals.push("HIGH_VARIANCE");
    return {
      range: { min: features.rolling28DayP25Minutes, max: features.rolling28DayP75Minutes },
      primarySource: "ROLLING_HISTORY",
      sampleSize: features.validDayCount,
      confidence: features.validDayCount >= 14 && features.varianceBand !== "HIGH" ? "HIGH" : "MEDIUM",
      state: stateForMedian(features.rolling28DayMedianMinutes ?? 0),
      sourceSignals,
    };
  }
  return {
    range: { min: 30, max: 60 },
    primarySource: "DEFAULT",
    sampleSize: features.validDayCount,
    confidence: "LOW",
    state: "STANDARD",
    sourceSignals: ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"],
  };
}
