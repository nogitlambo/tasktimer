import { localDayKey, normalizeHistoryTimestampMs } from "./history";
import type { HistoryByTaskId, Task } from "./types";

export type TimeGoalCompletedReason = NonNullable<Task["timeGoalCompletedReason"]>;

export function getTimeGoalCompletionDayKey(nowValue = Date.now()): string {
  return localDayKey(nowValue);
}

export function isTaskTimeGoalCompletedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  const completedDayKey = String(task?.timeGoalCompletedDayKey || "").trim();
  return !!completedDayKey && completedDayKey === getTimeGoalCompletionDayKey(nowValue);
}

export function isTaskTimeGoalStartLockedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  return isTaskTimeGoalCompletedToday(task, nowValue) && task?.timeGoalCompletedReason !== "reset";
}

export function hasTaskGoalHistoryEntryToday(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now()
): boolean {
  const taskId = String(task?.id || "").trim();
  const goalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!taskId || !(task?.timeGoalEnabled && task.timeGoalPeriod === "day" && goalMinutes > 0)) return false;
  const todayKey = getTimeGoalCompletionDayKey(nowValue);
  const goalMs = Math.max(0, Math.round(goalMinutes * 60_000));
  const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
  return entries.some((entry) => {
    const entryTs = normalizeHistoryTimestampMs(entry?.ts);
    if (entryTs <= 0 || localDayKey(entryTs) !== todayKey) return false;
    return Math.max(0, Math.floor(Number(entry?.ms || 0) || 0)) >= goalMs;
  });
}

export function isTaskTimeGoalStartLockedByHistoryToday(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now()
): boolean {
  return isTaskTimeGoalStartLockedToday(task, nowValue) && hasTaskGoalHistoryEntryToday(task, historyByTaskId, nowValue);
}

function normalizeCompletedElapsedMs(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.floor(Number(value)));
}

export function markTaskTimeGoalCompleted(
  task: Task,
  completedAtMs = Date.now(),
  opts?: { reason?: TimeGoalCompletedReason; elapsedMs?: number | null }
): void {
  task.timeGoalCompletedDayKey = getTimeGoalCompletionDayKey(completedAtMs);
  task.timeGoalCompletedAtMs = Math.max(0, Math.floor(Number(completedAtMs || 0) || 0));
  task.timeGoalCompletedReason = opts?.reason === "reset" ? "reset" : "goal";
  task.timeGoalCompletedElapsedMs = normalizeCompletedElapsedMs(opts?.elapsedMs);
}

export function markTaskTimeGoalResetCompleted(task: Task, completedAtMs = Date.now(), elapsedMs?: number | null): void {
  markTaskTimeGoalCompleted(task, completedAtMs, { reason: "reset", elapsedMs });
}
