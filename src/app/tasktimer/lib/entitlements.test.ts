import { describe, expect, it } from "vitest";
import {
  getTaskTimerEntitlements,
  hasTaskTimerEntitlement,
  isTaskTimerPlusPlan,
  normalizeTaskTimerPlan,
} from "./entitlements";

describe("TaskTimer entitlements", () => {
  it("preserves cadence-specific PLUS plan values", () => {
    expect(normalizeTaskTimerPlan("plus_monthly")).toBe("plus_monthly");
    expect(normalizeTaskTimerPlan("plus_yearly")).toBe("plus_yearly");
  });

  it("recognizes cadence-specific PLUS plans as paid plans", () => {
    expect(isTaskTimerPlusPlan("plus_monthly")).toBe(true);
    expect(isTaskTimerPlusPlan("plus_yearly")).toBe(true);
    expect(hasTaskTimerEntitlement("plus_monthly", "executiveFunction")).toBe(true);
    expect(hasTaskTimerEntitlement("plus_yearly", "advancedInsights")).toBe(true);
  });

  it("keeps cadence-specific PLUS plans on the full PLUS entitlement set", () => {
    expect(getTaskTimerEntitlements("plus_monthly")).toEqual(getTaskTimerEntitlements("plus"));
    expect(getTaskTimerEntitlements("plus_yearly")).toEqual(getTaskTimerEntitlements("plus"));
  });
});
