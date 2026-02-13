import type { DeletedTaskMeta, HistoryByTaskId, Task } from "../types";
import { nowMs } from "./time";

export const STORAGE_KEY = "taskticker_tasks_v1";
export const HISTORY_KEY = "taskticker_history_v1";
export const DELETED_META_KEY = "tasktimer_deleted_meta_v1";

export function loadTasks(): Task[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : null;
  } catch {
    return null;
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks || []));
}

export function loadHistory(): HistoryByTaskId {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const hb = raw ? JSON.parse(raw) : {};
    return hb && typeof hb === "object" ? (hb as HistoryByTaskId) : {};
  } catch {
    return {};
  }
}

export function saveHistory(historyByTaskId: HistoryByTaskId): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyByTaskId || {}));
  } catch {}
}

export function loadDeletedMeta(): DeletedTaskMeta {
  try {
    const raw = localStorage.getItem(DELETED_META_KEY);
    const dm = raw ? JSON.parse(raw) : {};
    return dm && typeof dm === "object" ? (dm as DeletedTaskMeta) : {};
  } catch {
    return {};
  }
}

export function saveDeletedMeta(meta: DeletedTaskMeta): void {
  try {
    localStorage.setItem(DELETED_META_KEY, JSON.stringify(meta || {}));
  } catch {}
}

export function cleanupHistory(historyByTaskId: HistoryByTaskId): HistoryByTaskId {
  const cutoff = nowMs() - 120 * 24 * 60 * 60 * 1000;
  const next: HistoryByTaskId = { ...(historyByTaskId || {}) };

  Object.keys(next).forEach((taskId) => {
    const arr = Array.isArray(next[taskId]) ? next[taskId] : [];
    const filtered = arr.filter((x) => {
      const ts = x && typeof x.ts === "number" ? x.ts : 0;
      return ts >= cutoff;
    });
    next[taskId] = filtered;
  });

  return next;
}