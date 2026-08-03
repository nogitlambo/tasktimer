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
  it("resolves task-specific metadata for mixed-task day summaries", () => {
    const focus = task({
      id: "focus",
      name: "Focus",
      timeGoalEnabled: true,
      timeGoalValue: 15,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 15,
    });
    const build = task({
      id: "build",
      name: "Build",
      timeGoalEnabled: true,
      timeGoalValue: 2,
      timeGoalUnit: "hour",
      timeGoalPeriod: "week",
      timeGoalMinutes: 120,
    });
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "focus",
      task: focus,
      getTaskById: (taskId) => (taskId === "focus" ? focus : taskId === "build" ? build : null),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        totalXp: 30,
        totalXpPrecise: 30,
        completedSessions: 2,
        awardLedger: [
          rewardLedgerEntry({ taskId: "focus", ts: 1_717_200_000_000, xp: 10 }),
          rewardLedgerEntry({ taskId: "build", ts: 1_717_203_600_000, xp: 20 }),
        ],
      },
      entries: [
        {
          taskId: "focus",
          ts: 1_717_200_000_000,
          ms: 15 * 60000,
          name: "Focus",
          historyMutationAllowed: false,
        },
        {
          taskId: "build",
          ts: 1_717_203_600_000,
          ms: 2 * 60 * 60000,
          name: "Build",
          historyMutationAllowed: false,
        },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html).toContain("15 min daily");
    expect(html).toContain("2 hr weekly");
    expect(html).toContain('<div class="historyEntrySummaryTaskName">Focus</div>\n                <div class="historyEntrySummarySectionTitle">Session 1</div>');
    expect(html).toContain('<div class="historyEntrySummaryTaskName">Build</div>\n                <div class="historyEntrySummarySectionTitle">Session 2</div>');
    expect(html).toContain('data-history-summary-task-id="focus"');
    expect(html).toContain('data-history-summary-task-id="build"');
    expect(html).toContain('data-history-summary-xp="10" data-history-summary-task-id="focus"');
    expect(html).toContain('data-history-summary-xp="20" data-history-summary-task-id="build"');
    expect(html).not.toContain('data-history-summary-action="delete-session"');
    expect(html).not.toContain('data-history-summary-action="edit-note"');
  });

  it("propagates an optional opaque target key while preserving existing history action and tuple hooks", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task(),
      rewardProgress: null,
      entries: [
        {
          taskId: "task-1",
          historyTargetKey: "opaque-target-1",
          ts: 1_717_200_000_000,
          ms: 180_000,
          name: "Focus",
        },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html.match(/data-history-summary-target-key="opaque-target-1"/g)).toHaveLength(3);
    expect(html).toContain('data-history-summary-action="delete-session"');
    expect(html).toContain('data-history-summary-action="edit-note"');
    expect(html).toContain('data-history-summary-note-input="true"');
    expect(html).toContain('data-history-summary-task-id="task-1"');
    expect(html).toContain('data-history-summary-ts="1717200000000"');
    expect(html).toContain('data-history-summary-ms="180000"');
    expect(html).toContain('data-history-summary-name="Focus"');
  });

  it("renders live or explicitly unresolved summary entries as read-only", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task(),
      rewardProgress: null,
      entries: [
        {
          taskId: "task-1",
          historyTargetKey: "opaque-live-target",
          isLiveSession: true,
          ts: 1_717_200_000_000,
          ms: 180_000,
          name: "Live Focus",
        },
        {
          taskId: "task-1",
          historyMutationAllowed: false,
          ts: 1_717_200_060_000,
          ms: 120_000,
          name: "Ambiguous Focus",
          attachments: [
            {
              id: "file-1",
              name: "notes.txt",
              contentType: "text/plain",
              size: 12,
              storagePath: "notes/file-1",
              downloadUrl: "https://example.test/notes.txt",
              createdAtMs: 1,
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

    expect(html).not.toContain('data-history-summary-action="delete-session"');
    expect(html).not.toContain('data-history-summary-action="edit-note"');
    expect(html).not.toContain("data-session-note-attachment-remove");
    expect(html).toContain('data-placeholder="No session note."');
  });

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

  it("renders explicit start and finish timestamps when present", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task(),
      rewardProgress: null,
      entries: [
        {
          taskId: "task-1",
          ts: 1_717_200_000_000,
          startedAtMs: 1_717_200_000_000,
          finishedAtMs: 1_717_203_600_000,
          ms: 180_000,
          name: "Focus",
        },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html).toContain("Start");
    expect(html).toContain("Finish");
    expect(html).toContain("Saturday 1st June, 2024 - 10:00AM");
    expect(html).toContain("Saturday 1st June, 2024 - 11:00AM");
  });

  it("falls back to the legacy logged timestamp when explicit start and finish are absent", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task(),
      rewardProgress: null,
      entries: [
        {
          taskId: "task-1",
          ts: 1_717_200_000_000,
          ms: 180_000,
          name: "Focus",
        },
      ],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    const html = renderHistoryEntrySummaryHtml(payload!, (value) => String(value ?? ""));

    expect(html).toContain("Logged");
  });

  it("renders positive aggregate and session XP as hidden replay triggers while preserving the XP source hook", () => {
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

    expect(html.match(/historyEntrySummaryXpRibbonValue/g)).toHaveLength(1);
    expect(html.match(/data-history-summary-xp-source="true"/g)).toHaveLength(3);
    expect(html.match(/data-history-summary-action="trigger-xp-award"/g)).toHaveLength(3);
    expect(html).toContain('class="historyEntrySummaryValue historyEntrySummaryXpRibbonValue" data-history-summary-xp-source="true" data-history-summary-action="trigger-xp-award" data-history-summary-xp="20" data-history-summary-task-id="task-1">20</div>');
    expect(html).toContain('class="historyEntrySummaryValue" data-history-summary-xp-source="true" data-history-summary-action="trigger-xp-award" data-history-summary-xp="12" data-history-summary-task-id="task-1">12</div>');
    expect(html).toContain('class="historyEntrySummaryValue" data-history-summary-xp-source="true" data-history-summary-action="trigger-xp-award" data-history-summary-xp="8" data-history-summary-task-id="task-1">8</div>');
  });

  it("matches session XP when a history timestamp drifts slightly from the award timestamp", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({ timeGoalEnabled: false, timeGoalMinutes: 0 }),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        awardLedger: [rewardLedgerEntry({ ts: 1_717_200_000_000, xp: 12, taskId: "task-1" })],
      },
      entries: [{ taskId: "task-1", ts: 1_717_200_000_250, ms: 180_000, name: "Focus" }],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    expect(payload?.sessions[0]?.xpEarned).toBe(12);
    expect(payload?.sessions[0]?.xpText).toBe("12");
  });

  it("falls back to base session XP when reward ledger detail has aged out", () => {
    const payload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({ timeGoalEnabled: false, timeGoalMinutes: 0 }),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        totalXp: 120,
        totalXpPrecise: 120,
        awardLedger: [],
      },
      entries: [{ taskId: "task-1", ts: 1_717_200_000_000, ms: 10 * 60_000, name: "Focus" }],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(payload).not.toBeNull();

    expect(payload?.sessions[0]?.xpEarned).toBe(5);
    expect(payload?.sessions[0]?.xpText).toBe("5");
  });

  it("renders the note section after the time goal and XP metrics", () => {
    const html = renderSummary(task({ timeGoalEnabled: true, timeGoalValue: 3, timeGoalUnit: "minute", timeGoalPeriod: "day", timeGoalMinutes: 3 }));
    const metricsIndex = html.indexOf("historyEntrySummaryGrid");
    const noteIndex = html.indexOf("historyEntrySummaryNoteRow");

    expect(metricsIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(metricsIndex);
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
    expect(html).not.toContain('data-history-summary-action="trigger-xp-award"');
    expect(html).not.toContain('data-history-summary-xp="1"');
  });

  it("leaves zero and untracked XP values inert", () => {
    const zeroPayload = buildHistoryEntrySummaryPayload({
      taskId: "task-1",
      task: task({ timeGoalEnabled: false, timeGoalMinutes: 0 }),
      rewardProgress: {
        ...DEFAULT_REWARD_PROGRESS,
        awardLedger: [],
      },
      entries: [{ taskId: "task-1", ts: 1_717_200_000_000, ms: 180_000, name: "Focus" }],
      formatDateTime: (value) => String(value),
      formatTwo: (value) => String(value).padStart(2, "0"),
      getEntryNote: () => "",
    });
    expect(zeroPayload).not.toBeNull();
    const zeroHtml = renderHistoryEntrySummaryHtml(zeroPayload!, (value) => String(value ?? ""));

    expect(zeroHtml).toContain('data-history-summary-xp-source="true">0</div>');
    expect(zeroHtml).not.toContain('data-history-summary-action="trigger-xp-award"');
    expect(zeroHtml).not.toContain('data-history-summary-xp="0"');

    const untrackedHtml = renderSummary(task({ timeGoalEnabled: false, timeGoalMinutes: 0 }));
    expect(untrackedHtml).toContain('data-history-summary-xp-source="true">Not tracked</div>');
    expect(untrackedHtml).not.toContain('data-history-summary-action="trigger-xp-award"');
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
