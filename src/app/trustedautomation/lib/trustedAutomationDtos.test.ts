import { describe, expect, it } from "vitest";

import {
  ExecuteAutomationRequestSchema,
  ExecuteAutomationResponseSchema,
} from "./trustedAutomationDtos";

describe("Trusted Automation transport DTOs", () => {
  it("validates an execute request without accepting client-owned identity", () => {
    const parsed = ExecuteAutomationRequestSchema.parse({
      ruleId: "refresh-daily-brief",
      entityId: "brief-1",
      entityVersion: "v1",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });

    expect(parsed).toEqual({
      ruleId: "refresh-daily-brief",
      entityId: "brief-1",
      entityVersion: "v1",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });
    expect(() => ExecuteAutomationRequestSchema.parse({
      ruleId: "refresh-daily-brief",
      entityId: "brief-1",
      entityVersion: "v1",
      idempotencyKey: "not-a-uuid",
      userId: "spoofed-user",
    })).toThrow();
  });

  it("keeps the execute response limited to the public execution identity and state", () => {
    expect(ExecuteAutomationResponseSchema.parse({
      executionId: "execution-1",
      state: "QUEUED",
    })).toEqual({ executionId: "execution-1", state: "QUEUED" });
  });
});
