import { describe, expect, it, vi } from "vitest";

import { createNextBestActionRecommendation } from "./nextBestActionRecommendation";
import { computeTaskClarificationSourceVersion } from "@/app/taskclarification/lib/taskClarification";
import { buildNextBestActionFirestoreRecord, createFirestoreNextBestActionRepository } from "./nextBestActionRepository";

function recommendation() {
  return createNextBestActionRecommendation({
    id: "nba-1",
    userId: "uid-1",
    taskId: "task-1",
    sourceTaskVersion: "version-1",
    title: "Prepare launch",
    firstAction: "Open the checklist.",
    score: 82,
    confidence: "HIGH",
    reasonCodes: ["DUE_SOON", "HAS_CLEAR_FIRST_ACTION"],
    availableMinutes: 20,
    focusWindowMatched: true,
    durationMinutes: 20,
    durationSource: "ACCEPTED_CLARIFICATION",
    explanation: "Recommended because it is due soon and already has a clear first action.",
    nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
    auditExpiresAtMs: Date.parse("2026-09-06T09:00:00.000Z"),
  });
}

function startHarness(options: { task?: Record<string, unknown>; recommendation?: ReturnType<typeof recommendation> } = {}) {
  const task = options.task || { id: "task-1", name: "Prepare launch", active: true, actionable: true, blocked: false, completed: false };
  const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", task);
  const row = options.recommendation || { ...recommendation(), sourceTaskVersion };
  const updates: Array<{ ref: { path?: string }; value: Record<string, unknown> }> = [];
  const db = {
    collection: (root: string) => ({
      doc: (uid: string) => ({
        collection: (collectionName: string) => ({
          doc: (id: string) => ({ path: `${root}/${uid}/${collectionName}/${id}` }),
        }),
      }),
    }),
    runTransaction: async (callback: (transaction: { get: (ref: { path?: string }) => Promise<unknown>; update: (ref: { path?: string }, value: Record<string, unknown>) => void }) => Promise<unknown>) =>
      callback({
        get: async (ref) => ref.path?.includes("/tasks/")
          ? { exists: true, data: () => task }
          : { exists: true, data: () => buildNextBestActionFirestoreRecord(row) },
        update: (ref, value) => updates.push({ ref, value }),
      }),
  };
  return { repository: createFirestoreNextBestActionRepository(db as never), updates, row, task };
}

describe("Next Best Action recommendation persistence", () => {
  it("writes the discriminated record to the existing user-scoped recommendation area", async () => {
    const set = vi.fn(async () => undefined);
    let savedPath = "";
    const db = {
      collection: (root: string) => ({
        doc: (uid: string) => ({
          collection: (collectionName: string) => ({
            doc: (id: string) => ({
              path: (savedPath = `${root}/${uid}/${collectionName}/${id}`),
              set,
            }),
          }),
        }),
      }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    await repository.saveRecommendation("uid-1", recommendation());

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "nba-1",
        userId: "uid-1",
        type: "NEXT_BEST_ACTION",
        taskId: "task-1",
        sourceTaskVersion: "version-1",
        status: "ACTIVE",
        schemaVersion: 1,
      })
    );
    expect(savedPath).toBe("users/uid-1/taskRecommendations/nba-1");
    expect(buildNextBestActionFirestoreRecord(recommendation()).payload).toMatchObject({
      durationSource: "ACCEPTED_CLARIFICATION",
      reasonCodes: ["DUE_SOON", "HAS_CLEAR_FIRST_ACTION"],
    });
  });

  it("loads only server-owned Task data and permitted history/context", async () => {
    const taskData = {
      id: "task-1",
      name: "Prepare launch",
      onceOffTargetDate: "2026-08-09",
      createdAtMs: 1,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      plannedStartDay: "mon",
      plannedStartTime: "10:00",
      timeGoalMinutes: 45,
    };
    const taskDoc = {
      id: "task-1",
      data: () => taskData,
      collection: (name: string) => ({
        get: async () => (name === "history" ? { docs: [{ data: () => ({ ts: 1_800_000_000_000, name: "Prepare launch", ms: 30 * 60000 }) }] } : { docs: [] }),
      }),
    };
    const empty = { docs: [] };
    const db = {
      collection: (root: string) => ({
        doc: (uid: string) => ({
          collection: (collectionName: string) => {
            if (root !== "users" || uid !== "uid-1") throw new Error("unexpected scope");
            if (collectionName === "tasks") return { get: async () => ({ docs: [taskDoc] }), doc: () => taskDoc };
            if (collectionName === "deletedTasks" || collectionName === "historyEntries" || collectionName === "taskRecommendations") return { get: async () => empty };
            if (collectionName === "preferences") return { doc: () => ({ get: async () => ({ exists: false }) }) };
            throw new Error(`unexpected collection ${collectionName}`);
          },
        }),
      }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    const candidates = await repository.loadCandidates({ uid: "uid-1", nowMs: Date.parse("2026-08-07T09:00:00.000Z"), timezone: "Australia/Sydney" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      ownerUid: "uid-1",
      task: { id: "task-1", name: "Prepare launch", timeGoalMinutes: 45 },
      history: [{ name: "Prepare launch", ms: 30 * 60000 }],
      focusWindowMatched: true,
    });
    expect(candidates[0]?.taskVersion).toEqual(expect.any(String));
  });

  it("atomically revalidates the Task and marks an active recommendation started", async () => {
    const taskData = { id: "task-1", name: "Prepare launch", active: true, actionable: true, blocked: false, completed: false };
    const sourceTaskVersion = computeTaskClarificationSourceVersion("task-1", taskData);
    const activeRecommendation = { ...recommendation(), sourceTaskVersion };
    const recommendationRef = { path: "users/uid-1/taskRecommendations/nba-1" };
    const taskRef = { path: "users/uid-1/tasks/task-1" };
    const updates: Array<{ ref: unknown; value: unknown }> = [];
    const db = {
      collection: (root: string) => ({
        doc: (uid: string) => ({
          collection: (collectionName: string) => ({
            doc: (id: string) => collectionName === "tasks"
              ? { ...taskRef, path: `${root}/${uid}/${collectionName}/${id}` }
              : { ...recommendationRef, path: `${root}/${uid}/${collectionName}/${id}` },
          }),
        }),
      }),
      runTransaction: async (callback: (transaction: { get: (ref: unknown) => Promise<unknown>; update: (ref: unknown, value: unknown) => void }) => Promise<unknown>) =>
        callback({
          get: async (ref) => String((ref as { path?: string }).path) === taskRef.path
            ? { exists: true, data: () => taskData }
            : { exists: true, data: () => buildNextBestActionFirestoreRecord(activeRecommendation) },
          update: (ref, value) => updates.push({ ref, value }),
        }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    const result = await repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") });

    expect(result.kind).toBe("started");
    expect(updates).toHaveLength(1);
    expect((updates[0]?.ref as { path?: string }).path).toBe(recommendationRef.path);
    expect(updates[0]).toMatchObject({ value: { status: "STARTED" } });
    expect(updates[0]?.value).toHaveProperty("startedAt");
  });

  it("returns stale, expired, ineligible, and idempotent outcomes without starting invalid work", async () => {
    const stale = startHarness({ recommendation: { ...recommendation(), sourceTaskVersion: "old-version" } });
    const expired = startHarness({ recommendation: { ...recommendation(), expiresAt: "2026-08-07T08:00:00.000Z" } });
    const blocked = startHarness({ task: { id: "task-1", name: "Prepare launch", blocked: true } });
    const started = startHarness({ recommendation: { ...recommendation(), status: "STARTED" } });

    await expect(stale.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "stale" });
    await expect(expired.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "expired" });
    await expect(blocked.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "ineligible" });
    await expect(started.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "idempotent" });
    expect(stale.updates).toHaveLength(0);
    expect(blocked.updates).toHaveLength(0);
  });

  it("rejects a recommendation whose envelope ownership does not match the authenticated user", async () => {
    const harness = startHarness({ recommendation: { ...recommendation(), userId: "another-user" } });

    await expect(harness.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "not-found" });
    expect(harness.updates).toHaveLength(0);
  });

  it("records alternative requests as skipped and dismissal feedback without mutating the Task", async () => {
    const alternative = startHarness();
    const dismissal = startHarness();

    await expect(alternative.repository.skipRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toBe("skipped");
    await expect(dismissal.repository.dismissRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), feedbackCode: "wrong_timing" })).resolves.toBe("dismissed");
    expect(alternative.updates[0]?.value).toMatchObject({ status: "SKIPPED" });
    expect(dismissal.updates[0]?.value).toMatchObject({ status: "DISMISSED", feedbackCode: "wrong_timing" });
    expect(alternative.task.name).toBe("Prepare launch");
    expect(dismissal.task.name).toBe("Prepare launch");
  });
});
