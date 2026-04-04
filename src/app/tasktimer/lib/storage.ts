import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "./types";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  appendHistoryEntry as appendHistoryEntryToCloud,
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
import {
  clearTaskTimerPlanStorage,
  writeTaskTimerPlanToStorage,
} from "./entitlements";
import { syncCurrentUserPlanCache } from "./planFunctions";
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
export const HISTORY_SAVE_WORKING_EVENT = "tasktimer:history-save-working";
const HISTORY_SAVE_FULL_SYNC_MIN_VISIBLE_MS = 600;
let historySaveWorkingActiveCount = 0;
let historySaveWorkingShownAtMs = 0;
let historySaveWorkingHideTimer: number | null = null;
let historySaveWorkingMinVisibleMs = HISTORY_SAVE_FULL_SYNC_MIN_VISIBLE_MS;

function applyHistorySaveWorkingVisibility(visible: boolean): void {
  if (typeof document === "undefined") return;
  const indicator = document.getElementById("historySaveWorkingIndicator");
  const text = document.getElementById("historySaveWorkingText");
  if (!indicator) return;
  indicator.classList.toggle("isOn", visible);
  indicator.setAttribute("aria-hidden", visible ? "false" : "true");
  if (text) text.textContent = visible ? "Saving history..." : "";
}

function dispatchHistorySaveWorking(phase: "start" | "end", minVisibleMs = HISTORY_SAVE_FULL_SYNC_MIN_VISIBLE_MS): void {
  if (typeof window === "undefined") return;
  try {
    if (phase === "start") {
      if (historySaveWorkingActiveCount === 0) {
        historySaveWorkingShownAtMs = nowMs();
        historySaveWorkingMinVisibleMs = Math.max(0, Math.floor(Number(minVisibleMs) || 0));
      } else {
        historySaveWorkingMinVisibleMs = Math.max(
          historySaveWorkingMinVisibleMs,
          Math.max(0, Math.floor(Number(minVisibleMs) || 0))
        );
      }
      historySaveWorkingActiveCount += 1;
      if (historySaveWorkingHideTimer != null) {
        window.clearTimeout(historySaveWorkingHideTimer);
        historySaveWorkingHideTimer = null;
      }
      applyHistorySaveWorkingVisibility(true);
    } else {
      historySaveWorkingActiveCount = Math.max(0, historySaveWorkingActiveCount - 1);
      if (historySaveWorkingActiveCount > 0) return;
      const elapsedMs = Math.max(0, nowMs() - historySaveWorkingShownAtMs);
      const remainingMs = Math.max(0, historySaveWorkingMinVisibleMs - elapsedMs);
      if (remainingMs > 0) {
        historySaveWorkingHideTimer = window.setTimeout(() => {
          historySaveWorkingHideTimer = null;
          if (historySaveWorkingActiveCount === 0) {
            applyHistorySaveWorkingVisibility(false);
            historySaveWorkingMinVisibleMs = HISTORY_SAVE_FULL_SYNC_MIN_VISIBLE_MS;
          }
        }, remainingMs);
      } else {
        applyHistorySaveWorkingVisibility(false);
        historySaveWorkingMinVisibleMs = HISTORY_SAVE_FULL_SYNC_MIN_VISIBLE_MS;
      }
    }
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(HISTORY_SAVE_WORKING_EVENT, { detail: { phase } }));
    }
  } catch {
    // ignore browser event failures
  }
}

async function runHistorySaveWithSignal<T>(
  work: () => Promise<T>,
  opts?: { minVisibleMs?: number }
): Promise<T> {
  dispatchHistorySaveWorking("start", opts?.minVisibleMs);
  try {
    return await work();
  } finally {
    dispatchHistorySaveWorking("end");
  }
}

async function runHistorySave<T>(
  work: () => Promise<T>,
  opts?: { showIndicator?: boolean; minVisibleMs?: number }
): Promise<T> {
  if (opts?.showIndicator === false) return await work();
  return await runHistorySaveWithSignal(work, { minVisibleMs: opts?.minVisibleMs });
}

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
let inFlightPreferencesSync: Promise<void> | null = null;
let queuedPreferencesSyncSnapshot: NonNullable<typeof cachedPreferences> | null = null;
let lastSuccessfulPreferencesSyncSignature = "";
let inFlightTaskQueueSync: Promise<void> | null = null;
const queuedTaskUpsertsById = new Map<string, Task>();
const queuedTaskDeletes = new Set<string>();
let inFlightHistoryQueueSync: Promise<void> | null = null;
const queuedHistoryReplacementsByTaskId = new Map<string, HistoryEntry[]>();
const preferenceListeners = new Set<(prefs: Awaited<ReturnType<typeof loadPreferences>>) => void>();
const inFlightTaskSyncs = new Set<Promise<void>>();

function trackInFlightTaskSync<T>(promise: Promise<T>): Promise<T> {
  const tracked = promise.finally(() => {
    inFlightTaskSyncs.delete(tracked as unknown as Promise<void>);
  });
  inFlightTaskSyncs.add(tracked as unknown as Promise<void>);
  return tracked;
}

function normalizeTaskShape(task: Task | null | undefined): Task | null {
  if (!task) return null;
  const timeGoalAction =
    task.timeGoalAction === "resetLog" || task.timeGoalAction === "resetNoLog" || task.timeGoalAction === "confirmModal"
      ? task.timeGoalAction
      : task.finalCheckpointAction === "resetLog" || task.finalCheckpointAction === "resetNoLog" || task.finalCheckpointAction === "confirmModal"
        ? task.finalCheckpointAction
        : "continue";
  const taskWithoutMode = { ...(task as Task & { mode?: unknown }) };
  delete taskWithoutMode.mode;
  return {
    ...taskWithoutMode,
    timeGoalAction,
    xpDisqualifiedUntilReset: !!task.xpDisqualifiedUntilReset,
    timeGoalEnabled: !!task.timeGoalEnabled,
    timeGoalValue: Number.isFinite(Number(task.timeGoalValue)) ? Math.max(0, Number(task.timeGoalValue)) : 0,
    timeGoalUnit: task.timeGoalUnit === "minute" ? "minute" : "hour",
    timeGoalPeriod: task.timeGoalPeriod === "day" ? "day" : "week",
    timeGoalMinutes: Number.isFinite(Number(task.timeGoalMinutes)) ? Math.max(0, Number(task.timeGoalMinutes)) : 0,
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
  if (!parsed || typeof parsed !== "object") return {};
  const next: HistoryByTaskId = {};
  Object.keys(parsed).forEach((taskId) => {
    const rows = Array.isArray(parsed[taskId]) ? parsed[taskId] : [];
    next[taskId] = rows
      .map((row) => normalizeHistoryEntry(row))
      .filter((row): row is HistoryEntry => !!row);
  });
  return next;
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
  const next: HistoryByTaskId = {};
  Object.keys(historyByTaskId || {}).forEach((taskId) => {
    const rows = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    next[taskId] = rows
      .map((row) => normalizeHistoryEntry(row))
      .filter((row): row is HistoryEntry => !!row);
  });
  saveScopedShadowData<HistoryByTaskId>(SHADOW_HISTORY_KEY, scopedUid(), next);
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
    timeGoalAction:
      task.timeGoalAction === "resetLog" || task.timeGoalAction === "resetNoLog" || task.timeGoalAction === "confirmModal"
        ? task.timeGoalAction
        : task.finalCheckpointAction === "resetLog" || task.finalCheckpointAction === "resetNoLog" || task.finalCheckpointAction === "confirmModal"
          ? task.finalCheckpointAction
          : "continue",
    xpDisqualifiedUntilReset: !!task.xpDisqualifiedUntilReset,
    presetIntervalsEnabled: !!task.presetIntervalsEnabled,
    presetIntervalValue: Number(task.presetIntervalValue || 0),
    presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId == null ? null : String(task.presetIntervalLastMilestoneId),
    presetIntervalNextSeq: Number(task.presetIntervalNextSeq || 0),
    timeGoalEnabled: !!task.timeGoalEnabled,
    timeGoalValue: Number(task.timeGoalValue || 0),
    timeGoalUnit: task.timeGoalUnit === "minute" ? "minute" : "hour",
    timeGoalPeriod: task.timeGoalPeriod === "day" ? "day" : "week",
    timeGoalMinutes: Number(task.timeGoalMinutes || 0),
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
    .map(
      (row) =>
        `${Number(row?.ts || 0)}|${Number(row?.ms || 0)}|${String(row?.name || "")}|${String(row?.note || "")}|${
          "xpDisqualifiedUntilReset" in (row || {}) ? (row?.xpDisqualifiedUntilReset ? "1" : "0") : ""
        }`
    )
    .join(",");
}

function normalizeHistoryEntry(row: unknown): HistoryEntry | null {
  if (!row || typeof row !== "object") return null;
  const next: HistoryEntry = {
    ts: Number.isFinite(Number((row as HistoryEntry).ts)) ? Math.floor(Number((row as HistoryEntry).ts)) : 0,
    name: String((row as HistoryEntry).name || ""),
    ms: Number.isFinite(Number((row as HistoryEntry).ms)) ? Math.max(0, Math.floor(Number((row as HistoryEntry).ms))) : 0,
  };
  const color = (row as HistoryEntry).color;
  const note = (row as HistoryEntry).note;
  if ("xpDisqualifiedUntilReset" in (row as Record<string, unknown>)) {
    next.xpDisqualifiedUntilReset = !!(row as HistoryEntry).xpDisqualifiedUntilReset;
  }
  if (typeof color === "string" && color.trim()) next.color = color;
  if (typeof note === "string" && note.trim()) next.note = note.trim();
  return next;
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
  try {
    await syncCurrentUserPlanCache(uid);
  } catch {
    writeTaskTimerPlanToStorage("free", { uid });
  }
  const snapshot = await loadUserWorkspace(uid);
  writeTaskTimerPlanToStorage(snapshot.plan, { uid });
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
  clearTaskTimerPlanStorage();
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
    theme: "purple" as const,
    menuButtonStyle: "square" as const,
    defaultTaskTimerFormat: "hour" as const,
    taskView: "list" as const,
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
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

function preferencesSyncSignature(prefs: NonNullable<typeof cachedPreferences>): string {
  const { updatedAtMs, ...rest } = prefs as NonNullable<typeof cachedPreferences> & { updatedAtMs?: unknown };
  void updatedAtMs;
  try {
    return JSON.stringify(rest);
  } catch {
    return String(Date.now());
  }
}

function debugLogCloudQueue(
  channel: "preferences" | "tasks" | "history",
  phase: "enqueue" | "start" | "drain" | "error" | "skip",
  detail?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.info(`[tasktimer-cloud-queue] ${channel}:${phase}`, {
      preferencesInFlight: !!inFlightPreferencesSync,
      preferencesQueued: !!queuedPreferencesSyncSnapshot,
      taskInFlight: !!inFlightTaskQueueSync,
      taskQueuedUpserts: queuedTaskUpsertsById.size,
      taskQueuedDeletes: queuedTaskDeletes.size,
      historyInFlight: !!inFlightHistoryQueueSync,
      historyQueued: queuedHistoryReplacementsByTaskId.size,
      ...(detail || {}),
    });
  } catch {
    // ignore debug logging failures
  }
}

function flushQueuedCloudPreferences(uid: string): void {
  if (inFlightPreferencesSync) return;
  const nextSnapshot = queuedPreferencesSyncSnapshot;
  if (!nextSnapshot) return;
  const nextSignature = preferencesSyncSignature(nextSnapshot);
  if (nextSignature === lastSuccessfulPreferencesSyncSignature) {
    debugLogCloudQueue("preferences", "skip", { reason: "duplicate-signature" });
    queuedPreferencesSyncSnapshot = null;
    return;
  }
  debugLogCloudQueue("preferences", "start", { uid });
  queuedPreferencesSyncSnapshot = null;
  const syncPromise = savePreferences(uid, nextSnapshot)
    .then(() => {
      lastSuccessfulPreferencesSyncSignature = nextSignature;
      debugLogCloudQueue("preferences", "drain", { uid, status: "ok" });
    })
    .catch(() => {
      savePendingPreferencesSync(nextSnapshot);
      debugLogCloudQueue("preferences", "error", { uid, status: "save-pending" });
    })
    .finally(() => {
      inFlightPreferencesSync = null;
      flushQueuedCloudPreferences(uid);
    });
  inFlightPreferencesSync = syncPromise;
}

function flushQueuedTaskSync(uid: string): void {
  if (inFlightTaskQueueSync) return;
  if (!queuedTaskDeletes.size && !queuedTaskUpsertsById.size) return;
  debugLogCloudQueue("tasks", "start", { uid });
  const syncPromise = (async () => {
    while (queuedTaskDeletes.size || queuedTaskUpsertsById.size) {
      if (queuedTaskDeletes.size) {
        const taskId = queuedTaskDeletes.values().next().value as string | undefined;
        if (!taskId) break;
        queuedTaskDeletes.delete(taskId);
        queuedTaskUpsertsById.delete(taskId);
        try {
          await deleteTask(uid, taskId);
          clearPendingTaskDelete(taskId);
        } catch {
          queuedTaskDeletes.add(taskId);
          debugLogCloudQueue("tasks", "error", { uid, op: "delete", taskId });
          break;
        }
        continue;
      }
      const nextEntry = queuedTaskUpsertsById.entries().next().value as [string, Task] | undefined;
      if (!nextEntry) break;
      const [taskId, taskRow] = nextEntry;
      queuedTaskUpsertsById.delete(taskId);
      try {
        await saveTask(uid, taskRow);
        clearPendingTaskSync(taskId);
      } catch {
        queuedTaskUpsertsById.set(taskId, taskRow);
        debugLogCloudQueue("tasks", "error", { uid, op: "upsert", taskId });
        break;
      }
    }
  })().finally(() => {
    debugLogCloudQueue("tasks", "drain", { uid });
    inFlightTaskQueueSync = null;
    if (queuedTaskDeletes.size || queuedTaskUpsertsById.size) {
      const activeUid = currentUid();
      if (activeUid) flushQueuedTaskSync(activeUid);
    }
  });
  inFlightTaskQueueSync = syncPromise;
  void trackInFlightTaskSync(syncPromise);
}

function enqueueTaskSync(uid: string, tasksById: Map<string, Task>, changedTaskIds: string[], removedTaskIds: string[]): void {
  for (const taskId of removedTaskIds) {
    queuedTaskDeletes.add(taskId);
    queuedTaskUpsertsById.delete(taskId);
  }
  for (const taskId of changedTaskIds) {
    if (!taskId || queuedTaskDeletes.has(taskId)) continue;
    const taskRow = tasksById.get(taskId);
    if (!taskRow) continue;
    queuedTaskUpsertsById.set(taskId, taskRow);
  }
  debugLogCloudQueue("tasks", "enqueue", {
    uid,
    changedCount: changedTaskIds.length,
    removedCount: removedTaskIds.length,
  });
  flushQueuedTaskSync(uid);
}

function flushQueuedHistorySync(uid: string): void {
  if (inFlightHistoryQueueSync) return;
  if (!queuedHistoryReplacementsByTaskId.size) return;
  debugLogCloudQueue("history", "start", { uid });
  const syncPromise = (async () => {
    while (queuedHistoryReplacementsByTaskId.size) {
      const nextEntry = queuedHistoryReplacementsByTaskId.entries().next().value as [string, HistoryEntry[]] | undefined;
      if (!nextEntry) break;
      const [taskId, rows] = nextEntry;
      queuedHistoryReplacementsByTaskId.delete(taskId);
      try {
        await replaceTaskHistory(uid, taskId, rows);
        clearPendingHistorySync(taskId);
      } catch {
        queuedHistoryReplacementsByTaskId.set(taskId, rows);
        debugLogCloudQueue("history", "error", { uid, taskId });
        break;
      }
    }
  })().finally(() => {
    debugLogCloudQueue("history", "drain", { uid });
    inFlightHistoryQueueSync = null;
    if (queuedHistoryReplacementsByTaskId.size) {
      const activeUid = currentUid();
      if (activeUid) flushQueuedHistorySync(activeUid);
    }
  });
  inFlightHistoryQueueSync = syncPromise;
}

function enqueueHistoryReplace(uid: string, taskId: string, rows: HistoryEntry[]): void {
  queuedHistoryReplacementsByTaskId.set(taskId, rows);
  debugLogCloudQueue("history", "enqueue", { uid, taskId, rows: rows.length });
  flushQueuedHistorySync(uid);
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
  queuedPreferencesSyncSnapshot = cachedPreferences;
  debugLogCloudQueue("preferences", "enqueue", { uid });
  flushQueuedCloudPreferences(uid);
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

type SaveTasksOptions = {
  deletedTaskIds?: string[];
};

export function saveTasks(tasks: Task[], opts?: SaveTasksOptions): void {
  const next = cloneTasks(tasks);
  const prevById = new Map(cloneTasks(cachedTasks || []).map((t) => [String(t.id || ""), t]));
  const nextById = new Map(next.map((t) => [String(t.id || ""), t]));
  cachedTasks = next;
  saveShadowTasks(cachedTasks);
  const removedTaskIds = Array.from(
    new Set(
      (Array.isArray(opts?.deletedTaskIds) ? opts!.deletedTaskIds : []).filter(
        (taskId) => !!taskId && prevById.has(taskId) && !nextById.has(taskId)
      )
    )
  );
  const changedTaskIds = Array.from(nextById.keys()).filter((taskId) => {
    if (!taskId) return false;
    return taskSignature(nextById.get(taskId)) !== taskSignature(prevById.get(taskId));
  });
  markPendingTaskSync(changedTaskIds);
  markPendingTaskDeletes(removedTaskIds);
  const uid = currentUid();
  if (!uid) return;
  if (!changedTaskIds.length && !removedTaskIds.length) return;
  enqueueTaskSync(uid, nextById, changedTaskIds, removedTaskIds);
}

export async function waitForPendingTaskSync(): Promise<void> {
  if (!inFlightTaskSyncs.size) return;
  await Promise.all(Array.from(inFlightTaskSyncs));
}

export function loadHistory(): HistoryByTaskId {
  return cachedHistory && typeof cachedHistory === "object" ? cachedHistory : {};
}

type SaveHistoryOptions = {
  showIndicator?: boolean;
};

function getTouchedHistoryTaskIds(
  prevHistory: HistoryByTaskId | null | undefined,
  nextHistory: HistoryByTaskId | null | undefined
): string[] {
  const prev = prevHistory || {};
  const next = nextHistory || {};
  return Array.from(new Set([...Object.keys(prev), ...Object.keys(next)].filter(Boolean))).filter((taskId) => {
    return historyRowsSignature(prev[taskId] || []) !== historyRowsSignature(next[taskId] || []);
  });
}

export function saveHistoryLocally(historyByTaskId: HistoryByTaskId): string[] {
  const prevHistory = cachedHistory || {};
  const nextHistory = historyByTaskId || {};
  const touchedTaskIds = getTouchedHistoryTaskIds(prevHistory, nextHistory);
  cachedHistory = nextHistory;
  saveShadowHistory(cachedHistory);
  markPendingHistorySync(touchedTaskIds);
  return touchedTaskIds;
}

export function saveHistory(historyByTaskId: HistoryByTaskId, opts?: SaveHistoryOptions): void {
  const touchedTaskIds = saveHistoryLocally(historyByTaskId);
  const uid = currentUid();
  if (!uid) return;
  if (!touchedTaskIds.length) return;
  void runHistorySave(async () => {
    touchedTaskIds.forEach((taskId) => {
      enqueueHistoryReplace(uid, taskId, Array.isArray(cachedHistory?.[taskId]) ? cachedHistory[taskId] : []);
    });
    if (inFlightHistoryQueueSync) await inFlightHistoryQueueSync;
  }, opts);
}

export function hasPendingTaskOrHistorySync(): boolean {
  return (
    Object.keys(loadPendingMap(PENDING_TASK_SYNC_KEY)).length > 0 ||
    Object.keys(loadPendingMap(PENDING_TASK_DELETES_KEY)).length > 0 ||
    Object.keys(loadPendingMap(PENDING_HISTORY_SYNC_KEY)).length > 0
  );
}

export function appendHistoryEntry(taskId: string, entry: HistoryEntry): void {
  const normalizedTaskId = String(taskId || "").trim();
  const normalizedEntry = normalizeHistoryEntry(entry);
  if (!normalizedTaskId || !normalizedEntry) return;
  const uid = currentUid();
  if (!uid) return;
  void appendHistoryEntryToCloud(uid, normalizedTaskId, normalizedEntry).catch(() => {
    // Keep local history state when direct cloud append is denied/unavailable.
  });
}

export async function saveHistoryAndWait(historyByTaskId: HistoryByTaskId, opts?: SaveHistoryOptions): Promise<void> {
  const touchedTaskIds = saveHistoryLocally(historyByTaskId);
  const uid = currentUid();
  if (!uid) return;
  if (!touchedTaskIds.length) return;
  await runHistorySave(async () => {
    touchedTaskIds.forEach((taskId) => {
      enqueueHistoryReplace(uid, taskId, Array.isArray(cachedHistory?.[taskId]) ? cachedHistory[taskId] : []);
    });
    while (inFlightHistoryQueueSync || touchedTaskIds.some((taskId) => queuedHistoryReplacementsByTaskId.has(taskId))) {
      if (inFlightHistoryQueueSync) await inFlightHistoryQueueSync;
      else break;
    }
  }, opts);
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
  const next: HistoryByTaskId = { ...(historyByTaskId || {}) };

  Object.keys(next).forEach((taskId) => {
    const arr = Array.isArray(next[taskId]) ? next[taskId] : [];
    next[taskId] = arr.filter((x) => !!x && typeof x === "object");
  });

  return next;
}
