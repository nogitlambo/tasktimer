import { describe, expect, it } from "vitest";
import { computeFocusInsights } from "./focusInsights";

describe("computeFocusInsights optimal productivity days", () => {
  it("filters weekday and productivity-period insights to selected days only", () => {
    const nowTs = new Date("2026-05-07T12:00:00").getTime();
    const mondayMorning = new Date("2026-05-04T09:00:00").getTime();
    const wednesdayMorning = new Date("2026-05-06T09:00:00").getTime();

    const result = computeFocusInsights(
      [
        { ts: mondayMorning, ms: 30 * 60 * 1000 },
        { ts: wednesdayMorning, ms: 45 * 60 * 1000 },
      ],
      nowTs,
      {
        startTime: "08:00",
        endTime: "12:00",
        days: ["mon"],
      }
    );

    expect(result.weekdayName).toBe("Monday");
    expect(result.weekdaySessionCount).toBe(1);
    expect(result.productivityPeriodMs).toBe(30 * 60 * 1000);
  });

  it("keeps overall best-session and delta signals available", () => {
    const nowTs = new Date("2026-05-07T12:00:00").getTime();
    const today = new Date("2026-05-07T09:00:00").getTime();
    const yesterday = new Date("2026-05-06T09:00:00").getTime();

    const result = computeFocusInsights(
      [
        { ts: today, ms: 60 * 60 * 1000 },
        { ts: yesterday, ms: 30 * 60 * 1000 },
      ],
      nowTs,
      {
        startTime: "08:00",
        endTime: "12:00",
        days: ["mon"],
      }
    );

    expect(result.bestMs).toBe(60 * 60 * 1000);
    expect(result.todayDeltaMs).toBe(30 * 60 * 1000);
  });
});
