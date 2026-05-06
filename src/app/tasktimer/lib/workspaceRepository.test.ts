import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  appendHistoryEntry: vi.fn(),
  buildDefaultCloudPreferences: vi.fn(() => ({ rewards: {} })),
  clearLiveSession: vi.fn(),
  clearScopedStorageState: vi.fn(),
  cleanupHistory: vi.fn(),
  loadCachedDashboard: vi.fn(),
  loadCachedPreferences: vi.fn(),
  loadCachedTaskUi: vi.fn(),
  loadDeletedMeta: vi.fn(),
  loadHistory: vi.fn(),
  loadLiveSessions: vi.fn(),
  hasPendingTaskOrHistorySync: vi.fn(),
  hydrateStorageFromCloud: vi.fn(),
  loadTasks: vi.fn(),
  primeDashboardCacheFromShadow: vi.fn(),
  refreshHistoryFromCloud: vi.fn(),
  saveCloudDashboard: vi.fn(),
  saveCloudPreferences: vi.fn(),
  saveCloudTaskUi: vi.fn(),
  saveDeletedMeta: vi.fn(),
  saveHistory: vi.fn(),
  saveHistoryAndWait: vi.fn(),
  saveHistoryLocally: vi.fn(),
  saveLiveSession: vi.fn(),
  saveTasks: vi.fn(),
  subscribeCloudTaskCollection: vi.fn(),
  subscribeCloudTaskLiveSessions: vi.fn(),
  subscribeCachedPreferences: vi.fn(),
  waitForPendingTaskSync: vi.fn(),
}));

vi.mock("./storage", () => storageMocks);

import { createTaskTimerWorkspaceRepository } from "./workspaceRepository";

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

describe("TaskTimer workspace repository snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.loadTasks.mockReturnValue([task("task-1", "Focus")]);
    storageMocks.loadHistory.mockReturnValue({
      "task-1": [
        { ts: 1, name: "Focus", ms: 1000 },
        { ts: 2, name: "Focus", ms: 0 },
      ],
    });
    storageMocks.cleanupHistory.mockReturnValue({
      "task-1": [{ ts: 1, name: "Focus", ms: 1000 }],
    });
    storageMocks.loadLiveSessions.mockReturnValue({
      "task-1": {
        sessionId: "session-1",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: 10,
        elapsedMs: 200,
        status: "running",
        updatedAtMs: 20,
      },
    });
    storageMocks.loadDeletedMeta.mockReturnValue({
      "old-task": { name: "Old", color: null, deletedAt: 100 },
    });
    storageMocks.loadCachedPreferences.mockReturnValue({ schemaVersion: 1, rewards: { totalXp: 3 }, updatedAtMs: 1 });
    storageMocks.loadCachedDashboard.mockReturnValue({ order: ["momentum"] });
    storageMocks.loadCachedTaskUi.mockReturnValue({ pinnedHistoryTaskIds: ["task-1"] });
    storageMocks.hydrateStorageFromCloud.mockResolvedValue(undefined);
  });

  it("loads task, history, live session, deleted metadata, and cache state through one snapshot", () => {
    const repository = createTaskTimerWorkspaceRepository();

    const snapshot = repository.loadWorkspaceSnapshot();

    expect(snapshot).toMatchObject({
      tasks: [{ id: "task-1", name: "Focus" }],
      historyByTaskId: {
        "task-1": [
          { ts: 1, name: "Focus", ms: 1000 },
          { ts: 2, name: "Focus", ms: 0 },
        ],
      },
      cleanedHistoryByTaskId: {
        "task-1": [{ ts: 1, name: "Focus", ms: 1000 }],
      },
      historyWasCleaned: true,
      liveSessionsByTaskId: { "task-1": { sessionId: "session-1" } },
      deletedTaskMeta: { "old-task": { name: "Old", color: null, deletedAt: 100 } },
      preferences: { schemaVersion: 1, rewards: { totalXp: 3 }, updatedAtMs: 1 },
      dashboard: { order: ["momentum"] },
      taskUi: { pinnedHistoryTaskIds: ["task-1"] },
    });
    expect(storageMocks.cleanupHistory).toHaveBeenCalledWith(snapshot.historyByTaskId);
  });

  it("loads history cleanup state through a focused history snapshot", () => {
    const repository = createTaskTimerWorkspaceRepository();

    const snapshot = repository.loadHistorySnapshot();

    expect(snapshot).toEqual({
      historyByTaskId: {
        "task-1": [
          { ts: 1, name: "Focus", ms: 1000 },
          { ts: 2, name: "Focus", ms: 0 },
        ],
      },
      cleanedHistoryByTaskId: {
        "task-1": [{ ts: 1, name: "Focus", ms: 1000 }],
      },
      historyWasCleaned: true,
    });
    expect(storageMocks.cleanupHistory).toHaveBeenCalledWith(snapshot.historyByTaskId);
  });

  it("returns a fresh workspace snapshot after cloud hydration completes", async () => {
    const repository = createTaskTimerWorkspaceRepository();

    const snapshot = await repository.hydrateFromCloud({ force: true });

    expect(storageMocks.hydrateStorageFromCloud).toHaveBeenCalledWith({ force: true });
    expect(snapshot.tasks).toEqual([task("task-1", "Focus")]);
    expect(snapshot.cleanedHistoryByTaskId).toEqual({
      "task-1": [{ ts: 1, name: "Focus", ms: 1000 }],
    });
  });
});
