import { describe, expect, it } from "vitest";

import {
  findScheduleOverlap,
  findFirstAvailableScheduleSlotFromProductivityWindow,
  formatScheduleTimeRange,
  getScheduleTaskDurationMinutesForDay,
  swapTaskScheduleSlotsForDay,
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
  it("formats schedule time ranges", () => {
    expect(formatScheduleTimeRange(540, 600)).toBe("9:00 AM - 10:00 AM");
    expect(formatScheduleTimeRange(1380, 1440)).toBe("11:00 PM - 12:00 AM");
  });

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

  it("splits weekly recurring task duration evenly across scheduled days", () => {
    const weekly = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    });

    expect(getScheduleTaskDurationMinutesForDay(weekly, "mon")).toBe(34);
    expect(getScheduleTaskDurationMinutesForDay(weekly, "wed")).toBe(33);
    expect(getScheduleTaskDurationMinutesForDay(weekly, "fri")).toBe(33);
  });

  it("checks conflicts using weekly per-day split durations", () => {
    const weekly = task({
      id: "weekly",
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    });
    const busy = task({
      id: "busy",
      plannedStartDay: "wed",
      plannedStartTime: "09:30",
      plannedStartByDay: { wed: "09:30" },
      timeGoalMinutes: 15,
    });

    expect(findScheduleOverlap([busy], weekly)?.day).toBe("wed");
  });

  it("returns overlap timing details for the first conflicting task", () => {
    const busy = task({
      id: "busy",
      name: "Busy Task",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      timeGoalMinutes: 60,
    });
    const overlap = findScheduleOverlap(
      [busy],
      task({
        id: "candidate",
        plannedStartDay: "mon",
        plannedStartTime: "09:30",
        plannedStartByDay: { mon: "09:30" },
        timeGoalMinutes: 60,
      })
    );

    expect(overlap).toMatchObject({
      day: "mon",
      candidateStartMinutes: 570,
      candidateEndMinutes: 630,
      conflictingStartMinutes: 540,
      conflictingEndMinutes: 600,
      task: expect.objectContaining({ id: "busy" }),
    });
  });

  it("swaps only the conflicting day slot between two tasks", () => {
    const first = task({
      id: "first",
      taskType: "recurring",
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: { mon: "09:30", wed: "09:30" },
    });
    const second = task({
      id: "second",
      taskType: "recurring",
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: { mon: "09:00", fri: "11:00" },
    });

    swapTaskScheduleSlotsForDay(first, second, "mon", 570, 540);

    expect(first.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:30" });
    expect(second.plannedStartByDay).toEqual({ mon: "09:30", fri: "11:00" });
  });
});
