import { describe, expect, it } from "vitest";

import { buildSharedTaskImportConfig, normalizeSharedTaskImportConfig } from "./friendsStore";
import type { Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Deep Work",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 1,
    order: 1,
    accumulatedMs: 99,
    running: true,
    startMs: 123,
    collapsed: true,
    milestonesEnabled: true,
    milestoneTimeUnit: "hour",
    milestones: [{ id: "ms-1", createdSeq: 1, hours: 0.5, description: "Halfway", alertsEnabled: true }],
    hasStarted: true,
    color: "#8bd450",
    checkpointSoundEnabled: true,
    checkpointSoundMode: "repeat",
    checkpointToastEnabled: true,
    checkpointToastMode: "manual",
    timeGoalAction: "confirmModal",
    finalCheckpointAction: "confirmModal",
    presetIntervalsEnabled: true,
    presetIntervalValue: 15,
    presetIntervalLastMilestoneId: "ms-1",
    presetIntervalNextSeq: 2,
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "week",
    timeGoalMinutes: 60,
    timeGoalCompletedDayKey: "2026-06-30",
    timeGoalCompletedWeekKey: "2026-06-29",
    timeGoalCompletedAtMs: 123,
    timeGoalCompletedReason: "goal",
    timeGoalCompletedElapsedMs: 60_000,
    plannedStartTime: "09:00",
    plannedStartByDay: { mon: "09:00", wed: "09:00" },
    plannedStartOpenEnded: false,
    plannedStartPushRemindersEnabled: true,
    splitAcrossProductivityDays: true,
    ...overrides,
  };
}

describe("shared task import config", () => {
  it("builds a sanitized import config without runtime state", () => {
    const config = buildSharedTaskImportConfig(task());

    expect(config).toEqual(expect.objectContaining({
      name: "Deep Work",
      color: "#8bd450",
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 60,
      plannedStartByDay: { mon: "09:00", wed: "09:00" },
      milestones: [{ id: "ms-1", createdSeq: 1, hours: 0.5, description: "Halfway", alertsEnabled: true }],
    }));
    expect(config).not.toHaveProperty("accumulatedMs");
    expect(config).not.toHaveProperty("running");
    expect(config).not.toHaveProperty("timeGoalCompletedAtMs");
  });

  it("returns null for legacy or invalid records without a config object", () => {
    expect(normalizeSharedTaskImportConfig(null)).toBeNull();
    expect(normalizeSharedTaskImportConfig({ taskType: "recurring" })).toBeNull();
  });

  it("derives a shared planned start from plannedStartByDay when needed", () => {
    const config = normalizeSharedTaskImportConfig({
      ...buildSharedTaskImportConfig(task()),
      plannedStartTime: null,
      plannedStartByDay: { fri: "7:30" },
    });

    expect(config?.plannedStartTime).toBe("07:30");
    expect(config?.plannedStartByDay).toEqual({ fri: "07:30" });
  });
});
