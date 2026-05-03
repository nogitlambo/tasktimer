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
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
    loadHistory: vi.fn(),
    appendHistoryEntry: vi.fn(),
    saveHistoryLocally: vi.fn(),
    saveHistory: vi.fn(),
    saveHistoryAndWait: vi.fn(),
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
      ARCHIE_NAVIGATE_EVENT: "tasktimer:archieNavigate",
    });
  });

  it("hydrates cache-backed stores through the workspace repository adapter", () => {
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
      loadCachedPreferences: vi.fn(() => cachedPreferences),
      loadCachedDashboard: vi.fn(() => cachedDashboard),
      loadCachedTaskUi: vi.fn(() => cachedTaskUi),
    });

    const composition = createTaskTimerRuntimeComposition("tasks", "taskticker_tasks_v1", {
      createRuntime: createRuntimeStub,
      createWorkspaceRepository: () => workspaceRepository,
    });

    expect(workspaceRepository.loadCachedPreferences).toHaveBeenCalledTimes(1);
    expect(workspaceRepository.loadCachedDashboard).toHaveBeenCalledTimes(1);
    expect(workspaceRepository.loadCachedTaskUi).toHaveBeenCalledTimes(1);
    expect(composition.stores.cacheRuntimeState.get("cloudPreferencesCache")).toBe(cachedPreferences);
    expect(composition.stores.cacheRuntimeState.get("cloudDashboardCache")).toBe(cachedDashboard);
    expect(composition.stores.cacheRuntimeState.get("cloudTaskUiCache")).toBe(cachedTaskUi);
    expect(composition.stores.rewardState.get("cloudPreferencesCache")).toBe(cachedPreferences);
  });
});
