import { describe, expect, it } from "vitest";

import { createNoSafeScheduleRepairResult, deriveScheduleRepairPlanHealth, evaluateScheduleRepair, resolveScheduleRepairCapacity } from "./scheduleRepairPlanning";

const adaptiveCapacity = {
  remainingRange: { min: 50, max: 65 },
  state: "STANDARD" as const,
  confidence: "HIGH" as const,
  primarySource: "WEEKDAY_HISTORY" as const,
  manualOverride: null,
};

describe("Schedule Repair planning contract", () => {
  it("uses Adaptive Daily Capacity as the authoritative source", () => {
    const capacity = resolveScheduleRepairCapacity({ adaptiveCapacity, dailyBriefFallbackRange: { min: 30, max: 40 } });
    expect(capacity).toMatchObject({ source: "ADAPTIVE_CAPACITY", remainingRange: { min: 50, max: 65 }, primarySource: "WEEKDAY_HISTORY" });
  });

  it("falls back to the Daily Brief range and then product default", () => {
    expect(resolveScheduleRepairCapacity({ dailyBriefFallbackRange: { min: 30, max: 40 } })).toMatchObject({ source: "DAILY_EXECUTIVE_BRIEF_FALLBACK", remainingRange: { min: 30, max: 40 } });
    expect(resolveScheduleRepairCapacity({})).toMatchObject({ source: "PRODUCT_DEFAULT", remainingRange: { min: 45, max: 60 } });
  });

  it("classifies realistic, slightly overloaded, severe, and insufficient plans", () => {
    expect(deriveScheduleRepairPlanHealth({ activeTaskCount: 1, knownDurationTaskCount: 1, remainingPlannedMinutes: 60, capacityMax: 60 })).toBe("REALISTIC");
    expect(deriveScheduleRepairPlanHealth({ activeTaskCount: 1, knownDurationTaskCount: 1, remainingPlannedMinutes: 61, capacityMax: 60 })).toBe("SLIGHTLY_OVERLOADED");
    expect(deriveScheduleRepairPlanHealth({ activeTaskCount: 1, knownDurationTaskCount: 1, remainingPlannedMinutes: 91, capacityMax: 60 })).toBe("SIGNIFICANTLY_OVERLOADED");
    expect(deriveScheduleRepairPlanHealth({ activeTaskCount: 1, knownDurationTaskCount: 0, remainingPlannedMinutes: 90, capacityMax: 60 })).toBe("INSUFFICIENT_DATA");
  });

  it("emits stable trigger and reason codes for a materially changed plan", () => {
    const result = evaluateScheduleRepair({
      localDate: "2026-08-08",
      activeTaskCount: 3,
      knownDurationTaskCount: 3,
      remainingPlannedMinutes: 110,
      adaptiveCapacity: { ...adaptiveCapacity, state: "REDUCED" },
      currentAvailableMinutes: 50,
      previousAvailableMinutes: 90,
      previousCapacityMax: 90,
      triggerHints: { taskOverranEstimate: true, deadlineAtRisk: true, manualRefresh: true },
    });

    expect(result.outcome).toBe("REPAIR_REQUIRED");
    expect(result.planHealthBefore).toBe("SIGNIFICANTLY_OVERLOADED");
    expect(result.triggerCodes).toEqual([
      "PLAN_OVERLOADED", "PLAN_SIGNIFICANTLY_OVERLOADED", "AVAILABLE_TIME_REDUCED", "CAPACITY_REDUCED",
      "TASK_OVERRAN_ESTIMATE", "DEADLINE_AT_RISK", "MANUAL_REFRESH",
    ]);
    expect(result.reasonCodes).toEqual(["TODAY_SIGNIFICANTLY_OVERLOADED", "CAPACITY_REDUCED", "AVAILABLE_TIME_REDUCED"]);
  });

  it("does not request repair when the plan is realistic or lacks duration data", () => {
    expect(evaluateScheduleRepair({ localDate: "2026-08-08", activeTaskCount: 1, knownDurationTaskCount: 1, remainingPlannedMinutes: 30, adaptiveCapacity }).outcome).toBe("NO_REPAIR_NEEDED");
    expect(evaluateScheduleRepair({ localDate: "2026-08-08", activeTaskCount: 1, knownDurationTaskCount: 0, remainingPlannedMinutes: 30, adaptiveCapacity }).outcome).toBe("INSUFFICIENT_DATA");
  });

  it("represents a deterministic no-safe-solution fallback", () => {
    const evaluated = evaluateScheduleRepair({ localDate: "2026-08-08", activeTaskCount: 2, knownDurationTaskCount: 2, remainingPlannedMinutes: 100, adaptiveCapacity });
    const result = createNoSafeScheduleRepairResult(evaluated);
    expect(result.outcome).toBe("NO_SAFE_SOLUTION");
    expect(result.reasonCodes).toContain("NO_SAFE_MOVE_AVAILABLE");
  });
});
