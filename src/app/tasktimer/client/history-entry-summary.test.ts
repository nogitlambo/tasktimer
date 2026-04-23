import { describe, expect, it } from "vitest";

import { buildHistoryEntrySummaryPayload, renderHistoryEntrySummaryHtml } from "./history-entry-summary";

describe("history entry summary payload", () => {
  const formatDateTime = (value: number) => `ts:${value}`;
  const formatTwo = (value: number) => String(value).padStart(2, "0");
  const escapeHtml = (value: unknown) => String(value ?? "");

  it("builds a single-session summary with safe fallbacks", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      entries: [
        {
          ts: 1700000000000,
          ms: 3600000,
          name: "Deep Work",
          note: "Deep focus block",
          completionDifficulty: 4,
        },
      ],
      formatDateTime,
      formatTwo,
      getEntryNote: (entry) => String(entry?.note || ""),
    });

    expect(payload).not.toBeNull();
    expect(payload?.titleText).toBe("Deep Work");
    expect(payload?.aggregate).toBeNull();
    expect(payload?.sessions).toHaveLength(1);
    expect(payload?.sessions[0]).toMatchObject({
      taskId: "task-1",
      name: "Deep Work",
      dateTimeText: "ts:1700000000000",
      noteText: "Deep focus block",
      sentimentText: "Somewhat Easy",
      timeGoalText: "Not tracked",
      xpText: "Not tracked",
    });
    const html = renderHistoryEntrySummaryHtml(payload!, escapeHtml);
    expect(html).not.toContain("Activity Summary");
    expect(html).toContain("Session 1");
    expect(html).toContain("Deep focus block");
    expect(html).toContain('data-history-summary-action="delete-session"');
    expect(html).toContain('data-history-summary-task-id="task-1"');
    expect(html).toContain('data-history-summary-ts="1700000000000"');
    expect(html).toContain('data-history-summary-ms="3600000"');
    expect(html).toContain('data-history-summary-name="Deep Work"');
  });

  it("builds aggregate totals and preserves safe xp derivation when all sessions are known", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      entries: [
        {
          ts: 1700000000000,
          ms: 1800000,
          name: "Deep Work",
          note: "",
          completionDifficulty: 1,
        },
        {
          ts: 1699990000000,
          ms: 900000,
          name: "Deep Work",
          note: "Quick wrap-up",
          completionDifficulty: 5,
        },
      ],
      formatDateTime,
      formatTwo,
      getEntryNote: (entry) => String(entry?.note || ""),
    });

    expect(payload?.titleText).toBe("Deep Work");
    expect(payload?.aggregate).toMatchObject({
      sessionCountText: "2 sessions",
      xpText: "Not tracked",
      timeGoalText: "Not tracked",
    });
    expect(payload?.sessions[0].noteText).toBe("No session note.");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain("Activity Summary");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain("Session 1");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain("Quick wrap-up");
    expect(renderHistoryEntrySummaryHtml(payload!, escapeHtml)).toContain('data-history-summary-action="delete-session"');
  });
});

