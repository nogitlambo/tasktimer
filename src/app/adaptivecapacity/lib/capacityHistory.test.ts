import { describe, expect, it } from "vitest";

import { aggregateCapacityHistory, classifyValidHistoricalDay, selectHistoricalBaseline } from "./capacityHistory";

describe("adaptive capacity history", () => {
  it("does not count an untracked day as zero capacity", () => {
    expect(classifyValidHistoricalDay({ date: "2026-08-01", sessionCount: 0, completedMinutes: 0 })).toBe(false);
    expect(classifyValidHistoricalDay({ date: "2026-08-02", sessionCount: 1, completedMinutes: 0 })).toBe(true);
  });

  it("produces percentile ranges and weekday sample sizes from valid days", () => {
    const features = aggregateCapacityHistory([
      { date: "2026-08-03", sessionCount: 1, completedMinutes: 20 },
      { date: "2026-08-10", sessionCount: 1, completedMinutes: 40 },
      { date: "2026-08-17", sessionCount: 1, completedMinutes: 60 },
      { date: "2026-08-24", sessionCount: 1, completedMinutes: 80 },
      { date: "2026-08-04", sessionCount: 1, completedMinutes: 30 },
      { date: "2026-08-05", sessionCount: 1, completedMinutes: 35 },
      { date: "2026-08-06", sessionCount: 1, completedMinutes: 45 },
    ], { calculatedAtMs: Date.parse("2026-08-25T00:00:00.000Z") });

    expect(features.validDayCount).toBe(7);
    expect(features.weekdayStats["1"]).toMatchObject({ sampleSize: 4, p25Minutes: 35, medianMinutes: 50, p75Minutes: 64 });
    expect(features.rolling28DayP25Minutes).toBe(33);
    expect(features.rolling28DayP75Minutes).toBe(53);
    expect(features.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires four matching weekdays and seven active days before using personal history", () => {
    const features = aggregateCapacityHistory([
      { date: "2026-08-03", sessionCount: 1, completedMinutes: 40 },
      { date: "2026-08-10", sessionCount: 1, completedMinutes: 50 },
      { date: "2026-08-17", sessionCount: 1, completedMinutes: 60 },
      { date: "2026-08-24", sessionCount: 1, completedMinutes: 70 },
      { date: "2026-08-04", sessionCount: 1, completedMinutes: 30 },
      { date: "2026-08-05", sessionCount: 1, completedMinutes: 30 },
      { date: "2026-08-06", sessionCount: 1, completedMinutes: 30 },
    ], { calculatedAtMs: Date.parse("2026-08-25T00:00:00.000Z") });

    expect(selectHistoricalBaseline(features, "2026-08-31")).toMatchObject({ primarySource: "WEEKDAY_HISTORY", range: { min: 48, max: 62 }, sampleSize: 4 });
    expect(selectHistoricalBaseline(features, "2026-08-25")).toMatchObject({ primarySource: "ROLLING_HISTORY", range: { min: 30, max: 55 }, sampleSize: 7 });
    expect(selectHistoricalBaseline({ ...features, validDayCount: 6 }, "2026-08-25").primarySource).toBe("DEFAULT");
  });
});
