import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import type { BrainDumpReviewSession, BrainDumpSessionStore } from "./brainDumpProcessing";
import type { BrainDumpWorkspaceRepository } from "./brainDumpTaskCreation";
import { undoBrainDumpCreationBatch } from "./brainDumpUndo";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-created",
    name: "Call dentist",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 1_800_000_000_000,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    plannedStartPushRemindersEnabled: false,
    ...overrides,
  };
}

function session(overrides: Partial<BrainDumpReviewSession> = {}): BrainDumpReviewSession {
  const createdTask = task();
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "completed",
    promptId: "brain-dump-v1",
    createdAtMs: 1_800_000_000_000,
    expiresAtMs: 1_800_604_800_000,
    source: { kind: "typed", rawText: "" },
    review: { selectedCount: 1, items: [] },
    batchResult: {
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      payloadHash: "hash",
      state: "completed",
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      retryableCount: 0,
      completedAtMs: 1_800_000_000_000,
      items: [{ itemId: "item-1", status: "created", createdTaskId: createdTask.id, createdTaskSnapshot: createdTask }],
    },
    ...overrides,
  };
}

describe("undoBrainDumpCreationBatch", () => {
  it("removes one untouched task through the workspace delete interface within 30 seconds", async () => {
    const createdTask = task();
    let savedSession: BrainDumpReviewSession | null = null;
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => session()),
      saveSession: vi.fn(async (nextSession) => {
        savedSession = nextSession;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [createdTask]),
      saveTasks: vi.fn(async () => {}),
      deleteTasks: vi.fn(async () => {}),
    };

    const result = await undoBrainDumpCreationBatch({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      store,
      workspace,
      now: () => 1_800_000_020_000,
    });

    expect(result).toMatchObject({
      state: "undone",
      removedCount: 1,
      retainedCount: 0,
      items: [{ itemId: "item-1", status: "removed", createdTaskId: "task-created" }],
    });
    expect(workspace.deleteTasks).toHaveBeenCalledWith("uid-1", ["task-created"]);
    const updatedSession = savedSession as unknown as BrainDumpReviewSession;
    expect(updatedSession.undoResult).toEqual(result);
  });

  it("retains tasks that are started, shared, materially edited, or have dependent records", async () => {
    const untouched = task({ id: "task-safe" });
    const started = task({ id: "task-started", hasStarted: true });
    const shared = task({ id: "task-shared", sharedSourceOwnerUid: "uid-2" });
    const editedSnapshot = task({ id: "task-edited", name: "Original name" });
    const edited = task({ id: "task-edited", name: "Changed name" });
    const dependent = task({ id: "task-dependent" });
    const mixedSession = session({
      batchResult: {
        ...session().batchResult!,
        items: [
          { itemId: "safe", status: "created", createdTaskId: "task-safe", createdTaskSnapshot: untouched },
          { itemId: "started", status: "created", createdTaskId: "task-started", createdTaskSnapshot: task({ id: "task-started" }) },
          { itemId: "shared", status: "created", createdTaskId: "task-shared", createdTaskSnapshot: task({ id: "task-shared" }) },
          { itemId: "edited", status: "created", createdTaskId: "task-edited", createdTaskSnapshot: editedSnapshot },
          { itemId: "dependent", status: "created", createdTaskId: "task-dependent", createdTaskSnapshot: dependent },
        ],
      },
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => mixedSession),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [untouched, started, shared, edited, dependent]),
      saveTasks: vi.fn(async () => {}),
      deleteTasks: vi.fn(async () => {}),
      hasTaskDependents: vi.fn(async (_uid, taskId) => taskId === "task-dependent"),
    };

    const result = await undoBrainDumpCreationBatch({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      store,
      workspace,
      now: () => 1_800_000_020_000,
    });

    expect(result).toMatchObject({
      state: "partially_undone",
      removedCount: 1,
      retainedCount: 4,
      items: [
        { itemId: "safe", status: "removed" },
        { itemId: "started", status: "retained", reason: "task-started" },
        { itemId: "shared", status: "retained", reason: "task-shared" },
        { itemId: "edited", status: "retained", reason: "task-edited" },
        { itemId: "dependent", status: "retained", reason: "task-has-dependent-records" },
      ],
    });
    expect(workspace.deleteTasks).toHaveBeenCalledWith("uid-1", ["task-safe"]);
  });

  it("returns the stored undo result for repeated requests", async () => {
    const existing = {
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      state: "undone" as const,
      removedCount: 1,
      retainedCount: 0,
      completedAtMs: 1_800_000_020_000,
      items: [{ itemId: "item-1", status: "removed" as const, createdTaskId: "task-created" }],
    };
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => session({ undoResult: existing })),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
      deleteTasks: vi.fn(),
    };

    const result = await undoBrainDumpCreationBatch({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      store,
      workspace,
      now: () => 1_800_000_025_000,
    });

    expect(result).toEqual(existing);
    expect(workspace.deleteTasks).not.toHaveBeenCalled();
    expect(store.saveSession).not.toHaveBeenCalled();
  });

  it("does not delete tasks after the 30 second undo window expires", async () => {
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => session()),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [task()]),
      saveTasks: vi.fn(),
      deleteTasks: vi.fn(),
    };

    const result = await undoBrainDumpCreationBatch({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      store,
      workspace,
      now: () => 1_800_000_031_000,
    });

    expect(result).toMatchObject({ state: "expired", removedCount: 0, retainedCount: 1 });
    expect(workspace.deleteTasks).not.toHaveBeenCalled();
    expect(store.saveSession).toHaveBeenCalled();
  });

  it("denies undo when the session is not owned by the authenticated user", async () => {
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => null),
      saveSession: vi.fn(),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
      deleteTasks: vi.fn(),
    };

    await expect(
      undoBrainDumpCreationBatch({
        uid: "uid-2",
        sessionId: "session-1",
        idempotencyKey: "confirm-key-1",
        store,
        workspace,
      })
    ).rejects.toMatchObject({
      code: "brain-dump/not-found",
      status: 404,
    });
    expect(workspace.deleteTasks).not.toHaveBeenCalled();
  });
});
