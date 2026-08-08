import { describe, expect, it } from "vitest";

import { buildScheduleRepairTelemetryParams } from "./scheduleRepairTelemetry";

describe("Schedule Repair telemetry", () => {
  it("keeps analytics categorical and free of task content or identifiers", () => {
    expect(buildScheduleRepairTelemetryParams("applied", { actionCount: 3, selectedCount: 2, appliedCount: 1, planHealth: "SLIGHTLY_OVERLOADED", taskId: "private-task", title: "private title" } as never)).toEqual({ lifecycle_stage: "applied", plan_health: "SLIGHTLY_OVERLOADED", action_count: 3, selected_count: 2, applied_count: 1 });
  });

  it("drops invalid and unbounded values", () => {
    expect(buildScheduleRepairTelemetryParams("failed", { actionCount: 999, staleCount: -1, errorCategory: "private-error" })).toEqual({ lifecycle_stage: "failed" });
  });
});
