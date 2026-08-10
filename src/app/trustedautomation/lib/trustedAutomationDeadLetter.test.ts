import { describe, expect, it } from "vitest";

import { createAutomationDeadLetter, resolveAutomationDeadLetter } from "./trustedAutomationDeadLetter";

describe("Trusted Automation dead letters", () => {
  it("preserves an audit reference and blocks implicit replay", () => {
    const item = createAutomationDeadLetter({
      id: "dead-1",
      userId: "user-1",
      executionId: "execution-1",
      ruleId: "REFRESH_DAILY_BRIEF",
      entityType: "DAILY_BRIEF",
      entityId: "brief-1",
      entityVersion: "v1",
      reasonCode: "RETRY_EXHAUSTED",
      auditHistoryId: "execution-1:history",
      failedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(resolveAutomationDeadLetter(item)).toEqual({
      state: "BLOCKED",
      requiresManualReview: true,
      canReplayAutomatically: false,
      auditHistoryId: "execution-1:history",
    });
    expect(JSON.stringify(item)).not.toContain("title");
  });
});
