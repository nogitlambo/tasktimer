import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatAutomationHistoryDate, formatAutomationReasonCodes } from "./TrustedAutomationSettingsPane";

describe("TrustedAutomationSettingsPane helpers", () => {
  it("formats structured reason codes without exposing entity content", () => {
    expect(formatAutomationReasonCodes(["AUTO_REFRESH", "SUCCESS"])).toBe("AUTO_REFRESH, SUCCESS");
    expect(formatAutomationReasonCodes([])).toBe("No reason recorded");
  });

  it("formats valid timestamps and safely handles malformed history timestamps", () => {
    expect(formatAutomationHistoryDate("not-a-date")).toBe("Unknown time");
    expect(formatAutomationHistoryDate("2026-01-02T03:04:05.000Z")).not.toBe("Unknown time");
  });

  it("keeps Trusted Automation settings behind the executive function entitlement before API fetches", () => {
    const source = readFileSync(resolve(__dirname, "TrustedAutomationSettingsPane.tsx"), "utf8");

    expect(source).toContain('hasTaskTimerEntitlement(readTaskTimerPlanFromStorage(), "executiveFunction")');
    expect(source).toContain("Upgrade to PLUS to use executive function features.");
    expect(source.indexOf("if (!canUseExecutiveFunction)")).toBeLessThan(source.indexOf('fetch(getApiUrl("/api/automation/settings")'));
  });

  it("uses a single OFF ASSISTED TRUSTED pill control for each rule", () => {
    const source = readFileSync(resolve(__dirname, "TrustedAutomationSettingsPane.tsx"), "utf8");

    expect(source).toContain('(["OFF", "ASSISTED", "TRUSTED"] as const)');
    expect(source).toContain("settingsTrustedAutomationModePill");
    expect(source).not.toContain("settingsTrustedAutomationTrustLabel");
    expect(source).not.toContain('role="switch"\\n                    aria-label={`${rule.enabled ? "Disable" : "Enable"} ${getRuleLabel(rule.ruleId)}`');
  });
});
