import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { validateUsername } from "@/lib/username";
import { claimUsernameClient } from "./usernameClaim";

import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "./types";
import { DEFAULT_REWARD_PROGRESS, normalizeRewardProgress, type RewardProgressV1 } from "./rewards";

export type UserPreferencesV1 = {
  schemaVersion: 1;
  theme: "purple" | "cyan";
  menuButtonStyle: "parallelogram" | "square";
  defaultTaskTimerFormat: "day" | "hour" | "minute";
  taskView: "list" | "tile";
  dynamicColorsEnabled: boolean;
  autoFocusOnTaskLaunchEnabled: boolean;
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  modeSettings: Record<string, unknown> | null;
  rewards: RewardProgressV1;
  updatedAtMs: number;
};

export type DashboardConfig = {
  order: string[];
  widgets?: Record<string, unknown>;
};

export type TaskUiConfig = {
  historyRangeDaysByTaskId: Record<string, 7 | 14>;
  historyRangeModeByTaskId: Record<string, "entries" | "day">;
  pinnedHistoryTaskIds: string[];
  customTaskNames?: string[];
};

export type WorkspaceSnapshot = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  preferences: UserPreferencesV1 | null;
  dashboard: DashboardConfig | null;
  taskUi: TaskUiConfig | null;
};

function describeError(error: unknown): Record<string, unknown> {
  if (!error) return { value: error };
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; customData?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof withCode.code === "string" ? withCode.code : withCode.code,
      stack: error.stack || null,
      customData: withCode.customData ?? null,
    };
  }
  if (typeof error === "object") {
    try {
      return { ...(error as Record<string, unknown>) };
    } catch {
      return { value: String(error) };
    }
  }
  return { value: error };
}

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function usersDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid);
}

function taskDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "tasks", taskId);
}

function tasksCollection(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "tasks");
}

function taskHistoryCollection(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "tasks", taskId, "history");
}

function normalizeHistoryEntryRecord(row: unknown): HistoryEntry | null {
  if (!row || typeof row !== "object") return null;
  const next: HistoryEntry = {
    ts: Number.isFinite(Number((row as HistoryEntry).ts)) ? Math.floor(Number((row as HistoryEntry).ts)) : 0,
    name: String((row as HistoryEntry).name || ""),
    ms: Number.isFinite(Number((row as HistoryEntry).ms)) ? Math.max(0, Math.floor(Number((row as HistoryEntry).ms))) : 0,
  };
  const color = (row as HistoryEntry).color;
  const note = (row as HistoryEntry).note;
  if (typeof color === "string" && color.trim()) next.color = color;
  if (typeof note === "string" && note.trim()) next.note = note.trim();
  return next;
}

function deletedTaskDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "deletedTasks", taskId);
}

function preferencesDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "preferences", "v1");
}

function dashboardDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "dashboard", "v1");
}

function taskUiDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "taskUi", "v1");
}

function normalizeEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

function emailLookupDocKey(email: string): string {
  return encodeURIComponent(normalizeEmail(email));
}

function sanitizeUsernameCandidate(raw: unknown): string {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  const cleaned = value
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 20);
}

function buildUsernameClaimCandidates(uid: string, displayName: string, email: string): string[] {
  const uidSuffix = String(uid || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6) || "user";
  const emailLocalPart = String(email || "").trim().split("@")[0] || "";
  const baseCandidates = [
    sanitizeUsernameCandidate(displayName),
    sanitizeUsernameCandidate(emailLocalPart),
  ].filter(Boolean);
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: string) => {
    const next = String(candidate || "").trim().toLowerCase();
    if (!next || seen.has(next)) return;
    seen.add(next);
    candidates.push(next);
  };

  for (const base of baseCandidates) {
    pushCandidate(base);
    if (base.length >= 3) {
      pushCandidate(`${base.slice(0, Math.max(0, 20 - uidSuffix.length - 1))}_${uidSuffix}`);
    }
  }

  pushCandidate(`user_${uidSuffix}`);
  return candidates.filter((candidate) => !validateUsername(candidate));
}

async function claimMissingUsername(uid: string): Promise<void> {
  if (typeof window === "undefined" || !uid) return;
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  if (!currentUser || String(currentUser.uid || "").trim() !== uid) return;

  const displayName = String(currentUser.displayName || "").trim();
  const email = String(currentUser.email || "").trim().toLowerCase();
  const candidates = buildUsernameClaimCandidates(uid, displayName, email);
  if (!candidates.length) return;

  for (const username of candidates) {
    try {
      await claimUsernameClient(username);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (
        message === "That username is already taken."
        || message === "Username is required."
        || message === "Username must be 3 to 20 characters and use only letters, numbers, or underscores."
        || message === "That username is reserved. Please choose another."
      ) {
        continue;
      }
      return;
    }
  }
}

async function upsertUserEmailLookup(uid: string): Promise<void> {
  const db = dbOrNull();
  if (!db || !uid) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping userEmailLookup write", {
        hasDb: !!db,
        uid,
      });
    }
    return;
  }
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const authEmail = normalizeEmail(currentUser?.email);
  if (!authEmail) return;
  const authDisplayName = currentUser?.displayName == null ? null : String(currentUser.displayName || "").trim() || null;
  try {
    await setDoc(
      doc(db, "userEmailLookup", emailLookupDocKey(authEmail)),
      {
        uid,
        email: authEmail,
        displayName: authDisplayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[tasktimer-cloud] Failed to write userEmailLookup", {
        uid,
        email: authEmail,
        error: describeError(error),
      });
    }
    throw error;
  }
}

function asBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function normalizeTimeGoalUnit(raw: unknown): "minute" | "hour" {
  return raw === "minute" ? "minute" : "hour";
}

function normalizeTimeGoalPeriod(raw: unknown): "day" | "week" {
  return raw === "day" ? "day" : "week";
}

function normalizeTimeGoalValue(raw: unknown): number {
  return Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : 0;
}

function normalizeThemeMode(raw: unknown): UserPreferencesV1["theme"] {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "cyan" || value === "command") return "cyan";
  return "purple";
}

function asTaskUi(input: unknown): TaskUiConfig | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  return {
    historyRangeDaysByTaskId: (obj.historyRangeDaysByTaskId as Record<string, 7 | 14>) || {},
    historyRangeModeByTaskId: (obj.historyRangeModeByTaskId as Record<string, "entries" | "day">) || {},
    pinnedHistoryTaskIds: Array.isArray(obj.pinnedHistoryTaskIds) ? (obj.pinnedHistoryTaskIds as string[]) : [],
    customTaskNames: Array.isArray(obj.customTaskNames) ? (obj.customTaskNames as string[]) : [],
  };
}

function mapTaskFromFirestore(taskId: string, raw: Record<string, unknown>): Task {
  const row: Record<string, unknown> = { ...raw };
  row.id = typeof row.id === "string" && row.id ? row.id : taskId;

  const checkpointsEnabled = row.checkpointsEnabled;
  if (typeof checkpointsEnabled === "boolean" && typeof row.milestonesEnabled !== "boolean") {
    row.milestonesEnabled = checkpointsEnabled;
  }

  const checkpointTimeUnit = row.checkpointTimeUnit;
  if (
    (checkpointTimeUnit === "day" || checkpointTimeUnit === "hour" || checkpointTimeUnit === "minute") &&
    row.milestoneTimeUnit !== "day" &&
    row.milestoneTimeUnit !== "hour" &&
    row.milestoneTimeUnit !== "minute"
  ) {
    row.milestoneTimeUnit = checkpointTimeUnit;
  }

  if (Array.isArray(row.checkpoints) && !Array.isArray(row.milestones)) {
    row.milestones = row.checkpoints;
  }

  const presetLastCheckpointId = row.presetIntervalLastCheckpointId;
  if (
    (presetLastCheckpointId === null || typeof presetLastCheckpointId === "string") &&
    row.presetIntervalLastMilestoneId === undefined
  ) {
    row.presetIntervalLastMilestoneId = presetLastCheckpointId;
  }

  row.xpDisqualifiedUntilReset = !!row.xpDisqualifiedUntilReset;
  row.timeGoalEnabled = !!row.timeGoalEnabled;
  row.timeGoalValue = normalizeTimeGoalValue(row.timeGoalValue);
  row.timeGoalUnit = normalizeTimeGoalUnit(row.timeGoalUnit);
  row.timeGoalPeriod = normalizeTimeGoalPeriod(row.timeGoalPeriod);
  row.timeGoalMinutes = normalizeTimeGoalValue(row.timeGoalMinutes);

  return row as Task;
}

function mapTaskToFirestore(task: Task): Record<string, unknown> {
  const source = task as unknown as Record<string, unknown>;
  const modeRaw = String(source.mode || "").trim();
  const mode = modeRaw === "mode2" || modeRaw === "mode3" ? modeRaw : "mode1";

  // Firestore rules for users/{uid}/tasks/{taskId} are strict (`hasOnly(...)`), so
  // only persist explicitly allowed keys to prevent permission-denied on legacy/extra fields.
  const row: Record<string, unknown> = {
    id: String(task.id || ""),
    name: String(task.name || ""),
    order: Number.isFinite(Number(task.order)) ? Math.floor(Number(task.order)) : 0,
    collapsed: !!task.collapsed,
    color: task.color == null ? null : String(task.color),
    accumulatedMs: Number.isFinite(Number(task.accumulatedMs)) ? Math.max(0, Math.floor(Number(task.accumulatedMs))) : 0,
    running: !!task.running,
    startMs: task.startMs == null ? null : (Number.isFinite(Number(task.startMs)) ? Math.floor(Number(task.startMs)) : null),
    hasStarted: !!task.hasStarted,
    checkpointsEnabled: !!task.milestonesEnabled,
    checkpointTimeUnit:
      task.milestoneTimeUnit === "day" ? "day" : task.milestoneTimeUnit === "minute" ? "minute" : "hour",
    checkpoints: Array.isArray(task.milestones) ? task.milestones : [],
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
    presetIntervalValue: Number.isFinite(Number(task.presetIntervalValue)) ? Math.max(0, Number(task.presetIntervalValue)) : 0,
    presetIntervalLastCheckpointId: task.presetIntervalLastMilestoneId == null ? null : String(task.presetIntervalLastMilestoneId),
    presetIntervalNextSeq:
      Number.isFinite(Number(task.presetIntervalNextSeq)) && Number(task.presetIntervalNextSeq) > 0
        ? Math.floor(Number(task.presetIntervalNextSeq))
        : 1,
    timeGoalEnabled: !!task.timeGoalEnabled,
    timeGoalValue: Number.isFinite(Number(task.timeGoalValue)) ? Math.max(0, Number(task.timeGoalValue)) : 0,
    timeGoalUnit: task.timeGoalUnit === "minute" ? "minute" : "hour",
    timeGoalPeriod: task.timeGoalPeriod === "day" ? "day" : "week",
    timeGoalMinutes: Number.isFinite(Number(task.timeGoalMinutes)) ? Math.max(0, Number(task.timeGoalMinutes)) : 0,
    mode,
  };
  return row;
}

async function upsertUserRoot(uid: string, patch?: Record<string, unknown>) {
  const root = usersDoc(uid);
  if (!root) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping user root write because document ref is unavailable", {
        uid,
      });
    }
    return;
  }
  const db = dbOrNull();
  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping user root write because Firestore is unavailable", {
        uid,
      });
    }
    return;
  }
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const authEmail = normalizeEmail(currentUser?.email);
  const authDisplayName = currentUser?.displayName == null ? null : String(currentUser.displayName || "").trim() || null;
  const existing = await getDoc(root);
  const prevEmail = normalizeEmail(existing.exists() ? existing.get("email") : "");

  if (prevEmail && authEmail && prevEmail !== authEmail) {
    try {
      await deleteDoc(doc(db, "userEmailLookup", emailLookupDocKey(prevEmail)));
    } catch {
      // Best-effort cleanup; stale lookup removal should not block profile updates.
    }
  }

  try {
    await setDoc(
      root,
      {
        schemaVersion: 1,
        ...(authEmail ? { email: authEmail } : {}),
        displayName: authDisplayName,
        createdAt: existing.exists() ? existing.get("createdAt") || serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(patch || {}),
      },
      { merge: true }
    );

    await upsertUserEmailLookup(uid);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[tasktimer-cloud] Failed to upsert user root", {
        uid,
        hasEmail: !!authEmail,
        patchKeys: Object.keys(patch || {}),
        error: describeError(error),
      });
    }
    throw error;
  }
}

export async function ensureUserProfileIndex(uid: string): Promise<void> {
  if (!uid) return;
  await upsertUserEmailLookup(uid);
  try {
    await upsertUserRoot(uid);
  } catch {
    // Keep email lookup available even if root profile shape is currently rejected by rules.
  }
  try {
    const root = usersDoc(uid);
    if (!root) return;
    const snap = await getDoc(root);
    const usernameKey = snap.exists() ? String(snap.get("usernameKey") || "").trim() : "";
    if (usernameKey) return;
    await claimMissingUsername(uid);
  } catch {
    // Username bootstrap is best-effort and should not block sign-in/profile indexing.
  }
}

export async function loadUserWorkspace(uid: string): Promise<WorkspaceSnapshot> {
  const db = dbOrNull();
  if (!db || !uid) {
    return {
      tasks: [],
      historyByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    };
  }

  const tasksSnap = await getDocs(collection(db, "users", uid, "tasks"));
  const tasks: Task[] = [];
  const historyByTaskId: HistoryByTaskId = {};
  const historyLoads = tasksSnap.docs.map(async (d) => {
    const task = mapTaskFromFirestore(d.id, d.data() as Record<string, unknown>);
    const histSnap = await getDocs(query(collection(db, "users", uid, "tasks", d.id, "history")));
    const history = histSnap.docs
      .map((h) => normalizeHistoryEntryRecord(h.data()))
      .filter((row): row is HistoryEntry => !!row)
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    return { task, taskId: d.id, history };
  });

  const [historyRows, deletedSnap, prefSnap, dashboardSnap, taskUiSnap] = await Promise.all([
    Promise.all(historyLoads),
    getDocs(collection(db, "users", uid, "deletedTasks")),
    getDoc(preferencesDoc(uid)!),
    getDoc(dashboardDoc(uid)!),
    getDoc(taskUiDoc(uid)!),
  ]);

  historyRows.forEach((row) => {
    tasks.push(row.task);
    historyByTaskId[row.taskId] = row.history;
  });

  const deletedTaskMeta: DeletedTaskMeta = {};
  for (const d of deletedSnap.docs) {
    const row = d.data() as Record<string, unknown>;
    deletedTaskMeta[d.id] = {
      name: asString(row.name),
      color: typeof row.color === "string" ? row.color : null,
      deletedAt: Number(row.deletedAt || 0),
    };
  }

  const preferences: UserPreferencesV1 | null = prefSnap.exists()
    ? {
        schemaVersion: 1,
        theme: normalizeThemeMode(prefSnap.get("theme")),
        menuButtonStyle: prefSnap.get("menuButtonStyle") === "square" ? "square" : "parallelogram",
        defaultTaskTimerFormat:
          prefSnap.get("defaultTaskTimerFormat") === "day" || prefSnap.get("defaultTaskTimerFormat") === "minute"
            ? prefSnap.get("defaultTaskTimerFormat")
            : "hour",
        taskView: prefSnap.get("taskView") === "tile" ? "tile" : "list",
        dynamicColorsEnabled: asBool(prefSnap.get("dynamicColorsEnabled"), true),
        autoFocusOnTaskLaunchEnabled: asBool(prefSnap.get("autoFocusOnTaskLaunchEnabled"), true),
        checkpointAlertSoundEnabled: asBool(prefSnap.get("checkpointAlertSoundEnabled"), true),
        checkpointAlertToastEnabled: asBool(prefSnap.get("checkpointAlertToastEnabled"), true),
        modeSettings:
          prefSnap.get("modeSettings") && typeof prefSnap.get("modeSettings") === "object"
            ? (prefSnap.get("modeSettings") as Record<string, unknown>)
            : null,
        rewards: normalizeRewardProgress(prefSnap.get("rewards") || DEFAULT_REWARD_PROGRESS),
        updatedAtMs: Number(prefSnap.get("updatedAtMs") || Date.now()),
      }
    : null;

  const dashboard: DashboardConfig | null = dashboardSnap.exists()
    ? {
        order: Array.isArray(dashboardSnap.get("order")) ? (dashboardSnap.get("order") as string[]) : [],
        widgets:
          dashboardSnap.get("widgets") && typeof dashboardSnap.get("widgets") === "object"
            ? (dashboardSnap.get("widgets") as Record<string, unknown>)
            : undefined,
      }
    : null;

  const taskUi = taskUiSnap.exists() ? asTaskUi(taskUiSnap.data()) : null;

  return { tasks, historyByTaskId, deletedTaskMeta, preferences, dashboard, taskUi };
}

export async function saveTask(uid: string, task: Task): Promise<void> {
  const ref = taskDoc(uid, String(task.id || ""));
  if (!ref) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping task save because task ref is unavailable", {
        uid,
        taskId: String(task.id || ""),
      });
    }
    return;
  }
  await upsertUserRoot(uid);
  const taskRow = mapTaskToFirestore(task);
  try {
    const existing = await getDoc(ref);
    await setDoc(
      ref,
      {
        ...taskRow,
        createdAt: existing.exists() ? existing.get("createdAt") || serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      },
    );
    if (process.env.NODE_ENV !== "production") {
      console.info("[tasktimer-cloud] Task saved", {
        uid,
        taskId: String(task.id || ""),
        databaseRowKeys: Object.keys(taskRow),
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const describedError = describeError(error);
      console.error("[tasktimer-cloud] Failed to save task", {
        uid,
        taskId: String(task.id || ""),
        databaseRowKeys: Object.keys(taskRow),
        taskRow,
        error: describedError,
        errorMessage: describedError.message ?? null,
        errorCode: describedError.code ?? null,
      });
    }
    throw error;
  }
}

export function subscribeToTaskCollection(uid: string, listener: () => void): () => void {
  const col = tasksCollection(uid);
  if (!col || !uid) return () => {};
  const unsub = onSnapshot(
    col,
    () => {
      listener();
    },
    () => {
      // Ignore transient listener failures; focus/poll refresh remains as fallback.
    }
  );
  return () => {
    try {
      unsub();
    } catch {
      // ignore unsubscribe failures
    }
  };
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  const ref = taskDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function appendHistoryEntry(uid: string, taskId: string, entry: HistoryEntry): Promise<void> {
  const col = taskHistoryCollection(uid, taskId);
  if (!col) return;
  const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : Date.now();
  const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
  const name = String(entry?.name || "");
  const color = entry?.color == null ? null : String(entry.color);
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  const entryId = `${ts}-${Math.max(0, Math.floor(Math.random() * 1_000_000))}`;
  const payload: Record<string, unknown> = { ts, ms, name, createdAt: serverTimestamp() };
  if (color) payload.color = color;
  if (note) payload.note = note;
  await setDoc(doc(col, entryId), payload);
}

function historyEntryFingerprint(entry: HistoryEntry): string {
  const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
  const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
  const name = String(entry?.name || "");
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  return `${ts}|${ms}|${name}|${note}`;
}

function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function stableHistoryEntryDocId(entry: HistoryEntry): string {
  const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
  const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
  return `${ts}-${ms}-${fnv1a32(historyEntryFingerprint(entry))}`;
}

export async function replaceTaskHistory(uid: string, taskId: string, entries: HistoryEntry[]): Promise<void> {
  const col = taskHistoryCollection(uid, taskId);
  if (!col) return;
  const deduped: HistoryEntry[] = [];
  const seen = new Set<string>();
  (entries || []).forEach((entry) => {
    const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
    const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : -1;
    if (ts <= 0 || ms < 0) return;
    const normalized: HistoryEntry = {
      ...entry,
      ts,
      ms,
      name: String(entry?.name || ""),
      ...(entry?.color != null ? { color: String(entry.color) } : {}),
      ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
    };
    const key = historyEntryFingerprint(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(normalized);
  });
  const current = await getDocs(col);
  await Promise.all(current.docs.map((d) => deleteDoc(d.ref)));
  await Promise.all(
    deduped.map((entry) =>
      setDoc(doc(col, stableHistoryEntryDocId(entry)), {
        ts: Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0,
        ms: Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0,
        name: String(entry?.name || ""),
        ...(entry?.color != null ? { color: String(entry.color) } : {}),
        ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
        createdAt: serverTimestamp(),
      })
    )
  );
}

export async function saveDeletedTaskMeta(uid: string, taskId: string, row: DeletedTaskMeta[string]): Promise<void> {
  const ref = deletedTaskDoc(uid, taskId);
  if (!ref) return;
  await setDoc(
    ref,
    {
      ...row,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteDeletedTaskMeta(uid: string, taskId: string): Promise<void> {
  const ref = deletedTaskDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function savePreferences(uid: string, prefs: UserPreferencesV1): Promise<void> {
  const ref = preferencesDoc(uid);
  if (!ref) return;
  const normalizedRewards = normalizeRewardProgress(prefs.rewards || DEFAULT_REWARD_PROGRESS);
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      ...prefs,
      rewards: normalizedRewards,
      schemaVersion: 1,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await setDoc(
    usersDoc(uid)!,
    {
      rewardCurrentRankId: normalizedRewards.currentRankId,
      rewardTotalXp: normalizedRewards.totalXp,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadPreferences(uid: string): Promise<UserPreferencesV1 | null> {
  const ref = preferencesDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    schemaVersion: 1,
    theme: normalizeThemeMode(data.theme),
    menuButtonStyle: data.menuButtonStyle === "square" ? "square" : "parallelogram",
    defaultTaskTimerFormat:
      data.defaultTaskTimerFormat === "day" || data.defaultTaskTimerFormat === "minute"
        ? data.defaultTaskTimerFormat
        : "hour",
    taskView: data.taskView === "tile" ? "tile" : "list",
    dynamicColorsEnabled: asBool(data.dynamicColorsEnabled, true),
    autoFocusOnTaskLaunchEnabled: asBool(data.autoFocusOnTaskLaunchEnabled, true),
    checkpointAlertSoundEnabled: asBool(data.checkpointAlertSoundEnabled, true),
    checkpointAlertToastEnabled: asBool(data.checkpointAlertToastEnabled, true),
    modeSettings: data.modeSettings && typeof data.modeSettings === "object" ? (data.modeSettings as Record<string, unknown>) : null,
    rewards: normalizeRewardProgress(data.rewards || DEFAULT_REWARD_PROGRESS),
    updatedAtMs: Number(data.updatedAtMs || Date.now()),
  };
}

export async function saveDashboard(uid: string, cfg: DashboardConfig): Promise<void> {
  const ref = dashboardDoc(uid);
  if (!ref) return;
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      order: Array.isArray(cfg.order) ? cfg.order : [],
      widgets: cfg.widgets || {},
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    },
    { merge: true }
  );
}

export async function loadDashboard(uid: string): Promise<DashboardConfig | null> {
  const ref = dashboardDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    order: Array.isArray(data.order) ? (data.order as string[]) : [],
    widgets: data.widgets && typeof data.widgets === "object" ? (data.widgets as Record<string, unknown>) : undefined,
  };
}

export async function saveTaskUi(uid: string, cfg: TaskUiConfig): Promise<void> {
  const ref = taskUiDoc(uid);
  if (!ref) return;
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      historyRangeDaysByTaskId: cfg.historyRangeDaysByTaskId || {},
      historyRangeModeByTaskId: cfg.historyRangeModeByTaskId || {},
      pinnedHistoryTaskIds: cfg.pinnedHistoryTaskIds || [],
      customTaskNames: Array.isArray(cfg.customTaskNames) ? cfg.customTaskNames.slice(0, 5) : [],
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    },
    { merge: true }
  );
}

export async function loadTaskUi(uid: string): Promise<TaskUiConfig | null> {
  const ref = taskUiDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return asTaskUi(snap.data());
}
