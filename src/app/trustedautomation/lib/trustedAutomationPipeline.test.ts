import { describe, expect, it, vi } from "vitest";

import { createDefaultAutomationSettings, applyAutomationSettingsPatch } from "./trustedAutomationPolicy";
import { runTrustedAutomation } from "./trustedAutomationPipeline";
import type { TrustedAutomationMetricEvent } from "./trustedAutomationOperations";
import { loadTrustedAutomationRolloutPolicy } from "./trustedAutomationRollout";

const rule = {
  id: "refresh-daily-brief",
  type: "REFRESH_DAILY_BRIEF" as const,
  enabled: true,
  trustLevel: "TRUSTED" as const,
  priority: "NORMAL" as const,
  schemaVersion: 1 as const,
  trigger: { type: "EVENT" as const, eventType: "DAILY_BRIEF_STALE" as const, entityType: "DAILY_BRIEF" as const },
  action: "REFRESH_DAILY_BRIEF" as const,
  rollbackPolicy: "NONE" as const,
  retryPolicy: { maxRetries: 2, retryableCategories: ["TRANSIENT" as const], backoffMs: 1000 },
  auditMetadata: { category: "REFRESH" as const, label: "Refresh Daily Executive Brief" },
};

function enabledSettings() {
  return applyAutomationSettingsPatch(createDefaultAutomationSettings("user-1", 0), {
    automationEnabled: true,
    consentGranted: true,
    rules: [{ ruleId: rule.type, enabled: true, trustLevel: "TRUSTED" }],
  }, 1);
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    authenticatedUserId: "user-1",
    settings: enabledSettings(),
    rule,
    entity: { userId: "user-1", entityType: "DAILY_BRIEF" as const, entityId: "brief-1", version: "v1", available: true },
    entityVersion: "v1",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    executionId: "execution-1",
    nowMs: Date.parse("2026-08-09T00:00:00.000Z"),
    execute: vi.fn().mockResolvedValue(undefined),
    onExecution: vi.fn().mockResolvedValue(undefined),
    onAudit: vi.fn().mockResolvedValue(undefined),
    onLockAcquired: vi.fn().mockResolvedValue(undefined),
    onLockReleased: vi.fn().mockResolvedValue(undefined),
    rolloutPolicy: loadTrustedAutomationRolloutPolicy({
      TRUSTED_AUTOMATION_ENABLED: "true",
      TRUSTED_AUTOMATION_INTERNAL_UIDS: "user-1",
      TRUSTED_AUTOMATION_RULE_FLAGS: JSON.stringify({ REFRESH_DAILY_BRIEF: { enabled: true, cohort: "INTERNAL" } }),
    }),
    ...overrides,
  };
}

describe("Trusted Automation execution pipeline", () => {
  it("runs a trusted rule after safety gates and releases its lock on success", async () => {
    const request = input();
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "SUCCEEDED", execution: { state: "SUCCEEDED" } });
    expect(request.execute).toHaveBeenCalledTimes(1);
    expect(request.onLockAcquired).toHaveBeenCalledTimes(1);
    expect(request.onLockReleased).toHaveBeenCalledTimes(1);
    expect(request.onAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "SUCCESS" }));
  });

  it("keeps ASSISTED execution confirmation-gated and never acquires a lock without confirmation", async () => {
    const settings = applyAutomationSettingsPatch(enabledSettings(), { rules: [{ ruleId: rule.type, enabled: true, trustLevel: "ASSISTED" }] }, 2);
    const request = input({ settings });
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "SKIPPED", reason: "CONFIRMATION_REQUIRED" });
    expect(request.execute).not.toHaveBeenCalled();
    expect(request.onLockAcquired).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled policy", { settings: createDefaultAutomationSettings("user-1", 0), expected: "AUTOMATION_DISABLED" }, "AUTOMATION_DISABLED"],
    ["ownership failure", { authenticatedUserId: "other-user" }, "OWNERSHIP_FAILED"],
    ["stale entity", { entityVersion: "v2" }, "ENTITY_STALE"],
    ["unavailable feature", { entity: { userId: "user-1", entityType: "DAILY_BRIEF", entityId: "brief-1", version: "v1", available: false } }, "FEATURE_UNAVAILABLE"],
    ["conflicting work", { conflict: true }, "CONFLICT"],
  ])("blocks %s before business execution", async (_label, overrides, expected) => {
    const request = input(overrides);
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "SKIPPED", reason: expected });
    expect(request.execute).not.toHaveBeenCalled();
    expect(request.onLockAcquired).not.toHaveBeenCalled();
  });

  it("replays an existing idempotent outcome without running the rule again", async () => {
    const existing = {
      schemaVersion: 1 as const,
      id: "execution-original",
      ruleId: rule.id,
      entityId: "brief-1",
      entityType: "DAILY_BRIEF" as const,
      entityVersion: "v1",
      state: "SUCCEEDED" as const,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      retryCount: 0,
      createdAt: "2026-08-09T00:00:00.000Z",
      finishedAt: "2026-08-09T00:00:00.100Z",
    };
    const request = input({ existingExecution: existing });
    const result = await runTrustedAutomation(request);

    expect(result).toEqual({ kind: "REPLAYED", execution: existing });
    expect(request.execute).not.toHaveBeenCalled();
    expect(request.onAudit).not.toHaveBeenCalled();
  });

  it("revalidates the entity version immediately before acquiring execution state", async () => {
    const request = input({ revalidateEntityVersion: vi.fn().mockResolvedValue("v2") });
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "SKIPPED", reason: "ENTITY_STALE" });
    expect(request.execute).not.toHaveBeenCalled();
    expect(request.onLockAcquired).not.toHaveBeenCalled();
  });

  it("uses external lock and timeout configuration and emits content-free metrics", async () => {
    const metrics: TrustedAutomationMetricEvent[] = [];
    const request = input({
      operationalConfig: { lockTtlMs: 2_000, executionTimeoutMs: 1_000 },
      onMetric: (event: TrustedAutomationMetricEvent) => metrics.push(event),
    });
    await runTrustedAutomation(request);

    const lock = (request.onLockAcquired as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(Date.parse(lock.expiresAt) - request.nowMs).toBe(2_000);
    expect(metrics).toContainEqual(expect.objectContaining({ name: "execution_outcome", state: "SUCCEEDED" }));
    expect(JSON.stringify(metrics)).not.toContain("task title");
  });

  it("turns a dependency timeout into a safe failed execution", async () => {
    const request = input({
      operationalConfig: { executionTimeoutMs: 1_000 },
      execute: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "FAILED", execution: { error: { category: "TIMEOUT", code: "TIMEOUT" } } });
  });

  it("stops new work at the rollout kill switch without touching existing execution state", async () => {
    const request = input({
      rolloutPolicy: loadTrustedAutomationRolloutPolicy({ TRUSTED_AUTOMATION_ENABLED: "true", TRUSTED_AUTOMATION_KILL_SWITCH: "true" }),
    });
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "SKIPPED", reason: "ROLLOUT_KILL_SWITCH" });
    expect(request.execute).not.toHaveBeenCalled();
    expect(request.onExecution).not.toHaveBeenCalled();
  });

  it("preserves state, audits a safe failure, and releases the lock when the service fails", async () => {
    const request = input({
      execute: vi.fn().mockRejectedValue(Object.assign(new Error("dependency unavailable"), { category: "DEPENDENCY", code: "DEPENDENCY_UNAVAILABLE" })),
    });
    const result = await runTrustedAutomation(request);

    expect(result).toMatchObject({ kind: "FAILED", execution: { state: "FAILED", error: { category: "DEPENDENCY" } } });
    expect(request.onLockReleased).toHaveBeenCalledTimes(1);
    expect(request.onAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "FAILED", reasonCodes: ["FAILURE"] }));
    expect((result as Extract<typeof result, { kind: "FAILED" }>).execution.error?.message).toBe("Automation dependency unavailable.");
    expect((result as Extract<typeof result, { kind: "FAILED" }>).execution.error?.message).not.toContain("private task notes");
  });
});
