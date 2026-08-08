import { describe, expect, it } from "vitest";

import { buildRecoverySession, hashRecoveryTaskVersions } from "./recoverySessionPlanning";
import { buildRecoveryBacklogPlan, type RecoveryBacklogTask } from "./recoveryPlanning";

function task(overrides: Partial<RecoveryBacklogTask> = {}): RecoveryBacklogTask {
  return {
    taskId: "task-1",
    taskVersion: "version-1",
    title: "Task",
    dueDate: null,
    priority: null,
    hardDeadline: false,
    pinned: false,
    inProgress: false,
    blocksImportantWork: false,
    flexible: false,
    stale: false,
    requiresClarification: false,
    carriedOver: true,
    recentlyMoved: false,
    postponementCount: 0,
    nextBestActionCandidate: null,
    ...overrides,
  };
}

describe("Recovery session planning", () => {
  it("creates an owned expiring session with safe action types and no delete/archive action", () => {
    const tasks = [
      task({ taskId: "flexible", flexible: true }),
      task({ taskId: "unclear", requiresClarification: true }),
      task({ taskId: "urgent", dueDate: "2026-08-07", hardDeadline: true }),
    ];
    const plan = buildRecoveryBacklogPlan({ userId: "uid-1", localDate: "2026-08-08", remainingCapacityRange: { min: 15, max: 30 }, tasks });
    const session = buildRecoverySession({
      id: "recovery-1",
      userId: "uid-1",
      localDate: "2026-08-08",
      nowMs: Date.parse("2026-08-08T01:00:00.000Z"),
      triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"],
      remainingCapacity: { min: 15, max: 30 },
      tasks,
      plan,
      scheduleRepairActions: [{ id: "move:flexible", type: "MOVE_TO_LATER_DAY", taskId: "flexible", taskVersion: "version-1", toDate: "2026-08-10", reasonCodes: ["TASK_FLEXIBLE"], selected: true, status: "PROPOSED" }],
      sourceTaskVersionHash: hashRecoveryTaskVersions(tasks),
    });

    expect(session).toMatchObject({ id: "recovery-1", userId: "uid-1", status: "ACTIVE", expiresAt: "2026-08-09T01:00:00.000Z" });
    expect(session.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: "flexible", type: "DEFER_TO_LATER_DAY", toDate: "2026-08-10", selected: false }),
      expect.objectContaining({ taskId: "unclear", type: "CLARIFY_TASK" }),
      expect.objectContaining({ taskId: "urgent", type: "KEEP_ACTIVE" }),
    ]));
    expect(session.actions.every((action) => !["DELETE", "ARCHIVE"].includes(action.type))).toBe(true);
  });
});
