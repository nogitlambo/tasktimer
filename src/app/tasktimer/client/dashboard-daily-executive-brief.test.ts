import { describe, expect, it } from "vitest";

import { parseBriefResponse } from "./dashboard-daily-executive-brief";

const plan = {
  planHealth: "SLIGHTLY_OVERLOADED",
  deadlineRisk: "WATCH",
  plannedMinutes: 90,
  completedMinutes: 10,
  remainingMinutes: 80,
  realisticWorkloadRange: { minMinutes: 45, maxMinutes: 60 },
  adjustments: [{ adjustmentId: "MOVE%3Atask-2", taskId: "task-2", type: "MOVE", status: "ACTIVE", explanation: "Move this flexible task later." }],
};

describe("Daily Executive Brief dashboard parser", () => {
  it("accepts safe loaded brief facts and strips unsupported detail", () => {
    const parsed = parseBriefResponse({ ok: true, brief: { status: "READY", date: "2026-08-07", plan, summary: "A concise brief", nextBestAction: { recommendationId: "rec-1", taskId: "task-1", title: "Start launch", firstAction: "Open checklist", estimatedMinutes: 15 }, expiresAt: "2026-08-07T15:00:00.000Z", ignored: "not rendered" } }, Date.parse("2026-08-07T10:00:00Z"));
    expect(parsed).toMatchObject({ kind: "brief", brief: { status: "READY", plan, nextBestAction: { recommendationId: "rec-1", taskId: "task-1" } } });
  });

  it("returns stale for expired snapshots and invalid for malformed responses", () => {
    expect(parseBriefResponse({ ok: true, brief: { status: "READY", expiresAt: "2026-08-07T09:00:00.000Z", plan } }, Date.parse("2026-08-07T10:00:00Z")).kind).toBe("stale");
    expect(parseBriefResponse({ ok: true, brief: { status: "READY" } }).kind).toBe("invalid");
  });
});
