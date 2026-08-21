import type { Task } from "./types";

function normalizePositiveMs(value: unknown): number | null {
  if (!Number.isFinite(Number(value))) return null;
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
}

export function getNextLocalMidnightMs(nowMs = Date.now()): number {
  const nextMidnight = new Date(nowMs);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime();
}

export function isTaskMarkedDone(task: Task | null | undefined, nowMs = Date.now()): boolean {
  if (!normalizePositiveMs(task?.markedDoneAtMs)) return false;
  if (task?.taskType === "once-off") return true;
  const markedDoneUntilMs = normalizePositiveMs(task?.markedDoneUntilMs);
  return markedDoneUntilMs != null && markedDoneUntilMs > nowMs;
}

export function isCompletedOnceOffTask(task: Task | null | undefined): boolean {
  return task?.taskType === "once-off" && normalizePositiveMs(task.markedDoneAtMs) != null;
}

export function markTaskDone(task: Task, nowMs = Date.now()): void {
  task.markedDoneAtMs = Math.max(1, Math.floor(nowMs));
  task.markedDoneUntilMs = task.taskType === "once-off" ? null : getNextLocalMidnightMs(nowMs);
  task.nextBestActionSnoozedUntilMs = null;
}

export function clearTaskMarkedDone(task: Task): void {
  task.markedDoneAtMs = null;
  task.markedDoneUntilMs = null;
}

export function snoozeTaskForToday(task: Task, nowMs = Date.now()): number {
  const snoozedUntilMs = getNextLocalMidnightMs(nowMs);
  task.nextBestActionSnoozedUntilMs = snoozedUntilMs;
  return snoozedUntilMs;
}

export function isTaskSnoozedForNextBestAction(task: Task | null | undefined, nowMs = Date.now()): boolean {
  const snoozedUntilMs = normalizePositiveMs(task?.nextBestActionSnoozedUntilMs);
  return snoozedUntilMs != null && snoozedUntilMs > nowMs;
}
