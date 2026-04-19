import { describe, expect, it } from "vitest";

import { buildHistoryEntrySummaryPayload, renderHistoryEntrySummaryHtml } from "./history-entry-summary";

describe("history entry summary payload", () => {
  const formatDateTime = (value: number) => `ts:${value}`;
  const formatTwo = (value: number) => String(value).padStart(2, "0");
  const escapeHtml = (value: unknown) => String(value ?? "");

  it("builds a single-session summary with safe fallbacks", () => {
    const payload = buildHistoryEntrySummaryPayload({
      entries: [
        {
          ts: 1700000000000,
          ms: 3600000,
          note: "Deep focus block",
          completionDifficulty: 4,
        },
      ],
      formatDateTime,
      formatTwo,
      getEntryNote: (entry) => String(entry?.note || ""),
    });

    expect(payload).not.toBeNull();
    expect(payload?.titleText).toBe("Session Summary");
    expect(payload?.aggregate).toBeNull();
    expect(payload?.sessions).toHaveLength(1);
    expect(payload?.sessions[0]).toMatchObject({
      dateTimeText: "ts:1700000000000",
      noteText: "Deep focus block",
      sentimentText: "Somewhat Easy",
      timeGoalText: "Not tracked",
      xpText: "Not tracked",
    });
  });

  it("builds aggregate totals and preserves safe xp derivation when all sessions are known", () => {
    const payload = buildHistoryEntrySummaryPayload({
      entries: [
        {
          ts: 1700000000000,
          ms: 1800000,
          note: "",
          xpDisqualifiedUntilReset: true,
          completionDifficulty: 1,
        },
        {
          ts: 1699990000000,
          ms: 900000,
          note: "Quick wrap-up",
          xpDisqualifiedUntilReset: true,
          completionDifficulty: 5,
        },
      ],
      formatDateTime,
      formatTwo,
      getEntryNote: (entry) => String(entry?.note || ""),
    });

    expect(payload?.titleText).toBe("Session Summaries");
    expect(payload?.aggregate).toMatchObject({
      sessionCountText: "2 sessions",
      xpText: "0 XP",
      timeGoalText: "Not tracked",
    });
    expect(payload?.sessions[0].noteText).toBe("No session note.");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain("Session 1");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain("Quick wrap-up");
  });
});

