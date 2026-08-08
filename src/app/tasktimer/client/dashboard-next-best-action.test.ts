import { describe, expect, it } from "vitest";

import {
  formatNextBestActionDuration,
  getNextBestActionTimeOptions,
  parseNextBestActionDashboardResponse,
} from "./dashboard-next-best-action";

describe("dashboard Next Best Action contract", () => {
  it("accepts a safe recommendation response and formats its duration", () => {
    const result = parseNextBestActionDashboardResponse(
      {
        ok: true,
        recommendation: {
          recommendationId: "recommendation-1",
          type: "NEXT_BEST_ACTION",
          taskId: "task-1",
          title: "Prepare launch notes",
          firstAction: "Open the outline",
          estimatedMinutes: 20,
          durationSource: "HISTORICAL_ESTIMATE",
          confidence: "high",
          reasonCodes: ["DUE_SOON"],
          explanation: "It is due soon.",
          createdAt: "2026-08-07T09:00:00.000Z",
          expiresAt: "2026-08-07T09:30:00.000Z",
        },
      },
      Date.parse("2026-08-07T09:10:00.000Z")
    );

    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.recommendation.title).toBe("Prepare launch notes");
    expect(formatNextBestActionDuration(result.recommendation)).toBe("20m · historical estimate");
  });

  it("turns absent and expired responses into explicit dashboard states", () => {
    expect(parseNextBestActionDashboardResponse({ ok: true, recommendation: null }, Date.now())).toEqual({ kind: "empty" });
    expect(
      parseNextBestActionDashboardResponse(
        { ok: true, recommendation: { recommendationId: "r", type: "NEXT_BEST_ACTION", taskId: "t", title: "Task", estimatedMinutes: 10, expiresAt: "2026-08-07T09:00:00.000Z" } },
        Date.parse("2026-08-07T09:01:00.000Z")
      )
    ).toEqual({ kind: "stale" });
  });

  it("keeps available-time choices bounded and deterministic", () => {
    expect(getNextBestActionTimeOptions()).toEqual([10, 20, 30, 60, null]);
  });
});
