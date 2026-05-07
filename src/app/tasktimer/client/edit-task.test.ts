import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { SCHEDULE_DAY_ORDER } from "../lib/schedule-placement";
import { normalizeRecurringScheduleFieldsForSave } from "./edit-task";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    plannedStartOpenEnded: false,
    ...overrides,
  };
}

describe("normalizeRecurringScheduleFieldsForSave", () => {
  it("expands a once-off task schedule to every day when saving as recurring", () => {
    const sourceTask = task({
      taskType: "once-off",
      onceOffDay: "wed",
      onceOffTargetDate: "2026-05-13",
      plannedStartDay: "wed",
      plannedStartTime: "09:30",
      plannedStartByDay: { wed: "09:30" },
    });
    const editDraft = task({
      ...sourceTask,
      taskType: "recurring",
      onceOffDay: null,
      onceOffTargetDate: null,
      plannedStartTime: "10:15",
    });

    normalizeRecurringScheduleFieldsForSave(editDraft, sourceTask);

    expect(editDraft.plannedStartByDay).toEqual(
      Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, "10:15"]))
    );
    expect(editDraft.plannedStartDay).toBeNull();
    expect(editDraft.plannedStartTime).toBe("10:15");
  });
});
