import { describe, expect, it } from "vitest";

import { calculateDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityPlanning";
import { aggregateCapacityHistory, classifyValidHistoricalDay } from "@/app/adaptivecapacity/lib/capacityHistory";

import { buildDailyCapacityEvaluationFixtures, dailyCapacityHistoricalEdgeCases } from "./dailyCapacityEvaluationDataset";

describe("Adaptive Daily Capacity evaluation fixtures", () => {
  it("contains at least 100 deterministic scenarios across sources, ceilings, completion, and overrides", () => {
    const first = buildDailyCapacityEvaluationFixtures();
    const second = buildDailyCapacityEvaluationFixtures();
    expect(first.length).toBeGreaterThanOrEqual(100);
    expect(first).toEqual(second);
    expect(new Set(first.map((fixture) => fixture.expectedPrimarySource))).toEqual(new Set(["DEFAULT", "WEEKDAY_HISTORY", "ROLLING_HISTORY", "USER_STATE", "USER_CUSTOM"]));
  });

  it("keeps every public range safe and respects hard ceilings", () => {
    buildDailyCapacityEvaluationFixtures().forEach((fixture) => {
      const snapshot = calculateDailyCapacity(fixture.input);
      expect(snapshot.primarySource).toBe(fixture.expectedPrimarySource);
      expect(snapshot.fullDayRange.min).toBeLessThanOrEqual(snapshot.fullDayRange.max);
      expect(snapshot.remainingRange.min).toBeGreaterThanOrEqual(0);
      expect(snapshot.remainingRange.min).toBeLessThanOrEqual(snapshot.remainingRange.max);
      if (fixture.input.availableMinutesCeiling != null) expect(snapshot.fullDayRange.max).toBeLessThanOrEqual(fixture.input.availableMinutesCeiling);
    });
  });

  it("covers inactive, corrupt, zero-duration, and outlier history without inferring missing capacity as zero", () => {
    expect(dailyCapacityHistoricalEdgeCases).toHaveLength(5);
    expect(classifyValidHistoricalDay(dailyCapacityHistoricalEdgeCases[0].days[0])).toBe(false);
    expect(classifyValidHistoricalDay(dailyCapacityHistoricalEdgeCases[1].days[0])).toBe(true);
    expect(classifyValidHistoricalDay(dailyCapacityHistoricalEdgeCases[2].days[0])).toBe(false);
    expect(classifyValidHistoricalDay(dailyCapacityHistoricalEdgeCases[3].days[0])).toBe(false);
    const features = aggregateCapacityHistory([...dailyCapacityHistoricalEdgeCases[4].days], { calculatedAtMs: Date.parse("2026-08-07T00:00:00.000Z") });
    expect(features.validDayCount).toBe(2);
    expect(features.rolling28DayP75Minutes).toBeLessThan(1440);
  });
});
