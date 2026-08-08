import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import type { DeletedTaskMeta, Task } from "@/app/tasktimer/lib/types";
import { Timestamp } from "firebase-admin/firestore";

import type { BrainDumpWorkspaceRepository } from "./brainDumpTaskCreation";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function nullableInt(value: unknown) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

function normalizeTaskType(value: unknown) {
  return value === "once-off" ? "once-off" : "recurring";
}

function normalizePlannedStartDay(value: unknown) {
  const day = asString(value, 12).toLowerCase();
  return day === "mon" || day === "tue" || day === "wed" || day === "thu" || day === "fri" || day === "sat" || day === "sun" ? day : null;
}

function normalizeLocalDate(value: unknown) {
  const text = asString(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizePlannedStartByDay(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const next: Record<string, string | null> = {};
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const raw = (value as Record<string, unknown>)[day];
    if (raw === null) {
      next[day] = null;
      continue;
    }
    const text = asString(raw, 16);
    if (text) next[day] = text;
  }
  return Object.keys(next).length ? next : null;
}

function taskFirestoreTimestamp(task: Task) {
  const createdAtMs = Number.isFinite(Number(task.createdAtMs)) && Number(task.createdAtMs) > 0 ? Math.floor(Number(task.createdAtMs)) : Date.now();
  return Timestamp.fromMillis(createdAtMs);
}

function mapBrainDumpTaskToFirestore(task: Task) {
  const taskType = normalizeTaskType(task.taskType);
  const milestones = Array.isArray(task.milestones)
    ? task.milestones.map((milestone) => ({
        hours: Number.isFinite(Number(milestone?.hours)) ? Math.max(0, Number(milestone.hours)) : 0,
        description: asString(milestone?.description, 500),
        id: asString(milestone?.id, 120) || undefined,
        createdSeq: Number.isFinite(Number(milestone?.createdSeq)) ? Math.max(1, Math.floor(Number(milestone.createdSeq))) : undefined,
        alertsEnabled: milestone?.alertsEnabled !== false,
      }))
    : [];
  const createdAt = taskFirestoreTimestamp(task);
  return stripUndefinedValues({
    id: asString(task.id, 120),
    name: asString(task.name, 200) || "Task",
    order: Number.isFinite(Number(task.order)) ? Math.floor(Number(task.order)) : 0,
    collapsed: !!task.collapsed,
    color: task.color == null ? null : String(task.color),
    accumulatedMs: Number.isFinite(Number(task.accumulatedMs)) ? Math.max(0, Math.floor(Number(task.accumulatedMs))) : 0,
    running: !!task.running,
    startMs: nullableInt(task.startMs),
    hasStarted: !!task.hasStarted,
    checkpointsEnabled: !!task.milestonesEnabled,
    checkpointTimeUnit: task.milestoneTimeUnit === "minute" ? "minute" : "hour",
    checkpoints: milestones,
    checkpointSoundEnabled: !!task.checkpointSoundEnabled,
    checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
    timeGoalAction: "confirmModal",
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
    timeGoalCompletedDayKey: task.timeGoalCompletedDayKey == null ? null : String(task.timeGoalCompletedDayKey).trim() || null,
    timeGoalCompletedWeekKey: task.timeGoalCompletedWeekKey == null ? null : String(task.timeGoalCompletedWeekKey).trim() || null,
    timeGoalCompletedAtMs: nullableInt(task.timeGoalCompletedAtMs),
    timeGoalCompletedReason: task.timeGoalCompletedReason === "reset" || task.timeGoalCompletedReason === "goal" ? task.timeGoalCompletedReason : null,
    timeGoalCompletedElapsedMs: nullableInt(task.timeGoalCompletedElapsedMs),
    resumePendingSinceDayKey: normalizeLocalDate(task.resumePendingSinceDayKey),
    taskType,
    onceOffDay: taskType === "once-off" ? normalizePlannedStartDay(task.onceOffDay) : null,
    onceOffTargetDate: taskType === "once-off" ? normalizeLocalDate(task.onceOffTargetDate) : null,
    plannedStartDay: normalizePlannedStartDay(task.plannedStartDay),
    plannedStartTime: task.plannedStartTime == null ? null : asString(task.plannedStartTime, 16) || null,
    plannedStartByDay: normalizePlannedStartByDay(task.plannedStartByDay),
    plannedStartOpenEnded: !!task.plannedStartOpenEnded,
    plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
    sharedSourceOwnerUid: task.sharedSourceOwnerUid == null ? null : String(task.sharedSourceOwnerUid).trim() || null,
    sharedSourceTaskId: task.sharedSourceTaskId == null ? null : String(task.sharedSourceTaskId).trim() || null,
    sharedSourceShareDocId: task.sharedSourceShareDocId == null ? null : String(task.sharedSourceShareDocId).trim() || null,
    sharedSourceImportedAtMs:
      task.sharedSourceImportedAtMs == null || !Number.isFinite(Number(task.sharedSourceImportedAtMs))
        ? null
        : Math.max(0, Math.floor(Number(task.sharedSourceImportedAtMs))),
    bgTimeGoalPushEligible: false,
    bgTimeGoalPushDueAtMs: null,
    bgTimeGoalPushSentAtMs: null,
    bgTimeGoalPushSentDueAtMs: null,
    createdAt,
    updatedAt: Timestamp.now(),
    schemaVersion: 1,
  });
}

function stripUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefinedValues) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => typeof entryValue !== "undefined")
      .map(([key, entryValue]) => [key, stripUndefinedValues(entryValue)])
  ) as T;
}

export function createFirestoreBrainDumpWorkspaceRepository(): BrainDumpWorkspaceRepository {
  const db = getFirebaseAdminDb();

  function tasksCollection(uid: string) {
    return db.collection("users").doc(uid).collection("tasks");
  }

  function deletedTasksCollection(uid: string) {
    return db.collection("users").doc(uid).collection("deletedTasks");
  }

  return {
    async loadTasks(uid: string) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return [];
      const snap = await tasksCollection(safeUid).get();
      return snap.docs.map((docSnap: { id: string; data: () => Record<string, unknown> }) => ({
        ...docSnap.data(),
        id: asString(docSnap.data().id, 120) || docSnap.id,
      })) as Task[];
    },
    async loadTaskStatusMeta(uid: string) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return {};
      const snap = await deletedTasksCollection(safeUid).get();
      const meta: DeletedTaskMeta = {};
      for (const docSnap of snap.docs as Array<{ id: string; data: () => Record<string, unknown> }>) {
        const data = docSnap.data();
        const name = asString(data.name, 200) || asString((data.taskSnapshot as { name?: unknown } | undefined)?.name, 200);
        if (!name) continue;
        meta[docSnap.id] = {
          name,
          color: typeof data.color === "string" ? data.color : null,
          deletedAt: Math.max(0, Math.floor(Number(data.deletedAt || 0) || 0)),
          state: data.state === "archived" ? "archived" : "deleted",
          taskSnapshot: (data.taskSnapshot as Task | null | undefined) || null,
        };
      }
      return meta;
    },
    async saveTasks(uid: string, tasks: Task[]) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return;
      const batch = db.batch();
      for (const task of tasks) {
        const taskId = asString(task.id, 120);
        if (!taskId) continue;
        batch.set(tasksCollection(safeUid).doc(taskId), mapBrainDumpTaskToFirestore(task), { merge: true });
      }
      await batch.commit();
    },
    async saveTask(uid: string, task: Task) {
      const safeUid = asString(uid, 120);
      const taskId = asString(task.id, 120);
      if (!safeUid || !taskId) return;
      await tasksCollection(safeUid).doc(taskId).set(mapBrainDumpTaskToFirestore(task), { merge: true });
    },
    async deleteTasks(uid: string, taskIds: string[]) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return;
      const batch = db.batch();
      for (const taskId of taskIds.map((id) => asString(id, 120)).filter(Boolean)) {
        batch.delete(tasksCollection(safeUid).doc(taskId));
      }
      await batch.commit();
    },
    async hasTaskDependents(uid: string, taskId: string) {
      const safeUid = asString(uid, 120);
      const safeTaskId = asString(taskId, 120);
      if (!safeUid || !safeTaskId) return true;
      const legacyHistorySnap = await tasksCollection(safeUid).doc(safeTaskId).collection("history").limit(1).get();
      if (!legacyHistorySnap.empty) return true;
      const canonicalHistorySnap = await db
        .collection("users")
        .doc(safeUid)
        .collection("historyEntries")
        .where("taskId", "==", safeTaskId)
        .limit(1)
        .get();
      return !canonicalHistorySnap.empty;
    },
  };
}
