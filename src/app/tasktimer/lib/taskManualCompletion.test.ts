import { describe, expect, it } from "vitest";

import type { Task } from "./types";
import {
  clearTaskMarkedDone,
  getNextLocalMidnightMs,
  isCompletedOnceOffTask,
  isTaskMarkedDone,
  isTaskSnoozedForNextBestAction,
  markTaskDone,
  snoozeTaskForToday,
} from "./taskManualCompletion";

function task(overrides: Partial<Task> = {}): Task {
  return { id: "task-1", name: "Focus", order: 1, accumulatedMs: 0, running: false, startMs: null, collapsed: false, milestonesEnabled: false, milestones: [], hasStarted: false, ...overrides };
}

describe("manual task completion state", () => {
  it("locks recurring tasks only until the next local midnight", () => {
    const now = new Date(2026, 7, 21, 23, 30).getTime();
    const entry = task({ taskType: "recurring" });

    markTaskDone(entry, now);

    expect(entry.markedDoneUntilMs).toBe(getNextLocalMidnightMs(now));
    expect(isTaskMarkedDone(entry, now)).toBe(true);
    expect(isTaskMarkedDone(entry, entry.markedDoneUntilMs!)).toBe(false);
  });

  it("keeps once-off tasks completed until explicitly reset", () => {
    const entry = task({ taskType: "once-off" });

    markTaskDone(entry, 1000);

    expect(entry.markedDoneUntilMs).toBeNull();
    expect(isTaskMarkedDone(entry, Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isCompletedOnceOffTask(entry)).toBe(true);
    clearTaskMarkedDone(entry);
    expect(isTaskMarkedDone(entry, 1001)).toBe(false);
  });

  it("snoozes Next Best Action without marking the task done", () => {
    const now = new Date(2026, 7, 21, 10, 0).getTime();
    const entry = task();

    const until = snoozeTaskForToday(entry, now);

    expect(isTaskMarkedDone(entry, now)).toBe(false);
    expect(isTaskSnoozedForNextBestAction(entry, now)).toBe(true);
    expect(isTaskSnoozedForNextBestAction(entry, until)).toBe(false);
  });
});
