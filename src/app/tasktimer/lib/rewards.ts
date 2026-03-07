export type RewardProgressV1 = {
  totalXp: number;
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
  eligibleMs: number;
  reason: "session" | "dailyConsistency";
};

export type RankDefinition = {
  id: string;
  label: string;
  minXp: number;
};

export type RewardAwardResult = {
  amount: number;
  previous: RewardProgressV1;
  next: RewardProgressV1;
  rankChanged: boolean;
};

export type SessionXpContext = {
  taskId: string;
  completedAt: number;
  elapsedMs: number;
  checkpointCount: number;
  reachedFinalCheckpoint: boolean;
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

const MIN_ELIGIBLE_SESSION_MS = 5 * 60 * 1000;
const MID_SESSION_MS = 15 * 60 * 1000;
const DAILY_XP_CAP = 100;
const PER_TASK_HOURLY_XP_CAP = 25;
const CHECKPOINT_XP = 2;
const FINAL_CHECKPOINT_BONUS_XP = 5;
const DAILY_CONSISTENCY_THRESHOLD_MS = 45 * 60 * 1000;
const DAILY_CONSISTENCY_BONUS_XP = 10;
const LEDGER_RETENTION_DAYS = 35;

export const DEFAULT_REWARD_PROGRESS: RewardProgressV1 = {
  totalXp: 0,
  currentRankId: "unranked",
  lastAwardedAt: null,
  completedSessions: 0,
  awardLedger: [],
};

export const RANK_LADDER: RankDefinition[] = [
  { id: "unranked", label: "Unranked", minXp: 0 },
  { id: "initiate", label: "Initiate", minXp: 100 },
  { id: "operator", label: "Operator", minXp: Number.POSITIVE_INFINITY },
  { id: "technician", label: "Technician", minXp: Number.POSITIVE_INFINITY },
  { id: "engineer", label: "Engineer", minXp: Number.POSITIVE_INFINITY },
  { id: "analyst", label: "Analyst", minXp: Number.POSITIVE_INFINITY },
  { id: "specialist", label: "Specialist", minXp: Number.POSITIVE_INFINITY },
  { id: "integrator", label: "Integrator", minXp: Number.POSITIVE_INFINITY },
  { id: "strategist", label: "Strategist", minXp: Number.POSITIVE_INFINITY },
  { id: "director", label: "Director", minXp: Number.POSITIVE_INFINITY },
  { id: "ascendent", label: "Ascendent", minXp: Number.POSITIVE_INFINITY },
  { id: "commander", label: "Commander", minXp: Number.POSITIVE_INFINITY },
  { id: "architect", label: "Architect", minXp: Number.POSITIVE_INFINITY },
];

const RANK_BY_ID = new Map(RANK_LADDER.map((rank) => [rank.id, rank] as const));

export function normalizeRewardProgress(input: unknown): RewardProgressV1 {
  if (!input || typeof input !== "object") return { ...DEFAULT_REWARD_PROGRESS };
  const obj = input as Record<string, unknown>;
  const totalXp = Math.max(0, Math.floor(Number(obj.totalXp || 0) || 0));
  const completedSessions = Math.max(0, Math.floor(Number(obj.completedSessions || 0) || 0));
  const lastAwardedAtRaw = Number(obj.lastAwardedAt || 0);
  const lastAwardedAt = Number.isFinite(lastAwardedAtRaw) && lastAwardedAtRaw > 0 ? Math.floor(lastAwardedAtRaw) : null;
  const awardLedger = normalizeAwardLedger(obj.awardLedger);
  const resolvedRank = getRankForXp(totalXp);
  const rawRankId = String(obj.currentRankId || "").trim();
  return {
    totalXp,
    completedSessions,
    lastAwardedAt,
    awardLedger,
    currentRankId: rawRankId && rawRankId === resolvedRank.id ? rawRankId : resolvedRank.id,
  };
}

function localDayKey(ts: number): string {
  const date = new Date(Math.max(0, Math.floor(Number(ts || 0) || 0)) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAwardLedger(input: unknown): RewardLedgerEntry[] {
  if (!Array.isArray(input)) return [];
  const minTs = Date.now() - LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const ts = Math.max(0, Math.floor(Number(obj.ts || 0) || 0));
      const xp = Math.max(0, Math.floor(Number(obj.xp || 0) || 0));
      const eligibleMs = Math.max(0, Math.floor(Number(obj.eligibleMs || 0) || 0));
      const reason = obj.reason === "dailyConsistency" ? "dailyConsistency" : "session";
      const rawTaskId = String(obj.taskId || "").trim();
      if (!ts || (xp <= 0 && eligibleMs <= 0)) return null;
      if (ts < minTs) return null;
      return {
        ts,
        xp,
        eligibleMs,
        reason,
        taskId: rawTaskId || null,
        dayKey: String(obj.dayKey || "").trim() || localDayKey(ts),
      } satisfies RewardLedgerEntry;
    })
    .filter((entry): entry is RewardLedgerEntry => !!entry)
    .sort((a, b) => a.ts - b.ts);
}

function clampSessionBaseXp(elapsedMs: number): number {
  const wholeMinutes = Math.floor(Math.max(0, elapsedMs) / 60000);
  if (wholeMinutes < 5) return 0;
  if (elapsedMs >= MID_SESSION_MS) return Math.floor(wholeMinutes / 4);
  return Math.floor(wholeMinutes / 5);
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

export function awardSessionCompletionXp(progress: RewardProgressV1, awardedAt: number): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const nextTotalXp = previous.totalXp + 25;
  const nextRank = getRankForXp(nextTotalXp);
  const next: RewardProgressV1 = {
    totalXp: nextTotalXp,
    currentRankId: nextRank.id,
    lastAwardedAt: Math.max(0, Math.floor(Number(awardedAt || 0) || 0)) || Date.now(),
    completedSessions: previous.completedSessions + 1,
    awardLedger: previous.awardLedger.slice(),
  };
  return {
    amount: 25,
    previous,
    next,
    rankChanged: previous.currentRankId !== next.currentRankId,
  };
}

export function awardLoggedSessionXp(progress: RewardProgressV1, context: SessionXpContext): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const completedAt = Math.max(0, Math.floor(Number(context.completedAt || 0) || 0)) || Date.now();
  const elapsedMs = Math.max(0, Math.floor(Number(context.elapsedMs || 0) || 0));
  const taskId = String(context.taskId || "").trim();
  const checkpointCount = Math.max(0, Math.floor(Number(context.checkpointCount || 0) || 0));
  const reachedFinalCheckpoint = !!context.reachedFinalCheckpoint;
  const ledger = normalizeAwardLedger(previous.awardLedger);

  const sessionBaseXp = clampSessionBaseXp(elapsedMs);
  const sessionBonusXp = checkpointCount * CHECKPOINT_XP + (reachedFinalCheckpoint ? FINAL_CHECKPOINT_BONUS_XP : 0);
  const sessionRequestedXp = sessionBaseXp + sessionBonusXp;
  const dayKey = localDayKey(completedAt);
  const dailyXpUsed = ledger.filter((entry) => entry.dayKey === dayKey).reduce((sum, entry) => sum + entry.xp, 0);
  const taskHourlyXpUsed = ledger
    .filter((entry) => entry.reason === "session" && entry.taskId === taskId && completedAt - entry.ts < 60 * 60 * 1000)
    .reduce((sum, entry) => sum + entry.xp, 0);
  const sessionAwardXp =
    elapsedMs >= MIN_ELIGIBLE_SESSION_MS && sessionRequestedXp > 0
      ? Math.max(
          0,
          Math.min(sessionRequestedXp, DAILY_XP_CAP - dailyXpUsed, PER_TASK_HOURLY_XP_CAP - taskHourlyXpUsed)
        )
      : 0;

  const nextLedger = ledger.slice();
  if (elapsedMs >= MIN_ELIGIBLE_SESSION_MS) {
    nextLedger.push({
      ts: completedAt,
      dayKey,
      taskId: taskId || null,
      xp: sessionAwardXp,
      eligibleMs: elapsedMs,
      reason: "session",
    });
  }

  const updatedDailyXp = dailyXpUsed + sessionAwardXp;
  const updatedDailyEligibleMs = nextLedger
    .filter((entry) => entry.dayKey === dayKey && entry.reason === "session")
    .reduce((sum, entry) => sum + entry.eligibleMs, 0);
  const alreadyAwardedConsistency = nextLedger.some(
    (entry) => entry.dayKey === dayKey && entry.reason === "dailyConsistency" && entry.xp > 0
  );
  const consistencyAwardXp =
    updatedDailyEligibleMs >= DAILY_CONSISTENCY_THRESHOLD_MS &&
    !alreadyAwardedConsistency &&
    updatedDailyXp < DAILY_XP_CAP
      ? Math.max(0, Math.min(DAILY_CONSISTENCY_BONUS_XP, DAILY_XP_CAP - updatedDailyXp))
      : 0;

  if (consistencyAwardXp > 0) {
    nextLedger.push({
      ts: completedAt,
      dayKey,
      taskId: null,
      xp: consistencyAwardXp,
      eligibleMs: 0,
      reason: "dailyConsistency",
    });
  }

  const totalAwardXp = sessionAwardXp + consistencyAwardXp;
  const nextTotalXp = previous.totalXp + totalAwardXp;
  const nextRank = getRankForXp(nextTotalXp);
  const next: RewardProgressV1 = {
    totalXp: nextTotalXp,
    currentRankId: nextRank.id,
    lastAwardedAt: totalAwardXp > 0 ? completedAt : previous.lastAwardedAt,
    completedSessions: previous.completedSessions + (elapsedMs >= MIN_ELIGIBLE_SESSION_MS ? 1 : 0),
    awardLedger: normalizeAwardLedger(nextLedger),
  };

  return {
    amount: totalAwardXp,
    previous,
    next,
    rankChanged: previous.currentRankId !== next.currentRankId,
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
