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

export type HistoryManagerRowEntry = {
  ts: unknown;
  ms: unknown;
  name: unknown;
};

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
  return `${ts}|${ms}|${name}`;
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
