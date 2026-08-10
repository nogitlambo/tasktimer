import { describe, expect, it } from "vitest";

import {
  acquireAutomationLock,
  deduplicateAutomationQueue,
  evaluateAutomationRetry,
  orderAutomationQueue,
  releaseAutomationLock,
  resolveAutomationQueueOutcome,
} from "./trustedAutomationQueue";

const queueItem = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  id: "queue-1",
  userId: "user-1",
  ruleId: "REFRESH_DAILY_BRIEF" as const,
  entityId: "brief-1",
  entityType: "DAILY_BRIEF" as const,
  entityVersion: "v1",
  priority: "NORMAL" as const,
  idempotencyKey: "request-1",
  queuedAt: "2026-08-09T00:00:00.000Z",
  sequence: 1,
  expiresAt: "2026-08-09T01:00:00.000Z",
  ...overrides,
});

describe("Trusted Automation queue and retry state", () => {
  it("orders by priority first and FIFO sequence within equal priority", () => {
    const ordered = orderAutomationQueue([
      queueItem({ id: "normal-2", sequence: 2 }),
      queueItem({ id: "critical", priority: "CRITICAL", sequence: 10 }),
      queueItem({ id: "normal-1", sequence: 1 }),
      queueItem({ id: "high", priority: "HIGH", sequence: 20 }),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["critical", "high", "normal-1", "normal-2"]);
  });

  it("deduplicates equivalent work by idempotency key", () => {
    const deduplicated = deduplicateAutomationQueue([
      queueItem({ id: "first", idempotencyKey: "same" }),
      queueItem({ id: "duplicate", idempotencyKey: "same", sequence: 2 }),
      queueItem({ id: "different", idempotencyKey: "different", sequence: 3 }),
    ]);

    expect(deduplicated.map((item) => item.id)).toEqual(["first", "different"]);
  });

  it("prevents concurrent entity work, recovers after lock expiry, and releases only by owner", () => {
    const first = {
      schemaVersion: 1 as const,
      id: "lock-1",
      userId: "user-1",
      entityType: "DAILY_BRIEF" as const,
      entityId: "brief-1",
      ownerExecutionId: "execution-1",
      acquiredAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-09T00:05:00.000Z",
    };
    const competing = { ...first, id: "lock-2", ownerExecutionId: "execution-2" };

    expect(acquireAutomationLock(first, competing, Date.parse("2026-08-09T00:01:00.000Z")).kind).toBe("CONFLICT");
    expect(acquireAutomationLock(first, competing, Date.parse("2026-08-09T00:06:00.000Z")).kind).toBe("ACQUIRED");
    expect(releaseAutomationLock(first, "execution-2")).toMatchObject({ kind: "NOT_OWNER" });
    expect(releaseAutomationLock(first, "execution-1")).toMatchObject({ kind: "RELEASED" });
  });

  it("retries transient failures with bounded exponential backoff only", () => {
    const policy = { maxRetries: 2, retryableCategories: ["TRANSIENT", "TIMEOUT"] as const, backoffMs: 1000 };

    expect(evaluateAutomationRetry({ failureCategory: "TRANSIENT", retryCount: 0, policy })).toMatchObject({
      retry: true,
      nextRetryCount: 1,
      delayMs: 1000,
      nextState: "QUEUED",
    });
    expect(evaluateAutomationRetry({ failureCategory: "TRANSIENT", retryCount: 2, policy })).toMatchObject({ retry: false, nextState: "FAILED" });
    expect(evaluateAutomationRetry({ failureCategory: "VALIDATION", retryCount: 0, policy })).toMatchObject({ retry: false, nextState: "FAILED" });
  });

  it("turns pause, cancellation, stale work, and lock conflicts into terminal outcomes", () => {
    expect(resolveAutomationQueueOutcome({ paused: true })).toEqual({ state: "CANCELLED", reason: "PAUSED" });
    expect(resolveAutomationQueueOutcome({ cancelled: true })).toEqual({ state: "CANCELLED", reason: "CANCELLED" });
    expect(resolveAutomationQueueOutcome({ stale: true })).toEqual({ state: "SKIPPED", reason: "STALE_WORK" });
    expect(resolveAutomationQueueOutcome({ lockConflict: true })).toEqual({ state: "SKIPPED", reason: "LOCK_CONFLICT" });
  });
});
