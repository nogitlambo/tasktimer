import { describe, expect, it } from "vitest";

import { executeAutomationRequest } from "./trustedAutomationApiService";

describe("Trusted Automation API service", () => {
  it("redacts provider diagnostics before returning a failed execution", async () => {
    const result = await executeAutomationRequest({
      uid: "user-1",
      settings: {} as never,
      request: {} as never,
      handler: async () => ({
        kind: "FAILED" as const,
        execution: {
          schemaVersion: 1 as const,
          id: "execution-1",
          ruleId: "refresh-daily-brief",
          entityId: "brief-1",
          entityType: "DAILY_BRIEF" as const,
          entityVersion: "v1",
          state: "FAILED" as const,
          idempotencyKey: "request-1",
          retryCount: 0,
          createdAt: "2026-08-09T00:00:00.000Z",
          error: { category: "DEPENDENCY" as const, code: "DEPENDENCY_UNAVAILABLE" as const, message: "provider prompt and response" },
        },
      }),
    });

    expect(result).toMatchObject({ kind: "FAILED", execution: { error: { message: "Automation dependency unavailable." } } });
    expect(JSON.stringify(result)).not.toContain("provider prompt");
  });
});
