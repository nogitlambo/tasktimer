import { describe, expect, it } from "vitest";

import { computeFocusInsights } from "./focusInsights";

describe("computeFocusInsights", () => {
  it("summarizes recent completion difficulty when ratings exist", () => {
    const now = new Date("2026-04-14T10:00:00.000Z").getTime();

    const insights = computeFocusInsights(
      [
        { ts: new Date("2026-04-13T09:00:00.000Z").getTime(), ms: 1800000, completionDifficulty: 1 },
        { ts: new Date("2026-04-14T09:00:00.000Z").getTime(), ms: 1800000, completionDifficulty: 2 },
      ],
      now
    );

    expect(insights.completionDifficultyLabel).toBe("Somewhat Difficult");
  });

  it("falls back to no difficulty label when entries are unrated", () => {
    const now = new Date("2026-04-14T10:00:00.000Z").getTime();

    const insights = computeFocusInsights([{ ts: now, ms: 1800000 }], now);

    expect(insights.completionDifficultyLabel).toBeNull();
  });

  it("summarizes time logged inside the configured productivity period", () => {
    const now = new Date(2026, 3, 14, 12, 0).getTime();

    const insights = computeFocusInsights(
      [
        { ts: new Date(2026, 3, 14, 9, 30).getTime(), ms: 1800000 },
        { ts: new Date(2026, 3, 14, 18, 30).getTime(), ms: 3600000 },
      ],
      now,
      { startTime: "09:00", endTime: "10:00" }
    );

    expect(insights.productivityPeriodMs).toBe(1800000);
  });

  it("supports overnight productivity periods", () => {
    const now = new Date(2026, 3, 14, 23, 0).getTime();

    const insights = computeFocusInsights(
      [
        { ts: new Date(2026, 3, 14, 22, 30).getTime(), ms: 1800000 },
        { ts: new Date(2026, 3, 15, 1, 30).getTime(), ms: 2400000 },
        { ts: new Date(2026, 3, 14, 12, 0).getTime(), ms: 3600000 },
      ],
      now,
      { startTime: "22:00", endTime: "02:00" }
    );

    expect(insights.productivityPeriodMs).toBe(4200000);
  });
});
