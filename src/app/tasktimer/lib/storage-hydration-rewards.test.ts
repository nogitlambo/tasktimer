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
  ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS,
  appendHistoryEntry,
  hydrateStorageFromCloud,
  flushPendingCloudWrites,
  loadCachedPreferences,
  saveCloudDashboard,
  saveCloudTaskUi,
  saveHistory,
  saveHistoryLocally,
  saveLiveSession,
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

  it("stores signed-out task changes under the guest shadow scope", () => {
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    const guestTask = task("guest-task-1", "Guest Focus");

    saveTasks([guestTask]);

    const raw = localStorage.getItem("taskticker_tasks_v1:shadow:tasks");
    expect(raw).toBeTruthy();
    expect(JSON.parse(String(raw))).toMatchObject({
      uid: "__guest__",
      data: [expect.objectContaining({ id: "guest-task-1", name: "Guest Focus" })],
    });
    expect(cloudStoreMocks.saveTask).not.toHaveBeenCalled();
  });

  it("uploads guest tasks when a new empty cloud account hydrates", async () => {
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    const guestTask = task("guest-task-1", "Guest Focus");
    saveTasks([guestTask]);

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    });
    cloudStoreMocks.saveTask.mockClear();
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });

    await hydrateStorageFromCloud({ force: true });

    await vi.waitFor(() => {
      expect(cloudStoreMocks.saveTask).toHaveBeenCalledWith("uid-1", expect.objectContaining({ id: "guest-task-1" }));
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

  it("keeps a direct completed-session append in a delayed queued history replacement", async () => {
    const row1 = { ts: Date.parse("2026-05-05T09:00:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS };
    const row2 = { ts: Date.parse("2026-05-05T09:10:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS };
    const completedRow = {
      ts: Date.parse("2026-05-05T09:20:00.000Z"),
      name: "Focus",
      ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
      sessionId: "session-1",
    };

    saveHistory({ "task-1": [row1] }, { forceCloudFlush: true });
    await vi.waitFor(() => {
      expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledTimes(1);
    });
    cloudStoreMocks.replaceTaskHistory.mockClear();

    vi.advanceTimersByTime(1_000);
    saveHistory({ "task-1": [row1, row2] });
    appendHistoryEntry("task-1", completedRow);
    await vi.advanceTimersByTimeAsync(ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS);

    await vi.waitFor(() => {
      expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledTimes(1);
    });
    expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledWith(
      "uid-1",
      "task-1",
      [row1, row2, completedRow],
      { allowDestructiveReplace: false }
    );
  });

  it("flushes queued leaderboard profile generation with pending cloud writes", async () => {
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [task("task-1", "Focus")],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: { ...buildDefaultCloudPreferences(), updatedAtMs: Date.now() },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });
    leaderboardMocks.saveLeaderboardProfile.mockClear();

    saveHistoryLocally({
      "task-1": [{ ts: Date.parse("2026-05-05T09:00:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
    });
    await flushPendingCloudWrites();

    expect(leaderboardMocks.saveLeaderboardProfile).toHaveBeenCalledWith("uid-1", expect.any(Object));
  });

  it("throttles queued task retries after a failed cloud write", async () => {
    cloudStoreMocks.saveTask.mockRejectedValueOnce(new Error("resource exhausted"));
    const nextTask = { ...task("task-1", "Focus"), name: "Deep Focus" };

    saveTasks([nextTask], { forceCloudFlush: true });

    expect(cloudStoreMocks.saveTask).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cloudStoreMocks.saveTask).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS - 1_000);
    await vi.waitFor(() => {
      expect(cloudStoreMocks.saveTask).toHaveBeenCalledTimes(2);
    });
  });

  it("throttles queued history retries after a failed cloud write", async () => {
    const row = { ts: Date.parse("2026-05-05T09:00:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS };
    cloudStoreMocks.replaceTaskHistory.mockRejectedValueOnce(new Error("resource exhausted"));

    saveHistory({ "task-1": [row] }, { forceCloudFlush: true });

    expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS - 1_000);
    await vi.waitFor(() => {
      expect(cloudStoreMocks.replaceTaskHistory).toHaveBeenCalledTimes(2);
    });
  });

  it("throttles queued live-session retries after a failed cloud write", async () => {
    cloudStoreMocks.saveLiveSession.mockRejectedValueOnce(new Error("resource exhausted"));

    saveLiveSession(
      {
        sessionId: "session-1",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: Date.parse("2026-05-05T09:00:00.000Z"),
        elapsedMs: 1_000,
        updatedAtMs: Date.parse("2026-05-05T09:00:01.000Z"),
        status: "running",
      },
      { forceCloudFlush: true }
    );

    expect(cloudStoreMocks.saveLiveSession).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cloudStoreMocks.saveLiveSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS - 1_000);
    await vi.waitFor(() => {
      expect(cloudStoreMocks.saveLiveSession).toHaveBeenCalledTimes(2);
    });
  });

});
