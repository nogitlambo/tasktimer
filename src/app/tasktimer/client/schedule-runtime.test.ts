import { describe, expect, it, vi } from "vitest";

import { createTaskTimerMutableStore } from "./mutable-store";
import { createTaskTimerScheduleRuntime, type TaskTimerScheduleState } from "./schedule-runtime";
import type { Task } from "../lib/types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id || "task",
    name: overrides.name || "Task",
    taskType: "recurring",
    onceOffDay: null,
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
    timeGoalValue: 100,
    timeGoalUnit: "minute",
    timeGoalPeriod: "week",
    timeGoalMinutes: 100,
    plannedStartDay: null,
    plannedStartTime: null,
    plannedStartByDay: { mon: "08:00", wed: "08:00", fri: "08:00" },
    plannedStartOpenEnded: false,
    ...overrides,
  };
}

function createRuntime(tasks: Task[], options?: { productivityDays?: readonly unknown[] }) {
  const state = createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null,
    dragSourceDay: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
    dragPointerOffsetMinutes: 0,
  });
  const save = vi.fn();
  const render = vi.fn();
  const runtime = createTaskTimerScheduleRuntime({
    state,
    getTasks: () => tasks,
    getOptimalProductivityDays: () => options?.productivityDays || ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
    save,
    render,
  });
  return { runtime, state, save, render };
}

describe("schedule runtime", () => {
  it("moves weekly tasks using each scheduled day's split duration for overlap checks", () => {
    const weekly = task({
      id: "weekly",
      plannedStartByDay: { mon: "08:00", wed: "08:00", fri: "08:00" },
    });
    const busy = task({
      id: "busy",
      name: "Busy",
      taskType: "once-off",
      onceOffDay: "wed",
      timeGoalValue: 15,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 15,
      plannedStartDay: "wed",
      plannedStartTime: "09:33",
      plannedStartByDay: { wed: "09:33" },
    });
    const { runtime, save } = createRuntime([weekly, busy]);

    runtime.moveTaskOnSchedule("weekly", "mon", 9 * 60);

    expect(save).toHaveBeenCalledTimes(1);
    expect(weekly.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00", fri: "09:00" });
  });

  it("normalizes mixed weekly task times using each target day's split duration for conflicts", () => {
    const weekly = task({
      id: "weekly",
      plannedStartByDay: { mon: "09:00", wed: "10:00", fri: "10:00" },
    });
    const busy = task({
      id: "busy",
      name: "Busy",
      taskType: "once-off",
      onceOffDay: "wed",
      timeGoalValue: 15,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 15,
      plannedStartDay: "wed",
      plannedStartTime: "09:33",
      plannedStartByDay: { wed: "09:33" },
    });
    const { runtime, save } = createRuntime([weekly, busy]);

    expect(runtime.normalizeTaskSchedule("weekly", "mon")).toEqual({ status: "updated", conflicts: [] });
    expect(save).toHaveBeenCalledTimes(1);
    expect(weekly.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00", fri: "09:00" });
  });

  it("places unscheduled daily recurring tasks only on optimal productivity days", () => {
    const daily = task({
      id: "daily",
      timeGoalValue: 30,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 30,
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: null,
      plannedStartOpenEnded: false,
    });
    const { runtime, save } = createRuntime([daily], { productivityDays: ["mon", "wed", "fri"] });

    runtime.moveTaskOnSchedule("daily", "mon", 9 * 60);

    expect(save).toHaveBeenCalledTimes(1);
    expect(daily.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00", fri: "09:00" });
    expect(daily.plannedStartByDay).not.toHaveProperty("tue");
    expect(daily.plannedStartByDay).not.toHaveProperty("thu");
    expect(daily.plannedStartByDay).not.toHaveProperty("sat");
    expect(daily.plannedStartByDay).not.toHaveProperty("sun");
  });

  it("excludes intentionally cleared tasks from the schedule tray", () => {
    const cleared = task({
      id: "cleared",
      timeGoalEnabled: false,
      timeGoalValue: 0,
      timeGoalMinutes: 0,
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: null,
      plannedStartOpenEnded: true,
    });
    const { runtime } = createRuntime([cleared]);

    expect(runtime.buildViewModel()).toEqual({ scheduled: [], unscheduled: [] });
  });

  it("keeps unscheduled daily time-goal tasks in the schedule tray", () => {
    const daily = task({
      id: "daily",
      timeGoalValue: 30,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 30,
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: null,
      plannedStartOpenEnded: false,
    });
    const { runtime } = createRuntime([daily]);

    expect(runtime.buildViewModel().unscheduled).toEqual([{ task: daily, canDrop: true }]);
  });
});
