import { describe, expect, it, vi } from "vitest";
import { createTaskTimerAddTask } from "./add-task";

type HandlerMap = Map<string, (event?: Event) => void>;

function createHarness(initialValue: string) {
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
    getAddTaskType: () => "recurring",
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
    getAddTaskPlannedStartTime: () => "09:00",
    setAddTaskPlannedStartTimeState: vi.fn(),
    getTasks: () => [],
    setTasks: vi.fn(),
    sortMilestones: (value: unknown[]) => value,
    save: vi.fn(),
    render: vi.fn(),
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    setSuppressAddTaskNameFocusOpenState: vi.fn(),
    getSuppressAddTaskNameFocusOpen: () => false,
    getCurrentAppPage: () => "tasks",
    jumpToTaskAndHighlight: vi.fn(),
  } as unknown as Parameters<typeof createTaskTimerAddTask>[0];

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
    const setTasksMock = harness.ctx.setTasks as any;
    const renderMock = harness.ctx.render as any;
    const saveMock = harness.ctx.save as any;

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
});
