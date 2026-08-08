import { describe, expect, it } from "vitest";

import { parseRecommendationEnvelope } from "./recommendationContract";

describe("shared recommendation contract", () => {
  it("defaults a legacy record without a type to Task Clarification", () => {
    const parsed = parseRecommendationEnvelope({
      id: "recommendation-1",
      userId: "uid-1",
      taskId: "task-1",
      status: "ACTIVE",
      createdAt: "2026-08-07T00:00:00.000Z",
      expiresAt: "2026-08-08T00:00:00.000Z",
    });

    expect(parsed).toMatchObject({
      id: "recommendation-1",
      userId: "uid-1",
      type: "TASK_CLARIFICATION",
    });
  });
});
