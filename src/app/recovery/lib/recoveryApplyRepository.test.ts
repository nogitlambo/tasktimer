import { describe, expect, it } from "vitest";

import { computeTaskClarificationSourceVersion } from "@/app/taskclarification/lib/taskClarification";

import { createFirestoreRecoveryApplyRepository } from "./recoveryApplyRepository";
import type { RecoverySession } from "./recoveryContract";

function buildFakeDb(task: Record<string, unknown>, session: RecoverySession, recommendation?: Record<string, unknown>) {
  const state: { task: Record<string, unknown>; session: RecoverySession; recommendation?: Record<string, unknown> } = { task, session, recommendation };
  function ref(kind: "task" | "session" | "recommendation") {
    return {
      kind,
      async get() {
        return { exists: true, data: () => state[kind] };
      },
    };
  }
  const userRef = {
    collection(name: string) {
      const kind = name === "tasks" ? "task" : name === "taskRecommendations" ? "recommendation" : "session";
      return {
        doc: () => ref(kind),
        get: async () => name === "tasks"
          ? { docs: [{ data: () => state.task }] }
          : name === "taskRecommendations" && state.recommendation
            ? { docs: [{ ref: ref("recommendation"), data: () => state.recommendation }] }
            : { docs: [] },
      };
    },
  };
  return {
    state,
    collection() {
      return { doc: () => userRef };
    },
    async runTransaction(work: (transaction: { get: (target: { get: () => Promise<unknown> }) => Promise<unknown>; update: (target: { kind: "task" | "session" | "recommendation" }, patch: Record<string, unknown>) => void }) => Promise<unknown>) {
      return work({
        get: async (target) => target.get(),
        update: (target, patch) => {
          state[target.kind] = { ...(state[target.kind] || {}), ...patch } as never;
        },
      });
    },
  };
}

describe("Recovery apply repository", () => {
  it("applies only selected fresh actions and replays the same idempotency key", async () => {
    const task: Record<string, unknown> = {
      id: "task-1",
      taskType: "once-off",
      onceOffTargetDate: "2026-08-08",
      onceOffDay: "sat",
      plannedStartDay: "sat",
      timeGoalMinutes: 20,
      updatedAt: "2026-08-07T00:00:00.000Z",
      active: true,
      completed: false,
      editable: true,
      flexible: true,
    };
    const taskVersion = computeTaskClarificationSourceVersion("task-1", task);
    const session: RecoverySession = {
      schemaVersion: 1,
      id: "recovery-1",
      userId: "uid-1",
      localDate: "2026-08-08",
      triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"],
      backlogCount: 1,
      overdueCount: 1,
      urgentCount: 0,
      flexibleCount: 1,
      staleCount: 0,
      remainingCapacity: { min: 15, max: 30 },
      restartTaskId: null,
      nextBestActionRecommendationId: null,
      actions: [{ id: "defer:task-1", type: "DEFER_TO_LATER_DAY", classification: "FLEXIBLE", taskId: "task-1", taskVersion, fromDate: "2026-08-08", toDate: "2026-08-10", reasonCodes: ["SAFE_TO_DEFER"], selected: false, status: "PROPOSED" }],
      sourceTaskVersionHash: "a".repeat(64),
      status: "ACTIVE",
      createdAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-09T00:00:00.000Z",
      completedAt: null,
    };
    const db = buildFakeDb(task, session, { id: "nba-1", type: "NEXT_BEST_ACTION", taskId: "task-1", status: "ACTIVE" });
    const repository = createFirestoreRecoveryApplyRepository(db as never);
    const input = { uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "apply-1", localDate: "2026-08-08", actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }], nowMs: Date.parse("2026-08-08T00:30:00.000Z") };

    expect((await repository.applySession({ ...input, uid: "uid-2" })).kind).toBe("not-found");
    const result = await repository.applySession(input);

    expect(result.kind).toBe("applied");
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-10");
    expect(db.state.session.status).toBe("PARTIALLY_APPLIED");
    expect(db.state.recommendation?.status).toBe("EXPIRED");
    expect(result.results).toMatchObject([{ before: { onceOffTargetDate: "2026-08-08" }, after: { onceOffTargetDate: "2026-08-10" } }]);
    const replay = await repository.applySession({ ...input, nowMs: Date.parse("2026-08-08T00:31:00.000Z") });
    expect(replay.kind).toBe("idempotent");
    expect((await repository.undoSession({ uid: "uid-2", recoveryId: "recovery-1", idempotencyKey: "undo-attacker", nowMs: Date.parse("2026-08-08T00:30:20.000Z") })).kind).toBe("not-found");
    const undone = await repository.undoSession({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "undo-1", nowMs: Date.parse("2026-08-08T00:30:20.000Z") });
    expect(undone.kind).toBe("undone");
    expect(undone.results).toMatchObject([{ outcome: "APPLIED" }]);
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-08");
  });

  it("rejects a hard-deadline move beyond the deadline", async () => {
    const task: Record<string, unknown> = { id: "task-1", taskType: "once-off", onceOffTargetDate: "2026-08-08", plannedStartDay: "sat", timeGoalMinutes: 20, active: true, completed: false, editable: true, hardDeadline: true };
    const taskVersion = computeTaskClarificationSourceVersion("task-1", task);
    const session = {
      schemaVersion: 1, id: "recovery-1", userId: "uid-1", localDate: "2026-08-08", triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED" as const], backlogCount: 1, overdueCount: 1, urgentCount: 1, flexibleCount: 0, staleCount: 0, remainingCapacity: { min: 15, max: 30 }, restartTaskId: null, nextBestActionRecommendationId: null,
      actions: [{ id: "defer:task-1", type: "DEFER_TO_LATER_DAY" as const, classification: "URGENT" as const, taskId: "task-1", taskVersion, fromDate: "2026-08-08", toDate: "2026-08-10", reasonCodes: ["OVERDUE_HARD_DEADLINE" as const], selected: false, status: "PROPOSED" as const }], sourceTaskVersionHash: "a".repeat(64), status: "ACTIVE" as const, createdAt: "2026-08-08T00:00:00.000Z", expiresAt: "2026-08-09T00:00:00.000Z", completedAt: null,
    } satisfies RecoverySession;
    const db = buildFakeDb(task, session);
    const result = await createFirestoreRecoveryApplyRepository(db as never).applySession({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "apply-hard-deadline", localDate: "2026-08-08", actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }], nowMs: Date.parse("2026-08-08T00:30:00.000Z") });

    expect(result.results).toMatchObject([{ outcome: "REJECTED", reason: "Hard-deadline task cannot be moved beyond its deadline." }]);
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-08");
  });

  it("returns a stale outcome when the task version changes after generation", async () => {
    const task: Record<string, unknown> = { id: "task-1", taskType: "once-off", onceOffTargetDate: "2026-08-08", plannedStartDay: "sat", timeGoalMinutes: 20, active: true, completed: false, editable: true };
    const taskVersion = computeTaskClarificationSourceVersion("task-1", task);
    const session = {
      schemaVersion: 1, id: "recovery-1", userId: "uid-1", localDate: "2026-08-08", triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED" as const], backlogCount: 1, overdueCount: 0, urgentCount: 0, flexibleCount: 1, staleCount: 0, remainingCapacity: { min: 15, max: 30 }, restartTaskId: null, nextBestActionRecommendationId: null,
      actions: [{ id: "defer:task-1", type: "DEFER_TO_LATER_DAY" as const, classification: "FLEXIBLE" as const, taskId: "task-1", taskVersion, fromDate: "2026-08-08", toDate: "2026-08-10", reasonCodes: ["SAFE_TO_DEFER" as const], selected: false, status: "PROPOSED" as const }], sourceTaskVersionHash: "a".repeat(64), status: "ACTIVE" as const, createdAt: "2026-08-08T00:00:00.000Z", expiresAt: "2026-08-09T00:00:00.000Z", completedAt: null,
    } satisfies RecoverySession;
    task.updatedAt = "2026-08-08T00:20:00.000Z";
    const db = buildFakeDb(task, session);
    const result = await createFirestoreRecoveryApplyRepository(db as never).applySession({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "apply-stale", localDate: "2026-08-08", actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }], nowMs: Date.parse("2026-08-08T00:30:00.000Z") });

    expect(result.results).toMatchObject([{ outcome: "STALE" }]);
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-08");
  });

  it("rejects a target day that is already beyond the session capacity ceiling", async () => {
    const task: Record<string, unknown> = { id: "task-1", taskType: "once-off", onceOffTargetDate: "2026-08-10", plannedStartDay: "mon", timeGoalMinutes: 20, active: true, completed: false, editable: true };
    const taskVersion = computeTaskClarificationSourceVersion("task-1", task);
    const session = {
      schemaVersion: 1, id: "recovery-1", userId: "uid-1", localDate: "2026-08-08", triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED" as const], backlogCount: 1, overdueCount: 0, urgentCount: 0, flexibleCount: 1, staleCount: 0, remainingCapacity: { min: 15, max: 30 }, restartTaskId: null, nextBestActionRecommendationId: null,
      actions: [{ id: "defer:task-1", type: "DEFER_TO_LATER_DAY" as const, classification: "FLEXIBLE" as const, taskId: "task-1", taskVersion, fromDate: "2026-08-08", toDate: "2026-08-10", reasonCodes: ["SAFE_TO_DEFER" as const], selected: false, status: "PROPOSED" as const }], sourceTaskVersionHash: "a".repeat(64), status: "ACTIVE" as const, createdAt: "2026-08-08T00:00:00.000Z", expiresAt: "2026-08-09T00:00:00.000Z", completedAt: null,
    } satisfies RecoverySession;
    const db = buildFakeDb(task, session);
    const result = await createFirestoreRecoveryApplyRepository(db as never).applySession({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "apply-overload", localDate: "2026-08-08", actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }], nowMs: Date.parse("2026-08-08T00:30:00.000Z") });

    expect(result.results).toMatchObject([{ outcome: "REJECTED", reason: "The target day no longer has enough capacity." }]);
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-10");
  });
});
