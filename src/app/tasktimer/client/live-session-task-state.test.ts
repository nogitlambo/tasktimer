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
});
