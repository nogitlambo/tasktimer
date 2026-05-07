import { localDayKey } from "./history";
import type { Task } from "./types";

export function getTimeGoalCompletionDayKey(nowValue = Date.now()): string {
  return localDayKey(nowValue);
}

export function isTaskTimeGoalCompletedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  const completedDayKey = String(task?.timeGoalCompletedDayKey || "").trim();
  return !!completedDayKey && completedDayKey === getTimeGoalCompletionDayKey(nowValue);
}

export function markTaskTimeGoalCompleted(task: Task, completedAtMs = Date.now()): void {
  task.timeGoalCompletedDayKey = getTimeGoalCompletionDayKey(completedAtMs);
  task.timeGoalCompletedAtMs = Math.max(0, Math.floor(Number(completedAtMs || 0) || 0));
}
