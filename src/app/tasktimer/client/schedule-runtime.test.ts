import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { createTaskTimerMutableStore } from "./mutable-store";
import {
  createTaskTimerScheduleRuntime,
  normalizeScheduleDay,
  parseScheduleTimeMinutes,
  snapScheduleMinutes,
  type TaskTimerScheduleState,
} from "./schedule-runtime";
import { buildTaskTimerScheduleGridHtml, renderTaskTimerSchedulePage } from "./schedule-render";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task 1",
    order: 1,
    color: "#79e2ff",
    running: false,
    hasStarted: false,
    startMs: 0,
    accumulatedMs: 0,
    timeGoalEnabled: true,
    timeGoalMinutes: 60,
    timeGoalPeriod: "day",
    plannedStartDay: "mon",
    plannedStartTime: "09:00",
    plannedStartOpenEnded: false,
    milestones: [],
    ...overrides,
  } as Task;
}

function makeScheduleState() {
  return createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
    dragPointerOffsetMinutes: 0,
  });
}

describe("schedule-runtime", () => {
  it("normalizes day values and parses schedule times", () => {
    expect(normalizeScheduleDay("Tue")).toBe("tue");
    expect(normalizeScheduleDay("bad")).toBeNull();
    expect(parseScheduleTimeMinutes("09:30")).toBe(570);
    expect(snapScheduleMinutes(37)).toBe(30);
  });

  it("moves a single-day task and persists the update", () => {
    const save = vi.fn();
    const render = vi.fn();
    const tasks = [makeTask({ id: "task-a", plannedStartDay: "mon" })];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save,
      render,
    });

    runtime.moveTaskOnSchedule("task-a", "tue", 615);

    expect(tasks[0]?.plannedStartDay).toBe("tue");
    expect(tasks[0]?.plannedStartTime).toBe("10:15");
    expect(save).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("preserves recurring-daily behavior and blocks overlapping placements", () => {
    const recurringSave = vi.fn();
    const recurringRender = vi.fn();
    const recurringTasks = [makeTask({ id: "task-a", plannedStartDay: null, plannedStartTime: "09:00" })];
    const recurringRuntime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => recurringTasks,
      save: recurringSave,
      render: recurringRender,
    });

    recurringRuntime.moveTaskOnSchedule("task-a", "wed", 540);
    expect(recurringTasks[0]?.plannedStartDay).toBeNull();
    expect(recurringSave).toHaveBeenCalledTimes(1);

    const overlapSave = vi.fn();
    const overlapTasks = [
      makeTask({ id: "task-a", plannedStartDay: "mon", plannedStartTime: "09:00" }),
      makeTask({ id: "task-b", plannedStartDay: "tue", plannedStartTime: "09:00" }),
    ];
    const overlapRuntime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => overlapTasks,
      save: overlapSave,
      render: vi.fn(),
    });

    overlapRuntime.moveTaskOnSchedule("task-a", "tue", 540);
    expect(overlapTasks[0]?.plannedStartDay).toBe("mon");
    expect(overlapSave).not.toHaveBeenCalled();
  });

  it("renders planner and tray html from the extracted render module", () => {
    const tasks = [
      makeTask({ id: "task-a", name: "Deep Work", plannedStartDay: null, plannedStartTime: "09:00" }),
      makeTask({ id: "task-b", name: "No Goal", timeGoalEnabled: false, timeGoalMinutes: 0, plannedStartTime: "" }),
    ];
    const state = makeScheduleState();
    const runtime = createTaskTimerScheduleRuntime({
      state,
      getTasks: () => tasks,
      save: vi.fn(),
      render: vi.fn(),
    });
    const gridHtml = buildTaskTimerScheduleGridHtml({
      els: {
        scheduleGrid: null,
        scheduleTrayList: null,
        scheduleMobileDayTabs: null,
      },
      state,
      scheduleRuntime: runtime,
      escapeHtmlUI: (value) => String(value ?? ""),
    });

    expect(gridHtml).toContain("Deep Work");
    expect(gridHtml).toContain("Daily");

    const scheduleGrid = { innerHTML: "" } as HTMLElement;
    const scheduleTrayList = { innerHTML: "" } as HTMLElement;
    renderTaskTimerSchedulePage({
      els: {
        scheduleGrid,
        scheduleTrayList,
        scheduleMobileDayTabs: null,
      },
      state,
      scheduleRuntime: runtime,
      escapeHtmlUI: (value) => String(value ?? ""),
    });

    expect(scheduleGrid.innerHTML).toContain("schedulePlanner");
    expect(scheduleTrayList.innerHTML).toContain("Needs a daily time goal");
  });
});
