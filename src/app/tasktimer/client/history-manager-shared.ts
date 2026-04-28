export type HistoryGenParams = {
  taskIds: string[];
  daysBack: number;
  entriesPerDayMin: number;
  entriesPerDayMax: number;
  windowStartMinute: number;
  windowEndMinute: number;
  replaceExisting: boolean;
  generateRandomTimeGoals: boolean;
};

export type HistoryGenTaskGoal = {
  timeGoalEnabled: boolean;
  timeGoalValue: number;
  timeGoalUnit: "minute" | "hour";
  timeGoalPeriod: "day" | "week";
  timeGoalMinutes: number;
  dailyBudgetMinutes: number;
};

type HistoryManagerRowEntry = {
  ts: unknown;
  ms: unknown;
  name: unknown;
  isLiveSession?: unknown;
  liveSessionId?: unknown;
};

export type HistoryManagerManualDraft = {
  dateTimeValue: string;
  hoursValue: string;
  minutesValue: string;
  completionDifficulty: CompletionDifficulty | "";
  noteValue: string;
  errorMessage: string;
};

type HistoryManagerManualDraftParseInput = {
  draft: HistoryManagerManualDraft;
  taskName: string;
  taskColor?: string | null;
};

function padHistoryManagerDatePart(value: number) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
}

export function formatHistoryManagerDraftDateTimeValue(nowMs: number) {
  const date = new Date(nowMs);
  return [
    `${date.getFullYear()}-${padHistoryManagerDatePart(date.getMonth() + 1)}-${padHistoryManagerDatePart(date.getDate())}`,
    `${padHistoryManagerDatePart(date.getHours())}:${padHistoryManagerDatePart(date.getMinutes())}`,
  ].join("T");
}

export function createDefaultHistoryManagerManualDraft(nowMs: number): HistoryManagerManualDraft {
  return {
    dateTimeValue: formatHistoryManagerDraftDateTimeValue(nowMs),
    hoursValue: "",
    minutesValue: "",
    completionDifficulty: "",
    noteValue: "",
    errorMessage: "",
  };
}

export function parseHistoryManagerManualDraft(input: HistoryManagerManualDraftParseInput) {
  const dateTimeValue = String(input.draft.dateTimeValue || "").trim();
  if (!dateTimeValue) {
    return { error: "Enter a valid date and time." } as const;
  }
  const parsedTs = new Date(dateTimeValue).getTime();
  if (!Number.isFinite(parsedTs) || parsedTs <= 0) {
    return { error: "Enter a valid date and time." } as const;
  }
  const hoursValue = String(input.draft.hoursValue || "").trim();
  const minutesValue = String(input.draft.minutesValue || "").trim();
  const hours = hoursValue ? Number(hoursValue) : 0;
  const minutes = minutesValue ? Number(minutesValue) : 0;
  if (!Number.isFinite(hours) || hours < 0 || Math.floor(hours) !== hours) {
    return { error: "Elapsed hours must be a whole number of 0 or greater." } as const;
  }
  if (!Number.isFinite(minutes) || minutes < 0 || Math.floor(minutes) !== minutes || minutes > 59) {
    return { error: "Elapsed minutes must be between 0 and 59." } as const;
  }
  const elapsedMs = ((hours * 60) + minutes) * 60 * 1000;
  if (!(elapsedMs > 0)) {
    return { error: "Elapsed time must be greater than 0." } as const;
  }
  const completionDifficulty = normalizeCompletionDifficulty(input.draft.completionDifficulty);
  if (!completionDifficulty) {
    return { error: "Choose a sentiment before saving this entry." } as const;
  }
  const taskName = String(input.taskName || "").trim() || "Task";
  const noteValue = String(input.draft.noteValue || "").trim();
  const colorValue = typeof input.taskColor === "string" ? String(input.taskColor).trim() : "";
  return {
    entry: {
      ts: Math.floor(parsedTs),
      ms: Math.floor(elapsedMs),
      name: taskName,
      completionDifficulty,
      ...(noteValue ? { note: noteValue } : {}),
      ...(colorValue ? { color: colorValue } : {}),
    },
  } as const;
}

export function formatHistoryManagerElapsed(msRaw: unknown, formatTwo: (value: number) => string) {
  const totalSeconds = Math.max(0, Math.floor(Math.max(0, Number(msRaw) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${formatTwo(days)}d ${formatTwo(hours)}h ${formatTwo(minutes)}m ${formatTwo(seconds)}s`;
}

export function buildHistoryManagerRowKey(entry: HistoryManagerRowEntry) {
  const ts = Number.isFinite(Number(entry?.ts)) ? Math.floor(Number(entry.ts)) : 0;
  const ms = Number.isFinite(Number(entry?.ms)) ? Math.max(0, Math.floor(Number(entry.ms))) : 0;
  const name = String(entry?.name || "");
  const liveSuffix =
    entry?.isLiveSession && String(entry?.liveSessionId || "").trim()
      ? `|live:${String(entry.liveSessionId).trim()}`
      : "";
  return `${ts}|${ms}|${name}${liveSuffix}`;
}

export function groupSelectedHistoryRowsByTask(selectedRowIds: string[]) {
  const byTask: Record<string, Set<string>> = {};
  selectedRowIds.forEach((id) => {
    const firstSep = id.indexOf("|");
    if (firstSep <= 0) return;
    const taskId = id.slice(0, firstSep);
    const rowKey = id.slice(firstSep + 1);
    if (!byTask[taskId]) byTask[taskId] = new Set<string>();
    byTask[taskId].add(rowKey);
  });
  return byTask;
}
import { normalizeCompletionDifficulty, type CompletionDifficulty } from "../lib/completionDifficulty";
