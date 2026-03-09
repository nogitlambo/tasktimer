import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "./types";
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
  subscribeToTaskCollection,
} from "./cloudStore";
import { nowMs } from "./time";
import { DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "./rewards";

export const STORAGE_KEY = "taskticker_tasks_v1";
export const HISTORY_KEY = "taskticker_history_v1";
export const DELETED_META_KEY = "tasktimer_deleted_meta_v1";
const SHADOW_TASKS_KEY = `${STORAGE_KEY}:shadow:tasks`;
const SHADOW_HISTORY_KEY = `${STORAGE_KEY}:shadow:history`;
const SHADOW_DELETED_META_KEY = `${STORAGE_KEY}:shadow:deletedMeta`;
const SHADOW_PREFERENCES_KEY = `${STORAGE_KEY}:shadow:preferences`;
const SHADOW_DASHBOARD_KEY = `${STORAGE_KEY}:shadow:dashboard`;
const PENDING_TASK_DELETES_KEY = `${STORAGE_KEY}:pendingTaskDeletes`;
const PENDING_TASK_SYNC_KEY = `${STORAGE_KEY}:pendingTaskSync`;
const PENDING_HISTORY_SYNC_KEY = `${STORAGE_KEY}:pendingHistorySync`;
const PENDING_PREFERENCES_SYNC_KEY = `${STORAGE_KEY}:pendingPreferencesSync`;
const ACTIVE_UID_KEY = `${STORAGE_KEY}:activeUid`;
const PENDING_SYNC_TTL_MS = 5 * 60 * 1000;

function currentUid(): string {
  const auth = getFirebaseAuthClient();
  return String(auth?.currentUser?.uid || "").trim();
}

function readStoredActiveUid(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(ACTIVE_UID_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeStoredActiveUid(uid: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const normalizedUid = String(uid || "").trim();
    if (!normalizedUid) {
      window.localStorage.removeItem(ACTIVE_UID_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_UID_KEY, normalizedUid);
  } catch {
    // ignore localStorage failures
  }
}

function scopedUid(): string {
  const uid = currentUid();
  if (uid) {
    writeStoredActiveUid(uid);
    return uid;
  }
  const hydrated = String(hydratedUid || "").trim();
  if (hydrated) return hydrated;
  return readStoredActiveUid();
}

let cachedTasks: Task[] = [];
let cachedHistory: HistoryByTaskId = {};
let cachedDeletedMeta: DeletedTaskMeta = {};
let cachedPreferences: Awaited<ReturnType<typeof loadPreferences>> = null;
let cachedDashboard: Awaited<ReturnType<typeof loadDashboard>> = null;
let cachedTaskUi: Awaited<ReturnType<typeof loadTaskUi>> = null;
let hydratedUid = "";
const preferenceListeners = new Set<(prefs: Awaited<ReturnType<typeof loadPreferences>>) => void>();

function normalizeTaskShape(task: Task | null | undefined): Task | null {
  if (!task) return null;
  return {
    ...task,
    xpDisqualifiedUntilReset: !!task.xpDisqualifiedUntilReset,
  };
}

function emitPreferenceChange() {
  for (const listener of preferenceListeners) {
    try {
      listener(cachedPreferences);
    } catch {
      // ignore listener failures
    }
  }
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadScopedShadowData<T>(key: string, uid: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = safeParseJson<{ uid?: string; data?: T } | T>(window.localStorage.getItem(key));
    const normalizedUid = String(uid || "").trim();
    if (!parsed || typeof parsed !== "object") return fallback;
    if (Object.prototype.hasOwnProperty.call(parsed, "data")) {
      const scoped = parsed as { uid?: string; data?: T };
      const shadowUid = String(scoped.uid || "").trim();
      if (normalizedUid && shadowUid && shadowUid !== normalizedUid) return fallback;
      return (scoped.data as T) ?? fallback;
    }
    return normalizedUid ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function saveScopedShadowData<T>(key: string, uid: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const normalizedUid = String(uid || "").trim();
    if (!normalizedUid) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify({ uid: normalizedUid, data }));
  } catch {
    // ignore localStorage failures
  }
}

function loadShadowTasks(uid = scopedUid()): Task[] {
  const parsed = loadScopedShadowData<Task[]>(SHADOW_TASKS_KEY, uid, []);
  return Array.isArray(parsed) ? parsed.map((task) => normalizeTaskShape(task)).filter((task): task is Task => !!task) : [];
}

function loadShadowHistory(uid = scopedUid()): HistoryByTaskId {
  const parsed = loadScopedShadowData<HistoryByTaskId>(SHADOW_HISTORY_KEY, uid, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function loadShadowDeletedMeta(uid = scopedUid()): DeletedTaskMeta {
  const parsed = loadScopedShadowData<DeletedTaskMeta>(SHADOW_DELETED_META_KEY, uid, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function loadShadowPreferences(uid?: string): Awaited<ReturnType<typeof loadPreferences>> {
  if (typeof window === "undefined") return null;
  try {
    const parsed = safeParseJson<{ uid?: string; preferences?: Awaited<ReturnType<typeof loadPreferences>> }>(
      window.localStorage.getItem(SHADOW_PREFERENCES_KEY)
    );
    if (!parsed || typeof parsed !== "object") return null;
    const shadowUid = String(parsed.uid || "").trim();
    const normalizedUid = String(uid || "").trim();
    if (normalizedUid && shadowUid && shadowUid !== normalizedUid) return null;
    const prefs = parsed.preferences;
    if (!prefs || typeof prefs !== "object") return null;
    return {
      ...prefs,
      rewards: normalizeRewardProgress((prefs as { rewards?: unknown }).rewards || DEFAULT_REWARD_PROGRESS),
    };
  } catch {
    return null;
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
  saveScopedShadowData<Task[]>(
    SHADOW_TASKS_KEY,
    scopedUid(),
    Array.isArray(tasks)
      ? tasks.map((task) => normalizeTaskShape(task)).filter((task): task is Task => !!task)
      : []
  );
}

function saveShadowHistory(historyByTaskId: HistoryByTaskId): void {
  saveScopedShadowData<HistoryByTaskId>(SHADOW_HISTORY_KEY, scopedUid(), historyByTaskId || {});
}

function saveShadowDeletedMeta(meta: DeletedTaskMeta): void {
  saveScopedShadowData<DeletedTaskMeta>(SHADOW_DELETED_META_KEY, scopedUid(), meta || {});
}

function saveShadowPreferences(uid: string, prefs: Awaited<ReturnType<typeof loadPreferences>>): void {
  if (typeof window === "undefined") return;
  try {
    if (!uid || !prefs) {
      window.localStorage.removeItem(SHADOW_PREFERENCES_KEY);
      return;
    }
    window.localStorage.setItem(
      SHADOW_PREFERENCES_KEY,
      JSON.stringify({
        uid,
        preferences: {
          ...prefs,
          rewards: normalizeRewardProgress((prefs as { rewards?: unknown }).rewards || DEFAULT_REWARD_PROGRESS),
        },
      })
    );
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
  const uid = scopedUid();
  const parsed = loadScopedShadowData<Record<string, number>>(key, uid, {});
  if (!parsed || typeof parsed !== "object") return {};
  try {
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

type PendingPreferencesSync = {
  ts: number;
  preferences: NonNullable<Awaited<ReturnType<typeof loadPreferences>>>;
};

function loadPendingPreferencesSync(): PendingPreferencesSync | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = safeParseJson<PendingPreferencesSync>(window.localStorage.getItem(PENDING_PREFERENCES_SYNC_KEY));
    if (!parsed || typeof parsed !== "object") return null;
    const ts = Number(parsed.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (nowMs() - ts > PENDING_SYNC_TTL_MS) {
      window.localStorage.removeItem(PENDING_PREFERENCES_SYNC_KEY);
      return null;
    }
    const prefs = parsed.preferences;
    if (!prefs || typeof prefs !== "object") return null;
    return {
      ts,
      preferences: {
        ...prefs,
        rewards: normalizeRewardProgress((prefs as { rewards?: unknown }).rewards || DEFAULT_REWARD_PROGRESS),
      },
    };
  } catch {
    return null;
  }
}

function savePendingPreferencesSync(prefs: NonNullable<Awaited<ReturnType<typeof loadPreferences>>> | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!prefs) {
      window.localStorage.removeItem(PENDING_PREFERENCES_SYNC_KEY);
      return;
    }
    window.localStorage.setItem(
      PENDING_PREFERENCES_SYNC_KEY,
      JSON.stringify({
        ts: nowMs(),
        preferences: {
          ...prefs,
          rewards: normalizeRewardProgress((prefs as { rewards?: unknown }).rewards || DEFAULT_REWARD_PROGRESS),
        },
      } satisfies PendingPreferencesSync)
    );
  } catch {
    // ignore localStorage failures
  }
}

function savePendingMap(key: string, value: Record<string, number>): void {
  const uid = scopedUid();
  if (!uid || !value || !Object.keys(value).length) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore localStorage failures
      }
    }
    return;
  }
  saveScopedShadowData<Record<string, number>>(key, uid, value);
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

function taskSignature(task: Task | null | undefined): string {
  if (!task) return "";
  const sourceMode = (task as Task & { mode?: unknown }).mode;
  return JSON.stringify({
    id: String(task.id || ""),
    name: String(task.name || ""),
    order: Number(task.order || 0),
    accumulatedMs: Number(task.accumulatedMs || 0),
    running: !!task.running,
    startMs: task.startMs == null ? null : Number(task.startMs || 0),
    collapsed: !!task.collapsed,
    milestonesEnabled: !!task.milestonesEnabled,
    milestoneTimeUnit: task.milestoneTimeUnit || "hour",
    milestones: Array.isArray(task.milestones) ? task.milestones : [],
    hasStarted: !!task.hasStarted,
    color: task.color == null ? null : String(task.color),
    checkpointSoundEnabled: !!task.checkpointSoundEnabled,
    checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!task.checkpointToastEnabled,
    checkpointToastMode: task.checkpointToastMode === "manual" ? "manual" : "auto5s",
    finalCheckpointAction:
      task.finalCheckpointAction === "resetLog" || task.finalCheckpointAction === "resetNoLog"
        ? task.finalCheckpointAction
        : "continue",
    xpDisqualifiedUntilReset: !!task.xpDisqualifiedUntilReset,
    presetIntervalsEnabled: !!task.presetIntervalsEnabled,
    presetIntervalValue: Number(task.presetIntervalValue || 0),
    presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId == null ? null : String(task.presetIntervalLastMilestoneId),
    presetIntervalNextSeq: Number(task.presetIntervalNextSeq || 0),
    mode: String(sourceMode || "mode1"),
  });
}

function markPendingTaskSync(taskIds: string[]): void {
  if (!taskIds.length) return;
  const next = loadPendingMap(PENDING_TASK_SYNC_KEY);
  const ts = nowMs();
  taskIds.forEach((taskId) => {
    if (!taskId) return;
    next[taskId] = ts;
  });
  savePendingMap(PENDING_TASK_SYNC_KEY, next);
}

function clearPendingTaskSync(taskId: string): void {
  if (!taskId) return;
  const next = loadPendingMap(PENDING_TASK_SYNC_KEY);
  if (!next[taskId]) return;
  delete next[taskId];
  savePendingMap(PENDING_TASK_SYNC_KEY, next);
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

function cloneTasks(tasks: Task[] | null | undefined): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];
  try {
    return (JSON.parse(JSON.stringify(tasks)) as Task[])
      .map((task) => normalizeTaskShape(task))
      .filter((task): task is Task => !!task);
  } catch {
    return tasks.map((task) => normalizeTaskShape(task)).filter((task): task is Task => !!task);
  }
}

cachedTasks = cloneTasks(loadShadowTasks());
cachedHistory = loadShadowHistory();
cachedDeletedMeta = loadShadowDeletedMeta();
cachedPreferences = loadShadowPreferences(scopedUid());
cachedDashboard = loadShadowDashboard();

export async function hydrateStorageFromCloud(opts?: { force?: boolean }): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    const retainedUid = scopedUid();
    cachedTasks = loadShadowTasks(retainedUid);
    cachedHistory = loadShadowHistory(retainedUid);
    cachedDeletedMeta = loadShadowDeletedMeta(retainedUid);
    cachedPreferences = loadShadowPreferences(retainedUid);
    cachedDashboard = loadShadowDashboard();
    emitPreferenceChange();
    return;
  }
  writeStoredActiveUid(uid);
  if (!opts?.force && hydratedUid === uid) return;
  await ensureUserProfileIndex(uid);
  const snapshot = await loadUserWorkspace(uid);
  const nextTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const nextHistory = snapshot.historyByTaskId || {};
  const nextDeletedMeta = snapshot.deletedTaskMeta || {};
  const pendingTaskDeletes = loadPendingMap(PENDING_TASK_DELETES_KEY);
  const pendingTaskSync = loadPendingMap(PENDING_TASK_SYNC_KEY);
  const pendingHistorySync = loadPendingMap(PENDING_HISTORY_SYNC_KEY);
  const shadowTasks = loadShadowTasks(uid);
  const shadowHistory = loadShadowHistory(uid);

  const filteredTasks = nextTasks.filter((task) => !pendingTaskDeletes[String(task?.id || "")]);
  const filteredHistory: HistoryByTaskId = { ...nextHistory };
  Object.keys(pendingTaskDeletes).forEach((taskId) => {
    delete filteredHistory[taskId];
  });

  if (Object.keys(pendingTaskSync).length) {
    const shadowTaskById = new Map(shadowTasks.map((task) => [String(task?.id || ""), task] as const));
    const filteredTaskById = new Map(filteredTasks.map((task) => [String(task?.id || ""), task] as const));
    Object.keys(pendingTaskSync).forEach((taskId) => {
      const shadowTask = shadowTaskById.get(taskId);
      if (!shadowTask) return;
      filteredTaskById.set(taskId, shadowTask);
    });
    filteredTasks.length = 0;
    filteredTaskById.forEach((task) => {
      filteredTasks.push(task);
    });
  }

  Object.keys(pendingHistorySync).forEach((taskId) => {
    if (Object.prototype.hasOwnProperty.call(shadowHistory, taskId)) {
      filteredHistory[taskId] = Array.isArray(shadowHistory[taskId]) ? shadowHistory[taskId] : [];
    }
  });

  const cloudTaskIdSet = new Set(nextTasks.map((task) => String(task?.id || "")));
  Object.keys(pendingTaskDeletes).forEach((taskId) => {
    if (!cloudTaskIdSet.has(taskId)) clearPendingTaskDelete(taskId);
  });
  const cloudTaskById = new Map(nextTasks.map((task) => [String(task?.id || ""), task] as const));
  const shadowTaskById = new Map(shadowTasks.map((task) => [String(task?.id || ""), task] as const));
  Object.keys(pendingTaskSync).forEach((taskId) => {
    const cloudTask = cloudTaskById.get(taskId);
    const shadowTask = shadowTaskById.get(taskId);
    if (!shadowTask) {
      clearPendingTaskSync(taskId);
      return;
    }
    if (cloudTask && taskSignature(cloudTask) === taskSignature(shadowTask)) {
      clearPendingTaskSync(taskId);
    }
  });
  Object.keys(pendingHistorySync).forEach((taskId) => {
    const cloudSig = historyRowsSignature(nextHistory[taskId] || []);
    const shadowSig = historyRowsSignature(shadowHistory[taskId] || []);
    if (cloudSig === shadowSig) clearPendingHistorySync(taskId);
  });

  cachedTasks = cloneTasks(filteredTasks);
  cachedHistory = filteredHistory;
  cachedDeletedMeta = nextDeletedMeta;
  saveShadowTasks(cachedTasks);
  saveShadowHistory(cachedHistory);
  saveShadowDeletedMeta(cachedDeletedMeta);
  const shadowPreferences = loadShadowPreferences(uid);
  const cloudPreferences = snapshot.preferences || null;
  const pendingPreferences = loadPendingPreferencesSync()?.preferences || null;
  const shadowUpdatedAtMs = Number(shadowPreferences?.updatedAtMs || 0);
  const cloudUpdatedAtMs = Number(cloudPreferences?.updatedAtMs || 0);
  const pendingUpdatedAtMs = Number(pendingPreferences?.updatedAtMs || 0);
  cachedPreferences =
    pendingUpdatedAtMs > Math.max(shadowUpdatedAtMs, cloudUpdatedAtMs)
      ? pendingPreferences
      : shadowUpdatedAtMs > cloudUpdatedAtMs
        ? shadowPreferences
        : cloudPreferences || shadowPreferences || pendingPreferences || null;
  saveShadowPreferences(uid, cachedPreferences);
  if (pendingPreferences && cachedPreferences && Number(cachedPreferences.updatedAtMs || 0) <= pendingUpdatedAtMs) {
    void savePreferences(uid, pendingPreferences)
      .then(() => {
        savePendingPreferencesSync(null);
      })
      .catch(() => {
        // Keep pending preferences queued until a later successful sync.
      });
  }
  cachedDashboard = snapshot.dashboard || null;
  saveShadowDashboard(cachedDashboard);
  cachedTaskUi = snapshot.taskUi || null;
  hydratedUid = uid;
  emitPreferenceChange();
}

export function clearScopedStorageState(): void {
  hydratedUid = "";
  cachedTasks = [];
  cachedHistory = {};
  cachedDeletedMeta = {};
  cachedPreferences = null;
  cachedDashboard = null;
  cachedTaskUi = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SHADOW_TASKS_KEY);
      window.localStorage.removeItem(SHADOW_HISTORY_KEY);
      window.localStorage.removeItem(SHADOW_DELETED_META_KEY);
      window.localStorage.removeItem(SHADOW_PREFERENCES_KEY);
      window.localStorage.removeItem(SHADOW_DASHBOARD_KEY);
      window.localStorage.removeItem(PENDING_TASK_DELETES_KEY);
      window.localStorage.removeItem(PENDING_TASK_SYNC_KEY);
      window.localStorage.removeItem(PENDING_HISTORY_SYNC_KEY);
      window.localStorage.removeItem(PENDING_PREFERENCES_SYNC_KEY);
      window.localStorage.removeItem(ACTIVE_UID_KEY);
    } catch {
      // ignore localStorage failures
    }
  }
  emitPreferenceChange();
}

export async function refreshHistoryFromCloud(): Promise<HistoryByTaskId> {
  await hydrateStorageFromCloud({ force: true });
  return loadHistory();
}

export function loadCachedPreferences() {
  return cachedPreferences;
}

export function subscribeCachedPreferences(
  listener: (prefs: Awaited<ReturnType<typeof loadPreferences>>) => void
): () => void {
  preferenceListeners.add(listener);
  try {
    listener(cachedPreferences);
  } catch {
    // ignore immediate listener failures
  }
  return () => {
    preferenceListeners.delete(listener);
  };
}

export function buildDefaultCloudPreferences() {
  return {
    schemaVersion: 1 as const,
    theme: "dark" as const,
    menuButtonStyle: "parallelogram" as const,
    defaultTaskTimerFormat: "hour" as const,
    taskView: "list" as const,
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    modeSettings: null,
    rewards: normalizeRewardProgress(DEFAULT_REWARD_PROGRESS),
    updatedAtMs: Date.now(),
  };
}

export function loadCachedDashboard() {
  return cachedDashboard;
}

export function loadCachedTaskUi() {
  return cachedTaskUi;
}

export function saveCloudPreferences(prefs: NonNullable<typeof cachedPreferences>) {
  cachedPreferences = {
    ...prefs,
    rewards: normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS),
  };
  const uid = currentUid();
  if (uid) {
    saveShadowPreferences(uid, cachedPreferences);
    savePendingPreferencesSync(null);
  } else {
    savePendingPreferencesSync(cachedPreferences);
  }
  emitPreferenceChange();
  if (!uid) return;
  void savePreferences(uid, cachedPreferences).catch(() => {
    savePendingPreferencesSync(cachedPreferences);
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
  return Array.isArray(cachedTasks) ? cloneTasks(cachedTasks) : null;
}

export function saveTasks(tasks: Task[]): void {
  const next = cloneTasks(tasks);
  const prevById = new Map(cloneTasks(cachedTasks || []).map((t) => [String(t.id || ""), t]));
  const nextById = new Map(next.map((t) => [String(t.id || ""), t]));
  cachedTasks = next;
  saveShadowTasks(cachedTasks);
  const removedTaskIds = Array.from(prevById.keys()).filter((taskId) => !!taskId && !nextById.has(taskId));
  const changedTaskIds = Array.from(nextById.keys()).filter((taskId) => {
    if (!taskId) return false;
    return taskSignature(nextById.get(taskId)) !== taskSignature(prevById.get(taskId));
  });
  markPendingTaskSync(changedTaskIds);
  markPendingTaskDeletes(removedTaskIds);
  const uid = currentUid();
  if (!uid) return;
  if (!changedTaskIds.length && !removedTaskIds.length) return;
  const changedTaskIdSet = new Set(changedTaskIds);
  void Promise.all(
    next
      .filter((t) => {
        const taskId = String(t.id || "");
        return !!taskId && changedTaskIdSet.has(taskId);
      })
      .map((t) =>
        saveTask(uid, t).then(() => {
          clearPendingTaskSync(String(t.id || ""));
        })
      )
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

export function subscribeCloudTaskCollection(uid: string, listener: () => void): () => void {
  if (!uid) return () => {};
  return subscribeToTaskCollection(uid, listener);
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
