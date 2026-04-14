import { completionDifficultyLabel, normalizeCompletionDifficulty, type CompletionDifficulty } from "./completionDifficulty";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeOptimalProductivityPeriod,
  timestampIsInProductivityPeriod,
  type OptimalProductivityPeriod,
} from "./productivityPeriod";

export type InsightEntry = {
  ts: number;
  ms: number;
  completionDifficulty?: CompletionDifficulty;
};

export type FocusInsightsResult = {
  bestMs: number;
  weekdaySessionCount: number;
  weekdayName: string | null;
  todayDeltaMs: number;
  weekDeltaMs: number;
  completionDifficultyLabel: string | null;
  productivityPeriodMs: number;
};

function startOfTodayMs(nowTs: number): number {
  const d = new Date(nowTs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(refMs: number): number {
  const d = new Date(refMs);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function computeFocusInsights(
  entries: InsightEntry[],
  nowTs: number,
  productivityPeriod?: Partial<OptimalProductivityPeriod>
): FocusInsightsResult {
  const valid = (entries || []).filter((e) => Number.isFinite(+e?.ms) && Number.isFinite(+e?.ts));
  const bestMs = valid.length ? Math.max(...valid.map((e) => Math.max(0, +e.ms || 0))) : 0;
  const normalizedProductivityPeriod = normalizeOptimalProductivityPeriod({
    optimalProductivityStartTime: productivityPeriod?.startTime || DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
    optimalProductivityEndTime: productivityPeriod?.endTime || DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  });

  const byWeekday = new Array<number>(7).fill(0);
  let productivityPeriodMs = 0;
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    byWeekday[new Date(ts).getDay()] += 1;
    if (timestampIsInProductivityPeriod(ts, normalizedProductivityPeriod)) {
      productivityPeriodMs += Math.max(0, +e.ms || 0);
    }
  });

  let weekdayIdx = 0;
  for (let i = 1; i < 7; i += 1) {
    if (byWeekday[i] > byWeekday[weekdayIdx]) weekdayIdx = i;
  }
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const todayStart = startOfTodayMs(nowTs);
  const yesterdayStart = todayStart - 86400000;
  let todayMs = 0;
  let yesterdayMs = 0;
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    const ms = Math.max(0, +e.ms || 0);
    if (ts >= todayStart && ts < nowTs + 1) todayMs += ms;
    else if (ts >= yesterdayStart && ts < todayStart) yesterdayMs += ms;
  });

  const weekStart = startOfWeekMs(nowTs);
  const prevWeekStart = weekStart - 7 * 86400000;
  let thisWeekMs = 0;
  let lastWeekMs = 0;
  const recentDifficulties: CompletionDifficulty[] = [];
  let latestDifficultyTs = 0;
  let latestDifficultyValue: CompletionDifficulty | undefined;
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    const ms = Math.max(0, +e.ms || 0);
    if (ts >= weekStart && ts <= nowTs) thisWeekMs += ms;
    else if (ts >= prevWeekStart && ts < weekStart) lastWeekMs += ms;
    const completionDifficulty = normalizeCompletionDifficulty(e.completionDifficulty);
    if (completionDifficulty) {
      if (ts >= weekStart && ts <= nowTs) recentDifficulties.push(completionDifficulty);
      if (ts > latestDifficultyTs) {
        latestDifficultyTs = ts;
        latestDifficultyValue = completionDifficulty;
      }
    }
  });
  const averageRecentDifficulty = recentDifficulties.length
    ? Math.round(recentDifficulties.reduce((sum, value) => sum + value, 0) / recentDifficulties.length)
    : null;
  const completionDifficulty = normalizeCompletionDifficulty(averageRecentDifficulty) || latestDifficultyValue;

  return {
    bestMs,
    weekdaySessionCount: byWeekday[weekdayIdx],
    weekdayName: valid.length ? weekdayNames[weekdayIdx] : null,
    todayDeltaMs: todayMs - yesterdayMs,
    weekDeltaMs: thisWeekMs - lastWeekMs,
    completionDifficultyLabel: completionDifficultyLabel(completionDifficulty),
    productivityPeriodMs,
  };
}
