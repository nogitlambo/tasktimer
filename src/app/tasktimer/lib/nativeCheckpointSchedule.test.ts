import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { buildNativeCheckpointSchedule } from "./nativeCheckpointSchedule";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Deep work",
    running: true,
    startMs: 1_000_000,
    accumulatedMs: 5 * 60_000,
    milestonesEnabled: true,
    milestoneTimeUnit: "minute",
    checkpointSoundEnabled: true,
    milestones: [
      { id: "cp-10", hours: 10, description: "", alertsEnabled: true },
      { id: "cp-20", hours: 20, description: "", alertsEnabled: true },
    ],
    ...overrides,
  } as Task;
}

describe("buildNativeCheckpointSchedule", () => {
  it("maps future elapsed checkpoints to wall-clock exact alarm times", () => {
    expect(buildNativeCheckpointSchedule({ tasks: [task()], soundEnabled: true, soundMode: "repeat", nowMs: 1_000_000 }))
      .toEqual([
        expect.objectContaining({ checkpointKey: "600", triggerAtMs: 1_300_000, soundMode: "repeat" }),
        expect.objectContaining({ checkpointKey: "1200", triggerAtMs: 1_900_000, soundMode: "repeat" }),
      ]);
  });

  it("keeps recently due checkpoint alarms during the native delivery grace window", () => {
    expect(buildNativeCheckpointSchedule({ tasks: [task()], soundEnabled: true, soundMode: "once", nowMs: 1_300_500 }))
      .toEqual([
        expect.objectContaining({ checkpointKey: "600", triggerAtMs: 1_300_000 }),
        expect.objectContaining({ checkpointKey: "1200", triggerAtMs: 1_900_000 }),
      ]);
  });

  it("excludes disabled, elapsed, and goal-boundary checkpoints", () => {
    const value = task({
      accumulatedMs: 12 * 60_000,
      timeGoalEnabled: true,
      timeGoalMinutes: 20,
      milestones: [
        { id: "elapsed", hours: 10, description: "", alertsEnabled: true },
        { id: "disabled", hours: 15, description: "", alertsEnabled: false },
        { id: "goal", hours: 20, description: "", alertsEnabled: true },
      ],
    });
    expect(buildNativeCheckpointSchedule({ tasks: [value], soundEnabled: true, soundMode: "once", nowMs: 1_000_000 })).toEqual([]);
  });

  it("returns no alarms when global sound or task scheduling is inactive", () => {
    expect(buildNativeCheckpointSchedule({ tasks: [task()], soundEnabled: false, soundMode: "once" })).toEqual([]);
    expect(buildNativeCheckpointSchedule({ tasks: [task({ running: false })], soundEnabled: true, soundMode: "once" })).toEqual([]);
    expect(buildNativeCheckpointSchedule({ tasks: [task({ checkpointSoundEnabled: false })], soundEnabled: true, soundMode: "once" })).toEqual([]);
  });
});
