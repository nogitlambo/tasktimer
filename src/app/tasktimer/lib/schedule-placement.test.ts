import { describe, expect, it } from "vitest";
import {
  canNormalizeTaskSchedule,
  getMovedScheduleDayValue,
  getSchedulePlacementDays,
  getTaskScheduledDayEntries,
  isRecurringDailyScheduleTask,
  isFlexibleUnscheduledTask,
  syncLegacyPlannedStartFields,
} from "./schedule-placement";
import type { Task } from "./types";

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
    ...overrides,
  };
}

describe("schedule placement helpers", () => {
  it("preserves daily recurring placement across all days", () => {
    const task = createTask({ plannedStartDay: null, plannedStartTime: "09:00" });
    expect(isRecurringDailyScheduleTask(task)).toBe(true);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(getMovedScheduleDayValue(task, "thu")).toBeNull();
  });

  it("treats dragged scheduled moves as single-day placements", () => {
    const task = createTask({ plannedStartDay: null, plannedStartTime: "09:00" });
    expect(getSchedulePlacementDays(task, "thu", "mon")).toEqual(["thu"]);
  });

  it("keeps single-day tasks on the dropped day", () => {
    const task = createTask({ plannedStartDay: "mon", plannedStartTime: "09:00" });
    expect(isRecurringDailyScheduleTask(task)).toBe(false);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["thu"]);
    expect(getMovedScheduleDayValue(task, "thu")).toBe("thu");
  });

  it("preserves legacy schedule fields when no per-day map exists yet", () => {
    const task = createTask({ plannedStartDay: "mon", plannedStartTime: "09:00" });

    syncLegacyPlannedStartFields(task);

    expect(task.plannedStartByDay).toEqual({ mon: "09:00" });
    expect(task.plannedStartDay).toBe("mon");
    expect(task.plannedStartTime).toBe("09:00");
  });

  it("normalizes mixed day maps back to safe legacy fields", () => {
    const task = createTask({
      plannedStartByDay: {
        mon: "09:00",
        wed: "11:00",
      },
    });

    expect(canNormalizeTaskSchedule(task)).toBe(true);
    syncLegacyPlannedStartFields(task);

    expect(task.plannedStartDay).toBeNull();
    expect(task.plannedStartTime).toBeNull();
  });

  it("treats flexible scheduled tasks as scheduled and draggable per day", () => {
    const task = createTask({
      plannedStartOpenEnded: true,
      plannedStartByDay: {
        mon: "09:00",
        tue: "11:00",
      },
    });

    expect(isFlexibleUnscheduledTask(task)).toBe(false);
    expect(getTaskScheduledDayEntries(task)).toEqual([
      { day: "mon", time: "09:00" },
      { day: "tue", time: "11:00" },
    ]);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["thu"]);
  });

  it("keeps brand-new flexible tasks unscheduled", () => {
    const task = createTask({
      plannedStartOpenEnded: true,
      plannedStartTime: null,
      plannedStartDay: null,
      plannedStartByDay: null,
    });

    expect(isFlexibleUnscheduledTask(task)).toBe(true);
    expect(getTaskScheduledDayEntries(task)).toEqual([]);
  });
});
