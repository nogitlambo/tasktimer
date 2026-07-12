import { describe, expect, it } from "vitest";
import type { HistoryByTaskId, Task } from "../lib/types";
import {
  getNextCheckpointFastForwardTargetMs,
  getPreviousCheckpointRewindTargetMs,
  markCheckpointFiredKeysThroughTarget,
  pruneCheckpointFiredKeysAfterTarget,
  updateLatestSameDayHistoryElapsed,
} from "./checkpoint-rewind";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: true,
    milestoneTimeUnit: "minute",
    milestones: [
      { hours: 15, description: "" },
      { hours: 30, description: "" },
      { hours: 45, description: "" },
    ],
    hasStarted: true,
    ...overrides,
  };
}

const sortMilestones = (milestones: Task["milestones"]) =>
  milestones.slice().sort((a, b) => Number(a.hours || 0) - Number(b.hours || 0));
const milestoneUnitSec = () => 60;

describe("checkpoint rewind helpers", () => {
  it("does not target a checkpoint when elapsed is below the first checkpoint", () => {
    expect(getPreviousCheckpointRewindTargetMs(task(), 10 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBeNull();
  });

  it("targets the last completed checkpoint between checkpoints", () => {
    expect(getPreviousCheckpointRewindTargetMs(task(), 40 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBe(30 * 60 * 1000);
  });

  it("targets the previous checkpoint when elapsed is exactly on a checkpoint", () => {
    expect(getPreviousCheckpointRewindTargetMs(task(), 30 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBe(15 * 60 * 1000);
  });

  it("walks backward until no previous checkpoint remains", () => {
    const entry = task();
    const first = getPreviousCheckpointRewindTargetMs(entry, 50 * 60 * 1000, sortMilestones, milestoneUnitSec);
    const second = getPreviousCheckpointRewindTargetMs(entry, first ?? 0, sortMilestones, milestoneUnitSec);
    const third = getPreviousCheckpointRewindTargetMs(entry, second ?? 0, sortMilestones, milestoneUnitSec);

    expect(first).toBe(45 * 60 * 1000);
    expect(second).toBe(30 * 60 * 1000);
    expect(third).toBe(15 * 60 * 1000);
    expect(getPreviousCheckpointRewindTargetMs(entry, third ?? 0, sortMilestones, milestoneUnitSec)).toBeNull();
  });

  it("targets the next configured checkpoint between checkpoints", () => {
    expect(getNextCheckpointFastForwardTargetMs(task(), 20 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBe(30 * 60 * 1000);
  });

  it("targets the next configured checkpoint from a checkpoint boundary", () => {
    expect(getNextCheckpointFastForwardTargetMs(task(), 30 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBe(45 * 60 * 1000);
  });

  it("does not target a checkpoint at or after the final checkpoint", () => {
    expect(getNextCheckpointFastForwardTargetMs(task(), 45 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBeNull();
    expect(getNextCheckpointFastForwardTargetMs(task(), 50 * 60 * 1000, sortMilestones, milestoneUnitSec)).toBeNull();
  });

  it("prunes fired checkpoint keys after the selected target", () => {
    const firedByTaskId = { "task-1": new Set(["900", "1800", "2700"]) };

    pruneCheckpointFiredKeysAfterTarget(task(), 30 * 60 * 1000, firedByTaskId, sortMilestones, milestoneUnitSec);

    expect(Array.from(firedByTaskId["task-1"] || [])).toEqual(["900", "1800"]);
  });

  it("marks fired checkpoint keys through the selected target", () => {
    const firedByTaskId = { "task-1": new Set(["900"]) };

    markCheckpointFiredKeysThroughTarget(task(), 30 * 60 * 1000, firedByTaskId, sortMilestones, milestoneUnitSec);

    expect(Array.from(firedByTaskId["task-1"] || [])).toEqual(["900", "1800"]);
  });

  it("updates only the latest same-day history row for the resume-pending day", () => {
    const history: HistoryByTaskId = {
      "task-1": [
        { ts: Date.parse("2026-05-02T09:00:00Z"), name: "Focus", ms: 10 },
        { ts: Date.parse("2026-05-03T09:00:00Z"), name: "Focus", ms: 20 },
        { ts: Date.parse("2026-05-03T10:00:00Z"), name: "Focus", ms: 30 },
      ],
    };

    const next = updateLatestSameDayHistoryElapsed(
      history,
      task({ resumePendingSinceDayKey: "2026-05-03" }),
      15 * 60 * 1000
    );

    expect(next?.["task-1"]?.map((entry) => entry.ms)).toEqual([10, 20, 15 * 60 * 1000]);
  });
});
