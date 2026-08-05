import type { Task } from "@/app/tasktimer/lib/types";

import type { BrainDumpCreationBatchResult, BrainDumpReviewSession, BrainDumpSessionStore, BrainDumpUndoBatchResult } from "./brainDumpProcessing";
import type { BrainDumpWorkspaceRepository } from "./brainDumpTaskCreation";

const BRAIN_DUMP_UNDO_WINDOW_MS = 30_000;

export class BrainDumpUndoError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BrainDumpUndoError";
  }
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function materialTaskSnapshot(task: Task | null | undefined) {
  if (!task) return null;
  return {
    id: task.id,
    name: task.name,
    taskType: task.taskType || "recurring",
    onceOffDay: task.onceOffDay || null,
    onceOffTargetDate: task.onceOffTargetDate || null,
    timeGoalEnabled: !!task.timeGoalEnabled,
    timeGoalValue: Number(task.timeGoalValue || 0),
    timeGoalUnit: task.timeGoalUnit || "hour",
    timeGoalPeriod: task.timeGoalPeriod || "day",
    timeGoalMinutes: Number(task.timeGoalMinutes || 0),
    plannedStartDay: task.plannedStartDay || null,
    plannedStartTime: task.plannedStartTime || null,
    plannedStartByDay: task.plannedStartByDay || null,
    plannedStartOpenEnded: !!task.plannedStartOpenEnded,
  };
}

function materiallyMatches(current: Task, snapshot: Task | null | undefined) {
  const expected = materialTaskSnapshot(snapshot);
  if (!expected) return false;
  return JSON.stringify(materialTaskSnapshot(current)) === JSON.stringify(expected);
}

function taskIsStarted(task: Task) {
  return !!task.running || task.startMs != null || !!task.hasStarted || Number(task.accumulatedMs || 0) > 0;
}

function taskIsCompleted(task: Task) {
  return task.timeGoalCompletedReason === "goal" || task.timeGoalCompletedReason === "reset";
}

function taskIsShared(task: Task) {
  return !!(task.sharedSourceOwnerUid || task.sharedSourceTaskId || task.sharedSourceShareDocId || task.sharedSourceImportedAtMs);
}

function createdItems(batch: BrainDumpCreationBatchResult) {
  return batch.items.filter((item) => item.status === "created" && item.createdTaskId);
}

async function safetyReason(input: {
  uid: string;
  task: Task | null;
  snapshot: Task | null | undefined;
  workspace: BrainDumpWorkspaceRepository;
}) {
  if (!input.task) return "task-missing";
  if (!input.snapshot) return "missing-task-snapshot";
  if (taskIsStarted(input.task)) return "task-started";
  if (taskIsCompleted(input.task)) return "task-completed";
  if (taskIsShared(input.task)) return "task-shared";
  if (!materiallyMatches(input.task, input.snapshot)) return "task-edited";
  if (input.workspace.hasTaskDependents && (await input.workspace.hasTaskDependents(input.uid, input.task.id))) {
    return "task-has-dependent-records";
  }
  return null;
}

export async function undoBrainDumpCreationBatch(input: {
  uid: string;
  sessionId: string;
  idempotencyKey: string;
  store: BrainDumpSessionStore;
  workspace: BrainDumpWorkspaceRepository;
  now?: () => number;
}): Promise<BrainDumpUndoBatchResult> {
  const uid = asString(input.uid, 120);
  const sessionId = asString(input.sessionId, 120);
  const idempotencyKey = asString(input.idempotencyKey, 120);
  if (!uid) throw new BrainDumpUndoError("You must be signed in to continue.", "auth/unauthenticated", 401);
  if (!sessionId) throw new BrainDumpUndoError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  if (!idempotencyKey) throw new BrainDumpUndoError("Brain Dump undo requires a batch id.", "brain-dump/undo-batch-required", 400);

  const session = await input.store.getSession(uid, sessionId);
  if (!session || session.ownerUid !== uid || session.id !== sessionId) {
    throw new BrainDumpUndoError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  }
  if (session.undoResult) return session.undoResult;
  const batch = session.batchResult;
  if (!batch || batch.idempotencyKey !== idempotencyKey) {
    throw new BrainDumpUndoError("Brain Dump batch was not found.", "brain-dump/batch-not-found", 404);
  }

  const nowMs = Math.max(0, Math.floor(Number(input.now?.() ?? Date.now()) || 0));
  const batchItems = createdItems(batch);
  if (nowMs - batch.completedAtMs > BRAIN_DUMP_UNDO_WINDOW_MS) {
    const result: BrainDumpUndoBatchResult = {
      sessionId,
      idempotencyKey,
      state: "expired",
      removedCount: 0,
      retainedCount: batchItems.length,
      completedAtMs: nowMs,
      items: batchItems.map((item) => ({
        itemId: item.itemId,
        status: "retained",
        createdTaskId: item.createdTaskId,
        reason: "undo-window-expired",
      })),
    };
    await input.store.saveSession({ ...session, undoResult: result });
    return result;
  }

  const workspaceTasks = await input.workspace.loadTasks(uid);
  const tasksById = new Map(workspaceTasks.map((task) => [task.id, task]));
  const taskIdsToRemove: string[] = [];
  const resultItems: BrainDumpUndoBatchResult["items"] = [];

  for (const item of batchItems) {
    const taskId = item.createdTaskId || "";
    const task = tasksById.get(taskId) || null;
    const reason = await safetyReason({
      uid,
      task,
      snapshot: item.createdTaskSnapshot,
      workspace: input.workspace,
    });
    if (reason) {
      resultItems.push({ itemId: item.itemId, status: "retained", createdTaskId: taskId, reason });
    } else {
      taskIdsToRemove.push(taskId);
      resultItems.push({ itemId: item.itemId, status: "removed", createdTaskId: taskId });
    }
  }

  if (taskIdsToRemove.length) {
    if (input.workspace.deleteTasks) {
      await input.workspace.deleteTasks(uid, taskIdsToRemove);
    } else {
      await input.workspace.saveTasks(
        uid,
        workspaceTasks.filter((task) => !taskIdsToRemove.includes(task.id))
      );
    }
  }

  const removedCount = resultItems.filter((item) => item.status === "removed").length;
  const retainedCount = resultItems.filter((item) => item.status === "retained").length;
  const state: BrainDumpUndoBatchResult["state"] =
    removedCount > 0 && retainedCount > 0 ? "partially_undone" : removedCount > 0 ? "undone" : "not_undone";
  const result: BrainDumpUndoBatchResult = {
    sessionId,
    idempotencyKey,
    state,
    removedCount,
    retainedCount,
    completedAtMs: nowMs,
    items: resultItems,
  };
  const updatedSession: BrainDumpReviewSession = {
    ...session,
    undoResult: result,
  };
  await input.store.saveSession(updatedSession);
  return result;
}
