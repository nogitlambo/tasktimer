import { describe, expect, it } from "vitest";
import { historyEntryColorForTaskMs, sessionColorForTaskMs } from "./colors";
import type { Task } from "./types";

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
    hasStarted: true,
    ...overrides,
  };
}

describe("historyEntryColorForTaskMs", () => {
  it("uses time-goal elapsed progress for history entries", () => {
    const t = task({
      timeGoalEnabled: true,
      timeGoalMinutes: 60,
      milestonesEnabled: true,
      milestones: [{ hours: 4, description: "Checkpoint" }],
    });

    expect(historyEntryColorForTaskMs(t, 60 * 60 * 1000)).toBe("rgb(12,245,127)");
  });

  it("does not use checkpoint progress when a task has no time goal", () => {
    const t = task({
      milestonesEnabled: true,
      milestones: [{ hours: 1, description: "Checkpoint" }],
    });

    expect(sessionColorForTaskMs(t, 60 * 60 * 1000)).toBe("rgb(12,245,127)");
    expect(historyEntryColorForTaskMs(t, 60 * 60 * 1000)).toBe("rgb(255,59,48)");
  });
});
