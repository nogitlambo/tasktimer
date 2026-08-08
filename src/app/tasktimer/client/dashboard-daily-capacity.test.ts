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
});
