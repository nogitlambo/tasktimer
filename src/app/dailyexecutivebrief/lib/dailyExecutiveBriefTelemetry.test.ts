import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebaseTelemetry", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));

import { trackEvent } from "@/lib/firebaseTelemetry";
import { buildDailyExecutiveBriefTelemetryParams, trackDailyExecutiveBrief } from "./dailyExecutiveBriefTelemetry";

describe("Daily Executive Brief telemetry", () => {
  it("keeps analytics to approved buckets and excludes task content", () => {
    const params = buildDailyExecutiveBriefTelemetryParams("loaded", {
      planHealth: "SLIGHTLY_OVERLOADED",
      deadlineRisk: "WATCH",
      adjustmentType: "MOVE",
      reused: true,
      latencyMs: 120,
      errorCategory: "private task title should never be sent",
      taskTitle: "Review private notes",
      rawBrief: "Review private notes now",
    });
    expect(params).toEqual({ lifecycle_stage: "loaded", plan_health: "SLIGHTLY_OVERLOADED", deadline_risk: "WATCH", adjustment_type: "MOVE", reused: 1, latency_bucket: "under_300ms" });
    expect(JSON.stringify(params)).not.toMatch(/private|notes|rawBrief|taskTitle/i);
  });

  it("drops malformed values and emits only the lifecycle stage", () => {
    expect(buildDailyExecutiveBriefTelemetryParams("failed", { planHealth: "invented", deadlineRisk: "tomorrow", adjustmentType: "task title", latencyMs: -1, errorCategory: "secret" })).toEqual({ lifecycle_stage: "failed" });
  });

  it("uses the shared telemetry transport", async () => {
    await trackDailyExecutiveBrief("started", { planHealth: "REALISTIC" });
    expect(trackEvent).toHaveBeenCalledWith("daily_executive_brief_lifecycle", { lifecycle_stage: "started", plan_health: "REALISTIC" });
  });
});
