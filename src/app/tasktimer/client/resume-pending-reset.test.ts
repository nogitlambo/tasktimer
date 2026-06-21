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
});
