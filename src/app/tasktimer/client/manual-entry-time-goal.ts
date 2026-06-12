import { localDayKey } from "../lib/history";
import { normalizeDashboardWeekStart, startOfCurrentWeekMs, type DashboardWeekStart } from "../lib/historyChart";
import { markTaskTimeGoalCompleted } from "../lib/timeGoalCompletion";
import type { HistoryByTaskId, Task } from "../lib/types";

export type ManualEntryDailyGoalResult = {
  completed: boolean;
  totalTodayMs: number;
  totalPeriodMs?: number;
};

export function getTaskHistoryMsForLocalDay(
  taskId: string,
  historyByTaskId: HistoryByTaskId,
  dayKey: string,
): number {
  const entries = historyByTaskId[String(taskId || "").trim()] || [];
  return entries.reduce((total, entry) => {
    const ts = Number(entry?.ts || 0);
    if (!(ts > 0) || localDayKey(ts) !== dayKey) return total;
    const ms = Number(entry?.ms || 0);
    return total + (Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0);
  }, 0);
}

export function completeManualEntryDailyGoalIfReached(args: {
  task: Task | null | undefined;
  historyByTaskId: HistoryByTaskId;
  manualEntryTs: number;
  nowMs: number;
  weekStarting?: DashboardWeekStart;
}): ManualEntryDailyGoalResult {
  const task = args.task;
  const taskId = String(task?.id || "").trim();
  const nowDayKey = localDayKey(args.nowMs);
  const period = task?.timeGoalPeriod === "day" ? "day" : "week";
  const weekStarting = normalizeDashboardWeekStart(args.weekStarting);
  const nowWeekStartMs = startOfCurrentWeekMs(args.nowMs, weekStarting);
  const manualEntryInPeriod =
    period === "day"
      ? localDayKey(args.manualEntryTs) === nowDayKey
      : args.manualEntryTs >= nowWeekStartMs && args.manualEntryTs < nowWeekStartMs + 7 * 24 * 60 * 60 * 1000;
  if (!taskId || !manualEntryInPeriod) {
    return { completed: false, totalTodayMs: 0 };
  }

  const goalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!(task?.timeGoalEnabled && goalMinutes > 0)) {
    return { completed: false, totalTodayMs: 0 };
  }

  const totalTodayMs = getTaskHistoryMsForLocalDay(taskId, args.historyByTaskId, nowDayKey);
  const totalPeriodMs =
    period === "day"
      ? totalTodayMs
      : (args.historyByTaskId[String(taskId || "").trim()] || []).reduce((total, entry) => {
          const ts = Number(entry?.ts || 0);
          if (!(ts >= nowWeekStartMs && ts < nowWeekStartMs + 7 * 24 * 60 * 60 * 1000)) return total;
          const ms = Number(entry?.ms || 0);
          return total + (Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0);
        }, 0);
  const goalMs = Math.max(1, Math.floor(goalMinutes * 60_000));
  if (totalPeriodMs < goalMs) {
    return period === "day"
      ? { completed: false, totalTodayMs }
      : { completed: false, totalTodayMs, totalPeriodMs };
  }

  markTaskTimeGoalCompleted(task, args.nowMs, {
    reason: "goal",
    elapsedMs: goalMs,
    weekStarting,
  });
  return period === "day"
    ? { completed: true, totalTodayMs }
    : { completed: true, totalTodayMs, totalPeriodMs };
}
