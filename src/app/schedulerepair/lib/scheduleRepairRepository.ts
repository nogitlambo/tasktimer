import { createHash } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { ScheduleRepairProposalSchema } from "./scheduleRepairContract";
import type { ScheduleRepairAction, ScheduleRepairApplyActionResult, ScheduleRepairApplyHistory, ScheduleRepairAuditEvent, ScheduleRepairProposal, ScheduleRepairTask, ScheduleRepairUndoRecord } from "./scheduleRepairContract";
import type { ScheduleRepairFutureDay } from "./scheduleRepairCandidates";

type RawRow = Record<string, unknown>;
type TaskSnapshot = { exists: boolean; data: () => RawRow | undefined };

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return Number((value as { toMillis: () => number }).toMillis()) || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
}

function dateValue(value: unknown) {
  const date = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function positiveMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}

function nonnegativeMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0;
}

function completedMinutesFromTask(raw: RawRow) {
  return Math.max(nonnegativeMinutes(raw.completedMinutes), nonnegativeMinutes(Number(raw.accumulatedMs) / 60_000));
}

function datePlusDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayToken(date: string) {
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
}

function dayDistance(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDate}T00:00:00.000Z`);
  return Number.isFinite(fromMs) && Number.isFinite(toMs) ? Math.round((toMs - fromMs) / 86_400_000) : null;
}

export function buildScheduleRepairTaskPatch(raw: RawRow, action: ScheduleRepairAction, localDate: string) {
  const targetDate = dateValue(action.toDate);
  if (action.type === "REDUCE_TODAY_TARGET") {
    const targetMinutes = action.toMinutes == null ? null : nonnegativeMinutes(action.toMinutes);
    return targetMinutes != null && targetMinutes > 0 ? { timeGoalMinutes: targetMinutes } : null;
  }
  if (action.type === "MOVE_TO_LATER_DAY") {
    if (!targetDate || targetDate <= localDate || (raw.hardDeadline === true && dateValue(raw.onceOffTargetDate) && (dayDistance(targetDate, dateValue(raw.onceOffTargetDate) as string) as number) < 0)) return null;
    if (raw.pinned === true || raw.running === true || raw.editable === false || raw.completed === true || raw.status === "completed" || raw.status === "inactive") return null;
    if (raw.taskType === "once-off") {
      const day = weekdayToken(targetDate);
      return { onceOffDay: day, onceOffTargetDate: targetDate, plannedStartDay: day };
    }
    const byDay = raw.plannedStartByDay && typeof raw.plannedStartByDay === "object" ? raw.plannedStartByDay as RawRow : {};
    const existingTimes = Object.values(byDay).map((value) => asString(value, 8)).filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
    const fallbackTime = asString(raw.plannedStartTime, 8);
    const time = existingTimes[0] || (/^([01]\d|2[0-3]):[0-5]\d$/.test(fallbackTime) ? fallbackTime : "");
    if (!time) return null;
    const day = weekdayToken(targetDate);
    return { plannedStartDay: day, plannedStartTime: time, plannedStartByDay: { [day]: time }, plannedStartOpenEnded: false };
  }
  if (action.type === "REMOVE_FROM_TODAY") {
    if (raw.taskType === "once-off") return { onceOffDay: null, onceOffTargetDate: null, plannedStartDay: null, plannedStartTime: null, plannedStartByDay: null };
    const day = weekdayToken(localDate);
    const byDay = raw.plannedStartByDay && typeof raw.plannedStartByDay === "object" ? { ...(raw.plannedStartByDay as RawRow) } : {};
    delete byDay[day];
    const remainingDays = Object.keys(byDay).filter((key) => /^sun|mon|tue|wed|thu|fri|sat$/.test(key));
    if (!remainingDays.length) return { plannedStartDay: null, plannedStartTime: null, plannedStartByDay: null };
    const firstDay = remainingDays.sort()[0]!;
    const firstTime = asString(byDay[firstDay], 8) || null;
    return { plannedStartDay: remainingDays.length === 1 ? firstDay : null, plannedStartTime: remainingDays.length === 1 ? firstTime : null, plannedStartByDay: byDay };
  }
  return null;
}

function taskAllowedDates(raw: RawRow, localDate: string) {
  const onceOffTargetDate = dateValue(raw.onceOffTargetDate);
  if (onceOffTargetDate) return [onceOffTargetDate];
  const byDay = raw.plannedStartByDay && typeof raw.plannedStartByDay === "object" ? raw.plannedStartByDay as RawRow : null;
  if (!byDay) return [];
  return Array.from({ length: 7 }, (_, index) => datePlusDays(localDate, index + 1)).filter((date) => {
    const time = asString(byDay[weekdayToken(date)], 8);
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  });
}

export function mapScheduleRepairFirestoreTask(taskId: string, raw: RawRow, uid: string, localDate: string): ScheduleRepairTask {
  const id = asString(raw.id, 160) || taskId;
  const allowedTargetDates = taskAllowedDates(raw, localDate);
  const onceOffTargetDate = dateValue(raw.onceOffTargetDate);
  const plannedDate = onceOffTargetDate || (allowedTargetDates.includes(localDate) ? localDate : null);
  const version = createHash("sha256").update(JSON.stringify({
    id,
    updatedAt: asMillis(raw.updatedAt),
    timeGoalMinutes: positiveMinutes(raw.timeGoalMinutes),
    accumulatedMs: nonnegativeMinutes(Number(raw.accumulatedMs) / 60_000),
    onceOffTargetDate,
    plannedStartDay: asString(raw.plannedStartDay, 8),
    plannedStartTime: asString(raw.plannedStartTime, 8),
    plannedStartByDay: raw.plannedStartByDay || null,
    plannedStartOpenEnded: raw.plannedStartOpenEnded === true,
    priority: asString(raw.priority, 20),
    hardDeadline: raw.hardDeadline === true,
    pinned: raw.pinned === true,
    completed: raw.completed === true,
    status: asString(raw.status, 40),
  })).digest("hex");
  return {
    id,
    taskVersion: version,
    estimatedMinutes: positiveMinutes(raw.timeGoalMinutes),
    completedMinutes: completedMinutesFromTask(raw),
    dueDate: onceOffTargetDate,
    priority: raw.priority === "urgent" || raw.priority === "high" || raw.priority === "medium" || raw.priority === "low" ? raw.priority : undefined,
    hardDeadline: raw.hardDeadline === true,
    flexible: raw.plannedStartOpenEnded === true || !raw.plannedStartTime,
    pinned: raw.pinned === true,
    inProgress: raw.running === true,
    requiresClarification: raw.requiresClarification === true,
    blocksImportantWork: raw.blocksImportantWork === true,
    plannedDate,
    dependencySensitive: raw.dependencySensitive === true,
    partialProgressUseful: raw.partialProgressUseful === true,
    recentlyMoved: raw.recentlyMoved === true,
    recurrenceLocked: raw.taskType === "recurring" && raw.recurrenceLocked !== false,
    allowedTargetDates: allowedTargetDates.length ? allowedTargetDates : undefined,
    ownerUid: uid,
    editable: raw.editable !== false,
    active: raw.active !== false && raw.status !== "inactive",
    completed: raw.completed === true || raw.status === "completed",
  };
}

export function buildScheduleRepairFutureDays(tasks: ScheduleRepairTask[], localDate: string, capacityMax = 60): ScheduleRepairFutureDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = datePlusDays(localDate, index + 1);
    const plannedMinutes = tasks.reduce((sum, task) => {
      if (task.active === false || task.completed || !task.allowedTargetDates?.includes(date)) return sum;
      return sum + Math.max(0, (task.estimatedMinutes || 0) - (task.completedMinutes || 0));
    }, 0);
    return { date, plannedMinutes, capacityMax };
  });
}

function stableTaskVersionHash(tasks: ScheduleRepairTask[]) {
  return createHash("sha256").update(JSON.stringify(tasks.map((task) => ({
    id: task.id,
    taskVersion: task.taskVersion,
    estimatedMinutes: task.estimatedMinutes,
    completedMinutes: task.completedMinutes,
    dueDate: task.dueDate,
    plannedDate: task.plannedDate,
    allowedTargetDates: task.allowedTargetDates,
    priority: task.priority,
    hardDeadline: task.hardDeadline,
    pinned: task.pinned,
    active: task.active,
    completed: task.completed,
  })).sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
}

export type ScheduleRepairSourceContext = {
  tasks: ScheduleRepairTask[];
  futureDays: ScheduleRepairFutureDay[];
  sourceTaskVersionHash: string;
};

export interface ScheduleRepairRepository {
  loadSourceContext(input: { uid: string; localDate: string }): Promise<ScheduleRepairSourceContext>;
  loadProposal(uid: string, repairId: string): Promise<ScheduleRepairProposal | null>;
  saveProposal(uid: string, proposal: ScheduleRepairProposal): Promise<void>;
  applyProposal(input: {
    uid: string;
    repairId: string;
    idempotencyKey: string;
    localDate: string;
    actions: Array<Pick<ScheduleRepairAction, "id" | "selected" | "toDate" | "toMinutes">>;
    nowMs: number;
  }): Promise<{ kind: "applied" | "idempotent" | "stale" | "expired" | "not-found" | "invalid"; proposal?: ScheduleRepairProposal; results?: ScheduleRepairApplyActionResult[] }>;
  undoProposal(input: {
    uid: string;
    repairId: string;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<{ kind: "undone" | "idempotent" | "expired" | "conflict" | "not-found" | "invalid"; proposal?: ScheduleRepairProposal; results?: ScheduleRepairApplyActionResult[] }>;
}

export function createFirestoreScheduleRepairRepository(db: Firestore = getFirebaseAdminDb()): ScheduleRepairRepository {
  function userDoc(uid: string) { return db.collection("users").doc(uid); }
  function proposalCollection(uid: string) { return userDoc(uid).collection("scheduleRepairs"); }
  function parseProposal(row: RawRow, uid: string) {
    const parsed = ScheduleRepairProposalSchema.safeParse({
      ...row,
      userId: asString(row.userId, 120) || uid,
      createdAt: new Date(asMillis(row.createdAt)).toISOString(),
      expiresAt: new Date(asMillis(row.expiresAt)).toISOString(),
      appliedAt: row.appliedAt == null ? null : new Date(asMillis(row.appliedAt)).toISOString(),
      reversibleUntil: row.reversibleUntil == null ? null : new Date(asMillis(row.reversibleUntil)).toISOString(),
    });
    return parsed.success && parsed.data.userId === uid ? parsed.data : null;
  }
  function originalFields(raw: RawRow, patch: Record<string, unknown>) {
    return Object.fromEntries(Object.keys(patch).map((key) => [key, raw[key] ?? null]));
  }
  return {
    async loadSourceContext({ uid, localDate }) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return { tasks: [], futureDays: buildScheduleRepairFutureDays([], localDate), sourceTaskVersionHash: stableTaskVersionHash([]) };
      const snapshot = await userDoc(safeUid).collection("tasks").get();
      const tasks = snapshot.docs.map((doc) => mapScheduleRepairFirestoreTask(doc.id, doc.data() as RawRow, safeUid, localDate));
      return { tasks, futureDays: buildScheduleRepairFutureDays(tasks, localDate), sourceTaskVersionHash: stableTaskVersionHash(tasks) };
    },
    async loadProposal(uid, repairId) {
      const safeUid = asString(uid, 120);
      const safeId = asString(repairId, 180);
      if (!safeUid || !safeId || safeId.includes("/")) return null;
      const snapshot = await proposalCollection(safeUid).doc(safeId).get();
      return snapshot.exists ? parseProposal(snapshot.data() as RawRow, safeUid) : null;
    },
    async saveProposal(uid, proposal) {
      const safeUid = asString(uid, 120);
      if (!safeUid || proposal.userId !== safeUid) throw new Error("Schedule repair ownership mismatch.");
      await proposalCollection(safeUid).doc(asString(proposal.id, 180)).set({
        ...proposal,
        createdAt: Timestamp.fromMillis(Date.parse(proposal.createdAt)),
        expiresAt: Timestamp.fromMillis(Date.parse(proposal.expiresAt)),
        appliedAt: proposal.appliedAt ? Timestamp.fromMillis(Date.parse(proposal.appliedAt)) : null,
        updatedAt: Timestamp.now(),
      });
    },
    async applyProposal({ uid, repairId, idempotencyKey, localDate, actions, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRepairId = asString(repairId, 180);
      const safeIdempotencyKey = asString(idempotencyKey, 180);
      if (!safeUid || !safeRepairId || safeRepairId.includes("/") || !safeIdempotencyKey || !dateValue(localDate)) return { kind: "invalid" as const };
      const repairRef = proposalCollection(safeUid).doc(safeRepairId);
      return db.runTransaction(async (transaction) => {
        const repairSnapshot = await transaction.get(repairRef);
        if (!repairSnapshot.exists) return { kind: "not-found" as const };
        const proposal = parseProposal(repairSnapshot.data() as RawRow, safeUid);
        if (!proposal) return { kind: "not-found" as const };
        const history = proposal.applyHistory || [];
        const previous = history.find((entry) => entry.idempotencyKey === safeIdempotencyKey);
        if (previous) return { kind: "idempotent" as const, proposal, results: previous.results };
        if (Date.parse(proposal.expiresAt) <= nowMs) {
          transaction.update(repairRef, { status: "EXPIRED", updatedAt: Timestamp.fromMillis(nowMs) });
          return { kind: "expired" as const };
        }
        if (!["ACTIVE", "PARTIALLY_APPLIED"].includes(proposal.status)) return { kind: "invalid" as const };
        const requested = actions.filter((action) => action.selected);
        if (!requested.length) return { kind: "invalid" as const };
        const proposalActions = new Map(proposal.actions.map((action) => [action.id, action]));
        const taskSnapshots = new Map<string, TaskSnapshot>();
        for (const requestedAction of requested) {
          const proposalAction = proposalActions.get(requestedAction.id);
          if (!proposalAction || proposalAction.status !== "PROPOSED") continue;
          const taskRef = userDoc(safeUid).collection("tasks").doc(proposalAction.taskId);
          taskSnapshots.set(proposalAction.id, await transaction.get(taskRef));
        }
        const results: ScheduleRepairApplyActionResult[] = [];
        const undoRecords: ScheduleRepairUndoRecord[] = [...(proposal.undoRecords || [])];
        for (const requestedAction of requested) {
          const proposalAction = proposalActions.get(requestedAction.id);
          if (!proposalAction || proposalAction.status !== "PROPOSED") {
            results.push({ actionId: requestedAction.id, taskId: proposalAction?.taskId || "unknown", outcome: "REJECTED", reason: "Action is no longer available." });
            continue;
          }
          const taskRef = userDoc(safeUid).collection("tasks").doc(proposalAction.taskId);
          const taskSnapshot = taskSnapshots.get(proposalAction.id);
          if (!taskSnapshot || !taskSnapshot.exists) {
            results.push({ actionId: proposalAction.id, taskId: proposalAction.taskId, outcome: "FAILED", reason: "Task no longer exists." });
            continue;
          }
          const raw = taskSnapshot.data() as RawRow;
          const currentTask = mapScheduleRepairFirestoreTask(proposalAction.taskId, raw, safeUid, proposal.localDate);
          if (currentTask.taskVersion !== proposalAction.taskVersion) {
            results.push({ actionId: proposalAction.id, taskId: proposalAction.taskId, outcome: "STALE", reason: "Task changed after this proposal was generated." });
            continue;
          }
          const nextAction = { ...proposalAction, toDate: requestedAction.toDate === undefined ? proposalAction.toDate : requestedAction.toDate, toMinutes: requestedAction.toMinutes === undefined ? proposalAction.toMinutes : requestedAction.toMinutes };
          const patch = buildScheduleRepairTaskPatch(raw, nextAction, localDate);
          if (!patch) {
            results.push({ actionId: proposalAction.id, taskId: proposalAction.taskId, outcome: "REJECTED", reason: "The requested change no longer satisfies the task schedule constraints." });
            continue;
          }
          transaction.update(taskRef, { ...patch, updatedAt: Timestamp.fromMillis(nowMs) });
          const appliedTask = mapScheduleRepairFirestoreTask(proposalAction.taskId, { ...raw, ...patch, updatedAt: Timestamp.fromMillis(nowMs) }, safeUid, proposal.localDate);
          undoRecords.push({ actionId: proposalAction.id, taskId: proposalAction.taskId, appliedTaskVersion: appliedTask.taskVersion || "", originalFields: originalFields(raw, patch), undone: false });
          results.push({ actionId: proposalAction.id, taskId: proposalAction.taskId, outcome: "APPLIED", reason: "Applied with a fresh task version." });
        }
        const appliedCount = results.filter((result) => result.outcome === "APPLIED").length;
        const nextStatus: "ACTIVE" | "PARTIALLY_APPLIED" | "APPLIED" = appliedCount === requested.length ? "APPLIED" : appliedCount > 0 ? "PARTIALLY_APPLIED" : "ACTIVE";
        const nextActions = proposal.actions.map((action) => {
          const result = results.find((candidate) => candidate.actionId === action.id);
          if (!result) return action;
          return { ...action, selected: false, status: result.outcome === "APPLIED" ? "APPLIED" as const : result.outcome === "REJECTED" ? "REJECTED" as const : result.outcome === "STALE" || result.outcome === "FAILED" ? "FAILED" as const : action.status };
        });
        const nextHistory: ScheduleRepairApplyHistory[] = [...history, { idempotencyKey: safeIdempotencyKey, status: nextStatus, results }].slice(-10);
        const auditType: ScheduleRepairAuditEvent["type"] = nextStatus === "PARTIALLY_APPLIED" ? "PARTIALLY_APPLIED" : appliedCount ? "APPLIED" : proposal.status === "ACTIVE" ? "APPLIED" : "PARTIALLY_APPLIED";
        const invalidationId = appliedCount ? createHash("sha256").update(`${proposal.id}:${safeIdempotencyKey}:${nowMs}`).digest("hex").slice(0, 40) : proposal.downstreamInvalidationId || null;
        const auditEvents = [...(proposal.auditEvents || []), { type: auditType, at: new Date(nowMs).toISOString(), actionIds: results.filter((result) => result.outcome === "APPLIED").map((result) => result.actionId) }].slice(-20);
        const nextProposal: ScheduleRepairProposal = { ...proposal, status: nextStatus, actions: nextActions, appliedAt: appliedCount ? new Date(nowMs).toISOString() : proposal.appliedAt, applyIdempotencyKey: safeIdempotencyKey, applyResults: results, applyHistory: nextHistory, undoRecords, reversibleUntil: appliedCount ? new Date(nowMs + 30_000).toISOString() : proposal.reversibleUntil, auditEvents, downstreamInvalidationId: invalidationId };
        transaction.update(repairRef, { status: nextProposal.status, actions: nextProposal.actions, appliedAt: nextProposal.appliedAt ? Timestamp.fromMillis(Date.parse(nextProposal.appliedAt)) : null, applyIdempotencyKey: nextProposal.applyIdempotencyKey, applyResults: nextProposal.applyResults, applyHistory: nextProposal.applyHistory, undoRecords: nextProposal.undoRecords, reversibleUntil: nextProposal.reversibleUntil ? Timestamp.fromMillis(Date.parse(nextProposal.reversibleUntil)) : null, auditEvents: nextProposal.auditEvents, downstreamInvalidationId: nextProposal.downstreamInvalidationId, updatedAt: Timestamp.fromMillis(nowMs) });
        return { kind: "applied" as const, proposal: nextProposal, results };
      });
    },
    async undoProposal({ uid, repairId, idempotencyKey, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRepairId = asString(repairId, 180);
      const safeIdempotencyKey = asString(idempotencyKey, 180);
      if (!safeUid || !safeRepairId || safeRepairId.includes("/") || !safeIdempotencyKey) return { kind: "invalid" as const };
      const repairRef = proposalCollection(safeUid).doc(safeRepairId);
      return db.runTransaction(async (transaction) => {
        const repairSnapshot = await transaction.get(repairRef);
        if (!repairSnapshot.exists) return { kind: "not-found" as const };
        const proposal = parseProposal(repairSnapshot.data() as RawRow, safeUid);
        if (!proposal) return { kind: "not-found" as const };
        if (proposal.undoIdempotencyKey === safeIdempotencyKey) return { kind: "idempotent" as const, proposal, results: proposal.undoResults || [] };
        if (!["APPLIED", "PARTIALLY_APPLIED"].includes(proposal.status)) return { kind: "invalid" as const };
        if (!proposal.reversibleUntil || Date.parse(proposal.reversibleUntil) <= nowMs) return { kind: "expired" as const };
        const records = (proposal.undoRecords || []).filter((record) => !record.undone);
        if (!records.length) return { kind: "invalid" as const };
        const taskSnapshots = new Map<string, TaskSnapshot>();
        for (const record of records) {
          const taskRef = userDoc(safeUid).collection("tasks").doc(record.taskId);
          taskSnapshots.set(record.taskId, await transaction.get(taskRef));
        }
        const results: ScheduleRepairApplyActionResult[] = [];
        const nextRecords = (proposal.undoRecords || []).map((record) => {
          if (record.undone) return record;
          const taskSnapshot = taskSnapshots.get(record.taskId);
          if (!taskSnapshot || !taskSnapshot.exists) {
            results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "FAILED", reason: "Task no longer exists." });
            return record;
          }
          const raw = taskSnapshot.data() as RawRow;
          const current = mapScheduleRepairFirestoreTask(record.taskId, raw, safeUid, proposal.localDate);
          if (current.taskVersion !== record.appliedTaskVersion) {
            results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "STALE", reason: "Task changed after the repair was applied." });
            return record;
          }
          transaction.update(userDoc(safeUid).collection("tasks").doc(record.taskId), { ...record.originalFields, updatedAt: Timestamp.fromMillis(nowMs) });
          results.push({ actionId: record.actionId, taskId: record.taskId, outcome: "APPLIED", reason: "Original schedule restored." });
          return { ...record, undone: true };
        });
        const auditEvents: ScheduleRepairAuditEvent[] = [...(proposal.auditEvents || []), { type: "UNDONE" as const, at: new Date(nowMs).toISOString(), actionIds: results.filter((result) => result.outcome === "APPLIED").map((result) => result.actionId) }].slice(-20);
        const invalidationId = createHash("sha256").update(`${proposal.id}:undo:${safeIdempotencyKey}:${nowMs}`).digest("hex").slice(0, 40);
        const nextProposal: ScheduleRepairProposal = { ...proposal, status: "REVERSED", undoRecords: nextRecords, undoIdempotencyKey: safeIdempotencyKey, undoResults: results, auditEvents, downstreamInvalidationId: invalidationId };
        transaction.update(repairRef, { status: "REVERSED", undoRecords: nextRecords, undoIdempotencyKey: safeIdempotencyKey, undoResults: results, auditEvents, downstreamInvalidationId: invalidationId, updatedAt: Timestamp.fromMillis(nowMs) });
        return { kind: "undone" as const, proposal: nextProposal, results };
      });
    },
  };
}
