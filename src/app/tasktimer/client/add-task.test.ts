import { describe, expect, it, vi } from "vitest";
import { createTaskTimerAddTask } from "./add-task";

type HandlerMap = Map<string, (event?: Event) => void>;

function createHarness(initialValue: string) {
  const handlers = new Map<object, HandlerMap>();
  const documentStub = {};
  vi.stubGlobal("document", documentStub);
  let addTaskMilestones: Array<{ hours: number; description: string }> = [];
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
      addTaskName: null,
      addTaskMsArea: null,
      addTaskMsList: null,
      addTaskCancelBtn: null,
      addTaskForm: null,
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
      makeTask: vi.fn(),
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
  } as Parameters<typeof createTaskTimerAddTask>[0];

  const api = createTaskTimerAddTask(ctx);
  api.registerAddTaskEvents();

  return {
    addTaskDurationValueInput,
    addTaskMsToggle,
    ctx,
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
});
