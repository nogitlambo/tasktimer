import { describe, expect, it } from "vitest";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import type { Task } from "../lib/types";
import { completeManualEntryDailyGoalIfReached } from "./manual-entry-time-goal";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    timeGoalEnabled: true,
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    ...overrides,
  };
}

describe("completeManualEntryDailyGoalIfReached", () => {
  const nowValue = new Date(2026, 4, 7, 12, 0, 0).getTime();
  const todayMorning = new Date(2026, 4, 7, 9, 0, 0).getTime();
  const yesterday = new Date(2026, 4, 6, 9, 0, 0).getTime();

  it("marks a daily-goal task complete when cumulative current-day history reaches the goal", () => {
    const entry = task();

    const result = completeManualEntryDailyGoalIfReached({
      task: entry,
      manualEntryTs: todayMorning,
      nowMs: nowValue,
      historyByTaskId: {
        "task-1": [
          { ts: todayMorning - 60_000, name: "Focus", ms: 30 * 60_000 },
          { ts: todayMorning, name: "Focus", ms: 30 * 60_000 },
        ],
      },
    });

    expect(result).toEqual({ completed: true, totalTodayMs: 60 * 60_000 });
    expect(entry.timeGoalCompletedReason).toBe("goal");
    expect(entry.timeGoalCompletedDayKey).toBe(getTimeGoalCompletionDayKey(nowValue));
    expect(entry.timeGoalCompletedElapsedMs).toBe(60 * 60_000);
  });

  it("does not lock when today's cumulative history remains below goal", () => {
    const entry = task();

    const result = completeManualEntryDailyGoalIfReached({
      task: entry,
      manualEntryTs: todayMorning,
      nowMs: nowValue,
      historyByTaskId: {
        "task-1": [{ ts: todayMorning, name: "Focus", ms: 45 * 60_000 }],
      },
    });

    expect(result).toEqual({ completed: false, totalTodayMs: 45 * 60_000 });
    expect(entry.timeGoalCompletedReason).toBeUndefined();
  });

  it("ignores backdated manual entries even when that past day reaches the goal", () => {
    const entry = task();

    const result = completeManualEntryDailyGoalIfReached({
      task: entry,
      manualEntryTs: yesterday,
      nowMs: nowValue,
      historyByTaskId: {
        "task-1": [{ ts: yesterday, name: "Focus", ms: 60 * 60_000 }],
      },
    });

    expect(result).toEqual({ completed: false, totalTodayMs: 0 });
    expect(entry.timeGoalCompletedReason).toBeUndefined();
  });

  it("ignores weekly time goals", () => {
    const entry = task({ timeGoalPeriod: "week" });

    completeManualEntryDailyGoalIfReached({
      task: entry,
      manualEntryTs: todayMorning,
      nowMs: nowValue,
      historyByTaskId: {
        "task-1": [{ ts: todayMorning, name: "Focus", ms: 60 * 60_000 }],
      },
    });

    expect(entry.timeGoalCompletedReason).toBeUndefined();
  });
});
