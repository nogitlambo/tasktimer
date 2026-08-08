import { describe, expect, it } from "vitest";

import {
  buildRecoveryBacklogPlan,
  classifyRecoveryTask,
  type RecoveryBacklogTask,
} from "./recoveryPlanning";

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

describe("Recovery backlog planning", () => {
  it("protects urgent work and only marks safe flexible backlog as movable by default", () => {
    const urgent = classifyRecoveryTask(task({ taskId: "urgent", dueDate: "2026-08-07", hardDeadline: true }), "2026-08-08");
    const flexible = classifyRecoveryTask(task({ taskId: "flexible", flexible: true }), "2026-08-08");
    const unclear = classifyRecoveryTask(task({ taskId: "unclear", requiresClarification: true }), "2026-08-08");

    expect(urgent).toMatchObject({ classification: "URGENT", movableByDefault: false });
    expect(urgent.reasonCodes).toContain("OVERDUE_HARD_DEADLINE");
    expect(flexible).toMatchObject({ classification: "FLEXIBLE", movableByDefault: true });
    expect(flexible.reasonCodes).toContain("SAFE_TO_DEFER");
    expect(unclear).toMatchObject({ classification: "UNCLEAR", movableByDefault: false });
  });

  it("keeps near-term, pinned, and stale work visible without treating it as safe deferral", () => {
    const important = classifyRecoveryTask(task({ taskId: "important", dueDate: "2026-08-10" }), "2026-08-08");
    const pinned = classifyRecoveryTask(task({ taskId: "pinned", flexible: true, pinned: true }), "2026-08-08");
    const stale = classifyRecoveryTask(task({ taskId: "stale", stale: true, postponementCount: 3 }), "2026-08-08");

    expect(important).toMatchObject({ classification: "IMPORTANT", movableByDefault: false });
    expect(important.reasonCodes).toContain("DUE_SOON");
    expect(pinned).toMatchObject({ classification: "IMPORTANT", movableByDefault: false });
    expect(stale).toMatchObject({ classification: "STALE", movableByDefault: false });
    expect(stale.reasonCodes).toContain("TASK_STALE");
  });

  it("caps visible attention and flexible backlog while keeping restart selection unique", () => {
    const tasks = [
      task({ taskId: "urgent", title: "Urgent task", dueDate: "2026-08-08", hardDeadline: true, nextBestActionCandidate: { ownerUid: "uid-1", task: { id: "urgent", name: "Urgent task", timeGoalMinutes: 15, createdAtMs: 1 } } as RecoveryBacklogTask["nextBestActionCandidate"] }),
      task({ taskId: "important", title: "Important task", dueDate: "2026-08-10", priority: "high", nextBestActionCandidate: { ownerUid: "uid-1", task: { id: "important", name: "Important task", timeGoalMinutes: 20, createdAtMs: 2 }, clarification: { firstAction: "Open the checklist." } } as RecoveryBacklogTask["nextBestActionCandidate"] }),
      task({ taskId: "flexible-1", flexible: true, nextBestActionCandidate: { ownerUid: "uid-1", task: { id: "flexible-1", name: "Flexible task", timeGoalMinutes: 5, createdAtMs: 3 } } as RecoveryBacklogTask["nextBestActionCandidate"] }),
    ];

    const plan = buildRecoveryBacklogPlan({
      userId: "uid-1",
      localDate: "2026-08-08",
      availableMinutes: 30,
      remainingCapacityRange: { min: 10, max: 30 },
      tasks,
    });

    expect(plan.restartTaskId).toBe("urgent");
    expect(plan.attentionTaskIds).toEqual(["urgent", "important"]);
    expect(plan.flexibleTaskIds).toEqual(["flexible-1"]);
    expect(new Set(plan.visibleTaskIds).size).toBe(plan.visibleTaskIds.length);
  });
});
