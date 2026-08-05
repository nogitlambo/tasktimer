import type { Task } from "@/app/tasktimer/lib/types";
import { createTaskTimerSharedTask } from "@/app/tasktimer/client/task-shared";
import type { DeletedTaskMeta } from "@/app/tasktimer/lib/types";

import type {
  BrainDumpCreationBatchResult,
  BrainDumpReviewDate,
  BrainDumpReviewItem,
  BrainDumpReviewItemUpdate,
  BrainDumpReviewSession,
  BrainDumpSessionStore,
} from "./brainDumpProcessing";
import { applyBrainDumpReviewItemUpdate, normalizeBrainDumpReviewItemUpdate } from "./brainDumpProcessing";
import { refreshBrainDumpDuplicateWarnings } from "./brainDumpProcessing";

export type BrainDumpWorkspaceRepository = {
  loadTasks(uid: string): Promise<Task[]>;
  loadTaskStatusMeta?(uid: string): Promise<DeletedTaskMeta>;
  saveTasks(uid: string, tasks: Task[]): Promise<void>;
  saveTask?(uid: string, task: Task): Promise<void>;
  deleteTasks?(uid: string, taskIds: string[]): Promise<void>;
  hasTaskDependents?(uid: string, taskId: string): Promise<boolean>;
};

export class BrainDumpCreationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BrainDumpCreationError";
  }
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function nextTaskOrder(tasks: Task[]) {
  return (tasks || []).reduce((max, task) => Math.max(max, Number(task?.order || 0)), 0) + 1;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function hashCreationPayload(updates: ReturnType<typeof normalizeBrainDumpReviewItemUpdate>[]) {
  const canonical = updates
    .slice()
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((update) => ({
      itemId: update.itemId,
      selected: update.selected === true,
      title: update.title ?? "",
      date: update.date ?? null,
      enrichment: update.enrichment ?? null,
    }));
  return `fnv1a:${hashString(JSON.stringify(canonical))}`;
}

function itemCanCreateTask(item: BrainDumpReviewItem) {
  return (
    item.itemType === "task" &&
    item.supported &&
    item.selected &&
    item.validationErrors.length === 0 &&
    item.duplicateDecision !== "skip"
  );
}

function taskIdForReviewItem(input: { sessionId: string; idempotencyKey: string; itemId: string }) {
  return `brain-dump-task-${hashString(`${input.sessionId}|${input.idempotencyKey}|${input.itemId}`)}`;
}

function buildTaskFromReviewItem(input: {
  item: BrainDumpReviewItem;
  order: number;
  taskId: string;
  createdAtMs: number;
}): Task {
  const sharedTasks = createTaskTimerSharedTask({ createId: () => input.taskId });
  const task = sharedTasks.makeTask(input.item.title, input.order);
  task.createdAtMs = input.createdAtMs;
  task.plannedStartPushRemindersEnabled = false;
  if (dateCanAffectTask(input.item.date)) {
    task.taskType = "once-off";
    task.onceOffTargetDate = input.item.date.resolvedDate;
    task.onceOffDay = null;
  }
  const durationMinutes = input.item.enrichment.estimatedDurationMinutes;
  if (durationMinutes && durationMinutes > 0) {
    task.timeGoalEnabled = true;
    task.timeGoalValue = durationMinutes;
    task.timeGoalUnit = "minute";
    task.timeGoalPeriod = "day";
    task.timeGoalMinutes = durationMinutes;
  }
  return task;
}

function dateCanAffectTask(date: BrainDumpReviewDate) {
  if (!date.resolvedDate) return false;
  if (date.ambiguity === "ambiguous" && !date.userConfirmedDate) return false;
  if (date.dateSource === "suggested" && !date.userConfirmedDate) return false;
  return date.dateSource === "explicit" || date.dateSource === "inferred" || date.userConfirmedDate;
}

export async function confirmBrainDumpReviewSession(input: {
  uid: string;
  sessionId: string;
  idempotencyKey?: string;
  itemUpdates?: BrainDumpReviewItemUpdate[];
  store: BrainDumpSessionStore;
  workspace: BrainDumpWorkspaceRepository;
  createId: () => string;
  now?: () => number;
}): Promise<BrainDumpCreationBatchResult> {
  const uid = asString(input.uid, 120);
  const sessionId = asString(input.sessionId, 120);
  const idempotencyKey = asString(input.idempotencyKey, 120);
  if (!uid) throw new BrainDumpCreationError("You must be signed in to continue.", "auth/unauthenticated", 401);
  if (!sessionId) throw new BrainDumpCreationError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  if (!idempotencyKey) {
    throw new BrainDumpCreationError("Brain Dump confirmation requires an idempotency key.", "brain-dump/idempotency-required", 400);
  }

  const session = await input.store.getSession(uid, sessionId);
  if (!session || session.ownerUid !== uid || session.id !== sessionId) {
    throw new BrainDumpCreationError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  }

  const normalizedUpdates = (input.itemUpdates || []).map(normalizeBrainDumpReviewItemUpdate).filter((update) => update.itemId);
  const payloadHash = hashCreationPayload(normalizedUpdates);
  const existingReceipt = session.creationReceipts?.[idempotencyKey];
  if (existingReceipt) {
    if (existingReceipt.payloadHash !== payloadHash) {
      throw new BrainDumpCreationError(
        "Brain Dump confirmation payload does not match the existing idempotency key.",
        "brain-dump/idempotency-payload-mismatch",
        409
      );
    }
    if (existingReceipt.batchResult) return existingReceipt.batchResult;
  }

  if (session.state !== "review") {
    throw new BrainDumpCreationError("Brain Dump session is not ready for confirmation.", "brain-dump/not-reviewable", 409);
  }

  const updatesByItemId = new Map(
    normalizedUpdates.map((update) => [update.itemId, update])
  );
  const existingTasks = await input.workspace.loadTasks(uid);
  const createdAtMs = Math.max(0, Math.floor(Number(input.now?.() ?? Date.now()) || 0));
  const archivedTaskMeta = input.workspace.loadTaskStatusMeta ? await input.workspace.loadTaskStatusMeta(uid) : {};
  const reviewedItems = refreshBrainDumpDuplicateWarnings({
    items: session.review.items.map((item) => applyBrainDumpReviewItemUpdate(item, updatesByItemId.get(item.id) || null)),
    workspaceTasks: existingTasks,
    archivedTaskMeta,
    nowMs: createdAtMs,
  });
  let nextOrder = nextTaskOrder(existingTasks);
  const resultItems: Array<BrainDumpCreationBatchResult["items"][number] | null> = [];
  const candidateTasks: Array<{ index: number; item: BrainDumpReviewItem; task: Task }> = [];

  reviewedItems.forEach((item, index) => {
    if (!itemCanCreateTask(item)) {
      resultItems[index] = {
        itemId: item.id,
        status: "skipped",
        reason: item.validationErrors.length
          ? "validation-error"
          : item.duplicateDecision === "skip"
            ? "duplicate-skipped"
            : item.supported
              ? "not-selected"
              : "unsupported",
      };
      return;
    }

    const task = buildTaskFromReviewItem({
      item,
      order: nextOrder,
      taskId: taskIdForReviewItem({ sessionId, idempotencyKey, itemId: item.id }),
      createdAtMs,
    });
    nextOrder += 1;
    candidateTasks.push({ index, item, task });
  });

  if (input.workspace.saveTask) {
    for (const candidate of candidateTasks) {
      try {
        await input.workspace.saveTask(uid, candidate.task);
        resultItems[candidate.index] = {
          itemId: candidate.item.id,
          status: "created",
          createdTaskId: candidate.task.id,
          createdTaskSnapshot: candidate.task,
        };
      } catch {
        resultItems[candidate.index] = {
          itemId: candidate.item.id,
          status: "failed",
          reason: "workspace-write-failed",
          retryable: true,
        };
      }
    }
  } else if (candidateTasks.length) {
    try {
      await input.workspace.saveTasks(uid, [...existingTasks, ...candidateTasks.map((candidate) => candidate.task)]);
      for (const candidate of candidateTasks) {
        resultItems[candidate.index] = {
          itemId: candidate.item.id,
          status: "created",
          createdTaskId: candidate.task.id,
          createdTaskSnapshot: candidate.task,
        };
      }
    } catch {
      for (const candidate of candidateTasks) {
        resultItems[candidate.index] = {
          itemId: candidate.item.id,
          status: "failed",
          reason: "workspace-write-failed",
          retryable: true,
        };
      }
    }
  }

  const finalizedItems = resultItems.filter((item): item is BrainDumpCreationBatchResult["items"][number] => Boolean(item));
  const createdCount = finalizedItems.filter((item) => item.status === "created").length;
  const skippedCount = finalizedItems.filter((item) => item.status === "skipped").length;
  const failedCount = finalizedItems.filter((item) => item.status === "failed").length;
  const retryableCount = finalizedItems.filter((item) => item.status === "failed" && item.retryable).length;
  const batchState: BrainDumpCreationBatchResult["state"] =
    failedCount > 0 ? (createdCount > 0 || skippedCount > 0 ? "partially_failed" : "failed") : "completed";

  const batchResult: BrainDumpCreationBatchResult = {
    sessionId,
    idempotencyKey,
    payloadHash,
    state: batchState,
    createdCount,
    skippedCount,
    failedCount,
    retryableCount,
    completedAtMs: createdAtMs,
    items: finalizedItems,
  };
  const completedSession: BrainDumpReviewSession = {
    ...session,
    state: batchState === "completed" ? "completed" : "review",
    source: {
      ...session.source,
      rawText: batchState === "completed" ? "" : session.source.rawText,
    },
    review: {
      selectedCount: reviewedItems.filter((item) => item.selected).length,
      items: reviewedItems,
    },
    batchResult,
    creationReceipts: {
      ...(session.creationReceipts || {}),
      [idempotencyKey]: {
        idempotencyKey,
        payloadHash,
        state: batchResult.state,
        startedAtMs: createdAtMs,
        completedAtMs: createdAtMs,
        batchResult,
      },
    },
  };
  await input.store.saveSession(completedSession);
  return batchResult;
}
