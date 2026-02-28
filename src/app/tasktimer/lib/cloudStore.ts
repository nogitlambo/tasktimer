import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "./types";

export type UserPreferencesV1 = {
  schemaVersion: 1;
  theme: "light" | "dark";
  defaultTaskTimerFormat: "day" | "hour" | "minute";
  dynamicColorsEnabled: boolean;
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  modeSettings: Record<string, unknown> | null;
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

function taskHistoryCollection(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "tasks", taskId, "history");
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

function asBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
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

  return row as Task;
}

function mapTaskToFirestore(task: Task): Record<string, unknown> {
  const row = { ...(task as unknown as Record<string, unknown>) };
  row.checkpointsEnabled = !!task.milestonesEnabled;
  row.checkpointTimeUnit = task.milestoneTimeUnit === "day" ? "day" : task.milestoneTimeUnit === "minute" ? "minute" : "hour";
  row.checkpoints = Array.isArray(task.milestones) ? task.milestones : [];
  row.presetIntervalLastCheckpointId = task.presetIntervalLastMilestoneId ?? null;

  delete row.milestonesEnabled;
  delete row.milestoneTimeUnit;
  delete row.milestones;
  delete row.presetIntervalLastMilestoneId;

  return row;
}

async function upsertUserRoot(uid: string, patch?: Record<string, unknown>) {
  const root = usersDoc(uid);
  if (!root) return;
  await setDoc(
    root,
    {
      schemaVersion: 1,
      updatedAt: serverTimestamp(),
      ...(patch || {}),
    },
    { merge: true }
  );
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
      .map((h) => h.data() as HistoryEntry)
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
        theme: prefSnap.get("theme") === "light" ? "light" : "dark",
        defaultTaskTimerFormat:
          prefSnap.get("defaultTaskTimerFormat") === "day" || prefSnap.get("defaultTaskTimerFormat") === "minute"
            ? prefSnap.get("defaultTaskTimerFormat")
            : "hour",
        dynamicColorsEnabled: asBool(prefSnap.get("dynamicColorsEnabled"), true),
        checkpointAlertSoundEnabled: asBool(prefSnap.get("checkpointAlertSoundEnabled"), true),
        checkpointAlertToastEnabled: asBool(prefSnap.get("checkpointAlertToastEnabled"), true),
        modeSettings:
          prefSnap.get("modeSettings") && typeof prefSnap.get("modeSettings") === "object"
            ? (prefSnap.get("modeSettings") as Record<string, unknown>)
            : null,
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
  if (!ref) return;
  await upsertUserRoot(uid);
  const taskRow = mapTaskToFirestore(task);
  await setDoc(
    ref,
    {
      ...taskRow,
      createdAt: taskRow.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    },
    { merge: true }
  );
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  const ref = taskDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function appendHistoryEntry(uid: string, taskId: string, entry: HistoryEntry): Promise<void> {
  const col = taskHistoryCollection(uid, taskId);
  if (!col) return;
  const entryId = `${Number(entry.ts || Date.now())}-${Math.max(0, Math.floor(Math.random() * 1_000_000))}`;
  await setDoc(doc(col, entryId), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export async function replaceTaskHistory(uid: string, taskId: string, entries: HistoryEntry[]): Promise<void> {
  const col = taskHistoryCollection(uid, taskId);
  if (!col) return;
  const current = await getDocs(col);
  await Promise.all(current.docs.map((d) => deleteDoc(d.ref)));
  await Promise.all(
    (entries || []).map((entry, idx) =>
      setDoc(doc(col, `${Number(entry.ts || Date.now())}-${idx}`), {
        ...entry,
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
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      ...prefs,
      schemaVersion: 1,
      updatedAtMs: Date.now(),
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
    theme: data.theme === "light" ? "light" : "dark",
    defaultTaskTimerFormat:
      data.defaultTaskTimerFormat === "day" || data.defaultTaskTimerFormat === "minute"
        ? data.defaultTaskTimerFormat
        : "hour",
    dynamicColorsEnabled: asBool(data.dynamicColorsEnabled, true),
    checkpointAlertSoundEnabled: asBool(data.checkpointAlertSoundEnabled, true),
    checkpointAlertToastEnabled: asBool(data.checkpointAlertToastEnabled, true),
    modeSettings: data.modeSettings && typeof data.modeSettings === "object" ? (data.modeSettings as Record<string, unknown>) : null,
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
