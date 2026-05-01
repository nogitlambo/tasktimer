import { describe, expect, it } from "vitest";
import { getEditTimeGoalSaveFields, normalizeRecurringScheduleFieldsForSave } from "./edit-task";
import type { Task } from "../lib/types";

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    taskType: "recurring",
    plannedStartDay: null,
    plannedStartTime: null,
    plannedStartByDay: null,
    plannedStartOpenEnded: false,
    ...overrides,
  };
}

describe("normalizeRecurringScheduleFieldsForSave", () => {
  it("repairs recurring-daily schedules so they are present on every day", () => {
    const sourceTask = createTask({
      plannedStartDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: {
        mon: "09:00",
        tue: "09:00",
        wed: "09:00",
      },
    });
    const draftTask = createTask({
      plannedStartDay: null,
      plannedStartTime: "10:30",
      plannedStartByDay: {
        mon: "09:00",
        wed: "09:00",
      },
    });

    normalizeRecurringScheduleFieldsForSave(draftTask, sourceTask);

    expect(draftTask.plannedStartByDay).toEqual({
      mon: "10:30",
      tue: "10:30",
      wed: "10:30",
      thu: "10:30",
      fri: "10:30",
      sat: "10:30",
      sun: "10:30",
    });
    expect(draftTask.plannedStartDay).toBeNull();
    expect(draftTask.plannedStartTime).toBe("10:30");
  });

  it("keeps non-daily recurring schedules limited to their scheduled days", () => {
    const sourceTask = createTask({
      plannedStartByDay: {
        mon: "09:00",
        tue: "09:00",
      },
    });
    const draftTask = createTask({
      plannedStartDay: null,
      plannedStartTime: "10:30",
      plannedStartByDay: {
        mon: "09:00",
        tue: "09:00",
      },
    });

    normalizeRecurringScheduleFieldsForSave(draftTask, sourceTask);

    expect(draftTask.plannedStartByDay).toEqual({
      mon: "10:30",
      tue: "10:30",
    });
    expect(draftTask.plannedStartDay).toBeNull();
    expect(draftTask.plannedStartTime).toBeNull();
  });
});

describe("getEditTimeGoalSaveFields", () => {
  it("normalizes once-off tasks to daily saved time goals", () => {
    expect(getEditTimeGoalSaveFields("once-off", 2, "hour", "week")).toEqual({
      timeGoalPeriod: "day",
      timeGoalMinutes: 120,
    });
    expect(getEditTimeGoalSaveFields("once-off", 45, "minute", "week")).toEqual({
      timeGoalPeriod: "day",
      timeGoalMinutes: 45,
    });
  });
});
