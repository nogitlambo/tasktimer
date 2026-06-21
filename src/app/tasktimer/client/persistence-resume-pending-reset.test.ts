import { describe, expect, it, vi } from "vitest";
import type { HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
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

function createHarness(
  snapshotTasks: Task[],
  nowValue = new Date(2026, 4, 3, 8).getTime(),
  initialLiveSessions: LiveSessionsByTaskId = {}
) {
  let tasks: Task[] = [];
  let history: HistoryByTaskId = {};
  let liveSessions: LiveSessionsByTaskId = initialLiveSessions;
  const saveTasks = vi.fn();
  const finalizeLiveSession = vi.fn((entry: Task, opts?: { elapsedMs?: number; completedAtMs?: number }) => {
    const taskId = String(entry.id || "");
    const liveSession = liveSessions[taskId];
    const nextHistory = {
      ...history,
      [taskId]: [
        ...(history[taskId] || []),
        {
          ts: Math.max(0, Math.floor(Number(opts?.completedAtMs || 0) || 0)),
          name: entry.name,
          ms: Math.max(0, Math.floor(Number(opts?.elapsedMs || 0) || 0)),
          ...(liveSession?.note ? { note: liveSession.note } : {}),
          ...(liveSession?.sessionId ? { sessionId: liveSession.sessionId } : {}),
        },
      ],
    };
    history = nextHistory;
    const nextLiveSessions = { ...liveSessions };
    delete nextLiveSessions[taskId];
    liveSessions = nextLiveSessions;
  });
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
      loadTimerStateSnapshot: () => ({
        tasks: snapshotTasks,
        liveSessionsByTaskId: liveSessions,
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
    loadDashboardPreviousWeekSetting: () => {},
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
    finalizeLiveSession,
    syncSharedTaskSummariesForTasks,
    jumpToTaskById: () => {},
    maybeRestorePendingTimeGoalFlow: () => {},
    normalizeLoadedTask: () => {},
    nowMs: () => nowValue,
  });
  return {
    api,
    getTasks: () => tasks,
    getHistory: () => history,
    getLiveSessions: () => liveSessions,
    saveTasks,
    finalizeLiveSession,
    syncSharedTaskSummariesForTasks,
  };
}

describe("task timer persistence resume-pending cleanup", () => {
  it("keeps stale stopped resumable tasks available during task snapshot load", () => {
    const harness = createHarness([
      task({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-02" }),
    ]);

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({ accumulatedMs: 30_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-03" });
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

  it("finalizes a closed-app daily time-goal live session during task snapshot load", () => {
    const startedAtMs = new Date(2026, 4, 2, 22, 0, 0).getTime();
    const updatedAtMs = startedAtMs + 30 * 60_000;
    const nowValue = startedAtMs + 3 * 60 * 60_000;
    const harness = createHarness(
      [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
        }),
      ],
      nowValue,
      {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs,
          updatedAtMs,
          elapsedMs: 30 * 60_000,
          note: "closed app note",
          status: "running",
        },
      }
    );

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({
      accumulatedMs: 60 * 60_000,
      running: false,
      startMs: null,
      timeGoalCompletedDayKey: "2026-05-02",
      timeGoalCompletedAtMs: startedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60_000,
    });
    expect(harness.getHistory()["task-1"]).toEqual([
      {
        ts: startedAtMs,
        name: "Focus",
        ms: 60 * 60_000,
        note: "closed app note",
        sessionId: "session-1",
      },
    ]);
    expect(harness.getLiveSessions()).toEqual({});
    expect(harness.finalizeLiveSession).toHaveBeenCalledWith(harness.getTasks()[0], {
      elapsedMs: 60 * 60_000,
      completedAtMs: startedAtMs,
    });
    expect(harness.saveTasks).toHaveBeenCalledWith(harness.getTasks());
    expect(harness.syncSharedTaskSummariesForTasks).toHaveBeenCalledWith(["task-1"]);
  });
});
