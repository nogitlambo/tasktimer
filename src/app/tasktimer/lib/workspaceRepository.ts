import type { DeletedTaskMeta, HistoryByTaskId, Task } from "./types";
import type { UserPreferencesV1, DashboardConfig, TaskUiConfig } from "./cloudStore";
import {
  appendHistoryEntry,
  buildDefaultCloudPreferences,
  cleanupHistory,
  loadCachedDashboard,
  loadCachedPreferences,
  loadCachedTaskUi,
  loadDeletedMeta,
  loadHistory,
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
  saveTasks,
  subscribeCachedPreferences,
  waitForPendingTaskSync,
} from "./storage";

export type TaskTimerWorkspaceRepository = ReturnType<typeof createTaskTimerWorkspaceRepository>;

export function createTaskTimerWorkspaceRepository() {
  return {
    buildDefaultPreferences: () => buildDefaultCloudPreferences(),
    loadTasks: () => loadTasks(),
    saveTasks: (tasks: Task[], opts?: { deletedTaskIds?: string[] }) => saveTasks(tasks, opts),
    loadHistory: () => loadHistory(),
    appendHistoryEntry: (taskId: string, entry: { ts: number; name: string; ms: number; color?: string; note?: string }) =>
      appendHistoryEntry(taskId, entry),
    saveHistoryLocally: (historyByTaskId: HistoryByTaskId) => saveHistoryLocally(historyByTaskId),
    saveHistory: (historyByTaskId: HistoryByTaskId, opts?: { showIndicator?: boolean; minVisibleMs?: number }) =>
      saveHistory(historyByTaskId, opts),
    saveHistoryAndWait: (historyByTaskId: HistoryByTaskId, opts?: { showIndicator?: boolean; minVisibleMs?: number }) =>
      saveHistoryAndWait(historyByTaskId, opts),
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
  };
}
