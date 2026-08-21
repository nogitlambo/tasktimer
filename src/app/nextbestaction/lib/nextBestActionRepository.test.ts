import { describe, expect, it, vi } from "vitest";

import { createNextBestActionRecommendation } from "./nextBestActionRecommendation";
import { computeTaskClarificationSourceVersion } from "@/app/taskclarification/lib/taskClarification";
import {
  buildNextBestActionFirestoreRecord,
  createFirestoreNextBestActionRepository,
  isTaskCompletedForRecommendationPeriod,
} from "./nextBestActionRepository";

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
  const sets: Array<{ ref: { path?: string }; value: Record<string, unknown> }> = [];
  const db = {
    collection: (root: string) => ({
      doc: (uid: string) => ({
        collection: (collectionName: string) => ({
          doc: (id: string) => ({ path: `${root}/${uid}/${collectionName}/${id}` }),
        }),
      }),
    }),
    runTransaction: async (callback: (transaction: { get: (ref: { path?: string }) => Promise<unknown>; update: (ref: { path?: string }, value: Record<string, unknown>) => void; set: (ref: { path?: string }, value: Record<string, unknown>) => void }) => Promise<unknown>) =>
      callback({
        get: async (ref) => ref.path?.includes("/tasks/")
          ? { exists: true, data: () => task }
          : ref.path?.includes("/nextBestActionSuppressions/")
            ? { exists: false, data: () => undefined }
            : { exists: true, data: () => buildNextBestActionFirestoreRecord(row) },
        update: (ref, value) => updates.push({ ref, value }),
        set: (ref, value) => sets.push({ ref, value }),
      }),
  };
  return { repository: createFirestoreNextBestActionRepository(db as never), updates, sets, row, task };
}

describe("Next Best Action recommendation persistence", () => {
  it("excludes current goal completions but allows reset completions and prior days", () => {
    const currentDay = {
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "goal",
    };

    expect(isTaskCompletedForRecommendationPeriod(currentDay, Date.parse("2026-08-07T09:00:00.000Z"), "UTC")).toBe(true);
    expect(isTaskCompletedForRecommendationPeriod({ ...currentDay, timeGoalCompletedReason: "reset" }, Date.parse("2026-08-07T09:00:00.000Z"), "UTC")).toBe(false);
    expect(isTaskCompletedForRecommendationPeriod(currentDay, Date.parse("2026-08-08T09:00:00.000Z"), "UTC")).toBe(false);
    expect(isTaskCompletedForRecommendationPeriod({ ...currentDay, timeGoalCompletedDayKey: "2026-08-06" }, Date.parse("2026-08-07T09:00:00.000Z"), "UTC")).toBe(false);
  });

  it("respects Monday and Sunday weekly period boundaries", () => {
    const weekly = { timeGoalPeriod: "week", timeGoalCompletedWeekKey: "2026-08-03", timeGoalCompletedReason: "goal" };
    const sundayWeek = { timeGoalPeriod: "week", timeGoalCompletedWeekKey: "2026-08-09", timeGoalCompletedReason: "goal" };
    const sunday = Date.parse("2026-08-09T12:00:00.000Z");

    expect(isTaskCompletedForRecommendationPeriod(weekly, sunday, "UTC", "mon")).toBe(true);
    expect(isTaskCompletedForRecommendationPeriod(weekly, sunday, "UTC", "sun")).toBe(false);
    expect(isTaskCompletedForRecommendationPeriod(sundayWeek, sunday, "UTC", "sun")).toBe(true);
    expect(isTaskCompletedForRecommendationPeriod(sundayWeek, Date.parse("2026-08-16T12:00:00.000Z"), "UTC", "sun")).toBe(false);
  });

  it("keeps once-off goal completions excluded after their original period until reset", () => {
    const onceOff = {
      taskType: "once-off",
      timeGoalPeriod: "day",
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "goal",
    };

    expect(isTaskCompletedForRecommendationPeriod(onceOff, Date.parse("2026-08-08T09:00:00.000Z"), "UTC")).toBe(true);
    expect(isTaskCompletedForRecommendationPeriod({ ...onceOff, timeGoalCompletedReason: "reset" }, Date.parse("2026-08-08T09:00:00.000Z"), "UTC")).toBe(false);
  });

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
      timeGoalPeriod: "day",
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "goal",
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
      completed: true,
      history: [{ name: "Prepare launch", ms: 30 * 60000 }],
      focusWindowMatched: true,
      productivityWindow: {
        plannedDay: "mon",
        plannedStartTime: "10:00",
        days: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
        startTime: "00:00",
        endTime: "23:59",
        matched: true,
      },
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
    const completed = startHarness({ task: {
      id: "task-1",
      name: "Prepare launch",
      active: true,
      actionable: true,
      blocked: false,
      completed: false,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "goal",
    } });
    const resetCompleted = startHarness({ task: {
      id: "task-1",
      name: "Prepare launch",
      active: true,
      actionable: true,
      timeGoalPeriod: "day",
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "reset",
    } });

    await expect(stale.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "stale" });
    await expect(expired.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "expired" });
    await expect(blocked.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "ineligible" });
    await expect(started.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "idempotent" });
    await expect(completed.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), timezone: "UTC" })).resolves.toMatchObject({ kind: "ineligible" });
    await expect(resetCompleted.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), timezone: "UTC" })).resolves.toMatchObject({ kind: "started" });
    expect(stale.updates).toHaveLength(0);
    expect(blocked.updates).toHaveLength(0);
    expect(completed.updates).toHaveLength(0);
  });

  it("keeps an orphaned current-period completion marker authoritative", async () => {
    const completedWithoutHistory = startHarness({ task: {
      id: "task-1",
      name: "Prepare launch",
      active: true,
      actionable: true,
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      timeGoalCompletedDayKey: "2026-08-07",
      timeGoalCompletedReason: "goal",
    } });

    await expect(completedWithoutHistory.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), timezone: "UTC" })).resolves.toMatchObject({ kind: "ineligible" });
    expect(completedWithoutHistory.updates).toHaveLength(0);
  });

  it("rejects a recommendation whose envelope ownership does not match the authenticated user", async () => {
    const harness = startHarness({ recommendation: { ...recommendation(), userId: "another-user" } });

    await expect(harness.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toMatchObject({ kind: "not-found" });
    expect(harness.updates).toHaveLength(0);
  });

  it("rejects starts for manually completed and currently snoozed tasks", async () => {
    const nowMs = Date.parse("2026-08-07T09:05:00.000Z");
    const manuallyDone = startHarness({ task: {
      id: "task-1", name: "Prepare launch", active: true, actionable: true, taskType: "recurring", markedDoneAtMs: nowMs - 1000, markedDoneUntilMs: nowMs + 1000,
    } });
    const snoozed = startHarness({ task: {
      id: "task-1", name: "Prepare launch", active: true, actionable: true, nextBestActionSnoozedUntilMs: nowMs + 1000,
    } });

    await expect(manuallyDone.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs })).resolves.toMatchObject({ kind: "ineligible" });
    await expect(snoozed.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs })).resolves.toMatchObject({ kind: "ineligible" });
  });

  it("allows recurring manual completion and snooze exclusions after expiry", async () => {
    const nowMs = Date.parse("2026-08-07T09:05:00.000Z");
    const harness = startHarness({ task: {
      id: "task-1", name: "Prepare launch", active: true, actionable: true, taskType: "recurring", markedDoneAtMs: nowMs - 5000, markedDoneUntilMs: nowMs - 1000, nextBestActionSnoozedUntilMs: nowMs - 1000,
    } });

    await expect(harness.repository.startRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs })).resolves.toMatchObject({ kind: "started" });
  });

  it("records alternative requests as skipped and dismissal feedback without mutating the Task", async () => {
    const alternative = startHarness();
    const dismissal = startHarness();

    await expect(alternative.repository.skipRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toBe("skipped");
    await expect(dismissal.repository.dismissRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), feedbackCode: "wrong_timing" })).resolves.toBe("dismissed");
    expect(alternative.updates[0]?.value).toMatchObject({ status: "SKIPPED" });
    expect(dismissal.updates[0]?.value).toMatchObject({ status: "DISMISSED", feedbackCode: "wrong_timing" });
    expect(dismissal.sets[0]).toMatchObject({
      ref: { path: "users/uid-1/nextBestActionSuppressions/task-1" },
      value: { taskId: "task-1", releasedAt: null },
    });
    expect(alternative.task.name).toBe("Prepare launch");
    expect(dismissal.task.name).toBe("Prepare launch");
  });

  it("returns only active suppression task ids and lazily removes expired records", async () => {
    const deleteExpired = vi.fn(async () => undefined);
    const db = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            get: async () => ({
              docs: [
                { id: "active-task", data: () => ({ taskId: "active-task", expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: null }), ref: { delete: vi.fn() } },
                { id: "released-task", data: () => ({ taskId: "released-task", expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: { toMillis: () => Date.parse("2026-08-07T09:01:00.000Z") } }), ref: { delete: vi.fn() } },
                { id: "expired-task", data: () => ({ taskId: "expired-task", expiresAt: { toMillis: () => Date.parse("2026-08-07T08:59:00.000Z") }, releasedAt: null }), ref: { delete: deleteExpired } },
              ],
            }),
          }),
        }),
      }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    await expect(repository.loadSuppressedTaskIds({ uid: "uid-1", nowMs: Date.parse("2026-08-07T09:00:00.000Z") })).resolves.toEqual(["active-task"]);
    expect(deleteExpired).toHaveBeenCalledTimes(1);
  });

  it("does not extend an existing active suppression when the task is dismissed again", async () => {
    const sets = vi.fn();
    const row = recommendation();
    const db = {
      collection: (root: string) => ({ doc: (uid: string) => ({ collection: (collectionName: string) => ({ doc: (id: string) => ({ path: `${root}/${uid}/${collectionName}/${id}` }) }) }) }),
      runTransaction: async (callback: (transaction: { get: (ref: { path: string }) => Promise<unknown>; update: () => void; set: () => void }) => Promise<unknown>) => callback({
        get: async (ref) => ref.path.includes("/nextBestActionSuppressions/")
          ? { exists: true, data: () => ({ taskId: "task-1", expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: null }) }
          : { exists: true, data: () => buildNextBestActionFirestoreRecord(row) },
        update: vi.fn(),
        set: sets,
      }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    await expect(repository.dismissRecommendation({ uid: "uid-1", recommendationId: "nba-1", nowMs: Date.parse("2026-08-07T09:05:00.000Z") })).resolves.toBe("dismissed");
    expect(sets).not.toHaveBeenCalled();
  });

  it("releases active suppressions for other tasks but retains the completed task suppression", async () => {
    const updates: Array<{ ref: { path: string }; value: Record<string, unknown> }> = [];
    const docs = [
      { id: "task-suppressed", ref: { path: "suppressions/task-suppressed" }, data: () => ({ expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: null }) },
      { id: "task-completed", ref: { path: "suppressions/task-completed" }, data: () => ({ expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: null }) },
      { id: "already-released", ref: { path: "suppressions/already-released" }, data: () => ({ expiresAt: { toMillis: () => Date.parse("2026-08-07T10:00:00.000Z") }, releasedAt: { toMillis: () => Date.parse("2026-08-07T09:01:00.000Z") } }) },
    ];
    const db = {
      collection: () => ({ doc: () => ({ collection: () => ({}) }) }),
      runTransaction: async (callback: (transaction: { get: () => Promise<unknown>; update: (ref: { path: string }, value: Record<string, unknown>) => void }) => Promise<unknown>) => callback({
        get: async () => ({ docs }),
        update: (ref, value) => updates.push({ ref, value }),
      }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    await expect(repository.releaseSuppressionsForCompletedTask({ uid: "uid-1", completedTaskId: "task-completed", nowMs: Date.parse("2026-08-07T09:00:00.000Z") })).resolves.toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.ref.path).toBe("suppressions/task-suppressed");
    expect(updates[0]?.value).toHaveProperty("releasedAt");
  });

  it("expires prior active recommendations while preserving the newly refreshed recommendation", async () => {
    const active = recommendation();
    const preserved = { ...recommendation(), id: "nba-new" };
    const updates: Array<{ ref: { path?: string }; value: Record<string, unknown> }> = [];
    const db = {
      collection: () => ({
        doc: () => ({
          collection: () => ({ path: "users/uid-1/taskRecommendations" }),
        }),
      }),
      runTransaction: async (callback: (transaction: { get: (ref: unknown) => Promise<unknown>; update: (ref: { path?: string }, value: Record<string, unknown>) => void }) => Promise<unknown>) =>
        callback({
          get: async () => ({
            docs: [
              { id: active.id, ref: { path: `users/uid-1/taskRecommendations/${active.id}` }, data: () => buildNextBestActionFirestoreRecord(active) },
              { id: preserved.id, ref: { path: `users/uid-1/taskRecommendations/${preserved.id}` }, data: () => buildNextBestActionFirestoreRecord(preserved) },
            ],
          }),
          update: (ref, value) => updates.push({ ref, value }),
        }),
    };
    const repository = createFirestoreNextBestActionRepository(db as never);

    await expect(repository.invalidateActiveRecommendations?.({ uid: "uid-1", nowMs: Date.parse("2026-08-09T09:00:00.000Z"), exceptRecommendationId: "nba-new" })).resolves.toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      ref: { path: "users/uid-1/taskRecommendations/nba-1" },
      value: { status: "EXPIRED", invalidatedAt: expect.anything() },
    });
  });
});
