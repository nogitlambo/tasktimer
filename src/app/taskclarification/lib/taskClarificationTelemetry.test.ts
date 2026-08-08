import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/lib/firebaseTelemetry", () => ({ trackEvent }));

import { buildTaskClarificationTelemetryParams, trackTaskClarificationLifecycle } from "./taskClarificationTelemetry";

describe("task clarification telemetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps lifecycle telemetry to approved metadata and excludes task content", async () => {
    const params = buildTaskClarificationTelemetryParams("applied", {
      modelVersion: "gpt-5.6-terra",
      promptVersion: "task-clarification-v1",
      latencyMs: 2400,
      costBucket: "low",
      acceptedFieldCount: 2,
      selectedSubtaskCount: 3,
      title: "Write the secret launch plan",
      notes: "Do not send these notes anywhere",
      userInstruction: "Use my private context",
      providerPayload: { input: "generated text" },
    });

    expect(params).toEqual({
      lifecycle_stage: "applied",
      model_version: "gpt-5.6-terra",
      prompt_version: "task-clarification-v1",
      latency_bucket: "1_to_3_seconds",
      cost_bucket: "low",
      accepted_field_count: 2,
      selected_subtask_count: 3,
    });
    expect(JSON.stringify(params)).not.toContain("secret launch plan");
    expect(JSON.stringify(params)).not.toContain("private context");
    expect(JSON.stringify(params)).not.toContain("generated text");

    await trackTaskClarificationLifecycle("applied", {
      title: "Write the secret launch plan",
      userInstruction: "Use my private context",
      selectedSubtaskCount: 3,
    });
    expect(trackEvent).toHaveBeenCalledWith("task_clarification_lifecycle", {
      lifecycle_stage: "applied",
      selected_subtask_count: 3,
    });
  });

  it("normalizes errors to categories rather than recording provider or user text", () => {
    expect(
      buildTaskClarificationTelemetryParams("failed", {
        errorCategory: "provider_failure: secret provider response",
        errorMessage: "The task title and raw model output must never be captured",
      })
    ).toEqual({ lifecycle_stage: "failed", error_category: "provider_failure" });
  });
});
