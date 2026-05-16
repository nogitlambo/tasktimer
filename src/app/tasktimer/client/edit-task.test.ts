import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { SCHEDULE_DAY_ORDER } from "../lib/schedule-placement";
import {
  clearTaskScheduleConfig,
  normalizeRecurringScheduleFieldsForSave,
  restoreEditScheduleFieldsFromSnapshot,
  taskHasMeaningfulScheduleConfig,
} from "./edit-task";

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

  it("rewrites weekly recurring schedules from optimal productivity days on edit save", () => {
    const editDraft = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartTime: "09:00",
      plannedStartByDay: { tue: "09:00" },
    });

    normalizeRecurringScheduleFieldsForSave(editDraft, editDraft, ["mon", "wed", "fri"]);

    expect(editDraft.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00", fri: "09:00" });
    expect(editDraft.plannedStartDay).toBeNull();
  });

  it("does not rewrite existing weekly schedules without an edit-save productivity day context", () => {
    const editDraft = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartTime: "09:00",
      plannedStartByDay: { tue: "09:00" },
    });

    normalizeRecurringScheduleFieldsForSave(editDraft);

    expect(editDraft.plannedStartByDay).toEqual({ tue: "09:00" });
  });
});

describe("edit task schedule toggle helpers", () => {
  it("treats a true name-only task as unscheduled on edit open", () => {
    expect(
      taskHasMeaningfulScheduleConfig(
        task({
          timeGoalEnabled: false,
          timeGoalValue: 0,
          timeGoalMinutes: 0,
          taskType: "recurring",
          plannedStartTime: null,
          plannedStartByDay: null,
        })
      )
    ).toBe(false);
  });

  it("opens checked for time goals, planned starts, and checkpoints", () => {
    expect(taskHasMeaningfulScheduleConfig(task({ timeGoalEnabled: true, timeGoalMinutes: 30 }))).toBe(true);
    expect(taskHasMeaningfulScheduleConfig(task({ timeGoalEnabled: false, timeGoalMinutes: 0, plannedStartByDay: { mon: "09:00" } }))).toBe(true);
    expect(taskHasMeaningfulScheduleConfig(task({ timeGoalEnabled: false, timeGoalMinutes: 0, milestonesEnabled: true }))).toBe(true);
  });

  it("clears below-section fields when saving with scheduling unticked", () => {
    const draft = task({
      taskType: "once-off",
      onceOffDay: "wed",
      onceOffTargetDate: "2026-05-13",
      timeGoalEnabled: true,
      timeGoalValue: 2,
      timeGoalMinutes: 120,
      milestonesEnabled: true,
      milestones: [{ hours: 1, description: "" }],
      plannedStartDay: "wed",
      plannedStartTime: "09:30",
      plannedStartByDay: { wed: "09:30" },
      plannedStartPushRemindersEnabled: true,
    });

    clearTaskScheduleConfig(draft);

    expect(draft).toEqual(
      expect.objectContaining({
        taskType: "recurring",
        onceOffDay: null,
        onceOffTargetDate: null,
        timeGoalEnabled: false,
        timeGoalValue: 0,
        timeGoalMinutes: 0,
        milestonesEnabled: false,
        milestones: [],
        plannedStartDay: null,
        plannedStartTime: null,
        plannedStartByDay: null,
        plannedStartOpenEnded: false,
        plannedStartPushRemindersEnabled: false,
      })
    );
  });

  it("restores the original schedule draft when re-ticking before save", () => {
    const draft = task({ timeGoalEnabled: false, timeGoalValue: 0, timeGoalMinutes: 0, plannedStartByDay: null });
    const snapshot = task({
      taskType: "once-off",
      onceOffDay: "fri",
      onceOffTargetDate: "2026-05-15",
      timeGoalValue: 2,
      timeGoalMinutes: 120,
      milestonesEnabled: true,
      milestones: [{ id: "ms-1", hours: 1, description: "", alertsEnabled: true }],
      plannedStartDay: "fri",
      plannedStartTime: "13:45",
      plannedStartByDay: { fri: "13:45" },
    });

    restoreEditScheduleFieldsFromSnapshot(draft, snapshot);

    expect(draft).toEqual(
      expect.objectContaining({
        taskType: "once-off",
        onceOffDay: "fri",
        onceOffTargetDate: "2026-05-15",
        timeGoalEnabled: true,
        timeGoalValue: 2,
        timeGoalMinutes: 120,
        milestonesEnabled: true,
        plannedStartDay: "fri",
        plannedStartTime: "13:45",
        plannedStartByDay: { fri: "13:45" },
      })
    );
    expect(draft.milestones).toEqual([{ id: "ms-1", hours: 1, description: "", alertsEnabled: true }]);
    expect(draft.milestones).not.toBe(snapshot.milestones);
  });
});
