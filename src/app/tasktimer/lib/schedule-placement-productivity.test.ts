import { describe, expect, it } from "vitest";

import {
  findFirstAvailableScheduleSlotFromProductivityWindow,
  type ScheduleDay,
} from "./schedule-placement";
import type { Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  const day = overrides.plannedStartDay || overrides.onceOffDay || "mon";
  const time = overrides.plannedStartTime || "09:00";
  return {
    id: overrides.id || `task-${String(day)}-${String(time)}`,
    name: overrides.name || "Task",
    taskType: "once-off",
    onceOffDay: day as ScheduleDay,
    onceOffTargetDate: null,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    plannedStartDay: day as ScheduleDay,
    plannedStartTime: time,
    plannedStartByDay: { [day as ScheduleDay]: time },
    plannedStartOpenEnded: false,
    ...overrides,
  };
}

describe("findFirstAvailableScheduleSlotFromProductivityWindow", () => {
  it("picks the productivity window start when no tasks overlap", () => {
    const result = findFirstAvailableScheduleSlotFromProductivityWindow([], task({ plannedStartTime: "09:00" }), {
      optimalProductivityStartTime: "08:00",
      optimalProductivityEndTime: "12:00",
      allowOutsideProductivityWindow: true,
    });

    expect(result?.time).toBe("08:00");
    expect(result?.source).toBe("productivityWindow");
  });

  it("skips an occupied slot and picks the next available in-window slot", () => {
    const busy = task({ id: "busy", plannedStartTime: "09:00", timeGoalMinutes: 60 });
    const result = findFirstAvailableScheduleSlotFromProductivityWindow([busy], task({ id: "candidate" }), {
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "12:00",
      allowOutsideProductivityWindow: true,
    });

    expect(result?.time).toBe("10:00");
    expect(result?.source).toBe("productivityWindow");
  });

  it("falls back outside the productivity window when the window is full", () => {
    const busy = task({ id: "busy", plannedStartTime: "09:00", timeGoalMinutes: 60 });
    const result = findFirstAvailableScheduleSlotFromProductivityWindow([busy], task({ id: "candidate" }), {
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "09:59",
      allowOutsideProductivityWindow: true,
    });

    expect(result?.time).toBe("10:00");
    expect(result?.source).toBe("outsideProductivityWindow");
  });

  it("handles wraparound productivity windows", () => {
    const busy = task({ id: "busy", plannedStartTime: "22:00", timeGoalMinutes: 30 });
    const result = findFirstAvailableScheduleSlotFromProductivityWindow(
      [busy],
      task({ id: "candidate", plannedStartTime: "22:00", timeGoalMinutes: 30 }),
      {
        optimalProductivityStartTime: "22:00",
        optimalProductivityEndTime: "02:00",
        allowOutsideProductivityWindow: true,
      }
    );

    expect(result?.time).toBe("22:30");
    expect(result?.source).toBe("productivityWindow");
  });

  it("returns no slot when the task cannot fit anywhere", () => {
    const busy = task({ id: "busy", plannedStartTime: "00:00", timeGoalMinutes: 15 });
    const result = findFirstAvailableScheduleSlotFromProductivityWindow(
      [busy],
      task({ id: "candidate", plannedStartTime: "00:00", timeGoalMinutes: 1440 }),
      {
        optimalProductivityStartTime: "00:00",
        optimalProductivityEndTime: "23:59",
        allowOutsideProductivityWindow: true,
      }
    );

    expect(result).toBeNull();
  });
});
