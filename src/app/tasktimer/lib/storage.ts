import type { DeletedTaskMeta, HistoryByTaskId, Task } from "./types";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  ensureUserProfileIndex,
  deleteDeletedTaskMeta,
  deleteTask,
  loadUserWorkspace,
  loadDashboard,
  loadPreferences,
  loadTaskUi,
  replaceTaskHistory,
  saveDashboard,
  savePreferences,
  saveTaskUi,
  saveDeletedTaskMeta,
  saveTask,
} from "./cloudStore";
import { nowMs } from "./time";

export const STORAGE_KEY = "taskticker_tasks_v1";
export const HISTORY_KEY = "taskticker_history_v1";
export const DELETED_META_KEY = "tasktimer_deleted_meta_v1";

let cachedTasks: Task[] = [];
let cachedHistory: HistoryByTaskId = {};
let cachedDeletedMeta: DeletedTaskMeta = {};
let cachedPreferences: Awaited<ReturnType<typeof loadPreferences>> = null;
let cachedDashboard: Awaited<ReturnType<typeof loadDashboard>> = null;
let cachedTaskUi: Awaited<ReturnType<typeof loadTaskUi>> = null;
let hydratedUid = "";

function currentUid(): string {
  const auth = getFirebaseAuthClient();
  return String(auth?.currentUser?.uid || "").trim();
}

export async function hydrateStorageFromCloud(): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    cachedTasks = [];
    cachedHistory = {};
    cachedDeletedMeta = {};
    cachedPreferences = null;
    cachedDashboard = null;
    cachedTaskUi = null;
    hydratedUid = "";
    return;
  }
  if (hydratedUid === uid) return;
  await ensureUserProfileIndex(uid);
  const snapshot = await loadUserWorkspace(uid);
  cachedTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  cachedHistory = snapshot.historyByTaskId || {};
  cachedDeletedMeta = snapshot.deletedTaskMeta || {};
  cachedPreferences = snapshot.preferences || null;
  cachedDashboard = snapshot.dashboard || null;
  cachedTaskUi = snapshot.taskUi || null;
  hydratedUid = uid;
}

export function loadCachedPreferences() {
  return cachedPreferences;
}

export function loadCachedDashboard() {
  return cachedDashboard;
}

export function loadCachedTaskUi() {
  return cachedTaskUi;
}

export function saveCloudPreferences(prefs: NonNullable<typeof cachedPreferences>) {
  cachedPreferences = prefs;
  const uid = currentUid();
  if (!uid) return;
  void savePreferences(uid, prefs);
}

export function saveCloudDashboard(dashboard: NonNullable<typeof cachedDashboard>) {
  cachedDashboard = dashboard;
  const uid = currentUid();
  if (!uid) return;
  void saveDashboard(uid, dashboard);
}

export function saveCloudTaskUi(taskUi: NonNullable<typeof cachedTaskUi>) {
  cachedTaskUi = taskUi;
  const uid = currentUid();
  if (!uid) return;
  void saveTaskUi(uid, taskUi);
}

export function loadTasks(): Task[] | null {
  return Array.isArray(cachedTasks) ? cachedTasks : null;
}

export function saveTasks(tasks: Task[]): void {
  const next = Array.isArray(tasks) ? tasks : [];
  const prevById = new Map((cachedTasks || []).map((t) => [String(t.id || ""), t]));
  const nextById = new Map(next.map((t) => [String(t.id || ""), t]));
  cachedTasks = next;
  const uid = currentUid();
  if (!uid) return;
  void Promise.all(
    next
      .filter((t) => String(t.id || ""))
      .map((t) => saveTask(uid, t))
  );
  for (const taskId of prevById.keys()) {
    if (!nextById.has(taskId)) void deleteTask(uid, taskId);
  }
}

export function loadHistory(): HistoryByTaskId {
  return cachedHistory && typeof cachedHistory === "object" ? cachedHistory : {};
}

export function saveHistory(historyByTaskId: HistoryByTaskId): void {
  cachedHistory = historyByTaskId || {};
  const uid = currentUid();
  if (!uid) return;
  const entries = Object.entries(cachedHistory || {});
  void Promise.all(entries.map(([taskId, rows]) => replaceTaskHistory(uid, taskId, Array.isArray(rows) ? rows : [])));
}

export function loadDeletedMeta(): DeletedTaskMeta {
  return cachedDeletedMeta && typeof cachedDeletedMeta === "object" ? cachedDeletedMeta : {};
}

export function saveDeletedMeta(meta: DeletedTaskMeta): void {
  const prev = cachedDeletedMeta || {};
  const next = meta || {};
  cachedDeletedMeta = next;
  const uid = currentUid();
  if (!uid) return;
  for (const [taskId, row] of Object.entries(next)) {
    if (row) void saveDeletedTaskMeta(uid, taskId, row);
  }
  for (const taskId of Object.keys(prev)) {
    if (!next[taskId]) void deleteDeletedTaskMeta(uid, taskId);
  }
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
