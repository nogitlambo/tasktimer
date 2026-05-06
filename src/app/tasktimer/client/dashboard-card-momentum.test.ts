import { describe, expect, it } from "vitest";
import type { MomentumSnapshot } from "../lib/momentum";
import { buildMomentumSummaryMessage, getPrimaryMomentumDriverKey } from "./dashboard-card-momentum";

function momentum(overrides: Partial<MomentumSnapshot>): MomentumSnapshot {
  return {
    score: 0,
    bandLabel: "Low",
    multiplier: 1,
    hasSignal: false,
    recentActivityScore: 0,
    consistencyScore: 0,
    weeklyProgressScore: 0,
    activeSessionBonus: 0,
    currentWeekLoggedMs: 0,
    currentWeekGoalMs: 0,
    runningTaskCount: 0,
    activeDayCount: 0,
    trailingStreak: 0,
    recentDaysMs: [0, 0, 0],
    ...overrides,
  };
}

describe("dashboard momentum card module", () => {
  it("selects the highest scoring driver and builds accessible summary copy", () => {
    const snapshot = momentum({
      score: 70,
      recentActivityScore: 5,
      consistencyScore: 10,
      weeklyProgressScore: 20,
      currentWeekLoggedMs: 60 * 60 * 1000,
      currentWeekGoalMs: 2 * 60 * 60 * 1000,
    });

    expect(getPrimaryMomentumDriverKey(snapshot)).toBe("weeklyProgress");
    expect(buildMomentumSummaryMessage(snapshot)).toContain("Weekly Progress contributed 20 of 20 momentum points");
  });
});
