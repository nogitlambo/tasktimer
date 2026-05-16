import { localDayKey } from "./history";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import {
  buildOptimalProductivityDaysSummary,
  DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS,
  localDayToDashboardWeekStart,
  normalizeOptimalProductivityDays,
  type OptimalProductivityDays,
} from "./productivityPeriod";
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
  recentQualifiedLabels: string[];
  selectedDaysSummary: string;
};

type MomentumComputationContext = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  weekStarting: DashboardWeekStart;
  optimalProductivityDays?: OptimalProductivityDays;
  nowValue?: number;
};

const MOMENTUM_THRESHOLDS = {
  building: 25,
  strong: 50,
  surging: 75,
} as const;
const RECENT_ACTIVITY_DAY_WEIGHTS: readonly [number, number, number] = [1, 0.65, 0.35];
const RECENT_ACTIVITY_MIN_SESSION_MS = 5 * 60 * 1000;
const MOMENTUM_RECENT_ACTIVITY_MAX = 30;
const MOMENTUM_RECENT_ACTIVITY_SELECTED_DAYS_MAX = 25;
const MOMENTUM_RECENT_ACTIVITY_OFF_DAY_BONUS_MAX = 5;
const MOMENTUM_CONSISTENCY_ACTIVE_DAYS_MAX = 18;
const MOMENTUM_CONSISTENCY_STREAK_MAX = 12;
const MOMENTUM_WEEKLY_PROGRESS_MAX = 30;
const MOMENTUM_LIVE_BONUS_MAX = 10;
const DAY_MS = 86400000;

function clampMomentumScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getMomentumBandLabel(score: number): string {
  if (score >= MOMENTUM_THRESHOLDS.surging) return "Surging";
  if (score >= MOMENTUM_THRESHOLDS.strong) return "Strong";
  if (score >= MOMENTUM_THRESHOLDS.building) return "Building";
  return "Low";
}

function getMomentumMultiplier(score: number): number {
  if (score >= MOMENTUM_THRESHOLDS.surging) return 2;
  if (score >= MOMENTUM_THRESHOLDS.strong) return 1.5;
  if (score >= MOMENTUM_THRESHOLDS.building) return 1.2;
  return 1;
}

function dayStartMsFromKey(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00`).getTime();
}

function collectRecentSelectedDayKeys(todayStartMs: number, selectedDays: OptimalProductivityDays): string[] {
  const keys: string[] = [];
  let probeTime = todayStartMs;
  while (keys.length < 3) {
    if (selectedDays.includes(localDayToDashboardWeekStart(probeTime))) {
      keys.push(localDayKey(probeTime));
    }
    probeTime -= DAY_MS;
  }
  return keys;
}

function computeSelectedTrailingStreak(
  todayStartMs: number,
  selectedDays: OptimalProductivityDays,
  qualifyingDaySet: Set<string>
): number {
  let streak = 0;
  let probeTime = todayStartMs;
  while (true) {
    while (!selectedDays.includes(localDayToDashboardWeekStart(probeTime))) {
      probeTime -= DAY_MS;
    }
    if (!qualifyingDaySet.has(localDayKey(probeTime))) break;
    streak += 1;
    probeTime -= DAY_MS;
  }
  return streak;
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
  const optimalProductivityDays = normalizeOptimalProductivityDays(ctx.optimalProductivityDays || DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS);
  const recentDaysMs: [number, number, number] = [0, 0, 0];
  const recentDayQualified: [boolean, boolean, boolean] = [false, false, false];
  const activeDayKeys = new Set<string>();
  const qualifyingMsByDayKey = new Map<string, number>();
  let currentWeekLoggedMs = 0;
  let currentWeekGoalMs = 0;
  let runningTaskCount = 0;
  const currentWeekStartMs = startOfCurrentWeekMs(nowValue, ctx.weekStarting);
  const todayStartMs = dayStartMsFromKey(localDayKey(nowValue));

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

      const dayKey = localDayKey(ts);
      const dayStartMs = dayStartMsFromKey(dayKey);
      const dayOffset = Math.floor((todayStartMs - dayStartMs) / DAY_MS);
      if (dayOffset >= 0 && dayOffset < 3) {
        recentDaysMs[dayOffset as 0 | 1 | 2] += ms;
        if (ms >= RECENT_ACTIVITY_MIN_SESSION_MS) recentDayQualified[dayOffset as 0 | 1 | 2] = true;
      }

      qualifyingMsByDayKey.set(dayKey, (qualifyingMsByDayKey.get(dayKey) || 0) + ms);
      if (ts >= todayStartMs - 6 * DAY_MS && ts <= nowValue) activeDayKeys.add(dayKey);
    });
  });

  includedTasks.forEach((task) => {
    if (!task?.running || typeof task.startMs !== "number") return;
    const startMs = Math.max(0, Math.floor(Number(task.startMs || 0) || 0));
    const runStart = Math.max(startMs, currentWeekStartMs);
    if (runStart < nowValue) currentWeekLoggedMs += nowValue - runStart;
    for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
      const dayStartMs = todayStartMs - dayOffset * DAY_MS;
      const dayEndMs = dayStartMs + DAY_MS;
      const overlapMs = Math.max(0, Math.min(nowValue, dayEndMs) - Math.max(startMs, dayStartMs));
      if (overlapMs <= 0) continue;
      recentDaysMs[dayOffset as 0 | 1 | 2] += overlapMs;
      if (overlapMs >= RECENT_ACTIVITY_MIN_SESSION_MS) recentDayQualified[dayOffset as 0 | 1 | 2] = true;
    }
    const currentDayKey = localDayKey(nowValue);
    qualifyingMsByDayKey.set(currentDayKey, (qualifyingMsByDayKey.get(currentDayKey) || 0) + Math.max(0, nowValue - startMs));
    activeDayKeys.add(currentDayKey);
  });

  const recentSelectedDayKeys = collectRecentSelectedDayKeys(todayStartMs, optimalProductivityDays);
  const recentSelectedQualified = recentSelectedDayKeys.map((dayKey) => (qualifyingMsByDayKey.get(dayKey) || 0) >= RECENT_ACTIVITY_MIN_SESSION_MS);
  const recentPresenceWeight = recentSelectedQualified.reduce((sum, qualified, index) => {
    return sum + (qualified ? RECENT_ACTIVITY_DAY_WEIGHTS[index] : 0);
  }, 0);
  const maxRecentPresenceWeight = RECENT_ACTIVITY_DAY_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const recentSelectedMax =
    optimalProductivityDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length
      ? MOMENTUM_RECENT_ACTIVITY_MAX
      : MOMENTUM_RECENT_ACTIVITY_SELECTED_DAYS_MAX;
  const recentSelectedScore = Math.max(
    0,
    Math.min(recentSelectedMax, (recentPresenceWeight / maxRecentPresenceWeight) * recentSelectedMax)
  );
  const recentOffDayBonusQualifiedCount = Array.from(qualifyingMsByDayKey.entries()).reduce((count, [dayKey, ms]) => {
    if (ms < RECENT_ACTIVITY_MIN_SESSION_MS || recentSelectedDayKeys.includes(dayKey)) return count;
    const dayStartMs = dayStartMsFromKey(dayKey);
    if (dayStartMs < todayStartMs - 2 * DAY_MS || dayStartMs > nowValue) return count;
    return count + 1;
  }, 0);
  const recentOffDayBonus = Math.min(MOMENTUM_RECENT_ACTIVITY_OFF_DAY_BONUS_MAX, recentOffDayBonusQualifiedCount * 2.5);
  const recentActivityScore =
    optimalProductivityDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length
      ? Math.max(0, Math.min(MOMENTUM_RECENT_ACTIVITY_MAX, recentSelectedScore))
      : Math.max(0, Math.min(MOMENTUM_RECENT_ACTIVITY_MAX, recentSelectedScore + recentOffDayBonus));

  const qualifyingDaySet = new Set(
    Array.from(activeDayKeys).filter((dayKey) => (qualifyingMsByDayKey.get(dayKey) || 0) >= RECENT_ACTIVITY_MIN_SESSION_MS)
  );
  const trailingStreak = computeSelectedTrailingStreak(todayStartMs, optimalProductivityDays, qualifyingDaySet);
  const activeDaysScore = Math.max(0, Math.min(MOMENTUM_CONSISTENCY_ACTIVE_DAYS_MAX, (activeDayKeys.size / 5) * MOMENTUM_CONSISTENCY_ACTIVE_DAYS_MAX));
  const streakScore = Math.max(0, Math.min(MOMENTUM_CONSISTENCY_STREAK_MAX, (trailingStreak / 4) * MOMENTUM_CONSISTENCY_STREAK_MAX));
  const consistencyScore = trailingStreak >= 2 ? activeDaysScore + streakScore : 0;

  const weeklyProgressRatio = currentWeekGoalMs > 0 ? currentWeekLoggedMs / currentWeekGoalMs : 0;
  const weeklyProgressScore = Math.max(0, Math.min(MOMENTUM_WEEKLY_PROGRESS_MAX, weeklyProgressRatio * MOMENTUM_WEEKLY_PROGRESS_MAX));
  const activeSessionBonus = Math.min(MOMENTUM_LIVE_BONUS_MAX, runningTaskCount > 0 ? 6 + Math.min(4, runningTaskCount - 1) : 0);

  const score = clampMomentumScore(recentActivityScore + consistencyScore + weeklyProgressScore + activeSessionBonus);
  const hasSignal =
    recentPresenceWeight > 0 || activeDayKeys.size > 0 || currentWeekLoggedMs > 0 || currentWeekGoalMs > 0 || runningTaskCount > 0;

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
    recentQualifiedLabels: recentSelectedDayKeys.reduce<string[]>((labels, dayKey, index) => {
      if (!recentSelectedQualified[index]) return labels;
      labels.push(new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }));
      return labels;
    }, []),
    selectedDaysSummary: buildOptimalProductivityDaysSummary(optimalProductivityDays),
  };
}
