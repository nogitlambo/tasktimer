import { describe, expect, it, vi } from "vitest";

import { createFirestoreAutomationExecutionRepository } from "./trustedAutomationExecutionRepository";

const execution = {
  schemaVersion: 1 as const,
  id: "execution-1",
  ruleId: "REFRESH_DAILY_BRIEF" as const,
  entityId: "brief-1",
  entityType: "DAILY_BRIEF" as const,
  entityVersion: "v1",
  state: "QUEUED" as const,
  idempotencyKey: "request-1",
  retryCount: 0,
  createdAt: "2026-08-09T00:00:00.000Z",
};

function createDb() {
  const executionGet = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
  const executionSet = vi.fn().mockResolvedValue(undefined);
  const executionCreate = vi.fn().mockResolvedValue(undefined);
  const executionDoc = vi.fn(() => ({ get: executionGet, set: executionSet, create: executionCreate }));
  const executionCollection = vi.fn(() => ({ doc: executionDoc }));
  const userDoc = vi.fn(() => ({ collection: executionCollection }));
  const db = { collection: vi.fn(() => ({ doc: userDoc })) };
  return { db, executionGet, executionSet, executionCreate, executionDoc, executionCollection, userDoc };
}

function createExistingDb(existing: Record<string, unknown>) {
  const executionGet = vi.fn().mockResolvedValue({ exists: true, data: () => existing });
  const executionSet = vi.fn().mockResolvedValue(undefined);
  const executionDoc = vi.fn(() => ({ get: executionGet, set: executionSet, create: vi.fn() }));
  const executionCollection = vi.fn(() => ({ doc: executionDoc }));
  const userDoc = vi.fn(() => ({ collection: executionCollection }));
  const db = { collection: vi.fn(() => ({ doc: userDoc })) };
  return { db, executionGet, executionSet };
}

describe("Trusted Automation execution repository", () => {
  it("writes a user-scoped execution with retention metadata and reads validated state", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationExecutionRepository(mock.db as never, () => Date.parse("2026-08-09T00:00:00.000Z"));

    await repository.create("user-1", execution);

    expect(mock.executionCreate).toHaveBeenCalledTimes(1);
    expect(mock.executionCreate.mock.calls[0]?.[0]).toMatchObject({
      schemaVersion: 1,
      id: execution.id,
      retentionExpiresAt: expect.anything(),
    });
  });

  it("rejects invalid execution state before Firestore mutation", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationExecutionRepository(mock.db as never, () => 0);

    await expect(repository.create("user-1", { ...execution, state: "UNKNOWN" as never })).rejects.toMatchObject({ code: "automation/invalid-execution" });
    expect(mock.executionCreate).not.toHaveBeenCalled();
  });

  it("enforces idempotency and forward-only execution transitions on updates", async () => {
    const mock = createExistingDb({ ...execution, state: "RUNNING", startedAt: "2026-08-09T00:00:01.000Z", updatedAt: "2026-08-09T00:00:01.000Z", retentionExpiresAt: "2026-09-08T00:00:00.000Z" });
    const repository = createFirestoreAutomationExecutionRepository(mock.db as never, () => Date.parse("2026-08-09T00:00:02.000Z"));

    await expect(repository.update("user-1", { ...execution, state: "QUEUED" })).rejects.toMatchObject({ code: "automation/invalid-transition" });
    await expect(repository.update("user-1", { ...execution, state: "SUCCEEDED", idempotencyKey: "different-request", finishedAt: "2026-08-09T00:00:02.000Z" })).rejects.toMatchObject({ code: "automation/idempotency-conflict" });
    expect(mock.executionSet).not.toHaveBeenCalled();
  });

  it("does not return expired executions", async () => {
    const mock = createExistingDb({ ...execution, updatedAt: "2026-08-09T00:00:01.000Z", retentionExpiresAt: "2026-08-09T00:00:01.000Z" });
    const repository = createFirestoreAutomationExecutionRepository(mock.db as never, () => Date.parse("2026-08-09T00:00:02.000Z"));

    await expect(repository.get("user-1", "execution-1")).resolves.toBeNull();
  });
});
