import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { buildDashboardTasksCompletedModel } from "./dashboard-card-tasks-completed";

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

describe("dashboard tasks completed card module", () => {
  it("derives completed count and live progress without rendering DOM", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const model = buildDashboardTasksCompletedModel({
      dueTasks: [task({ id: "task-1", name: "Focus" }), task({ id: "task-2", name: "Live", running: true })],
      historyByTaskId: {
        "task-1": [{ ts: nowMs - 1000, name: "Focus", ms: 60 * 60 * 1000 }],
      },
      nowMs,
      weekStartMs: nowMs - 86400000,
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
    const model = buildDashboardTasksCompletedModel({
      dueTasks: [
        task({
          id: "task-1",
          name: "Reset Focus",
          timeGoalCompletedDayKey: "2026-05-05",
          timeGoalCompletedAtMs: nowMs,
          timeGoalCompletedReason: "reset",
          timeGoalCompletedElapsedMs: 30 * 60 * 1000,
        }),
      ],
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
    const model = buildDashboardTasksCompletedModel({
      dueTasks: [
        task({
          id: "task-1",
          timeGoalCompletedDayKey: "2026-05-05",
          timeGoalCompletedAtMs: nowMs,
          timeGoalCompletedReason: "reset",
          timeGoalCompletedElapsedMs: 60 * 60 * 1000,
        }),
      ],
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
    const model = buildDashboardTasksCompletedModel({
      dueTasks: [task({ id: "task-1", name: "Goal Focus" })],
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
});
