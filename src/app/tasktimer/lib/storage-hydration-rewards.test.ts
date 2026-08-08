import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getFirebaseAuthClient: vi.fn(() => ({ currentUser: { uid: "uid-1" } })),
}));

const cloudStoreMocks = vi.hoisted(() => ({
  loadUserWorkspace: vi.fn(),
  loadUserTimerState: vi.fn(),
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
  finalizeLiveSessionHistory: vi.fn(() => Promise.resolve()),
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
  getWeeklyLeaderboardUtcPeriod: vi.fn(() => ({ startMs: 1_770_000_000_000, endMs: 1_770_604_799_999 })),
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
vi.mock("./cloudStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloudStore")>();
  return {
    ...actual,
    ensureUserProfileIndex: cloudStoreMocks.ensureUserProfileIndex,
    appendHistoryEntry: cloudStoreMocks.appendHistoryEntry,
    clearLiveSession: cloudStoreMocks.clearLiveSession,
    finalizeLiveSessionHistory: cloudStoreMocks.finalizeLiveSessionHistory,
    deleteDeletedTaskMeta: cloudStoreMocks.deleteDeletedTaskMeta,
    deleteTask: cloudStoreMocks.deleteTask,
    loadDashboard: cloudStoreMocks.loadDashboard,
    loadPreferences: cloudStoreMocks.loadPreferences,
    loadTaskUi: cloudStoreMocks.loadTaskUi,
    loadUserWorkspace: cloudStoreMocks.loadUserWorkspace,
    loadUserTimerState: cloudStoreMocks.loadUserTimerState,
    replaceTaskHistory: cloudStoreMocks.replaceTaskHistory,
    saveDashboard: cloudStoreMocks.saveDashboard,
    saveDeletedTaskMeta: cloudStoreMocks.saveDeletedTaskMeta,
    saveLiveSession: cloudStoreMocks.saveLiveSession,
    savePreferences: cloudStoreMocks.savePreferences,
    saveTask: cloudStoreMocks.saveTask,
    saveTaskUi: cloudStoreMocks.saveTaskUi,
    subscribeToTaskCollection: cloudStoreMocks.subscribeToTaskCollection,
    subscribeToTaskLiveSessionDocs: cloudStoreMocks.subscribeToTaskLiveSessionDocs,
  };
});
vi.mock("./leaderboard", () => leaderboardMocks);
vi.mock("./planFunctions", () => planMocks);
vi.mock("./entitlements", () => entitlementMocks);

import { DEFAULT_REWARD_PROGRESS, MIN_REWARD_ELIGIBLE_SESSION_MS, rebuildRewardProgressFromHistory } from "./rewards";
import {
  buildDefaultCloudPreferences,
  clearScopedStorageState,
  clearLiveSession,
  ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS,
  appendHistoryEntry,
  hydrateStorageFromCloud,
  hydrateTimerStateFromCloud,
  flushPendingCloudWrites,
  loadCachedPreferences,
  loadCachedDashboard,
  loadCachedTaskUi,
  loadTasks,
  loadLiveSessions,
  loadHistory,
  resetVolatileWorkspaceStateForAuthChange,
  saveCloudDashboard,
  saveCloudPreferences,
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

function task(id: string, name: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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
    cloudStoreMocks.loadUserTimerState.mockReset();
    cloudStoreMocks.savePreferences.mockReset();
    cloudStoreMocks.savePreferences.mockResolvedValue(undefined);
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });
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

  it("preserves full color task cards as a signed-out fallback when clearing scoped state", () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      fullColorTaskCardsEnabled: true,
      updatedAtMs: Date.now(),
    });

    clearScopedStorageState();

    expect(localStorage.getItem("taskticker_tasks_v1:fullColorTaskCardsEnabled")).toBe("true");
    expect(loadCachedPreferences()).toBeNull();
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

  it("does not repair an intentionally unscheduled task from a stale shadow schedule", async () => {
    saveTasks([
      task("task-1", "Focus", {
        taskType: "recurring",
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 120,
        plannedStartDay: "sat",
        plannedStartTime: "09:00",
        plannedStartByDay: { sat: "09:00" },
        plannedStartOpenEnded: false,
      }),
    ]);
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [
        task("task-1", "Focus", {
          taskType: "recurring",
          timeGoalEnabled: true,
          timeGoalPeriod: "week",
          timeGoalMinutes: 120,
          plannedStartDay: null,
          plannedStartTime: null,
          plannedStartByDay: null,
          plannedStartOpenEnded: true,
        }),
      ],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: { ...buildDefaultCloudPreferences(), updatedAtMs: Date.now() },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    const hydratedTask = (loadTasks() || [])[0];
    expect(hydratedTask).toBeTruthy();
    expect(hydratedTask?.plannedStartByDay).toBeNull();
    expect(hydratedTask?.plannedStartTime).toBeNull();
    expect(hydratedTask?.plannedStartOpenEnded).toBe(true);
  });

  it("does not repair a cleared task schedule from a stale shadow schedule", async () => {
    saveTasks([
      task("task-1", "Focus", {
        taskType: "recurring",
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 120,
        plannedStartDay: "sat",
        plannedStartTime: "09:00",
        plannedStartByDay: { sat: "09:00" },
        plannedStartOpenEnded: false,
      }),
    ]);
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [
        task("task-1", "Focus", {
          taskType: "recurring",
          timeGoalEnabled: false,
          timeGoalValue: 0,
          timeGoalMinutes: 0,
          milestonesEnabled: false,
          milestones: [],
          plannedStartDay: null,
          plannedStartTime: null,
          plannedStartByDay: null,
          plannedStartOpenEnded: true,
        }),
      ],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: { ...buildDefaultCloudPreferences(), updatedAtMs: Date.now() },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    const hydratedTask = (loadTasks() || [])[0];
    expect(hydratedTask).toBeTruthy();
    expect(hydratedTask?.timeGoalEnabled).toBe(false);
    expect(hydratedTask?.plannedStartByDay).toBeNull();
    expect(hydratedTask?.plannedStartTime).toBeNull();
    expect(hydratedTask?.plannedStartOpenEnded).toBe(true);
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

  it("does not replay signed-out task deletes after auth returns", async () => {
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

    await vi.runAllTimersAsync();
    expect(cloudStoreMocks.deleteTask).not.toHaveBeenCalledWith("uid-1", "task-1");
  });

  it("clears signed-out task changes instead of storing guest shadow data", () => {
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    const guestTask = task("guest-task-1", "Guest Focus");

    saveTasks([guestTask]);

    const raw = localStorage.getItem("taskticker_tasks_v1:shadow:tasks");
    expect(raw).toBeNull();
    expect(loadTasks()).toEqual([]);
    expect(cloudStoreMocks.saveTask).not.toHaveBeenCalled();
  });

  it("does not upload discarded signed-out tasks when an account hydrates", async () => {
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

    await vi.runAllTimersAsync();
    expect(cloudStoreMocks.saveTask).not.toHaveBeenCalledWith("uid-1", expect.objectContaining({ id: "guest-task-1" }));
  });

  it("loads legacy elapsed task time as accumulated time", () => {
    saveTasks([task("task-1", "Focus", { accumulatedMs: 0, elapsed: 45_000, hasStarted: false })]);

    expect(loadTasks()?.[0]).toMatchObject({
      id: "task-1",
      accumulatedMs: 45_000,
      hasStarted: true,
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

  it("hydrates only task timer state without replacing history or preference caches", async () => {
    const initialPrefs = { ...buildDefaultCloudPreferences(), updatedAtMs: Date.now() };
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [task("task-1", "Focus")],
      historyByTaskId: {
        "task-1": [{ ts: Date.parse("2026-05-05T09:50:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: initialPrefs,
      dashboard: { order: ["momentum"] },
      taskUi: { pinnedHistoryTaskIds: ["task-1"] },
    });
    await hydrateStorageFromCloud({ force: true });

    cloudStoreMocks.loadUserTimerState.mockResolvedValue({
      tasks: [task("task-1", "Focus", { running: true, startMs: 2000 })],
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: 2000,
          updatedAtMs: 2000,
          elapsedMs: 0,
          status: "running",
        },
      },
    });

    await hydrateTimerStateFromCloud({ force: true });

    expect(loadTasks()?.[0]).toMatchObject({ id: "task-1", running: true, startMs: 2000 });
    expect(loadLiveSessions()).toEqual({
      "task-1": expect.objectContaining({ sessionId: "session-1", taskId: "task-1" }),
    });
    expect(loadHistory()).toEqual({
      "task-1": [{ ts: Date.parse("2026-05-05T09:50:00.000Z"), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
    });
    expect(loadCachedPreferences()).toEqual(expect.objectContaining({ schemaVersion: 1 }));
    expect(loadCachedDashboard()).toEqual({ order: ["momentum"] });
    expect(loadCachedTaskUi()).toEqual({ pinnedHistoryTaskIds: ["task-1"] });
    expect(cloudStoreMocks.loadUserWorkspace).toHaveBeenCalledTimes(1);
  });

  it("clears a stale cached live session when timer-state hydration sees the task stopped remotely", async () => {
    const runningTask = task("task-1", "Focus", { running: true, startMs: 1000 });
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [runningTask],
      historyByTaskId: {},
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: 1000,
          updatedAtMs: 1000,
          elapsedMs: 0,
          status: "running",
        },
      },
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    });
    await hydrateStorageFromCloud({ force: true });
    expect(loadTasks()?.[0]).toMatchObject({ running: true });
    expect(loadLiveSessions()["task-1"]).toBeTruthy();

    cloudStoreMocks.loadUserTimerState.mockResolvedValue({
      tasks: [task("task-1", "Focus", { running: false, startMs: null, accumulatedMs: 5000 })],
      liveSessionsByTaskId: {},
    });

    await hydrateTimerStateFromCloud({ force: true });

    expect(loadLiveSessions()).toEqual({});
    expect(loadTasks()?.[0]).toMatchObject({ running: false, startMs: null, accumulatedMs: 5000 });
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

  it("clears volatile user caches before hydrating a different signed-in account", async () => {
    const userOnePrefs = { ...buildDefaultCloudPreferences(), updatedAtMs: 100 };
    const userOneDashboard = { order: ["momentum"] };
    const userOneTaskUi = { pinnedHistoryTaskIds: ["task-user-1"] };

    saveCloudPreferences(userOnePrefs);
    saveCloudDashboard(userOneDashboard as never);
    saveCloudTaskUi(userOneTaskUi as never);
    expect(loadCachedDashboard()).toEqual(userOneDashboard);
    expect(loadCachedTaskUi()).toEqual(userOneTaskUi);

    resetVolatileWorkspaceStateForAuthChange();

    expect(loadCachedPreferences()).toBeNull();
    expect(loadCachedDashboard()).toBeNull();
    expect(loadCachedTaskUi()).toBeNull();

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-2" } });
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: { ...buildDefaultCloudPreferences(), theme: "lime", updatedAtMs: 50 },
      dashboard: { order: ["tasksCompleted"] },
      taskUi: { pinnedHistoryTaskIds: ["task-user-2"] },
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()?.theme).toBe("lime");
    expect(loadCachedDashboard()).toEqual({ order: ["tasksCompleted"] });
    expect(loadCachedTaskUi()).toEqual({ pinnedHistoryTaskIds: ["task-user-2"] });
  });

  it("does not expose an owned preference cache to a different or signed-out account", async () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 100,
    });

    expect(loadCachedPreferences()).toEqual(expect.objectContaining({ startupModule: "friends" }));

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-2" } });
    expect(loadCachedPreferences()).toBeNull();

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    expect(loadCachedPreferences()).toBeNull();

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });
    expect(loadCachedPreferences()).toEqual(expect.objectContaining({ startupModule: "friends" }));
  });

  it("discards a delayed workspace hydration after the authenticated account changes", async () => {
    let resolveUserOneHydration!: (value: Awaited<ReturnType<typeof cloudStoreMocks.loadUserWorkspace>>) => void;
    const userOneHydration = new Promise<Awaited<ReturnType<typeof cloudStoreMocks.loadUserWorkspace>>>((resolve) => {
      resolveUserOneHydration = resolve;
    });
    cloudStoreMocks.loadUserWorkspace.mockReturnValueOnce(userOneHydration);

    const hydrateUserOne = hydrateStorageFromCloud({ force: true });
    await Promise.resolve();

    resetVolatileWorkspaceStateForAuthChange();
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-2" } });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 200,
    });

    resolveUserOneHydration({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        startupModule: "dashboard",
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });
    await hydrateUserOne;

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({ startupModule: "friends", updatedAtMs: 200 })
    );
  });

  it("replays preference saves made before auth resolves for the signed-in user", async () => {
    authMocks.getFirebaseAuthClient.mockReturnValue(null as never);
    const pendingPrefs = {
      ...buildDefaultCloudPreferences(),
      startupModule: "tasks" as const,
      updatedAtMs: Date.now() + 1000,
    };

    saveCloudPreferences(pendingPrefs);
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();

    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });
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

    await hydrateStorageFromCloud({ force: true });
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({ startupModule: "tasks" })
    );
  });

  it("does not let an old account pending replay clear a new account pending snapshot", async () => {
    let resolveUserOneReplay!: () => void;
    let resolveUserTwoSave!: () => void;
    const userOneReplay = new Promise<void>((resolve) => {
      resolveUserOneReplay = resolve;
    });
    const userTwoSave = new Promise<void>((resolve) => {
      resolveUserTwoSave = resolve;
    });
    cloudStoreMocks.savePreferences
      .mockImplementationOnce(() => userOneReplay)
      .mockImplementationOnce(() => userTwoSave);

    authMocks.getFirebaseAuthClient.mockReturnValue(null as never);
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 100,
    });
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });
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
    await hydrateStorageFromCloud({ force: true });

    resetVolatileWorkspaceStateForAuthChange();
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-2" } });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 200,
    });

    resolveUserOneReplay();
    await userOneReplay;
    await Promise.resolve();

    expect(JSON.parse(localStorage.getItem("taskticker_tasks_v1:pendingPreferencesSync") || "null")).toEqual(
      expect.objectContaining({
        uid: "uid-2",
        preferences: expect.objectContaining({ startupModule: "friends", updatedAtMs: 200 }),
      })
    );

    resolveUserTwoSave();
    await userTwoSave;
  });

  it("drains the latest preference snapshot queued during an in-flight save", async () => {
    let resolveFirstSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    cloudStoreMocks.savePreferences.mockImplementationOnce(() => firstSave).mockResolvedValue(undefined);

    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 100,
    });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 101,
    });

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(1);
    resolveFirstSave();
    await firstSave;
    await Promise.resolve();
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(2);
    expect(cloudStoreMocks.savePreferences).toHaveBeenLastCalledWith(
      "uid-1",
      expect.objectContaining({ startupModule: "friends", updatedAtMs: 101 })
    );
  });

  it("waits for the latest queued preference save when flushing pending cloud writes", async () => {
    let resolveFirstSave!: () => void;
    let resolveSecondSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSave = new Promise<void>((resolve) => {
      resolveSecondSave = resolve;
    });
    cloudStoreMocks.savePreferences
      .mockImplementationOnce(() => firstSave)
      .mockImplementationOnce(() => secondSave);

    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 100,
    });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 101,
    });
    let flushSettled = false;
    const flush = flushPendingCloudWrites().then(() => {
      flushSettled = true;
    });

    resolveFirstSave();
    await firstSave;
    await Promise.resolve();
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(2);
    expect(flushSettled).toBe(false);

    resolveSecondSave();
    await flush;

    expect(flushSettled).toBe(true);
    expect(cloudStoreMocks.savePreferences).toHaveBeenLastCalledWith(
      "uid-1",
      expect.objectContaining({ startupModule: "friends", updatedAtMs: 101 })
    );
  });

  it("clears matching pending state when an unchanged preference payload is deduplicated", async () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 100,
    });
    await Promise.resolve();
    await Promise.resolve();

    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 101,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("taskticker_tasks_v1:pendingPreferencesSync")).toBeNull();
  });

  it("does not let an old account preference save drain a new account queue", async () => {
    let resolveUserOneSave!: () => void;
    let resolveUserTwoSave!: () => void;
    const userOneSave = new Promise<void>((resolve) => {
      resolveUserOneSave = resolve;
    });
    const userTwoSave = new Promise<void>((resolve) => {
      resolveUserTwoSave = resolve;
    });
    cloudStoreMocks.savePreferences
      .mockImplementationOnce(() => userOneSave)
      .mockImplementationOnce(() => userTwoSave)
      .mockResolvedValue(undefined);

    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "dashboard",
      updatedAtMs: 100,
    });

    resetVolatileWorkspaceStateForAuthChange();
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-2" } });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "tasks",
      updatedAtMs: 200,
    });
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      updatedAtMs: 201,
    });

    resolveUserOneSave();
    await userOneSave;
    await Promise.resolve();
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(2);
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({ startupModule: "friends", updatedAtMs: 201 })
    );

    resolveUserTwoSave();
    await userTwoSave;
    await Promise.resolve();
    await Promise.resolve();

    expect(cloudStoreMocks.savePreferences).toHaveBeenCalledTimes(3);
    expect(cloudStoreMocks.savePreferences).toHaveBeenLastCalledWith(
      "uid-2",
      expect.objectContaining({ startupModule: "friends", updatedAtMs: 201 })
    );
  });

  it("ignores an unscoped preference shadow when a signed-in account hydrates", async () => {
    localStorage.setItem(
      "taskticker_tasks_v1:shadow:preferences",
      JSON.stringify({
        preferences: {
          ...buildDefaultCloudPreferences(),
          startupModule: "friends",
          weekStarting: "sun",
          updatedAtMs: 500,
        },
      })
    );
    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        startupModule: "dashboard",
        weekStarting: "mon",
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        startupModule: "dashboard",
        weekStarting: "mon",
      })
    );
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({ startupModule: "friends" })
    );
  });

  it("loads optimal productivity settings from cloud when local shadow preferences are stale", async () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      optimalProductivityStartTime: "07:30",
      optimalProductivityEndTime: "18:45",
      optimalProductivityDays: ["mon", "tue"],
      updatedAtMs: 50,
    });
    await Promise.resolve();
    await Promise.resolve();
    cloudStoreMocks.savePreferences.mockClear();

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
      })
    );
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({
        optimalProductivityStartTime: "07:30",
        optimalProductivityEndTime: "18:45",
        optimalProductivityDays: ["mon", "tue"],
      })
    );
  });

  it("keeps newer local optimal productivity settings when cloud hydration returns older values after save", async () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      optimalProductivityStartTime: "07:30",
      optimalProductivityEndTime: "18:45",
      optimalProductivityDays: ["mon", "tue"],
      updatedAtMs: 200,
    });
    await Promise.resolve();
    await Promise.resolve();
    cloudStoreMocks.savePreferences.mockClear();

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        optimalProductivityStartTime: "07:30",
        optimalProductivityEndTime: "18:45",
        optimalProductivityDays: ["mon", "tue"],
      })
    );
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();
  });

  it("keeps signed-in pending optimal productivity settings when cloud hydration returns stale values", async () => {
    cloudStoreMocks.savePreferences.mockImplementation(() => new Promise(() => {}));
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      optimalProductivityStartTime: "07:30",
      optimalProductivityEndTime: "18:45",
      optimalProductivityDays: ["mon", "tue"],
      updatedAtMs: 200,
    });
    cloudStoreMocks.savePreferences.mockClear();

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        optimalProductivityStartTime: "07:30",
        optimalProductivityEndTime: "18:45",
        optimalProductivityDays: ["mon", "tue"],
      })
    );
  });

  it("keeps cloud preferences when signed-in pending and shadow snapshots have the same timestamp", async () => {
    cloudStoreMocks.savePreferences.mockImplementation(() => new Promise(() => {}));
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      weekStarting: "sun",
      updatedAtMs: 200,
    });
    cloudStoreMocks.savePreferences.mockClear();

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        startupModule: "dashboard",
        weekStarting: "mon",
        updatedAtMs: 200,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        startupModule: "dashboard",
        weekStarting: "mon",
        updatedAtMs: 200,
      })
    );
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();
  });

  it("does not replay unscoped pending preferences over a signed-in cloud document", async () => {
    localStorage.setItem("taskticker_tasks_v1:activeUid", "uid-1");
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: null } as never);
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      startupModule: "friends",
      weekStarting: "sun",
      autoFocusOnTaskLaunchEnabled: true,
      optimalProductivityStartTime: "07:30",
      optimalProductivityEndTime: "18:45",
      optimalProductivityDays: ["mon", "tue"],
      updatedAtMs: 200,
    });
    cloudStoreMocks.savePreferences.mockClear();
    authMocks.getFirebaseAuthClient.mockReturnValue({ currentUser: { uid: "uid-1" } });

    cloudStoreMocks.loadUserWorkspace.mockResolvedValue({
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: {
        ...buildDefaultCloudPreferences(),
        startupModule: "dashboard",
        weekStarting: "mon",
        autoFocusOnTaskLaunchEnabled: false,
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
        updatedAtMs: 100,
      },
      dashboard: null,
      taskUi: null,
    });

    await hydrateStorageFromCloud({ force: true });

    expect(loadCachedPreferences()).toEqual(
      expect.objectContaining({
        startupModule: "dashboard",
        weekStarting: "mon",
        autoFocusOnTaskLaunchEnabled: false,
        optimalProductivityStartTime: "09:15",
        optimalProductivityEndTime: "15:30",
        optimalProductivityDays: ["wed", "fri"],
      })
    );
    expect(cloudStoreMocks.savePreferences).not.toHaveBeenCalled();
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

  it("finalizes completed live-session history and clears the live session in one cloud operation", async () => {
    const completedRow = {
      ts: Date.parse("2026-05-05T09:20:00.000Z"),
      name: "Focus",
      ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
      sessionId: "session-1",
    };

    appendHistoryEntry("task-1", completedRow);
    clearLiveSession("task-1", { forceCloudFlush: true, reason: "finalize" });

    await vi.waitFor(() => {
      expect(cloudStoreMocks.finalizeLiveSessionHistory).toHaveBeenCalledWith("uid-1", "task-1", completedRow);
    });
    expect(cloudStoreMocks.appendHistoryEntry).not.toHaveBeenCalled();
    expect(cloudStoreMocks.clearLiveSession).not.toHaveBeenCalled();
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

    expect(leaderboardMocks.saveLeaderboardProfile).toHaveBeenCalledWith("uid-1", expect.any(Object), {
      dispatchUpdatedEvent: false,
    });
  });

  it("does not allow leaderboard movement dispatch for untagged preference syncs", async () => {
    saveCloudPreferences({
      ...buildDefaultCloudPreferences(),
      rewards: {
        ...DEFAULT_REWARD_PROGRESS,
        totalXp: 10,
        totalXpPrecise: 10,
      },
      updatedAtMs: Date.now(),
    });

    await flushPendingCloudWrites();

    expect(leaderboardMocks.saveLeaderboardProfile).toHaveBeenCalledWith("uid-1", expect.any(Object), {
      dispatchUpdatedEvent: false,
    });
  });

  it("allows leaderboard movement dispatch for task-complete XP claim preference syncs", async () => {
    saveCloudPreferences(
      {
        ...buildDefaultCloudPreferences(),
        rewards: {
          ...DEFAULT_REWARD_PROGRESS,
          totalXp: 10,
          totalXpPrecise: 10,
        },
        updatedAtMs: Date.now(),
      },
      { leaderboardSyncReason: "task-complete-xp-claim" }
    );

    await flushPendingCloudWrites();

    expect(leaderboardMocks.saveLeaderboardProfile).toHaveBeenCalledWith("uid-1", expect.any(Object), {
      dispatchUpdatedEvent: true,
    });
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
