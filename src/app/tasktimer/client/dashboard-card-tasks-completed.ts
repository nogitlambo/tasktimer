import type { HistoryByTaskId, Task } from "../lib/types";
import { isTaskPlannedActivationEligible } from "../lib/schedule-placement";
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

export type DashboardTasksCompletedOpportunity = {
  task: Task;
  goalMinutes: number;
  historyScope: "day" | "week";
};

function localDayKeyForTimestamp(value: number) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldIncludeTaskOverviewForPlannedActivation(options: {
  task: Task;
  historyByTaskId: HistoryByTaskId;
  nowMs: number;
  weekStartMs: number;
  todayKey: string;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}) {
  const nowDate = new Date(options.nowMs);
  const eligible = isTaskPlannedActivationEligible(options.task, {
    localDate: options.todayKey,
    localTime: `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`,
  });
  if (eligible) return true;
  if (options.isTaskRunning(options.task)) return true;

  const weekly = options.task.taskType !== "once-off" && options.task.timeGoalPeriod === "week";
  const entries = options.historyByTaskId[String(options.task.id || "").trim()] || [];
  const hasCurrentHistory = entries.some((entry) => {
    const timestamp = options.normalizeHistoryTimestampMs(entry?.ts);
    if (!(timestamp > 0) || timestamp > options.nowMs) return false;
    return weekly ? timestamp >= options.weekStartMs : localDayKeyForTimestamp(timestamp) === options.todayKey;
  });
  if (hasCurrentHistory) return true;

  const completionAtMs = Number(options.task.timeGoalCompletedAtMs);
  if (!Number.isFinite(completionAtMs) || completionAtMs > options.nowMs) return false;
  return weekly
    ? String(options.task.timeGoalCompletedWeekKey || "").trim() === localDayKeyForTimestamp(options.weekStartMs)
    : String(options.task.timeGoalCompletedDayKey || "").trim() === options.todayKey;
}

export function buildDashboardTasksCompletedModel(options: {
  opportunities: DashboardTasksCompletedOpportunity[];
  historyByTaskId: HistoryByTaskId;
  nowMs: number;
  weekStartMs: number;
  todayKey: string;
  fallbackColor: string;
  getElapsedMs: (task: Task) => number;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}): DashboardTasksCompletedModel {
  const loggedMsByOpportunity = new Map<number, number>();
  const liveMsByOpportunity = new Map<number, number>();
  const progressByOpportunity = new Map<number, number>();
  const liveProgressByOpportunity = new Map<number, number>();
  const completeByOpportunity = new Map<number, boolean>();

  function isCurrentPeriodCompletion(opportunity: DashboardTasksCompletedOpportunity) {
    const { task, historyScope } = opportunity;
    const completedAtMs = Number(task.timeGoalCompletedAtMs);
    if (!Number.isFinite(completedAtMs) || completedAtMs > options.nowMs) return false;
    if (historyScope === "week") {
      return completedAtMs >= options.weekStartMs && String(task.timeGoalCompletedWeekKey || "").trim() === localDayKeyForTimestamp(options.weekStartMs);
    }
    return (
      options.normalizeHistoryTimestampMs(completedAtMs) > 0 &&
      String(task.timeGoalCompletedDayKey || "").trim() === options.todayKey &&
      options.todayKey === localDayKeyForTimestamp(completedAtMs)
    );
  }

  function getGoalCompletionProgress(opportunity: DashboardTasksCompletedOpportunity, goalMinutes: number) {
    const { task } = opportunity;
    if (goalMinutes <= 0) return null;
    if (task.timeGoalCompletedReason !== "goal") return null;
    if (!isCurrentPeriodCompletion(opportunity)) return null;
    const elapsedMs = Number(task.timeGoalCompletedElapsedMs);
    if (!Number.isFinite(elapsedMs)) return null;
    const completionGoalMinutes = getCompletionGoalMinutes(opportunity, goalMinutes);
    return elapsedMs >= completionGoalMinutes * 60000 ? 1 : null;
  }

  function getCompletionGoalMinutes(opportunity: DashboardTasksCompletedOpportunity, goalMinutes: number) {
    const taskGoalMinutes = Math.max(0, Number(opportunity.task.timeGoalMinutes || 0));
    return opportunity.historyScope === "day" && opportunity.task.timeGoalPeriod === "day" && taskGoalMinutes > 0
      ? taskGoalMinutes
      : goalMinutes;
  }

  function getResetCompletionProgress(opportunity: DashboardTasksCompletedOpportunity, goalMinutes: number) {
    const { task } = opportunity;
    if (goalMinutes <= 0) return null;
    if (task.timeGoalCompletedReason !== "reset") return null;
    if (!isCurrentPeriodCompletion(opportunity)) return null;
    const elapsedMs = Number(task.timeGoalCompletedElapsedMs);
    if (!Number.isFinite(elapsedMs)) return null;
    return Math.max(0, Math.min(1, elapsedMs / (getCompletionGoalMinutes(opportunity, goalMinutes) * 60000)));
  }

  options.opportunities.forEach((opportunity, index) => {
    const { task, historyScope } = opportunity;
    const taskId = String(task.id || "").trim();
    if (!taskId) return;

    const entries = Array.isArray(options.historyByTaskId?.[taskId]) ? options.historyByTaskId[taskId] : [];
    entries.forEach((entry) => {
      const ts = options.normalizeHistoryTimestampMs(entry?.ts);
      const ms = Math.max(0, Number(entry?.ms) || 0);
      if (!Number.isFinite(ts) || ts > options.nowMs) return;
      if (historyScope === "week") {
        if (ts < options.weekStartMs) return;
      } else if (localDayKeyForTimestamp(ts) !== options.todayKey) {
        return;
      }
      if (!Number.isFinite(ms) || ms <= 0) return;
      loggedMsByOpportunity.set(index, (loggedMsByOpportunity.get(index) || 0) + ms);
    });
    if (options.isTaskRunning(task)) {
      liveMsByOpportunity.set(index, Math.max(0, options.getElapsedMs(task)));
    }
  });

  let totalCompleted = 0;
  options.opportunities.forEach((opportunity, index) => {
    const goalMinutes = Math.max(0, Math.floor(Number(opportunity.goalMinutes || 0)));
    const loggedMs = loggedMsByOpportunity.get(index) || 0;
    const liveMs = liveMsByOpportunity.get(index) || 0;
    const resetProgress = getResetCompletionProgress(opportunity, goalMinutes);
    const goalProgress = getGoalCompletionProgress(opportunity, goalMinutes);
    const progress = goalProgress ?? resetProgress ?? (goalMinutes > 0 ? Math.max(0, Math.min(1, loggedMs / (goalMinutes * 60000))) : loggedMs > 0 || liveMs > 0 ? 1 : 0);
    progressByOpportunity.set(index, progress);
    const complete = progress >= 1;
    completeByOpportunity.set(index, complete);
    if (complete) totalCompleted += 1;
  });

  options.opportunities.forEach((opportunity, index) => {
    const goalMinutes = Math.max(0, Math.floor(Number(opportunity.goalMinutes || 0)));
    const loggedMs = loggedMsByOpportunity.get(index) || 0;
    const liveMs = liveMsByOpportunity.get(index) || 0;
    const resetProgress = getResetCompletionProgress(opportunity, goalMinutes);
    const goalProgress = getGoalCompletionProgress(opportunity, goalMinutes);
    const liveProgress = goalProgress ?? resetProgress ?? (goalMinutes > 0 ? Math.max(0, Math.min(1, (loggedMs + liveMs) / (goalMinutes * 60000))) : loggedMs > 0 || liveMs > 0 ? 1 : 0);
    liveProgressByOpportunity.set(index, liveProgress);
  });

  const totalPossible = options.opportunities.length;
  return {
    totalCompleted,
    totalPossible,
    hasData: totalCompleted > 0 || totalPossible > 0,
    items: options.opportunities.map((opportunity, index) => {
      const { task } = opportunity;
      const progress = Math.max(0, Math.min(1, liveProgressByOpportunity.get(index) ?? progressByOpportunity.get(index) ?? 0));
      return {
        name: String(task.name || "Task"),
        goalMinutes: Math.max(0, Math.floor(Number(opportunity.goalMinutes || 0))),
        progress,
        complete: completeByOpportunity.get(index) === true,
        running: options.isTaskRunning(task),
        color: normalizeTaskColor(task.color) || options.fallbackColor,
      };
    }),
    ariaLabel:
      totalPossible > 0
        ? `Today's task completion. ${totalCompleted} of ${totalPossible} scheduled task opportunities complete.`
        : "Today's task completion. 0 of 0 scheduled task opportunities complete.",
  };
}
