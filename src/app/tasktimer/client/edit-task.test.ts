import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { SCHEDULE_DAY_ORDER } from "../lib/schedule-placement";
import {
  clearTaskScheduleConfig,
  createTaskTimerEditTask,
  getEditTimeGoalSaveFields,
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

function selectStub(value: string) {
  return { value, classList: { toggle: vi.fn() } } as unknown as HTMLSelectElement;
}

function timeInputStub(value = "") {
  return {
    value,
    disabled: false,
    classList: { toggle: vi.fn() },
  } as unknown as HTMLInputElement;
}

function overlayStub() {
  return {
    style: {
      display: "flex",
      removeProperty: vi.fn(),
    },
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    querySelector: vi.fn(() => null),
  } as unknown as HTMLElement;
}

function createEditHarness(overrides: {
  sourceTask?: Task;
  busyTask?: Task;
  durationValue?: string;
  durationUnit?: "minute" | "hour";
  durationPeriod?: "day" | "week";
  productivityDays?: string[];
  plannedStartSelectors?: { hour: string; minute: string; meridiem: "AM" | "PM" };
} = {}) {
  vi.stubGlobal("HTMLElement", class HTMLElementStub {});
  vi.stubGlobal("window", {
    setTimeout: vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
    clearTimeout: vi.fn(),
    matchMedia: vi.fn(() => ({ matches: false })),
  });
  let editIndex: number | null = 0;
  const editOverlay = overlayStub();
  const sourceTask =
    overrides.sourceTask ||
    task({
      id: "source",
      name: "Focus",
      taskType: "recurring",
      plannedStartDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
    });
  const busyTask =
    overrides.busyTask ||
    task({
      id: "busy",
      name: "Deep Work",
      taskType: "once-off",
      onceOffDay: "mon",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
    });
  const draft = { ...sourceTask, plannedStartByDay: sourceTask.plannedStartByDay ? { ...sourceTask.plannedStartByDay } : null };
  const tasks = [sourceTask, busyTask];
  const plannedStartSelectors = overrides.plannedStartSelectors;
  const editPlannedStartHourSelect = plannedStartSelectors ? selectStub(plannedStartSelectors.hour) : selectStub("");
  const editPlannedStartMinuteSelect = plannedStartSelectors ? selectStub(plannedStartSelectors.minute) : selectStub("");
  const editPlannedStartMeridiemSelect = plannedStartSelectors ? selectStub(plannedStartSelectors.meridiem) : selectStub("");
  const editPlannedStartTimeInput = timeInputStub(String(sourceTask.plannedStartTime || ""));
  const editPlannedStartInput = { value: "" } as HTMLInputElement;
  const editTaskScheduleSummary = {
    classList: { toggle: vi.fn() },
  } as unknown as HTMLDetailsElement;
  const editTaskScheduleSummaryText = {
    textContent: "",
  } as HTMLElement;
  const editTaskScheduleToggle = { checked: false } as HTMLInputElement;
  const ctx = {
    els: {
      editName: { value: "Focus" } as HTMLInputElement,
      editTaskScheduleToggle,
      editTaskDurationValueInput: {
        value: overrides.durationValue || "1",
        classList: { remove: vi.fn(), toggle: vi.fn() },
      } as unknown as HTMLInputElement,
      editTaskOnceOffDaySelect: null,
      editPlannedStartTimeInput,
      editPlannedStartHourSelect,
      editPlannedStartMinuteSelect,
      editPlannedStartMeridiemSelect,
      editPlannedStartInput,
      editPlannedStartPushReminders: null,
      editTaskScheduleSummary,
      editTaskScheduleSummaryText,
      editOverlay,
      confirmOverlay: null,
    },
    sharedTasks: {
      ensureMilestoneIdentity: vi.fn(),
      hasNonPositiveCheckpoint: vi.fn(() => false),
      hasDuplicateCheckpointTime: vi.fn(() => false),
      hasCheckpointAtOrAboveTimeGoal: vi.fn(() => false),
      deriveCheckpointAlertEnabledState: vi.fn(() => ({ soundEnabled: false, toastEnabled: false })),
      milestoneUnitSec: vi.fn(() => 3600),
    },
    getTasks: () => tasks,
    getEditIndex: () => editIndex,
    setEditIndex: vi.fn((value: number | null) => {
      editIndex = value;
    }),
    getEditTaskDraft: () => draft,
    setEditTaskDraft: vi.fn(),
    setEditDraftSnapshot: vi.fn(),
    getEditTaskDurationUnit: () => overrides.durationUnit || "hour",
    setEditTaskDurationUnit: vi.fn(),
    getEditTaskDurationPeriod: () => overrides.durationPeriod || "day",
    setEditTaskDurationPeriod: vi.fn(),
    validateEditTimeGoal: () => true,
    editTaskHasActiveTimeGoal: () => true,
    getEditTaskTimeGoalMinutes: () => Number(overrides.durationValue || "1") * (overrides.durationUnit === "minute" ? 1 : 60),
    getEditTaskTimeGoalMinutesFor: (value: number, unit: "minute" | "hour") => value * (unit === "minute" ? 1 : 60),
    sortMilestones: (milestones: Task["milestones"]) => milestones,
    cloneTaskForEdit: (value: Task) => ({ ...value, plannedStartByDay: value.plannedStartByDay ? { ...value.plannedStartByDay } : null }),
    syncEditSaveAvailability: vi.fn(),
    syncSharedTaskSummariesForTask: vi.fn(() => Promise.resolve()),
    confirm: vi.fn(),
    closeConfirm: vi.fn(),
    save: vi.fn(),
    render: vi.fn(),
    showActionConfirmation: vi.fn(),
    clearEditValidationState: vi.fn(),
    showEditValidationError: vi.fn(),
    on: vi.fn(),
    escapeHtmlUI: (value: unknown) => String(value ?? ""),
    getOptimalProductivityDays: () => overrides.productivityDays || [...SCHEDULE_DAY_ORDER],
    syncEditTaskTimeGoalUi: vi.fn(),
    syncEditCheckpointAlertUi: vi.fn(),
    syncEditMilestoneSectionUi: vi.fn(),
    setMilestoneUnitUi: vi.fn(),
    renderMilestoneEditor: vi.fn(),
    syncEditTaskDurationReadout: vi.fn(),
    isEditTimeGoalEnabled: () => true,
    setEditTimeGoalEnabled: vi.fn(),
    isEditMilestoneUnitDay: () => false,
    buildEditDraftSnapshot: () => "",
    resetCheckpointAlertTracking: vi.fn(),
    clearCheckpointBaseline: vi.fn(),
    getElapsedPadTarget: () => null,
    setElapsedPadTarget: vi.fn(),
    getElapsedPadMilestoneRef: () => null,
    setElapsedPadMilestoneRef: vi.fn(),
    getElapsedPadDraft: () => "0",
    setElapsedPadDraft: vi.fn(),
    getElapsedPadOriginal: () => "0",
    setElapsedPadOriginal: vi.fn(),
    getCheckpointAlertSoundEnabled: () => false,
    getCheckpointAlertToastEnabled: () => false,
    getMobilePushAlertsEnabled: () => false,
    setMobilePushAlertsEnabledState: vi.fn(),
    getWebPushAlertsEnabled: () => false,
    setWebPushAlertsEnabledState: vi.fn(),
    persistPushAlertsPreference: vi.fn(),
    getElapsedMs: () => 0,
    getAddTaskTimeGoalMinutesState: () => 0,
    hasEntitlement: () => true,
    showUpgradePrompt: vi.fn(),
  } as unknown as Parameters<typeof createTaskTimerEditTask>[0];

  const api = createTaskTimerEditTask(ctx);
  return { api, ctx, sourceTask, busyTask, editOverlay, editTaskScheduleSummary, editTaskScheduleSummaryText, getEditIndex: () => editIndex };
}

function expectEditConflictSavedAndClosed(harness: ReturnType<typeof createEditHarness>) {
  expect(harness.ctx.save).toHaveBeenCalled();
  expect(harness.ctx.render).toHaveBeenCalled();
  expect(harness.ctx.closeConfirm).toHaveBeenCalled();
  expect(harness.editOverlay.classList.remove).toHaveBeenCalledWith("isOpening");
  expect(harness.editOverlay.classList.remove).toHaveBeenCalledWith("isOpen");
  expect(harness.editOverlay.classList.add).toHaveBeenCalledWith("isClosing");
  expect(harness.ctx.clearEditValidationState).toHaveBeenCalled();
  expect(harness.ctx.setEditIndex).toHaveBeenCalledWith(null);
  expect(harness.ctx.setEditTaskDraft).toHaveBeenCalledWith(null);
  expect(harness.ctx.setEditDraftSnapshot).toHaveBeenCalledWith("");
  expect(harness.getEditIndex()).toBeNull();
}

describe("edit task schedule summary", () => {
  it("updates the summary for a loaded recurring weekly task", () => {
    const harness = createEditHarness({
      durationValue: "1",
      durationPeriod: "week",
      productivityDays: ["mon", "tue", "wed", "thu", "fri"],
      sourceTask: task({
        taskType: "recurring",
        timeGoalValue: 1,
        timeGoalUnit: "hour",
        timeGoalPeriod: "week",
        timeGoalMinutes: 60,
        plannedStartTime: "08:00",
        plannedStartByDay: { mon: "08:00", tue: "08:00", wed: "08:00", thu: "08:00", fri: "08:00" },
      }),
    });

    harness.api.syncEditTaskTimeGoalUi(harness.api.getCurrentEditTask());

    expect(harness.editTaskScheduleSummaryText.textContent).toBe(
      "Task will be split into 12 minute daily scheduled blocks at 8:00 AM on your 5 productivity days."
    );
    expect(harness.editTaskScheduleSummary.classList.toggle).toHaveBeenLastCalledWith("isHidden", false);
  });

  it("updates the summary for a once-off edited task", () => {
    const harness = createEditHarness({
      durationValue: "1",
      sourceTask: task({
        taskType: "once-off",
        onceOffDay: "fri",
        plannedStartDay: "fri",
        plannedStartTime: "08:00",
        plannedStartByDay: { fri: "08:00" },
      }),
    });

    harness.api.syncEditTaskTimeGoalUi(harness.api.getCurrentEditTask());

    expect(harness.editTaskScheduleSummaryText.textContent).toBe("Task will be added as a 1 hour scheduled block at 8:00 AM on Friday.");
  });
});

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

  it("preserves existing weekly recurring schedule days on edit save", () => {
    const editDraft = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartTime: "09:00",
      plannedStartByDay: { tue: "09:00" },
    });

    normalizeRecurringScheduleFieldsForSave(editDraft, editDraft, ["mon", "wed", "fri"]);

    expect(editDraft.plannedStartByDay).toEqual({ tue: "09:00" });
    expect(editDraft.plannedStartDay).toBe("tue");
  });

  it("generates weekly recurring schedules from optimal productivity days without existing scheduled day entries", () => {
    const editDraft = task({
      taskType: "recurring",
      timeGoalPeriod: "week",
      timeGoalMinutes: 100,
      plannedStartTime: "09:00",
      plannedStartByDay: null,
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
  it("stores edited recurring weekly time goals as weekly totals", () => {
    expect(getEditTimeGoalSaveFields("recurring", 4, "hour", "week")).toEqual({
      timeGoalPeriod: "week",
      timeGoalMinutes: 240,
    });
    expect(getEditTimeGoalSaveFields("recurring", 30, "minute", "week")).toEqual({
      timeGoalPeriod: "week",
      timeGoalMinutes: 30,
    });
  });

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

  it("treats an intentionally cleared schedule as unscheduled on edit open", () => {
    expect(
      taskHasMeaningfulScheduleConfig(
        task({
          timeGoalEnabled: false,
          timeGoalValue: 0,
          timeGoalMinutes: 0,
          plannedStartTime: null,
          plannedStartByDay: null,
          plannedStartOpenEnded: true,
        })
      )
    ).toBe(false);
  });

  it("ignores stale day maps on intentionally cleared tasks when deciding edit-open schedule state", () => {
    expect(
      taskHasMeaningfulScheduleConfig(
        task({
          timeGoalEnabled: false,
          timeGoalValue: 0,
          timeGoalMinutes: 0,
          plannedStartTime: null,
          plannedStartByDay: { sat: "09:00" },
          plannedStartOpenEnded: true,
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
        plannedStartOpenEnded: true,
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

describe("edit task planned start initialization", () => {
  it("loads a shared per-day planned start when plannedStartTime is empty", () => {
    vi.setSystemTime(new Date("2026-05-18T10:00:00"));
    const harness = createEditHarness({
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartTime: null,
        plannedStartByDay: { mon: "13:45", wed: "13:45", fri: "13:45" },
      }),
    });

    harness.api.openEdit(0);

    expect(harness.ctx.els.editPlannedStartTimeInput?.value).toBe("13:45");
    expect(harness.ctx.els.editPlannedStartHourSelect?.value).toBe("01");
    expect(harness.ctx.els.editPlannedStartMinuteSelect?.value).toBe("45");
    expect(harness.ctx.els.editPlannedStartMeridiemSelect?.value).toBe("PM");
    expect(harness.ctx.els.editPlannedStartInput?.value).toBe("13:45");
  });

  it("loads today's planned start for mixed per-day schedules", () => {
    vi.setSystemTime(new Date("2026-05-20T10:00:00"));
    const harness = createEditHarness({
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartTime: null,
        plannedStartByDay: { mon: "08:15", wed: "14:30", fri: "16:45" },
      }),
    });

    harness.api.openEdit(0);

    expect(harness.ctx.els.editPlannedStartTimeInput?.value).toBe("14:30");
    expect(harness.ctx.els.editPlannedStartHourSelect?.value).toBe("02");
    expect(harness.ctx.els.editPlannedStartMinuteSelect?.value).toBe("30");
    expect(harness.ctx.els.editPlannedStartMeridiemSelect?.value).toBe("PM");
  });

  it("falls back to the first scheduled day when the task is not scheduled today", () => {
    vi.setSystemTime(new Date("2026-05-21T10:00:00"));
    const harness = createEditHarness({
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartTime: null,
        plannedStartByDay: { tue: "11:20", fri: "15:10" },
      }),
    });

    harness.api.openEdit(0);

    expect(harness.ctx.els.editPlannedStartTimeInput?.value).toBe("11:20");
    expect(harness.ctx.els.editPlannedStartHourSelect?.value).toBe("11");
    expect(harness.ctx.els.editPlannedStartMinuteSelect?.value).toBe("20");
    expect(harness.ctx.els.editPlannedStartMeridiemSelect?.value).toBe("AM");
  });

  it("falls back to 9 AM when no planned schedule time exists", () => {
    vi.setSystemTime(new Date("2026-05-18T10:00:00"));
    const harness = createEditHarness({
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartTime: null,
        plannedStartByDay: null,
      }),
    });

    harness.api.openEdit(0);

    expect(harness.ctx.els.editPlannedStartTimeInput?.value).toBe("09:00");
    expect(harness.ctx.els.editPlannedStartHourSelect?.value).toBe("09");
    expect(harness.ctx.els.editPlannedStartMinuteSelect?.value).toBe("00");
    expect(harness.ctx.els.editPlannedStartMeridiemSelect?.value).toBe("AM");
  });
});

describe("edit task schedule conflict confirmation", () => {
  it("blocks saving an edited task with duplicate checkpoint times", () => {
    const harness = createEditHarness({
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartTime: "08:00",
        plannedStartByDay: { mon: "08:00" },
        milestonesEnabled: true,
        milestoneTimeUnit: "hour",
        milestones: [
          { hours: 0.25, description: "Quarter" },
          { hours: 0.25, description: "Duplicate quarter" },
        ],
      }),
    });
    vi.mocked(harness.ctx.sharedTasks.hasDuplicateCheckpointTime).mockReturnValue(true);

    harness.api.closeEdit(true);

    expect(harness.ctx.syncEditSaveAvailability).toHaveBeenCalled();
    expect(harness.ctx.showEditValidationError).toHaveBeenCalledWith(
      expect.objectContaining({ id: "source" }),
      "Checkpoint times must be unique."
    );
    expect(harness.ctx.save).not.toHaveBeenCalled();
  });

  it("opens a conflict modal with schedule ranges for edit overlaps", () => {
    const harness = createEditHarness();

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).toHaveBeenCalledWith(
      "Schedule conflict",
      "",
      expect.objectContaining({
        altLabel: "Change",
        okLabel: "Continue",
        textHtml:
          "Deep Work - 9:00 AM - 10:00 AM.\n\nDo you want to <strong>change</strong> Focus to the next available timeslot or <strong>continue</strong> with 9:00 AM and move Deep Work to the closest available timeslot?",
        altButtonClassName: "btn btn-ghost",
        okButtonClassName: "btn btn-accent",
      })
    );
    const options = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options).toHaveProperty("onAlt");
    expect(harness.ctx.save).not.toHaveBeenCalled();
  });

  it("updates the edited task planned start time when conflict modal Change is chosen", () => {
    const harness = createEditHarness();

    harness.api.closeEdit(true);
    const options = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as { onAlt?: () => void } | undefined;
    options?.onAlt?.();

    expect(harness.sourceTask.plannedStartTime).toBe("10:00");
    expect(harness.sourceTask.plannedStartByDay).toEqual(
      Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, "10:00"]))
    );
    expectEditConflictSavedAndClosed(harness);
  });

  it("keeps the edited task planned start and moves the conflicting task when conflict modal Continue is chosen", () => {
    const harness = createEditHarness();

    harness.api.closeEdit(true);
    const options = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as { onOk?: () => void } | undefined;
    options?.onOk?.();

    expect(harness.sourceTask.plannedStartTime).toBe("09:00");
    expect(harness.sourceTask.plannedStartByDay).toEqual(Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, "09:00"])));
    expect(harness.busyTask.plannedStartTime).toBe("10:00");
    expect(harness.busyTask.plannedStartByDay).toEqual({ mon: "10:00" });
    expectEditConflictSavedAndClosed(harness);
  });

  it("updates the edit planned start controls when conflict modal Change is chosen", () => {
    const harness = createEditHarness({
      plannedStartSelectors: { hour: "09", minute: "00", meridiem: "AM" },
    });

    harness.api.closeEdit(true);
    const options = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as { onAlt?: () => void } | undefined;
    options?.onAlt?.();

    expect(harness.ctx.els.editPlannedStartHourSelect?.value).toBe("10");
    expect(harness.ctx.els.editPlannedStartMinuteSelect?.value).toBe("00");
    expect(harness.ctx.els.editPlannedStartMeridiemSelect?.value).toBe("AM");
    expectEditConflictSavedAndClosed(harness);
  });

  it("saves an edited task that ends exactly when another task starts", () => {
    vi.stubGlobal("HTMLElement", class HTMLElementStub {});
    const harness = createEditHarness({
      durationValue: "15",
      durationUnit: "minute",
      plannedStartSelectors: { hour: "07", minute: "00", meridiem: "AM" },
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "once-off",
        onceOffDay: "mon",
        timeGoalValue: 15,
        timeGoalUnit: "minute",
        timeGoalMinutes: 15,
        plannedStartDay: "mon",
        plannedStartTime: "07:00",
        plannedStartByDay: { mon: "07:00" },
      }),
      busyTask: task({
        id: "busy",
        name: "Deep Work",
        taskType: "once-off",
        onceOffDay: "mon",
        timeGoalValue: 15,
        timeGoalUnit: "minute",
        timeGoalMinutes: 15,
        plannedStartDay: "mon",
        plannedStartTime: "07:15",
        plannedStartByDay: { mon: "07:15" },
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.ctx.save).toHaveBeenCalled();
    expect(harness.sourceTask.plannedStartTime).toBe("07:00");
    expect(harness.sourceTask.plannedStartByDay).toEqual({ mon: "07:00" });
  });

  it("opens a switch-only conflict modal when no next free edit slot exists", () => {
    const harness = createEditHarness({
      durationValue: "1430",
      durationUnit: "minute",
      plannedStartSelectors: { hour: "12", minute: "00", meridiem: "AM" },
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        timeGoalValue: 1430,
        timeGoalUnit: "minute",
        timeGoalMinutes: 1430,
        plannedStartDay: null,
        plannedStartTime: "00:00",
        plannedStartByDay: { mon: "00:00" },
      }),
      busyTask: task({
        id: "busy",
        name: "Deep Work",
        taskType: "once-off",
        onceOffDay: "mon",
        timeGoalValue: 15,
        timeGoalUnit: "minute",
        timeGoalMinutes: 15,
        plannedStartDay: "mon",
        plannedStartTime: "00:00",
        plannedStartByDay: { mon: "00:00" },
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).toHaveBeenCalledWith(
      "Schedule conflict",
      "No next free timeslot was found.\n\nSwitch Deep Work with Focus?",
      expect.objectContaining({
        okLabel: "Switch",
        okButtonClassName: "btn btn-ghost",
      })
    );
    const options = vi.mocked(harness.ctx.confirm).mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options).not.toHaveProperty("altLabel");
    expect(options).not.toHaveProperty("onAlt");
    expect(harness.ctx.save).not.toHaveBeenCalled();
  });
});

describe("edit task scheduled days outside productivity preferences", () => {
  const nonConflictingBusyTask = task({
    id: "busy",
    name: "Deep Work",
    taskType: "once-off",
    onceOffDay: "tue",
    plannedStartDay: "tue",
    plannedStartTime: "15:00",
    plannedStartByDay: { tue: "15:00" },
  });

  it("does not prompt after re-enabling an intentionally cleared task with stale non-optimal schedule data", () => {
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    });
    const harness = createEditHarness({
      durationPeriod: "week",
      productivityDays: ["mon", "wed", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        timeGoalEnabled: false,
        timeGoalValue: 0,
        timeGoalPeriod: "week",
        timeGoalMinutes: 0,
        plannedStartDay: null,
        plannedStartTime: "09:00",
        plannedStartByDay: { sat: "09:00" },
        plannedStartOpenEnded: true,
      }),
    });
    harness.api.registerEditTaskEvents();
    harness.api.openEdit(0);
    const toggle = harness.ctx.els.editTaskScheduleToggle as HTMLInputElement;
    toggle.checked = true;
    const toggleChangeHandler = vi.mocked(harness.ctx.on).mock.calls.find(
      ([element, eventName]) => element === toggle && eventName === "change"
    )?.[2] as (() => void) | undefined;

    toggleChangeHandler?.();
    expect(harness.api.getCurrentEditTask()?.plannedStartByDay).toBeNull();
    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.sourceTask.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00", fri: "09:00" });
    expect(harness.sourceTask.plannedStartByDay).not.toHaveProperty("sat");
    expect(harness.ctx.save).toHaveBeenCalled();
  });

  it("saves scheduled days outside productivity preferences without prompting", () => {
    const harness = createEditHarness({
      durationPeriod: "week",
      productivityDays: ["mon", "wed", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        timeGoalPeriod: "week",
        timeGoalMinutes: 120,
        plannedStartTime: "09:00",
        plannedStartByDay: { mon: "09:00", sat: "09:00" },
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.sourceTask.plannedStartByDay).toEqual({ mon: "09:00", sat: "09:00" });
    expect(harness.sourceTask.plannedStartDay).toBeNull();
    expect(harness.sourceTask.plannedStartTime).toBeNull();
    expect(harness.ctx.save).toHaveBeenCalled();
    expect(harness.getEditIndex()).toBeNull();
  });

  it("saves daily recurring all-day schedules without removing non-productivity days", () => {
    const harness = createEditHarness({
      durationPeriod: "day",
      productivityDays: ["mon", "tue", "wed", "thu", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartDay: null,
        plannedStartTime: "09:00",
        plannedStartByDay: Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, "09:00"])),
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.sourceTask.plannedStartByDay).toEqual(Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, "09:00"])));
    expect(harness.ctx.save).toHaveBeenCalled();
  });

  it("saves a once-off day outside productivity preferences without prompting", () => {
    const harness = createEditHarness({
      productivityDays: ["mon", "wed", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "once-off",
        onceOffDay: "sat",
        onceOffTargetDate: "2026-05-16",
        plannedStartDay: "sat",
        plannedStartTime: "09:00",
        plannedStartByDay: { sat: "09:00" },
      }),
    });
    harness.ctx.els.editTaskOnceOffDaySelect = selectStub("sat");

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.sourceTask.taskType).toBe("once-off");
    expect(harness.sourceTask.onceOffDay).toBe("sat");
    expect(harness.sourceTask.onceOffTargetDate).toBeTruthy();
    expect(harness.sourceTask.plannedStartDay).toBe("sat");
    expect(harness.sourceTask.plannedStartTime).toBe("09:00");
    expect(harness.sourceTask.plannedStartByDay).toEqual({ sat: "09:00" });
    expect(harness.sourceTask.plannedStartOpenEnded).toBe(false);
    expect(harness.ctx.save).toHaveBeenCalled();
  });

  it("saves without prompting when all scheduled days are optimal", () => {
    const harness = createEditHarness({
      durationPeriod: "week",
      productivityDays: ["mon", "wed", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        timeGoalPeriod: "week",
        timeGoalMinutes: 120,
        plannedStartTime: "09:00",
        plannedStartByDay: { mon: "09:00", wed: "09:00" },
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.ctx.save).toHaveBeenCalled();
  });

  it("saves open-ended tasks without prompting", () => {
    const harness = createEditHarness({
      productivityDays: ["mon", "wed", "fri"],
      busyTask: nonConflictingBusyTask,
      sourceTask: task({
        id: "source",
        name: "Focus",
        taskType: "recurring",
        plannedStartOpenEnded: true,
        plannedStartTime: null,
        plannedStartByDay: null,
      }),
    });

    harness.api.closeEdit(true);

    expect(harness.ctx.confirm).not.toHaveBeenCalled();
    expect(harness.ctx.save).toHaveBeenCalled();
  });
});
