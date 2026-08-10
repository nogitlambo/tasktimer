import { describe, expect, it, vi } from "vitest";

import { loadExecutiveData } from "./executive-data";

describe("loadExecutiveData", () => {
  it("keeps independent section results when one Executive service fails", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/recommendations/next-best-action")) return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
      if (url.includes("/api/daily-executive-brief")) {
        return new Response(JSON.stringify({ ok: true, brief: {
          date: "2026-08-10",
          status: "READY",
          plan: { planHealth: "REALISTIC", deadlineRisk: "LOW", remainingMinutes: 40, realisticWorkloadRange: { minMinutes: 30, maxMinutes: 60 }, plannedMinutes: 60, completedMinutes: 20, adjustments: [] },
          summary: "Plan is realistic.",
          nextBestAction: null,
          clarificationTaskIds: [],
          expiresAt: "2026-08-10T18:00:00.000Z",
        } }), { status: 200 });
      }
      if (url.includes("/api/executive-function/capacity/today")) return new Response(JSON.stringify({ ok: true, snapshot: {
        localDate: "2026-08-10", remainingRange: { min: 30, max: 60 }, state: "STANDARD", confidence: "HIGH", primarySource: "DEFAULT", sourceSignals: [], completedMinutesToday: 20, availableMinutesCeiling: null, manualOverride: null,
      } }), { status: 200 });
      if (url.includes("/api/executive-function/schedule-repair")) return new Response(JSON.stringify({ ok: true, proposal: null }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, empty: true }), { status: 200 });
    });

    const result = await loadExecutiveData({
      fetchImpl,
      getIdToken: async () => "token",
      timezone: "Australia/Sydney",
      nowMs: () => Date.parse("2026-08-10T09:00:00.000Z"),
    });

    expect(result.brief.status).toBe("ready");
    expect(result.capacity.status).toBe("ready");
    expect(result.nba.status).toBe("error");
    expect(result.repair.status).toBe("empty");
    expect(result.recovery.status).toBe("empty");
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("/api/recommendations/next-best-action"), expect.anything());
  });
});
