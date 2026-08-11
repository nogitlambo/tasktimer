import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REWARD_PROGRESS } from "./rewards";
import type { UserPreferencesV1, WorkspaceSnapshot } from "./cloudStore";

const authState = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; isAnonymous?: boolean },
}));

const cloudStoreMocks = vi.hoisted(() => ({
  loadUserWorkspace: vi.fn(),
  savePreferences: vi.fn(async () => {}),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => ({ currentUser: authState.currentUser }),
}));

vi.mock("./planFunctions", () => ({
  syncCurrentUserPlanCache: vi.fn(async () => {}),
}));

vi.mock("./entitlements", () => ({
  clearTaskTimerPlanStorage: vi.fn(),
  hasTaskTimerEntitlement: vi.fn(() => true),
  writeTaskTimerPlanToStorage: vi.fn(),
}));

vi.mock("./cloudStore", () => {
  const normalizeBool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const defaultRewards = {
    schemaVersion: 1,
    totalXp: 0,
    completedSessions: 0,
    currentRankId: "seed",
    claimedLevelIds: [],
    dailyRewards: {},
  };
  const normalizePreferences = (data: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    theme: "lime",
    weekStarting: typeof data.weekStarting === "string" ? data.weekStarting : "mon",
    startupModule: typeof data.startupModule === "string" ? data.startupModule : "dashboard",
    taskView: "tile",
    taskOrderBy: typeof data.taskOrderBy === "string" ? data.taskOrderBy : "custom",
    dynamicColorsEnabled: normalizeBool(data.dynamicColorsEnabled, true),
    fullColorTaskCardsEnabled: normalizeBool(data.fullColorTaskCardsEnabled, false),
    executiveFunctionEnabled: normalizeBool(data.executiveFunctionEnabled, true),
    autoFocusOnTaskLaunchEnabled: normalizeBool(data.autoFocusOnTaskLaunchEnabled, false),
    timeGoalCompleteNextTasksEnabled: normalizeBool(data.timeGoalCompleteNextTasksEnabled, false),
    dashboardPreviousWeekVisible: normalizeBool(data.dashboardPreviousWeekVisible, true),
    mobilePushAlertsEnabled: normalizeBool(data.mobilePushAlertsEnabled, false),
    webPushAlertsEnabled: normalizeBool(data.webPushAlertsEnabled, false),
    interactionClickSoundEnabled: normalizeBool(data.interactionClickSoundEnabled, true),
    achievementSoundsEnabled: normalizeBool(data.achievementSoundsEnabled, true),
    interactionHapticsEnabled: normalizeBool(data.interactionHapticsEnabled, true),
    interactionHapticsIntensity: "max",
    checkpointAlertSoundEnabled: normalizeBool(data.checkpointAlertSoundEnabled, true),
    checkpointAlertVibrationEnabled: normalizeBool(data.checkpointAlertVibrationEnabled, true),
    checkpointAlertFlashEnabled: normalizeBool(data.checkpointAlertFlashEnabled, true),
    checkpointAlertSoundMode: data.checkpointAlertSoundMode === "repeat" ? "repeat" : "once",
    optimalProductivityStartTime: typeof data.optimalProductivityStartTime === "string" ? data.optimalProductivityStartTime : "00:00",
    optimalProductivityEndTime: typeof data.optimalProductivityEndTime === "string" ? data.optimalProductivityEndTime : "23:59",
    optimalProductivityDays: Array.isArray(data.optimalProductivityDays)
      ? data.optimalProductivityDays
      : ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
    rewards: data.rewards || defaultRewards,
    updatedAtMs: Math.max(0, Math.floor(Number(data.updatedAtMs || 0))),
  });

  return {
    appendHistoryEntry: vi.fn(async () => {}),
    buildDefaultUserPreferences: vi.fn((updatedAtMs = Date.now()) => normalizePreferences({ updatedAtMs })),
    deleteDeletedTaskMeta: vi.fn(async () => {}),
    deleteTask: vi.fn(async () => {}),
    ensureUserProfileIndex: vi.fn(async () => {}),
    finalizeLiveSessionHistory: vi.fn(async () => {}),
    loadDashboard: vi.fn(async () => null),
    loadPreferences: vi.fn(async () => null),
    loadTaskUi: vi.fn(async () => null),
    loadUserTimerState: vi.fn(async () => ({ tasks: [], liveSessionsByTaskId: {} })),
    loadUserWorkspace: cloudStoreMocks.loadUserWorkspace,
    normalizeUserPreferencesDocument: vi.fn((data: Record<string, unknown>) => normalizePreferences(data)),
    replaceTaskHistory: vi.fn(async () => {}),
    saveDashboard: vi.fn(async () => {}),
    saveDeletedTaskMeta: vi.fn(async () => {}),
    saveLiveSession: vi.fn(async () => {}),
    savePreferences: cloudStoreMocks.savePreferences,
    saveTask: vi.fn(async () => {}),
    saveTaskUi: vi.fn(async () => {}),
    subscribeToTaskCollection: vi.fn(() => () => {}),
    subscribeToTaskLiveSessionDocs: vi.fn(() => () => {}),
  };
});

function createStorageStub() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    get: (key: string) => values.get(key),
  };
}

function buildPreferences(overrides: Partial<UserPreferencesV1> = {}): UserPreferencesV1 {
  return {
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
    rewards: DEFAULT_REWARD_PROGRESS,
    updatedAtMs: 1,
    ...overrides,
  };
}

function buildWorkspace(preferences: UserPreferencesV1): WorkspaceSnapshot {
  return {
    plan: "plus",
    tasks: [],
    historyByTaskId: {},
    liveSessionsByTaskId: {},
    deletedTaskMeta: {},
    preferences,
    dashboard: null,
    taskUi: null,
  };
}

describe("storage preference sign-out fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      localStorage: createStorageStub(),
      sessionStorage: createStorageStub(),
      setTimeout: vi.fn((handler: () => void) => {
        handler();
        return 1;
      }),
      clearTimeout: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => null),
    });
    authState.currentUser = { uid: "uid-1" };
  });

  it("replays a disabled Executive Function preference after sign-out clears scoped state", async () => {
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue(buildWorkspace(buildPreferences({ executiveFunctionEnabled: true, updatedAtMs: 1 })));
    const storage = await import("./storage");

    storage.saveCloudPreferences(buildPreferences({ executiveFunctionEnabled: false, updatedAtMs: 100 }));
    storage.clearScopedStorageState();

    authState.currentUser = { uid: "uid-1" };
    await storage.hydrateStorageFromCloud({ force: true });
    await Promise.resolve();

    expect(storage.loadCachedPreferences()?.executiveFunctionEnabled).toBe(false);
    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({ executiveFunctionEnabled: false })
    );
  });
});
