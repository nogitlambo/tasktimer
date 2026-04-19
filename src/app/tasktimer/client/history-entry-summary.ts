import { completionDifficultyLabel } from "../lib/completionDifficulty";
import { formatHistoryManagerElapsed } from "./history-manager-shared";

const NOT_TRACKED_TEXT = "Not tracked";
const NO_SESSION_NOTE_TEXT = "No session note.";

type HistoryEntrySummarySource = {
  ts?: unknown;
  ms?: unknown;
  note?: unknown;
  xpDisqualifiedUntilReset?: unknown;
  completionDifficulty?: unknown;
};

export type HistoryEntrySummaryItem = {
  ts: number;
  ms: number;
  dateTimeText: string;
  elapsedText: string;
  timeGoalCompleted: boolean | null;
  timeGoalText: string;
  noteText: string;
  hasNote: boolean;
  noteCopyText: string;
  sentimentText: string;
  xpEarned: number | null;
  xpText: string;
};

export type HistoryEntrySummaryAggregate = {
  dateSpanText: string;
  sessionCountText: string;
  totalElapsedText: string;
  timeGoalText: string;
  xpText: string;
};

export type HistoryEntrySummaryPayload = {
  titleText: string;
  metaText: string;
  aggregate: HistoryEntrySummaryAggregate | null;
  sessions: HistoryEntrySummaryItem[];
};

type BuildHistoryEntrySummaryPayloadOptions = {
  entries: HistoryEntrySummarySource[];
  formatDateTime: (value: number) => string;
  formatTwo: (value: number) => string;
  getEntryNote: (entry: HistoryEntrySummarySource) => string;
};

function normalizeTimestamp(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeElapsedMs(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function formatXpText(xpEarned: number | null) {
  if (typeof xpEarned !== "number") return NOT_TRACKED_TEXT;
  return `${Math.max(0, Math.floor(xpEarned))} XP`;
}

function deriveTimeGoalCompleted() {
  return null as boolean | null;
}

function deriveXpEarned(entry: HistoryEntrySummarySource) {
  return entry?.xpDisqualifiedUntilReset ? 0 : null;
}

function buildHistoryEntrySummaryItem(
  entry: HistoryEntrySummarySource,
  formatDateTime: (value: number) => string,
  formatTwo: (value: number) => string,
  getEntryNote: (entry: HistoryEntrySummarySource) => string
): HistoryEntrySummaryItem {
  const ts = normalizeTimestamp(entry?.ts);
  const ms = normalizeElapsedMs(entry?.ms);
  const noteText = String(getEntryNote(entry) || "").trim();
  const hasNote = !!noteText;
  const timeGoalCompleted = deriveTimeGoalCompleted();
  const xpEarned = deriveXpEarned(entry);
  return {
    ts,
    ms,
    dateTimeText: ts > 0 ? formatDateTime(ts) : "Unknown date/time",
    elapsedText: formatHistoryManagerElapsed(ms, formatTwo),
    timeGoalCompleted,
    timeGoalText:
      timeGoalCompleted == null ? NOT_TRACKED_TEXT : timeGoalCompleted ? "Yes" : "No",
    noteText: hasNote ? noteText : NO_SESSION_NOTE_TEXT,
    hasNote,
    noteCopyText: noteText,
    sentimentText: completionDifficultyLabel(entry?.completionDifficulty) || NOT_TRACKED_TEXT,
    xpEarned,
    xpText: formatXpText(xpEarned),
  };
}

function buildAggregateSummary(
  sessions: HistoryEntrySummaryItem[],
  formatDateTime: (value: number) => string,
  formatTwo: (value: number) => string
) {
  if (sessions.length <= 1) return null;
  const sortedByTime = sessions.slice().sort((a, b) => b.ts - a.ts);
  const latestTs = sortedByTime[0]?.ts || 0;
  const earliestTs = sortedByTime[sortedByTime.length - 1]?.ts || 0;
  const totalElapsedMs = sortedByTime.reduce((sum, session) => sum + session.ms, 0);
  const knownGoalStates = sortedByTime
    .map((session) => session.timeGoalCompleted)
    .filter((value): value is boolean => value !== null);
  const timeGoalText = knownGoalStates.some(Boolean)
    ? "Yes"
    : knownGoalStates.length
      ? "No"
      : NOT_TRACKED_TEXT;
  const canSumXp = sortedByTime.every((session) => typeof session.xpEarned === "number");
  const totalXp = canSumXp
    ? sortedByTime.reduce((sum, session) => sum + Number(session.xpEarned || 0), 0)
    : null;
  const dateSpanText =
    latestTs > 0 && earliestTs > 0
      ? latestTs === earliestTs
        ? formatDateTime(latestTs)
        : `${formatDateTime(latestTs)} to ${formatDateTime(earliestTs)}`
      : "Unknown date/time";

  return {
    dateSpanText,
    sessionCountText: `${sortedByTime.length} sessions`,
    totalElapsedText: formatHistoryManagerElapsed(totalElapsedMs, formatTwo),
    timeGoalText,
    xpText: formatXpText(totalXp),
  };
}

export function buildHistoryEntrySummaryPayload({
  entries,
  formatDateTime,
  formatTwo,
  getEntryNote,
}: BuildHistoryEntrySummaryPayloadOptions): HistoryEntrySummaryPayload | null {
  const sessions = (Array.isArray(entries) ? entries : [])
    .map((entry) => buildHistoryEntrySummaryItem(entry, formatDateTime, formatTwo, getEntryNote))
    .sort((a, b) => b.ts - a.ts);
  if (!sessions.length) return null;
  const aggregate = buildAggregateSummary(sessions, formatDateTime, formatTwo);
  return {
    titleText: aggregate ? "Session Summaries" : "Session Summary",
    metaText: aggregate ? aggregate.sessionCountText : "",
    aggregate,
    sessions,
  };
}

export function renderHistoryEntrySummaryHtml(
  payload: HistoryEntrySummaryPayload,
  escapeHtml: (value: unknown) => string
) {
  const renderField = (label: string, value: string) => `<div class="historyEntrySummaryField">
      <div class="historyEntrySummaryLabel">${escapeHtml(label)}</div>
      <div class="historyEntrySummaryValue">${escapeHtml(value)}</div>
    </div>`;

  const aggregateHtml = payload.aggregate
    ? `<div class="historyEntrySummarySectionTitle historyEntrySummarySectionTitle-overview">Overview</div>
       <div class="historyEntrySummaryGrid">
         ${renderField("Date span", payload.aggregate.dateSpanText)}
         ${renderField("Sessions", payload.aggregate.sessionCountText)}
         ${renderField("Total elapsed", payload.aggregate.totalElapsedText)}
         ${renderField("Time goal completed", payload.aggregate.timeGoalText)}
         ${renderField("XP earned", payload.aggregate.xpText)}
       </div>
       ${payload.sessions.length ? '<div class="historyEntrySummaryDivider" aria-hidden="true"></div>' : ""}`
    : "";

  const sessionsHtml = payload.sessions
    .map((session, index) => {
      const noteCopyHtml = session.hasNote
        ? `<button class="historyEntryNoteCopyLink" type="button" data-history-note-copy="${escapeHtml(session.noteCopyText)}">Copy</button>`
        : "";
      return `<div class="historyEntrySummarySectionTitle">Session ${escapeHtml(index + 1)}</div>
        <div class="historyEntrySummaryGrid">
          ${renderField("Date/Time", session.dateTimeText)}
          ${renderField("Elapsed", session.elapsedText)}
          ${renderField("Time goal completed", session.timeGoalText)}
          ${renderField("Sentiment", session.sentimentText)}
          ${renderField("XP earned", session.xpText)}
        </div>
        <div class="historyEntrySummaryNoteRow">
          <div class="historyEntrySummaryNoteBlock">
            <div class="historyEntrySummaryLabel">Session note</div>
            <div class="historyEntrySummaryNoteText">${escapeHtml(session.noteText)}</div>
          </div>
          ${noteCopyHtml ? `<div class="historyEntrySummaryNoteActions">${noteCopyHtml}</div>` : ""}
        </div>
        ${index < payload.sessions.length - 1 ? '<div class="historyEntrySummaryDivider" aria-hidden="true"></div>' : ""}`;
    })
    .join("");

  return `${aggregateHtml}${sessionsHtml}`;
}
