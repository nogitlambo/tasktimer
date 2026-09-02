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

function normalizeScheduleStoredTime(value: unknown) {
  const text = asString(value, 16);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

const SCHEDULE_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type ScheduleDay = (typeof SCHEDULE_DAY_ORDER)[number];

function getPersistedPlannedStartTime(task: Task): string | null {
  const plannedStartTime = normalizeScheduleStoredTime(task.plannedStartTime);
  if (plannedStartTime) return plannedStartTime;

  const byDay = normalizePlannedStartByDay(task.plannedStartByDay);
  if (!byDay) return null;

  const times = SCHEDULE_DAY_ORDER.flatMap((day) => {
    const time = normalizeScheduleStoredTime(byDay[day]);
    return time ? [time] : [];
  });
  const uniqueTimes = Array.from(new Set(times));
  return uniqueTimes.length === 1 ? uniqueTimes[0] || null : null;
}

function getTaskPlannedStartByDay(task: Task): Record<ScheduleDay, string | null> | null {
  const explicitByDay = normalizePlannedStartByDay(task.plannedStartByDay) as Record<ScheduleDay, string | null> | null;
  if (explicitByDay) return explicitByDay;

  const plannedStartTime = normalizeScheduleStoredTime(task.plannedStartTime);
  if (!plannedStartTime) return null;
  const plannedStartDay = normalizePlannedStartDay(task.plannedStartDay) as ScheduleDay | null;
  if (plannedStartDay) {
    return {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      [plannedStartDay]: plannedStartTime,
    };
  }
  return {
    mon: plannedStartTime,
    tue: plannedStartTime,
    wed: plannedStartTime,
    thu: plannedStartTime,
    fri: plannedStartTime,
    sat: plannedStartTime,
    sun: plannedStartTime,
  };
}

function localDateKey(ms = Date.now()) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTaskTimeGoalCompletedToday(task: Task, nowMs = Date.now()) {
  return task.timeGoalCompletedReason === "goal" && task.timeGoalCompletedDayKey === localDateKey(nowMs);
}

function normalizeDayTimeGoalMinutes(task: Task): number | null {
  if (!task.timeGoalEnabled || task.timeGoalPeriod !== "day") return null;
  const minutes = Number(task.timeGoalMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : null;
}

function computePlannedStartPushDueAtMs(task: Task): number | null {
  if (task.plannedStartPushRemindersEnabled === false) return null;
  const byDay = getTaskPlannedStartByDay(task);
  if (!byDay) return null;
  const dayMap: Record<ScheduleDay, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const now = new Date();
  if (isTaskTimeGoalCompletedToday(task, now.getTime())) now.setHours(24, 0, 0, 0);
  let nextDueAtMs: number | null = null;
  for (const day of SCHEDULE_DAY_ORDER) {
    const time = normalizeScheduleStoredTime(byDay[day]);
    if (!time) continue;
    const [, rawHours = "0", rawMinutes = "0"] = time.match(/^(\d{1,2}):(\d{2})$/) || [];
    const scheduled = new Date(now);
    const diffDays = (dayMap[day] - scheduled.getDay() + 7) % 7;
    scheduled.setDate(scheduled.getDate() + diffDays);
    scheduled.setHours(Number(rawHours), Number(rawMinutes), 0, 0);
    if (scheduled.getTime() <= now.getTime()) scheduled.setDate(scheduled.getDate() + 7);
    const dueAtMs = scheduled.getTime();
    if (nextDueAtMs == null || dueAtMs < nextDueAtMs) nextDueAtMs = dueAtMs;
  }
  return nextDueAtMs;
}

function isUnscheduledGapPushCandidate(task: Task) {
  return (
    normalizeDayTimeGoalMinutes(task) != null &&
    !getTaskPlannedStartByDay(task) &&
    task.plannedStartOpenEnded !== true &&
    !isTaskTimeGoalCompletedToday(task)
  );
}

function buildScheduledPushPayload(uid: string, task: Task) {
  const taskId = asString(task.id, 120);
  const plannedStartDueAtMs = computePlannedStartPushDueAtMs(task);
  const unscheduledGapCandidate = isUnscheduledGapPushCandidate(task);
  const dueAtMs = plannedStartDueAtMs ?? (unscheduledGapCandidate ? Date.now() : null);
  if (!taskId || dueAtMs == null) return null;
  const notificationKind = plannedStartDueAtMs != null ? "plannedStart" : "unscheduledGap";
  const eventType = plannedStartDueAtMs != null ? "plannedStartReminder" : "unscheduledGapReminder";
  return stripUndefinedValues({
    ownerUid: uid,
    taskId,
    taskName: asString(task.name, 200) || "Task",
    notificationKind,
    eventType,
    baseEventType: eventType,
    effectiveEventType: eventType,
    dueAtMs,
    timeGoalMinutes: normalizeDayTimeGoalMinutes(task),
    timeGoalPeriod: null,
    timeGoalGoalMs: null,
    timeGoalCompletionDayKey: null,
    timeGoalCompletionWeekKey: null,
    weekStarting: null,
    plannedStartDay: normalizePlannedStartDay(task.plannedStartDay),
    plannedStartTime: getPersistedPlannedStartTime(task),
    plannedStartByDay: normalizePlannedStartByDay(task.plannedStartByDay),
    plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
    route: "/tasklaunch",
    snoozedUntilMs: null,
    sentAtMs: null,
    sentDueAtMs: null,
    missedCheckDueAtMs: null,
    missedScheduledStartDueAtMs: null,
    nextPlannedStartDueAtMs: null,
    lastMissedAtMs: null,
    lastMissedDueAtMs: null,
    lastActionAtMs: null,
    lastActionByDeviceId: null,
    lastGapAlertDayKey: null,
    lastGapAlertStartMs: null,
    lastGapAlertEndMs: null,
    activeGapDayKey: null,
    activeGapStartMs: null,
    activeGapEndMs: null,
    postponedGapDayKey: null,
    postponedGapStartMs: null,
    postponedGapEndMs: null,
    updatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    schemaVersion: 1,
  });
}

function taskFirestoreTimestamp(task: Task) {
  const createdAtMs = Number.isFinite(Number(task.createdAtMs)) && Number(task.createdAtMs) > 0 ? Math.floor(Number(task.createdAtMs)) : Date.now();
  return Timestamp.fromMillis(createdAtMs);
}

function mapBrainDumpTaskToFirestore(task: Task) {
  const taskType = normalizeTaskType(task.taskType);
  const plannedStartPushDueAtMs = computePlannedStartPushDueAtMs(task);
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
    plannedStartDate: normalizeLocalDate(task.plannedStartDate),
    plannedStartDay: normalizePlannedStartDay(task.plannedStartDay),
    plannedStartTime: getPersistedPlannedStartTime(task),
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
    bgTimeGoalPushEligible: plannedStartPushDueAtMs != null,
    bgTimeGoalPushDueAtMs: plannedStartPushDueAtMs,
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

  function scheduledPushDoc(uid: string, taskId: string) {
    return db.collection("scheduled_time_goal_pushes").doc(`${uid}__${taskId}`);
  }

  function writeScheduledPushToBatch(batch: ReturnType<typeof db.batch>, uid: string, task: Task) {
    const taskId = asString(task.id, 120);
    if (!taskId) return;
    const payload = buildScheduledPushPayload(uid, task);
    const ref = scheduledPushDoc(uid, taskId);
    if (payload) batch.set(ref, payload, { merge: true });
    else batch.delete(ref);
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
        writeScheduledPushToBatch(batch, safeUid, task);
      }
      await batch.commit();
    },
    async saveTask(uid: string, task: Task) {
      const safeUid = asString(uid, 120);
      const taskId = asString(task.id, 120);
      if (!safeUid || !taskId) return;
      const batch = db.batch();
      batch.set(tasksCollection(safeUid).doc(taskId), mapBrainDumpTaskToFirestore(task), { merge: true });
      writeScheduledPushToBatch(batch, safeUid, task);
      await batch.commit();
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
