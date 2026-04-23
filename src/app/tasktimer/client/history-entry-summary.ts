import { completionDifficultyLabel } from "../lib/completionDifficulty";
import { formatHistoryManagerElapsed } from "./history-manager-shared";

const NOT_TRACKED_TEXT = "Not tracked";
const NO_SESSION_NOTE_TEXT = "No session note.";

type HistoryEntrySummarySource = {
  taskId?: unknown;
  ts?: unknown;
  ms?: unknown;
  name?: unknown;
  note?: unknown;
  completionDifficulty?: unknown;
};

export type HistoryEntrySummaryItem = {
  taskId: string;
  name: string;
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
  taskId?: string;
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

function deriveTaskTitle(entries: HistoryEntrySummarySource[]) {
  const firstNamedEntry = entries.find((entry) => String(entry?.name || "").trim());
  return String(firstNamedEntry?.name || "").trim() || "Session Summary";
}

function deriveTimeGoalCompleted() {
  return null as boolean | null;
}

function deriveXpEarned(entry: HistoryEntrySummarySource) {
  void entry;
  return null;
}

function buildHistoryEntrySummaryItem(
  entry: HistoryEntrySummarySource,
  taskId: string,
  formatDateTime: (value: number) => string,
  formatTwo: (value: number) => string,
  getEntryNote: (entry: HistoryEntrySummarySource) => string
): HistoryEntrySummaryItem {
  const ts = normalizeTimestamp(entry?.ts);
  const ms = normalizeElapsedMs(entry?.ms);
  const name = String(entry?.name || "").trim();
  const noteText = String(getEntryNote(entry) || "").trim();
  const hasNote = !!noteText;
  const timeGoalCompleted = deriveTimeGoalCompleted();
  const xpEarned = deriveXpEarned(entry);
  return {
    taskId,
    name,
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
  taskId,
  entries,
  formatDateTime,
  formatTwo,
  getEntryNote,
}: BuildHistoryEntrySummaryPayloadOptions): HistoryEntrySummaryPayload | null {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedTaskId = String(taskId || "").trim();
  const sessions = normalizedEntries
    .map((entry) => buildHistoryEntrySummaryItem(entry, normalizedTaskId, formatDateTime, formatTwo, getEntryNote))
    .sort((a, b) => b.ts - a.ts);
  if (!sessions.length) return null;
  const aggregate = buildAggregateSummary(sessions, formatDateTime, formatTwo);
  const titleText = deriveTaskTitle(normalizedEntries);
  return {
    titleText,
    metaText: aggregate ? `${aggregate.sessionCountText} selected` : "Session Summary",
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
  const heroHtml = payload.aggregate
    ? `<section class="historyEntrySummaryHero" aria-label="${escapeHtml(payload.titleText)} activity summary">
        <div class="historyEntrySummaryHeroTop">
          <div class="historyEntrySummaryHeroEyebrow">Activity Summary</div>
          <div class="historyEntrySummaryHeroDate">${escapeHtml(payload.aggregate.dateSpanText)}</div>
        </div>
        <div class="historyEntrySummaryHeroLabel">Total time worked</div>
        <div class="historyEntrySummaryHeroValue">${escapeHtml(payload.aggregate.totalElapsedText)}</div>
        <div class="historyEntrySummaryHeroStats">
          ${[
            renderField("Sessions", payload.aggregate.sessionCountText),
            renderField("Date span", payload.aggregate.dateSpanText),
            renderField("Time goal", payload.aggregate.timeGoalText),
            renderField("XP earned", payload.aggregate.xpText),
          ].join("")}
        </div>
      </section>`
    : "";

  const sessionsHtml = payload.sessions
    .map((session, index) => {
      const noteCopyHtml = session.hasNote
        ? `<button class="historyEntryNoteCopyLink" type="button" data-history-note-copy="${escapeHtml(session.noteCopyText)}">Copy</button>`
        : "";
      const deleteButtonHtml =
        session.taskId && session.ts > 0 && session.name
          ? `<button class="iconBtn historyEntrySummaryDeleteBtn" type="button" aria-label="Delete session entry" title="Delete session entry" data-history-summary-action="delete-session" data-history-summary-task-id="${escapeHtml(session.taskId)}" data-history-summary-ts="${escapeHtml(session.ts)}" data-history-summary-ms="${escapeHtml(session.ms)}" data-history-summary-name="${escapeHtml(session.name)}">&#128465;</button>`
          : "";
      return `<section class="historyEntrySummarySessionCard" aria-label="Session ${escapeHtml(index + 1)}">
        <div class="historyEntrySummarySessionHead">
          <div class="historyEntrySummarySessionHeadMain">
            <div class="historyEntrySummarySectionTitle">Session ${escapeHtml(index + 1)}</div>
            <div class="historyEntrySummarySessionDate">${escapeHtml(session.dateTimeText)}</div>
          </div>
          ${deleteButtonHtml ? `<div class="historyEntrySummarySessionHeadActions">${deleteButtonHtml}</div>` : ""}
        </div>
        <div class="historyEntrySummarySessionElapsed">${escapeHtml(session.elapsedText)}</div>
        <div class="historyEntrySummaryGrid">
          ${renderField("Time goal", session.timeGoalText)}
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
      </section>`;
    })
    .join("");

  return `${heroHtml}<div class="historyEntrySummarySessions${payload.aggregate ? "" : " historyEntrySummarySessionsSingle"}">${sessionsHtml}</div>`;
}
