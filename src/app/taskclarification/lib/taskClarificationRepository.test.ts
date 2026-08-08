import { describe, expect, it, vi } from "vitest";

import { computeTaskClarificationSourceVersion, type TaskClarificationRecommendation } from "./taskClarification";
import { buildTaskClarificationFirestoreRecord, createFirestoreTaskClarificationRepository, parseRecommendationRecord } from "./taskClarificationRepository";

const recommendation: TaskClarificationRecommendation = {
  id: "recommendation-1",
  userId: "uid-1",
  taskId: "task-1",
  sourceTaskVersion: "version-1",
  status: "ACTIVE",
  originalTitle: "Prepare launch",
  userInstruction: null,
  sourceRecommendationId: null,
  regenerationCount: 0,
  applyIdempotencyKey: null,
  applyStatus: "NOT_APPLIED",
  applyResult: null,
  originalTaskFields: null,
  appliedTaskFields: null,
  appliedTaskVersion: null,
  reversibleUntil: null,
  undoIdempotencyKey: null,
  undoStatus: "NOT_AVAILABLE",
  undoResult: null,
  undoConflicts: [],
  suggestedTitle: "Prepare launch checklist",
  definitionOfDone: null,
  firstAction: "Open the checklist.",
  stoppingPoint: null,
  estimatedMinutes: 30,
  estimatedRange: { min: 20, max: 40 },
  subtasks: [{ id: "subtask-1", title: "Open the checklist", estimatedMinutes: 5 }],
  clarificationQuestions: [],
  warnings: [],
  reasonCodes: ["TASK_TOO_BROAD"],
  confidence: 0.9,
  ambiguityScore: 0.7,
  initiationDifficultyScore: 0.6,
  acceptedFields: [],
  rejectedFields: [],
  createdSubtaskIds: [],
  createdSubtaskProvenance: [],
  createdSubtaskVersions: [],
  removedSubtaskIds: [],
  modelVersion: "gpt-evaluation",
  promptVersion: "task-clarification-v1",
  createdAt: "2026-08-07T00:00:00.000Z",
  respondedAt: null,
  expiresAt: "2026-08-08T00:00:00.000Z",
  auditExpiresAt: "2026-09-06T00:00:00.000Z",
};

function buildUndoRepository(
  appliedRecommendation: TaskClarificationRecommendation,
  rawTask: Record<string, unknown>,
  createdTasks: Record<string, Record<string, unknown>> = {}
) {
  const taskRef = { path: "users/uid-1/tasks/task-1" };
  const recommendationRef = { path: "users/uid-1/taskRecommendations/recommendation-1" };
  const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>([
    [taskRef.path, { exists: true, data: () => rawTask }],
    [recommendationRef.path, { exists: true, data: () => buildTaskClarificationFirestoreRecord(appliedRecommendation) as unknown as Record<string, unknown> }],
    ...Object.entries(createdTasks).map(([taskId, task]) => [`users/uid-1/tasks/${taskId}`, { exists: true, data: () => task }] as const),
  ]);
  const transaction = {
    get: vi.fn(async (ref: { path: string }) => snapshots.get(ref.path) || { exists: false, data: () => ({}) }),
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const db = {
    collection: (name: string) => ({
      doc: (uid: string) => ({
        collection: (subcollection: string) => ({
          doc: (id?: string) => ({ path: `users/${uid}/${subcollection}/${id || "created-task-1"}`, id: id || "created-task-1" }),
        }),
      }),
    }),
    runTransaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
  };
  return { repository: createFirestoreTaskClarificationRepository(db as never), transaction, taskRef, recommendationRef };
}

describe("task clarification recommendation persistence", () => {
  it("discriminates clarification records while keeping legacy records readable", () => {
    const row = buildTaskClarificationFirestoreRecord(recommendation);
    expect(row.type).toBe("TASK_CLARIFICATION");

    const legacyRow = { ...row } as Record<string, unknown>;
    delete legacyRow.type;
    expect(parseRecommendationRecord(legacyRow)).toMatchObject({ type: "TASK_CLARIFICATION" });
    expect(parseRecommendationRecord({ ...row, type: "NEXT_BEST_ACTION" })).toBeNull();
  });

  it("loads a legacy clarification record from the existing collection without migration", async () => {
    const row = buildTaskClarificationFirestoreRecord(recommendation) as Record<string, unknown>;
    delete row.type;
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({
          collection: (subcollection: string) => ({
            doc: (id: string) => ({
              get: async () => {
                expect(name).toBe("users");
                expect(uid).toBe("uid-1");
                expect(subcollection).toBe("taskRecommendations");
                expect(id).toBe("recommendation-1");
                return { exists: true, data: () => row };
              },
            }),
          }),
        }),
      }),
    };

    const loaded = await createFirestoreTaskClarificationRepository(db as never).loadRecommendation("uid-1", "recommendation-1");
    expect(loaded).toMatchObject({ id: "recommendation-1", type: "TASK_CLARIFICATION" });
  });

  it("keeps structured proposal data and audit metadata outside the Task document", () => {
    const row = buildTaskClarificationFirestoreRecord(recommendation);

    expect(row).toMatchObject({
      id: "recommendation-1",
      userId: "uid-1",
      taskId: "task-1",
      sourceTaskVersion: "version-1",
      status: "ACTIVE",
      modelVersion: "gpt-evaluation",
      promptVersion: "task-clarification-v1",
      schemaVersion: 1,
    });
    expect(row).not.toHaveProperty("reasoning");
    expect(row).not.toHaveProperty("rawModelResponse");
    expect(row.createdAt).toHaveProperty("toMillis");
    expect(row.expiresAt).toHaveProperty("toMillis");
    expect(row.auditExpiresAt).toHaveProperty("toMillis");
  });

  it("updates only the allowlisted Task patch and records the application atomically", async () => {
    const rawTask = { name: "Prepare launch", taskType: "recurring" };
    const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", rawTask);
    const recommendationRow = buildTaskClarificationFirestoreRecord({ ...recommendation, sourceTaskVersion });
    const taskRef = { path: "users/uid-1/tasks/task-1" };
    const recommendationRef = { path: "users/uid-1/taskRecommendations/recommendation-1" };
    const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>([
      [taskRef.path, { exists: true, data: () => rawTask }],
      [recommendationRef.path, { exists: true, data: () => recommendationRow as unknown as Record<string, unknown> }],
    ]);
    const transaction = {
      get: vi.fn(async (ref: { path: string }) => snapshots.get(ref.path) || { exists: false, data: () => ({}) }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({
          collection: (subcollection: string) => ({
            doc: (id?: string) => ({ path: `users/${uid}/${subcollection}/${id || "created-task-1"}`, id: id || "created-task-1" }),
          }),
        }),
      }),
      runTransaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    };
    const repository = createFirestoreTaskClarificationRepository(db as never);

    const result = await repository.applyRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      sourceTaskVersion,
      idempotencyKey: "apply-1",
      patch: { name: "Prepare launch checklist" },
      acceptedFields: ["name"],
      rejectedFields: [],
      subtasks: [],
      nowMs: Date.parse("2026-08-07T00:01:00.000Z"),
    });

    expect(result.kind).toBe("applied");
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: taskRef.path }), expect.objectContaining({ name: "Prepare launch checklist" }));
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: recommendationRef.path }),
      expect.objectContaining({ applyIdempotencyKey: "apply-1", applyStatus: "APPLIED", acceptedFields: ["name"] })
    );
  });

  it("creates selected subtasks as top-level Task records and records provenance", async () => {
    const rawTask = { name: "Prepare launch", order: 4, taskType: "recurring" };
    const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", rawTask);
    const recommendationRow = buildTaskClarificationFirestoreRecord({ ...recommendation, sourceTaskVersion });
    const taskRef = { path: "users/uid-1/tasks/task-1" };
    const recommendationRef = { path: "users/uid-1/taskRecommendations/recommendation-1" };
    const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>([
      [taskRef.path, { exists: true, data: () => rawTask }],
      [recommendationRef.path, { exists: true, data: () => recommendationRow as unknown as Record<string, unknown> }],
    ]);
    const transaction = {
      get: vi.fn(async (ref: { path: string }) => snapshots.get(ref.path) || { exists: false, data: () => ({}) }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({
          collection: (subcollection: string) => ({
            doc: (id?: string) => ({ path: `users/${uid}/${subcollection}/${id || "created-task-1"}`, id: id || "created-task-1" }),
          }),
        }),
      }),
      runTransaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    };
    const repository = createFirestoreTaskClarificationRepository(db as never);

    const result = await repository.applyRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      sourceTaskVersion,
      idempotencyKey: "apply-subtasks-1",
      patch: {},
      acceptedFields: ["subtasks"],
      rejectedFields: [],
      subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }],
      nowMs: Date.parse("2026-08-07T00:01:00.000Z"),
    });

    expect(result.kind).toBe("applied");
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1/tasks/created-task-1" }),
      expect.objectContaining({ id: "created-task-1", name: "Open the launch checklist", taskType: "recurring" })
    );
    expect(transaction.set.mock.calls[0]?.[1]).not.toHaveProperty("parentTaskId");
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: recommendationRef.path }),
      expect.objectContaining({ createdSubtaskIds: ["created-task-1"], createdSubtaskProvenance: [{ recommendationSubtaskId: "subtask-1", taskId: "created-task-1" }] })
    );
  });

  it("rejects an unknown recommendation subtask ID without creating a Task", async () => {
    const rawTask = { name: "Prepare launch", taskType: "recurring" };
    const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", rawTask);
    const recommendationRow = buildTaskClarificationFirestoreRecord({ ...recommendation, sourceTaskVersion });
    const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>([
      ["users/uid-1/tasks/task-1", { exists: true, data: () => rawTask }],
      ["users/uid-1/taskRecommendations/recommendation-1", { exists: true, data: () => recommendationRow as unknown as Record<string, unknown> }],
    ]);
    const transaction = { get: vi.fn(async (ref: { path: string }) => snapshots.get(ref.path) || { exists: false, data: () => ({}) }), update: vi.fn(), set: vi.fn() };
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({ collection: (subcollection: string) => ({ doc: (id?: string) => ({ path: `users/${uid}/${subcollection}/${id || "created-task-1"}`, id: id || "created-task-1" }) }) }),
      }),
      runTransaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    };
    const repository = createFirestoreTaskClarificationRepository(db as never);

    const result = await repository.applyRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      sourceTaskVersion,
      idempotencyKey: "apply-invalid-subtask",
      patch: {},
      acceptedFields: ["subtasks"],
      rejectedFields: [],
      subtasks: [{ id: "subtask-unknown", title: "Invented task", estimatedMinutes: null }],
      nowMs: Date.parse("2026-08-07T00:01:00.000Z"),
    });

    expect(result).toEqual({ kind: "invalid-subtasks" });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("restores supported parent fields and removes only untouched created tasks within the undo window", async () => {
    const rawTask = { name: "Prepare launch checklist", taskType: "recurring" };
    const createdTask = { name: "Open the launch checklist", taskType: "recurring" };
    const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", { name: "Prepare launch", taskType: "recurring" });
    const createdTaskVersion = computeTaskClarificationSourceVersion("created-task-1", createdTask);
    const appliedRecommendation = {
      ...recommendation,
      sourceTaskVersion,
      status: "ACCEPTED" as const,
      applyIdempotencyKey: "apply-1",
      applyStatus: "APPLIED" as const,
      applyResult: "APPLIED" as const,
      originalTaskFields: { name: "Prepare launch" },
      appliedTaskFields: { name: "Prepare launch checklist" },
      appliedTaskVersion: computeTaskClarificationSourceVersion("task-1", rawTask),
      reversibleUntil: "2026-08-07T00:00:30.000Z",
      undoStatus: "AVAILABLE" as const,
      createdSubtaskIds: ["created-task-1"],
      createdSubtaskProvenance: [{ recommendationSubtaskId: "subtask-1", taskId: "created-task-1" }],
      createdSubtaskVersions: [{ taskId: "created-task-1", sourceTaskVersion: createdTaskVersion }],
    };
    const taskRef = { path: "users/uid-1/tasks/task-1" };
    const recommendationRef = { path: "users/uid-1/taskRecommendations/recommendation-1" };
    const createdTaskRef = { path: "users/uid-1/tasks/created-task-1" };
    const recommendationRow = buildTaskClarificationFirestoreRecord(appliedRecommendation);
    const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>([
      [taskRef.path, { exists: true, data: () => rawTask }],
      [recommendationRef.path, { exists: true, data: () => recommendationRow as unknown as Record<string, unknown> }],
      [createdTaskRef.path, { exists: true, data: () => createdTask }],
    ]);
    const transaction = {
      get: vi.fn(async (ref: { path: string }) => snapshots.get(ref.path) || { exists: false, data: () => ({}) }),
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({
          collection: (subcollection: string) => ({
            doc: (id?: string) => ({ path: `users/${uid}/${subcollection}/${id || "created-task-1"}`, id: id || "created-task-1" }),
          }),
        }),
      }),
      runTransaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    };
    const repository = createFirestoreTaskClarificationRepository(db as never);

    const result = await repository.undoRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      idempotencyKey: "undo-1",
      nowMs: Date.parse("2026-08-07T00:00:20.000Z"),
    });

    expect(result.kind).toBe("reversed");
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: taskRef.path }), expect.objectContaining({ name: "Prepare launch" }));
    expect(transaction.delete).toHaveBeenCalledWith(expect.objectContaining({ path: createdTaskRef.path }));
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: recommendationRef.path }),
      expect.objectContaining({ status: "REVERSED", undoStatus: "REVERSED", removedSubtaskIds: ["created-task-1"] })
    );
  });

  it("keeps a created task and reports partial recovery when the user edited it", async () => {
    const rawTask = { name: "Prepare launch checklist", taskType: "recurring" };
    const createdTaskAtApply = { name: "Open the launch checklist", taskType: "recurring" };
    const appliedRecommendation = {
      ...recommendation,
      sourceTaskVersion: computeTaskClarificationSourceVersion("task-1", { name: "Prepare launch", taskType: "recurring" }),
      status: "ACCEPTED" as const,
      applyStatus: "APPLIED" as const,
      applyResult: "APPLIED" as const,
      originalTaskFields: { name: "Prepare launch" },
      appliedTaskFields: { name: "Prepare launch checklist" },
      reversibleUntil: "2026-08-07T00:00:30.000Z",
      undoStatus: "AVAILABLE" as const,
      createdSubtaskIds: ["created-task-1"],
      createdSubtaskVersions: [{ taskId: "created-task-1", sourceTaskVersion: computeTaskClarificationSourceVersion("created-task-1", createdTaskAtApply) }],
    };
    const { repository, transaction } = buildUndoRepository(appliedRecommendation, rawTask, {
      "created-task-1": { name: "Edited launch step", taskType: "recurring" },
    });

    const result = await repository.undoRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      idempotencyKey: "undo-partial-1",
      nowMs: Date.parse("2026-08-07T00:00:20.000Z"),
    });

    expect(result.kind).toBe("partially-reversed");
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1/taskRecommendations/recommendation-1" }),
      expect.objectContaining({ undoStatus: "PARTIALLY_REVERSED", undoConflicts: ["task:created-task-1:changed"] })
    );
  });

  it("expires the undo operation at the deadline and replays a completed undo idempotently", async () => {
    const rawTask = { name: "Prepare launch checklist", taskType: "recurring" };
    const appliedRecommendation = {
      ...recommendation,
      status: "ACCEPTED" as const,
      applyStatus: "APPLIED" as const,
      applyResult: "APPLIED" as const,
      appliedTaskFields: { name: "Prepare launch checklist" },
      reversibleUntil: "2026-08-07T00:00:30.000Z",
      undoStatus: "AVAILABLE" as const,
    };
    const expired = buildUndoRepository(appliedRecommendation, rawTask);
    const expiredResult = await expired.repository.undoRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      idempotencyKey: "undo-expired",
      nowMs: Date.parse("2026-08-07T00:00:30.000Z"),
    });
    expect(expiredResult).toEqual({ kind: "expired" });
    expect(expired.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uid-1/taskRecommendations/recommendation-1" }),
      { undoStatus: "EXPIRED" }
    );

    const completed = buildUndoRepository({ ...appliedRecommendation, undoStatus: "REVERSED", undoIdempotencyKey: "undo-done" }, rawTask);
    const replay = await completed.repository.undoRecommendation({
      uid: "uid-1",
      recommendationId: "recommendation-1",
      taskId: "task-1",
      idempotencyKey: "undo-done",
      nowMs: Date.parse("2026-08-07T00:00:20.000Z"),
    });
    expect(replay.kind).toBe("idempotent");
    expect(completed.transaction.delete).not.toHaveBeenCalled();
  });
});
