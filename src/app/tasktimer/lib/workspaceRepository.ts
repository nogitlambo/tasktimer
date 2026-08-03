import type { DeletedTaskMeta, HistoryByTaskId, LiveSessionsByTaskId, LiveTaskSession, Task } from "./types";
import {
  normalizeUserPreferencesDocument,
  type UserPreferencesV1,
  type DashboardConfig,
  type TaskUiConfig,
} from "./cloudStore";
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
  hasPendingPreferenceSync,
  hasPendingTaskOrHistorySync,
  hasPendingTaskOrLiveSessionSync,
  hydrateTimerStateFromCloud,
  hydrateStorageFromCloud,
  loadTasks,
  primeDashboardCacheFromShadow,
  refreshHistoryFromCloud,
  resetVolatileWorkspaceStateForAuthChange,
  saveCloudDashboard,
  saveCloudPreferences,
  type SaveCloudPreferencesOptions,
  saveCloudTaskUi,
  saveDeletedMeta,
  flushPendingCloudWrites,
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

export type TaskTimerTimerStateSnapshot = Pick<TaskTimerWorkspaceSnapshot, "tasks" | "liveSessionsByTaskId">;

export type TaskTimerWorkspaceRepository = ReturnType<typeof createTaskTimerWorkspaceRepository>;

export type TaskTimerWorkspaceHistoryPersistence = ReturnType<typeof createTaskTimerWorkspaceHistoryPersistence>;

export type TaskTimerPreferenceMutation = Partial<Omit<UserPreferencesV1, "schemaVersion" | "updatedAtMs">>;
export type TaskTimerPreferenceUpdateOptions = SaveCloudPreferencesOptions;

export type TaskTimerWorkspacePreferencesPersistence = ReturnType<typeof createTaskTimerWorkspacePreferencesPersistence>;

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

function buildTimerStateSnapshot(): TaskTimerTimerStateSnapshot {
  return {
    tasks: loadTasks() || [],
    liveSessionsByTaskId: loadLiveSessions(),
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

export function createTaskTimerWorkspacePreferencesPersistence(
  repository: Pick<
    TaskTimerWorkspaceRepository,
    "buildDefaultPreferences" | "loadCachedPreferences" | "savePreferences" | "subscribeCachedPreferences"
  >,
  options: { now?: () => number } = {}
) {
  const now = options.now ?? Date.now;

  function normalize(prefs: UserPreferencesV1): UserPreferencesV1 {
    return normalizeUserPreferencesDocument(prefs as unknown as Record<string, unknown>);
  }

  function loadCached(): UserPreferencesV1 | null {
    const cached = repository.loadCachedPreferences();
    return cached ? normalize(cached) : null;
  }

  function loadResolved(): UserPreferencesV1 {
    return loadCached() || normalize(repository.buildDefaultPreferences());
  }

  function update(mutation: TaskTimerPreferenceMutation, updateOptions?: TaskTimerPreferenceUpdateOptions): UserPreferencesV1 {
    const current = loadResolved();
    const requestedNow = Number(now());
    const safeNow = Number.isFinite(requestedNow) && requestedNow > 0 ? Math.floor(requestedNow) : 0;
    const updatedAtMs = Math.max(safeNow, Number(current.updatedAtMs || 0) + 1);
    const next = normalizeUserPreferencesDocument({
      ...current,
      ...mutation,
      schemaVersion: 1,
      updatedAtMs,
    });
    if (updateOptions) repository.savePreferences(next, updateOptions);
    else repository.savePreferences(next);
    return next;
  }

  function subscribe(listener: (prefs: UserPreferencesV1 | null) => void): () => void {
    return repository.subscribeCachedPreferences((prefs) => {
      listener(prefs ? normalize(prefs) : null);
    });
  }

  return {
    loadCached,
    loadResolved,
    update,
    subscribe,
  };
}

export function createTaskTimerWorkspaceRepository() {
  return {
    buildDefaultPreferences: () => buildDefaultCloudPreferences(),
    loadWorkspaceSnapshot: () => buildWorkspaceSnapshot(),
    loadTimerStateSnapshot: () => buildTimerStateSnapshot(),
    loadHistorySnapshot: () => buildHistorySnapshot(),
    loadTasks: () => loadTasks(),
    saveTasks: (tasks: Task[], opts?: { deletedTaskIds?: string[]; forceCloudFlush?: boolean }) => saveTasks(tasks, opts),
    loadHistory: () => loadHistory(),
    loadLiveSessions: () => loadLiveSessions(),
    hydrateFromCloud: async (opts?: { force?: boolean }) => {
      await hydrateStorageFromCloud(opts);
      return buildWorkspaceSnapshot();
    },
    hydrateTimerStateFromCloud: async (opts?: { force?: boolean }) => {
      await hydrateTimerStateFromCloud(opts);
      return buildTimerStateSnapshot();
    },
    hasPendingTaskOrHistorySync: () => hasPendingTaskOrHistorySync(),
    hasPendingTaskOrLiveSessionSync: () => hasPendingTaskOrLiveSessionSync(),
    hasPendingPreferenceSync: () => hasPendingPreferenceSync(),
    subscribeTaskCollection: (uid: string, listener: () => void) => subscribeCloudTaskCollection(uid, listener),
    subscribeTaskLiveSessions: (uid: string, taskIds: string[], listener: () => void) =>
      subscribeCloudTaskLiveSessions(uid, taskIds, listener),
    appendHistoryEntry: (
      taskId: string,
      entry: { ts: number; name: string; ms: number; color?: string; note?: string; completionDifficulty?: 1 | 2 | 3 | 4 | 5 }
    ) =>
      appendHistoryEntry(taskId, entry),
    saveHistoryLocally: (historyByTaskId: HistoryByTaskId) => saveHistoryLocally(historyByTaskId),
    saveHistory: (
      historyByTaskId: HistoryByTaskId,
      opts?: { showIndicator?: boolean; minVisibleMs?: number; allowDestructiveReplace?: boolean }
    ) =>
      saveHistory(historyByTaskId, opts),
    saveHistoryAndWait: (
      historyByTaskId: HistoryByTaskId,
      opts?: { showIndicator?: boolean; minVisibleMs?: number; allowDestructiveReplace?: boolean }
    ) =>
      saveHistoryAndWait(historyByTaskId, opts),
    saveLiveSession: (session: LiveTaskSession, opts?: { forceCloudFlush?: boolean; reason?: string }) => saveLiveSession(session, opts),
    clearLiveSession: (taskId: string, opts?: { forceCloudFlush?: boolean; reason?: string }) => clearLiveSession(taskId, opts),
    refreshHistoryFromCloud: () => refreshHistoryFromCloud(),
    cleanupHistory: (historyByTaskId: HistoryByTaskId) => cleanupHistory(historyByTaskId),
    loadDeletedMeta: (): DeletedTaskMeta => loadDeletedMeta(),
    saveDeletedMeta: (meta: DeletedTaskMeta) => saveDeletedMeta(meta),
    loadCachedPreferences: (): UserPreferencesV1 | null => loadCachedPreferences(),
    subscribeCachedPreferences: (listener: (prefs: UserPreferencesV1 | null) => void) => subscribeCachedPreferences(listener),
    savePreferences: (prefs: UserPreferencesV1, opts?: SaveCloudPreferencesOptions) =>
      opts ? saveCloudPreferences(prefs, opts) : saveCloudPreferences(prefs),
    loadCachedDashboard: (): DashboardConfig | null => loadCachedDashboard(),
    primeDashboardCacheFromShadow: () => primeDashboardCacheFromShadow(),
    saveDashboard: (dashboard: DashboardConfig) => saveCloudDashboard(dashboard),
    loadCachedTaskUi: (): TaskUiConfig | null => loadCachedTaskUi(),
    saveTaskUi: (taskUi: TaskUiConfig) => saveCloudTaskUi(taskUi),
    flushPendingCloudWrites: () => flushPendingCloudWrites(),
    waitForPendingTaskSync: () => waitForPendingTaskSync(),
    clearScopedState: () => clearScopedStorageState(),
    resetVolatileStateForAuthChange: () => resetVolatileWorkspaceStateForAuthChange(),
  };
}
