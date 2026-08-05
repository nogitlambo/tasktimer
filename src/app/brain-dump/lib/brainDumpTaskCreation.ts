import type { Task } from "@/app/tasktimer/lib/types";
import { createTaskTimerSharedTask } from "@/app/tasktimer/client/task-shared";

import type {
  BrainDumpCreationBatchResult,
  BrainDumpReviewItem,
  BrainDumpReviewSession,
  BrainDumpSessionStore,
} from "./brainDumpProcessing";

export type BrainDumpReviewItemUpdate = {
  itemId: string;
  title?: string;
  selected?: boolean;
};

export type BrainDumpWorkspaceRepository = {
  loadTasks(uid: string): Promise<Task[]>;
  saveTasks(uid: string, tasks: Task[]): Promise<void>;
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

function normalizeItemUpdate(update: BrainDumpReviewItemUpdate | null | undefined) {
  return {
    itemId: asString(update?.itemId, 120),
    title: update && Object.prototype.hasOwnProperty.call(update, "title") ? asString(update.title, 200) : undefined,
    selected: typeof update?.selected === "boolean" ? update.selected : undefined,
  };
}

function applyUpdate(item: BrainDumpReviewItem, update: ReturnType<typeof normalizeItemUpdate> | null): BrainDumpReviewItem {
  const nextTitle = update?.title;
  return {
    ...item,
    title: nextTitle ? nextTitle : item.title,
    selected: typeof update?.selected === "boolean" ? update.selected : item.selected,
  };
}

function itemCanCreateTask(item: BrainDumpReviewItem) {
  return item.itemType === "task" && item.supported && item.selected;
}

function buildTaskFromReviewItem(input: {
  item: BrainDumpReviewItem;
  order: number;
  createId: () => string;
  createdAtMs: number;
}): Task {
  const sharedTasks = createTaskTimerSharedTask({ createId: input.createId });
  const task = sharedTasks.makeTask(input.item.title, input.order);
  task.createdAtMs = input.createdAtMs;
  task.plannedStartPushRemindersEnabled = false;
  return task;
}

export async function confirmBrainDumpReviewSession(input: {
  uid: string;
  sessionId: string;
  itemUpdates?: BrainDumpReviewItemUpdate[];
  store: BrainDumpSessionStore;
  workspace: BrainDumpWorkspaceRepository;
  createId: () => string;
  now?: () => number;
}): Promise<BrainDumpCreationBatchResult> {
  const uid = asString(input.uid, 120);
  const sessionId = asString(input.sessionId, 120);
  if (!uid) throw new BrainDumpCreationError("You must be signed in to continue.", "auth/unauthenticated", 401);
  if (!sessionId) throw new BrainDumpCreationError("Brain Dump session was not found.", "brain-dump/not-found", 404);

  const session = await input.store.getSession(uid, sessionId);
  if (!session || session.ownerUid !== uid || session.id !== sessionId) {
    throw new BrainDumpCreationError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  }
  if (session.state !== "review") {
    throw new BrainDumpCreationError("Brain Dump session is not ready for confirmation.", "brain-dump/not-reviewable", 409);
  }

  const updatesByItemId = new Map(
    (input.itemUpdates || [])
      .map(normalizeItemUpdate)
      .filter((update) => update.itemId)
      .map((update) => [update.itemId, update])
  );
  const reviewedItems = session.review.items.map((item) => applyUpdate(item, updatesByItemId.get(item.id) || null));
  const existingTasks = await input.workspace.loadTasks(uid);
  const createdAtMs = Math.max(0, Math.floor(Number(input.now?.() ?? Date.now()) || 0));
  let nextOrder = nextTaskOrder(existingTasks);
  const createdTasks: Task[] = [];
  const resultItems: BrainDumpCreationBatchResult["items"] = [];

  for (const item of reviewedItems) {
    if (!itemCanCreateTask(item)) {
      resultItems.push({
        itemId: item.id,
        status: "skipped",
        reason: item.supported ? "not-selected" : "unsupported",
      });
      continue;
    }

    const task = buildTaskFromReviewItem({
      item,
      order: nextOrder,
      createId: input.createId,
      createdAtMs,
    });
    nextOrder += 1;
    createdTasks.push(task);
    resultItems.push({
      itemId: item.id,
      status: "created",
      createdTaskId: task.id,
    });
  }

  if (createdTasks.length) {
    await input.workspace.saveTasks(uid, [...existingTasks, ...createdTasks]);
  }

  const batchResult: BrainDumpCreationBatchResult = {
    sessionId,
    createdCount: createdTasks.length,
    skippedCount: resultItems.filter((item) => item.status === "skipped").length,
    completedAtMs: createdAtMs,
    items: resultItems,
  };
  const completedSession: BrainDumpReviewSession = {
    ...session,
    state: "completed",
    source: {
      ...session.source,
      rawText: "",
    },
    review: {
      selectedCount: reviewedItems.filter((item) => item.selected).length,
      items: reviewedItems,
    },
    batchResult,
  };
  await input.store.saveSession(completedSession);
  return batchResult;
}
