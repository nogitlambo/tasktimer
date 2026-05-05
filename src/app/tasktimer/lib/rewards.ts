import { localDayKey } from "./history";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import { computeMomentumSnapshot } from "./momentum";
import type { HistoryByTaskId, HistoryEntry, Task } from "./types";

export type RewardReason = "launch" | "session" | "dailyConsistency" | "streakBonus" | "weeklyGoal60" | "weeklyGoal100";

export type RewardProgressV1 = {
  totalXp: number;
  totalXpPrecise: number;
  currentRankId: string;
  lastAwardedAt: number | null;
  completedSessions: number;
  awardLedger: RewardLedgerEntry[];
};

export type RewardLedgerEntry = {
  ts: number;
  dayKey: string;
  taskId: string | null;
  xp: number;
  baseXp: number;
  multiplier: number;
  eligibleMs: number;
  reason: RewardReason;
  sourceKey: string;
};

export type RankDefinition = {
  id: string;
  label: string;
  minXp: number;
};

export type RankThumbnailDescriptor =
  | { kind: "image"; src: string; rankId: string }
  | { kind: "placeholder"; label: string; rankId: string };

export type RewardAwardResult = {
  amount: number;
  previous: RewardProgressV1;
  next: RewardProgressV1;
  rankChanged: boolean;
};

export type LaunchXpContext = {
  taskId: string;
  awardedAt: number;
};

export type CompletedSessionXpContext = {
  taskId: string | null;
  awardedAt: number;
  elapsedMs: number;
  historyByTaskId: HistoryByTaskId;
  tasks: Task[];
  weekStarting: DashboardWeekStart;
  momentumEntitled?: boolean;
  sessionSegments?: RewardSessionSegment[];
};

export type RewardSessionSegment = {
  startMs: number;
  endMs: number;
  multiplier: number;
};

export type RewardQualifiedDayState = {
  dayKey: string;
  totalEligibleMs: number;
  eligibleSessionCount: number;
  firstEligibleTs: number | null;
  lastEligibleTs: number | null;
  qualified: boolean;
};

export type RewardWeekProgress = {
  weekKey: string;
  targetMs: number;
  loggedMs: number;
  progressRatio: number;
  reached60: boolean;
  reached100: boolean;
};

export type RewardsHeaderViewModel = {
  rankLabel: string;
  totalXp: number;
  progressPct: number;
  progressLabel: string;
  xpToNext: number | null;
  currentBandXp: number;
  nextBandXp: number | null;
};

type XpReasonSummary = {
  totalXp: number;
  sessionTaskXp: Map<string, number>;
  dailyConsistencyXp: number;
  streakBonusXp: number;
  weeklyGoal60Xp: number;
  weeklyGoal100Xp: number;
  launchXp: number;
};

type XpProgressArchieOptions = {
  historyByTaskId?: HistoryByTaskId;
  weekStarting?: DashboardWeekStart;
  momentumEntitled?: boolean;
};

type RewardMomentumContext = {
  historyByTaskId?: HistoryByTaskId;
  tasks?: Task[];
  weekStarting?: DashboardWeekStart;
  momentumEntitled?: boolean;
};

export const XP_PER_TASK_LAUNCH = 5;
export const MIN_REWARD_ELIGIBLE_SESSION_MS = 10 * 60 * 1000;
export const MAX_REWARD_ELIGIBLE_SESSION_MS = 90 * 60 * 1000;
export const SESSION_XP_INTERVAL_MS = 10 * 60 * 1000;
export const DAILY_BASE_SESSION_XP_CAP = 12;
export const QUALIFIED_DAY_MIN_TOTAL_MS = 30 * 60 * 1000;
export const QUALIFIED_DAY_MIN_SESSION_COUNT = 2;
export const QUALIFIED_DAY_MIN_SPAN_MS = 2 * 60 * 60 * 1000;
export const DAILY_CONSISTENCY_XP = 3;
export const MID_STREAK_BONUS_XP = 2;
export const HIGH_STREAK_BONUS_XP = 4;
export const WEEKLY_GOAL_60_XP = 4;
export const WEEKLY_GOAL_100_XP = 8;

const WEEKLY_DAILY_GOAL_MIN_MINUTES = 20;
const WEEKLY_WEEKLY_GOAL_MIN_MINUTES = 120;
const LEDGER_RETENTION_DAYS = 35;
const CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_REWARD_PROGRESS: RewardProgressV1 = {
  totalXp: 0,
  totalXpPrecise: 0,
  currentRankId: "unranked",
  lastAwardedAt: null,
  completedSessions: 0,
  awardLedger: [],
};

export const RANK_LADDER: RankDefinition[] = [
  { id: "unranked", label: "Unranked", minXp: 0 },
  { id: "initiate", label: "Initiate", minXp: 50 },
  { id: "operator", label: "Operator", minXp: 100 },
  { id: "technician", label: "Technician", minXp: 300 },
  { id: "engineer", label: "Engineer", minXp: 600 },
  { id: "analyst", label: "Analyst", minXp: 1000 },
  { id: "specialist", label: "Specialist", minXp: 1600 },
  { id: "strategist", label: "Strategist", minXp: 2900 },
  { id: "director", label: "Director", minXp: 3900 },
  { id: "ascendent", label: "Ascendent", minXp: 4800 },
  { id: "commander", label: "Commander", minXp: 5800 },
  { id: "architect", label: "Architect", minXp: 7000 },
  { id: "overseer", label: "Overseer", minXp: 8500 },
  { id: "visionary", label: "Visionary", minXp: 10200 },
  { id: "sovereign", label: "Sovereign", minXp: 12100 },
  { id: "mythic", label: "Mythic", minXp: 14200 },
];

export const RANK_MODAL_THUMBNAIL_BY_ID: Record<string, string> = {
  specialist: "/insignias/specialist.png?v=20260402",
  strategist: "/insignias/strategist.png",
  director: "/insignias/director.png",
  ascendent: "/insignias/ascendent.png",
  commander: "/insignias/commander.png",
  architect: "/insignias/architect.png",
};

export const ADMIN_ACCOUNT_EMAIL = "aniven82@gmail.com";

const RANK_MODAL_THUMBNAIL_FALLBACK_BY_ID: Record<string, string> = {
  specialist: "/insignias/specialist.png?v=20260402",
  strategist: "/insignias/strategist.png",
  director: "/insignias/director.png",
  ascendent: "/insignias/ascendent.png",
  commander: "/insignias/commander.png",
  architect: "/insignias/architect.png",
};

const RANK_BY_ID = new Map(RANK_LADDER.map((rank) => [rank.id, rank] as const));
const RANK_ID_BY_MODAL_THUMBNAIL = new Map(
  Object.entries(RANK_MODAL_THUMBNAIL_BY_ID).map(([rankId, src]) => [String(src || "").trim(), rankId] as const)
);

export function isAdminAccountEmail(email: unknown): boolean {
  return String(email || "").trim().toLowerCase() === ADMIN_ACCOUNT_EMAIL;
}

export function normalizeRewardProgress(input: unknown): RewardProgressV1 {
  if (!input || typeof input !== "object") return { ...DEFAULT_REWARD_PROGRESS };
  const obj = input as Record<string, unknown>;
  const totalXpPreciseRaw = Number(obj.totalXpPrecise ?? obj.totalXp ?? 0);
  const totalXpPrecise = Number.isFinite(totalXpPreciseRaw) ? Math.max(0, totalXpPreciseRaw) : 0;
  const totalXp = Math.max(0, Math.floor(totalXpPrecise));
  const completedSessions = Math.max(0, Math.floor(Number(obj.completedSessions || 0) || 0));
  const lastAwardedAtRaw = Number(obj.lastAwardedAt || 0);
  const lastAwardedAt = Number.isFinite(lastAwardedAtRaw) && lastAwardedAtRaw > 0 ? Math.floor(lastAwardedAtRaw) : null;
  const awardLedger = normalizeAwardLedger(obj.awardLedger);
  const resolvedRank = getRankForXp(totalXp);
  const rawRankId = String(obj.currentRankId || "").trim();
  return {
    totalXp,
    totalXpPrecise,
    completedSessions,
    lastAwardedAt,
    awardLedger,
    currentRankId: rawRankId && rawRankId === resolvedRank.id ? rawRankId : resolvedRank.id,
  };
}

function normalizeAwardLedger(input: unknown): RewardLedgerEntry[] {
  if (!Array.isArray(input)) return [];
  const minTs = Date.now() - LEDGER_RETENTION_DAYS * DAY_MS;
  return input
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const ts = Math.max(0, Math.floor(Number(obj.ts || 0) || 0));
      const xp = Number.isFinite(Number(obj.xp)) ? Math.max(0, Number(obj.xp)) : 0;
      const baseXp = Number.isFinite(Number(obj.baseXp)) ? Math.max(0, Number(obj.baseXp)) : xp;
      const multiplier = Number.isFinite(Number(obj.multiplier)) ? Math.max(0, Number(obj.multiplier)) : baseXp > 0 ? xp / baseXp : 1;
      const eligibleMs = Math.max(0, Math.floor(Number(obj.eligibleMs || 0) || 0));
      const reason = normalizeRewardReason(obj.reason);
      const rawTaskId = String(obj.taskId || "").trim();
      if (!ts || (xp <= 0 && eligibleMs <= 0 && baseXp <= 0)) return null;
      if (ts < minTs) return null;
      const dayKey = String(obj.dayKey || "").trim() || localDayKey(ts);
      const sourceKeyRaw = String(obj.sourceKey || "").trim();
      const sourceKey = sourceKeyRaw || buildLegacySourceKey(reason, rawTaskId || null, ts, eligibleMs, xp, dayKey, index);
      return {
        ts,
        xp,
        baseXp,
        multiplier,
        eligibleMs,
        reason,
        taskId: rawTaskId || null,
        dayKey,
        sourceKey,
      } satisfies RewardLedgerEntry;
    })
    .filter((entry): entry is RewardLedgerEntry => !!entry)
    .sort((a, b) => a.ts - b.ts);
}

function normalizeRewardReason(value: unknown): RewardReason {
  if (value === "dailyConsistency") return "dailyConsistency";
  if (value === "streakBonus") return "streakBonus";
  if (value === "weeklyGoal60") return "weeklyGoal60";
  if (value === "weeklyGoal100") return "weeklyGoal100";
  if (value === "launch") return "launch";
  return "session";
}

function buildLegacySourceKey(
  reason: RewardReason,
  taskId: string | null,
  ts: number,
  eligibleMs: number,
  xp: number,
  dayKey: string,
  index: number
): string {
  if (reason === "dailyConsistency") return `legacy:daily:${dayKey}:${ts}:${xp}:${index}`;
  if (reason === "launch") return `legacy:launch:${taskId || "none"}:${ts}:${xp}:${index}`;
  return `legacy:${reason}:${taskId || "none"}:${ts}:${eligibleMs}:${xp}:${index}`;
}

function clampAwardTimestamp(previous: RewardProgressV1, awardedAtRaw: number): number | null {
  const awardedAt = Math.max(0, Math.floor(Number(awardedAtRaw || 0) || 0)) || Date.now();
  const latestLedgerTs = previous.awardLedger.reduce((maxTs, entry) => Math.max(maxTs, entry.ts), 0);
  if (awardedAt > Date.now() + CLOCK_SKEW_ALLOWANCE_MS) return null;
  if (latestLedgerTs > 0 && awardedAt + CLOCK_SKEW_ALLOWANCE_MS < latestLedgerTs) {
    return latestLedgerTs;
  }
  return awardedAt;
}

function getExistingSourceKeys(progress: RewardProgressV1): Set<string> {
  return new Set(progress.awardLedger.map((entry) => entry.sourceKey));
}

function getSessionEligibleMs(elapsedMs: number): number {
  const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
  if (safeElapsedMs < MIN_REWARD_ELIGIBLE_SESSION_MS) return 0;
  return Math.min(safeElapsedMs, MAX_REWARD_ELIGIBLE_SESSION_MS);
}

function sumDailySessionXp(ledger: RewardLedgerEntry[], dayKey: string): number {
  return ledger.reduce((sum, entry) => {
    if (entry.reason !== "session" || entry.dayKey !== dayKey) return sum;
    return sum + Math.max(0, entry.baseXp);
  }, 0);
}

function awardEntries(previous: RewardProgressV1, entries: RewardLedgerEntry[], completedSessionsDelta: number): RewardAwardResult {
  const normalizedEntries = normalizeAwardLedger(entries);
  const amount = normalizedEntries.reduce((sum, entry) => sum + Math.max(0, entry.xp), 0);
  const nextLedger = normalizeAwardLedger(previous.awardLedger.concat(normalizedEntries));
  const nextTotalXpPrecise = previous.totalXpPrecise + amount;
  const nextTotalXp = Math.max(0, Math.floor(nextTotalXpPrecise));
  const nextRank = getRankForXp(nextTotalXp);
  const lastAwardedAt =
    normalizedEntries.reduce<number | null>((latest, entry) => (latest == null || entry.ts > latest ? entry.ts : latest), previous.lastAwardedAt) ??
    previous.lastAwardedAt;
  const next: RewardProgressV1 = {
    totalXp: nextTotalXp,
    totalXpPrecise: nextTotalXpPrecise,
    currentRankId: nextRank.id,
    lastAwardedAt,
    completedSessions: Math.max(0, previous.completedSessions + completedSessionsDelta),
    awardLedger: nextLedger,
  };

  return {
    amount,
    previous,
    next,
    rankChanged: previous.currentRankId !== next.currentRankId,
  };
}

function buildSessionLedgerEntry(
  taskId: string | null,
  awardedAt: number,
  eligibleMs: number,
  baseXp: number,
  multiplier: number,
  sourceKey: string
): RewardLedgerEntry {
  return {
    ts: awardedAt,
    dayKey: localDayKey(awardedAt),
    taskId,
    xp: baseXp * multiplier,
    baseXp,
    multiplier,
    eligibleMs,
    reason: "session",
    sourceKey,
  };
}

function buildBonusLedgerEntry(
  reason: Exclude<RewardReason, "launch" | "session">,
  awardedAt: number,
  baseXp: number,
  multiplier: number,
  sourceKey: string
): RewardLedgerEntry {
  return {
    ts: awardedAt,
    dayKey: localDayKey(awardedAt),
    taskId: null,
    xp: baseXp * multiplier,
    baseXp,
    multiplier,
    eligibleMs: 0,
    reason,
    sourceKey,
  };
}

function getRewardQualifiedDayStates(historyByTaskId: HistoryByTaskId): Map<string, RewardQualifiedDayState> {
  const byDay = new Map<
    string,
    {
      totalEligibleMs: number;
      eligibleSessionCount: number;
      firstEligibleTs: number | null;
      lastEligibleTs: number | null;
    }
  >();

  Object.values(historyByTaskId || {}).forEach((entries) => {
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      const normalized = normalizeHistoryEntryForRewards(entry);
      if (!normalized || normalized.eligibleMs <= 0) return;
      const dayKey = localDayKey(normalized.ts);
      const current =
        byDay.get(dayKey) || {
          totalEligibleMs: 0,
          eligibleSessionCount: 0,
          firstEligibleTs: null,
          lastEligibleTs: null,
        };
      current.totalEligibleMs += normalized.eligibleMs;
      current.eligibleSessionCount += 1;
      current.firstEligibleTs = current.firstEligibleTs == null ? normalized.ts : Math.min(current.firstEligibleTs, normalized.ts);
      current.lastEligibleTs = current.lastEligibleTs == null ? normalized.ts : Math.max(current.lastEligibleTs, normalized.ts);
      byDay.set(dayKey, current);
    });
  });

  const result = new Map<string, RewardQualifiedDayState>();
  byDay.forEach((value, dayKey) => {
    const spanMs =
      value.firstEligibleTs != null && value.lastEligibleTs != null ? Math.max(0, value.lastEligibleTs - value.firstEligibleTs) : 0;
    result.set(dayKey, {
      dayKey,
      totalEligibleMs: value.totalEligibleMs,
      eligibleSessionCount: value.eligibleSessionCount,
      firstEligibleTs: value.firstEligibleTs,
      lastEligibleTs: value.lastEligibleTs,
      qualified:
        value.totalEligibleMs >= QUALIFIED_DAY_MIN_TOTAL_MS &&
        value.eligibleSessionCount >= QUALIFIED_DAY_MIN_SESSION_COUNT &&
        spanMs >= QUALIFIED_DAY_MIN_SPAN_MS,
    });
  });
  return result;
}

function normalizeHistoryEntryForRewards(entry: HistoryEntry | null | undefined): { ts: number; eligibleMs: number } | null {
  const ts = Math.max(0, Math.floor(Number(entry?.ts || 0) || 0));
  if (!ts) return null;
  const eligibleMs = getSessionEligibleMs(Number(entry?.ms || 0));
  return { ts, eligibleMs };
}

function getQualifiedDayKeys(historyByTaskId: HistoryByTaskId): string[] {
  return Array.from(getRewardQualifiedDayStates(historyByTaskId).values())
    .filter((state) => state.qualified)
    .map((state) => state.dayKey)
    .sort();
}

function localDayKeyToStartMs(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00`).getTime();
}

export function getRewardQualifiedDayState(historyByTaskId: HistoryByTaskId, dayKey: string): RewardQualifiedDayState {
  return (
    getRewardQualifiedDayStates(historyByTaskId).get(String(dayKey || "").trim()) || {
      dayKey: String(dayKey || "").trim(),
      totalEligibleMs: 0,
      eligibleSessionCount: 0,
      firstEligibleTs: null,
      lastEligibleTs: null,
      qualified: false,
    }
  );
}

export function getRewardStreakLength(historyByTaskId: HistoryByTaskId, referenceDayKey?: string): number {
  const targetDayKey = String(referenceDayKey || "").trim() || localDayKey(Date.now());
  const qualifiedDayKeys = getQualifiedDayKeys(historyByTaskId);
  const qualifiedDaySet = new Set(qualifiedDayKeys);
  let streak = 0;
  let probeTime = localDayKeyToStartMs(targetDayKey);
  while (qualifiedDaySet.has(localDayKey(probeTime))) {
    streak += 1;
    probeTime -= DAY_MS;
  }
  return streak;
}

export function getStreakBonusXp(streakLength: number): number {
  if (streakLength >= 7) return HIGH_STREAK_BONUS_XP;
  if (streakLength >= 3) return MID_STREAK_BONUS_XP;
  return 0;
}

export function getRewardWeekProgress(
  historyByTaskId: HistoryByTaskId,
  tasks: Task[],
  weekStarting: DashboardWeekStart,
  nowValue: number
): RewardWeekProgress {
  const safeNow = Math.max(0, Math.floor(Number(nowValue || 0) || 0)) || Date.now();
  const weekStartMs = startOfCurrentWeekMs(safeNow, weekStarting);
  const weekKey = localDayKey(weekStartMs);
  const eligibleGoalTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (!task?.timeGoalEnabled) return false;
    const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
    if (task.timeGoalPeriod === "day") return goalMinutes >= WEEKLY_DAILY_GOAL_MIN_MINUTES;
    if (task.timeGoalPeriod === "week") return goalMinutes >= WEEKLY_WEEKLY_GOAL_MIN_MINUTES;
    return false;
  });

  const targetMs = eligibleGoalTasks.reduce((sum, task) => {
    const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
    const multiplier = task.timeGoalPeriod === "day" ? 7 : 1;
    return sum + goalMinutes * multiplier * 60000;
  }, 0);

  const loggedMs = eligibleGoalTasks.reduce((sum, task) => {
    const taskId = String(task.id || "").trim();
    if (!taskId) return sum;
    const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    const taskLoggedMs = entries.reduce((entrySum, entry) => {
      const ts = Math.max(0, Math.floor(Number(entry?.ts || 0) || 0));
      const ms = Math.max(0, Math.floor(Number(entry?.ms || 0) || 0));
      if (!ts || ms <= 0) return entrySum;
      if (ts < weekStartMs || ts > safeNow) return entrySum;
      return entrySum + ms;
    }, 0);
    return sum + taskLoggedMs;
  }, 0);

  const progressRatio = targetMs > 0 ? Math.max(0, Math.min(1, loggedMs / targetMs)) : 0;
  return {
    weekKey,
    targetMs,
    loggedMs,
    progressRatio,
    reached60: targetMs > 0 && progressRatio >= 0.6,
    reached100: targetMs > 0 && progressRatio >= 1,
  };
}

function resolveRewardMultiplier(context: RewardMomentumContext | null | undefined, awardedAt: number): number {
  if (!context?.momentumEntitled) return 1;
  if (!context.historyByTaskId || !context.tasks || !context.weekStarting) return 1;
  return computeMomentumSnapshot({
    tasks: context.tasks,
    historyByTaskId: context.historyByTaskId,
    weekStarting: context.weekStarting,
    nowValue: awardedAt,
  }).multiplier;
}

function normalizeSessionSegments(
  context: CompletedSessionXpContext,
  awardedAt: number,
  multiplierFallback: number
): Array<{ startMs: number; endMs: number; multiplier: number }> {
  const source = Array.isArray(context.sessionSegments) ? context.sessionSegments : [];
  const normalized = source
    .map((segment) => {
      const startMs = Math.max(0, Math.floor(Number(segment?.startMs || 0) || 0));
      const endMs = Math.max(startMs, Math.floor(Number(segment?.endMs || 0) || 0));
      const multiplier = Number.isFinite(Number(segment?.multiplier)) ? Math.max(0, Number(segment.multiplier)) : multiplierFallback;
      if (!(endMs > startMs)) return null;
      return { startMs, endMs, multiplier: multiplier > 0 ? multiplier : 1 };
    })
    .filter((segment): segment is { startMs: number; endMs: number; multiplier: number } => !!segment)
    .sort((a, b) => a.startMs - b.startMs);
  if (normalized.length) return normalized;
  const safeElapsedMs = Math.max(0, Math.floor(Number(context.elapsedMs || 0) || 0));
  if (!(safeElapsedMs > 0)) return [];
  return [{ startMs: Math.max(0, awardedAt - safeElapsedMs), endMs: awardedAt, multiplier: multiplierFallback }];
}

function buildScaledSessionLedgerEntries(
  taskId: string | null,
  awardedAt: number,
  eligibleMs: number,
  remainingDailyXp: number,
  segments: Array<{ startMs: number; endMs: number; multiplier: number }>
): RewardLedgerEntry[] {
  if (!(eligibleMs > 0) || !(remainingDailyXp > 0) || !segments.length) return [];
  const maxAwardableMs = Math.min(eligibleMs, remainingDailyXp * SESSION_XP_INTERVAL_MS);
  if (!(maxAwardableMs > 0)) return [];

  let remainingMs = maxAwardableMs;
  let consumedSessionMs = 0;
  const entries: RewardLedgerEntry[] = [];

  for (let index = 0; index < segments.length && remainingMs > 0; index += 1) {
    const segment = segments[index]!;
    const segmentDurationMs = Math.max(0, segment.endMs - segment.startMs);
    if (!(segmentDurationMs > 0)) continue;
    const eligibleRemainingMs = Math.max(0, eligibleMs - consumedSessionMs);
    if (!(eligibleRemainingMs > 0)) break;
    const allocatableMs = Math.min(segmentDurationMs, eligibleRemainingMs, remainingMs);
    if (!(allocatableMs > 0)) {
      consumedSessionMs += segmentDurationMs;
      continue;
    }
    const baseXp = allocatableMs / SESSION_XP_INTERVAL_MS;
    const sourceKey = `session:${taskId || "none"}:${awardedAt}:${index}:${segment.startMs}:${segment.endMs}:${allocatableMs}:${segment.multiplier}`;
    entries.push(buildSessionLedgerEntry(taskId, awardedAt, allocatableMs, baseXp, segment.multiplier, sourceKey));
    remainingMs -= allocatableMs;
    consumedSessionMs += segmentDurationMs;
  }

  return entries;
}

export function awardDailyConsistencyBonus(
  progress: RewardProgressV1,
  historyByTaskId: HistoryByTaskId,
  dayKey: string,
  awardedAt: number,
  momentumContext?: RewardMomentumContext
): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const normalizedDayKey = String(dayKey || "").trim() || localDayKey(awardedAt);
  const awardedTs = clampAwardTimestamp(previous, awardedAt);
  if (!awardedTs) return awardEntries(previous, [], 0);
  const existingSources = getExistingSourceKeys(previous);
  const state = getRewardQualifiedDayState(historyByTaskId, normalizedDayKey);
  if (!state.qualified) return awardEntries(previous, [], 0);
  const sourceKey = `daily:${normalizedDayKey}`;
  if (existingSources.has(sourceKey)) return awardEntries(previous, [], 0);
  return awardEntries(
    previous,
    [buildBonusLedgerEntry("dailyConsistency", awardedTs, DAILY_CONSISTENCY_XP, resolveRewardMultiplier(momentumContext, awardedTs), sourceKey)],
    0
  );
}

export function awardWeeklyGoalBonuses(
  progress: RewardProgressV1,
  historyByTaskId: HistoryByTaskId,
  tasks: Task[],
  weekStarting: DashboardWeekStart,
  awardedAt: number,
  momentumContext?: RewardMomentumContext
): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const awardedTs = clampAwardTimestamp(previous, awardedAt);
  if (!awardedTs) return awardEntries(previous, [], 0);
  const existingSources = getExistingSourceKeys(previous);
  const weekProgress = getRewardWeekProgress(historyByTaskId, tasks, weekStarting, awardedTs);
  const multiplier = resolveRewardMultiplier(
    momentumContext || {
      historyByTaskId,
      tasks,
      weekStarting,
    },
    awardedTs
  );
  const entries: RewardLedgerEntry[] = [];
  if (weekProgress.reached60) {
    const sourceKey = `weekly60:${weekProgress.weekKey}`;
    if (!existingSources.has(sourceKey)) entries.push(buildBonusLedgerEntry("weeklyGoal60", awardedTs, WEEKLY_GOAL_60_XP, multiplier, sourceKey));
  }
  if (weekProgress.reached100) {
    const sourceKey = `weekly100:${weekProgress.weekKey}`;
    if (!existingSources.has(sourceKey)) entries.push(buildBonusLedgerEntry("weeklyGoal100", awardedTs, WEEKLY_GOAL_100_XP, multiplier, sourceKey));
  }
  return awardEntries(previous, entries, 0);
}

export function awardCompletedSessionXp(progress: RewardProgressV1, context: CompletedSessionXpContext): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const awardedAt = clampAwardTimestamp(previous, context.awardedAt);
  const completedSessionsDelta = 1;
  if (!awardedAt) return awardEntries(previous, [], completedSessionsDelta);

  const rawTaskId = context.taskId == null ? "" : String(context.taskId || "").trim();
  const taskId = rawTaskId || null;
  const eligibleMs = getSessionEligibleMs(context.elapsedMs);
  const existingSources = getExistingSourceKeys(previous);
  const entries: RewardLedgerEntry[] = [];
  const completionMultiplier = resolveRewardMultiplier(context, awardedAt);
  const normalizedSegments = normalizeSessionSegments(context, awardedAt, completionMultiplier);

  if (eligibleMs > 0) {
    const dayKey = localDayKey(awardedAt);
    const awardedToday = sumDailySessionXp(previous.awardLedger, dayKey);
    const remainingDailyXp = Math.max(0, DAILY_BASE_SESSION_XP_CAP - awardedToday);
    const sessionEntries = buildScaledSessionLedgerEntries(taskId, awardedAt, eligibleMs, remainingDailyXp, normalizedSegments).filter(
      (entry) => !existingSources.has(entry.sourceKey)
    );
    sessionEntries.forEach((entry) => existingSources.add(entry.sourceKey));
    entries.push(...sessionEntries);
  }

  const mergedHistory = context.historyByTaskId || {};
  const dayKey = localDayKey(awardedAt);
  const qualifiedDay = getRewardQualifiedDayState(mergedHistory, dayKey);
  const nextSources = new Set([...existingSources, ...entries.map((entry) => entry.sourceKey)]);
  if (qualifiedDay.qualified) {
    const dailySourceKey = `daily:${dayKey}`;
    if (!nextSources.has(dailySourceKey)) {
      entries.push(buildBonusLedgerEntry("dailyConsistency", awardedAt, DAILY_CONSISTENCY_XP, completionMultiplier, dailySourceKey));
      nextSources.add(dailySourceKey);
      const streakLength = getRewardStreakLength(mergedHistory, dayKey);
      const streakXp = getStreakBonusXp(streakLength);
      if (streakXp > 0) {
        const streakSourceKey = `streak:${dayKey}`;
        if (!nextSources.has(streakSourceKey)) {
          entries.push(buildBonusLedgerEntry("streakBonus", awardedAt, streakXp, completionMultiplier, streakSourceKey));
          nextSources.add(streakSourceKey);
        }
      }
    }
  }

  const weekProgress = getRewardWeekProgress(mergedHistory, context.tasks, context.weekStarting, awardedAt);
  if (weekProgress.reached60) {
    const weekly60SourceKey = `weekly60:${weekProgress.weekKey}`;
    if (!nextSources.has(weekly60SourceKey)) {
      entries.push(buildBonusLedgerEntry("weeklyGoal60", awardedAt, WEEKLY_GOAL_60_XP, completionMultiplier, weekly60SourceKey));
      nextSources.add(weekly60SourceKey);
    }
  }
  if (weekProgress.reached100) {
    const weekly100SourceKey = `weekly100:${weekProgress.weekKey}`;
    if (!nextSources.has(weekly100SourceKey)) {
      entries.push(buildBonusLedgerEntry("weeklyGoal100", awardedAt, WEEKLY_GOAL_100_XP, completionMultiplier, weekly100SourceKey));
      nextSources.add(weekly100SourceKey);
    }
  }

  return awardEntries(previous, entries, completedSessionsDelta);
}

export function getRankForXp(totalXp: number): RankDefinition {
  const xp = Math.max(0, Math.floor(Number(totalXp || 0) || 0));
  let match = RANK_LADDER[0];
  for (const rank of RANK_LADDER) {
    if (xp >= rank.minXp) match = rank;
    else break;
  }
  return match;
}

export function getNextRank(totalXp: number): RankDefinition | null {
  const current = getRankForXp(totalXp);
  const index = RANK_LADDER.findIndex((rank) => rank.id === current.id);
  if (index < 0 || index >= RANK_LADDER.length - 1) return null;
  const next = RANK_LADDER[index + 1];
  return Number.isFinite(next.minXp) ? next : null;
}

export function getRankById(rankId: string): RankDefinition {
  return RANK_BY_ID.get(String(rankId || "").trim().toLowerCase()) || RANK_LADDER[0];
}

export function getRankLabelById(rankId: string): string {
  return getRankById(rankId).label;
}

export function getRankThumbnailById(rankId: string): string {
  const normalizedRankId = String(rankId || "").trim().toLowerCase();
  return String(RANK_MODAL_THUMBNAIL_BY_ID[normalizedRankId] || RANK_MODAL_THUMBNAIL_FALLBACK_BY_ID[normalizedRankId] || "").trim();
}

export function getRankPlaceholderLabel(rankId: string): string {
  const normalizedRankId = String(rankId || "").trim().toLowerCase();
  const index = RANK_LADDER.findIndex((rank) => rank.id === normalizedRankId);
  if (index <= 0) return "U";
  return String(index);
}

export function getRankThumbnailDescriptor(rankId: string): RankThumbnailDescriptor {
  const normalizedRankId = getRankById(rankId).id;
  const src = getRankThumbnailById(normalizedRankId);
  if (src) return { kind: "image", src, rankId: normalizedRankId };
  return { kind: "placeholder", label: getRankPlaceholderLabel(normalizedRankId), rankId: normalizedRankId };
}

export function getRankLadderThumbnailSrc(currentRankId: string, storedThumbnailSrc: string): string {
  const currentRankThumbnail = getRankThumbnailById(currentRankId);
  if (currentRankThumbnail) return currentRankThumbnail;
  const storedRankId = getRankIdForThumbnailSrc(storedThumbnailSrc);
  return storedRankId ? getRankThumbnailById(storedRankId) : "";
}

export function getStoredRankThumbnailDescriptor(currentRankId: string, storedThumbnailSrc: string): RankThumbnailDescriptor {
  const current = getRankThumbnailDescriptor(currentRankId);
  if (current.kind === "image") return current;
  const storedRankId = getRankIdForThumbnailSrc(storedThumbnailSrc);
  if (storedRankId) {
    const stored = getRankThumbnailDescriptor(storedRankId);
    if (stored.kind === "image") return stored;
  }
  return current;
}

export function getRankIdForThumbnailSrc(src: string): string | null {
  const normalizedSrc = String(src || "").trim();
  return normalizedSrc ? RANK_ID_BY_MODAL_THUMBNAIL.get(normalizedSrc) || null : null;
}

export function getRankLabelForThumbnailSrc(src: string): string | null {
  const rankId = getRankIdForThumbnailSrc(src);
  return rankId ? getRankLabelById(rankId) : null;
}

export function buildRewardProgressForRankSelection(progress: RewardProgressV1, rankId: string): RewardProgressV1 {
  const base = normalizeRewardProgress(progress);
  const rank = getRankById(rankId);
  return {
    ...base,
    totalXp: rank.minXp,
    totalXpPrecise: rank.minXp,
    currentRankId: rank.id,
  };
}

export function awardSessionCompletionXp(progress: RewardProgressV1, _awardedAt: number): RewardAwardResult {
  void _awardedAt;
  return awardEntries(normalizeRewardProgress(progress), [], 1);
}

export function awardTaskLaunchXp(
  progress: RewardProgressV1,
  _context: LaunchXpContext | { taskId: string | null; awardedAt: number }
): RewardAwardResult {
  void _context;
  const previous = normalizeRewardProgress(progress);
  return awardEntries(previous, [], 0);
}

export function rebuildRewardProgressFromHistory(context: {
  historyByTaskId: HistoryByTaskId;
  tasks: Task[];
  weekStarting: DashboardWeekStart;
  momentumEntitled?: boolean;
}): RewardProgressV1 {
  const orderedSessions = Object.entries(context.historyByTaskId || {})
    .flatMap(([taskId, entries]) =>
      (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
          taskId: String(taskId || "").trim(),
          ts: Math.max(0, Math.floor(Number(entry?.ts || 0) || 0)),
          ms: Math.max(0, Math.floor(Number(entry?.ms || 0) || 0)),
        }))
        .filter((entry) => !!entry.taskId && entry.ts > 0 && entry.ms >= 0)
    )
    .sort((a, b) => a.ts - b.ts || a.taskId.localeCompare(b.taskId) || a.ms - b.ms);

  let next = normalizeRewardProgress(DEFAULT_REWARD_PROGRESS);
  for (const session of orderedSessions) {
    next = awardCompletedSessionXp(next, {
      taskId: session.taskId,
      awardedAt: session.ts,
      elapsedMs: session.ms,
      historyByTaskId: context.historyByTaskId || {},
      tasks: Array.isArray(context.tasks) ? context.tasks : [],
      weekStarting: context.weekStarting,
      momentumEntitled: context.momentumEntitled === true,
    }).next;
  }
  return normalizeRewardProgress(next);
}

export function reconcileRewardProgressWithHistory(context: {
  currentProgress: unknown;
  historyByTaskId: HistoryByTaskId;
  tasks: Task[];
  weekStarting: DashboardWeekStart;
  momentumEntitled?: boolean;
}): RewardProgressV1 {
  const current = normalizeRewardProgress(context.currentProgress);
  const rebuilt = rebuildRewardProgressFromHistory({
    historyByTaskId: context.historyByTaskId,
    tasks: context.tasks,
    weekStarting: context.weekStarting,
    momentumEntitled: context.momentumEntitled,
  });
  const hasCanonicalRewards =
    current.awardLedger.length > 0 ||
    current.totalXpPrecise > 0 ||
    current.totalXp > 0 ||
    current.completedSessions > 0 ||
    current.lastAwardedAt != null;
  if (!hasCanonicalRewards) return rebuilt;
  if (!current.awardLedger.length) return current;

  const existingSourceKeys = getExistingSourceKeys(current);
  const missingEntries = rebuilt.awardLedger.filter((entry) => !existingSourceKeys.has(entry.sourceKey));
  if (!missingEntries.length) return current;

  const addedXp = missingEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.xp) || 0), 0);
  const mergedLedger = normalizeAwardLedger(current.awardLedger.concat(missingEntries));
  const totalXpPrecise = Math.max(current.totalXpPrecise, current.totalXp) + addedXp;
  const totalXp = Math.max(0, Math.floor(totalXpPrecise));
  const lastAwardedAt = mergedLedger.reduce<number | null>(
    (latest, entry) => (latest == null || entry.ts > latest ? entry.ts : latest),
    current.lastAwardedAt
  );

  return {
    totalXp,
    totalXpPrecise,
    currentRankId: getRankForXp(totalXp).id,
    lastAwardedAt,
    completedSessions: Math.max(current.completedSessions, rebuilt.completedSessions),
    awardLedger: mergedLedger,
  };
}

export function buildRewardsHeaderViewModel(progress: RewardProgressV1): RewardsHeaderViewModel {
  const normalized = normalizeRewardProgress(progress);
  const currentRank = getRankForXp(normalized.totalXp);
  const nextRank = getNextRank(normalized.totalXp);
  const bandStart = currentRank.minXp;
  const bandEnd = nextRank?.minXp ?? currentRank.minXp;
  const bandWidth = Math.max(1, bandEnd - bandStart);
  const currentBandXp = Math.max(0, normalized.totalXp - bandStart);
  const nextBandXp = nextRank ? bandWidth : null;
  const xpToNext = nextRank ? Math.max(0, nextRank.minXp - normalized.totalXp) : null;
  const progressPct = nextRank ? Math.max(0, Math.min(100, (currentBandXp / bandWidth) * 100)) : 100;
  const progressLabel = nextRank ? `${currentBandXp}/${bandWidth} XP` : "Max rank";
  return {
    rankLabel: currentRank.label,
    totalXp: normalized.totalXp,
    progressPct,
    progressLabel,
    xpToNext,
    currentBandXp,
    nextBandXp,
  };
}

function formatWholeXp(value: number): string {
  return `${Math.round(Math.max(0, Number(value) || 0))} XP`;
}

function humanJoin(parts: string[]): string {
  const cleaned = parts.map((part) => String(part || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function formatTaskNameList(taskNames: string[]): string {
  const names = taskNames.map((taskName) => String(taskName || "").trim()).filter(Boolean);
  if (!names.length) return "a task";
  return humanJoin(names.slice(0, 3));
}

function summarizeRecentXpRewards(
  progress: RewardProgressV1,
  tasks: Task[],
  nowValue: number
): XpReasonSummary {
  const windowStart = Math.max(0, nowValue - DAY_MS);
  const taskNameById = new Map(
    (Array.isArray(tasks) ? tasks : [])
      .map((task) => [String(task?.id || "").trim(), String(task?.name || "").trim()] as const)
      .filter(([taskId]) => !!taskId)
  );
  const summary: XpReasonSummary = {
    totalXp: 0,
    sessionTaskXp: new Map<string, number>(),
    dailyConsistencyXp: 0,
    streakBonusXp: 0,
    weeklyGoal60Xp: 0,
    weeklyGoal100Xp: 0,
    launchXp: 0,
  };

  progress.awardLedger.forEach((entry) => {
    const ts = Math.max(0, Math.floor(Number(entry?.ts || 0) || 0));
    if (!ts || ts < windowStart || ts > nowValue) return;
    const xp = Math.max(0, Number(entry?.xp) || 0);
    if (!(xp > 0)) return;
    summary.totalXp += xp;
    if (entry.reason === "session") {
      const taskId = String(entry.taskId || "").trim();
      const taskName = taskNameById.get(taskId) || "a task";
      summary.sessionTaskXp.set(taskName, (summary.sessionTaskXp.get(taskName) || 0) + xp);
      return;
    }
    if (entry.reason === "dailyConsistency") {
      summary.dailyConsistencyXp += xp;
      return;
    }
    if (entry.reason === "streakBonus") {
      summary.streakBonusXp += xp;
      return;
    }
    if (entry.reason === "weeklyGoal60") {
      summary.weeklyGoal60Xp += xp;
      return;
    }
    if (entry.reason === "weeklyGoal100") {
      summary.weeklyGoal100Xp += xp;
      return;
    }
    if (entry.reason === "launch") {
      summary.launchXp += xp;
    }
  });

  return summary;
}

function formatXpRateLabel(multiplier: number): string {
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  if (Math.abs(safeMultiplier - 1) < 0.001) return "You are currently earning XP at the standard 1x rate.";
  const formatted = Number.isInteger(safeMultiplier) ? String(safeMultiplier) : safeMultiplier.toFixed(1).replace(/\.0$/, "");
  return `You are currently earning XP at a ${formatted}x multiplier.`;
}

function getXpProgressRateSummary(tasks: Task[], nowValue: number, opts?: XpProgressArchieOptions): string {
  if (!opts?.momentumEntitled) return formatXpRateLabel(1);
  if (!opts.historyByTaskId || !opts.weekStarting) {
    return formatXpRateLabel(1);
  }
  const multiplier = computeMomentumSnapshot({
    tasks,
    historyByTaskId: opts.historyByTaskId,
    weekStarting: opts.weekStarting,
    nowValue,
  }).multiplier;
  return formatXpRateLabel(multiplier);
}

export function buildXpProgressArchieMessage(
  progressInput: unknown,
  tasks: Task[],
  nowValue = Date.now(),
  opts?: XpProgressArchieOptions
): string {
  const progress = normalizeRewardProgress(progressInput);
  const safeNow = Math.max(0, Math.floor(Number(nowValue || 0) || 0)) || Date.now();
  const recentSummary = summarizeRecentXpRewards(progress, tasks, safeNow);
  const rateSummary = getXpProgressRateSummary(tasks, safeNow, opts);

  if (!(recentSummary.totalXp > 0)) {
    return `In the last 24 hours, you have not earned any XP yet. ${rateSummary}`;
  }

  const detailParts: string[] = [];
  if (recentSummary.sessionTaskXp.size) {
    const sessionTasks = Array.from(recentSummary.sessionTaskXp.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([taskName]) => taskName);
    const sessionXp = Array.from(recentSummary.sessionTaskXp.values()).reduce((sum, value) => sum + value, 0);
    detailParts.push(`${formatWholeXp(sessionXp)} from session time on ${formatTaskNameList(sessionTasks)}`);
  }
  if (recentSummary.dailyConsistencyXp > 0) {
    detailParts.push(`${formatWholeXp(recentSummary.dailyConsistencyXp)} from daily consistency`);
  }
  if (recentSummary.streakBonusXp > 0) {
    detailParts.push(`${formatWholeXp(recentSummary.streakBonusXp)} from streak bonus`);
  }
  if (recentSummary.weeklyGoal60Xp > 0) {
    detailParts.push(`${formatWholeXp(recentSummary.weeklyGoal60Xp)} from the 60% weekly goal bonus`);
  }
  if (recentSummary.weeklyGoal100Xp > 0) {
    detailParts.push(`${formatWholeXp(recentSummary.weeklyGoal100Xp)} from the 100% weekly goal bonus`);
  }
  if (recentSummary.launchXp > 0) {
    detailParts.push(`${formatWholeXp(recentSummary.launchXp)} from launches`);
  }

  return `In the last 24 hours, you earned ${formatWholeXp(recentSummary.totalXp)}: ${humanJoin(detailParts)}. ${rateSummary}`;
}
