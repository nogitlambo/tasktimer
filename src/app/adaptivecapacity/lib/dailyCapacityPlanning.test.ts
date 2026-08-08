import { describe, expect, it } from "vitest";

import { calculateDailyCapacity } from "./dailyCapacityPlanning";

describe("calculateDailyCapacity", () => {
  it("returns the conservative product default for a new user", () => {
    const snapshot = calculateDailyCapacity({
      localDate: "2026-08-07",
      completedMinutesToday: 0,
      availableMinutesCeiling: null,
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
    });

    expect(snapshot.fullDayRange).toEqual({ min: 30, max: 60 });
    expect(snapshot.remainingRange).toEqual({ min: 30, max: 60 });
    expect(snapshot.state).toBe("STANDARD");
    expect(snapshot.confidence).toBe("LOW");
    expect(snapshot.primarySource).toBe("DEFAULT");
    expect(snapshot.sourceSignals).toEqual(["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"]);
  });

  it("applies a custom minute override while preserving the hard ceiling", () => {
    const snapshot = calculateDailyCapacity({
      localDate: "2026-08-07",
      completedMinutesToday: 10,
      availableMinutesCeiling: 40,
      manualOverride: { type: "MINUTES", minutes: 55, createdAt: "2026-08-07T09:00:00.000Z" },
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
    });

    expect(snapshot.fullDayRange).toEqual({ min: 40, max: 40 });
    expect(snapshot.remainingRange).toEqual({ min: 30, max: 30 });
    expect(snapshot.state).toBe("USER_DEFINED");
    expect(snapshot.primarySource).toBe("USER_CUSTOM");
    expect(snapshot.sourceSignals).toEqual(["USER_OVERRIDE", "CUSTOM_MINUTES", "TODAY_COMPLETED_WORK", "AVAILABLE_TIME_CAP"]);
  });

  it("maps a state override from the inferred baseline without raising confidence", () => {
    const snapshot = calculateDailyCapacity({
      localDate: "2026-08-07",
      completedMinutesToday: 0,
      baselineRange: { min: 40, max: 80 },
      confidence: "HIGH",
      manualOverride: { type: "STATE", state: "LIGHT", createdAt: "2026-08-07T09:00:00.000Z" },
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
    });

    expect(snapshot.fullDayRange).toEqual({ min: 30, max: 60 });
    expect(snapshot.state).toBe("LIGHT");
    expect(snapshot.primarySource).toBe("USER_STATE");
    expect(snapshot.confidence).toBe("HIGH");
    expect(snapshot.sourceSignals).toContain("USER_OVERRIDE");
  });
});
