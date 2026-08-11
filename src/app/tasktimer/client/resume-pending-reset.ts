import { localDayKey } from "../lib/history";
import type { DashboardWeekStart } from "../lib/historyChart";
import { isTaskTimeGoalCompletedForPeriod } from "../lib/timeGoalCompletion";
import type { Task } from "../lib/types";

export type ResumePendingResetResult = {
  changedTaskIds: string[];
};

export function normalizeResumePendingSinceDayKey(value: unknown): string | null {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function hasGoalCompletedTaskRun(task: Task | null | undefined): boolean {
  if (!task || task.timeGoalCompletedReason !== "goal") return false;
  const completedAtMs = Math.max(0, Math.floor(Number(task.timeGoalCompletedAtMs || 0) || 0));
  if (!(completedAtMs > 0)) return false;
  return String(task.timeGoalCompletedDayKey || "").trim() === localDayKey(completedAtMs);
}

function isRecurringTask(task: Task | null | undefined): boolean {
  return task?.taskType !== "once-off";
}

function resetCompletedRecurringTaskForNewPeriod(task: Task): boolean {
  let changed = false;
  if (Math.max(0, Math.floor(Number(task.accumulatedMs || 0) || 0)) !== 0) {
    task.accumulatedMs = 0;
    changed = true;
  }
  if (Number((task as Task & { elapsed?: unknown }).elapsed || 0) !== 0) {
    task.elapsed = 0;
    changed = true;
  }
  if (task.running) {
    task.running = false;
    changed = true;
  }
  if (task.startMs !== null) {
    task.startMs = null;
    changed = true;
  }
  if (task.hasStarted) {
    task.hasStarted = false;
    changed = true;
  }
  if (task.resumePendingSinceDayKey !== null) {
    task.resumePendingSinceDayKey = null;
    changed = true;
  }
  return changed;
}

export function reconcileResumePendingTasks(tasks: Task[], nowValue = Date.now(), weekStarting: DashboardWeekStart = "mon"): ResumePendingResetResult {
  const todayKey = localDayKey(nowValue);
  const changedTaskIds: string[] = [];
  if (!Array.isArray(tasks) || !todayKey) return { changedTaskIds };

  tasks.forEach((task) => {
    if (!task) return;
    const taskId = String(task.id || "").trim();
    const elapsedMs = Math.max(0, Math.floor(Number(task.accumulatedMs || 0) || 0));
    const marker = normalizeResumePendingSinceDayKey(task.resumePendingSinceDayKey);
    const hasCompletedGoalRun = hasGoalCompletedTaskRun(task);
    const completedForCurrentPeriod = isTaskTimeGoalCompletedForPeriod(task, nowValue, weekStarting);

    if (hasCompletedGoalRun && isRecurringTask(task) && !completedForCurrentPeriod) {
      if (resetCompletedRecurringTaskForNewPeriod(task) && taskId) changedTaskIds.push(taskId);
      return;
    }

    if (task.running || elapsedMs <= 0) {
      if (task.resumePendingSinceDayKey != null) {
        task.resumePendingSinceDayKey = null;
        if (taskId) changedTaskIds.push(taskId);
      }
      return;
    }

    if (hasCompletedGoalRun) {
      if (task.resumePendingSinceDayKey != null) {
        task.resumePendingSinceDayKey = null;
        if (taskId) changedTaskIds.push(taskId);
      }
      return;
    }

    if (!marker) {
      task.resumePendingSinceDayKey = todayKey;
      if (taskId) changedTaskIds.push(taskId);
      return;
    }

    if (marker < todayKey) {
      task.startMs = null;
      task.hasStarted = true;
      task.resumePendingSinceDayKey = todayKey;
      if (taskId) changedTaskIds.push(taskId);
    } else if (task.resumePendingSinceDayKey !== marker) {
      task.resumePendingSinceDayKey = marker;
      if (taskId) changedTaskIds.push(taskId);
    }
  });

  return { changedTaskIds: Array.from(new Set(changedTaskIds)) };
}
