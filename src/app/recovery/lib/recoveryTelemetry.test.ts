import { describe, expect, it } from "vitest";

import { buildRecoveryTelemetryParams } from "./recoveryTelemetry";

describe("Recovery telemetry", () => {
  it("keeps lifecycle analytics bucketed and free of task content", () => {
    const params = buildRecoveryTelemetryParams("partially_applied", { triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED", "not-safe"], backlogCount: 14, overdueCount: 4, urgentCount: 2, flexibleCount: 6, actionCount: 8, selectedCount: 3, appliedCount: 2, staleCount: 1, capacityMax: 60, taskTitle: "private title", notes: "private notes" });

    expect(params).toMatchObject({ lifecycle_stage: "partially_applied", trigger_codes: "BACKLOG_THRESHOLD_EXCEEDED", backlog_count_bucket: "9_to_15", applied_count: 2, stale_count: 1 });
    expect(JSON.stringify(params)).not.toContain("private");
    expect(params).not.toHaveProperty("taskTitle");
    expect(params).not.toHaveProperty("notes");
  });
});
