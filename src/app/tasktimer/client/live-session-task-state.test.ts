import { describe, expect, it } from "vitest";
import type { LiveSessionsByTaskId, Task } from "../lib/types";
import { applyLiveSessionsToTasks } from "./live-session-task-state";

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

describe("applyLiveSessionsToTasks", () => {
  it("marks cloud-live-session tasks as running from the live session update point", () => {
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-1:1000",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: 1000,
        updatedAtMs: 4000,
        elapsedMs: 3000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([task()], liveSessionsByTaskId, () => 5000)[0]).toMatchObject({
      accumulatedMs: 3000,
      running: true,
      startMs: 4000,
      hasStarted: true,
    });
  });

  it("ignores live sessions whose row task id does not match the target task", () => {
    const source = task({ id: "task-1" });
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-2:1000",
        taskId: "task-2",
        name: "Other",
        startedAtMs: 1000,
        updatedAtMs: 4000,
        elapsedMs: 3000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([source], liveSessionsByTaskId, () => 5000)[0]).toBe(source);
  });

  it("does not restart a task that already completed its time goal today", () => {
    const source = task({
      timeGoalCompletedDayKey: "1970-01-01",
      timeGoalCompletedAtMs: 3000,
      timeGoalCompletedReason: "goal",
      running: false,
      startMs: null,
    });
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-1:1000",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: 1000,
        updatedAtMs: 4000,
        elapsedMs: 3000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([source], liveSessionsByTaskId, () => 5000)[0]).toBe(source);
  });

  it("marks a closed-app daily time-goal live session complete against the task start day", () => {
    const startedAtMs = new Date(2026, 4, 2, 22, 0, 0).getTime();
    const updatedAtMs = startedAtMs + 30 * 60_000;
    const nowValue = startedAtMs + 3 * 60 * 60_000;
    const result = applyLiveSessionsToTasks([task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
    })], {
      "task-1": {
        sessionId: "task-1:started",
        taskId: "task-1",
        name: "Focus",
        startedAtMs,
        updatedAtMs,
        elapsedMs: 30 * 60_000,
        status: "running",
      },
    }, () => nowValue)[0];

    expect(result).toMatchObject({
      accumulatedMs: 60 * 60_000,
      running: false,
      startMs: null,
      hasStarted: true,
      timeGoalCompletedDayKey: "2026-05-02",
      timeGoalCompletedAtMs: startedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60_000,
    });
  });

  it("keeps a closed-app daily time-goal live session running while it is below the goal", () => {
    const startedAtMs = 1000;
    const updatedAtMs = 4000;
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-1:1000",
        taskId: "task-1",
        name: "Focus",
        startedAtMs,
        updatedAtMs,
        elapsedMs: 3000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 1,
    })], liveSessionsByTaskId, () => 5000)[0]).toMatchObject({
      accumulatedMs: 3000,
      running: true,
      startMs: updatedAtMs,
      hasStarted: true,
    });
  });

  it("does not auto-complete weekly time goals from the closed-app live-session path", () => {
    const startedAtMs = 1000;
    const updatedAtMs = 4000;
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-1:1000",
        taskId: "task-1",
        name: "Focus",
        startedAtMs,
        updatedAtMs,
        elapsedMs: 60_000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([task({
      timeGoalEnabled: true,
      timeGoalPeriod: "week",
      timeGoalMinutes: 1,
    })], liveSessionsByTaskId, () => 120_000)[0]).toMatchObject({
      accumulatedMs: 60_000,
      running: true,
      startMs: updatedAtMs,
      hasStarted: true,
    });
  });

  it("does not auto-complete an already completed daily goal for the live-session start day again", () => {
    const startedAtMs = new Date(2026, 4, 2, 9, 0, 0).getTime();
    const source = task({
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: "2026-05-02",
      timeGoalCompletedAtMs: startedAtMs + 60_000,
      timeGoalCompletedReason: "goal",
      running: false,
      startMs: null,
    });
    const liveSessionsByTaskId: LiveSessionsByTaskId = {
      "task-1": {
        sessionId: "task-1:started",
        taskId: "task-1",
        name: "Focus",
        startedAtMs,
        updatedAtMs: startedAtMs + 60_000,
        elapsedMs: 60_000,
        status: "running",
      },
    };

    expect(applyLiveSessionsToTasks([source], liveSessionsByTaskId, () => startedAtMs + 2 * 60_000)[0]).toBe(source);
  });
});
