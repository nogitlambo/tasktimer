import { describe, expect, it, vi } from "vitest";

import { createFirestoreRecoverySessionRepository } from "./recoverySessionRepository";
import type { RecoverySession } from "./recoveryContract";

function session(overrides: Partial<RecoverySession> = {}): RecoverySession {
  return {
    schemaVersion: 1,
    id: "recovery-1",
    userId: "uid-1",
    localDate: "2026-08-08",
    triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"],
    backlogCount: 1,
    overdueCount: 0,
    urgentCount: 0,
    flexibleCount: 1,
    staleCount: 0,
    remainingCapacity: { min: 15, max: 30 },
    restartTaskId: null,
    nextBestActionRecommendationId: null,
    actions: [],
    sourceTaskVersionHash: "a".repeat(64),
    status: "ACTIVE",
    createdAt: "2026-08-08T01:00:00.000Z",
    expiresAt: "2026-08-09T01:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("Recovery session repository", () => {
  it("writes sessions only below the authenticated user's recovery collection", async () => {
    const set = vi.fn(async () => undefined);
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn((name: string) => name === "recoverySessions" ? { doc: vi.fn(() => ({ set })) } : undefined),
        })),
      })),
    };
    const repository = createFirestoreRecoverySessionRepository(db as never);

    await repository.saveSession("uid-1", session());

    expect(db.collection).toHaveBeenCalledWith("users");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ userId: "uid-1", id: "recovery-1", createdAt: expect.anything() }));
  });

  it("rejects a session whose owner does not match the scoped user", async () => {
    const repository = createFirestoreRecoverySessionRepository({} as never);

    await expect(repository.saveSession("uid-1", session({ userId: "uid-2" }))).rejects.toThrow("ownership mismatch");
  });
});
