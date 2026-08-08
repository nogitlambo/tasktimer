import { describe, expect, it } from "vitest";

import { createFirestoreScheduleRepairRepository, mapScheduleRepairFirestoreTask } from "./scheduleRepairRepository";

function buildFakeDb(task: Record<string, unknown>, proposal: Record<string, unknown>) {
  const state = { task, proposal };
  function ref(kind: "task" | "proposal") {
    return {
      async get() {
        const value = state[kind];
        return { exists: true, data: () => value };
      },
      kind,
    };
  }
  const userRef = {
    collection(name: string) {
      return {
        doc(id: string) {
          void id;
          return ref(name === "tasks" ? "task" : "proposal");
        },
      };
    },
  };
  return {
    state,
    collection() {
      return { doc: () => userRef };
    },
    async runTransaction(work: (transaction: { get: (target: { kind: "task" | "proposal"; get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> }> }) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>; update: (target: { kind: "task" | "proposal" }, patch: Record<string, unknown>) => void }) => Promise<unknown>) {
      return work({
        get: async (target) => target.get(),
        update: (target, patch) => {
          state[target.kind] = { ...state[target.kind], ...patch };
        },
      });
    },
  };
}

describe("Schedule Repair repository apply", () => {
  it("applies a fresh once-off move and replays the same idempotency key", async () => {
    const task: Record<string, unknown> = {
      id: "task-1",
      taskType: "once-off",
      onceOffTargetDate: "2026-08-08",
      onceOffDay: "sat",
      plannedStartDay: "sat",
      plannedStartTime: "09:00",
      timeGoalMinutes: 60,
      accumulatedMs: 30 * 60_000,
      updatedAt: new Date("2026-08-07T00:00:00.000Z"),
      completed: false,
      active: true,
      editable: true,
    };
    const mappedTask = mapScheduleRepairFirestoreTask("task-1", task, "uid-1", "2026-08-08");
    expect(mappedTask.completedMinutes).toBe(30);
    const taskVersion = mappedTask.taskVersion;
    const proposal: Record<string, unknown> = {
      schemaVersion: 1,
      id: "repair-1",
      userId: "uid-1",
      localDate: "2026-08-08",
      planHealthBefore: "SIGNIFICANTLY_OVERLOADED",
      remainingPlannedMinutesBefore: 120,
      remainingCapacity: { min: 45, max: 60 },
      estimatedPlannedMinutesAfter: 60,
      actions: [{ id: "move:task-1", type: "MOVE_TO_LATER_DAY", taskId: "task-1", taskVersion, fromDate: "2026-08-08", toDate: "2026-08-09", fromMinutes: 60, toMinutes: null, reasonCodes: ["TASK_FLEXIBLE"], selected: true, status: "PROPOSED" }],
      sourceTaskVersionHash: "a".repeat(64),
      capacitySnapshotId: null,
      dailyBriefId: null,
      status: "ACTIVE",
      createdAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-08T01:00:00.000Z",
      appliedAt: null,
    };
    const db = buildFakeDb(task, proposal);
    const repository = createFirestoreScheduleRepairRepository(db as never);
    const result = await repository.applyProposal({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "key-1", localDate: "2026-08-08", actions: [{ id: "move:task-1", selected: true, toDate: "2026-08-09", toMinutes: null }], nowMs: Date.parse("2026-08-08T00:30:00.000Z") });

    expect(result.kind).toBe("applied");
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-09");
    expect(db.state.proposal.status).toBe("APPLIED");
    const replay = await repository.applyProposal({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "key-1", localDate: "2026-08-08", actions: [{ id: "move:task-1", selected: true, toDate: "2026-08-09", toMinutes: null }], nowMs: Date.parse("2026-08-08T00:31:00.000Z") });
    expect(replay.kind).toBe("idempotent");
    const undone = await repository.undoProposal({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "undo-1", nowMs: Date.parse("2026-08-08T00:30:20.000Z") });
    expect(undone.kind).toBe("undone");
    expect(db.state.task.onceOffTargetDate).toBe("2026-08-08");
    expect(db.state.proposal.status).toBe("REVERSED");
    const undoReplay = await repository.undoProposal({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "undo-1", nowMs: Date.parse("2026-08-08T00:30:25.000Z") });
    expect(undoReplay.kind).toBe("idempotent");
  });
});
