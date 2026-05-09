import { completionDifficultyLabel } from "../lib/completionDifficulty";
import { sessionColorForTaskMs } from "../lib/colors";
import type { RewardProgressV1 } from "../lib/rewards";
import type { Task } from "../lib/types";

const NOT_TRACKED_TEXT = "Not tracked";
const NO_SESSION_NOTE_TEXT = "No session note.";
const DESKTOP_EMPTY_NOTE_PLACEHOLDER = "Click to add note";
const MOBILE_EMPTY_NOTE_PLACEHOLDER = "Tap to add note";
const SHOW_DEV_XP_REPLAY_BUTTON = process.env.NODE_ENV !== "production";

type HistoryEntrySummarySource = {
  taskId?: unknown;
  ts?: unknown;
  ms?: unknown;
  name?: unknown;
  note?: unknown;
  completionDifficulty?: unknown;
};

type HistoryEntrySummaryItem = {
  taskId: string;
  name: string;
  ts: number;
  ms: number;
  dateTimeText: string;
  dateText: string;
  timeText: string;
  elapsedText: string;
  elapsedColor: string;
  timeGoalCompleted: boolean | null;
  timeGoalText: string;
  noteText: string;
  hasNote: boolean;
  sentimentText: string;
  xpEarned: number | null;
  xpText: string;
};

type HistoryEntrySummaryAggregate = {
  dateSpanText: string;
  sessionCountText: string;
  totalElapsedText: string;
  timeGoalText: string;
  xpEarned: number | null;
  xpText: string;
};

type HistoryEntrySummaryPayload = {
  titleText: string;
  metaText: string;
  aggregate: HistoryEntrySummaryAggregate | null;
  sessions: HistoryEntrySummaryItem[];
};

type BuildHistoryEntrySummaryPayloadOptions = {
  taskId?: string;
  task?: Task | null;
  rewardProgress?: RewardProgressV1 | null;
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
  return String(Math.max(0, Math.floor(xpEarned)));
}

function formatOrdinalDay(day: number) {
  const absDay = Math.abs(Math.floor(day));
  const mod100 = absDay % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${absDay}th`;
  const mod10 = absDay % 10;
  if (mod10 === 1) return `${absDay}st`;
  if (mod10 === 2) return `${absDay}nd`;
  if (mod10 === 3) return `${absDay}rd`;
  return `${absDay}th`;
}

function formatSummaryLongDate(value: number) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown date/time";
  const date = new Date(timestamp);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  return `${weekday} ${formatOrdinalDay(date.getDate())} ${month}, ${year}`;
}

function formatSummaryShortDate(value: number) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown date/time";
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

function formatSummaryTime(value: number) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(timestamp))
    .replace(/\s+/g, "");
}

function formatSummaryLoggedDateTime(value: number) {
  const dateText = formatSummaryLongDate(value);
  const timeText = formatSummaryTime(value);
  if (!timeText || dateText === "Unknown date/time") return `Logged: ${dateText}`;
  return `Logged: ${dateText} - ${timeText}`;
}

function formatSummaryLoggedDate(value: number) {
  return `Logged: ${formatSummaryLongDate(value)}`;
}

function formatSummaryLoggedTime(value: number) {
  const timeText = formatSummaryTime(value);
  return timeText ? `Time: ${timeText}` : "";
}

function deriveTaskTitle(entries: HistoryEntrySummarySource[]) {
  const firstNamedEntry = entries.find((entry) => String(entry?.name || "").trim());
  return String(firstNamedEntry?.name || "").trim() || "Session Summary";
}

function deriveTimeGoalCompleted(entry: HistoryEntrySummarySource, task?: Task | null) {
  const goalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!task?.timeGoalEnabled || !(goalMinutes > 0)) return null as boolean | null;
  const entryMs = normalizeElapsedMs(entry?.ms);
  return entryMs >= goalMinutes * 60 * 1000;
}

function formatTimeGoalText(task?: Task | null) {
  const effectiveMinutesRaw = Number(task?.timeGoalMinutes || 0);
  const effectiveMinutes = Number.isFinite(effectiveMinutesRaw) ? Math.max(0, effectiveMinutesRaw) : 0;
  if (!task?.timeGoalEnabled || !(effectiveMinutes > 0)) return NOT_TRACKED_TEXT;

  const goalUnit = task?.timeGoalUnit === "minute" ? "minute" : task?.timeGoalUnit === "hour" ? "hour" : null;
  const goalPeriod = task?.timeGoalPeriod === "day" ? "day" : task?.timeGoalPeriod === "week" ? "week" : null;
  const goalValueRaw = Number(task?.timeGoalValue || 0);
  const goalValue = Number.isFinite(goalValueRaw) ? Math.max(0, goalValueRaw) : 0;

  if (goalUnit && goalPeriod && goalValue > 0) {
    const unitLabel = goalValue === 1 ? goalUnit : `${goalUnit}s`;
    const periodLabel = goalPeriod === "day" ? "per day" : "per week";
    return `${goalValue} ${unitLabel} ${periodLabel}`;
  }

  if (effectiveMinutes % 60 === 0) {
    const hours = effectiveMinutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${effectiveMinutes} ${effectiveMinutes === 1 ? "minute" : "minutes"}`;
}

function deriveXpEarned(entry: HistoryEntrySummarySource, taskId: string, rewardProgress?: RewardProgressV1 | null) {
  const normalizedTaskId = String(taskId || "").trim();
  const awardedAt = normalizeTimestamp(entry?.ts);
  const ledger = Array.isArray(rewardProgress?.awardLedger) ? rewardProgress.awardLedger : null;
  if (!normalizedTaskId || awardedAt <= 0 || !ledger) return null;
  const matchingEntries = ledger.filter((award) => {
    const awardTs = normalizeTimestamp(award?.ts);
    if (awardTs !== awardedAt) return false;
    if (award?.reason === "session") return String(award?.taskId || "").trim() === normalizedTaskId;
    return true;
  });
  const totalXp = matchingEntries.reduce((sum, award) => sum + Math.max(0, Number(award?.xp || 0) || 0), 0);
  return totalXp > 0 ? totalXp : 0;
}

function formatHistoryEntrySummaryElapsed(msRaw: unknown, formatTwo: (value: number) => string) {
  const totalSeconds = Math.max(0, Math.floor(Math.max(0, Number(msRaw) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    { value: days, suffix: "d" },
    { value: hours, suffix: "h" },
    { value: minutes, suffix: "m" },
    { value: seconds, suffix: "s" },
  ];
  const firstVisibleIndex = parts.findIndex((part) => part.value > 0);
  if (firstVisibleIndex === -1) return "0s";
  return parts
    .slice(firstVisibleIndex)
    .map((part, index) => `${index === 0 ? String(part.value) : formatTwo(part.value)}${part.suffix}`)
    .join(" ");
}

function buildHistoryEntrySummaryItem(
  entry: HistoryEntrySummarySource,
  taskId: string,
  task: Task | null | undefined,
  rewardProgress: RewardProgressV1 | null | undefined,
  _formatDateTime: (value: number) => string,
  formatTwo: (value: number) => string,
  getEntryNote: (entry: HistoryEntrySummarySource) => string
): HistoryEntrySummaryItem {
  const ts = normalizeTimestamp(entry?.ts);
  const ms = normalizeElapsedMs(entry?.ms);
  const name = String(entry?.name || "").trim();
  const noteText = String(getEntryNote(entry) || "").trim();
  const hasNote = !!noteText;
  const timeGoalCompleted = deriveTimeGoalCompleted(entry, task);
  const xpEarned = deriveXpEarned(entry, taskId, rewardProgress);
  return {
    taskId,
    name,
    ts,
    ms,
    dateTimeText: formatSummaryLoggedDateTime(ts),
    dateText: formatSummaryLoggedDate(ts),
    timeText: formatSummaryLoggedTime(ts),
    elapsedText: formatHistoryEntrySummaryElapsed(ms, formatTwo),
    elapsedColor: sessionColorForTaskMs(task || ({} as Task), ms),
    timeGoalCompleted,
    timeGoalText: formatTimeGoalText(task),
    noteText: hasNote ? noteText : NO_SESSION_NOTE_TEXT,
    hasNote,
    sentimentText: completionDifficultyLabel(entry?.completionDifficulty) || NOT_TRACKED_TEXT,
    xpEarned,
    xpText: formatXpText(xpEarned),
  };
}

function buildAggregateSummary(
  sessions: HistoryEntrySummaryItem[],
  _formatDateTime: (value: number) => string,
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
        ? formatSummaryShortDate(latestTs)
        : `${formatSummaryShortDate(latestTs)} to ${formatSummaryShortDate(earliestTs)}`
      : "Unknown date/time";

  return {
    dateSpanText,
    sessionCountText: `${sortedByTime.length} sessions`,
    totalElapsedText: formatHistoryEntrySummaryElapsed(totalElapsedMs, formatTwo),
    timeGoalText,
    xpEarned: totalXp,
    xpText: formatXpText(totalXp),
  };
}

export function buildHistoryEntrySummaryPayload({
  taskId,
  task,
  rewardProgress,
  entries,
  formatDateTime,
  formatTwo,
  getEntryNote,
}: BuildHistoryEntrySummaryPayloadOptions): HistoryEntrySummaryPayload | null {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedTaskId = String(taskId || "").trim();
  const sessions = normalizedEntries
    .map((entry) => buildHistoryEntrySummaryItem(entry, normalizedTaskId, task, rewardProgress, formatDateTime, formatTwo, getEntryNote))
    .sort((a, b) => a.ts - b.ts);
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
  const showSessionHeading = payload.sessions.length > 1;
  const renderField = (label: string, value: string) => `<div class="historyEntrySummaryField">
      <div class="historyEntrySummaryLabel">${escapeHtml(label)}</div>
      <div class="historyEntrySummaryValue">${escapeHtml(value)}</div>
    </div>`;
  const renderXpField = (label: string, value: string, xpEarned: number | null, taskId?: string) => {
    const showReplayButton = SHOW_DEV_XP_REPLAY_BUTTON && typeof xpEarned === "number" && xpEarned > 0;
    const replayButtonHtml = showReplayButton
      ? `<button class="btn btn-ghost small historyEntrySummaryXpReplayBtn" type="button" aria-label="Replay XP animation" title="Replay XP animation" data-history-summary-action="trigger-xp-award" data-history-summary-xp="${escapeHtml(xpEarned)}"${taskId ? ` data-history-summary-task-id="${escapeHtml(taskId)}"` : ""}>Test</button>`
      : "";
    return `<div class="historyEntrySummaryField">
      <div class="historyEntrySummaryLabel">${escapeHtml(label)}</div>
      <div class="historyEntrySummaryValueWrap">
        <div class="historyEntrySummaryValue">${escapeHtml(value)}</div>
        ${replayButtonHtml}
      </div>
    </div>`;
  };
  const heroHtml = payload.aggregate
    ? `<section class="historyEntrySummaryHero" aria-label="${escapeHtml(payload.titleText)} activity summary">
        <div class="historyEntrySummaryHeroTop">
          <div class="historyEntrySummaryHeroHeading">
            <div class="historyEntrySummaryHeroEyebrow">Activity Summary</div>
            <div class="historyEntrySummaryHeroDate">${escapeHtml(payload.aggregate.dateSpanText)}</div>
          </div>
        </div>
        <div class="historyEntrySummaryHeroLabel">Total Time Logged</div>
        <div class="historyEntrySummaryHeroValue">${escapeHtml(payload.aggregate.totalElapsedText)}</div>
        <div class="historyEntrySummaryHeroStats">
          ${[renderXpField("Total XP Earned", payload.aggregate.xpText, payload.aggregate.xpEarned)].join("")}
        </div>
      </section>`
    : "";

  const sessionsHtml = payload.sessions
    .map((session, index) => {
      const deleteButtonHtml =
        session.taskId && session.ts > 0 && session.name
          ? `<button class="iconBtn historyEntrySummaryDeleteBtn" type="button" aria-label="Delete session entry" title="Delete session entry" data-history-summary-action="delete-session" data-history-summary-task-id="${escapeHtml(session.taskId)}" data-history-summary-ts="${escapeHtml(session.ts)}" data-history-summary-ms="${escapeHtml(session.ms)}" data-history-summary-name="${escapeHtml(session.name)}"><img class="historyEntrySummaryDeleteIcon" src="/icons/icons_default/trash.png" alt="" aria-hidden="true" /></button>`
          : "";
      return `<section class="historyEntrySummarySessionCard" aria-label="Session ${escapeHtml(index + 1)}">
        <div class="historyEntrySummarySessionHead">
          <div class="historyEntrySummarySessionHeadMain">
            ${showSessionHeading ? `<div class="historyEntrySummarySectionTitle">Session ${escapeHtml(index + 1)}</div>` : ""}
            <div class="historyEntrySummarySessionDate">${escapeHtml(session.dateText)}</div>
            ${session.timeText ? `<div class="historyEntrySummarySessionTime">${escapeHtml(session.timeText)}</div>` : ""}
            <div class="historyEntrySummarySessionElapsed isProgressColored" style="--history-entry-summary-elapsed-color: ${escapeHtml(session.elapsedColor)}">${escapeHtml(session.elapsedText)}</div>
          </div>
          ${deleteButtonHtml ? `<div class="historyEntrySummarySessionHeadActions">${deleteButtonHtml}</div>` : ""}
        </div>
        <div class="historyEntrySummaryGrid">
          ${renderField("Time goal", session.timeGoalText)}
          ${renderField("Sentiment", session.sentimentText)}
          ${renderXpField("XP earned", session.xpText, session.xpEarned, session.taskId)}
        </div>
        <div class="historyEntrySummaryNoteRow">
          <div class="historyEntrySummaryNoteBlock" role="button" tabindex="0" title="Click to edit session note" data-history-summary-action="edit-note" data-history-summary-task-id="${escapeHtml(session.taskId)}" data-history-summary-ts="${escapeHtml(session.ts)}" data-history-summary-ms="${escapeHtml(session.ms)}" data-history-summary-name="${escapeHtml(session.name)}">
            <div class="historyEntrySummaryLabel">Session note</div>
            <textarea class="historyEntrySummaryNoteText historyEntrySummaryNoteInput" rows="2" readonly aria-label="Session note" placeholder="${escapeHtml(DESKTOP_EMPTY_NOTE_PLACEHOLDER)}" data-history-summary-note-input="true" data-empty-note-placeholder-desktop="${escapeHtml(DESKTOP_EMPTY_NOTE_PLACEHOLDER)}" data-empty-note-placeholder-mobile="${escapeHtml(MOBILE_EMPTY_NOTE_PLACEHOLDER)}">${escapeHtml(session.hasNote ? session.noteText : "")}</textarea>
          </div>
        </div>
      </section>`;
    })
    .join("");

  return `<div class="historyEntrySummaryLayout">
    ${heroHtml}
    ${payload.aggregate ? '<div class="historyEntrySummaryDivider" aria-hidden="true"></div>' : ""}
    <div class="historyEntrySummarySessions${payload.aggregate ? "" : " historyEntrySummarySessionsSingle"}">${sessionsHtml}</div>
  </div>`;
}
