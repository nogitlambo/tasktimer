import { localDayKey } from "../lib/history";
import {
  localDayToDashboardWeekStart,
  normalizeOptimalProductivityDays,
  type OptimalProductivityDays,
} from "../lib/productivityPeriod";
import type { HistoryByTaskId, Task } from "../lib/types";

export type DashboardTodayHoursModel = {
  todayMs: number;
  todayLoggedMs: number;
  todayInProgressMs: number;
  previousProductivityDaySameTimeMs: number;
  previousProductivityDaySameTimeEntryCount: number;
  yesterdaySameTimeMs: number;
  yesterdaySameTimeEntryCount: number;
  totalDailyGoalMs: number;
  dailyGoalLoggedMs: number;
  dailyGoalInProgressMs: number;
  dailyGoalElapsedMs: number;
  dailyGoalProjectedMs: number;
  dailyGoalProgressPct: number;
  dailyGoalProjectedPct: number;
  hasUsableTrendBaseline: boolean;
  showDirectionalTrendArrow: boolean;
};

export type DashboardTodayTrendIconModel = {
  className: "trendUp" | "trendUpRight" | "trendRight" | "trendDownRight" | "trendDown";
  label: string;
};

export function classifyDashboardTodayTrendIcon(deltaPct: number): DashboardTodayTrendIconModel {
  const pct = Math.round(Number(deltaPct) || 0);
  if (pct >= 100) return { className: "trendUp", label: "Trending up strongly" };
  if (pct >= 50) return { className: "trendUpRight", label: "Trending up" };
  if (pct >= 0) return { className: "trendRight", label: "Holding steady" };
  if (pct >= -49) return { className: "trendRight", label: "Holding steady" };
  if (pct >= -99) return { className: "trendDownRight", label: "Trending down" };
  return { className: "trendDown", label: "Trending down strongly" };
}

export function buildDashboardTodayHoursModel(options: {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  nowMs: number;
  trendMinBaselineMs: number;
  optimalProductivityDays?: OptimalProductivityDays;
  getElapsedMs: (task: Task) => number;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}): DashboardTodayHoursModel {
  const nowValue = options.nowMs;
  const todayStartDate = new Date(nowValue);
  todayStartDate.setHours(0, 0, 0, 0);
  const todayStartMs = todayStartDate.getTime();
  const elapsedTodayMs = Math.max(0, nowValue - todayStartMs);
  const todayKey = localDayKey(nowValue);
  const productivityDays = normalizeOptimalProductivityDays(options.optimalProductivityDays);
  let previousProductivityDayStartMs = todayStartMs - 86400000;
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidateStartMs = todayStartMs - offset * 86400000;
    if (productivityDays.includes(localDayToDashboardWeekStart(candidateStartMs))) {
      previousProductivityDayStartMs = candidateStartMs;
      break;
    }
  }
  const previousProductivityDaySameTimeCutoffMs = previousProductivityDayStartMs + elapsedTodayMs;
  const previousProductivityDayKey = localDayKey(previousProductivityDayStartMs);
  const filteredTasks = Array.isArray(options.tasks) ? options.tasks : [];
  const includedTaskIds = new Set(
    filteredTasks.map((task) => String(task?.id || "").trim()).filter(Boolean),
  );
  const dailyGoalTasks = filteredTasks.filter((task) => {
    if (!task) return false;
    if (!task.timeGoalEnabled) return false;
    if (task.timeGoalPeriod !== "day") return false;
    return Math.max(0, Number(task.timeGoalMinutes || 0)) > 0;
  });
  const totalDailyGoalMs = dailyGoalTasks.reduce(
    (sum, task) => sum + Math.max(0, Number(task.timeGoalMinutes || 0)) * 60000,
    0,
  );

  let todayLoggedMs = 0;
  let previousProductivityDaySameTimeMs = 0;
  let previousProductivityDaySameTimeEntryCount = 0;
  includedTaskIds.forEach((taskId) => {
    const entries = Array.isArray(options.historyByTaskId?.[taskId])
      ? options.historyByTaskId[taskId]
      : [];
    entries.forEach((entry) => {
      const ts = options.normalizeHistoryTimestampMs(entry?.ts);
      const ms = Math.max(0, Number(entry?.ms) || 0);
      if (!Number.isFinite(ts) || ms <= 0) return;
      const entryDayKey = localDayKey(ts);
      if (entryDayKey === todayKey) todayLoggedMs += ms;
      else if (
        entryDayKey === previousProductivityDayKey &&
        ts <= previousProductivityDaySameTimeCutoffMs
      ) {
        previousProductivityDaySameTimeMs += ms;
        previousProductivityDaySameTimeEntryCount += 1;
      }
    });
  });

  const todayInProgressMs = filteredTasks.reduce((sum, task) => {
    const taskId = String(task?.id || "").trim();
    if (!taskId || !includedTaskIds.has(taskId)) return sum;
    if (!options.isTaskRunning(task)) return sum;
    const elapsedMs = Math.max(0, options.getElapsedMs(task));
    if (elapsedMs <= 0) return sum;
    return sum + elapsedMs;
  }, 0);
  const todayMs = todayLoggedMs + todayInProgressMs;

  const dailyGoalLoggedMs = dailyGoalTasks.reduce((sum, task) => {
    const taskId = String(task.id || "").trim();
    if (!taskId) return sum;
    const entries = Array.isArray(options.historyByTaskId?.[taskId])
      ? options.historyByTaskId[taskId]
      : [];
    const taskTodayMs = entries.reduce((entrySum, entry) => {
      const ts = options.normalizeHistoryTimestampMs(entry?.ts);
      const ms = Math.max(0, Number(entry?.ms) || 0);
      if (!Number.isFinite(ts) || ms <= 0) return entrySum;
      return localDayKey(ts) === todayKey ? entrySum + ms : entrySum;
    }, 0);
    return sum + taskTodayMs;
  }, 0);
  const dailyGoalInProgressMs = dailyGoalTasks.reduce((sum, task) => {
    if (!options.isTaskRunning(task)) return sum;
    const elapsedMs = Math.max(0, options.getElapsedMs(task));
    if (elapsedMs <= 0) return sum;
    return sum + elapsedMs;
  }, 0);
  const dailyGoalElapsedMs = dailyGoalLoggedMs + dailyGoalInProgressMs;
  const dailyGoalProjectedMs = dailyGoalElapsedMs;
  const dailyGoalProgressPct =
    totalDailyGoalMs > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((dailyGoalElapsedMs / totalDailyGoalMs) * 100),
          ),
        )
      : 0;
  const dailyGoalProjectedPct =
    totalDailyGoalMs > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((dailyGoalProjectedMs / totalDailyGoalMs) * 100),
          ),
        )
      : 0;

  return {
    todayMs,
    todayLoggedMs,
    todayInProgressMs,
    previousProductivityDaySameTimeMs,
    previousProductivityDaySameTimeEntryCount,
    yesterdaySameTimeMs: previousProductivityDaySameTimeMs,
    yesterdaySameTimeEntryCount: previousProductivityDaySameTimeEntryCount,
    totalDailyGoalMs,
    dailyGoalLoggedMs,
    dailyGoalInProgressMs,
    dailyGoalElapsedMs,
    dailyGoalProjectedMs,
    dailyGoalProgressPct,
    dailyGoalProjectedPct,
    hasUsableTrendBaseline:
      previousProductivityDaySameTimeEntryCount > 0 &&
      previousProductivityDaySameTimeMs >= Math.max(0, options.trendMinBaselineMs),
    showDirectionalTrendArrow: filteredTasks.some((task) =>
      options.isTaskRunning(task),
    ),
  };
}

export function formatDashboardTodayHoursDeltaText(
  model: Pick<DashboardTodayHoursModel, "todayMs"> & Partial<Pick<DashboardTodayHoursModel, "previousProductivityDaySameTimeMs" | "yesterdaySameTimeMs">>,
  formatDuration: (ms: number) => string,
) {
  const previousMs = model.previousProductivityDaySameTimeMs ?? model.yesterdaySameTimeMs ?? 0;
  if (model.todayMs <= 0 && previousMs <= 0) {
    return { text: "No time logged today", sentiment: "neutral" as const };
  }
  if (previousMs <= 0) {
    if (model.todayMs > 0) {
      return {
        text: `+${formatDuration(model.todayMs)} vs previous productivity day`,
        sentiment: "positive" as const,
      };
    }
    return {
      text: "Same as previous productivity day",
      sentiment: "neutral" as const,
    };
  }

  const deltaMs = model.todayMs - previousMs;
  const deltaText = formatDuration(Math.abs(deltaMs));
  if (deltaMs > 0) {
    return {
      text: `+${deltaText} vs previous productivity day`,
      sentiment: "positive" as const,
    };
  }
  if (deltaMs < 0) {
    return {
      text: `-${deltaText} vs previous productivity day`,
      sentiment: "negative" as const,
    };
  }
  return { text: "Same as previous productivity day", sentiment: "neutral" as const };
}
