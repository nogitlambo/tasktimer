import { describe, expect, it } from "vitest";

import {
  evaluateTrustedAutomationRollout,
  loadTrustedAutomationRolloutPolicy,
  validateTrustedAutomationRollback,
} from "./trustedAutomationRollout";

function env(overrides: Record<string, unknown> = {}) {
  return {
    TRUSTED_AUTOMATION_ENABLED: "true",
    TRUSTED_AUTOMATION_RULE_FLAGS: JSON.stringify({ REFRESH_DAILY_BRIEF: { enabled: true, cohort: "INTERNAL" } }),
    ...overrides,
  };
}

describe("Trusted Automation rollout controls", () => {
  it("fails closed by default and enables only the configured internal cohort", () => {
    const disabled = loadTrustedAutomationRolloutPolicy({});
    expect(evaluateTrustedAutomationRollout({ uid: "internal-1", ruleId: "REFRESH_DAILY_BRIEF", policy: disabled }).reason).toBe("GLOBAL_DISABLED");

    const policy = loadTrustedAutomationRolloutPolicy(env({ TRUSTED_AUTOMATION_INTERNAL_UIDS: "internal-1" }));
    expect(evaluateTrustedAutomationRollout({ uid: "internal-1", ruleId: "REFRESH_DAILY_BRIEF", policy })).toMatchObject({ enabled: true, cohort: "INTERNAL" });
    expect(evaluateTrustedAutomationRollout({ uid: "other-1", ruleId: "REFRESH_DAILY_BRIEF", policy })).toMatchObject({ enabled: false, reason: "COHORT_NOT_ELIGIBLE" });
  });

  it("supports kill switches and rejects malformed rule flag configuration", () => {
    const policy = loadTrustedAutomationRolloutPolicy(env({ TRUSTED_AUTOMATION_INTERNAL_UIDS: "internal-1", TRUSTED_AUTOMATION_KILL_SWITCH: "true", TRUSTED_AUTOMATION_RULE_FLAGS: "not-json" }));
    expect(evaluateTrustedAutomationRollout({ uid: "internal-1", ruleId: "REFRESH_DAILY_BRIEF", policy })).toMatchObject({ enabled: false, reason: "KILL_SWITCH" });
    expect(policy.rules.REFRESH_DAILY_BRIEF.enabled).toBe(false);
  });

  it("requires all launch gates before rollback readiness is declared", () => {
    expect(validateTrustedAutomationRollback({ legacyReadersSafe: true, existingExecutiveFunctionSafe: true, indexesReady: true, alertsReady: true }).ready).toBe(true);
    expect(validateTrustedAutomationRollback({ legacyReadersSafe: true, existingExecutiveFunctionSafe: false, indexesReady: true, alertsReady: true }).ready).toBe(false);
  });
});
