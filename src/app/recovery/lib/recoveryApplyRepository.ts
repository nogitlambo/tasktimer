import { createHash } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { computeTaskClarificationSourceVersion } from "@/app/taskclarification/lib/taskClarification";
import { RECOMMENDATION_COLLECTION } from "@/app/recommendations/lib/recommendationContract";
import { buildScheduleRepairTaskPatch } from "@/app/schedulerepair/lib/scheduleRepairRepository";
import type { ScheduleRepairAction } from "@/app/schedulerepair/lib/scheduleRepairContract";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import {
  RecoverySessionSchema,
  type RecoveryAction,
  type RecoveryApplyActionResult,
  type RecoveryApplyHistory,
  type RecoverySession,
  type RecoveryUndoRecord,
} from "./recoveryContract";
import { parseRecoverySessionRecord } from "./recoverySessionRepository";

type RawRow = Record<string, unknown>;
type Snapshot = { exists: boolean; data: () => RawRow | undefined };

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asDate(value: unknown) {
  const date = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function scheduleState(raw: RawRow) {
  return {
    onceOffTargetDate: asDate(raw.onceOffTargetDate),
    plannedStartDay: asString(raw.plannedStartDay, 8) || null,
    plannedStartTime: asString(raw.plannedStartTime, 8) || null,
  };
}

function remainingMinutes(raw: RawRow) {
  const goal = Math.max(0, Math.floor(Number(raw.timeGoalMinutes) || 0));
  const completed = Math.max(0, Math.floor(Number(raw.accumulatedMs) / 60_000 || 0));
  return Math.max(0, goal - completed);
}

function isScheduledOnDate(raw: RawRow, date: string) {
  if (asDate(raw.onceOffTargetDate) === date) return true;
  const weekday = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  const byDay = raw.plannedStartByDay && typeof raw.plannedStartByDay === "object" ? raw.plannedStartByDay as RawRow : null;
  return !!(byDay && asString(byDay[weekday], 8)) || asString(raw.plannedStartDay, 8).toLowerCase() === weekday;
}

function recoveryActionToScheduleAction(action: RecoveryAction, toDate: string | null): ScheduleRepairAction | null {
  if (action.type === "DEFER_TO_LATER_DAY") {
    return {
      id: action.id,
      type: "MOVE_TO_LATER_DAY",
      taskId: action.taskId,
      taskVersion: action.taskVersion,
      fromDate: action.fromDate || null,
      toDate: toDate || action.toDate || null,
      fromMinutes: null,
      toMinutes: null,
      reasonCodes: [],
      selected: true,
      status: "PROPOSED",
    };
  }
  if (action.type === "REMOVE_FROM_TODAY") {
    return {
      id: action.id,
      type: "REMOVE_FROM_TODAY",
      taskId: action.taskId,
      taskVersion: action.taskVersion,
      fromDate: action.fromDate || null,
      toDate: null,
      fromMinutes: null,
      toMinutes: null,
      reasonCodes: [],
      selected: true,
      status: "PROPOSED",
    };
  }
  return null;
}

export type RecoveryApplyRepository = {
  applySession(input: {
    uid: string;
    recoveryId: string;
    idempotencyKey: string;
    localDate: string;
    actions: Array<{ id: string; selected: boolean; toDate?: string | null }>;
    nowMs: number;
    targetDayCapacityMax?: number | null;
  }): Promise<{ kind: "applied" | "idempotent" | "stale" | "expired" | "not-found" | "invalid"; session?: RecoverySession; results?: RecoveryApplyActionResult[] }>;
  undoSession(input: {
    uid: string;
    recoveryId: string;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<{ kind: "undone" | "idempotent" | "expired" | "conflict" | "not-found" | "invalid"; session?: RecoverySession; results?: RecoveryApplyActionResult[] }>;
};

export function createFirestoreRecoveryApplyRepository(db: Firestore = getFirebaseAdminDb()): RecoveryApplyRepository {
  function userDoc(uid: string) {
    return db.collection("users").doc(uid);
  }

  return {
    async applySession({ uid, recoveryId, idempotencyKey, localDate, actions, nowMs, targetDayCapacityMax }) {
      const safeUid = asString(uid, 120);
      const safeRecoveryId = asString(recoveryId, 180);
      const safeIdempotencyKey = asString(idempotencyKey, 180);
      if (!safeUid || !safeRecoveryId || safeRecoveryId.includes("/") || !safeIdempotencyKey || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return { kind: "invalid" as const };
      const sessionRef = userDoc(safeUid).collection("recoverySessions").doc(safeRecoveryId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(sessionRef) as Snapshot;
        if (!snapshot.exists) return { kind: "not-found" as const };
        const session = parseRecoverySessionRecord(snapshot.data());
        if (!session || session.userId !== safeUid) return { kind: "not-found" as const };
        const history = session.applyHistory || [];
        const previous = history.find((entry) => entry.idempotencyKey === safeIdempotencyKey);
        if (previous) return { kind: "idempotent" as const, session, results: previous.results };
        if (Date.parse(session.expiresAt) <= nowMs) {
          transaction.update(sessionRef, { status: "EXPIRED", updatedAt: Timestamp.fromMillis(nowMs) });
          return { kind: "expired" as const, session: { ...session, status: "EXPIRED" as const } };
        }
        if (session.status !== "ACTIVE" && session.status !== "PARTIALLY_APPLIED") return { kind: "invalid" as const };
        const requested = actions.filter((action) => action.selected);
        if (!requested.length) return { kind: "invalid" as const };
        const actionById = new Map(session.actions.map((action) => [action.id, action]));
        const undoRecords: RecoveryUndoRecord[] = [...(session.undoRecords || [])];
        const taskCollection = userDoc(safeUid).collection("tasks");
        const allTaskSnapshot = await transaction.get(taskCollection) as unknown as { docs: Array<{ data: () => RawRow }> };
        const recommendationSnapshot = await transaction.get(userDoc(safeUid).collection(RECOMMENDATION_COLLECTION)) as unknown as { docs: Array<{ ref: unknown; data: () => RawRow }> };
        const targetDayLoads = new Map<string, number>();
        for (const taskDocument of allTaskSnapshot.docs || []) {
          const raw = taskDocument.data();
          for (const requestedAction of requested) {
            const recoveryAction = actionById.get(requestedAction.id);
            const targetDate = recoveryAction?.type === "DEFER_TO_LATER_DAY" ? asDate(requestedAction.toDate || recoveryAction.toDate) : null;
            if (targetDate && isScheduledOnDate(raw, targetDate)) targetDayLoads.set(targetDate, (targetDayLoads.get(targetDate) || 0) + remainingMinutes(raw));
          }
        }
        const taskSnapshots = new Map<string, Snapshot>();
        for (const requestedAction of requested) {
          const action = actionById.get(requestedAction.id);
          if (action?.status === "PROPOSED" && recoveryActionToScheduleAction(action, requestedAction.toDate || null)) {
            taskSnapshots.set(action.id, await transaction.get(userDoc(safeUid).collection("tasks").doc(action.taskId)) as Snapshot);
          }
        }
        const results: RecoveryApplyActionResult[] = [];
        const nextActions = session.actions.map((action) => {
          const requestedAction = requested.find((candidate) => candidate.id === action.id);
          if (!requestedAction) return action;
          if (action.status !== "PROPOSED") {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "REJECTED", reason: "Action is no longer available." });
            return action;
          }
          const scheduleAction = recoveryActionToScheduleAction(action, requestedAction.toDate || null);
          if (!scheduleAction) {
            const outcome = action.type === "MARK_FOR_LATER_REVIEW" ? "APPLIED" : "SKIPPED";
            results.push({ actionId: action.id, taskId: action.taskId, outcome, reason: outcome === "APPLIED" ? "Recorded for later review." : "This action must be completed through its existing workflow." });
            return outcome === "APPLIED" ? { ...action, selected: false, status: "APPLIED" as const } : action;
          }
          const taskSnapshot = taskSnapshots.get(action.id);
          if (!taskSnapshot?.exists) {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "FAILED", reason: "Task no longer exists." });
            return { ...action, selected: false, status: "FAILED" as const };
          }
          const raw = taskSnapshot.data() as RawRow;
          const currentVersion = computeTaskClarificationSourceVersion(action.taskId, raw);
          if (currentVersion !== action.taskVersion) {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "STALE", reason: "Task changed after this recovery session was generated." });
            return { ...action, selected: false, status: "FAILED" as const };
          }
          const targetDate = asDate(scheduleAction.toDate);
          const deadline = asDate(raw.onceOffTargetDate);
          if (action.type === "DEFER_TO_LATER_DAY" && raw.hardDeadline === true && targetDate && deadline && targetDate > deadline) {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "REJECTED", reason: "Hard-deadline task cannot be moved beyond its deadline." });
            return { ...action, selected: false, status: "REJECTED" as const };
          }
          const patch = buildScheduleRepairTaskPatch(raw, scheduleAction, localDate);
          if (!patch) {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "REJECTED", reason: "The requested change no longer satisfies the task schedule constraints." });
            return { ...action, selected: false, status: "REJECTED" as const };
          }
          const targetDateLoad = targetDate ? targetDayLoads.get(targetDate) || 0 : 0;
          const targetCapacityMax = targetDayCapacityMax ?? session.targetDayCapacityMax ?? session.remainingCapacity?.max ?? 60;
          if (action.type === "DEFER_TO_LATER_DAY" && targetDate && targetDateLoad + remainingMinutes(raw) > targetCapacityMax) {
            results.push({ actionId: action.id, taskId: action.taskId, outcome: "REJECTED", reason: "The target day no longer has enough capacity.", before: scheduleState(raw) });
            return { ...action, selected: false, status: "REJECTED" as const };
          }
          const taskUpdate = { ...patch, updatedAt: Timestamp.fromMillis(nowMs) };
          transaction.update(userDoc(safeUid).collection("tasks").doc(action.taskId), taskUpdate);
          const appliedRaw = { ...raw, ...taskUpdate };
          const appliedTaskVersion = computeTaskClarificationSourceVersion(action.taskId, appliedRaw);
          undoRecords.push({ actionId: action.id, taskId: action.taskId, appliedTaskVersion, originalFields: Object.fromEntries(Object.keys(patch).map((key) => [key, raw[key] ?? null])), undone: false });
          results.push({ actionId: action.id, taskId: action.taskId, outcome: "APPLIED", reason: "Applied with a fresh task version.", before: scheduleState(raw), after: scheduleState(appliedRaw) });
          return { ...action, selected: false, status: "APPLIED" as const };
        });
        const appliedCount = results.filter((result) => result.outcome === "APPLIED").length;
        const nextStatus = appliedCount > 0 ? "PARTIALLY_APPLIED" as const : session.status;
        const nextHistory: RecoveryApplyHistory[] = [...history, { idempotencyKey: safeIdempotencyKey, status: nextStatus, results }].slice(-10);
        const invalidationId = appliedCount ? createHash("sha256").update(`${session.id}:${safeIdempotencyKey}:${nowMs}`).digest("hex").slice(0, 40) : session.downstreamInvalidationId || null;
        const appliedTaskIds = new Set(results.filter((result) => result.outcome === "APPLIED").map((result) => result.taskId));
        for (const recommendation of recommendationSnapshot.docs || []) {
          const raw = recommendation.data();
          if (raw.status === "ACTIVE" && raw.type === "NEXT_BEST_ACTION" && appliedTaskIds.has(asString(raw.taskId, 160))) {
            transaction.update(recommendation.ref as never, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs), recoveryInvalidationId: invalidationId });
          }
        }
        const reversibleUntil = appliedCount ? new Date(nowMs + 30_000).toISOString() : session.reversibleUntil || null;
        const remainingBacklogCount = nextActions.filter((action) => action.status === "PROPOSED" || action.status === "FAILED").length;
        const nextSession = RecoverySessionSchema.parse({ ...session, status: nextStatus, backlogCount: remainingBacklogCount, actions: nextActions, applyIdempotencyKey: safeIdempotencyKey, applyResults: results, applyHistory: nextHistory, undoRecords, reversibleUntil, downstreamInvalidationId: invalidationId });
        transaction.update(sessionRef, { status: nextSession.status, actions: nextSession.actions, applyIdempotencyKey: safeIdempotencyKey, applyResults: results, applyHistory: nextHistory, undoRecords, reversibleUntil, downstreamInvalidationId: invalidationId, updatedAt: Timestamp.fromMillis(nowMs) });
        return { kind: "applied" as const, session: nextSession, results };
      });
    },
    async undoSession({ uid, recoveryId, idempotencyKey, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRecoveryId = asString(recoveryId, 180);
      const safeIdempotencyKey = asString(idempotencyKey, 180);
      if (!safeUid || !safeRecoveryId || safeRecoveryId.includes("/") || !safeIdempotencyKey) return { kind: "invalid" as const };
      const sessionRef = userDoc(safeUid).collection("recoverySessions").doc(safeRecoveryId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(sessionRef) as Snapshot;
        if (!snapshot.exists) return { kind: "not-found" as const };
        const session = parseRecoverySessionRecord(snapshot.data());
        if (!session || session.userId !== safeUid) return { kind: "not-found" as const };
        if (session.undoIdempotencyKey === safeIdempotencyKey) return { kind: "idempotent" as const, session, results: session.undoResults || [] };
        if (session.status !== "PARTIALLY_APPLIED" || !session.reversibleUntil || Date.parse(session.reversibleUntil) <= nowMs) return { kind: "expired" as const, session };
        const records = (session.undoRecords || []).filter((record) => !record.undone);
        if (!records.length) return { kind: "invalid" as const, session };
        const taskSnapshots = new Map<string, Snapshot>();
        for (const record of records) taskSnapshots.set(record.taskId, await transaction.get(userDoc(safeUid).collection("tasks").doc(record.taskId)) as Snapshot);
        const results: RecoveryApplyActionResult[] = [];
        const nextRecords = (session.undoRecords || []).map((record) => {
          if (record.undone) return record;
          const taskSnapshot = taskSnapshots.get(record.taskId);
          if (!taskSnapshot?.exists) {
            results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "FAILED", reason: "Task no longer exists." });
            return record;
          }
          const raw = taskSnapshot.data() as RawRow;
          const currentVersion = computeTaskClarificationSourceVersion(record.taskId, raw);
          if (currentVersion !== record.appliedTaskVersion) {
            results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "STALE", reason: "Task changed after Recovery Mode applied the change." });
            return record;
          }
          transaction.update(userDoc(safeUid).collection("tasks").doc(record.taskId), { ...record.originalFields, updatedAt: Timestamp.fromMillis(nowMs) });
          results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "APPLIED", reason: "Original schedule restored." });
          return { ...record, undone: true };
        });
        const invalidationId = createHash("sha256").update(`${session.id}:undo:${safeIdempotencyKey}:${nowMs}`).digest("hex").slice(0, 40);
        const restoredActionIds = new Set(results.filter((result) => result.outcome === "APPLIED").map((result) => result.actionId));
        const nextActions = session.actions.map((action) => restoredActionIds.has(action.id) ? { ...action, status: "PROPOSED" as const, selected: false } : action);
        const nextBacklogCount = nextActions.filter((action) => action.status === "PROPOSED" || action.status === "FAILED").length;
        const nextSession = RecoverySessionSchema.parse({ ...session, backlogCount: nextBacklogCount, actions: nextActions, undoRecords: nextRecords, undoIdempotencyKey: safeIdempotencyKey, undoResults: results, reversibleUntil: null, downstreamInvalidationId: invalidationId });
        transaction.update(sessionRef, { backlogCount: nextBacklogCount, actions: nextActions, undoRecords: nextRecords, undoIdempotencyKey: safeIdempotencyKey, undoResults: results, reversibleUntil: null, downstreamInvalidationId: invalidationId, updatedAt: Timestamp.fromMillis(nowMs) });
        return { kind: "undone" as const, session: nextSession, results };
      });
    },
  };
}
