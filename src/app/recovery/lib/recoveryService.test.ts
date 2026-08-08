import { describe, expect, it, vi } from "vitest";

import { generateRecoverySession } from "./recoveryService";
import type { RecoveryBacklogTask } from "./recoveryPlanning";
import type { RecoverySession } from "./recoveryContract";

function task(overrides: Partial<RecoveryBacklogTask> = {}): RecoveryBacklogTask {
  return {
    taskId: "flexible",
    taskVersion: "version-1",
    title: "Flexible task",
    dueDate: null,
    priority: null,
    hardDeadline: false,
    pinned: false,
    inProgress: false,
    blocksImportantWork: false,
    flexible: true,
    stale: false,
    requiresClarification: false,
    carriedOver: true,
    recentlyMoved: false,
    postponementCount: 0,
    nextBestActionCandidate: null,
    ...overrides,
  };
}

describe("Recovery session service", () => {
  it("generates and persists a server-owned recovery session", async () => {
    const saved: RecoverySession[] = [];
    const sessionRepository = {
      loadSession: vi.fn(async () => null),
      saveSession: vi.fn(async (_uid: string, session: RecoverySession) => { saved.push(session); }),
      dismissSession: vi.fn(),
      completeSession: vi.fn(),
    };
    const planningRepository = {
      loadBacklog: vi.fn(async () => [task()]),
    };

    const result = await generateRecoverySession({
      uid: "uid-1",
      localDate: "2026-08-08",
      timezone: "UTC",
      nowMs: Date.parse("2026-08-08T01:00:00.000Z"),
      triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"],
      sessionRepository,
      planningRepository,
      capacitySnapshot: {
        remainingRange: { min: 15, max: 30 },
        fullDayRange: { min: 15, max: 30 },
        state: "STANDARD",
        confidence: "LOW",
        primarySource: "DEFAULT",
        manualOverride: null,
      },
    });

    expect(result.reused).toBe(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ userId: "uid-1", status: "ACTIVE", backlogCount: 1, remainingCapacity: { max: 30 } });
    expect(saved[0].actions[0]).toMatchObject({ taskId: "flexible", type: "MARK_FOR_LATER_REVIEW" });
  });
});
