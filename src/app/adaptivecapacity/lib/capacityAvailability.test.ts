import { describe, expect, it } from "vitest";

import { calculateRemainingFocusWindowMinutes } from "./capacityAvailability";

describe("capacity availability", () => {
  it("returns the remaining minutes in a configured focus window", () => {
    expect(calculateRemainingFocusWindowMinutes({
      nowMs: Date.parse("2026-08-07T23:40:00.000Z"),
      timezone: "UTC",
      startTime: "23:00",
      endTime: "00:00",
      days: ["fri"],
    })).toBe(20);
  });

  it("returns zero outside configured focus days", () => {
    expect(calculateRemainingFocusWindowMinutes({
      nowMs: Date.parse("2026-08-07T10:00:00.000Z"),
      timezone: "UTC",
      startTime: "09:00",
      endTime: "17:00",
      days: ["thu"],
    })).toBe(0);
  });

  it("falls back safely for an invalid timezone", () => {
    expect(calculateRemainingFocusWindowMinutes({
      nowMs: Date.parse("2026-08-07T10:00:00.000Z"), timezone: "not-a-timezone", startTime: "09:00", endTime: "17:00", days: ["fri"],
    })).toBe(420);
  });
});
