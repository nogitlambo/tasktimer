import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { createTaskTimerSharedTask } from "./task-shared";

describe("createTaskTimerSharedTask checkpoint validation", () => {
  const sharedTasks = createTaskTimerSharedTask({ createId: () => "id" });

  it("detects duplicate checkpoint times after normalizing to seconds", () => {
    expect(
      sharedTasks.hasDuplicateCheckpointTime(
        [
          { hours: 0.5, description: "Halfway" },
          { hours: 0.5, description: "Also halfway" },
        ],
        3600
      )
    ).toBe(true);
  });

  it("allows distinct checkpoint times", () => {
    expect(
      sharedTasks.hasDuplicateCheckpointTime(
        [
          { hours: 0.25, description: "Quarter" },
          { hours: 0.5, description: "Half" },
        ],
        3600
      )
    ).toBe(false);
  });

  it("normalizes missing task creation timestamps from custom order", () => {
    const task = {
      id: "task-1",
      name: "Focus",
      order: 7,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestones: [],
      hasStarted: false,
    } as Task;

    sharedTasks.normalizeLoadedTask(task);

    expect(task.createdAtMs).toBe(7);
  });

  it("preserves legacy elapsed time when accumulated time is missing", () => {
    const task = {
      id: "task-1",
      name: "Focus",
      order: 1,
      accumulatedMs: 0,
      elapsed: 45_000,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestones: [],
      hasStarted: false,
    } as Task & { elapsed: number };

    sharedTasks.normalizeLoadedTask(task);

    expect(task.accumulatedMs).toBe(45_000);
    expect(task.hasStarted).toBe(true);
  });
});
