import { describe, expect, it, vi } from "vitest";
import type { DashboardConfig, TaskUiConfig, UserPreferencesV1 } from "../lib/cloudStore";
import { DEFAULT_REWARD_PROGRESS } from "../lib/rewards";
import type { TaskTimerWorkspaceRepository } from "../lib/workspaceRepository";
import { createTaskTimerRuntimeComposition } from "./runtime-composition";
import { createTaskTimerRuntime } from "./runtime";

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
    loadHistorySnapshot: vi.fn(() => ({ historyByTaskId: {}, cleanedHistoryByTaskId: {}, historyWasCleaned: false })),
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
    loadHistory: vi.fn(),
    loadLiveSessions: vi.fn(),
    hydrateFromCloud: vi.fn(),
    hasPendingTaskOrHistorySync: vi.fn(),
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
    waitForPendingTaskSync: vi.fn(),
    clearScopedState: vi.fn(),
    ...overrides,
  } as TaskTimerWorkspaceRepository;
}

describe("createTaskTimerRuntimeComposition", () => {
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
    const historySnapshot = {
      historyByTaskId: { "task-1": [{ ts: 1, name: "Focus", ms: 0 }] },
      cleanedHistoryByTaskId: { "task-1": [] },
      historyWasCleaned: true,
    };
    const workspaceRepository = createWorkspaceRepositoryStub({
      loadHistorySnapshot: vi.fn(() => historySnapshot),
      saveHistory: vi.fn(),
    });

    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => workspaceRepository,
    });

    expect(composition.workspaceAdapters.historyPersistence.loadSnapshot()).toBe(historySnapshot);
    composition.workspaceAdapters.historyPersistence.saveCleanedSnapshot(historySnapshot);
    expect(workspaceRepository.saveHistory).toHaveBeenCalledWith(historySnapshot.cleanedHistoryByTaskId, { showIndicator: false });
  });

  it("derives storage keys and event names in one testable module", () => {
    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => createWorkspaceRepositoryStub(),
    });

    expect(composition.storageKeys.NAV_STACK_KEY).toBe("taskticker_tasks_v1:navStack");
    expect(composition.derivedKeys).toEqual({
      TIME_GOAL_PENDING_FLOW_KEY: "taskticker_tasks_v1:timeGoalPendingFlow",
      PENDING_PUSH_TASK_ID_KEY: "taskticker_tasks_v1:pendingPushTaskId",
      PENDING_PUSH_ACTION_KEY: "taskticker_tasks_v1:pendingPushAction",
      REWARD_SESSION_TRACKERS_KEY: "taskticker_tasks_v1:rewardSessionTrackers",
    });
    expect(composition.events).toEqual({
      PENDING_PUSH_TASK_EVENT: "tasktimer:pendingTaskJump",
    });
  });

  it("hydrates cache-backed stores through the workspace snapshot adapter", () => {
    const cachedPreferences = {
      schemaVersion: 1,
      theme: "lime",
      menuButtonStyle: "square",
      startupModule: "dashboard",
      taskView: "tile",
      taskOrderBy: "custom",
      dynamicColorsEnabled: true,
      autoFocusOnTaskLaunchEnabled: false,
      mobilePushAlertsEnabled: false,
      webPushAlertsEnabled: false,
      checkpointAlertSoundEnabled: true,
      checkpointAlertToastEnabled: true,
      checkpointAlertSoundMode: "once",
      checkpointAlertToastMode: "auto5s",
      optimalProductivityStartTime: "00:00",
      optimalProductivityEndTime: "23:59",
      rewards: { ...DEFAULT_REWARD_PROGRESS, totalXp: 42, totalXpPrecise: 42 },
      updatedAtMs: 1,
    } satisfies UserPreferencesV1;
    const cachedDashboard = { order: ["momentum"] } satisfies DashboardConfig;
    const cachedTaskUi = {
      historyRangeDaysByTaskId: {},
      historyRangeModeByTaskId: {},
      pinnedHistoryTaskIds: ["task-1"],
    } satisfies TaskUiConfig;
    const workspaceRepository = createWorkspaceRepositoryStub({
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
    expect(composition.stores.cacheRuntimeState.get("cloudPreferencesCache")).toBe(cachedPreferences);
    expect(composition.stores.cacheRuntimeState.get("cloudDashboardCache")).toBe(cachedDashboard);
    expect(composition.stores.cacheRuntimeState.get("cloudTaskUiCache")).toBe(cachedTaskUi);
    expect(composition.stores.rewardState.get("cloudPreferencesCache")).toBe(cachedPreferences);
  });
});
