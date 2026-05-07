import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getFirebaseAuthClient: vi.fn(() => ({ currentUser: { uid: "uid-1" } })),
}));

const cloudStoreMocks = vi.hoisted(() => ({
  loadUserWorkspace: vi.fn(),
  savePreferences: vi.fn(() => Promise.resolve()),
  ensureUserProfileIndex: vi.fn(() => Promise.resolve()),
  loadDashboard: vi.fn(() => Promise.resolve(null)),
  loadPreferences: vi.fn(() => Promise.resolve(null)),
  loadTaskUi: vi.fn(() => Promise.resolve(null)),
  replaceTaskHistory: vi.fn(() => Promise.resolve()),
  saveDashboard: vi.fn(() => Promise.resolve()),
  saveTaskUi: vi.fn(() => Promise.resolve()),
  saveDeletedTaskMeta: vi.fn(() => Promise.resolve()),
  saveTask: vi.fn(() => Promise.resolve()),
  subscribeToTaskCollection: vi.fn(() => vi.fn()),
  subscribeToTaskLiveSessionDocs: vi.fn(() => vi.fn()),
  appendHistoryEntry: vi.fn(() => Promise.resolve()),
  clearLiveSession: vi.fn(() => Promise.resolve()),
  deleteDeletedTaskMeta: vi.fn(() => Promise.resolve()),
  deleteTask: vi.fn(() => Promise.resolve()),
  getTask: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  loadUserProfile: vi.fn(),
  saveLiveSession: vi.fn(() => Promise.resolve()),
}));

const leaderboardMocks = vi.hoisted(() => ({
  buildLeaderboardMetricsSnapshot: vi.fn(() => ({})),
  saveLeaderboardProfile: vi.fn(() => Promise.resolve()),
}));

const planMocks = vi.hoisted(() => ({
  syncCurrentUserPlanCache: vi.fn(() => Promise.resolve()),
}));

const entitlementMocks = vi.hoisted(() => ({
  clearTaskTimerPlanStorage: vi.fn(),
  hasTaskTimerEntitlement: vi.fn(() => false),
  writeTaskTimerPlanToStorage: vi.fn(),
}));

vi.mock("@/lib/firebaseClient", () => authMocks);
vi.mock("./cloudStore", () => ({
  ensureUserProfileIndex: cloudStoreMocks.ensureUserProfileIndex,
  appendHistoryEntry: cloudStoreMocks.appendHistoryEntry,
  buildDefaultCloudPreferences: vi.fn(),
  clearLiveSession: cloudStoreMocks.clearLiveSession,
  deleteDeletedTaskMeta: cloudStoreMocks.deleteDeletedTaskMeta,
  deleteTask: cloudStoreMocks.deleteTask,
  loadDashboard: cloudStoreMocks.loadDashboard,
  loadPreferences: cloudStoreMocks.loadPreferences,
  loadTaskUi: cloudStoreMocks.loadTaskUi,
  loadUserWorkspace: cloudStoreMocks.loadUserWorkspace,
  replaceTaskHistory: cloudStoreMocks.replaceTaskHistory,
  saveDashboard: cloudStoreMocks.saveDashboard,
  saveDeletedTaskMeta: cloudStoreMocks.saveDeletedTaskMeta,
  saveLiveSession: cloudStoreMocks.saveLiveSession,
  savePreferences: cloudStoreMocks.savePreferences,
  saveTask: cloudStoreMocks.saveTask,
  saveTaskUi: cloudStoreMocks.saveTaskUi,
  subscribeToTaskCollection: cloudStoreMocks.subscribeToTaskCollection,
  subscribeToTaskLiveSessionDocs: cloudStoreMocks.subscribeToTaskLiveSessionDocs,
}));
vi.mock("./leaderboard", () => leaderboardMocks);
vi.mock("./planFunctions", () => planMocks);
vi.mock("./entitlements", () => entitlementMocks);

import { DEFAULT_REWARD_PROGRESS, MIN_REWARD_ELIGIBLE_SESSION_MS, rebuildRewardProgressFromHistory } from "./rewards";
import {
  buildDefaultCloudPreferences,
  clearScopedStorageState,
  hydrateStorageFromCloud,
  loadCachedPreferences,
  saveCloudDashboard,
  saveCloudTaskUi,
  saveTasks,
} from "./storage";

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }

  removeItem(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

function task(id: string, name: string) {
  return {
    id,
    name,
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
  };
}

describe("hydrateStorageFromCloud reward reconciliation", () => {
  const localStorage = new MemoryStorage();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));
    localStorage.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        dispatchEvent: vi.fn(),
        setTimeout,
        clearTimeout,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "CustomEvent", {
      value: class CustomEvent {
        constructor(_type: string, public init?: unknown) {}
      },
      configurable: true,
      writable: true,
    });
    cloudStoreMocks.loadUserWorkspace.mockReset();
    cloudStoreMocks.savePreferences.mockClear();
    leaderboardMocks.buildLeaderboardMetricsSnapshot.mockClear();
    leaderboardMocks.saveLeaderboardProfile.mockClear();
    clearScopedStorageState();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    clearScopedStorageState();
    vi.clearAllMocks();
  });

  it("preserves earned XP when a deleted task's history is gone during hydration", async () => {
    const currentRewards = rebuildRewardProgressFromHistory({
      historyByTaskId: {
        "task-1": [{ ts: Date.parse("2026-05-05T09:50:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      tasks: [task("task-1", "Focus")],
      weekStarting: "mon",
      momentumEntitled: false,
    });
    const currentPrefs = { ...buildDefaultCloudPreferences(), rewards: currentRewards, updatedAtMs: Date.now() };

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: currentPrefs,
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()?.rewards.totalXp).toBe(1);
    expect(loadCachedPreferences()?.rewards.awardLedger).toEqual(currentRewards.awardLedger);
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();
  });

  it("preserves earned XP when history is globally wiped during hydration", async () => {
    const currentRewards = rebuildRewardProgressFromHistory({
      historyByTaskId: {
        "task-1": [{ ts: Date.parse("2026-05-05T09:50:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      tasks: [task("task-1", "Focus")],
      weekStarting: "mon",
      momentumEntitled: false,
    });
    const currentPrefs = { ...buildDefaultCloudPreferences(), rewards: currentRewards, updatedAtMs: Date.now() };

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [task("task-1", "Focus")],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: currentPrefs,
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()?.rewards.totalXp).toBe(1);
    expect(loadCachedPreferences()?.rewards.completedSessions).toBe(1);
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();
  });

  it("backfills rewards from history when stored rewards are missing", async () => {
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [task("task-1", "Focus")],
      historyByTaskId: {
        "task-1": [{ ts: Date.parse("2026-05-05T09:50:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: { ...buildDefaultCloudPreferences(), rewards: DEFAULT_REWARD_PROGRESS, updatedAtMs: Date.now() },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()?.rewards.totalXp).toBe(1);
    expect(loadCachedPreferences()?.rewards.completedSessions).toBe(1);
    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(1);
  });

  it("replays a pending task delete to cloud after auth returns", async () => {
    const deletedTask = task("task-1", "Focus");
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [deletedTask],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });
    cloudStoreMocks.deleteTask.mockClear();

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    saveTasks([deletedTask]);
    saveTasks([], { deletedTaskIds: ["task-1"] });

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });
    await hydrateStorageFromCloud({ force: true });

    await vi.waitFor(() => {
      expect(cloudStoreMocks.deleteTask).toHaveBeenCalledWith("uid-1", "task-1");
    });
  });

  it("skips cloud task writes when task signatures are unchanged", async () => {
    const existingTask = task("task-1", "Focus");

    saveTasks([existingTask], { forceCloudFlush: true });
    await vi.waitFor(() => {
      expect(cloudStoreMocks.saveTask).toHaveBeenCalledTimes(1);
    });

    cloudStoreMocks.saveTask.mockClear();
    saveTasks([existingTask], { forceCloudFlush: true });
    await vi.runAllTimersAsync();

    expect(cloudStoreMocks.saveTask).not.toHaveBeenCalled();
  });

  it("deduplicates direct dashboard and task-ui writes by payload signature", async () => {
    const dashboard = {
      avgRange: 7,
      cardPlacements: {},
      cardSizes: {},
      cardVisibility: {},
      editMode: false,
      timelineDensity: "comfortable",
    };
    const taskUi = {
      historyRangeDaysByTaskId: { "task-1": 7 },
      historyRangeModeByTaskId: { "task-1": "entries" },
      pinnedHistoryTaskIds: ["task-1"],
      customTaskNames: ["Focus"],
    };

    saveCloudDashboard(dashboard as never);
    saveCloudDashboard(dashboard as never);
    saveCloudTaskUi(taskUi as never);
    saveCloudTaskUi(taskUi as never);
    await vi.runAllTimersAsync();

    expect(cloudStoreMocks.saveDashboard).toHaveBeenCalledTimes(1);
    expect(cloudStoreMocks.saveTaskUi).toHaveBeenCalledTimes(1);
  });

});
