import { describe, expect, it } from "vitest";

import {
  findClosestAvailableScheduleSlot,
  findNextAvailableScheduleSlot,
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

  it("splits a 6 hour weekly recurring task into 2 hour scheduled days", () => {
    const weekly = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 360,
      plannedStartDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    });

    expect(getScheduleTaskDurationMinutesForDay(weekly, "mon")).toBe(120);
    expect(getScheduleTaskDurationMinutesForDay(weekly, "wed")).toBe(120);
    expect(getScheduleTaskDurationMinutesForDay(weekly, "fri")).toBe(120);
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

  it("allows a candidate task to end exactly when an existing task starts", () => {
    const busy = task({
      id: "busy",
      plannedStartDay: "mon",
      plannedStartTime: "07:15",
      plannedStartByDay: { mon: "07:15" },
      timeGoalMinutes: 15,
    });
    const candidate = task({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "07:00",
      plannedStartByDay: { mon: "07:00" },
      timeGoalMinutes: 15,
    });

    expect(findScheduleOverlap([busy], candidate)).toBeNull();
  });

  it("allows a candidate task to start exactly when an existing task ends", () => {
    const busy = task({
      id: "busy",
      plannedStartDay: "mon",
      plannedStartTime: "07:00",
      plannedStartByDay: { mon: "07:00" },
      timeGoalMinutes: 15,
    });
    const candidate = task({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "07:15",
      plannedStartByDay: { mon: "07:15" },
      timeGoalMinutes: 15,
    });

    expect(findScheduleOverlap([busy], candidate)).toBeNull();
  });

  it("treats a one minute boundary crossing as an overlap", () => {
    const busy = task({
      id: "busy",
      plannedStartDay: "mon",
      plannedStartTime: "07:15",
      plannedStartByDay: { mon: "07:15" },
      timeGoalMinutes: 15,
    });
    const candidate = task({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "07:00",
      plannedStartByDay: { mon: "07:00" },
      timeGoalMinutes: 16,
    });

    expect(findScheduleOverlap([busy], candidate)).toMatchObject({
      day: "mon",
      candidateStartMinutes: 420,
      candidateEndMinutes: 436,
      conflictingStartMinutes: 435,
      conflictingEndMinutes: 450,
      task: expect.objectContaining({ id: "busy" }),
    });
  });

  it("can suggest a next available slot at an exact task boundary", () => {
    const busy = task({
      id: "busy",
      plannedStartDay: "mon",
      plannedStartTime: "07:00",
      plannedStartByDay: { mon: "07:00" },
      timeGoalMinutes: 15,
    });
    const candidate = task({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "07:00",
      plannedStartByDay: { mon: "07:00" },
      timeGoalMinutes: 15,
    });

    expect(findNextAvailableScheduleSlot([busy], candidate)).toMatchObject({
      day: "mon",
      days: ["mon"],
      startMinutes: 435,
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

describe("findClosestAvailableScheduleSlot", () => {
  it("prefers the closest later slot when later and earlier slots are equally close", () => {
    const result = findClosestAvailableScheduleSlot(
      [
        task({ id: "candidate", plannedStartTime: "09:00" }),
        task({ id: "busy-before", plannedStartTime: "07:00" }),
        task({ id: "busy-after", plannedStartTime: "11:00" }),
      ],
      task({ id: "moving", plannedStartTime: "09:00" }),
      { day: "mon", targetStartMinutes: 540, excludeTaskIds: ["moving"] }
    );

    expect(result?.startMinutes).toBe(600);
  });

  it("selects the nearest earlier slot when it is closer than the later slot", () => {
    const result = findClosestAvailableScheduleSlot(
      [
        task({ id: "candidate", plannedStartTime: "09:00" }),
        task({ id: "busy-after", plannedStartTime: "10:00" }),
      ],
      task({ id: "moving", plannedStartTime: "09:00" }),
      { day: "mon", targetStartMinutes: 540, excludeTaskIds: ["moving"] }
    );

    expect(result?.startMinutes).toBe(480);
  });

  it("returns null when no same-day slot can fit the task", () => {
    const result = findClosestAvailableScheduleSlot(
      [task({ id: "all-day", plannedStartTime: "00:00", timeGoalMinutes: 1440 })],
      task({ id: "moving", plannedStartTime: "09:00" }),
      { day: "mon", targetStartMinutes: 540, excludeTaskIds: ["moving"] }
    );

    expect(result).toBeNull();
  });
});
