import { describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/firebaseTelemetry", () => ({ trackEvent }));

import { buildDailyCapacityTelemetryParams, trackDailyCapacity } from "./dailyCapacityTelemetry";

describe("daily capacity telemetry", () => {
  it("keeps only aggregate allowlisted values", () => {
    const params = buildDailyCapacityTelemetryParams("viewed", {
      state: "STANDARD", confidence: "HIGH", primarySource: "WEEKDAY_HISTORY",
      sourceSignals: ["WEEKDAY_HISTORY", "DEFAULT_BASELINE", "task title must not escape", "TODAY_COMPLETED_WORK"],
      sampleSize: 12, remainingMin: 20, remainingMax: 90,
      errorCategory: "Error: private task title",
    });
    expect(params).toEqual({
      lifecycle_stage: "viewed", capacity_state: "STANDARD", confidence: "HIGH", primary_source: "WEEKDAY_HISTORY",
      reason_codes: "WEEKDAY_HISTORY,DEFAULT_BASELINE,TODAY_COMPLETED_WORK", sample_size_bucket: "7_to_13",
      remaining_min_bucket: "1_to_30", remaining_max_bucket: "61_to_120",
    });
    expect(JSON.stringify(params)).not.toContain("private");
  });

  it("uses the shared telemetry transport", async () => {
    await trackDailyCapacity("override_set", { overrideType: "MINUTES" });
    expect(trackEvent).toHaveBeenCalledWith("daily_capacity_lifecycle", { lifecycle_stage: "override_set", override_type: "MINUTES" });
  });
});
