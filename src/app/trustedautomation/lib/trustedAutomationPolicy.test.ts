import { describe, expect, it } from "vitest";

import {
  applyAutomationSettingsPatch,
  createDefaultAutomationSettings,
  evaluateAutomationPolicy,
} from "./trustedAutomationPolicy";

describe("Trusted Automation policy", () => {
  it("creates a versioned fail-safe policy for every supported rule", () => {
    const settings = createDefaultAutomationSettings("user-1", 0);

    expect(settings).toMatchObject({
      userId: "user-1",
      schemaVersion: 1,
      automationEnabled: false,
      consentGranted: false,
      pauseAll: false,
    });
    expect(settings.rules).toHaveLength(8);
    expect(settings.rules.every((rule) => rule.enabled === false && rule.trustLevel === "ASSISTED")).toBe(true);
    expect(evaluateAutomationPolicy(settings, { ruleId: "REFRESH_DAILY_BRIEF" })).toMatchObject({
      allowed: false,
      reason: "AUTOMATION_DISABLED",
    });
  });

  it("requires consent and the rule's server policy before allowing execution", () => {
    const defaults = createDefaultAutomationSettings("user-1", 0);
    const enabled = applyAutomationSettingsPatch(defaults, {
      automationEnabled: true,
      consentGranted: true,
      rules: [{ ruleId: "REFRESH_DAILY_BRIEF", enabled: true, trustLevel: "TRUSTED" }],
    }, 1);

    expect(evaluateAutomationPolicy(enabled, { ruleId: "REFRESH_DAILY_BRIEF" })).toMatchObject({
      allowed: true,
      trustLevel: "TRUSTED",
      requiresConfirmation: false,
    });
    expect(evaluateAutomationPolicy(enabled, { ruleId: "REFRESH_CAPACITY_SNAPSHOT" })).toMatchObject({
      allowed: false,
      reason: "RULE_DISABLED",
    });
  });

  it("keeps ASSISTED rules confirmation-gated and pause-all blocks new execution", () => {
    const defaults = createDefaultAutomationSettings("user-1", 0);
    const assisted = applyAutomationSettingsPatch(defaults, {
      automationEnabled: true,
      consentGranted: true,
      rules: [{ ruleId: "REFRESH_DAILY_BRIEF", enabled: true, trustLevel: "ASSISTED" }],
    }, 1);

    expect(evaluateAutomationPolicy(assisted, { ruleId: "REFRESH_DAILY_BRIEF" })).toMatchObject({
      allowed: true,
      requiresConfirmation: true,
      trustLevel: "ASSISTED",
    });
    const paused = applyAutomationSettingsPatch(assisted, { pauseAll: true }, 2);
    expect(evaluateAutomationPolicy(paused, { ruleId: "REFRESH_DAILY_BRIEF" })).toMatchObject({
      allowed: false,
      reason: "PAUSED",
    });
    expect(paused.rules).toEqual(assisted.rules);
  });

  it("withdraws consent without deleting rule settings and fails closed for unsupported rules", () => {
    const defaults = createDefaultAutomationSettings("user-1", 0);
    const enabled = applyAutomationSettingsPatch(defaults, {
      automationEnabled: true,
      consentGranted: true,
      rules: [{ ruleId: "REFRESH_DAILY_BRIEF", enabled: true, trustLevel: "TRUSTED" }],
    }, 1);
    const withdrawn = applyAutomationSettingsPatch(enabled, { consentGranted: false }, 2);

    expect(withdrawn.rules).toEqual(enabled.rules);
    expect(evaluateAutomationPolicy(withdrawn, { ruleId: "REFRESH_DAILY_BRIEF" })).toMatchObject({
      allowed: false,
      reason: "CONSENT_REQUIRED",
    });
    expect(evaluateAutomationPolicy(withdrawn, { ruleId: "DELETE_TASK" as never })).toMatchObject({
      allowed: false,
      reason: "UNSUPPORTED_RULE",
    });
  });

  it("does not permit a trust upgrade while consent is absent", () => {
    const defaults = createDefaultAutomationSettings("user-1", 0);

    expect(() => applyAutomationSettingsPatch(defaults, {
      rules: [{ ruleId: "REFRESH_DAILY_BRIEF", enabled: true, trustLevel: "TRUSTED" }],
    }, 1)).toThrow("Consent is required");
  });
});
