import { describe, expect, it, vi } from "vitest";
import {
  allocateHistoryGenDailyBudgets,
  buildHistoryGenTaskGoal,
  formatHistoryGenGoalValue,
  formatHistoryGenMinute,
  getHistoryGenWeekKey,
  parseHistoryGenTimeToMinute,
} from "./history-manager-generation";

describe("history-manager-generation", () => {
  it("parses and formats history generation times", () => {
    expect(parseHistoryGenTimeToMinute("09:30")).toBe(570);
    expect(parseHistoryGenTimeToMinute("24:00")).toBeNull();
    expect(formatHistoryGenMinute(570)).toBe("09:30");
    expect(formatHistoryGenMinute(24 * 60)).toBe("23:59");
  });

  it("allocates full window budget in 15 minute units", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(allocateHistoryGenDailyBudgets(3, 30)).toBeNull();
      expect(allocateHistoryGenDailyBudgets(2, 90)).toEqual([75, 15]);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("builds stable goal metadata and formatting", () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
    try {
      expect(buildHistoryGenTaskGoal(90)).toMatchObject({
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalUnit: "hour",
        timeGoalValue: 10.5,
        timeGoalMinutes: 630,
        dailyBudgetMinutes: 90,
      });
    } finally {
      randomSpy.mockRestore();
    }

    expect(formatHistoryGenGoalValue(10)).toBe("10");
    expect(formatHistoryGenGoalValue(10.5)).toBe("10.5");
  });

  it("normalizes week keys to Monday", () => {
    expect(getHistoryGenWeekKey(new Date("2026-04-19T12:00:00"))).toBe("2026-04-13");
    expect(getHistoryGenWeekKey(new Date("2026-04-20T12:00:00"))).toBe("2026-04-20");
  });
});
