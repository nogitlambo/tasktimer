import { localDayKey } from "../lib/history";
import type { HistoryByTaskId, Task } from "../lib/types";

export type DashboardTodayHoursModel = {
  todayMs: number;
  todayLoggedMs: number;
  todayInProgressMs: number;
  yesterdaySameTimeMs: number;
  yesterdaySameTimeEntryCount: number;
  totalDailyGoalMs: number;
  dailyGoalLoggedMs: number;
  dailyGoalInProgressMs: number;
  dailyGoalProjectedMs: number;
  dailyGoalProgressPct: number;
  dailyGoalProjectedPct: number;
  hasUsableTrendBaseline: boolean;
  showDirectionalTrendArrow: boolean;
};

export function buildDashboardTodayHoursModel(options: {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  nowMs: number;
  trendMinBaselineMs: number;
  getElapsedMs: (task: Task) => number;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}): DashboardTodayHoursModel {
  const nowValue = options.nowMs;
  const todayStartDate = new Date(nowValue);
  todayStartDate.setHours(0, 0, 0, 0);
  const todayStartMs = todayStartDate.getTime();
  const elapsedTodayMs = Math.max(0, nowValue - todayStartMs);
  const yesterdayStartMs = todayStartMs - 86400000;
  const yesterdaySameTimeCutoffMs = yesterdayStartMs + elapsedTodayMs;
  const todayKey = localDayKey(nowValue);
  const yesterdayDate = new Date(nowValue);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = localDayKey(yesterdayDate.getTime());
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
  let yesterdaySameTimeMs = 0;
  let yesterdaySameTimeEntryCount = 0;
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
        entryDayKey === yesterdayKey &&
        ts <= yesterdaySameTimeCutoffMs
      ) {
        yesterdaySameTimeMs += ms;
        yesterdaySameTimeEntryCount += 1;
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
  const dailyGoalProjectedMs = dailyGoalLoggedMs + dailyGoalInProgressMs;
  const dailyGoalProgressPct =
    totalDailyGoalMs > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((dailyGoalLoggedMs / totalDailyGoalMs) * 100),
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
    yesterdaySameTimeMs,
    yesterdaySameTimeEntryCount,
    totalDailyGoalMs,
    dailyGoalLoggedMs,
    dailyGoalInProgressMs,
    dailyGoalProjectedMs,
    dailyGoalProgressPct,
    dailyGoalProjectedPct,
    hasUsableTrendBaseline:
      yesterdaySameTimeEntryCount > 0 &&
      yesterdaySameTimeMs >= Math.max(0, options.trendMinBaselineMs),
    showDirectionalTrendArrow: filteredTasks.some((task) =>
      options.isTaskRunning(task),
    ),
  };
}

export function formatDashboardTodayHoursDeltaText(
  model: Pick<DashboardTodayHoursModel, "todayMs" | "yesterdaySameTimeMs">,
  formatDuration: (ms: number) => string,
) {
  if (model.todayMs <= 0 && model.yesterdaySameTimeMs <= 0) {
    return { text: "No time logged today", sentiment: "neutral" as const };
  }
  if (model.yesterdaySameTimeMs <= 0) {
    if (model.todayMs > 0) {
      return {
        text: `+${formatDuration(model.todayMs)} vs this time yesterday`,
        sentiment: "positive" as const,
      };
    }
    return {
      text: "Same as this time yesterday",
      sentiment: "neutral" as const,
    };
  }

  const deltaMs = model.todayMs - model.yesterdaySameTimeMs;
  const deltaText = formatDuration(Math.abs(deltaMs));
  if (deltaMs > 0) {
    return {
      text: `+${deltaText} vs this time yesterday`,
      sentiment: "positive" as const,
    };
  }
  if (deltaMs < 0) {
    return {
      text: `-${deltaText} vs this time yesterday`,
      sentiment: "negative" as const,
    };
  }
  return { text: "Same as this time yesterday", sentiment: "neutral" as const };
}
