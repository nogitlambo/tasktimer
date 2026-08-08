import { createHash } from "node:crypto";

import { DAILY_CAPACITY_TTL_MS, type DailyCapacityManualOverride, type DailyCapacityReasonCode, type DailyCapacitySnapshot } from "./dailyCapacityContract";
import { selectHistoricalBaseline } from "./capacityHistory";
import { calculateDailyCapacity, withDailyCapacityOwner } from "./dailyCapacityPlanning";
import type { DailyCapacityRepository } from "./dailyCapacityRepository";

export type GetDailyCapacityInput = {
  uid: string;
  localDate: string;
  timezone: string;
  nowMs: number;
  availableMinutesCeiling?: number | null;
  manualOverride?: DailyCapacityManualOverride;
  forceRefresh?: boolean;
  repository: DailyCapacityRepository;
};

export async function getDailyCapacity(input: GetDailyCapacityInput): Promise<{ snapshot: DailyCapacitySnapshot; reused: boolean }> {
  const existing = await input.repository.loadSnapshot(input.uid, input.localDate);
  let source;
  try {
    source = await input.repository.loadSourceContext({ uid: input.uid, localDate: input.localDate, timezone: input.timezone, nowMs: input.nowMs });
  } catch (error) {
    if (!input.forceRefresh && existing && Date.parse(existing.expiresAt) > input.nowMs) return { snapshot: existing, reused: true };
    throw error;
  }
  const availableMinutesCeiling = input.availableMinutesCeiling == null
    ? source.availableMinutesCeiling == null ? null : Math.floor(source.availableMinutesCeiling)
    : Math.floor(input.availableMinutesCeiling);
  const effectiveOverride = input.manualOverride === undefined ? existing?.manualOverride ?? null : input.manualOverride;
  const sourceVersion = createHash("sha256")
    .update(JSON.stringify({ sourceVersion: source.sourceVersion, availableMinutesCeiling, manualOverride: effectiveOverride }))
    .digest("hex");
  if (!input.forceRefresh && existing && existing.sourceVersion === sourceVersion && Date.parse(existing.expiresAt) > input.nowMs) {
    return { snapshot: existing, reused: true };
  }
  const baseline = source.historyFeatures ? selectHistoricalBaseline(source.historyFeatures, input.localDate) : null;
  const sourceSignals: DailyCapacityReasonCode[] = [...(baseline?.sourceSignals ?? ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"] as DailyCapacityReasonCode[])];
  if (input.availableMinutesCeiling == null && source.availableMinutesCeiling != null) sourceSignals.push("FOCUS_WINDOW_REMAINING");
  const snapshot = withDailyCapacityOwner(calculateDailyCapacity({
    localDate: input.localDate,
    completedMinutesToday: source.completedMinutesToday,
    availableMinutesCeiling,
    nowMs: input.nowMs,
    baselineRange: baseline?.range,
    state: baseline?.state,
    confidence: baseline?.confidence,
    primarySource: baseline?.primarySource,
    sourceSignals,
    historicalSampleSize: baseline?.sampleSize,
    manualOverride: effectiveOverride,
    sourceVersion,
  }), input.uid);
  const withTtl = { ...snapshot, expiresAt: new Date(input.nowMs + DAILY_CAPACITY_TTL_MS).toISOString() };
  await input.repository.saveSnapshot(withTtl);
  return { snapshot: withTtl, reused: false };
}
