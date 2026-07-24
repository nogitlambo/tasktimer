import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
import { normalizeRewardProgress } from "../lib/rewards";
import { createTaskTimerPersistence } from "./persistence";
import { loadPendingTimeGoalCompletions } from "./pending-time-goal-completions";

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
  const localStorageValues = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => localStorageValues.get(key) || null,
      setItem: (key: string, value: string) => {
        localStorageValues.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageValues.delete(key);
      },
    },
  });
  let tasks: Task[] = [];
  let history: HistoryByTaskId = {};
  let liveSessions: LiveSessionsByTaskId = initialLiveSessions;
  let rewardProgress = normalizeRewardProgress({ totalXp: 10, totalXpPrecise: 10, completedSessions: 1 });
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
    rewardProgress = normalizeRewardProgress({
      ...rewardProgress,
      totalXp: 40,
      totalXpPrecise: 40,
      completedSessions: 2,
    });
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
    pendingTimeGoalCompletionsKey: "test:pending-completions",
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
    loadTimeGoalCompleteNextTasksSetting: () => {},
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
    getRewardProgress: () => rewardProgress,
    normalizeLoadedTask: () => {},
    nowMs: () => nowValue,
  });
  return {
    api,
    getTasks: () => tasks,
    getHistory: () => history,
    getLiveSessions: () => liveSessions,
    getPendingCompletions: () => loadPendingTimeGoalCompletions("test:pending-completions"),
    saveTasks,
    finalizeLiveSession,
    syncSharedTaskSummariesForTasks,
  };
}

describe("task timer persistence resume-pending cleanup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    const completedAtMs = startedAtMs + 60 * 60_000;
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
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60_000,
    });
    expect(harness.getHistory()["task-1"]).toEqual([
      {
        ts: completedAtMs,
        name: "Focus",
        ms: 60 * 60_000,
        note: "closed app note",
        sessionId: "session-1",
      },
    ]);
    expect(harness.getLiveSessions()).toEqual({});
    expect(harness.finalizeLiveSession).toHaveBeenCalledWith(harness.getTasks()[0], {
      elapsedMs: 60 * 60_000,
      completedAtMs,
    });
    expect(harness.getPendingCompletions()).toEqual([{
      taskId: "task-1",
      periodKey: "2026-05-02",
      completedAtMs,
      elapsedMs: 60 * 60_000,
      awardPreview: {
        fromXp: 10,
        toXp: 40,
        awardedXp: 30,
      },
    }]);
    expect(harness.saveTasks).toHaveBeenCalledWith(harness.getTasks());
    expect(harness.syncSharedTaskSummariesForTasks).toHaveBeenCalledWith(["task-1"]);
  });

  it("finalizes a 10-minute closed-app daily goal with a goal-length history row", () => {
    const startedAtMs = new Date(2026, 4, 2, 9, 0, 0).getTime();
    const updatedAtMs = startedAtMs + 7 * 60_000;
    const nowValue = startedAtMs + 15 * 60_000;
    const goalMs = 10 * 60_000;
    const completedAtMs = startedAtMs + goalMs;
    const harness = createHarness(
      [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 10,
        }),
      ],
      nowValue,
      {
        "task-1": {
          sessionId: "session-10m",
          taskId: "task-1",
          name: "Focus",
          startedAtMs,
          updatedAtMs,
          elapsedMs: 7 * 60_000,
          status: "running",
        },
      }
    );

    harness.api.load();

    expect(harness.getTasks()[0]).toMatchObject({
      accumulatedMs: goalMs,
      running: false,
      startMs: null,
      timeGoalCompletedDayKey: "2026-05-02",
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: goalMs,
    });
    expect(harness.getHistory()["task-1"]).toEqual([
      {
        ts: completedAtMs,
        name: "Focus",
        ms: goalMs,
        sessionId: "session-10m",
      },
    ]);
    expect(harness.finalizeLiveSession).toHaveBeenCalledWith(harness.getTasks()[0], {
      elapsedMs: goalMs,
      completedAtMs,
    });
  });
});
