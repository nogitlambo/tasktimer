import { describe, expect, it } from "vitest";
import { DEFAULT_REWARD_PROGRESS, type RewardLedgerEntry } from "../lib/rewards";
import type { Task } from "../lib/types";
import { buildHistoryEntrySummaryPayload, renderHistoryEntrySummaryHtml } from "./history-entry-summary";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function renderSummary(taskValue: Task | null) {
  const payload = buildHistoryEntrySummaryPayload({
    taskId: "task-1",
    task: taskValue,
    rewardProgress: null,
    entries: [{ taskId: "task-1", ts: 1_717_200_000_000, ms: 180_000, name: "Focus", completionDifficulty: 5 }],
    formatDateTime: (value) => String(value),
    formatTwo: (value) => String(value).padStart(2, "0"),
    getEntryNote: () => "",
  });
  expect(payload).not.toBeNull();
  return renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));
}

function rewardLedgerEntry(overrides: Partial<RewardLedgerEntry>): RewardLedgerEntry {
  const ts = Math.max(0, Math.floor(Number(overrides.ts || 0)));
  const xp = Math.max(0, Math.floor(Number(overrides.xp || 0)));
  return {
    ts,
    dayKey: "2026-05-12",
    taskId: null,
    xp,
    baseXp: xp,
    multiplier: 1,
    eligibleMs: 60_000,
    reason: "session",
    sourceKey: `test:${ts}`,
    ...overrides,
  };
}

describe("history entry summary", () => {
  it("omits sentiment information from the rendered session summary", () => {
    const html = renderSummary(task({ timeGoalEnabled: true, timeGoalValue: 3, timeGoalUnit: "minute", timeGoalPeriod: "day", timeGoalMinutes: 3 }));

    expect(html).not.toContain("Sentiment");
    expect(html).not.toContain("Very easy");
  });

  it("uses compact daily minute time goal wording", () => {
    const html = renderSummary(task({ timeGoalEnabled: true, timeGoalValue: 3, timeGoalUnit: "minute", timeGoalPeriod: "day", timeGoalMinutes: 3 }));

    expect(html).toContain("3 min daily");
    expect(html).not.toContain("3 minutes per day");
  });

  it("uses compact weekly hour time goal wording", () => {
    const html = renderSummary(task({ timeGoalEnabled: true, timeGoalValue: 1, timeGoalUnit: "hour", timeGoalPeriod: "week", timeGoalMinutes: 60 }));

    expect(html).toContain("1 hr weekly");
    expect(html).not.toContain("1 hour per week");
  });

  it("keeps the no-goal fallback wording", () => {
    const html = renderSummary(task({ timeGoalEnabled: false, timeGoalMinutes: 0 }));

    expect(html).toContain("Not tracked");
  });

  it("renders aggregate and session XP values inside ribbon values while preserving the XP source hook", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({ timeGoalEnabled: false, timeGoalMinutes: 0 }),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        awardLedger: [
          rewardLedgerEntry({ ts: 1_717_200_000_000, xp: 12, taskId: "task-1" }),
          rewardLedgerEntry({ ts: 1_717_200_060_000, xp: 8, taskId: "task-1" }),
        ],
      },
      entries: [
        { taskId: "task-1", ts: 1_717_200_000_000, ms: 180_000, name: "Focus" },
        { taskId: "task-1", ts: 1_717_200_060_000, ms: 120_000, name: "Focus" },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html.match(/historyEntrySummaryXpRibbonValue/g)).toHaveLength(3);
    expect(html.match(/data-history-summary-xp-source="true"/g)).toHaveLength(3);
    expect(html).toContain('class="historyEntrySummaryValue historyEntrySummaryXpRibbonValue" data-history-summary-xp-source="true">20</div>');
    expect(html).toContain('class="historyEntrySummaryValue historyEntrySummaryXpRibbonValue" data-history-summary-xp-source="true">12</div>');
    expect(html).toContain('class="historyEntrySummaryValue historyEntrySummaryXpRibbonValue" data-history-summary-xp-source="true">8</div>');
  });

  it("shows pending for stopped incomplete time-goal session XP", () => {
    const ts = 1_717_200_000_000;
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({
        accumulatedMs: 180_000,
        timeGoalEnabled: true,
        timeGoalValue: 10,
        timeGoalUnit: "minute",
        timeGoalPeriod: "day",
        timeGoalMinutes: 10,
      }),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        pendingTimeGoalXp: {
          byTaskId: {
            "task-1": {
              taskId: "task-1",
              updatedAt: ts,
              completedSessionsDelta: 1,
              entries: [rewardLedgerEntry({ ts, xp: 1, taskId: "task-1" })],
            },
          },
        },
      },
      entries: [{ taskId: "task-1", ts, ms: 180_000, name: "Focus" }],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(payload?.sessions[0]?.xpText).toBe("Pending");
    expect(html).toContain('class="historyEntrySummaryValue" data-history-summary-xp-source="true">Pending</div>');
    expect(html).not.toContain('data-history-summary-xp-source="true">1</div>');
    expect(html).not.toContain('historyEntrySummaryXpRibbonValue" data-history-summary-xp-source="true">Pending</div>');
  });

  it("renders session summary attachments as a comma-separated editable filename and size list", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({ timeGoalEnabled: false, timeGoalMinutes: 0 }),
      rewardProgress: null,
      entries: [
        {
          taskId: "task-1",
          ts: 1_717_200_000_000,
          ms: 180_000,
          name: "Focus",
          attachments: [
            {
              id: "file-1",
              name: "small.pdf",
              contentType: "application/pdf",
              size: 2048,
              storagePath: "users/uid/session-notes/file-1/small.pdf",
              downloadUrl: "https://example.test/small.pdf",
              createdAtMs: 1,
            },
            {
              id: "file-2",
              name: "large.pdf",
              contentType: "application/pdf",
              size: 2_621_440,
              storagePath: "users/uid/session-notes/file-2/large.pdf",
              downloadUrl: "https://example.test/large.pdf",
              createdAtMs: 2,
            },
          ],
        },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html).toContain("sessionNoteAttachmentItem");
    expect(html).toContain("large.pdf</a> <span class=\"sessionNoteAttachmentMeta\">(2.5MB)</span>");
    expect(html).toContain("small.pdf</a> <span class=\"sessionNoteAttachmentMeta\">(2KB)</span>");
    expect(html).toContain("</button></span>, <span class=\"sessionNoteAttachmentItem\"");
    expect(html).toContain('data-session-note-attachment-id="file-1"');
    expect(html).toContain('data-session-note-attachment-id="file-2"');
    expect(html).toContain('data-session-note-attachment-remove="file-1"');
    expect(html).toContain('data-session-note-attachment-remove="file-2"');
    expect(html).not.toContain("2 KB");
    expect(html).not.toContain("2.5 MB");
    expect(html).not.toContain("2048 B");
    expect(html).not.toContain("2621440 B");
  });
});
