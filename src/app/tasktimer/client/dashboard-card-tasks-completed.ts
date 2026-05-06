import { localDayKey } from "../lib/history";
import type { HistoryByTaskId, Task } from "../lib/types";
import { normalizeTaskColor } from "../lib/taskColors";

export type DashboardTasksCompletedItem = {
  name: string;
  goalMinutes: number;
  progress: number;
  complete: boolean;
  running: boolean;
  color: string;
};

export type DashboardTasksCompletedModel = {
  totalCompleted: number;
  totalPossible: number;
  hasData: boolean;
  items: DashboardTasksCompletedItem[];
  ariaLabel: string;
};

export function buildDashboardTasksCompletedModel(options: {
  dueTasks: Task[];
  historyByTaskId: HistoryByTaskId;
  nowMs: number;
  weekStartMs: number;
  todayKey?: string;
  fallbackColor: string;
  getElapsedMs: (task: Task) => number;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}): DashboardTasksCompletedModel {
  const todayKey = options.todayKey || localDayKey(options.nowMs);
  const dailyTaskGoalMinutes = new Map<string, number>();
  const dailyLoggedMsByTask = new Map<string, number>();
  const dailyLiveMsByTask = new Map<string, number>();
  const dailyProgressByTask = new Map<string, number>();
  const dailyLiveProgressByTask = new Map<string, number>();

  options.dueTasks.forEach((task) => {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const goalMinutes = task.timeGoalEnabled && task.timeGoalPeriod === "day" ? Math.max(0, Number(task.timeGoalMinutes || 0)) : 0;
    dailyTaskGoalMinutes.set(taskId, goalMinutes);

    const entries = Array.isArray(options.historyByTaskId?.[taskId]) ? options.historyByTaskId[taskId] : [];
    entries.forEach((entry) => {
      const ts = options.normalizeHistoryTimestampMs(entry?.ts);
      const ms = Math.max(0, Number(entry?.ms) || 0);
      if (!Number.isFinite(ts) || ts < options.weekStartMs || ts > options.nowMs) return;
      if (!Number.isFinite(ms) || ms <= 0) return;
      if (localDayKey(ts) !== todayKey) return;
      dailyLoggedMsByTask.set(taskId, (dailyLoggedMsByTask.get(taskId) || 0) + ms);
    });
    if (options.isTaskRunning(task)) {
      dailyLiveMsByTask.set(taskId, Math.max(0, options.getElapsedMs(task)));
    }
  });

  let totalCompleted = 0;
  options.dueTasks.forEach((task) => {
    const taskId = String(task.id || "").trim();
    const goalMinutes = dailyTaskGoalMinutes.get(taskId) || 0;
    const loggedMs = dailyLoggedMsByTask.get(taskId) || 0;
    const liveMs = dailyLiveMsByTask.get(taskId) || 0;
    const progress = goalMinutes > 0 ? Math.max(0, Math.min(1, loggedMs / (goalMinutes * 60000))) : loggedMs > 0 || liveMs > 0 ? 1 : 0;
    dailyProgressByTask.set(taskId, progress);
    if (progress >= 1) totalCompleted += 1;
  });

  options.dueTasks.forEach((task) => {
    const taskId = String(task.id || "").trim();
    const goalMinutes = dailyTaskGoalMinutes.get(taskId) || 0;
    if (!taskId) return;
    const loggedMs = dailyLoggedMsByTask.get(taskId) || 0;
    const liveMs = dailyLiveMsByTask.get(taskId) || 0;
    const liveProgress = goalMinutes > 0 ? Math.max(0, Math.min(1, (loggedMs + liveMs) / (goalMinutes * 60000))) : loggedMs > 0 || liveMs > 0 ? 1 : 0;
    dailyLiveProgressByTask.set(taskId, liveProgress);
  });

  const totalPossible = options.dueTasks.length;
  return {
    totalCompleted,
    totalPossible,
    hasData: totalCompleted > 0 || totalPossible > 0,
    items: options.dueTasks.map((task) => {
      const taskId = String(task.id || "").trim();
      const progress = Math.max(0, Math.min(1, dailyLiveProgressByTask.get(taskId) ?? dailyProgressByTask.get(taskId) ?? 0));
      return {
        name: String(task.name || "Task"),
        goalMinutes: dailyTaskGoalMinutes.get(taskId) || 0,
        progress,
        complete: Math.max(0, Math.min(1, dailyProgressByTask.get(taskId) || 0)) >= 1,
        running: options.isTaskRunning(task),
        color: normalizeTaskColor(task.color) || options.fallbackColor,
      };
    }),
    ariaLabel:
      totalPossible > 0
        ? `Today's task completion. ${totalCompleted} of ${totalPossible} daily completion opportunities complete.`
        : "Today's task completion. 0 of 0 daily completion opportunities complete.",
  };
}
