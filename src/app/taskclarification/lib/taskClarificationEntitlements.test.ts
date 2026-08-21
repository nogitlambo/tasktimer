import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_CLARIFICATION_FREE_QUOTA,
  DEFAULT_TASK_CLARIFICATION_PLUS_QUOTA,
  getTaskClarificationQuota,
  normalizeTaskClarificationPlan,
} from "./taskClarificationEntitlements";

describe("task clarification entitlements", () => {
  beforeEach(() => {
    delete process.env.TASK_CLARIFICATION_FREE_QUOTA;
    delete process.env.TASK_CLARIFICATION_PLUS_QUOTA;
  });

  afterEach(() => {
    delete process.env.TASK_CLARIFICATION_FREE_QUOTA;
    delete process.env.TASK_CLARIFICATION_PLUS_QUOTA;
  });

  it("maps cadence-specific PLUS plans to the PLUS quota tier", () => {
    expect(normalizeTaskClarificationPlan("plus_monthly")).toBe("plus");
    expect(normalizeTaskClarificationPlan("plus_yearly")).toBe("plus");
    expect(getTaskClarificationQuota(normalizeTaskClarificationPlan("plus_monthly"))).toBe(DEFAULT_TASK_CLARIFICATION_PLUS_QUOTA);
    expect(getTaskClarificationQuota(normalizeTaskClarificationPlan("plus_yearly"))).toBe(DEFAULT_TASK_CLARIFICATION_PLUS_QUOTA);
  });

  it("keeps unsupported plans on the free quota tier", () => {
    expect(normalizeTaskClarificationPlan("enterprise")).toBe("free");
    expect(getTaskClarificationQuota(normalizeTaskClarificationPlan("enterprise"))).toBe(DEFAULT_TASK_CLARIFICATION_FREE_QUOTA);
  });
});
