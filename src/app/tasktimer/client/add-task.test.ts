import { describe, expect, it, vi } from "vitest";
import { createTaskTimerAddTask } from "./add-task";

type HandlerMap = Map<string, (event?: Event) => void>;

function createHarness(
  initialValue: string,
  overrides?: { tasks?: Array<Record<string, unknown>>; plannedStartTime?: string; taskType?: "recurring" | "once-off" }
) {
  const handlers = new Map<object, HandlerMap>();
  const documentStub = {};
  vi.stubGlobal("document", documentStub);
  let addTaskMilestones: Array<{ hours: number; description: string }> = [];
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
      addTaskTypeRecurringBtn: null,
      addTaskTypeOnceOffBtn: null,
      addTaskScheduleToggle,
      addTaskScheduleFields,
      addTaskOnceOffDaySelect: null,
      addTaskNameMenu: null,
      addTaskNameCustomList: null,
      addTaskNamePresetList: null,
      addTaskNameCustomTitle: null,
      addTaskNameDivider: null,
      addTaskNamePresetTitle: null,
      addTaskDurationUnitMinute: null,
      addTaskDurationUnitHour: null,
      addTaskDurationPeriodDay: null,
      addTaskDurationPeriodWeek: null,
      addTaskPlannedStartHourSelect: null,
      addTaskPlannedStartMinuteSelect: null,
      addTaskPlannedStartMeridiemSelect: null,
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
      addTaskPlannedStartInput: null,
      addTaskAdvancedMenu: null,
    },
    sharedTasks: {
      isCheckpointAtOrAboveTimeGoal: vi.fn(() => false),
      deriveCheckpointAlertEnabledState: vi.fn(() => ({ soundEnabled: false, toastEnabled: false })),
      hasNonPositiveCheckpoint: vi.fn(() => false),
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
    getAddTaskType: () => overrides?.taskType || "recurring",
    setAddTaskTypeState: vi.fn(),
    getAddTaskDurationValue: () => Number(addTaskDurationValueInput.value || 0),
    setAddTaskDurationValueState: vi.fn(),
    getAddTaskDurationUnit: () => "hour",
    setAddTaskDurationUnitState: vi.fn(),
    getAddTaskDurationPeriod: () => "day",
    setAddTaskDurationPeriodState: vi.fn(),
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
    getAddTaskOnceOffDay: () => "mon",
    setAddTaskOnceOffDayState: vi.fn(),
    getAddTaskPlannedStartTime: () => overrides?.plannedStartTime || "09:00",
    setAddTaskPlannedStartTimeState: vi.fn(),
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
    getOptimalProductivityStartTime: () => "09:00",
    getOptimalProductivityEndTime: () => "17:00",
    getOptimalProductivityDays: () => ["mon", "wed", "fri"],
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
    ctx,
    submit: () => submitHandler()?.({ preventDefault: vi.fn() } as unknown as Event),
    toggleSchedule: (checked = true) => {
      addTaskScheduleToggle.checked = checked;
      handlers.get(addTaskScheduleToggle)?.get("change")?.();
    },
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
    harness.submit();

    expect(harness.ctx.confirm).toHaveBeenCalledWith(
      "Schedule conflict",
      "Deep Work - 9:00 AM - 10:00 AM.\n\nSchedule New Task to next free timeslot 10:00 AM - 11:00 AM?",
      expect.objectContaining({
        okLabel: "Schedule",
        okButtonClassName: "btn btn-ghost",
      })
    );
    const confirmOpts = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(confirmOpts).not.toHaveProperty("altLabel");
    expect(confirmOpts).not.toHaveProperty("onAlt");
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

  it("schedules the new task to the displayed next available slot when conflict modal Schedule is chosen", () => {
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
    const harness = createHarness("1", { tasks });
    harness.addTaskMsToggle.checked = false;

    harness.toggleSchedule(true);
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
