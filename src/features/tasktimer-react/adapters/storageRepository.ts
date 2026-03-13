import { createTaskTimerStorageKeys } from "@/app/tasktimer/client/state";
import {
  STORAGE_KEY,
  hydrateStorageFromCloud,
  loadCachedPreferences,
  loadDeletedMeta,
  loadHistory,
  loadTasks,
  saveDeletedMeta as persistDeletedMeta,
  saveHistory as persistHistory,
  saveTasks as persistTasks,
} from "@/app/tasktimer/lib/storage";
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
}

const storageKeys = createTaskTimerStorageKeys(STORAGE_KEY);
const PINNED_HISTORY_KEY = `${STORAGE_KEY}:pinnedHistoryTaskIds`;

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
  const cloudTheme = String(loadCachedPreferences()?.theme || readStringLocalStorage(storageKeys.THEME_KEY) || "dark");
  if (cloudTheme === "light" || cloudTheme === "command") return cloudTheme;
  return "dark";
}

function readDynamicColorsEnabled(): boolean {
  const cloud = loadCachedPreferences();
  if (typeof cloud?.dynamicColorsEnabled === "boolean") return cloud.dynamicColorsEnabled;
  return readBooleanLocalStorage(storageKeys.DYNAMIC_COLORS_KEY, true);
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
  };
}
