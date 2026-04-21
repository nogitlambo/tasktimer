import { localDayKey } from "./history";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import type { HistoryByTaskId, Task } from "./types";

export type MomentumSnapshot = {
  score: number;
  bandLabel: string;
  multiplier: number;
  hasSignal: boolean;
  recentActivityScore: number;
  consistencyScore: number;
  weeklyProgressScore: number;
  activeSessionBonus: number;
  currentWeekLoggedMs: number;
  currentWeekGoalMs: number;
  runningTaskCount: number;
  activeDayCount: number;
  trailingStreak: number;
  recentDaysMs: [number, number, number];
};

export type MomentumComputationContext = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  weekStarting: DashboardWeekStart;
  nowValue?: number;
};

export const MOMENTUM_THRESHOLDS = {
  building: 25,
  strong: 50,
  surging: 75,
} as const;

export function clampMomentumScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getMomentumBandLabel(score: number): string {
  if (score >= MOMENTUM_THRESHOLDS.surging) return "Surging";
  if (score >= MOMENTUM_THRESHOLDS.strong) return "Strong";
  if (score >= MOMENTUM_THRESHOLDS.building) return "Building";
  return "Low";
}

export function getMomentumMultiplier(score: number): number {
  if (score >= MOMENTUM_THRESHOLDS.surging) return 2;
  if (score >= MOMENTUM_THRESHOLDS.strong) return 1.5;
  if (score >= MOMENTUM_THRESHOLDS.building) return 1.2;
  return 1;
}

export function computeMomentumSnapshot(ctx: MomentumComputationContext): MomentumSnapshot {
  const nowValue = Math.max(0, Math.floor(Number(ctx.nowValue || 0) || 0)) || Date.now();
  const includedTasks = (Array.isArray(ctx.tasks) ? ctx.tasks : []).filter((task) => !!task);
  const includedTaskIds = new Set<string>();
  includedTasks.forEach((task) => {
    const taskId = String(task?.id || "").trim();
    if (taskId) includedTaskIds.add(taskId);
  });

  const historyByTaskId = ctx.historyByTaskId || {};
  const recentDaysMs: [number, number, number] = [0, 0, 0];
  const activeDayKeys = new Set<string>();
  let currentWeekLoggedMs = 0;
  let currentWeekGoalMs = 0;
  let runningTaskCount = 0;
  const currentWeekStartMs = startOfCurrentWeekMs(nowValue, ctx.weekStarting);
  const dayLengthMs = 86400000;
  const todayStartMs = new Date(localDayKey(nowValue) + "T00:00:00").getTime();

  includedTasks.forEach((task) => {
    if (task?.running) runningTaskCount += 1;
    const goalMinutes = Math.max(0, Number(task?.timeGoalMinutes || 0));
    if (task?.timeGoalEnabled && goalMinutes > 0) {
      const multiplier = task.timeGoalPeriod === "day" ? 7 : task.timeGoalPeriod === "week" ? 1 : 0;
      currentWeekGoalMs += goalMinutes * 60000 * multiplier;
    }
  });

  Object.keys(historyByTaskId).forEach((taskId) => {
    if (!includedTaskIds.has(String(taskId || "").trim())) return;
    const entries = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
    entries.forEach((entry) => {
      const ts = Math.max(0, Math.floor(Number(entry?.ts || 0) || 0));
      const ms = Math.max(0, Math.floor(Number(entry?.ms || 0) || 0));
      if (!ts || ms <= 0 || ts > nowValue) return;

      if (ts >= currentWeekStartMs && ts <= nowValue) currentWeekLoggedMs += ms;

      const dayOffset = Math.floor((todayStartMs - new Date(localDayKey(ts) + "T00:00:00").getTime()) / dayLengthMs);
      if (dayOffset >= 0 && dayOffset < 3) recentDaysMs[dayOffset] += ms;

      if (ts >= todayStartMs - 6 * dayLengthMs && ts <= nowValue) activeDayKeys.add(localDayKey(ts));
    });
  });

  includedTasks.forEach((task) => {
    if (!task?.running || typeof task.startMs !== "number") return;
    const startMs = Math.max(0, Math.floor(Number(task.startMs || 0) || 0));
    const runStart = Math.max(startMs, currentWeekStartMs);
    if (runStart < nowValue) currentWeekLoggedMs += nowValue - runStart;
    recentDaysMs[0] += Math.max(0, nowValue - Math.max(startMs, todayStartMs));
    activeDayKeys.add(localDayKey(nowValue));
  });

  const recentWeightedMs = recentDaysMs[0] * 1 + recentDaysMs[1] * 0.65 + recentDaysMs[2] * 0.35;
  const recentActivityScore = Math.max(0, Math.min(25, (recentWeightedMs / (120 * 60000)) * 25));

  const qualifyingDayKeys = Array.from(activeDayKeys).sort();
  let trailingStreak = 0;
  let probeTime = todayStartMs;
  const qualifyingDaySet = new Set(qualifyingDayKeys);
  while (qualifyingDaySet.has(localDayKey(probeTime))) {
    trailingStreak += 1;
    probeTime -= dayLengthMs;
  }
  const activeDaysScore = Math.max(0, Math.min(27, (activeDayKeys.size / 5) * 27));
  const streakScore = Math.max(0, Math.min(18, (trailingStreak / 4) * 18));
  const consistencyScore = trailingStreak >= 2 ? activeDaysScore + streakScore : 0;

  const weeklyProgressRatio = currentWeekGoalMs > 0 ? currentWeekLoggedMs / currentWeekGoalMs : 0;
  const weeklyProgressScore = Math.max(0, Math.min(20, weeklyProgressRatio * 20));
  const activeSessionBonus = Math.min(10, runningTaskCount > 0 ? 6 + Math.min(4, runningTaskCount - 1) : 0);

  const score = clampMomentumScore(recentActivityScore + consistencyScore + weeklyProgressScore + activeSessionBonus);
  const hasSignal =
    recentWeightedMs > 0 || activeDayKeys.size > 0 || currentWeekLoggedMs > 0 || currentWeekGoalMs > 0 || runningTaskCount > 0;

  return {
    score,
    bandLabel: getMomentumBandLabel(score),
    multiplier: getMomentumMultiplier(score),
    hasSignal,
    recentActivityScore,
    consistencyScore,
    weeklyProgressScore,
    activeSessionBonus,
    currentWeekLoggedMs,
    currentWeekGoalMs,
    runningTaskCount,
    activeDayCount: activeDayKeys.size,
    trailingStreak,
    recentDaysMs,
  };
}
