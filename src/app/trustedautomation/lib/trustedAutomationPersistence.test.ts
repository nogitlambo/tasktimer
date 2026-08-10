import { describe, expect, it } from "vitest";

import {
  AutomationHistorySchema,
  AutomationHistoryOutcomeSchema,
  buildAutomationExecutionPersistenceEntity,
  buildAutomationRulePersistenceEntity,
  parseAutomationExecutionPersistenceEntity,
  parseAutomationRulePersistenceEntity,
} from "./trustedAutomationPersistence";

const rule = {
  id: "refresh-daily-brief",
  type: "REFRESH_DAILY_BRIEF" as const,
  enabled: true,
  trustLevel: "TRUSTED" as const,
  priority: "NORMAL" as const,
  schemaVersion: 1 as const,
  trigger: {
    type: "EVENT" as const,
    eventType: "DAILY_BRIEF_STALE" as const,
    entityType: "DAILY_BRIEF" as const,
  },
  action: "REFRESH_DAILY_BRIEF" as const,
  rollbackPolicy: "NONE" as const,
  retryPolicy: { maxRetries: 2, retryableCategories: ["TRANSIENT" as const], backoffMs: 1000 },
  auditMetadata: { category: "REFRESH" as const, label: "Refresh Daily Executive Brief" },
};

describe("Trusted Automation persistence boundary", () => {
  it("adds persistence metadata without changing the domain rule shape", () => {
    const entity = buildAutomationRulePersistenceEntity(rule, {
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(entity).toMatchObject({ id: rule.id, createdAt: "2026-08-09T00:00:00.000Z" });
    expect(parseAutomationRulePersistenceEntity(entity)).toMatchObject({ success: true, data: { id: rule.id } });
  });

  it("rejects persisted rules with unsupported schema versions", () => {
    expect(parseAutomationRulePersistenceEntity({
      ...buildAutomationRulePersistenceEntity(rule, {
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
      schemaVersion: 99,
    })).toMatchObject({ success: false, error: { code: "UNSUPPORTED_VERSION" } });
  });

  it("accepts additive fields at the persistence boundary while preserving the domain shape", () => {
    const entity = {
      ...buildAutomationRulePersistenceEntity(rule, {
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
      futureOptionalField: "ignored by the current reader",
    };

    expect(parseAutomationRulePersistenceEntity(entity)).toMatchObject({ success: true, data: { id: rule.id } });
  });

  it("persists execution retention metadata and keeps history limited to references", () => {
    const execution = {
      schemaVersion: 1 as const,
      id: "execution-1",
      ruleId: rule.type,
      entityId: "brief-1",
      entityType: "DAILY_BRIEF" as const,
      entityVersion: "v1",
      state: "SUCCEEDED" as const,
      idempotencyKey: "request-1",
      retryCount: 0,
      createdAt: "2026-08-09T00:00:00.000Z",
      startedAt: "2026-08-09T00:00:00.010Z",
      finishedAt: "2026-08-09T00:00:00.100Z",
    };
    const executionEntity = buildAutomationExecutionPersistenceEntity(execution, {
      createdAt: execution.createdAt,
      updatedAt: execution.finishedAt,
      retentionExpiresAt: "2026-09-08T00:00:00.000Z",
    });

    expect(parseAutomationExecutionPersistenceEntity(executionEntity)).toMatchObject({ id: execution.id, state: "SUCCEEDED" });
    expect(AutomationHistoryOutcomeSchema.parse("SUCCESS")).toBe("SUCCESS");
    const history = AutomationHistorySchema.parse({
      schemaVersion: 1,
      id: "history-1",
      userId: "user-1",
      executionId: execution.id,
      ruleId: rule.type,
      trigger: "DAILY_BRIEF_STALE",
      entity: { entityType: "DAILY_BRIEF", entityId: "brief-1", entityVersion: "v1" },
      outcome: "SUCCESS",
      reasonCodes: ["STALE", "AUTO_REFRESH"],
      durationMs: 90,
      createdAt: "2026-08-09T00:00:00.100Z",
      retentionExpiresAt: "2026-11-07T00:00:00.000Z",
      taskTitle: "private content must not survive parsing",
    });

    expect(history).not.toHaveProperty("taskTitle");
    expect(history.entity).toEqual({ entityType: "DAILY_BRIEF", entityId: "brief-1", entityVersion: "v1" });
  });
});
