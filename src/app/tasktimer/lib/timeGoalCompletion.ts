import { localDayKey, normalizeHistoryTimestampMs } from "./history";
import { normalizeDashboardWeekStart, startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import type { HistoryByTaskId, Task } from "./types";

export type TimeGoalCompletedReason = NonNullable<Task["timeGoalCompletedReason"]>;

export function getTimeGoalCompletionDayKey(nowValue = Date.now()): string {
  return localDayKey(nowValue);
}

export function getTimeGoalCompletionWeekKey(nowValue = Date.now(), weekStarting: DashboardWeekStart = "mon"): string {
  return localDayKey(startOfCurrentWeekMs(nowValue, normalizeDashboardWeekStart(weekStarting)));
}

export function isTaskTimeGoalCompletedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  const completedDayKey = String(task?.timeGoalCompletedDayKey || "").trim();
  return !!completedDayKey && completedDayKey === getTimeGoalCompletionDayKey(nowValue);
}

export function isTaskTimeGoalCompletedThisWeek(
  task: Task | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  const completedWeekKey = String(task?.timeGoalCompletedWeekKey || "").trim();
  return !!completedWeekKey && completedWeekKey === getTimeGoalCompletionWeekKey(nowValue, weekStarting);
}

export function isTaskTimeGoalCompletedForPeriod(
  task: Task | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  return task?.timeGoalPeriod === "week"
    ? isTaskTimeGoalCompletedThisWeek(task, nowValue, weekStarting)
    : isTaskTimeGoalCompletedToday(task, nowValue);
}

export function isTaskTimeGoalStartLockedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  return isTaskTimeGoalCompletedToday(task, nowValue) && task?.timeGoalCompletedReason !== "reset";
}

export function isTaskTimeGoalStartLockedForPeriod(
  task: Task | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  return isTaskTimeGoalCompletedForPeriod(task, nowValue, weekStarting) && task?.timeGoalCompletedReason !== "reset";
}

function getTaskGoalMs(task: Task | null | undefined): number {
  const goalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!(task?.timeGoalEnabled && goalMinutes > 0)) return 0;
  return Math.max(0, Math.round(goalMinutes * 60_000));
}

export function hasTaskGoalHistoryEntryToday(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now()
): boolean {
  const taskId = String(task?.id || "").trim();
  if (!taskId || task?.timeGoalPeriod !== "day") return false;
  const todayKey = getTimeGoalCompletionDayKey(nowValue);
  const goalMs = getTaskGoalMs(task);
  if (!(goalMs > 0)) return false;
  const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
  return entries.some((entry) => {
    const entryTs = normalizeHistoryTimestampMs(entry?.ts);
    if (entryTs <= 0 || localDayKey(entryTs) !== todayKey) return false;
    return Math.max(0, Math.floor(Number(entry?.ms || 0) || 0)) >= goalMs;
  });
}

export function hasTaskGoalHistoryEntryThisWeek(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  const taskId = String(task?.id || "").trim();
  if (!taskId || task?.timeGoalPeriod !== "week") return false;
  const weekStartMs = startOfCurrentWeekMs(nowValue, normalizeDashboardWeekStart(weekStarting));
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
  const goalMs = getTaskGoalMs(task);
  if (!(goalMs > 0)) return false;
  const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
  const loggedMs = entries.reduce((sum, entry) => {
    const entryTs = normalizeHistoryTimestampMs(entry?.ts);
    if (entryTs < weekStartMs || entryTs >= weekEndMs) return sum;
    return sum + Math.max(0, Math.floor(Number(entry?.ms || 0) || 0));
  }, 0);
  return loggedMs >= goalMs;
}

export function hasTaskGoalHistoryEntryForPeriod(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  return task?.timeGoalPeriod === "week"
    ? hasTaskGoalHistoryEntryThisWeek(task, historyByTaskId, nowValue, weekStarting)
    : hasTaskGoalHistoryEntryToday(task, historyByTaskId, nowValue);
}

export function hasTaskReachedTimeGoal(task: Task | null | undefined, elapsedMsRaw: unknown): boolean {
  if (task?.timeGoalPeriod !== "day" && task?.timeGoalPeriod !== "week") return false;
  const goalMs = getTaskGoalMs(task);
  if (!(goalMs > 0)) return false;
  const elapsedMs = Math.max(0, Math.floor(Number(elapsedMsRaw || 0) || 0));
  return elapsedMs >= goalMs;
}

export function hasTaskReachedDailyTimeGoal(task: Task | null | undefined, elapsedMsRaw: unknown): boolean {
  if (task?.timeGoalPeriod !== "day") return false;
  return hasTaskReachedTimeGoal(task, elapsedMsRaw);
}

export function isTaskTimeGoalStartLockedByHistoryToday(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now()
): boolean {
  return isTaskTimeGoalStartLockedToday(task, nowValue) && hasTaskGoalHistoryEntryToday(task, historyByTaskId, nowValue);
}

export function isTaskTimeGoalStartLockedByHistoryForPeriod(
  task: Task | null | undefined,
  historyByTaskId: HistoryByTaskId | null | undefined,
  nowValue = Date.now(),
  weekStarting: DashboardWeekStart = "mon"
): boolean {
  return (
    isTaskTimeGoalStartLockedForPeriod(task, nowValue, weekStarting) &&
    hasTaskGoalHistoryEntryForPeriod(task, historyByTaskId, nowValue, weekStarting)
  );
}

function normalizeCompletedElapsedMs(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.floor(Number(value)));
}

export function markTaskTimeGoalCompleted(
  task: Task,
  completedAtMs = Date.now(),
  opts?: { reason?: TimeGoalCompletedReason; elapsedMs?: number | null; weekStarting?: DashboardWeekStart }
): void {
  task.timeGoalCompletedDayKey = getTimeGoalCompletionDayKey(completedAtMs);
  task.timeGoalCompletedWeekKey = getTimeGoalCompletionWeekKey(completedAtMs, opts?.weekStarting || "mon");
  task.timeGoalCompletedAtMs = Math.max(0, Math.floor(Number(completedAtMs || 0) || 0));
  task.timeGoalCompletedReason = opts?.reason === "reset" ? "reset" : "goal";
  task.timeGoalCompletedElapsedMs = normalizeCompletedElapsedMs(opts?.elapsedMs);
}

export function markTaskTimeGoalResetCompleted(
  task: Task,
  completedAtMs = Date.now(),
  elapsedMs?: number | null,
  weekStarting?: DashboardWeekStart
): void {
  markTaskTimeGoalCompleted(task, completedAtMs, { reason: "reset", elapsedMs, weekStarting });
}
