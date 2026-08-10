import { describe, expect, it } from "vitest";

import {
  buildPrivacySafeTrustAnalyticsEvent,
  evaluateTrustRecommendation,
} from "./trustedAutomationTrust";

const nowMs = Date.parse("2026-08-09T00:00:00.000Z");

function observation(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: "REFRESH_DAILY_BRIEF" as const,
    outcome: "SUCCESS" as const,
    accepted: true,
    createdAtMs: nowMs - 60_000,
    ...overrides,
  };
}

describe("Trusted Automation trust recommendations", () => {
  it("recommends promotion only after repeated accepted low-risk successes", () => {
    const result = evaluateTrustRecommendation({
      ruleId: "REFRESH_DAILY_BRIEF",
      currentTrustLevel: "ASSISTED",
      observations: [observation(), observation({ createdAtMs: nowMs - 120_000 }), observation({ createdAtMs: nowMs - 180_000 })],
      nowMs,
    });

    expect(result).toMatchObject({ kind: "PROMOTE", suggestedTrustLevel: "TRUSTED", acceptedSuccessCount: 3, advisoryOnly: true, requiresUserAction: true });
  });

  it.each([
    ["failure", { outcome: "FAILED" as const }],
    ["undo", { undoUsed: true }],
    ["stale conflict", { staleConflict: true }],
    ["rejection", { rejected: true }],
  ])("suppresses promotion after a recent %s", (_label, negative) => {
    const result = evaluateTrustRecommendation({
      ruleId: "REFRESH_DAILY_BRIEF",
      currentTrustLevel: "ASSISTED",
      observations: [observation(), observation({ createdAtMs: nowMs - 120_000 }), observation({ createdAtMs: nowMs - 180_000 }), observation(negative)],
      nowMs,
    });

    expect(result.kind).toBe("NONE");
  });

  it("recommends reducing Trusted to Assisted after repeated negative outcomes", () => {
    const result = evaluateTrustRecommendation({
      ruleId: "REFRESH_DAILY_BRIEF",
      currentTrustLevel: "TRUSTED",
      observations: [
        observation({ outcome: "FAILED", accepted: false }),
        observation({ outcome: "FAILED", accepted: false, createdAtMs: nowMs - 120_000, staleConflict: true }),
      ],
      nowMs,
    });

    expect(result).toMatchObject({ kind: "REDUCE", suggestedTrustLevel: "ASSISTED", negativeCount: 2, advisoryOnly: true });
    expect(result.reasonCodes).toContain("FAILURE_THRESHOLD_MET");
  });

  it("keeps recommendations deterministic and analytics content-free", () => {
    const result = evaluateTrustRecommendation({
      ruleId: "REFRESH_DAILY_BRIEF",
      currentTrustLevel: "ASSISTED",
      observations: [observation({ createdAtMs: nowMs + 1 })],
      nowMs,
    });
    const analytics = buildPrivacySafeTrustAnalyticsEvent({
      eventName: "trusted_automation_recommendation_shown",
      ruleCategory: "REFRESH_DAILY_BRIEF",
      count: result.acceptedSuccessCount,
      durationMs: 999_999_999,
      reasonCodes: ["AUTO_REFRESH", "SUCCESS"],
    });

    expect(result.kind).toBe("NONE");
    expect(analytics.durationMs).toBe(86_400_000);
    expect(JSON.stringify(analytics)).not.toContain("title");
    expect(JSON.stringify(analytics)).not.toContain("prompt");
  });
});
