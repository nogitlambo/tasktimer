import { localDayKey } from "../lib/history";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "../lib/historyChart";
import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "../lib/types";
import { fillBackgroundForPct } from "../lib/colors";
import { normalizeTaskColor } from "../lib/taskColors";

type ActivityHistoryEntry = HistoryEntry & {
  isLiveSession?: boolean;
};

export type DashboardActivityOverviewSession = {
  taskId: string;
  taskName: string;
  ts: number;
  ms: number;
  note: string;
  color: string;
  isLive: boolean;
};

export type DashboardActivityOverviewTaskRow = {
  taskId: string;
  taskName: string;
  totalMs: number;
  color: string;
  archived: boolean;
};

export type DashboardActivityOverviewDay = {
  key: string;
  startMs: number;
  endMs: number;
  label: string;
  dateLabel: string;
  longLabel: string;
  totalMs: number;
  cumulativeMs: number;
  previousWeekTotalMs: number;
  previousWeekCumulativeMs: number;
  activityBarColor: string;
  activityProgressPct: number | null;
  taskRows: DashboardActivityOverviewTaskRow[];
  sessions: DashboardActivityOverviewSession[];
};

export type DashboardActivityOverviewModel = {
  weekStartMs: number;
  weekEndMs: number;
  totalGoalMs: number;
  dailyPaceTargetMs: number;
  weekTotalMs: number;
  previousWeekTotalMs: number;
  maxChartMs: number;
  hasGoal: boolean;
  hasActivity: boolean;
  hasPreviousWeekActivity: boolean;
  days: DashboardActivityOverviewDay[];
};

const DASHBOARD_ACTIVITY_BAR_FALLBACK_COLOR = "#d9ff59";

function formatWeekdayShort(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
}

function formatMonthDay(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function normalizeMs(value: unknown) {
  const next = Math.max(0, Math.floor(Number(value) || 0));
  return Number.isFinite(next) ? next : 0;
}

function normalizeTimestamp(value: unknown, normalizeHistoryTimestampMs: (value: unknown) => number) {
  const ts = normalizeHistoryTimestampMs(value);
  return Number.isFinite(ts) ? ts : 0;
}

function getTaskGoalMs(task: Task) {
  if (!task?.timeGoalEnabled) return 0;
  const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
  if (!(goalMinutes > 0)) return 0;
  if (task.timeGoalPeriod === "day") return goalMinutes * 7 * 60000;
  if (task.timeGoalPeriod === "week") return goalMinutes * 60000;
  return 0;
}

export function buildDashboardActivityOverviewModel(options: {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  weekStarting: DashboardWeekStart;
  nowMs: number;
  getElapsedMs: (task: Task) => number;
  isTaskRunning: (task: Task) => boolean;
  normalizeHistoryTimestampMs: (value: unknown) => number;
}): DashboardActivityOverviewModel {
  const tasks = Array.isArray(options.tasks) ? options.tasks.filter(Boolean) : [];
  const taskById = new Map<string, Task>();
  const taskNameById = new Map<string, string>();
  const taskColorById = new Map<string, string>();
  tasks.forEach((task) => {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return;
    taskById.set(taskId, task);
    taskNameById.set(taskId, String(task.name || "").trim() || "Task");
    taskColorById.set(taskId, normalizeTaskColor(task.color) || "#75e7ff");
  });
  Object.entries(options.deletedTaskMeta || {}).forEach(([taskIdRaw, meta]) => {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId || !meta) return;
    if (!taskNameById.has(taskId)) taskNameById.set(taskId, String(meta.name || "").trim() || "Archived Task");
    if (!taskColorById.has(taskId)) taskColorById.set(taskId, normalizeTaskColor(meta.color) || "#8b95a7");
  });

  const weekStartMs = startOfCurrentWeekMs(options.nowMs, options.weekStarting);
  const weekEndMs = weekStartMs + 7 * 86400000;
  const previousWeekStartMs = weekStartMs - 7 * 86400000;
  const days: DashboardActivityOverviewDay[] = Array.from({ length: 7 }, (_, index) => {
    const startMs = weekStartMs + index * 86400000;
    const endMs = startMs + 86400000;
    return {
      key: localDayKey(startMs),
      startMs,
      endMs,
      label: formatWeekdayShort(startMs),
      dateLabel: formatMonthDay(startMs),
      longLabel: new Date(startMs).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      totalMs: 0,
      cumulativeMs: 0,
      previousWeekTotalMs: 0,
      previousWeekCumulativeMs: 0,
      activityBarColor: DASHBOARD_ACTIVITY_BAR_FALLBACK_COLOR,
      activityProgressPct: null,
      taskRows: [],
      sessions: [],
    };
  });
  const dayByKey = new Map(days.map((day) => [day.key, day]));
  const previousWeekTotals = Array.from({ length: 7 }, () => 0);
  const includedTaskIds = new Set<string>([...taskNameById.keys(), ...Object.keys(options.historyByTaskId || {})]);

  includedTaskIds.forEach((taskId) => {
    const entries = Array.isArray(options.historyByTaskId?.[taskId])
      ? (options.historyByTaskId[taskId] as ActivityHistoryEntry[])
      : [];
    entries.forEach((entry) => {
      const ts = normalizeTimestamp(entry?.ts, options.normalizeHistoryTimestampMs);
      const ms = normalizeMs(entry?.ms);
      if (ts <= 0 || ms <= 0) return;
      if (ts >= weekStartMs && ts < weekEndMs) {
        const day = dayByKey.get(localDayKey(ts));
        if (!day) return;
        const taskName = taskNameById.get(taskId) || String(entry.name || "").trim() || "Task";
        const color = normalizeTaskColor(entry.color) || taskColorById.get(taskId) || "#75e7ff";
        day.totalMs += ms;
        day.sessions.push({
          taskId,
          taskName,
          ts,
          ms,
          note: String(entry.note || "").trim(),
          color,
          isLive: !!entry.isLiveSession,
        });
        return;
      }
      if (ts >= previousWeekStartMs && ts < weekStartMs) {
        const index = Math.max(0, Math.min(6, Math.floor((ts - previousWeekStartMs) / 86400000)));
        previousWeekTotals[index] += ms;
      }
    });
  });

  tasks.forEach((task) => {
    const taskId = String(task?.id || "").trim();
    if (!taskId || !options.isTaskRunning(task)) return;
    const todayKey = localDayKey(options.nowMs);
    const today = dayByKey.get(todayKey);
    if (!today) return;
    const alreadyHasLive = today.sessions.some((session) => session.taskId === taskId && session.isLive);
    if (alreadyHasLive) return;
    const ms = normalizeMs(options.getElapsedMs(task));
    if (ms <= 0) return;
    const color = taskColorById.get(taskId) || "#75e7ff";
    today.totalMs += ms;
    today.sessions.push({
      taskId,
      taskName: taskNameById.get(taskId) || "Task",
      ts: options.nowMs,
      ms,
      note: "",
      color,
      isLive: true,
    });
  });

  const totalGoalMs = tasks.reduce((sum, task) => sum + getTaskGoalMs(task), 0);
  const dailyPaceTargetMs = totalGoalMs > 0 ? totalGoalMs / 7 : 0;
  let cumulativeMs = 0;
  let previousWeekCumulativeMs = 0;
  days.forEach((day, index) => {
    cumulativeMs += day.totalMs;
    previousWeekCumulativeMs += previousWeekTotals[index] || 0;
    day.cumulativeMs = cumulativeMs;
    day.previousWeekTotalMs = previousWeekTotals[index] || 0;
    day.previousWeekCumulativeMs = previousWeekCumulativeMs;
    const rowsByTask = new Map<string, DashboardActivityOverviewTaskRow>();
    day.sessions.forEach((session) => {
      const existing = rowsByTask.get(session.taskId);
      if (existing) {
        existing.totalMs += session.ms;
        return;
      }
      rowsByTask.set(session.taskId, {
        taskId: session.taskId,
        taskName: session.taskName,
        totalMs: session.ms,
        color: session.color,
        archived: !taskById.has(session.taskId),
      });
    });
    day.taskRows = [...rowsByTask.values()].sort((left, right) => {
      if (right.totalMs !== left.totalMs) return right.totalMs - left.totalMs;
      return left.taskName.localeCompare(right.taskName);
    });
    if (dailyPaceTargetMs > 0) {
      const progressPct = (day.totalMs / dailyPaceTargetMs) * 100;
      day.activityProgressPct = progressPct;
      day.activityBarColor = fillBackgroundForPct(progressPct);
    } else {
      day.activityProgressPct = null;
      day.activityBarColor = day.taskRows[0]?.color || DASHBOARD_ACTIVITY_BAR_FALLBACK_COLOR;
    }
    day.sessions.sort((left, right) => left.ts - right.ts);
  });

  const weekTotalMs = days.reduce((sum, day) => sum + day.totalMs, 0);
  const previousWeekTotalMs = previousWeekTotals.reduce((sum, ms) => sum + ms, 0);
  const maxDailyMs = days.reduce((max, day) => Math.max(max, day.totalMs, day.previousWeekTotalMs), 0);
  const maxChartMs = Math.max(dailyPaceTargetMs, maxDailyMs, 60 * 60000);

  return {
    weekStartMs,
    weekEndMs,
    totalGoalMs,
    dailyPaceTargetMs,
    weekTotalMs,
    previousWeekTotalMs,
    maxChartMs,
    hasGoal: totalGoalMs > 0,
    hasActivity: weekTotalMs > 0,
    hasPreviousWeekActivity: previousWeekTotalMs > 0,
    days,
  };
}
