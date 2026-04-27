import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { createTaskTimerMutableStore } from "./mutable-store";
import type { TaskTimerMutableStore } from "./mutable-store";
import {
  createTaskTimerScheduleRuntime,
  normalizeScheduleDay,
  parseScheduleTimeMinutes,
  snapScheduleMinutes,
  SCHEDULE_MINUTE_PX,
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
    dragSourceDay: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
    dragPointerOffsetMinutes: 0,
  });
}

function createRenderContext(
  state: TaskTimerMutableStore<TaskTimerScheduleState>,
  runtime: ReturnType<typeof createTaskTimerScheduleRuntime>,
  overrides?: Partial<{
    getOptimalProductivityStartTime: () => string;
    getOptimalProductivityEndTime: () => string;
  }>
) {
  return {
    els: {
      scheduleGrid: null,
      scheduleTrayList: null,
      scheduleMobileDayTabs: null,
    },
    state,
    scheduleRuntime: runtime,
    escapeHtmlUI: (value: unknown) => String(value ?? ""),
    getOptimalProductivityStartTime: overrides?.getOptimalProductivityStartTime ?? (() => "09:00"),
    getOptimalProductivityEndTime: overrides?.getOptimalProductivityEndTime ?? (() => "17:00"),
  };
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

  it("moves only the dragged day for recurring-daily tasks and blocks overlapping placements", () => {
    const recurringSave = vi.fn();
    const recurringRender = vi.fn();
    const recurringTasks = [makeTask({ id: "task-a", plannedStartDay: null, plannedStartTime: "09:00" })];
    const recurringRuntime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => recurringTasks,
      save: recurringSave,
      render: recurringRender,
    });

    recurringRuntime.moveTaskOnSchedule("task-a", "wed", 540, "mon");
    expect(recurringTasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(recurringTasks[0]?.plannedStartByDay).toEqual({
      tue: "09:00",
      wed: "09:00",
      thu: "09:00",
      fri: "09:00",
      sat: "09:00",
      sun: "09:00",
    });
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

  it("moves flexible scheduled tasks per day and keeps them flexible", () => {
    const save = vi.fn();
    const render = vi.fn();
    const tasks = [
      makeTask({
        id: "task-a",
        plannedStartOpenEnded: true,
        plannedStartByDay: {
          mon: "09:00",
          tue: "09:00",
        },
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save,
      render,
    });

    runtime.moveTaskOnSchedule("task-a", "wed", 630, "mon");

    expect(tasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(tasks[0]?.plannedStartByDay).toEqual({
      tue: "09:00",
      wed: "10:30",
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("moves only the dragged scheduled day for shared non-flex tasks and marks them flexible", () => {
    const save = vi.fn();
    const render = vi.fn();
    const tasks = [makeTask({ id: "task-a", plannedStartDay: null, plannedStartTime: "09:00", plannedStartOpenEnded: false })];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save,
      render,
    });

    runtime.moveTaskOnSchedule("task-a", "wed", 600, "mon");

    expect(tasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(tasks[0]?.plannedStartByDay).toEqual({
      tue: "09:00",
      wed: "10:00",
      thu: "09:00",
      fri: "09:00",
      sat: "09:00",
      sun: "09:00",
    });
  });

  it("moves only the dragged scheduled day for non-flex per-day maps and marks them flexible", () => {
    const tasks = [
      makeTask({
        id: "task-a",
        plannedStartOpenEnded: false,
        plannedStartByDay: {
          mon: "09:00",
          wed: "09:00",
          fri: "09:00",
        },
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save: vi.fn(),
      render: vi.fn(),
    });

    runtime.moveTaskOnSchedule("task-a", "wed", 660, "mon");

    expect(tasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(tasks[0]?.plannedStartByDay).toEqual({
      wed: "11:00",
      fri: "09:00",
    });
  });

  it("toggles flexible mode with the R action", () => {
    const tasks = [
      makeTask({
        id: "task-a",
        name: "Deep Work",
        plannedStartByDay: {
          mon: "09:00",
          tue: "09:00",
          wed: "09:00",
          thu: "09:00",
          fri: "09:00",
          sat: "09:00",
          sun: "09:00",
        },
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const state = makeScheduleState();
    const save = vi.fn();
    const render = vi.fn();
    const runtime = createTaskTimerScheduleRuntime({
      state,
      getTasks: () => tasks,
      save,
      render,
    });

    const gridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(state, runtime));
    expect(gridHtml).not.toContain('data-schedule-normalize="task-a"');
    expect(gridHtml).not.toContain(">Recurring</button>");
    expect(gridHtml).toContain("Daily");

    const result = runtime.toggleTaskScheduleFlexible("task-a");
    expect(result.status).toBe("updated");
    expect(tasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);

    const toggledGridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(state, runtime));
    expect(toggledGridHtml).not.toContain(">Flexible</button>");
    expect(toggledGridHtml).toContain("Flex");
  });

  it("materializes legacy daily schedules when enabling flexible mode", () => {
    const tasks = [makeTask({ id: "task-a", name: "Deep Work", plannedStartDay: null, plannedStartTime: "09:00" })];
    const state = makeScheduleState();
    const save = vi.fn();
    const render = vi.fn();
    const runtime = createTaskTimerScheduleRuntime({
      state,
      getTasks: () => tasks,
      save,
      render,
    });

    const result = runtime.toggleTaskScheduleFlexible("task-a");

    expect(result).toEqual({ status: "updated", flexible: true });
    expect(tasks[0]?.plannedStartOpenEnded).toBe(true);
    expect(tasks[0]?.plannedStartByDay).toEqual({
      mon: "09:00",
      tue: "09:00",
      wed: "09:00",
      thu: "09:00",
      fri: "09:00",
      sat: "09:00",
      sun: "09:00",
    });
  });

  it("preserves multi-day schedule data when flexible mode is toggled", () => {
    const alignedTasks = [
      makeTask({
        id: "task-a",
        name: "Aligned",
        plannedStartByDay: {
          mon: "09:00",
          tue: "09:00",
        },
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const alignedState = makeScheduleState();
    const alignedRuntime = createTaskTimerScheduleRuntime({
      state: alignedState,
      getTasks: () => alignedTasks,
      save: vi.fn(),
      render: vi.fn(),
    });
    const alignedGridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(alignedState, alignedRuntime));
    expect(alignedGridHtml).not.toContain('data-schedule-normalize="task-a"');

    const result = alignedRuntime.toggleTaskScheduleFlexible("task-a");
    expect(result).toEqual({ status: "updated", flexible: true });
    expect(alignedTasks[0]?.plannedStartByDay).toEqual({
      mon: "09:00",
      tue: "09:00",
    });
  });

  it("renders Daily for shared schedules and Flex for flexible schedules", () => {
    const tasks = [
      makeTask({
        id: "task-a",
        name: "Focus",
        plannedStartByDay: {
          mon: "09:00",
          tue: "09:00",
          wed: "09:00",
          thu: "09:00",
          fri: "09:00",
          sat: "09:00",
          sun: "09:00",
        },
        plannedStartOpenEnded: false,
        plannedStartDay: null,
        plannedStartTime: null,
      }),
      makeTask({
        id: "task-b",
        name: "Review",
        plannedStartByDay: {
          mon: "11:00",
          tue: "11:00",
          wed: "11:00",
          thu: "11:00",
          fri: "11:00",
          sat: "11:00",
          sun: "11:00",
        },
        plannedStartOpenEnded: true,
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save: vi.fn(),
      render: vi.fn(),
    });
    const gridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(makeScheduleState(), runtime));
    expect(gridHtml).toContain("Daily");
    expect(gridHtml).toContain("Flex");
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
    const gridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(state, runtime));
    const daytimeTopPx = 9 * 60 * SCHEDULE_MINUTE_PX;
    const daytimeHeightPx = (17 * 60 - 9 * 60) * SCHEDULE_MINUTE_PX;

    expect(gridHtml).toContain("Deep Work");
    expect(gridHtml).toContain("Daily");
    expect(gridHtml).not.toContain("isMidday");
    expect(gridHtml).not.toContain('data-earliest-scheduled-task="true"');
    expect(gridHtml).not.toContain("isEarliestScheduledTask");
    expect(gridHtml).toContain(
      `class="scheduleProductivityHighlightBand" style="top:${daytimeTopPx}px;height:${daytimeHeightPx}px"`
    );

    const overnightGridHtml = buildTaskTimerScheduleGridHtml(
      createRenderContext(state, runtime, {
        getOptimalProductivityStartTime: () => "22:00",
        getOptimalProductivityEndTime: () => "02:00",
      })
    );
    expect(overnightGridHtml).toContain(
      `class="scheduleProductivityHighlightBand" style="top:0px;height:${2 * 60 * SCHEDULE_MINUTE_PX}px"`
    );
    expect(overnightGridHtml).toContain(
      `class="scheduleProductivityHighlightBand" style="top:${22 * 60 * SCHEDULE_MINUTE_PX}px;height:${2 * 60 * SCHEDULE_MINUTE_PX}px"`
    );

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
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
    });

    expect(scheduleGrid.innerHTML).toContain("schedulePlanner");
    expect(scheduleGrid.innerHTML).toContain("scheduleProductivityHighlight");
    expect(scheduleTrayList.innerHTML).toContain("Needs a daily time goal");
  });

  it("does not mark the earliest scheduled entry on the planner", () => {
    const tasks = [
      makeTask({ id: "task-a", name: "Monday First", plannedStartDay: "mon", plannedStartTime: "08:00" }),
      makeTask({ id: "task-b", name: "Monday Later", plannedStartDay: "mon", plannedStartTime: "09:00" }),
      makeTask({ id: "task-c", name: "Tuesday Early", plannedStartDay: "tue", plannedStartTime: "07:00" }),
    ];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save: vi.fn(),
      render: vi.fn(),
    });

    const gridHtml = buildTaskTimerScheduleGridHtml(createRenderContext(makeScheduleState(), runtime));

    expect(gridHtml).toContain('data-schedule-task-id="task-a"');
    expect(gridHtml).toContain('data-schedule-task-id="task-b"');
    expect(gridHtml).toContain('data-schedule-task-id="task-c"');
    expect(gridHtml).not.toContain('data-earliest-scheduled-task="true"');
    expect(gridHtml).not.toContain("isEarliestScheduledTask");
  });

  it("keeps scheduled flexible tasks on the planner and unscheduled flexible tasks in the tray", () => {
    const tasks = [
      makeTask({
        id: "task-a",
        name: "Flexible Scheduled",
        plannedStartOpenEnded: true,
        plannedStartByDay: {
          mon: "09:00",
        },
        plannedStartDay: null,
        plannedStartTime: null,
      }),
      makeTask({
        id: "task-b",
        name: "Flexible Unscheduled",
        plannedStartOpenEnded: true,
        plannedStartByDay: null,
        plannedStartDay: null,
        plannedStartTime: null,
      }),
    ];
    const runtime = createTaskTimerScheduleRuntime({
      state: makeScheduleState(),
      getTasks: () => tasks,
      save: vi.fn(),
      render: vi.fn(),
    });

    const viewModel = runtime.buildViewModel();
    expect(viewModel.scheduled.map((entry) => entry.task.name)).toContain("Flexible Scheduled");
    expect(viewModel.unscheduled.map((entry) => entry.task.name)).toContain("Flexible Unscheduled");
  });
});
