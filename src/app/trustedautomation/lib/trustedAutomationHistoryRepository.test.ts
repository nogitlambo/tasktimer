import { describe, expect, it, vi } from "vitest";

import { createFirestoreAutomationHistoryRepository } from "./trustedAutomationHistoryRepository";

const history = {
  schemaVersion: 1 as const,
  id: "history-1",
  userId: "user-1",
  executionId: "execution-1",
  ruleId: "REFRESH_DAILY_BRIEF" as const,
  trigger: "DAILY_BRIEF_STALE",
  entity: { entityType: "DAILY_BRIEF" as const, entityId: "brief-1", entityVersion: "v1" },
  outcome: "SUCCESS" as const,
  reasonCodes: ["STALE" as const, "AUTO_REFRESH" as const],
  durationMs: 90,
  createdAt: "2026-08-09T00:00:00.100Z",
  retentionExpiresAt: "2026-11-07T00:00:00.000Z",
};

function createDb() {
  const historyCreate = vi.fn().mockResolvedValue(undefined);
  const historyDoc = vi.fn(() => ({ create: historyCreate }));
  const historyCollection = vi.fn(() => ({ doc: historyDoc }));
  const userDoc = vi.fn(() => ({ collection: historyCollection }));
  const db = { collection: vi.fn(() => ({ doc: userDoc })) };
  return { db, historyCreate, historyDoc, historyCollection, userDoc };
}

describe("Trusted Automation history repository", () => {
  it("appends immutable history with create-only semantics", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationHistoryRepository(mock.db as never);

    await repository.append("user-1", history);

    expect(mock.historyCreate).toHaveBeenCalledTimes(1);
    expect(mock.historyCreate.mock.calls[0]?.[0]).toMatchObject({ executionId: history.executionId, outcome: "SUCCESS" });
  });

  it("rejects a history record owned by another user without writing", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationHistoryRepository(mock.db as never);

    await expect(repository.append("user-2", history)).rejects.toMatchObject({ code: "automation/ownership" });
    expect(mock.historyCreate).not.toHaveBeenCalled();
  });
});
