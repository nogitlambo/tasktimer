import { createTaskTimerStorageKeys } from "@/app/tasktimer/client/state";
import {
  STORAGE_KEY,
  hydrateStorageFromCloud,
  loadCachedPreferences,
  loadCachedTaskUi,
  loadDeletedMeta,
  loadHistory,
  loadTasks,
  saveCloudTaskUi,
  saveDeletedMeta as persistDeletedMeta,
  saveHistory as persistHistory,
  saveTasks as persistTasks,
} from "@/app/tasktimer/lib/storage";
import { parseRecentCustomTaskNames } from "@/app/tasktimer/lib/addTaskNames";
import type { DeletedTaskMeta, HistoryByTaskId } from "@/app/tasktimer/lib/types";
import {
  createDefaultModeSettings,
  normalizeHistoryByTaskId,
  normalizeTask,
  type MainMode,
  type ModeSettings,
  type TaskTimerSnapshot,
  type TaskTimerTask,
  type TaskTimerThemeMode,
} from "../model/types";

export interface TaskRepository {
  loadSnapshot(): Promise<TaskTimerSnapshot>;
  refreshSnapshot(): Promise<TaskTimerSnapshot>;
  saveTasks(tasks: TaskTimerTask[], opts?: { deletedTaskIds?: string[] }): Promise<void>;
  saveHistory(historyByTaskId: HistoryByTaskId): Promise<void>;
  saveDeletedMeta(meta: DeletedTaskMeta): Promise<void>;
  savePinnedHistoryTaskIds(taskIds: string[]): Promise<void>;
  saveRecentCustomTaskNames(taskNames: string[]): Promise<void>;
}

const storageKeys = createTaskTimerStorageKeys(STORAGE_KEY);
const PINNED_HISTORY_KEY = `${STORAGE_KEY}:pinnedHistoryTaskIds`;
const CUSTOM_TASK_NAMES_KEY = `${STORAGE_KEY}:customTaskNames`;

function readStringLocalStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function readBooleanLocalStorage(key: string, fallback: boolean): boolean {
  const raw = readStringLocalStorage(key);
  if (!raw) return fallback;
  return raw === "true";
}

function readTaskView(): "list" | "tile" {
  const cloud = loadCachedPreferences();
  const taskView = String(cloud?.taskView || readStringLocalStorage(storageKeys.TASK_VIEW_KEY) || "list");
  return taskView === "tile" ? "tile" : "list";
}

function readThemeMode(): TaskTimerThemeMode {
  const cloudTheme = String(loadCachedPreferences()?.theme || readStringLocalStorage(storageKeys.THEME_KEY) || "purple")
    .trim()
    .toLowerCase();
  return cloudTheme === "cyan" || cloudTheme === "command" ? "cyan" : "purple";
}

function readDynamicColorsEnabled(): boolean {
  const cloud = loadCachedPreferences();
  if (typeof cloud?.dynamicColorsEnabled === "boolean") return cloud.dynamicColorsEnabled;
  return readBooleanLocalStorage(storageKeys.DYNAMIC_COLORS_KEY, true);
}

function readDefaultTaskTimerFormat(): "day" | "hour" | "minute" {
  const cloud = loadCachedPreferences();
  const raw = String(cloud?.defaultTaskTimerFormat || readStringLocalStorage(storageKeys.DEFAULT_TASK_TIMER_FORMAT_KEY) || "hour");
  if (raw === "day" || raw === "minute") return raw;
  return "hour";
}

function readCheckpointAlertSoundEnabled(): boolean {
  const cloud = loadCachedPreferences();
  if (typeof cloud?.checkpointAlertSoundEnabled === "boolean") return cloud.checkpointAlertSoundEnabled;
  return readBooleanLocalStorage(storageKeys.CHECKPOINT_ALERT_SOUND_KEY, true);
}

function readCheckpointAlertToastEnabled(): boolean {
  const cloud = loadCachedPreferences();
  if (typeof cloud?.checkpointAlertToastEnabled === "boolean") return cloud.checkpointAlertToastEnabled;
  return readBooleanLocalStorage(storageKeys.CHECKPOINT_ALERT_TOAST_KEY, true);
}

function readPinnedHistoryTaskIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_HISTORY_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((taskId) => String(taskId || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readRecentCustomTaskNames(): string[] {
  const cloudTaskUi = loadCachedTaskUi();
  const fromCloud = Array.isArray(cloudTaskUi?.customTaskNames) ? cloudTaskUi.customTaskNames : null;
  if (fromCloud) return parseRecentCustomTaskNames(JSON.stringify(fromCloud));
  return parseRecentCustomTaskNames(readStringLocalStorage(CUSTOM_TASK_NAMES_KEY));
}

function sanitizeModeSettings(settingsRaw: unknown): ModeSettings {
  const next = createDefaultModeSettings();
  if (!settingsRaw || typeof settingsRaw !== "object") return next;
  (["mode1", "mode2", "mode3"] as MainMode[]).forEach((mode) => {
    const source = (settingsRaw as Record<string, unknown>)[mode];
    if (!source || typeof source !== "object") return;
    const row = source as Record<string, unknown>;
    next[mode] = {
      label: String(row.label || next[mode].label).trim() || next[mode].label,
      enabled: mode === "mode1" ? true : !!row.enabled,
      color: String(row.color || next[mode].color).trim() || next[mode].color,
    };
  });
  return next;
}

function readModeSettings(): ModeSettings {
  const cloud = loadCachedPreferences();
  if (cloud?.modeSettings) return sanitizeModeSettings(cloud.modeSettings);
  const raw = readStringLocalStorage(storageKeys.MODE_SETTINGS_KEY);
  if (!raw) return createDefaultModeSettings();
  try {
    return sanitizeModeSettings(JSON.parse(raw));
  } catch {
    return createDefaultModeSettings();
  }
}

function readSnapshotFromCache(): TaskTimerSnapshot {
  return {
    tasks: (loadTasks() || []).map((task) => normalizeTask(task)),
    historyByTaskId: normalizeHistoryByTaskId(loadHistory()),
    deletedTaskMeta: { ...(loadDeletedMeta() || {}) },
    modeSettings: readModeSettings(),
    themeMode: readThemeMode(),
    taskView: readTaskView(),
    dynamicColorsEnabled: readDynamicColorsEnabled(),
    pinnedHistoryTaskIds: readPinnedHistoryTaskIds(),
    defaultTaskTimerFormat: readDefaultTaskTimerFormat(),
    checkpointAlertSoundEnabled: readCheckpointAlertSoundEnabled(),
    checkpointAlertToastEnabled: readCheckpointAlertToastEnabled(),
    recentCustomTaskNames: readRecentCustomTaskNames(),
  };
}

export function createStorageTaskRepository(): TaskRepository {
  return {
    async loadSnapshot() {
      return readSnapshotFromCache();
    },
    async refreshSnapshot() {
      try {
        await hydrateStorageFromCloud({ force: true });
      } catch {
        // Keep local shadow state if refresh is unavailable.
      }
      return readSnapshotFromCache();
    },
    async saveTasks(tasks, opts) {
      persistTasks(tasks, opts);
    },
    async saveHistory(historyByTaskId) {
      persistHistory(historyByTaskId);
    },
    async saveDeletedMeta(meta) {
      persistDeletedMeta(meta);
    },
    async savePinnedHistoryTaskIds(taskIds) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(PINNED_HISTORY_KEY, JSON.stringify(taskIds));
      } catch {
        // Ignore localStorage failures and keep in-memory state.
      }
    },
    async saveRecentCustomTaskNames(taskNames) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(CUSTOM_TASK_NAMES_KEY, JSON.stringify(taskNames));
      } catch {
        // Ignore localStorage failures and keep in-memory state.
      }
      const cachedTaskUi = loadCachedTaskUi();
      saveCloudTaskUi({
        ...(cachedTaskUi && typeof cachedTaskUi === "object" ? cachedTaskUi : {}),
        historyRangeDaysByTaskId:
          cachedTaskUi && typeof cachedTaskUi === "object" && cachedTaskUi.historyRangeDaysByTaskId
            ? cachedTaskUi.historyRangeDaysByTaskId
            : {},
        historyRangeModeByTaskId:
          cachedTaskUi && typeof cachedTaskUi === "object" && cachedTaskUi.historyRangeModeByTaskId
            ? cachedTaskUi.historyRangeModeByTaskId
            : {},
        pinnedHistoryTaskIds:
          cachedTaskUi && typeof cachedTaskUi === "object" && Array.isArray(cachedTaskUi.pinnedHistoryTaskIds)
            ? cachedTaskUi.pinnedHistoryTaskIds
            : [],
        customTaskNames: taskNames.slice(0, 5),
      });
    },
  };
}
