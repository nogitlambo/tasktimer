import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { parseRecommendationRecord } from "@/app/taskclarification/lib/taskClarificationRepository";
import { computeTaskClarificationSourceVersion, type TaskClarificationRecommendation } from "@/app/taskclarification/lib/taskClarification";
import type { HistoryEntry, Task } from "@/app/tasktimer/lib/types";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS,
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  isMinuteInProductivityPeriod,
  normalizeOptimalProductivityDays,
  normalizeOptimalProductivityPeriod,
  timeOfDayToMinutes,
} from "@/app/tasktimer/lib/productivityPeriod";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { RECOMMENDATION_COLLECTION } from "@/app/recommendations/lib/recommendationContract";
import { createNextBestActionRecommendation, parseNextBestActionRecommendationRecord, type NextBestActionRecommendation } from "./nextBestActionRecommendation";
import type { NextBestActionCandidate } from "./nextBestActionRanking";

export const NEXT_BEST_ACTION_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type RawRow = Record<string, unknown>;

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) && millis > 0 ? Math.floor(millis) : 0;
  }
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return 0;
}

function asPositiveMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}

function normalizeHistoryEntry(row: unknown): HistoryEntry | null {
  if (!row || typeof row !== "object") return null;
  const source = row as RawRow;
  const ts = asMillis(source.ts);
  const name = asString(source.name, 200);
  const ms = Math.max(0, Math.floor(Number(source.ms) || 0));
  if (!ts || !name || !Number.isFinite(ms)) return null;
  return { ts, name, ms };
}

function mapTask(taskId: string, raw: RawRow): Task {
  const id = asString(raw.id, 160) || taskId;
  return {
    ...raw,
    id,
    name: asString(raw.name, 200) || "Task",
    createdAtMs: asMillis(raw.createdAtMs) || asMillis(raw.createdAt),
    accumulatedMs: Math.max(0, Math.floor(Number(raw.accumulatedMs) || 0)),
    running: raw.running === true,
    startMs: asMillis(raw.startMs) || null,
    hasStarted: raw.hasStarted === true,
    onceOffTargetDate: typeof raw.onceOffTargetDate === "string" ? raw.onceOffTargetDate.trim() || null : null,
    timeGoalMinutes: asPositiveMinutes(raw.timeGoalMinutes) || 0,
  } as Task;
}

function normalizeTimezone(value: unknown) {
  const candidate = asString(value, 120) || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

export function localDateForRecommendationTimezone(timezone: string, nowMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readHistoryRows(taskId: string, taskRows: Array<{ id: string; data: () => RawRow }>, canonicalRows: Array<{ data: () => RawRow }>) {
  const entries: HistoryEntry[] = [];
  const seen = new Set<string>();
  const add = (row: unknown) => {
    const entry = normalizeHistoryEntry(row);
    if (!entry) return;
    const source = row as RawRow;
    const key = `${asString(source.sessionId, 160)}|${entry.ts}|${entry.ms}|${entry.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  taskRows.forEach((row) => add(row.data()));
  canonicalRows.forEach((row) => {
    const data = row.data();
    if (asString(data.taskId, 160) === taskId) add(data);
  });
  return entries.sort((a, b) => a.ts - b.ts);
}

function clarificationSignals(rows: Array<{ data: () => RawRow }>, nowMs: number) {
  const byTaskId = new Map<string, TaskClarificationRecommendation>();
  for (const row of rows) {
    const recommendation = parseRecommendationRecord(row.data());
    if (!recommendation || (recommendation.status !== "ACTIVE" && recommendation.status !== "ACCEPTED" && recommendation.status !== "PARTIALLY_ACCEPTED")) continue;
    if (Date.parse(recommendation.expiresAt) <= nowMs) continue;
    const current = byTaskId.get(recommendation.taskId);
    if (!current || Date.parse(recommendation.createdAt) < Date.parse(current.createdAt)) byTaskId.set(recommendation.taskId, recommendation);
  }
  return byTaskId;
}

function focusWindowMatch(raw: RawRow, preferences: RawRow | null) {
  const plannedStartTime = asString(raw.plannedStartTime, 16);
  if (!plannedStartTime) return null;
  const period = normalizeOptimalProductivityPeriod({
    optimalProductivityStartTime: preferences?.optimalProductivityStartTime || DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
    optimalProductivityEndTime: preferences?.optimalProductivityEndTime || DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  });
  const days = normalizeOptimalProductivityDays(preferences?.optimalProductivityDays || DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS);
  const plannedDay = asString(raw.plannedStartDay, 12).toLowerCase();
  if (plannedDay && !days.includes(plannedDay as (typeof days)[number])) return false;
  const [hour, minute] = plannedStartTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return isMinuteInProductivityPeriod(timeOfDayToMinutes(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, "00:00"), period);
}

export function buildNextBestActionFirestoreRecord(recommendation: NextBestActionRecommendation) {
  return {
    id: recommendation.id,
    userId: recommendation.userId,
    type: recommendation.type,
    taskId: recommendation.taskId,
    sourceTaskVersion: recommendation.sourceTaskVersion,
    status: recommendation.status,
    payload: recommendation.payload,
    createdAt: Timestamp.fromMillis(Date.parse(String(recommendation.createdAt))),
    expiresAt: Timestamp.fromMillis(Date.parse(String(recommendation.expiresAt))),
    auditExpiresAt: recommendation.auditExpiresAt ? Timestamp.fromMillis(Date.parse(String(recommendation.auditExpiresAt))) : null,
    schemaVersion: 1,
  };
}

export type NextBestActionCandidateLoadInput = { uid: string; nowMs: number; timezone?: string };

export type NextBestActionStartResult =
  | { kind: "started" | "idempotent"; recommendation: NextBestActionRecommendation & { startedAt?: string } }
  | { kind: "not-found" | "expired" | "stale" | "ineligible" };

export interface NextBestActionRepository {
  loadCandidates(input: NextBestActionCandidateLoadInput): Promise<NextBestActionCandidate[]>;
  saveRecommendation(uid: string, recommendation: NextBestActionRecommendation): Promise<void>;
  loadRecommendation(uid: string, recommendationId: string): Promise<NextBestActionRecommendation | null>;
  skipRecommendation(input: { uid: string; recommendationId: string; nowMs: number }): Promise<"skipped" | "idempotent" | "expired" | "not-active" | "not-found">;
  dismissRecommendation(input: { uid: string; recommendationId: string; nowMs: number; feedbackCode?: string | null }): Promise<"dismissed" | "idempotent" | "expired" | "not-active" | "not-found">;
  startRecommendation(input: { uid: string; recommendationId: string; nowMs: number }): Promise<NextBestActionStartResult>;
}

export function createFirestoreNextBestActionRepository(db: Firestore = getFirebaseAdminDb()): NextBestActionRepository {
  function userCollection(uid: string, collectionName: string) {
    return db.collection("users").doc(uid).collection(collectionName);
  }

  return {
    async loadCandidates({ uid, nowMs }) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return [];
      const tasksCollection = userCollection(safeUid, "tasks");
      const [taskSnapshot, deletedSnapshot, canonicalHistorySnapshot, recommendationSnapshot, preferencesSnapshot] = await Promise.all([
        tasksCollection.get(),
        userCollection(safeUid, "deletedTasks").get(),
        userCollection(safeUid, "historyEntries").get(),
        userCollection(safeUid, RECOMMENDATION_COLLECTION).get(),
        db.collection("users").doc(safeUid).collection("preferences").doc("v1").get(),
      ]);
      const deletedTaskIds = new Set(deletedSnapshot.docs.map((doc) => doc.id));
      const canonicalRows = canonicalHistorySnapshot.docs.map((doc) => ({ data: () => doc.data() as RawRow }));
      const clarifications = clarificationSignals(recommendationSnapshot.docs.map((doc) => ({ data: () => doc.data() as RawRow })), nowMs);
      const preferences = preferencesSnapshot.exists ? (preferencesSnapshot.data() as RawRow) : null;
      const candidates = await Promise.all(
        taskSnapshot.docs.map(async (doc) => {
          const raw = doc.data() as RawRow;
          const task = mapTask(doc.id, raw);
          const historySnapshot = await tasksCollection.doc(doc.id).collection("history").get();
          const history = readHistoryRows(doc.id, historySnapshot.docs.map((historyDoc) => ({ id: historyDoc.id, data: () => historyDoc.data() as RawRow })), canonicalRows);
          const clarification = clarifications.get(task.id);
          return {
            ownerUid: safeUid,
            task,
            taskVersion: computeTaskClarificationSourceVersion(task.id, raw),
            active: raw.active !== false && raw.status !== "inactive",
            deleted: deletedTaskIds.has(doc.id),
            completed: raw.completed === true || raw.status === "completed",
            blocked: raw.blocked === true || raw.isBlocked === true,
            actionable: raw.actionable !== false,
            hardDateEligible: raw.hardDateEligible !== false,
            incompatibleRunning: raw.incompatibleRunning === true,
            explicitPriority: raw.priority === "high" || raw.priority === "medium" || raw.priority === "low" ? raw.priority : null,
            history,
            clarification: clarification
              ? {
                  status: clarification.status,
                  firstAction: clarification.firstAction,
                  acceptedEstimatedMinutes: clarification.acceptedFields.includes("estimatedMinutes") ? clarification.estimatedMinutes : null,
                }
              : null,
            focusWindowMatched: focusWindowMatch(raw, preferences),
          } satisfies NextBestActionCandidate;
        })
      );
      return candidates;
    },

    async saveRecommendation(uid, recommendation) {
      const safeUid = asString(uid, 120);
      if (!safeUid || recommendation.userId !== safeUid) throw new Error("Recommendation ownership mismatch.");
      await userCollection(safeUid, RECOMMENDATION_COLLECTION).doc(asString(recommendation.id, 160)).set(buildNextBestActionFirestoreRecord(recommendation));
    },

    async loadRecommendation(uid, recommendationId) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return null;
      const snapshot = await userCollection(safeUid, RECOMMENDATION_COLLECTION).doc(safeRecommendationId).get();
      return snapshot.exists ? parseNextBestActionRecommendationRecord(snapshot.data() as Record<string, unknown>) : null;
    },

    async skipRecommendation({ uid, recommendationId, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return "not-found";
      const recommendationRef = userCollection(safeUid, RECOMMENDATION_COLLECTION).doc(safeRecommendationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recommendationRef);
        if (!snapshot.exists) return "not-found" as const;
        const recommendation = parseNextBestActionRecommendationRecord(snapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.userId !== safeUid) return "not-found" as const;
        if (recommendation.status === "SKIPPED") return "idempotent" as const;
        if (recommendation.status !== "ACTIVE") return recommendation.status === "EXPIRED" ? "expired" as const : "not-active" as const;
        if (Date.parse(String(recommendation.expiresAt)) <= nowMs) {
          transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
          return "expired" as const;
        }
        transaction.update(recommendationRef, { status: "SKIPPED", skippedAt: Timestamp.fromMillis(nowMs), alternativeRequestedAt: Timestamp.fromMillis(nowMs), respondedAt: Timestamp.fromMillis(nowMs) });
        return "skipped" as const;
      });
    },

    async dismissRecommendation({ uid, recommendationId, nowMs, feedbackCode }) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return "not-found";
      const recommendationRef = userCollection(safeUid, RECOMMENDATION_COLLECTION).doc(safeRecommendationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recommendationRef);
        if (!snapshot.exists) return "not-found" as const;
        const recommendation = parseNextBestActionRecommendationRecord(snapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.userId !== safeUid) return "not-found" as const;
        if (recommendation.status === "DISMISSED") return "idempotent" as const;
        if (recommendation.status !== "ACTIVE") return recommendation.status === "EXPIRED" ? "expired" as const : "not-active" as const;
        if (Date.parse(String(recommendation.expiresAt)) <= nowMs) {
          transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
          return "expired" as const;
        }
        transaction.update(recommendationRef, { status: "DISMISSED", dismissedAt: Timestamp.fromMillis(nowMs), respondedAt: Timestamp.fromMillis(nowMs), feedbackCode: asString(feedbackCode, 60) || null });
        return "dismissed" as const;
      });
    },

    async startRecommendation({ uid, recommendationId, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return { kind: "not-found" };
      const recommendationRef = userCollection(safeUid, RECOMMENDATION_COLLECTION).doc(safeRecommendationId);
      const taskRefFor = (taskId: string) => userCollection(safeUid, "tasks").doc(taskId);
      return db.runTransaction(async (transaction) => {
        const recommendationSnapshot = await transaction.get(recommendationRef);
        if (!recommendationSnapshot.exists) return { kind: "not-found" } as const;
        const recommendation = parseNextBestActionRecommendationRecord(recommendationSnapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.userId !== safeUid) return { kind: "not-found" } as const;
        const taskSnapshot = await transaction.get(taskRefFor(recommendation.taskId));
        if (!taskSnapshot.exists) return { kind: "not-found" } as const;
        if (recommendation.status === "STARTED") return { kind: "idempotent", recommendation } as const;
        if (recommendation.status !== "ACTIVE") return recommendation.status === "EXPIRED" ? ({ kind: "expired" } as const) : ({ kind: "not-found" } as const);
        if (Date.parse(String(recommendation.expiresAt)) <= nowMs) {
          transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
          return { kind: "expired" } as const;
        }
        const taskData = taskSnapshot.data() as RawRow;
        const currentTaskVersion = computeTaskClarificationSourceVersion(recommendation.taskId, taskData);
        if (currentTaskVersion !== recommendation.sourceTaskVersion) return { kind: "stale" } as const;
        const eligible = taskData.active !== false && taskData.deleted !== true && taskData.status !== "inactive" && taskData.status !== "completed" && taskData.completed !== true && taskData.blocked !== true && taskData.isBlocked !== true && taskData.actionable !== false;
        if (!eligible) return { kind: "ineligible" } as const;
        const startedAt = new Date(nowMs).toISOString();
        transaction.update(recommendationRef, { status: "STARTED", startedAt: Timestamp.fromMillis(nowMs), respondedAt: Timestamp.fromMillis(nowMs) });
        return { kind: "started", recommendation: { ...recommendation, status: "STARTED", startedAt } } as const;
      });
    },
  };
}

export function createRecommendationForRanking(input: {
  id: string;
  uid: string;
  ranked: {
    taskId: string;
    title: string;
    taskVersion: string | null;
    score: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    reasonCodes: Parameters<typeof createNextBestActionRecommendation>[0]["reasonCodes"];
    durationMinutes: number;
    durationSource: Parameters<typeof createNextBestActionRecommendation>[0]["durationSource"];
    firstAction: string | null;
    focusWindowMatched: boolean;
  };
  availableMinutes?: number | null;
  alternativeIndex?: number;
  explanation: string;
  nowMs: number;
}) {
  if (!input.ranked.taskVersion) throw new Error("Recommendation source version is missing.");
  return createNextBestActionRecommendation({
    ...input.ranked,
    id: input.id,
    userId: input.uid,
    sourceTaskVersion: input.ranked.taskVersion,
    availableMinutes: input.availableMinutes,
    alternativeIndex: input.alternativeIndex,
    explanation: input.explanation,
    nowMs: input.nowMs,
    auditExpiresAtMs: input.nowMs + NEXT_BEST_ACTION_AUDIT_RETENTION_MS,
  });
}
