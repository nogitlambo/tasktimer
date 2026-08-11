import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { reconcileResumePendingTasks } from "./resume-pending-reset";

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

describe("reconcileResumePendingTasks", () => {
  it("keeps stopped resumable tasks from a prior local day available to resume", () => {
    const entry = task({
      accumulatedMs: 30_000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-02",
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 4, 3, 8).getTime());

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 30_000,
      running: false,
      startMs: null,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-03",
    });
  });

  it("keeps same-day stopped resumable tasks available to resume", () => {
    const entry = task({
      accumulatedMs: 30_000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-03",
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 4, 3, 8).getTime());

    expect(result.changedTaskIds).toEqual([]);
    expect(entry).toMatchObject({
      accumulatedMs: 30_000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-03",
    });
  });

  it("leaves running tasks active across the day boundary", () => {
    const entry = task({
      accumulatedMs: 30_000,
      running: true,
      startMs: new Date(2026, 4, 2, 23).getTime(),
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-02",
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 4, 3, 8).getTime());

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 30_000,
      running: true,
      hasStarted: true,
      resumePendingSinceDayKey: null,
    });
  });

  it("grants existing unmarked resumable tasks a same-day migration marker", () => {
    const entry = task({
      accumulatedMs: 30_000,
      hasStarted: true,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 4, 3, 8).getTime());

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 30_000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-05-03",
    });
  });

  it("resets runtime fields for a prior-day recurring goal-completed task", () => {
    const entry = task({
      accumulatedMs: 60 * 60 * 1000,
      elapsed: 60 * 60 * 1000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-08-01",
      taskType: "recurring",
      timeGoalCompletedDayKey: "2026-08-01",
      timeGoalCompletedAtMs: new Date(2026, 7, 1, 9, 0, 0).getTime(),
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 7, 2, 8).getTime());

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 0,
      elapsed: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
      timeGoalCompletedDayKey: "2026-08-01",
      timeGoalCompletedReason: "goal",
    });
  });

  it("resets an unmarked prior-day recurring goal-completed task instead of making it resumable", () => {
    const entry = task({
      accumulatedMs: 60 * 60 * 1000,
      hasStarted: true,
      taskType: "recurring",
      timeGoalCompletedDayKey: "2026-08-01",
      timeGoalCompletedAtMs: new Date(2026, 7, 1, 9, 0, 0).getTime(),
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 7, 2, 8).getTime());

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 0,
      hasStarted: false,
      resumePendingSinceDayKey: null,
      timeGoalCompletedDayKey: "2026-08-01",
      timeGoalCompletedReason: "goal",
    });
  });

  it("keeps a same-day goal-completed recurring task completed", () => {
    const completedAtMs = new Date(2026, 7, 2, 7, 0, 0).getTime();
    const entry = task({
      accumulatedMs: 60 * 60 * 1000,
      hasStarted: true,
      taskType: "recurring",
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: "2026-08-02",
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 7, 2, 8).getTime());

    expect(result.changedTaskIds).toEqual([]);
    expect(entry).toMatchObject({
      accumulatedMs: 60 * 60 * 1000,
      hasStarted: true,
      timeGoalCompletedDayKey: "2026-08-02",
      timeGoalCompletedReason: "goal",
    });
  });

  it("keeps a weekly goal-completed recurring task locked within the same configured week", () => {
    const completedAtMs = new Date(2026, 7, 5, 9, 0, 0).getTime();
    const entry = task({
      accumulatedMs: 2 * 60 * 60 * 1000,
      hasStarted: true,
      taskType: "recurring",
      timeGoalEnabled: true,
      timeGoalPeriod: "week",
      timeGoalMinutes: 120,
      timeGoalCompletedDayKey: "2026-08-05",
      timeGoalCompletedWeekKey: "2026-08-03",
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 2 * 60 * 60 * 1000,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 7, 7, 8).getTime(), "mon");

    expect(result.changedTaskIds).toEqual([]);
    expect(entry).toMatchObject({
      accumulatedMs: 2 * 60 * 60 * 1000,
      hasStarted: true,
      timeGoalCompletedWeekKey: "2026-08-03",
      timeGoalCompletedReason: "goal",
    });
  });

  it("resets runtime fields for a prior-week recurring goal-completed task", () => {
    const completedAtMs = new Date(2026, 7, 5, 9, 0, 0).getTime();
    const entry = task({
      accumulatedMs: 2 * 60 * 60 * 1000,
      elapsed: 2 * 60 * 60 * 1000,
      hasStarted: true,
      resumePendingSinceDayKey: "2026-08-05",
      taskType: "recurring",
      timeGoalEnabled: true,
      timeGoalPeriod: "week",
      timeGoalMinutes: 120,
      timeGoalCompletedDayKey: "2026-08-05",
      timeGoalCompletedWeekKey: "2026-08-03",
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 2 * 60 * 60 * 1000,
    });

    const result = reconcileResumePendingTasks([entry], new Date(2026, 7, 10, 8).getTime(), "mon");

    expect(result.changedTaskIds).toEqual(["task-1"]);
    expect(entry).toMatchObject({
      accumulatedMs: 0,
      elapsed: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
      timeGoalCompletedWeekKey: "2026-08-03",
      timeGoalCompletedReason: "goal",
    });
  });
});
