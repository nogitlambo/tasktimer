import { describe, expect, it } from "vitest";

import { mapNextBestActionCandidateToRecoveryTask } from "./recoveryPlanningRepository";

describe("Recovery planning source", () => {
  it("maps server-owned Next Best Action candidates into recovery safety signals", () => {
    const result = mapNextBestActionCandidateToRecoveryTask({
      ownerUid: "uid-1",
      taskVersion: "version-1",
      task: {
        id: "task-1",
        name: "Pay bill",
        onceOffTargetDate: "2026-08-07",
        timeGoalMinutes: 30,
        createdAtMs: Date.parse("2026-07-01T00:00:00.000Z"),
        hardDeadline: true,
        pinned: false,
        flexible: false,
        carriedOver: true,
        order: 1,
        accumulatedMs: 0,
        running: false,
        startMs: null,
        collapsed: false,
        milestonesEnabled: false,
        milestones: [],
        hasStarted: false,
      },
      active: true,
      deleted: false,
      completed: false,
      actionable: true,
      blocked: false,
      clarification: null,
    } as never, "2026-08-08");

    expect(result).toMatchObject({
      taskId: "task-1",
      taskVersion: "version-1",
      dueDate: "2026-08-07",
      hardDeadline: true,
      carriedOver: true,
      nextBestActionCandidate: expect.any(Object),
    });
  });

  it("does not expose inactive or completed candidates to recovery planning", () => {
    const result = mapNextBestActionCandidateToRecoveryTask({
      ownerUid: "uid-1",
      task: { id: "task-1", name: "Done" },
      active: true,
      completed: true,
    } as never, "2026-08-08");

    expect(result).toBeNull();
  });
});
