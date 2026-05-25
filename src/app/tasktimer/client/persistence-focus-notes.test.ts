import { afterEach, describe, expect, it } from "vitest";
import type { LiveSessionsByTaskId, Task } from "../lib/types";
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

function createHarness(overrides?: {
  liveSessionsByTaskId?: LiveSessionsByTaskId;
  loadedDrafts?: Record<string, string>;
}) {
  const localStorageValues = new Map<string, string>();
  const windowStub = {
    localStorage: {
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageValues.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageValues.delete(key);
      },
    },
  };
  (globalThis as { window?: unknown }).window = windowStub;
  if (overrides?.loadedDrafts && Object.keys(overrides.loadedDrafts).length) {
    windowStub.localStorage.setItem("test:focus-notes", JSON.stringify(overrides.loadedDrafts));
  }
  let tasks: Task[] = [];
  let history = {};
  let liveSessions: LiveSessionsByTaskId = {};
  let focusNotes: Record<string, string> = {};
  let inputValue = "";
  const api = createTaskTimerPersistence({
    workspaceRepository: {
      loadWorkspaceSnapshot: () => ({
        tasks: [task({ running: true, startMs: 1000 })],
        historyByTaskId: {},
        cleanedHistoryByTaskId: {},
        historyWasCleaned: false,
        liveSessionsByTaskId: overrides?.liveSessionsByTaskId || {},
        deletedTaskMeta: {},
        preferences: null,
        dashboard: null,
        taskUi: null,
      }),
      saveTasks: () => {},
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
    getFocusSessionNotesByTaskId: () => focusNotes,
    setFocusSessionNotesByTaskId: (value) => {
      focusNotes = value;
    },
    getPendingTaskJumpMemory: () => null,
    setPendingTaskJumpMemory: () => {},
    getRuntimeDestroyed: () => false,
    getCurrentUid: () => "",
    getFocusModeTaskId: () => "task-1",
    getFocusSessionNoteSaveTimer: () => null,
    setFocusSessionNoteSaveTimer: () => {},
    getFocusSessionNotesInputValue: () => inputValue,
    setFocusSessionNotesInputValue: (value) => {
      inputValue = value;
    },
    setFocusSessionNotesSectionOpen: () => {},
    getCurrentAppPage: () => "tasks",
    getInitialAppPageFromLocation: () => "tasks",
    initialAppPage: "tasks",
    getCloudTaskUiCache: () => null,
    loadCachedTaskUi: () => null,
    loadDeletedMeta: () => ({}),
    setDeletedTaskMeta: () => {},
    primeDashboardCacheFromShadow: () => {},
    loadFocusSessionNotes: () => overrides?.loadedDrafts || {},
    loadAddTaskCustomNames: () => {},
    loadWeekStartingPreference: () => {},
    loadStartupModulePreference: () => {},
    loadTaskViewPreference: () => {},
    loadTaskOrderByPreference: () => {},
    loadAutoFocusOnTaskLaunchSetting: () => {},
    loadDynamicColorsSetting: () => {},
    loadInteractionClickSoundSetting: () => {},
    loadAchievementSoundsSetting: () => {},
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
    syncSharedTaskSummariesForTasks: async () => {},
    jumpToTaskById: () => {},
    maybeRestorePendingTimeGoalFlow: () => {},
    normalizeLoadedTask: () => {},
    nowMs: () => 10_000,
  });

  return {
    api,
    getInputValue: () => inputValue,
    getFocusNotes: () => focusNotes,
  };
}

describe("task timer persistence focus notes", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("hydrates the active focus note from the live session before a stale local draft", () => {
    const harness = createHarness({
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: 1000,
          updatedAtMs: 2000,
          elapsedMs: 5000,
          status: "running",
          note: "cloud note",
        },
      },
      loadedDrafts: { "task-1": "local draft" },
    });

    harness.api.hydrateUiStateFromCaches();

    expect(harness.getFocusNotes()).toEqual({ "task-1": "local draft" });
    expect(harness.getInputValue()).toBe("cloud note");
  });

  it("falls back to the local draft during hydration when no live-session note exists", () => {
    const harness = createHarness({
      loadedDrafts: { "task-1": "local draft" },
    });

    harness.api.hydrateUiStateFromCaches();

    expect(harness.getInputValue()).toBe("local draft");
  });
});
