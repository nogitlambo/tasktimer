import { localDayKey } from "../lib/history";
import { markTaskTimeGoalCompleted } from "../lib/timeGoalCompletion";
import type { HistoryByTaskId, Task } from "../lib/types";

export type ManualEntryDailyGoalResult = {
  completed: boolean;
  totalTodayMs: number;
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
}): ManualEntryDailyGoalResult {
  const task = args.task;
  const taskId = String(task?.id || "").trim();
  const nowDayKey = localDayKey(args.nowMs);
  if (!taskId || localDayKey(args.manualEntryTs) !== nowDayKey) {
    return { completed: false, totalTodayMs: 0 };
  }

  const goalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!(task?.timeGoalEnabled && task.timeGoalPeriod === "day" && goalMinutes > 0)) {
    return { completed: false, totalTodayMs: 0 };
  }

  const totalTodayMs = getTaskHistoryMsForLocalDay(taskId, args.historyByTaskId, nowDayKey);
  const goalMs = Math.max(1, Math.floor(goalMinutes * 60_000));
  if (totalTodayMs < goalMs) return { completed: false, totalTodayMs };

  markTaskTimeGoalCompleted(task, args.nowMs, {
    reason: "goal",
    elapsedMs: totalTodayMs,
  });
  return { completed: true, totalTodayMs };
}
