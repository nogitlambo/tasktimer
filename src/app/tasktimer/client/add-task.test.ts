import { describe, expect, it, vi } from "vitest";
import { createTaskTimerAddTask } from "./add-task";

type HandlerMap = Map<string, (event?: Event) => void>;

function buttonStub() {
  return {
    disabled: false,
    classList: { toggle: vi.fn() },
    setAttribute: vi.fn(),
  } as unknown as HTMLButtonElement;
}

function createHarness(
  initialValue: string,
  overrides?: {
    tasks?: Array<Record<string, unknown>>;
    plannedStartTime?: string;
    taskType?: "recurring" | "once-off";
    productivityStartTime?: string;
    productivityEndTime?: string;
    productivityDays?: string[];
  }
) {
  const handlers = new Map<object, HandlerMap>();
  const documentStub = {};
  vi.stubGlobal("document", documentStub);
  let addTaskMilestones: Array<{ hours: number; description: string }> = [];
  let addTaskType: "recurring" | "once-off" = overrides?.taskType || "recurring";
  let addTaskDurationUnit: "minute" | "hour" = "hour";
  let addTaskDurationPeriod: "day" | "week" = "day";
  let addTaskOnceOffDay = "mon";
  let addTaskPlannedStartTime = overrides?.plannedStartTime || "09:00";
  const addTaskName = {
    value: "New Task",
    classList: { remove: vi.fn(), toggle: vi.fn() },
    focus: vi.fn(),
  } as unknown as HTMLInputElement;
  const addTaskDurationValueInput = {
    value: initialValue,
    classList: { remove: vi.fn(), toggle: vi.fn() },
  } as unknown as HTMLInputElement;
  const addTaskMsToggle = {
    checked: true,
    disabled: false,
    setAttribute: vi.fn(),
  } as unknown as HTMLInputElement;
  const addTaskScheduleToggle = {
    checked: false,
  } as unknown as HTMLInputElement;
  const addTaskScheduleFields = {
    classList: { toggle: vi.fn() },
  } as unknown as HTMLElement;
  const addTaskTypeRecurringBtn = buttonStub();
  const addTaskTypeOnceOffBtn = buttonStub();
  const addTaskDurationUnitMinute = buttonStub();
  const addTaskDurationUnitHour = buttonStub();
  const addTaskDurationPeriodDay = buttonStub();
  const addTaskDurationPeriodWeek = buttonStub();
  const addTaskOnceOffDaySelect = {
    value: addTaskOnceOffDay,
  } as HTMLSelectElement;
  const addTaskPlannedStartTimeInput = {
    value: addTaskPlannedStartTime,
    disabled: false,
    classList: { toggle: vi.fn() },
  } as unknown as HTMLInputElement;
  const addTaskPlannedStartInput = {
    value: addTaskPlannedStartTime,
  } as HTMLInputElement;

  const on = vi.fn((target: object | null | undefined, type: string, handler: (event?: Event) => void) => {
    if (!target) return;
    const map = handlers.get(target) || new Map<string, (event?: Event) => void>();
    map.set(type, handler);
    handlers.set(target, map);
  });

  const ctx = {
    els: {
      addTaskDurationValueInput,
      addTaskError: null,
      addTaskName,
      addTaskMsArea: null,
      addTaskMsList: null,
      addTaskCancelBtn: null,
      addTaskForm: {} as HTMLFormElement,
      addTaskTypeRecurringBtn,
      addTaskTypeOnceOffBtn,
      addTaskScheduleToggle,
      addTaskScheduleFields,
      addTaskOnceOffDaySelect,
      addTaskNameMenu: null,
      addTaskNameCustomList: null,
      addTaskNamePresetList: null,
      addTaskNameCustomTitle: null,
      addTaskNameDivider: null,
      addTaskNamePresetTitle: null,
      addTaskDurationUnitMinute,
      addTaskDurationUnitHour,
      addTaskDurationPeriodDay,
      addTaskDurationPeriodWeek,
      addTaskPlannedStartHourSelect: null,
      addTaskPlannedStartMinuteSelect: null,
      addTaskPlannedStartMeridiemSelect: null,
      addTaskPlannedStartTimeInput,
      addTaskColorTrigger: null,
      addTaskColorPopover: null,
      addTaskColorPalette: null,
      addTaskMsToggle,
      addTaskCheckpointSoundModeSelect: null,
      addTaskCheckpointToastModeSelect: null,
      addTaskAddMsBtn: null,
      addTaskOverlay: null,
      addTaskOnceOffDayField: null,
      addTaskDurationReadout: null,
      addTaskDurationRow: null,
      addTaskDurationPerLabel: null,
      addTaskDurationPeriodPills: null,
      addTaskPlannedStartPushReminders: null,
      addTaskPlannedStartInput,
      addTaskAdvancedMenu: null,
    },
    sharedTasks: {
      isCheckpointAtOrAboveTimeGoal: vi.fn(() => false),
      deriveCheckpointAlertEnabledState: vi.fn(() => ({ soundEnabled: false, toastEnabled: false })),
      hasNonPositiveCheckpoint: vi.fn(() => false),
      hasDuplicateCheckpointTime: vi.fn(() => false),
      hasCheckpointAtOrAboveTimeGoal: vi.fn(() => false),
      makeTask: vi.fn((name: string, order: number) => ({
        id: `task-${order}`,
        name,
        order,
        accumulatedMs: 0,
        running: false,
        startMs: null,
        collapsed: false,
        milestonesEnabled: false,
        milestoneTimeUnit: "hour",
        milestones: [],
        hasStarted: false,
        timeGoalEnabled: false,
        timeGoalValue: 0,
        timeGoalUnit: "hour",
        timeGoalPeriod: "day",
        timeGoalMinutes: 0,
      })),
    },
    on,
    getAddTaskType: () => addTaskType,
    setAddTaskTypeState: vi.fn((value: "recurring" | "once-off") => {
      addTaskType = value;
    }),
    getAddTaskDurationValue: () => Number(addTaskDurationValueInput.value || 0),
    setAddTaskDurationValueState: vi.fn(),
    getAddTaskDurationUnit: () => addTaskDurationUnit,
    setAddTaskDurationUnitState: vi.fn((value: "minute" | "hour") => {
      addTaskDurationUnit = value;
    }),
    getAddTaskDurationPeriod: () => addTaskDurationPeriod,
    setAddTaskDurationPeriodState: vi.fn((value: "day" | "week") => {
      addTaskDurationPeriod = value;
    }),
    getAddTaskNoTimeGoal: () => false,
    setAddTaskNoTimeGoalState: vi.fn(),
    getAddTaskMilestonesEnabled: () => addTaskMsToggle.checked,
    setAddTaskMilestonesEnabledState: vi.fn(),
    getAddTaskMilestoneTimeUnit: () => "hour",
    setAddTaskMilestoneTimeUnitState: vi.fn(),
    getAddTaskMilestones: () => addTaskMilestones,
    setAddTaskMilestonesState: vi.fn((value: Array<{ hours: number; description: string }>) => {
      addTaskMilestones = value;
    }),
    setAddTaskCheckpointSoundEnabledState: vi.fn(),
    setAddTaskCheckpointSoundModeState: vi.fn(),
    setAddTaskCheckpointToastEnabledState: vi.fn(),
    setAddTaskCheckpointToastModeState: vi.fn(),
    getAddTaskCustomNames: () => [],
    setAddTaskCustomNamesState: vi.fn(),
    saveCloudTaskUi: vi.fn(),
    loadCachedTaskUi: vi.fn(() => null),
    escapeHtmlUI: (value: string) => value,
    getAddTaskOnceOffDay: () => addTaskOnceOffDay,
    setAddTaskOnceOffDayState: vi.fn((value: string) => {
      addTaskOnceOffDay = value;
    }),
    getAddTaskPlannedStartTime: () => addTaskPlannedStartTime,
    setAddTaskPlannedStartTimeState: vi.fn((value: string) => {
      addTaskPlannedStartTime = value;
    }),
    getTasks: () => [],
    confirm: vi.fn(),
    closeConfirm: vi.fn(),
    setTasks: vi.fn(),
    sortMilestones: (value: unknown[]) => value,
    save: vi.fn(),
    render: vi.fn(),
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    setSuppressAddTaskNameFocusOpenState: vi.fn(),
    getSuppressAddTaskNameFocusOpen: () => false,
    getCurrentAppPage: () => "tasks",
    getOptimalProductivityStartTime: () => overrides?.productivityStartTime || "09:00",
    getOptimalProductivityEndTime: () => overrides?.productivityEndTime || "17:00",
    getOptimalProductivityDays: () => overrides?.productivityDays || ["mon", "wed", "fri"],
    jumpToTaskAndHighlight: vi.fn(),
  } as unknown as Parameters<typeof createTaskTimerAddTask>[0];

  if (overrides?.tasks) {
    ctx.getTasks = () => overrides.tasks as never;
  }

  const api = createTaskTimerAddTask(ctx);
  api.registerAddTaskEvents();

  const submitHandler = () =>
    on.mock.calls.find(([target, type]) => target === ctx.els.addTaskForm && type === "submit")?.[2] as
      | ((event?: Event) => void)
      | undefined;

  return {
    addTaskDurationValueInput,
    addTaskMsToggle,
    addTaskPlannedStartTimeInput,
    ctx,
    submit: () => submitHandler()?.({ preventDefault: vi.fn() } as unknown as Event),
    toggleSchedule: (checked = true) => {
      addTaskScheduleToggle.checked = checked;
      handlers.get(addTaskScheduleToggle)?.get("change")?.();
    },
    setManualPlannedStart: (value: string) => {
      addTaskPlannedStartTimeInput.value = value;
      handlers.get(addTaskPlannedStartTimeInput)?.get("input")?.();
    },
    setMilestones: (value: Array<{ hours: number; description: string }>) => {
      addTaskMilestones = value;
    },
    clickMinuteUnit: () => handlers.get(addTaskDurationUnitMinute)?.get("click")?.(),
    clickWeeklyPeriod: () => handlers.get(addTaskDurationPeriodWeek)?.get("click")?.(),
    focus: () => handlers.get(addTaskDurationValueInput)?.get("focus")?.(),
    inputDuration: () => handlers.get(addTaskDurationValueInput)?.get("input")?.(),
    toggleCheckpoints: () => handlers.get(addTaskMsToggle)?.get("change")?.(),
  };
}

describe("createTaskTimerAddTask", () => {
  it("clears the add-task time goal input on focus when the value is the default zero", () => {
    const harness = createHarness("0");

    harness.focus();

    expect(harness.addTaskDurationValueInput.value).toBe("");
  });

  it("does not clear the add-task time goal input on focus when the value is non-zero", () => {
    const harness = createHarness("5");

    harness.focus();

    expect(harness.addTaskDurationValueInput.value).toBe("5");
  });

  it("disables the Time Checkpoints toggle when no time goal is entered", () => {
    const harness = createHarness("0");

    harness.inputDuration();

    expect(harness.addTaskMsToggle.disabled).toBe(true);
    expect(harness.addTaskMsToggle.checked).toBe(false);
    expect(harness.addTaskMsToggle.setAttribute).toHaveBeenCalledWith("aria-disabled", "true");
  });

  it("adds a default checkpoint when Time Checkpoints is enabled", () => {
    const harness = createHarness("60");
    harness.addTaskMsToggle.checked = true;

    harness.toggleCheckpoints();

    expect(harness.ctx.setAddTaskMilestonesEnabledState).toHaveBeenCalledWith(true);
    expect(harness.ctx.setAddTaskMilestonesState).toHaveBeenCalledWith([{ hours: 0, description: "" }]);
  });

  it("blocks adding a scheduled task with duplicate checkpoint times", () => {
    const harness = createHarness("1");
    harness.addTaskMsToggle.checked = true;
    harness.setMilestones([
      { hours: 0.25, description: "Quarter" },
      { hours: 0.25, description: "Duplicate quarter" },
    ]);
    vi.mocked(harness.ctx.sharedTasks.hasDuplicateCheckpointTime).mockReturnValue(true);

    harness.toggleSchedule(true);
    harness.submit();

    expect(harness.ctx.sharedTasks.hasDuplicateCheckpointTime).toHaveBeenCalled();
    expect(harness.ctx.setTasks).not.toHaveBeenCalled();
  });

  it("re-renders the task list immediately after a task is created", () => {
    const harness = createHarness("1");
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);
    const renderMock = vi.mocked(harness.ctx.render);
    const saveMock = vi.mocked(harness.ctx.save);

    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "task-1",
        name: "New Task",
      }),
    ]);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.invocationCallOrder[0]).toBeGreaterThan(setTasksMock.mock.invocationCallOrder[0]);
    expect(saveMock.mock.invocationCallOrder[0]).toBeGreaterThan(renderMock.mock.invocationCallOrder[0]);
    expect(harness.ctx.jumpToTaskAndHighlight).toHaveBeenCalledWith("task-1");
  });

  it("creates a name-only task when Schedule this task is unchecked", () => {
    const harness = createHarness("1");
    const setTasksMock = vi.mocked(harness.ctx.setTasks);

    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "New Task",
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
        milestonesEnabled: false,
        milestones: [],
        plannedStartPushRemindersEnabled: false,
      }),
    ]);
  });

  it("preserves scheduled-task creation when Schedule this task is checked", () => {
    const harness = createHarness("1");
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);

    harness.toggleSchedule(true);
    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "New Task",
        taskType: "recurring",
        timeGoalEnabled: true,
        timeGoalValue: 1,
        timeGoalUnit: "hour",
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
      }),
    ]);
  });

  it("auto-fills Planned Start Time from the optimal productivity start when free", () => {
    const harness = createHarness("1", { productivityStartTime: "08:00", productivityEndTime: "12:00" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);

    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenLastCalledWith("08:00");
    expect(harness.addTaskPlannedStartTimeInput.value).toBe("08:00");
  });

  it("auto-fills Planned Start Time to the next in-range slot when the productivity start is occupied", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const harness = createHarness("1", { tasks: [existingTask], productivityStartTime: "09:00", productivityEndTime: "12:00" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);

    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenLastCalledWith("10:00");
    expect(harness.addTaskPlannedStartTimeInput.value).toBe("10:00");
  });

  it("auto-fills Planned Start Time to the next slot after a full productivity range", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const harness = createHarness("1", { tasks: [existingTask], productivityStartTime: "09:00", productivityEndTime: "09:59" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);

    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenLastCalledWith("10:00");
    expect(harness.addTaskPlannedStartTimeInput.value).toBe("10:00");
  });

  it("does not auto-update Planned Start Time after the user manually edits it", () => {
    const harness = createHarness("1", { productivityStartTime: "08:00", productivityEndTime: "12:00" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.setManualPlannedStart("11:00");
    harness.addTaskDurationValueInput.value = "2";
    harness.inputDuration();

    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenLastCalledWith("11:00");
    expect(harness.addTaskPlannedStartTimeInput.value).toBe("11:00");
  });

  it("auto-fills weekly recurring tasks only when the same time fits all optimal productivity days", () => {
    const busyMonday = {
      id: "busy-mon",
      name: "Monday Busy",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const busyWednesday = {
      ...busyMonday,
      id: "busy-wed",
      name: "Wednesday Busy",
      onceOffDay: "wed",
      plannedStartDay: "wed",
      plannedStartTime: "10:00",
      plannedStartByDay: { wed: "10:00" },
    };
    const harness = createHarness("20", {
      tasks: [busyMonday, busyWednesday],
      productivityStartTime: "09:00",
      productivityEndTime: "13:00",
      productivityDays: ["mon", "wed"],
    });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.clickMinuteUnit();
    harness.clickWeeklyPeriod();

    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenLastCalledWith("11:00");
    expect(harness.addTaskPlannedStartTimeInput.value).toBe("11:00");
  });

  it("schedules weekly recurring tasks across optimal productivity days", () => {
    const harness = createHarness("2");
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);
    harness.ctx.getAddTaskDurationPeriod = () => "week";

    harness.toggleSchedule(true);
    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        timeGoalPeriod: "week",
        timeGoalMinutes: 840,
        plannedStartTime: "09:00",
        plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
      }),
    ]);
  });

  it("schedules daily recurring tasks only across optimal productivity days", () => {
    const harness = createHarness("1");
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);

    harness.toggleSchedule(true);
    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        timeGoalPeriod: "day",
        plannedStartTime: "09:00",
        plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
      }),
    ]);
    const savedTask = setTasksMock.mock.calls[0]?.[0]?.[0] as { plannedStartByDay?: Record<string, string> } | undefined;
    expect(savedTask?.plannedStartByDay).not.toHaveProperty("tue");
    expect(savedTask?.plannedStartByDay).not.toHaveProperty("thu");
    expect(savedTask?.plannedStartByDay).not.toHaveProperty("sat");
    expect(savedTask?.plannedStartByDay).not.toHaveProperty("sun");
  });

  it("schedules recurring tasks using a custom optimal productivity day set", () => {
    const harness = createHarness("1", { productivityDays: ["tue", "thu"] });
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);

    harness.toggleSchedule(true);
    harness.submit();

    expect(setTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        plannedStartTime: "09:00",
        plannedStartByDay: { tue: "09:00", thu: "09:00" },
      }),
    ]);
  });

  it("rejects a scheduled task when the time amount is zero", () => {
    const harness = createHarness("0");
    harness.addTaskMsToggle.checked = false;
    const setTasksMock = vi.mocked(harness.ctx.setTasks);

    harness.toggleSchedule(true);
    harness.submit();

    expect(setTasksMock).not.toHaveBeenCalled();
    expect(harness.addTaskDurationValueInput.classList.toggle).toHaveBeenCalledWith("isInvalid", true);
  });

  it("opens a conflict modal with schedule ranges for scheduled add-task overlaps", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const harness = createHarness("1", { tasks: [existingTask] });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.setManualPlannedStart("09:00");
    harness.submit();

    expect(harness.ctx.confirm).toHaveBeenCalledWith(
      "Schedule conflict",
      "",
      expect.objectContaining({
        altLabel: "Continue",
        okLabel: "Change",
        textHtml:
          "Deep Work - 9:00 AM - 10:00 AM.\n\nDo you want to <strong>change</strong> New Task to the next available timeslot or <strong>continue</strong> with 9:00 AM and move Deep Work to the closest available timeslot?",
        altButtonClassName: "btn btn-ghost",
        okButtonClassName: "btn btn-ghost",
      })
    );
    const confirmOpts = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(confirmOpts).toHaveProperty("onAlt");
    expect(harness.ctx.setTasks).not.toHaveBeenCalled();
  });

  it("saves a scheduled add-task that ends exactly when another task starts", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      timeGoalValue: 15,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 15,
      plannedStartDay: "mon",
      plannedStartTime: "07:15",
      plannedStartByDay: { mon: "07:15" },
      plannedStartOpenEnded: false,
    };
    const harness = createHarness("15", { tasks: [existingTask], plannedStartTime: "07:00", taskType: "once-off" });
    harness.ctx.getAddTaskDurationUnit = () => "minute";
    harness.addTaskMsToggle.checked = false;

    harness.setManualPlannedStart("07:00");
    harness.toggleSchedule(true);
    harness.submit();

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.ctx.setTasks).toHaveBeenCalledWith([
      existingTask,
      expect.objectContaining({
        plannedStartTime: "07:00",
        plannedStartByDay: { mon: "07:00" },
        timeGoalMinutes: 15,
      }),
    ]);
  });

  it("schedules the new task to the displayed next available slot when conflict modal Change is chosen", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const tasks = [existingTask];
    const harness = createHarness("1", { tasks, taskType: "once-off" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.setManualPlannedStart("09:00");
    harness.submit();

    const confirmOpts = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2];
    confirmOpts?.onOk?.();

    expect(harness.ctx.setTasks).toHaveBeenCalledWith([
      existingTask,
      expect.objectContaining({
        plannedStartTime: "10:00",
        plannedStartByDay: expect.objectContaining({ mon: "10:00" }),
      }),
    ]);
    expect(harness.ctx.setAddTaskPlannedStartTimeState).toHaveBeenCalledWith("10:00");
    expect(harness.ctx.closeConfirm).toHaveBeenCalled();
  });

  it("keeps the new task planned start and moves the conflicting task when conflict modal Continue is chosen", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
    };
    const tasks = [existingTask];
    const harness = createHarness("1", { tasks, taskType: "once-off" });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.setManualPlannedStart("09:00");
    harness.submit();

    const confirmOpts = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2];
    confirmOpts?.onAlt?.();

    expect(harness.ctx.setTasks).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "busy-1",
        plannedStartTime: "10:00",
        plannedStartByDay: expect.objectContaining({ mon: "10:00" }),
      }),
      expect.objectContaining({
        plannedStartTime: "09:00",
        plannedStartByDay: expect.objectContaining({ mon: "09:00" }),
      }),
    ]);
    expect(harness.ctx.closeConfirm).toHaveBeenCalled();
  });

  it("opens a switch-only conflict modal when no next free add-task slot exists", () => {
    const existingTask = {
      id: "busy-1",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
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
      timeGoalValue: 15,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 15,
      plannedStartDay: "mon",
      plannedStartTime: "00:00",
      plannedStartByDay: { mon: "00:00" },
      plannedStartOpenEnded: false,
    };
    const harness = createHarness("1430", { tasks: [existingTask] });
    harness.ctx.getAddTaskDurationUnit = () => "minute";
    harness.ctx.getAddTaskPlannedStartTime = () => "00:00";
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
    harness.submit();

    expect(harness.ctx.confirm).toHaveBeenCalledWith(
      "Schedule conflict",
      "No next free timeslot was found.\n\nSwitch Deep Work with New Task?",
      expect.objectContaining({
        okLabel: "Switch",
        okButtonClassName: "btn btn-ghost",
      })
    );
    const confirmOpts = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(confirmOpts).not.toHaveProperty("altLabel");
    expect(confirmOpts).not.toHaveProperty("onAlt");
    expect(harness.ctx.setTasks).not.toHaveBeenCalled();
  });
});
