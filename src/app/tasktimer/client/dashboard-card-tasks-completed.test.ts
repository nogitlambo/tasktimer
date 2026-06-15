import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { buildDashboardTasksCompletedModel, type DashboardTasksCompletedOpportunity } from "./dashboard-card-tasks-completed";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    taskType: "recurring",
    timeGoalEnabled: true,
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    ...overrides,
  } as Task;
}

function opportunity(taskRow: Task, overrides: Partial<DashboardTasksCompletedOpportunity> = {}): DashboardTasksCompletedOpportunity {
  return {
    task: taskRow,
    goalMinutes: Math.max(0, Number(taskRow.timeGoalMinutes || 0)),
    historyScope: "day",
    ...overrides,
  };
}

describe("dashboard tasks completed card module", () => {
  it("derives completed count and live progress without rendering DOM", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const focus = task({ id: "task-1", name: "Focus" });
    const live = task({ id: "task-2", name: "Live", running: true });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(focus), opportunity(live)],
      historyByTaskId: {
        "task-1": [{ ts: nowMs - 1000, name: "Focus", ms: 60 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-05",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 30 * 60 * 1000,
      isTaskRunning: (row) => !!row.running,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalCompleted).toBe(1);
    expect(model.totalPossible).toBe(2);
    expect(model.items.map((item) => ({ name: item.name, progress: item.progress, complete: item.complete }))).toEqual([
      { name: "Focus", progress: 1, complete: true },
      { name: "Live", progress: 0.5, complete: false },
    ]);
    expect(model.ariaLabel).toContain("1 of 2");
  });

  it("shows under-goal reset tasks as partial instead of completed", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const resetFocus = task({
      id: "task-1",
      name: "Reset Focus",
      timeGoalCompletedDayKey: "2026-05-05",
      timeGoalCompletedAtMs: nowMs,
      timeGoalCompletedReason: "reset",
      timeGoalCompletedElapsedMs: 30 * 60 * 1000,
    });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(resetFocus)],
      historyByTaskId: {
        "task-1": [{ ts: nowMs - 1000, name: "Reset Focus", ms: 30 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-05",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalCompleted).toBe(0);
    expect(model.items[0]).toMatchObject({ name: "Reset Focus", progress: 0.5, complete: false });
  });

  it("shows reset tasks that reached their daily goal as completed", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const resetTask = task({
      id: "task-1",
      timeGoalCompletedDayKey: "2026-05-05",
      timeGoalCompletedAtMs: nowMs,
      timeGoalCompletedReason: "reset",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(resetTask)],
      historyByTaskId: {
        "task-1": [{ ts: nowMs - 1000, name: "Task", ms: 60 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-05",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalCompleted).toBe(1);
    expect(model.items[0]).toMatchObject({ progress: 1, complete: true });
  });

  it("keeps normal logged goal completion as completed", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const goalFocus = task({ id: "task-1", name: "Goal Focus" });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(goalFocus)],
      historyByTaskId: {
        "task-1": [{ ts: nowMs - 1000, name: "Goal Focus", ms: 60 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-05",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalCompleted).toBe(1);
    expect(model.items[0]).toMatchObject({ progress: 1, complete: true });
  });

  it("does not complete a goal task from metadata alone", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const goalFocus = task({
      id: "task-1",
      name: "Goal Focus",
      timeGoalCompletedDayKey: "2026-05-05",
      timeGoalCompletedAtMs: nowMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(goalFocus)],
      historyByTaskId: {},
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-05",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalCompleted).toBe(0);
    expect(model.items[0]).toMatchObject({ progress: 0, complete: false });
  });

  it("weights scheduled weekly tasks by today's split duration", () => {
    const nowMs = new Date("2026-05-04T12:00:00Z").getTime();
    const daily = task({
      id: "daily",
      name: "Daily",
      timeGoalPeriod: "day",
      timeGoalMinutes: 20,
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    });
    const weekly = task({
      id: "weekly",
      name: "Weekly",
      timeGoalPeriod: "week",
      timeGoalMinutes: 360,
      plannedStartByDay: { mon: "10:00", wed: "10:00", fri: "10:00" },
    });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(daily), opportunity(weekly, { goalMinutes: 120, historyScope: "week" })],
      historyByTaskId: {},
      nowMs,
      weekStartMs: nowMs - 86400000,
      todayKey: "2026-05-04",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.items.map((item) => ({ name: item.name, goalMinutes: item.goalMinutes }))).toEqual([
      { name: "Daily", goalMinutes: 20 },
      { name: "Weekly", goalMinutes: 120 },
    ]);
  });

  it("uses week-to-date progress for weekly task opportunities", () => {
    const nowMs = new Date("2026-05-04T12:00:00Z").getTime();
    const weekStartMs = new Date("2026-05-04T00:00:00Z").getTime();
    const weekly = task({
      id: "weekly",
      name: "Weekly",
      timeGoalPeriod: "week",
      timeGoalMinutes: 360,
      plannedStartByDay: { mon: "10:00", wed: "10:00", fri: "10:00" },
    });
    const model = buildDashboardTasksCompletedModel({
      opportunities: [opportunity(weekly, { goalMinutes: 120, historyScope: "week" })],
      historyByTaskId: {
        weekly: [{ ts: nowMs - 1000, name: "Weekly", ms: 180 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs,
      todayKey: "2026-05-04",
      fallbackColor: "#00ffff",
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.items[0]).toMatchObject({ name: "Weekly", goalMinutes: 120, progress: 1, complete: true });
    expect(model.ariaLabel).toContain("Today's task completion");
  });
});
