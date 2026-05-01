import { describe, expect, it } from "vitest";

import { buildHistoryEntrySummaryPayload, renderHistoryEntrySummaryHtml } from "./history-entry-summary";
import type { RewardProgressV1 } from "../lib/rewards";
import type { Task } from "../lib/types";

describe("history entry summary payload", () => {
  const formatDateTime = (value: number) => `ts:${value}`;
  const formatTwo = (value: number) => String(value).padStart(2, "0");
  const escapeHtml = (value: unknown) => String(value ?? "");
  const task: Task = {
    id: "task-1",
    name: "Deep Work",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
  };
  const rewardProgress: RewardProgressV1 = {
    totalXp: 16,
    totalXpPrecise: 16,
    currentRankId: "unranked",
    lastAwardedAt: 1700000000000,
    completedSessions: 1,
    awardLedger: [
      {
        ts: 1700000000000,
        dayKey: "2023-11-14",
        taskId: "task-1",
        xp: 6,
        baseXp: 6,
        multiplier: 1,
        eligibleMs: 3600000,
        reason: "session",
        sourceKey: "session:task-1:1700000000000",
      },
      {
        ts: 1700000000000,
        dayKey: "2023-11-14",
        taskId: null,
        xp: 3,
        baseXp: 3,
        multiplier: 1,
        eligibleMs: 0,
        reason: "dailyConsistency",
        sourceKey: "daily:2023-11-14",
      },
      {
        ts: 1699990000000,
        dayKey: "2023-11-14",
        taskId: "task-1",
        xp: 2,
        baseXp: 2,
        multiplier: 1,
        eligibleMs: 900000,
        reason: "session",
        sourceKey: "session:task-1:1699990000000",
      },
    ],
  };

  it("builds a single-session summary with safe fallbacks", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task,
      rewardProgress,
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
      dateTimeText: "Logged: Wednesday 15th November, 2023 - 9:13AM",
      dateText: "Logged: Wednesday 15th November, 2023",
      timeText: "Time: 9:13AM",
      elapsedText: "1h 00m 00s",
      elapsedColor: "rgb(12,245,127)",
      noteText: "Deep focus block",
      sentimentText: "Somewhat Easy",
      timeGoalText: "1 hour per day",
      xpText: "9",
    });
    const html = renderHistoryEntrySummaryHtml(payload!, escapeHtml);
    expect(html).not.toContain("Activity Summary");
    expect(html).not.toContain('<div class="historyEntrySummarySectionTitle">Session 1</div>');
    expect(html).toContain('<div class="historyEntrySummarySessionDate">Logged: Wednesday 15th November, 2023</div>');
    expect(html).toContain('<div class="historyEntrySummarySessionTime">Time: 9:13AM</div>');
    expect(html).toContain(
      '<div class="historyEntrySummarySessionElapsed isProgressColored" style="--history-entry-summary-elapsed-color: rgb(12,245,127)">1h 00m 00s</div>'
    );
    expect(html).toContain("Deep focus block");
    expect(html).toContain('data-history-summary-action="delete-session"');
    expect(html).toContain('data-history-summary-action="edit-note"');
    expect(html).toContain('data-history-summary-task-id="task-1"');
    expect(html).toContain('data-history-summary-ts="1700000000000"');
    expect(html).toContain('data-history-summary-ms="3600000"');
    expect(html).toContain('data-history-summary-name="Deep Work"');
  });

  it("builds aggregate totals and preserves safe xp derivation when all sessions are known", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task,
      rewardProgress,
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
      dateSpanText: "Wednesday 15th November, 2023 to Wednesday 15th November, 2023",
      sessionCountText: "2 sessions",
      totalElapsedText: "45m 00s",
      xpText: "11",
      timeGoalText: "No",
    });
    expect(payload?.sessions[0].noteText).toBe("No session note.");
    expect(payload?.sessions[0].elapsedText).toBe("30m 00s");
    expect(payload?.sessions[0].elapsedColor).toBe("rgb(255,140,0)");
    expect(payload?.sessions[0].xpText).toBe("9");
    expect(payload?.sessions[0].timeGoalText).toBe("1 hour per day");
    expect(payload?.sessions[1].elapsedText).toBe("15m 00s");
    expect(payload?.sessions[1].elapsedColor).toBe("rgb(255,100,24)");
    expect(payload?.sessions[1].xpText).toBe("2");
    expect(payload?.sessions[1].timeGoalText).toBe("1 hour per day");
    const html = renderHistoryEntrySummaryHtml(payload!, escapeHtml);
    expect(html).toContain("Activity Summary");
    expect(html).toContain('<div class="historyEntrySummaryHeroValue">45m 00s</div>');
    expect(html).not.toContain('<div class="historyEntrySummaryHeroValue isProgressColored"');
    expect(html).toContain("Session 1");
    expect(html).toContain(
      '<div class="historyEntrySummarySessionElapsed isProgressColored" style="--history-entry-summary-elapsed-color: rgb(255,140,0)">30m 00s</div>'
    );
    expect(html).toContain(
      '<div class="historyEntrySummarySessionElapsed isProgressColored" style="--history-entry-summary-elapsed-color: rgb(255,100,24)">15m 00s</div>'
    );
    expect(html).toContain("Quick wrap-up");
    expect(html).toContain('data-history-summary-action="delete-session"');
  });
});

