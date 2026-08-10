import { describe, expect, it } from "vitest";

import {
  AutomationExecutionSchema,
  AutomationRuleSchema,
  canTransitionAutomationExecution,
  parseAutomationEventEnvelope,
  parseAutomationRule,
} from "./trustedAutomationContract";

const validRule = {
  id: "refresh-daily-brief",
  type: "REFRESH_DAILY_BRIEF",
  enabled: true,
  trustLevel: "TRUSTED",
  priority: "NORMAL",
  schemaVersion: 1,
  trigger: {
    type: "EVENT",
    eventType: "DAILY_BRIEF_STALE",
    entityType: "DAILY_BRIEF",
  },
  action: "REFRESH_DAILY_BRIEF",
  rollbackPolicy: "NONE",
  retryPolicy: {
    maxRetries: 2,
    retryableCategories: ["TRANSIENT", "DEPENDENCY", "TIMEOUT"],
    backoffMs: 1000,
  },
  auditMetadata: {
    category: "REFRESH",
    label: "Refresh Daily Executive Brief",
  },
};

describe("Trusted Automation contract", () => {
  it("accepts a bounded safe rule with explicit trust and execution metadata", () => {
    const parsed = AutomationRuleSchema.parse({ ...validRule, futureOptionalField: "ignored by the current reader" });
    expect(parsed).toMatchObject({
      type: "REFRESH_DAILY_BRIEF",
      trustLevel: "TRUSTED",
      action: "REFRESH_DAILY_BRIEF",
    });
    expect(parsed).not.toHaveProperty("futureOptionalField");
    expect(() => AutomationRuleSchema.parse({
      ...validRule,
      trigger: { ...validRule.trigger, entityType: "TASK" },
    })).toThrow();
  });

  it("fails closed for high-impact actions, unknown rule types, and future schema versions", () => {
    expect(parseAutomationRule({ ...validRule, action: "DELETE_TASK" })).toMatchObject({
      success: false,
      error: { code: "HIGH_IMPACT_ACTION_PROHIBITED" },
    });
    expect(parseAutomationRule({ ...validRule, type: "DELETE_TASK" })).toMatchObject({
      success: false,
      error: { code: "UNKNOWN_RULE_TYPE" },
    });
    expect(parseAutomationRule({ ...validRule, schemaVersion: 99 })).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_VERSION" },
    });
  });

  it("requires an execution to use a known lifecycle state and stable idempotency key", () => {
    expect(() => AutomationExecutionSchema.parse({
      schemaVersion: 1,
      id: "execution-1",
      ruleId: "refresh-daily-brief",
      entityId: "brief-1",
      entityType: "DAILY_BRIEF",
      entityVersion: "v1",
      state: "QUEUED",
      idempotencyKey: "request-1",
      retryCount: 0,
      createdAt: "2026-08-09T00:00:00.000Z",
    })).not.toThrow();

    expect(() => AutomationExecutionSchema.parse({
      schemaVersion: 1,
      id: "execution-1",
      ruleId: "refresh-daily-brief",
      entityId: "brief-1",
      entityType: "DAILY_BRIEF",
      entityVersion: "v1",
      state: "UNKNOWN",
      idempotencyKey: "request-1",
      retryCount: 0,
      createdAt: "2026-08-09T00:00:00.000Z",
    })).toThrow();

    expect(canTransitionAutomationExecution("QUEUED", "RUNNING")).toBe(true);
    expect(canTransitionAutomationExecution("SUCCEEDED", "RUNNING")).toBe(false);
  });

  it("accepts the required immutable event envelope and rejects incomplete or future events", () => {
    const event = parseAutomationEventEnvelope({
      schemaVersion: 1,
      eventId: "event-1",
      eventType: "DAILY_BRIEF_STALE",
      entityType: "DAILY_BRIEF",
      entityId: "brief-1",
      entityVersion: "v1",
      userId: "user-1",
      timestamp: "2026-08-09T00:00:00.000Z",
      futureOptionalField: "ignored by the current reader",
    });

    expect(event).toMatchObject({ success: true, data: { eventId: "event-1" } });
    expect(parseAutomationEventEnvelope({
      schemaVersion: 1,
      eventType: "DAILY_BRIEF_STALE",
      entityType: "DAILY_BRIEF",
      entityId: "brief-1",
      entityVersion: "v1",
      userId: "user-1",
      timestamp: "2026-08-09T00:00:00.000Z",
    })).toMatchObject({ success: false, error: { code: "INVALID_SCHEMA" } });
    expect(parseAutomationEventEnvelope({
      schemaVersion: 2,
      eventId: "event-1",
      eventType: "DAILY_BRIEF_STALE",
      entityType: "DAILY_BRIEF",
      entityId: "brief-1",
      entityVersion: "v1",
      userId: "user-1",
      timestamp: "2026-08-09T00:00:00.000Z",
    })).toMatchObject({ success: false, error: { code: "UNSUPPORTED_VERSION" } });
  });
});
