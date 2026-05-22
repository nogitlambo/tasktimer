import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { createTaskTimerPersistence } from "./persistence";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function createHarness(snapshotTasks: Task[], nowValue = new Date(2026, 4, 3, 8).getTime()) {
  let tasks: Task[] = [];
  let history = {};
  let liveSessions = {};
  const saveTasks = vi.fn();
  const syncSharedTaskSummariesForTasks = vi.fn(async () => undefined);
  const api = createTaskTimerPersistence({
    workspaceRepository: {
      loadWorkspaceSnapshot: () => ({
        tasks: snapshotTasks,
        historyByTaskId: {},
        cleanedHistoryByTaskId: {},
        historyWasCleaned: false,
        liveSessionsByTaskId: liveSessions,
        deletedTaskMeta: {},
        preferences: null,
        dashboard: null,
        taskUi: null,
      }),
      saveTasks,
    },
    historyPersistence: {
      loadSnapshot: () => ({ historyByTaskId: {}, cleanedHistoryByTaskId: {}, historyWasCleaned: false }),
      saveCleanedSnapshot: () => {},
    },
    focusSessionNotesKey: "test:focus-notes",
    pendingTaskJumpKey: "test:pending-jump",
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getHistoryByTaskId: () => history,
    setHistoryByTaskId: (value) => {
      history = value;
    },
    getLiveSessionsByTaskId: () => liveSessions,
    setLiveSessionsByTaskId: (value) => {
      liveSessions = value;
    },
    getHistoryRangeDaysByTaskId: () => ({}),
    setHistoryRangeDaysByTaskId: () => {},
    getHistoryRangeModeByTaskId: () => ({}),
    setHistoryRangeModeByTaskId: () => {},
    getFocusSessionNotesByTaskId: () => ({}),
    setFocusSessionNotesByTaskId: () => {},
    getPendingTaskJumpMemory: () => null,
    setPendingTaskJumpMemory: () => {},
    getRuntimeDestroyed: () => false,
    getCurrentUid: () => "",
    getFocusModeTaskId: () => null,
    getFocusSessionNoteSaveTimer: () => null,
    setFocusSessionNoteSaveTimer: () => {},
    getFocusSessionNotesInputValue: () => "",
    setFocusSessionNotesInputValue: () => {},
    setFocusSessionNotesSectionOpen: () => {},
    getCurrentAppPage: () => "tasks",
    getInitialAppPageFromLocation: () => "tasks",
    initialAppPage: "tasks",
    getCloudTaskUiCache: () => null,
    loadCachedTaskUi: () => null,
    loadDeletedMeta: () => ({}),
    setDeletedTaskMeta: () => {},
    primeDashboardCacheFromShadow: () => {},
    loadFocusSessionNotes: () => ({}),
    loadAddTaskCustomNames: () => {},
    loadWeekStartingPreference: () => {},
    loadStartupModulePreference: () => {},
    loadTaskViewPreference: () => {},
    loadTaskOrderByPreference: () => {},
    loadAutoFocusOnTaskLaunchSetting: () => {},
    loadDynamicColorsSetting: () => {},
    loadInteractionClickSoundSetting: () => {},
    loadInteractionHapticsSetting: () => {},
    loadCheckpointAlertSettings: () => {},
    loadOptimalProductivityPeriodPreference: () => {},
    loadOptimalProductivityDaysPreference: () => {},
    loadDashboardWidgetState: () => {},
    loadThemePreference: () => {},
    loadMenuButtonStylePreference: () => {},
    syncTaskSettingsUi: () => {},
    loadPinnedHistoryTaskIds: () => {},
    loadModeLabels: () => {},
    backfillHistoryColorsFromSessionLogic: () => {},
    syncModeLabelsUi: () => {},
    applyMainMode: () => {},
    applyAppPage: () => {},
    applyDashboardOrderFromStorage: () => {},
    applyDashboardCardSizes: () => {},
    applyDashboardCardVisibility: () => {},
    applyDashboardEditMode: () => {},
    renderDashboardWidgets: () => {},
    syncSharedTaskSummariesForTasks,
    jumpToTaskById: () => {},
    maybeRestorePendingTimeGoalFlow: () => {},
    normalizeLoadedTask: () => {},
    nowMs: () => nowValue,
  });
  return { api, getTasks: () => tasks, saveTasks, syncSharedTaskSummariesForTasks };
}

describe("task timer persistence resume-pending cleanup", () => {
  it("cleans stale stopped resumable tasks during task snapshot load", () => {
    const harness = createHarness([
      task({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-02" }),
    ]);

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({ accumulatedMs: 0, hasStarted: false, resumePendingSinceDayKey: null });
    expect(harness.saveTasks).toHaveBeenCalledWith(harness.getTasks());
    expect(harness.syncSharedTaskSummariesForTasks).toHaveBeenCalledWith(["task-1"]);
  });

  it("does not persist when same-day stopped resumable tasks remain unchanged", () => {
    const harness = createHarness([
      task({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-03" }),
    ]);

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-03" });
    expect(harness.saveTasks).not.toHaveBeenCalled();
  });

  it("stamps existing unmarked resumable tasks instead of resetting them", () => {
    const harness = createHarness([task({ accumulatedMs: 30_000, hasStarted: true })]);

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-03" });
    expect(harness.saveTasks).toHaveBeenCalledWith(harness.getTasks());
  });
});
