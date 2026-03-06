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
const SHADOW_TASKS_KEY = `${STORAGE_KEY}:shadow:tasks`;
const SHADOW_HISTORY_KEY = `${STORAGE_KEY}:shadow:history`;
const SHADOW_DELETED_META_KEY = `${STORAGE_KEY}:shadow:deletedMeta`;
const SHADOW_DASHBOARD_KEY = `${STORAGE_KEY}:shadow:dashboard`;
const PENDING_TASK_DELETES_KEY = `${STORAGE_KEY}:pendingTaskDeletes`;
const PENDING_HISTORY_SYNC_KEY = `${STORAGE_KEY}:pendingHistorySync`;
const PENDING_SYNC_TTL_MS = 5 * 60 * 1000;

let cachedTasks: Task[] = [];
let cachedHistory: HistoryByTaskId = {};
let cachedDeletedMeta: DeletedTaskMeta = {};
let cachedPreferences: Awaited<ReturnType<typeof loadPreferences>> = null;
let cachedDashboard: Awaited<ReturnType<typeof loadDashboard>> = null;
let cachedTaskUi: Awaited<ReturnType<typeof loadTaskUi>> = null;
let hydratedUid = "";

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadShadowTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = safeParseJson<Task[]>(window.localStorage.getItem(SHADOW_TASKS_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadShadowHistory(): HistoryByTaskId {
  if (typeof window === "undefined") return {};
  try {
    const parsed = safeParseJson<HistoryByTaskId>(window.localStorage.getItem(SHADOW_HISTORY_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadShadowDeletedMeta(): DeletedTaskMeta {
  if (typeof window === "undefined") return {};
  try {
    const parsed = safeParseJson<DeletedTaskMeta>(window.localStorage.getItem(SHADOW_DELETED_META_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadShadowDashboard(): Awaited<ReturnType<typeof loadDashboard>> {
  if (typeof window === "undefined") return null;
  try {
    const parsed = safeParseJson<Awaited<ReturnType<typeof loadDashboard>>>(window.localStorage.getItem(SHADOW_DASHBOARD_KEY));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveShadowTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHADOW_TASKS_KEY, JSON.stringify(Array.isArray(tasks) ? tasks : []));
  } catch {
    // ignore localStorage failures
  }
}

function saveShadowHistory(historyByTaskId: HistoryByTaskId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHADOW_HISTORY_KEY, JSON.stringify(historyByTaskId || {}));
  } catch {
    // ignore localStorage failures
  }
}

function saveShadowDeletedMeta(meta: DeletedTaskMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHADOW_DELETED_META_KEY, JSON.stringify(meta || {}));
  } catch {
    // ignore localStorage failures
  }
}

function saveShadowDashboard(dashboard: Awaited<ReturnType<typeof loadDashboard>>): void {
  if (typeof window === "undefined") return;
  try {
    if (!dashboard) {
      window.localStorage.removeItem(SHADOW_DASHBOARD_KEY);
      return;
    }
    window.localStorage.setItem(SHADOW_DASHBOARD_KEY, JSON.stringify(dashboard));
  } catch {
    // ignore localStorage failures
  }
}

function loadPendingMap(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = safeParseJson<Record<string, number>>(window.localStorage.getItem(key));
    if (!parsed || typeof parsed !== "object") return {};
    const now = nowMs();
    const next: Record<string, number> = {};
    Object.entries(parsed).forEach(([id, ts]) => {
      const num = Number(ts || 0);
      if (!id || !Number.isFinite(num) || num <= 0) return;
      if (now - num > PENDING_SYNC_TTL_MS) return;
      next[id] = num;
    });
    return next;
  } catch {
    return {};
  }
}

function savePendingMap(key: string, value: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    if (!value || !Object.keys(value).length) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage failures
  }
}

function markPendingTaskDeletes(taskIds: string[]): void {
  if (!taskIds.length) return;
  const next = loadPendingMap(PENDING_TASK_DELETES_KEY);
  const ts = nowMs();
  taskIds.forEach((taskId) => {
    if (!taskId) return;
    next[taskId] = ts;
  });
  savePendingMap(PENDING_TASK_DELETES_KEY, next);
}

function clearPendingTaskDelete(taskId: string): void {
  if (!taskId) return;
  const next = loadPendingMap(PENDING_TASK_DELETES_KEY);
  if (!next[taskId]) return;
  delete next[taskId];
  savePendingMap(PENDING_TASK_DELETES_KEY, next);
}

function markPendingHistorySync(taskIds: string[]): void {
  if (!taskIds.length) return;
  const next = loadPendingMap(PENDING_HISTORY_SYNC_KEY);
  const ts = nowMs();
  taskIds.forEach((taskId) => {
    if (!taskId) return;
    next[taskId] = ts;
  });
  savePendingMap(PENDING_HISTORY_SYNC_KEY, next);
}

function clearPendingHistorySync(taskId: string): void {
  if (!taskId) return;
  const next = loadPendingMap(PENDING_HISTORY_SYNC_KEY);
  if (!next[taskId]) return;
  delete next[taskId];
  savePendingMap(PENDING_HISTORY_SYNC_KEY, next);
}

function historyRowsSignature(rows: HistoryEntry[] | null | undefined): string {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((row) => `${Number(row?.ts || 0)}|${Number(row?.ms || 0)}|${String(row?.name || "")}`)
    .join(",");
}

cachedTasks = loadShadowTasks();
cachedHistory = loadShadowHistory();
cachedDeletedMeta = loadShadowDeletedMeta();
cachedDashboard = loadShadowDashboard();

function currentUid(): string {
  const auth = getFirebaseAuthClient();
  return String(auth?.currentUser?.uid || "").trim();
}

export async function hydrateStorageFromCloud(opts?: { force?: boolean }): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    cachedTasks = [];
    cachedHistory = {};
    cachedDeletedMeta = {};
    cachedPreferences = null;
    cachedDashboard = null;
    cachedTaskUi = null;
    saveShadowDashboard(null);
    hydratedUid = "";
    return;
  }
  if (!opts?.force && hydratedUid === uid) return;
  await ensureUserProfileIndex(uid);
  const snapshot = await loadUserWorkspace(uid);
  const nextTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const nextHistory = snapshot.historyByTaskId || {};
  const nextDeletedMeta = snapshot.deletedTaskMeta || {};
  const pendingTaskDeletes = loadPendingMap(PENDING_TASK_DELETES_KEY);
  const pendingHistorySync = loadPendingMap(PENDING_HISTORY_SYNC_KEY);
  const shadowHistory = loadShadowHistory();

  const filteredTasks = nextTasks.filter((task) => !pendingTaskDeletes[String(task?.id || "")]);
  const filteredHistory: HistoryByTaskId = { ...nextHistory };
  Object.keys(pendingTaskDeletes).forEach((taskId) => {
    delete filteredHistory[taskId];
  });

  Object.keys(pendingHistorySync).forEach((taskId) => {
    if (Object.prototype.hasOwnProperty.call(shadowHistory, taskId)) {
      filteredHistory[taskId] = Array.isArray(shadowHistory[taskId]) ? shadowHistory[taskId] : [];
    }
  });

  const cloudTaskIdSet = new Set(nextTasks.map((task) => String(task?.id || "")));
  Object.keys(pendingTaskDeletes).forEach((taskId) => {
    if (!cloudTaskIdSet.has(taskId)) clearPendingTaskDelete(taskId);
  });
  Object.keys(pendingHistorySync).forEach((taskId) => {
    const cloudSig = historyRowsSignature(nextHistory[taskId] || []);
    const shadowSig = historyRowsSignature(shadowHistory[taskId] || []);
    if (cloudSig === shadowSig) clearPendingHistorySync(taskId);
  });

  cachedTasks = filteredTasks;
  cachedHistory = filteredHistory;
  cachedDeletedMeta = nextDeletedMeta;
  saveShadowTasks(cachedTasks);
  saveShadowHistory(cachedHistory);
  saveShadowDeletedMeta(cachedDeletedMeta);
  cachedPreferences = snapshot.preferences || null;
  cachedDashboard = snapshot.dashboard || null;
  saveShadowDashboard(cachedDashboard);
  cachedTaskUi = snapshot.taskUi || null;
  hydratedUid = uid;
}

export async function refreshHistoryFromCloud(): Promise<HistoryByTaskId> {
  await hydrateStorageFromCloud({ force: true });
  return loadHistory();
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
  void savePreferences(uid, prefs).catch(() => {
    // Keep local cached preferences when cloud write is denied/unavailable.
  });
}

export function saveCloudDashboard(dashboard: NonNullable<typeof cachedDashboard>) {
  cachedDashboard = dashboard;
  saveShadowDashboard(cachedDashboard);
  const uid = currentUid();
  if (!uid) return;
  void saveDashboard(uid, dashboard).catch(() => {
    // Keep local cached dashboard config when cloud write is denied/unavailable.
  });
}

export function primeDashboardCacheFromShadow() {
  if (cachedDashboard) return;
  cachedDashboard = loadShadowDashboard();
}

export function saveCloudTaskUi(taskUi: NonNullable<typeof cachedTaskUi>) {
  cachedTaskUi = taskUi;
  const uid = currentUid();
  if (!uid) return;
  void saveTaskUi(uid, taskUi).catch(() => {
    // Keep local cached task-ui config when cloud write is denied/unavailable.
  });
}

export function loadTasks(): Task[] | null {
  return Array.isArray(cachedTasks) ? cachedTasks : null;
}

export function saveTasks(tasks: Task[]): void {
  const next = Array.isArray(tasks) ? tasks : [];
  const prevById = new Map((cachedTasks || []).map((t) => [String(t.id || ""), t]));
  const nextById = new Map(next.map((t) => [String(t.id || ""), t]));
  cachedTasks = next;
  saveShadowTasks(cachedTasks);
  const removedTaskIds = Array.from(prevById.keys()).filter((taskId) => !!taskId && !nextById.has(taskId));
  markPendingTaskDeletes(removedTaskIds);
  const uid = currentUid();
  if (!uid) return;
  void Promise.all(
    next
      .filter((t) => String(t.id || ""))
      .map((t) => saveTask(uid, t))
  ).catch(() => {
    // Keep local shadow tasks when cloud write is denied/unavailable.
  });
  for (const taskId of removedTaskIds) {
    void deleteTask(uid, taskId)
      .then(() => {
        clearPendingTaskDelete(taskId);
      })
      .catch(() => {
        // Keep pending marker so hydration does not resurrect stale cloud tasks.
      });
  }
}

export function loadHistory(): HistoryByTaskId {
  return cachedHistory && typeof cachedHistory === "object" ? cachedHistory : {};
}

export function saveHistory(historyByTaskId: HistoryByTaskId): void {
  const prevHistory = cachedHistory || {};
  cachedHistory = historyByTaskId || {};
  saveShadowHistory(cachedHistory);
  const touchedTaskIds = Array.from(
    new Set([...Object.keys(prevHistory || {}), ...Object.keys(cachedHistory || {})].filter(Boolean))
  );
  markPendingHistorySync(touchedTaskIds);
  const uid = currentUid();
  if (!uid) return;
  const entries = Object.entries(cachedHistory || {});
  void Promise.all(
    entries.map(([taskId, rows]) =>
      replaceTaskHistory(uid, taskId, Array.isArray(rows) ? rows : [])
        .then(() => {
          clearPendingHistorySync(taskId);
        })
        .catch(() => {
          // Keep pending marker so hydration preserves local edits until sync succeeds.
        })
    )
  );
}

export async function saveHistoryAndWait(historyByTaskId: HistoryByTaskId): Promise<void> {
  const prevHistory = cachedHistory || {};
  cachedHistory = historyByTaskId || {};
  saveShadowHistory(cachedHistory);
  const touchedTaskIds = Array.from(
    new Set([...Object.keys(prevHistory || {}), ...Object.keys(cachedHistory || {})].filter(Boolean))
  );
  markPendingHistorySync(touchedTaskIds);
  const uid = currentUid();
  if (!uid) return;
  const entries = Object.entries(cachedHistory || {});
  await Promise.all(
    entries.map(([taskId, rows]) =>
      replaceTaskHistory(uid, taskId, Array.isArray(rows) ? rows : [])
        .then(() => {
          clearPendingHistorySync(taskId);
        })
        .catch(() => {
          // Keep pending marker so hydration preserves local edits until sync succeeds.
        })
    )
  );
}

export function loadDeletedMeta(): DeletedTaskMeta {
  return cachedDeletedMeta && typeof cachedDeletedMeta === "object" ? cachedDeletedMeta : {};
}

export function saveDeletedMeta(meta: DeletedTaskMeta): void {
  const prev = cachedDeletedMeta || {};
  const next = meta || {};
  cachedDeletedMeta = next;
  saveShadowDeletedMeta(cachedDeletedMeta);
  const uid = currentUid();
  if (!uid) return;
  for (const [taskId, row] of Object.entries(next)) {
    if (row) {
      void saveDeletedTaskMeta(uid, taskId, row).catch(() => {
        // Keep local deleted-meta cache when cloud write is denied/unavailable.
      });
    }
  }
  for (const taskId of Object.keys(prev)) {
    if (!next[taskId]) {
      void deleteDeletedTaskMeta(uid, taskId).catch(() => {
        // Keep local deleted-meta cache when cloud delete is denied/unavailable.
      });
    }
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
