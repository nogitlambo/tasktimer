import { describe, expect, it, vi } from "vitest";
import { buildDefaultUserPreferences, type DashboardConfig, type TaskUiConfig, type UserPreferencesV1 } from "../lib/cloudStore";
import { DEFAULT_REWARD_PROGRESS } from "../lib/rewards";
import type { TaskTimerWorkspaceRepository } from "../lib/workspaceRepository";
import { createTaskTimerRuntimeComposition } from "./runtime-composition";
import { createTaskTimerRuntime } from "./runtime";
import { createFocusSessionDrafts } from "./focus-session-drafts";

const createRuntimeStub = createTaskTimerRuntime;

function createWorkspaceRepositoryStub(overrides: Partial<TaskTimerWorkspaceRepository> = {}): TaskTimerWorkspaceRepository {
  return {
    buildDefaultPreferences: () => ({ rewards: DEFAULT_REWARD_PROGRESS }),
    loadWorkspaceSnapshot: vi.fn(() => ({
      tasks: [],
      historyByTaskId: {},
      cleanedHistoryByTaskId: {},
      historyWasCleaned: false,
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    })),
    loadTimerStateSnapshot: vi.fn(() => ({
      tasks: [],
      liveSessionsByTaskId: {},
    })),
    loadHistorySnapshot: vi.fn(() => ({ historyByTaskId: {}, cleanedHistoryByTaskId: {}, historyWasCleaned: false })),
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
    loadHistory: vi.fn(),
    loadLiveSessions: vi.fn(),
    hydrateFromCloud: vi.fn(),
    hydrateTimerStateFromCloud: vi.fn(),
    hasPendingTaskOrHistorySync: vi.fn(),
    hasPendingTaskOrLiveSessionSync: vi.fn(),
    subscribeTaskCollection: vi.fn(),
    subscribeTaskLiveSessions: vi.fn(),
    appendHistoryEntry: vi.fn(),
    saveHistoryLocally: vi.fn(),
    saveHistory: vi.fn(),
    saveHistoryAndWait: vi.fn(),
    saveLiveSession: vi.fn(),
    clearLiveSession: vi.fn(),
    refreshHistoryFromCloud: vi.fn(),
    cleanupHistory: vi.fn(),
    loadDeletedMeta: vi.fn(),
    saveDeletedMeta: vi.fn(),
    loadCachedPreferences: vi.fn(() => null),
    subscribeCachedPreferences: vi.fn(),
    savePreferences: vi.fn(),
    loadCachedDashboard: vi.fn(() => null),
    primeDashboardCacheFromShadow: vi.fn(),
    saveDashboard: vi.fn(),
    loadCachedTaskUi: vi.fn(() => null),
    saveTaskUi: vi.fn(),
    flushPendingCloudWrites: vi.fn(),
    waitForPendingTaskSync: vi.fn(),
    clearScopedState: vi.fn(),
    ...overrides,
  } as TaskTimerWorkspaceRepository;
}

describe("createTaskTimerRuntimeComposition", () => {
  it("composes one Focus session drafts instance over runtime state and the supplied view", () => {
    const persisted: Record<string, string>[] = [];
    let inputValue = "live input";
    let sectionOpen = false;
    const draftStorageKeys: string[] = [];
    const createFocusSessionDraftsFactory = vi.fn(createFocusSessionDrafts);
    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => createWorkspaceRepositoryStub(),
      createFocusSessionDrafts: createFocusSessionDraftsFactory,
      createFocusSessionDraftStorage: (storageKey) => {
        draftStorageKeys.push(storageKey);
        return {
          load: () => ({ "task-1": "loaded draft" }),
          persist: (drafts) => persisted.push(drafts),
        };
      },
      focusSessionDraftView: {
        getInputValue: () => inputValue,
        setInputValue: (value) => {
          inputValue = value;
        },
        setSectionOpen: (open) => {
          sectionOpen = open;
        },
      },
    });

    expect(createFocusSessionDraftsFactory).toHaveBeenCalledTimes(1);
    expect(draftStorageKeys).toEqual(["taskticker_tasks_v1:focusSessionNotes"]);
    expect(composition.focusSessionDrafts).toBe(createFocusSessionDraftsFactory.mock.results[0]?.value);

    composition.focusSessionDrafts.load();
    expect(composition.stores.focusState.get("focusSessionNotesByTaskId")).toEqual({ "task-1": "loaded draft" });

    composition.stores.focusState.set("focusModeTaskId", "task-1");
    composition.focusSessionDrafts.syncActive();
    expect(inputValue).toBe("loaded draft");
    expect(sectionOpen).toBe(true);

    composition.focusSessionDrafts.setDraft("task-1", "updated draft");
    expect(persisted.at(-1)).toEqual({ "task-1": "updated draft" });
  });

  it("creates the runtime composition without touching default adapters when factories are injected", () => {
    const runtime = createRuntimeStub();
    const workspaceRepository = createWorkspaceRepositoryStub();

    const composition = createTaskTimerRuntimeComposition("dashboard", "taskticker_tasks_v1", {
      createRuntime: () => runtime,
      createWorkspaceRepository: () => workspaceRepository,
    });

    expect(composition.runtime).toBe(runtime);
    expect(composition.workspaceRepository).toBe(workspaceRepository);
    expect(composition.stores.appRuntimeState.get("currentAppPage")).toBe("dashboard");
    expect(composition.stores.scheduleState.get("selectedDay")).toBe("mon");
    expect(composition.stores.cloudSyncState.get("deferredCloudRefreshTimer")).toBeNull();
  });

  it("exposes focused workspace domain adapters for feature modules", () => {
    const cachedPreferences = buildDefaultUserPreferences(10);
    const historySnapshot = {
      historyByTaskId: { "task-1": [{ ts: 1, name: "Focus", ms: 0 }] },
      cleanedHistoryByTaskId: { "task-1": [] },
      historyWasCleaned: true,
    };
    const workspaceRepository = createWorkspaceRepositoryStub({
      loadHistorySnapshot: vi.fn(() => historySnapshot),
      saveHistory: vi.fn(),
      loadCachedPreferences: vi.fn(() => cachedPreferences),
      savePreferences: vi.fn(),
    });

    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => workspaceRepository,
    });

    expect(composition.workspaceAdapters.historyPersistence.loadSnapshot()).toBe(historySnapshot);
    composition.workspaceAdapters.historyPersistence.saveCleanedSnapshot(historySnapshot);
    expect(workspaceRepository.saveHistory).toHaveBeenCalledWith(historySnapshot.cleanedHistoryByTaskId, { showIndicator: false });

    expect(composition.workspaceAdapters.preferencesPersistence.loadResolved()).toEqual(cachedPreferences);
    const updatedPreferences = composition.workspaceAdapters.preferencesPersistence.update({ taskOrderBy: "alpha" });
    expect(updatedPreferences).toEqual(expect.objectContaining({ taskOrderBy: "alpha", updatedAtMs: expect.any(Number) }));
    expect(workspaceRepository.savePreferences).toHaveBeenCalledWith(updatedPreferences);
  });

  it("derives storage keys and event names in one testable module", () => {
    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => createWorkspaceRepositoryStub(),
    });

    expect(composition.storageKeys.NAV_STACK_KEY).toBe("taskticker_tasks_v1:navStack");
    expect(composition.derivedKeys).toEqual({
      TIME_GOAL_PENDING_FLOW_KEY: "taskticker_tasks_v1:timeGoalPendingFlow",
      TIME_GOAL_PENDING_COMPLETIONS_KEY: "taskticker_tasks_v1:pendingTimeGoalCompletions",
      TIME_GOAL_COMPLETION_ACK_KEY: "taskticker_tasks_v1:timeGoalCompletionAck",
      PENDING_PUSH_TASK_ID_KEY: "taskticker_tasks_v1:pendingPushTaskId",
      PENDING_PUSH_ACTION_KEY: "taskticker_tasks_v1:pendingPushAction",
      REWARD_SESSION_TRACKERS_KEY: "taskticker_tasks_v1:rewardSessionTrackers",
    });
    expect(composition.events).toEqual({
      PENDING_PUSH_TASK_EVENT: "tasktimer:pendingTaskJump",
    });
  });

  it("hydrates preferences through the canonical adapter and other caches through the workspace snapshot", () => {
    const cachedPreferences = {
      schemaVersion: 1,
      theme: "lime",
      weekStarting: "mon",
      startupModule: "dashboard",
      taskView: "tile",
      taskOrderBy: "custom",
      dynamicColorsEnabled: true,
      fullColorTaskCardsEnabled: false,
      executiveFunctionEnabled: true,
      autoFocusOnTaskLaunchEnabled: false,
      timeGoalCompleteNextTasksEnabled: false,
      dashboardPreviousWeekVisible: true,
      mobilePushAlertsEnabled: false,
      webPushAlertsEnabled: false,
      interactionClickSoundEnabled: true,
      achievementSoundsEnabled: true,
      interactionHapticsEnabled: true,
      interactionHapticsIntensity: "max",
      checkpointAlertSoundEnabled: true,
      checkpointAlertVibrationEnabled: true,
      checkpointAlertFlashEnabled: true,
      checkpointAlertSoundMode: "once",
      optimalProductivityStartTime: "00:00",
      optimalProductivityEndTime: "23:59",
      optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      rewards: { ...DEFAULT_REWARD_PROGRESS, totalXp: 42, totalXpPrecise: 42, currentRankId: "initiate" },
      updatedAtMs: 1,
    } satisfies UserPreferencesV1;
    const cachedDashboard = { order: ["momentum"] } satisfies DashboardConfig;
    const cachedTaskUi = {
      historyRangeDaysByTaskId: {},
      historyRangeModeByTaskId: {},
      pinnedHistoryTaskIds: ["task-1"],
    } satisfies TaskUiConfig;
    const workspaceRepository = createWorkspaceRepositoryStub({
      loadCachedPreferences: vi.fn(() => cachedPreferences),
      loadWorkspaceSnapshot: vi.fn(() => ({
        tasks: [],
        historyByTaskId: {},
        cleanedHistoryByTaskId: {},
        historyWasCleaned: false,
        liveSessionsByTaskId: {},
        deletedTaskMeta: {},
        preferences: cachedPreferences,
        dashboard: cachedDashboard,
        taskUi: cachedTaskUi,
      })),
    });

    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => workspaceRepository,
    });

    expect(workspaceRepository.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(workspaceRepository.loadCachedPreferences).toHaveBeenCalled();
    expect(composition.stores.cacheRuntimeState.get("cloudPreferencesCache")).toMatchObject({
      ...cachedPreferences,
      rewards: expect.objectContaining({
        totalXp: 42,
        totalXpPrecise: 42,
        currentRankId: "initiate",
      }),
    });
    expect(composition.stores.cacheRuntimeState.get("cloudDashboardCache")).toBe(cachedDashboard);
    expect(composition.stores.cacheRuntimeState.get("cloudTaskUiCache")).toBe(cachedTaskUi);
    expect(composition.stores.rewardState.get("cloudPreferencesCache")).toMatchObject({
      ...cachedPreferences,
      rewards: expect.objectContaining({
        totalXp: 42,
        totalXpPrecise: 42,
        currentRankId: "initiate",
      }),
    });
  });
});
