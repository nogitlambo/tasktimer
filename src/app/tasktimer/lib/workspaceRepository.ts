import type { DeletedTaskMeta, HistoryByTaskId, LiveSessionsByTaskId, LiveTaskSession, Task } from "./types";
import type { UserPreferencesV1, DashboardConfig, TaskUiConfig } from "./cloudStore";
import {
  appendHistoryEntry,
  buildDefaultCloudPreferences,
  clearLiveSession,
  clearScopedStorageState,
  cleanupHistory,
  loadCachedDashboard,
  loadCachedPreferences,
  loadCachedTaskUi,
  loadDeletedMeta,
  loadHistory,
  loadLiveSessions,
  hasPendingTaskOrHistorySync,
  hydrateStorageFromCloud,
  loadTasks,
  primeDashboardCacheFromShadow,
  refreshHistoryFromCloud,
  saveCloudDashboard,
  saveCloudPreferences,
  saveCloudTaskUi,
  saveDeletedMeta,
  saveHistory,
  saveHistoryAndWait,
  saveHistoryLocally,
  saveLiveSession,
  saveTasks,
  subscribeCloudTaskCollection,
  subscribeCloudTaskLiveSessions,
  subscribeCachedPreferences,
  waitForPendingTaskSync,
} from "./storage";

export type TaskTimerHistorySnapshot = {
  historyByTaskId: HistoryByTaskId;
  cleanedHistoryByTaskId: HistoryByTaskId;
  historyWasCleaned: boolean;
};

export type TaskTimerWorkspaceSnapshot = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  cleanedHistoryByTaskId: HistoryByTaskId;
  historyWasCleaned: boolean;
  liveSessionsByTaskId: LiveSessionsByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  preferences: UserPreferencesV1 | null;
  dashboard: DashboardConfig | null;
  taskUi: TaskUiConfig | null;
};

export type TaskTimerWorkspaceRepository = ReturnType<typeof createTaskTimerWorkspaceRepository>;

export type TaskTimerWorkspaceHistoryPersistence = ReturnType<typeof createTaskTimerWorkspaceHistoryPersistence>;

function historyRowsSignature(historyByTaskId: HistoryByTaskId) {
  return Object.keys(historyByTaskId || {})
    .sort()
    .map((taskId) => {
      const rows = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const rowSig = rows
        .map((entry) =>
          [
            Number(entry?.ts || 0),
            Number(entry?.ms || 0),
            String(entry?.name || ""),
            String(entry?.note || ""),
            String(entry?.completionDifficulty || ""),
            String(entry?.sessionId || ""),
          ].join("|")
        )
        .join(",");
      return `${taskId}:${rowSig}`;
    })
    .join("||");
}

function buildHistorySnapshot(): TaskTimerHistorySnapshot {
  const historyByTaskId = loadHistory();
  const cleanedHistoryByTaskId = cleanupHistory(historyByTaskId);
  return {
    historyByTaskId,
    cleanedHistoryByTaskId,
    historyWasCleaned: historyRowsSignature(cleanedHistoryByTaskId) !== historyRowsSignature(historyByTaskId),
  };
}

function buildWorkspaceSnapshot(): TaskTimerWorkspaceSnapshot {
  const historySnapshot = buildHistorySnapshot();
  return {
    tasks: loadTasks() || [],
    ...historySnapshot,
    liveSessionsByTaskId: loadLiveSessions(),
    deletedTaskMeta: loadDeletedMeta(),
    preferences: loadCachedPreferences(),
    dashboard: loadCachedDashboard(),
    taskUi: loadCachedTaskUi(),
  };
}

export function createTaskTimerWorkspaceHistoryPersistence(
  repository: Pick<TaskTimerWorkspaceRepository, "loadHistorySnapshot" | "saveHistory">
) {
  return {
    loadSnapshot: () => repository.loadHistorySnapshot(),
    saveCleanedSnapshot: (snapshot: TaskTimerHistorySnapshot) => {
      if (snapshot.historyWasCleaned) {
        repository.saveHistory(snapshot.cleanedHistoryByTaskId, { showIndicator: false });
      }
    },
  };
}

export function createTaskTimerWorkspaceRepository() {
  return {
    buildDefaultPreferences: () => buildDefaultCloudPreferences(),
    loadWorkspaceSnapshot: () => buildWorkspaceSnapshot(),
    loadHistorySnapshot: () => buildHistorySnapshot(),
    loadTasks: () => loadTasks(),
    saveTasks: (tasks: Task[], opts?: { deletedTaskIds?: string[] }) => saveTasks(tasks, opts),
    loadHistory: () => loadHistory(),
    loadLiveSessions: () => loadLiveSessions(),
    hydrateFromCloud: async (opts?: { force?: boolean }) => {
      await hydrateStorageFromCloud(opts);
      return buildWorkspaceSnapshot();
    },
    hasPendingTaskOrHistorySync: () => hasPendingTaskOrHistorySync(),
    subscribeTaskCollection: (uid: string, listener: () => void) => subscribeCloudTaskCollection(uid, listener),
    subscribeTaskLiveSessions: (uid: string, taskIds: string[], listener: () => void) =>
      subscribeCloudTaskLiveSessions(uid, taskIds, listener),
    appendHistoryEntry: (
      taskId: string,
      entry: { ts: number; name: string; ms: number; color?: string; note?: string; completionDifficulty?: 1 | 2 | 3 | 4 | 5 }
    ) =>
      appendHistoryEntry(taskId, entry),
    saveHistoryLocally: (historyByTaskId: HistoryByTaskId) => saveHistoryLocally(historyByTaskId),
    saveHistory: (historyByTaskId: HistoryByTaskId, opts?: { showIndicator?: boolean; minVisibleMs?: number }) =>
      saveHistory(historyByTaskId, opts),
    saveHistoryAndWait: (historyByTaskId: HistoryByTaskId, opts?: { showIndicator?: boolean; minVisibleMs?: number }) =>
      saveHistoryAndWait(historyByTaskId, opts),
    saveLiveSession: (session: LiveTaskSession) => saveLiveSession(session),
    clearLiveSession: (taskId: string) => clearLiveSession(taskId),
    refreshHistoryFromCloud: () => refreshHistoryFromCloud(),
    cleanupHistory: (historyByTaskId: HistoryByTaskId) => cleanupHistory(historyByTaskId),
    loadDeletedMeta: (): DeletedTaskMeta => loadDeletedMeta(),
    saveDeletedMeta: (meta: DeletedTaskMeta) => saveDeletedMeta(meta),
    loadCachedPreferences: (): UserPreferencesV1 | null => loadCachedPreferences(),
    subscribeCachedPreferences: (listener: (prefs: UserPreferencesV1 | null) => void) => subscribeCachedPreferences(listener),
    savePreferences: (prefs: UserPreferencesV1) => saveCloudPreferences(prefs),
    loadCachedDashboard: (): DashboardConfig | null => loadCachedDashboard(),
    primeDashboardCacheFromShadow: () => primeDashboardCacheFromShadow(),
    saveDashboard: (dashboard: DashboardConfig) => saveCloudDashboard(dashboard),
    loadCachedTaskUi: (): TaskUiConfig | null => loadCachedTaskUi(),
    saveTaskUi: (taskUi: TaskUiConfig) => saveCloudTaskUi(taskUi),
    waitForPendingTaskSync: () => waitForPendingTaskSync(),
    clearScopedState: () => clearScopedStorageState(),
  };
}
