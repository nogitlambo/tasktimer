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
});
