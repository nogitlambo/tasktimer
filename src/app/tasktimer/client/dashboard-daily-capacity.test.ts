import { describe, expect, it } from "vitest";

import { parseDailyCapacityResponse } from "./dashboard-daily-capacity";

describe("Daily Capacity dashboard parser", () => {
  it("accepts only safe capacity facts from a snapshot", () => {
    const parsed = parseDailyCapacityResponse({
      ok: true,
      snapshot: {
        localDate: "2026-08-07",
        remainingRange: { min: 30, max: 60 },
        state: "STANDARD",
        confidence: "LOW",
        primarySource: "DEFAULT",
        sourceSignals: ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"],
        availableMinutesCeiling: null,
        completedMinutesToday: 0,
        ignored: "private detail",
      },
    });

    expect(parsed).toEqual({
      kind: "capacity",
      capacity: {
        localDate: "2026-08-07",
        remainingRange: { min: 30, max: 60 },
        state: "STANDARD",
        confidence: "LOW",
        primarySource: "DEFAULT",
        sourceSignals: ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"],
        availableMinutesCeiling: null,
        completedMinutesToday: 0,
        manualOverride: null,
      },
    });
  });

  it("rejects malformed capacity responses", () => {
    expect(parseDailyCapacityResponse({ ok: true, snapshot: { state: "INVALID" } })).toEqual({ kind: "invalid" });
  });

  it("accepts zero remaining availability", () => {
    expect(parseDailyCapacityResponse({
      ok: true,
      snapshot: {
        localDate: "2026-08-15",
        remainingRange: { min: 0, max: 0 },
        state: "USER_DEFINED",
        confidence: "MEDIUM",
        primarySource: "USER_CUSTOM",
        sourceSignals: ["USER_OVERRIDE", "AVAILABLE_TIME_CAP"],
        availableMinutesCeiling: 0,
        completedMinutesToday: 5,
        manualOverride: { type: "MINUTES", minutes: 60 },
      },
    })).toMatchObject({
      kind: "capacity",
      capacity: { availableMinutesCeiling: 0, remainingRange: { min: 0, max: 0 } },
    });
  });
});
