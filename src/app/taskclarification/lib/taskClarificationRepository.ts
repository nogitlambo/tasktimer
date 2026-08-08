import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { parseRecommendationType, RECOMMENDATION_COLLECTION } from "@/app/recommendations/lib/recommendationContract";

import {
  computeTaskClarificationSourceVersion,
  createTaskClarificationTaskContext,
  TaskClarificationResponseSchema,
  type TaskClarificationRecommendation,
  type TaskClarificationStatus,
  type TaskClarificationTaskContext,
} from "./taskClarification";
import { isTaskClarificationUndoWindowOpen } from "./taskClarificationRecovery";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function parseSupportedTaskFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = asString((value as Record<string, unknown>).name, 160);
  return name ? { name } : {};
}

function timestampFromIso(value: string) {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error("Invalid clarification timestamp.");
  return Timestamp.fromMillis(millis);
}

function isoFromFirestoreTimestamp(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

const recommendationStatuses = new Set<TaskClarificationStatus>(["ACTIVE", "ACCEPTED", "PARTIALLY_ACCEPTED", "DISMISSED", "EXPIRED", "REVERSED"]);

export function parseRecommendationRecord(value: Record<string, unknown>): TaskClarificationRecommendation | null {
  if (parseRecommendationType(value.type) !== "TASK_CLARIFICATION") return null;
  const rawSubtasks = Array.isArray(value.subtasks) ? value.subtasks : [];
  const response = TaskClarificationResponseSchema.safeParse({
    suggestedTitle: value.suggestedTitle,
    definitionOfDone: value.definitionOfDone,
    firstAction: value.firstAction,
    stoppingPoint: value.stoppingPoint,
    estimatedMinutes: value.estimatedMinutes,
    estimatedRange: value.estimatedRange,
    subtasks: rawSubtasks.map((subtask) => {
      const row = subtask as Record<string, unknown>;
      return { title: row.title, estimatedMinutes: row.estimatedMinutes };
    }),
    clarificationQuestions: value.clarificationQuestions,
    warnings: value.warnings,
    reasonCodes: value.reasonCodes,
    confidence: value.confidence,
    ambiguityScore: value.ambiguityScore,
    initiationDifficultyScore: value.initiationDifficultyScore,
  });
  const createdAt = isoFromFirestoreTimestamp(value.createdAt);
  const expiresAt = isoFromFirestoreTimestamp(value.expiresAt);
  const auditExpiresAt = isoFromFirestoreTimestamp(value.auditExpiresAt);
  const status = asString(value.status, 40) as TaskClarificationStatus;
  if (!response.success || !createdAt || !expiresAt || !auditExpiresAt || !recommendationStatuses.has(status)) return null;
  const id = asString(value.id, 160);
  const userId = asString(value.userId, 120);
  const taskId = asString(value.taskId, 160);
  const sourceTaskVersion = asString(value.sourceTaskVersion, 160);
  const originalTitle = asString(value.originalTitle, 160);
  if (!id || !userId || !taskId || !sourceTaskVersion || !originalTitle) return null;
  return {
    id,
    userId,
    taskId,
    sourceTaskVersion,
    type: "TASK_CLARIFICATION",
    status,
    originalTitle,
    userInstruction: typeof value.userInstruction === "string" ? value.userInstruction : null,
    sourceRecommendationId: typeof value.sourceRecommendationId === "string" ? value.sourceRecommendationId : null,
    regenerationCount: Math.max(0, Math.floor(Number(value.regenerationCount) || 0)),
    applyIdempotencyKey: typeof value.applyIdempotencyKey === "string" ? value.applyIdempotencyKey : null,
    applyStatus: value.applyStatus === "APPLIED" ? "APPLIED" : "NOT_APPLIED",
    applyResult: value.applyResult === "APPLIED" || value.applyResult === "NO_SUPPORTED_CHANGES" ? value.applyResult : null,
    originalTaskFields: parseSupportedTaskFields(value.originalTaskFields),
    appliedTaskFields: parseSupportedTaskFields(value.appliedTaskFields),
    appliedTaskVersion: typeof value.appliedTaskVersion === "string" ? value.appliedTaskVersion : null,
    reversibleUntil: isoFromFirestoreTimestamp(value.reversibleUntil),
    undoIdempotencyKey: typeof value.undoIdempotencyKey === "string" ? value.undoIdempotencyKey : null,
    undoStatus:
      value.undoStatus === "AVAILABLE" || value.undoStatus === "EXPIRED" || value.undoStatus === "REVERSED" || value.undoStatus === "PARTIALLY_REVERSED"
        ? value.undoStatus
        : "NOT_AVAILABLE",
    undoResult:
      value.undoResult === "REVERSED" || value.undoResult === "PARTIALLY_REVERSED" || value.undoResult === "NO_CHANGES" ? value.undoResult : null,
    undoConflicts: Array.isArray(value.undoConflicts) ? value.undoConflicts.filter((entry): entry is string => typeof entry === "string") : [],
    ...response.data,
    subtasks: response.data.subtasks.map((subtask, index) => ({
      ...subtask,
      id: typeof (rawSubtasks[index] as Record<string, unknown> | undefined)?.id === "string" ? String((rawSubtasks[index] as Record<string, unknown>).id) : `subtask-${index + 1}`,
    })),
    acceptedFields: Array.isArray(value.acceptedFields) ? value.acceptedFields.filter((entry): entry is string => typeof entry === "string") : [],
    rejectedFields: Array.isArray(value.rejectedFields) ? value.rejectedFields.filter((entry): entry is string => typeof entry === "string") : [],
    createdSubtaskIds: Array.isArray(value.createdSubtaskIds) ? value.createdSubtaskIds.filter((entry): entry is string => typeof entry === "string") : [],
    createdSubtaskProvenance: Array.isArray(value.createdSubtaskProvenance)
      ? value.createdSubtaskProvenance.filter(
          (entry): entry is { recommendationSubtaskId: string; taskId: string } =>
            !!entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).recommendationSubtaskId === "string" && typeof (entry as Record<string, unknown>).taskId === "string"
        )
      : [],
    createdSubtaskVersions: Array.isArray(value.createdSubtaskVersions)
      ? value.createdSubtaskVersions.filter(
          (entry): entry is { taskId: string; sourceTaskVersion: string } =>
            !!entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).taskId === "string" && typeof (entry as Record<string, unknown>).sourceTaskVersion === "string"
        )
      : [],
    removedSubtaskIds: Array.isArray(value.removedSubtaskIds) ? value.removedSubtaskIds.filter((entry): entry is string => typeof entry === "string") : [],
    modelVersion: asString(value.modelVersion, 120),
    promptVersion: asString(value.promptVersion, 120),
    createdAt,
    respondedAt: isoFromFirestoreTimestamp(value.respondedAt),
    expiresAt,
    auditExpiresAt,
  };
}

function buildClarificationSubtaskTaskRecord(taskId: string, title: string, order: number, nowMs: number) {
  const timestamp = Timestamp.fromMillis(nowMs);
  return {
    id: taskId,
    name: title,
    order,
    collapsed: false,
    color: null,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    hasStarted: false,
    checkpointsEnabled: false,
    checkpointTimeUnit: "minute",
    checkpoints: [],
    checkpointSoundEnabled: false,
    checkpointSoundMode: "once",
    timeGoalAction: "confirmModal",
    presetIntervalsEnabled: false,
    presetIntervalValue: 0,
    presetIntervalLastCheckpointId: null,
    presetIntervalNextSeq: 1,
    timeGoalEnabled: false,
    timeGoalValue: 0,
    timeGoalUnit: "minute",
    timeGoalPeriod: "day",
    timeGoalMinutes: 0,
    timeGoalCompletedDayKey: null,
    timeGoalCompletedWeekKey: null,
    timeGoalCompletedAtMs: null,
    timeGoalCompletedReason: null,
    timeGoalCompletedElapsedMs: null,
    resumePendingSinceDayKey: null,
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    plannedStartDay: null,
    plannedStartTime: null,
    plannedStartByDay: null,
    plannedStartOpenEnded: false,
    plannedStartPushRemindersEnabled: false,
    sharedSourceOwnerUid: null,
    sharedSourceTaskId: null,
    sharedSourceShareDocId: null,
    sharedSourceImportedAtMs: null,
    bgTimeGoalPushEligible: false,
    bgTimeGoalPushDueAtMs: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    schemaVersion: 1,
  };
}

export interface TaskClarificationRepository {
  loadTask(uid: string, taskId: string): Promise<TaskClarificationTaskContext | null>;
  loadRecommendation(uid: string, recommendationId: string): Promise<TaskClarificationRecommendation | null>;
  claimRecommendationRegeneration(uid: string, recommendationId: string): Promise<TaskClarificationRecommendation | null>;
  expireRecommendation(uid: string, recommendationId: string, nowMs: number): Promise<boolean>;
  dismissRecommendation(uid: string, recommendationId: string, taskId: string, nowMs: number): Promise<"dismissed" | "idempotent" | "not-found" | "expired" | "not-active">;
  applyRecommendation(input: {
    uid: string;
    recommendationId: string;
    taskId: string;
    sourceTaskVersion: string;
    idempotencyKey: string;
    patch: Record<string, unknown>;
    acceptedFields: string[];
    rejectedFields: string[];
    subtasks: Array<{ id: string; title: string; estimatedMinutes: number | null }>;
    nowMs: number;
  }): Promise<
    | { kind: "applied" | "idempotent"; recommendation: TaskClarificationRecommendation }
    | { kind: "not-found" | "stale" | "expired" | "already-applied" | "invalid-subtasks" }
  >;
  undoRecommendation(input: {
    uid: string;
    recommendationId: string;
    taskId: string;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<
    | { kind: "reversed" | "partially-reversed" | "idempotent"; recommendation: TaskClarificationRecommendation }
    | { kind: "not-found" | "not-reversible" | "expired" | "already-undone" }
  >;
  saveRecommendation(uid: string, recommendation: TaskClarificationRecommendation): Promise<void>;
}

export function buildTaskClarificationFirestoreRecord(recommendation: TaskClarificationRecommendation) {
  return {
    id: recommendation.id,
    userId: recommendation.userId,
    taskId: recommendation.taskId,
    sourceTaskVersion: recommendation.sourceTaskVersion,
    type: recommendation.type || "TASK_CLARIFICATION",
    status: recommendation.status,
    originalTitle: recommendation.originalTitle,
    userInstruction: recommendation.userInstruction,
    sourceRecommendationId: recommendation.sourceRecommendationId,
    regenerationCount: recommendation.regenerationCount,
    applyIdempotencyKey: recommendation.applyIdempotencyKey,
    applyStatus: recommendation.applyStatus,
    applyResult: recommendation.applyResult,
    originalTaskFields: recommendation.originalTaskFields,
    appliedTaskFields: recommendation.appliedTaskFields,
    appliedTaskVersion: recommendation.appliedTaskVersion,
    reversibleUntil: recommendation.reversibleUntil ? timestampFromIso(recommendation.reversibleUntil) : null,
    undoIdempotencyKey: recommendation.undoIdempotencyKey,
    undoStatus: recommendation.undoStatus,
    undoResult: recommendation.undoResult,
    undoConflicts: recommendation.undoConflicts,
    suggestedTitle: recommendation.suggestedTitle,
    definitionOfDone: recommendation.definitionOfDone,
    firstAction: recommendation.firstAction,
    stoppingPoint: recommendation.stoppingPoint,
    estimatedMinutes: recommendation.estimatedMinutes,
    estimatedRange: recommendation.estimatedRange,
    subtasks: recommendation.subtasks,
    clarificationQuestions: recommendation.clarificationQuestions,
    warnings: recommendation.warnings,
    reasonCodes: recommendation.reasonCodes,
    confidence: recommendation.confidence,
    ambiguityScore: recommendation.ambiguityScore,
    initiationDifficultyScore: recommendation.initiationDifficultyScore,
    acceptedFields: recommendation.acceptedFields,
    rejectedFields: recommendation.rejectedFields,
    createdSubtaskIds: recommendation.createdSubtaskIds,
    createdSubtaskVersions: recommendation.createdSubtaskVersions,
    removedSubtaskIds: recommendation.removedSubtaskIds,
    createdSubtaskProvenance: recommendation.createdSubtaskProvenance,
    modelVersion: recommendation.modelVersion,
    promptVersion: recommendation.promptVersion,
    createdAt: timestampFromIso(recommendation.createdAt),
    respondedAt: recommendation.respondedAt ? timestampFromIso(recommendation.respondedAt) : null,
    expiresAt: timestampFromIso(recommendation.expiresAt),
    auditExpiresAt: timestampFromIso(recommendation.auditExpiresAt),
    schemaVersion: 1,
  };
}

export function createFirestoreTaskClarificationRepository(db: Firestore = getFirebaseAdminDb()): TaskClarificationRepository {
  function tasksCollection(uid: string) {
    return db.collection("users").doc(uid).collection("tasks");
  }

  function recommendationsCollection(uid: string) {
    return db.collection("users").doc(uid).collection(RECOMMENDATION_COLLECTION);
  }

  return {
    async loadTask(uid, taskId) {
      const safeUid = asString(uid, 120);
      const safeTaskId = asString(taskId, 160);
      if (!safeUid || !safeTaskId) return null;
      const taskSnap = await tasksCollection(safeUid).doc(safeTaskId).get();
      if (!taskSnap.exists) return null;
      return createTaskClarificationTaskContext(safeTaskId, taskSnap.data() as Record<string, unknown>);
    },

    async saveRecommendation(uid, recommendation) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendation.id, 160);
      if (!safeUid || !safeRecommendationId) throw new Error("Missing clarification recommendation identity.");
      await recommendationsCollection(safeUid)
        .doc(safeRecommendationId)
        .set(buildTaskClarificationFirestoreRecord(recommendation));
    },

    async loadRecommendation(uid, recommendationId) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return null;
      const snapshot = await recommendationsCollection(safeUid).doc(safeRecommendationId).get();
      if (!snapshot.exists) return null;
      return parseRecommendationRecord(snapshot.data() as Record<string, unknown>);
    },

    async expireRecommendation(uid, recommendationId, nowMs) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return false;
      const recommendationRef = recommendationsCollection(safeUid).doc(safeRecommendationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recommendationRef);
        if (!snapshot.exists) return false;
        const recommendation = parseRecommendationRecord(snapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.status !== "ACTIVE" || Date.parse(recommendation.expiresAt) > nowMs) return false;
        transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
        return true;
      });
    },

    async dismissRecommendation(uid, recommendationId, taskId, nowMs) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      const safeTaskId = asString(taskId, 160);
      if (!safeUid || !safeRecommendationId || !safeTaskId) return "not-found";
      const recommendationRef = recommendationsCollection(safeUid).doc(safeRecommendationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recommendationRef);
        if (!snapshot.exists) return "not-found" as const;
        const recommendation = parseRecommendationRecord(snapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.userId !== safeUid || recommendation.taskId !== safeTaskId) return "not-found" as const;
        if (recommendation.status === "DISMISSED") return "idempotent" as const;
        if (recommendation.status !== "ACTIVE") return recommendation.status === "EXPIRED" ? ("expired" as const) : ("not-active" as const);
        if (Date.parse(recommendation.expiresAt) <= nowMs) {
          transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
          return "expired" as const;
        }
        transaction.update(recommendationRef, { status: "DISMISSED", respondedAt: Timestamp.fromMillis(nowMs) });
        return "dismissed" as const;
      });
    },

    async claimRecommendationRegeneration(uid, recommendationId) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      if (!safeUid || !safeRecommendationId) return null;
      const recommendationRef = recommendationsCollection(safeUid).doc(safeRecommendationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recommendationRef);
        if (!snapshot.exists) return null;
        const recommendation = parseRecommendationRecord(snapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.status !== "ACTIVE" || recommendation.regenerationCount > 0 || recommendation.sourceRecommendationId) {
          return null;
        }
        transaction.update(recommendationRef, { regenerationCount: 1, updatedAt: Timestamp.now() });
        return recommendation;
      });
    },

    async applyRecommendation({ uid, recommendationId, taskId, sourceTaskVersion, idempotencyKey, patch, acceptedFields, rejectedFields, subtasks, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      const safeTaskId = asString(taskId, 160);
      const safeIdempotencyKey = asString(idempotencyKey, 160);
      if (!safeUid || !safeRecommendationId || !safeTaskId || !safeIdempotencyKey) return { kind: "not-found" };
      if (Object.keys(patch).some((key) => key !== "name")) return { kind: "not-found" };
      const recommendationRef = recommendationsCollection(safeUid).doc(safeRecommendationId);
      const taskRef = tasksCollection(safeUid).doc(safeTaskId);
      return db.runTransaction(async (transaction) => {
        const recommendationSnapshot = await transaction.get(recommendationRef);
        const taskSnapshot = await transaction.get(taskRef);
        if (!recommendationSnapshot.exists || !taskSnapshot.exists) return { kind: "not-found" } as const;
        const recommendation = parseRecommendationRecord(recommendationSnapshot.data() as Record<string, unknown>);
        const task = createTaskClarificationTaskContext(safeTaskId, taskSnapshot.data() as Record<string, unknown>);
        if (!recommendation || !task || recommendation.taskId !== safeTaskId || recommendation.userId !== safeUid) return { kind: "not-found" } as const;
        if (recommendation.applyStatus === "APPLIED") {
          return recommendation.applyIdempotencyKey === safeIdempotencyKey
            ? ({ kind: "idempotent", recommendation } as const)
            : ({ kind: "already-applied" } as const);
        }
        if (recommendation.status !== "ACTIVE" || Date.parse(recommendation.expiresAt) <= nowMs) {
          if (recommendation.status === "ACTIVE") transaction.update(recommendationRef, { status: "EXPIRED", respondedAt: Timestamp.fromMillis(nowMs) });
          return { kind: "expired" } as const;
        }
        if (task.sourceTaskVersion !== sourceTaskVersion || recommendation.sourceTaskVersion !== sourceTaskVersion) return { kind: "stale" } as const;
        if (acceptedFields.includes("subtasks") !== (subtasks.length > 0)) return { kind: "invalid-subtasks" } as const;
        const recommendationSubtasksById = new Map(recommendation.subtasks.map((subtask) => [subtask.id, subtask]));
        const seenSubtaskIds = new Set<string>();
        const seenSubtaskTitles = new Set<string>();
        const normalizedParentTitle = task.title.toLocaleLowerCase().replace(/\s+/g, " ").trim();
        for (const subtask of subtasks) {
          const normalizedTitle = subtask.title.toLocaleLowerCase().replace(/\s+/g, " ").trim();
          if (
            seenSubtaskIds.has(subtask.id) ||
            seenSubtaskTitles.has(normalizedTitle) ||
            normalizedTitle === normalizedParentTitle ||
            !recommendationSubtasksById.has(subtask.id)
          ) {
            return { kind: "invalid-subtasks" } as const;
          }
          seenSubtaskIds.add(subtask.id);
          seenSubtaskTitles.add(normalizedTitle);
        }
        const respondedAt = new Date(nowMs).toISOString();
        const applyTimestamp = Timestamp.fromMillis(nowMs);
        const createdSubtaskIds: string[] = [];
        const createdSubtaskProvenance: Array<{ recommendationSubtaskId: string; taskId: string }> = [];
        const createdSubtaskVersions: Array<{ taskId: string; sourceTaskVersion: string }> = [];
        for (let index = 0; index < subtasks.length; index += 1) {
          const selectedSubtask = subtasks[index]!;
          const subtaskRef = tasksCollection(safeUid).doc();
          const createdTaskId = String((subtaskRef as { id?: unknown }).id || "").trim();
          if (!createdTaskId) return { kind: "invalid-subtasks" } as const;
          createdSubtaskIds.push(createdTaskId);
          createdSubtaskProvenance.push({ recommendationSubtaskId: selectedSubtask.id, taskId: createdTaskId });
          const createdTask = buildClarificationSubtaskTaskRecord(createdTaskId, selectedSubtask.title, Number(taskSnapshot.data()?.order || 0) + index + 1, nowMs);
          createdSubtaskVersions.push({ taskId: createdTaskId, sourceTaskVersion: computeTaskClarificationSourceVersion(createdTaskId, createdTask) });
          transaction.set(
            subtaskRef,
            createdTask
          );
        }
        const originalTaskFields = { name: task.title };
        const appliedTaskFields = acceptedFields.includes("name") ? { name: asString(patch.name, 160) } : {};
        const appliedTaskVersion = computeTaskClarificationSourceVersion(safeTaskId, {
          ...(taskSnapshot.data() as Record<string, unknown>),
          ...patch,
          updatedAt: applyTimestamp,
        });
        const nextRecommendation: TaskClarificationRecommendation = {
          ...recommendation,
          status: rejectedFields.length ? "PARTIALLY_ACCEPTED" : "ACCEPTED",
          acceptedFields,
          rejectedFields,
          respondedAt,
          applyIdempotencyKey: safeIdempotencyKey,
          applyStatus: "APPLIED",
          applyResult: "APPLIED",
          originalTaskFields,
          appliedTaskFields,
          appliedTaskVersion,
          reversibleUntil: new Date(nowMs + 30_000).toISOString(),
          undoIdempotencyKey: null,
          undoStatus: "AVAILABLE",
          undoResult: null,
          undoConflicts: [],
          createdSubtaskIds,
          createdSubtaskProvenance,
          createdSubtaskVersions,
          removedSubtaskIds: [],
        };
        transaction.update(taskRef, { ...patch, updatedAt: applyTimestamp });
        transaction.update(recommendationRef, {
          status: nextRecommendation.status,
          acceptedFields,
          rejectedFields,
          respondedAt: Timestamp.fromMillis(nowMs),
          applyIdempotencyKey: safeIdempotencyKey,
          applyStatus: "APPLIED",
          applyResult: "APPLIED",
          originalTaskFields,
          appliedTaskFields,
          appliedTaskVersion,
          reversibleUntil: Timestamp.fromMillis(nowMs + 30_000),
          undoIdempotencyKey: null,
          undoStatus: "AVAILABLE",
          undoResult: null,
          undoConflicts: [],
          createdSubtaskIds,
          createdSubtaskProvenance,
          createdSubtaskVersions,
          removedSubtaskIds: [],
        });
        return { kind: "applied", recommendation: nextRecommendation } as const;
      });
    },

    async undoRecommendation({ uid, recommendationId, taskId, idempotencyKey, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeRecommendationId = asString(recommendationId, 160);
      const safeTaskId = asString(taskId, 160);
      const safeIdempotencyKey = asString(idempotencyKey, 160);
      if (!safeUid || !safeRecommendationId || !safeTaskId || !safeIdempotencyKey) return { kind: "not-found" };
      const recommendationRef = recommendationsCollection(safeUid).doc(safeRecommendationId);
      const taskRef = tasksCollection(safeUid).doc(safeTaskId);
      return db.runTransaction(async (transaction) => {
        const recommendationSnapshot = await transaction.get(recommendationRef);
        const taskSnapshot = await transaction.get(taskRef);
        if (!recommendationSnapshot.exists || !taskSnapshot.exists) return { kind: "not-found" } as const;
        const recommendation = parseRecommendationRecord(recommendationSnapshot.data() as Record<string, unknown>);
        if (!recommendation || recommendation.userId !== safeUid || recommendation.taskId !== safeTaskId) return { kind: "not-found" } as const;
        if (recommendation.undoStatus === "REVERSED" || recommendation.undoStatus === "PARTIALLY_REVERSED") {
          return recommendation.undoIdempotencyKey === safeIdempotencyKey
            ? ({ kind: "idempotent", recommendation } as const)
            : ({ kind: "already-undone" } as const);
        }
        if (recommendation.applyStatus !== "APPLIED" || recommendation.undoStatus !== "AVAILABLE") return { kind: "not-reversible" } as const;
        if (!isTaskClarificationUndoWindowOpen(recommendation.reversibleUntil, nowMs)) {
          transaction.update(recommendationRef, { undoStatus: "EXPIRED" });
          return { kind: "expired" } as const;
        }

        const createdVersionRows = recommendation.createdSubtaskVersions;
        const createdSnapshots = await Promise.all(
          createdVersionRows.map(async (row) => ({
            row,
            ref: tasksCollection(safeUid).doc(row.taskId),
            snapshot: await transaction.get(tasksCollection(safeUid).doc(row.taskId)),
          }))
        );
        const currentTask = taskSnapshot.data() as Record<string, unknown>;
        const conflicts: string[] = [];
        const removedSubtaskIds: string[] = [];
        let restoreParentName: string | undefined;
        if (recommendation.appliedTaskFields?.name) {
          if (asString(currentTask.name, 160) === recommendation.appliedTaskFields.name) {
            restoreParentName = recommendation.originalTaskFields?.name;
          } else {
            conflicts.push("parent-name-changed");
          }
        }
        for (const { row, ref, snapshot } of createdSnapshots) {
          if (!snapshot.exists) {
            removedSubtaskIds.push(row.taskId);
            continue;
          }
          const currentVersion = computeTaskClarificationSourceVersion(row.taskId, snapshot.data() as Record<string, unknown>);
          if (currentVersion === row.sourceTaskVersion) {
            transaction.delete(ref);
            removedSubtaskIds.push(row.taskId);
          } else {
            conflicts.push(`task:${row.taskId}:changed`);
          }
        }
        if (restoreParentName) transaction.update(taskRef, { name: restoreParentName, updatedAt: Timestamp.fromMillis(nowMs) });
        const partiallyReversed = conflicts.length > 0;
        const nextRecommendation: TaskClarificationRecommendation = {
          ...recommendation,
          status: partiallyReversed ? "PARTIALLY_ACCEPTED" : "REVERSED",
          respondedAt: new Date(nowMs).toISOString(),
          undoIdempotencyKey: safeIdempotencyKey,
          undoStatus: partiallyReversed ? "PARTIALLY_REVERSED" : "REVERSED",
          undoResult: partiallyReversed ? "PARTIALLY_REVERSED" : removedSubtaskIds.length || restoreParentName ? "REVERSED" : "NO_CHANGES",
          undoConflicts: conflicts,
          removedSubtaskIds,
        };
        transaction.update(recommendationRef, {
          status: nextRecommendation.status,
          respondedAt: Timestamp.fromMillis(nowMs),
          undoIdempotencyKey: safeIdempotencyKey,
          undoStatus: nextRecommendation.undoStatus,
          undoResult: nextRecommendation.undoResult,
          undoConflicts: conflicts,
          removedSubtaskIds,
        });
        return { kind: partiallyReversed ? "partially-reversed" : "reversed", recommendation: nextRecommendation } as const;
      });
    },
  };
}
