import { localDayKey } from "./history";
import type { Task } from "./types";

export type TimeGoalCompletedReason = NonNullable<Task["timeGoalCompletedReason"]>;

export function getTimeGoalCompletionDayKey(nowValue = Date.now()): string {
  return localDayKey(nowValue);
}

export function isTaskTimeGoalCompletedToday(task: Task | null | undefined, nowValue = Date.now()): boolean {
  const completedDayKey = String(task?.timeGoalCompletedDayKey || "").trim();
  return !!completedDayKey && completedDayKey === getTimeGoalCompletionDayKey(nowValue);
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
