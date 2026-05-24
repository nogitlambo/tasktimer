import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import {
  getTimeGoalCompletionDayKey,
  hasTaskGoalHistoryEntryToday,
  isTaskTimeGoalStartLockedByHistoryToday,
  isTaskTimeGoalCompletedToday,
  isTaskTimeGoalStartLockedToday,
  markTaskTimeGoalCompleted,
  markTaskTimeGoalResetCompleted,
} from "./timeGoalCompletion";

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
    ...overrides,
  };
}

describe("time goal completion lock", () => {
  it("locks a task completed on the current local day", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();

    expect(isTaskTimeGoalCompletedToday(task({ timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue) }), nowValue)).toBe(true);
  });

  it("does not lock a task completed on a previous local day", () => {
    const today = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const yesterday = new Date(2026, 4, 6, 23, 59, 0).getTime();

    expect(isTaskTimeGoalCompletedToday(task({ timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(yesterday) }), today)).toBe(false);
  });

  it("does not lock a task without completion fields", () => {
    expect(isTaskTimeGoalCompletedToday(task(), new Date(2026, 4, 7, 10, 0, 0).getTime())).toBe(false);
  });

  it("does not start-lock a reset-completed task on the current local day", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();

    expect(
      isTaskTimeGoalStartLockedToday(
        task({ timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue), timeGoalCompletedReason: "reset" }),
        nowValue
      )
    ).toBe(false);
  });

  it("start-locks a goal-completed task on the current local day", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();

    expect(
      isTaskTimeGoalStartLockedToday(
        task({ timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue), timeGoalCompletedReason: "goal" }),
        nowValue
      )
    ).toBe(true);
  });

  it("does not history-lock a goal-completed task with no current-day history", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
      timeGoalCompletedReason: "goal",
    });

    expect(isTaskTimeGoalStartLockedByHistoryToday(entry, {}, nowValue)).toBe(false);
  });

  it("does not history-lock a goal-completed task when today's history is below the current goal", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
      timeGoalCompletedReason: "goal",
    });

    expect(
      isTaskTimeGoalStartLockedByHistoryToday(
        entry,
        { "task-1": [{ ts: nowValue, name: "Focus", ms: 30 * 60 * 1000 }] },
        nowValue
      )
    ).toBe(false);
  });

  it("history-locks a goal-completed task when today's history reaches the current goal", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
      timeGoalCompletedReason: "goal",
    });

    expect(
      isTaskTimeGoalStartLockedByHistoryToday(
        entry,
        { "task-1": [{ ts: nowValue, name: "Focus", ms: 60 * 60 * 1000 }] },
        nowValue
      )
    ).toBe(true);
  });

  it("does not history-lock a reset-completed task even when today's history reaches the current goal", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
      timeGoalCompletedReason: "reset",
    });

    expect(
      isTaskTimeGoalStartLockedByHistoryToday(
        entry,
        { "task-1": [{ ts: nowValue, name: "Focus", ms: 60 * 60 * 1000 }] },
        nowValue
      )
    ).toBe(false);
  });

  it("ignores qualifying history from a previous local day", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const yesterday = new Date(2026, 4, 6, 10, 0, 0).getTime();
    const entry = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
      timeGoalCompletedReason: "goal",
    });

    expect(hasTaskGoalHistoryEntryToday(entry, { "task-1": [{ ts: yesterday, name: "Focus", ms: 60 * 60 * 1000 }] }, nowValue)).toBe(false);
  });

  it("marks completion with the local day key and timestamp", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task();

    markTaskTimeGoalCompleted(entry, nowValue);

    expect(entry.timeGoalCompletedDayKey).toBe(getTimeGoalCompletionDayKey(nowValue));
    expect(entry.timeGoalCompletedAtMs).toBe(nowValue);
    expect(entry.timeGoalCompletedReason).toBe("goal");
    expect(entry.timeGoalCompletedElapsedMs).toBeNull();
  });

  it("marks goal completion with elapsed metadata", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task();

    markTaskTimeGoalCompleted(entry, nowValue, { reason: "goal", elapsedMs: 1234.8 });

    expect(entry.timeGoalCompletedReason).toBe("goal");
    expect(entry.timeGoalCompletedElapsedMs).toBe(1234);
  });

  it("marks reset completion with elapsed metadata", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = task();

    markTaskTimeGoalResetCompleted(entry, nowValue, 30 * 60 * 1000);

    expect(entry.timeGoalCompletedDayKey).toBe(getTimeGoalCompletionDayKey(nowValue));
    expect(entry.timeGoalCompletedReason).toBe("reset");
    expect(entry.timeGoalCompletedElapsedMs).toBe(30 * 60 * 1000);
  });
});
