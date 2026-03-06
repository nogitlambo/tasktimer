export type RewardProgressV1 = {
  totalXp: number;
  currentRankId: string;
  lastAwardedAt: number | null;
  completedSessions: number;
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

export type RewardsHeaderViewModel = {
  rankLabel: string;
  totalXp: number;
  progressPct: number;
  progressLabel: string;
  xpToNext: number | null;
  currentBandXp: number;
  nextBandXp: number | null;
};

const XP_PER_COMPLETED_SESSION = 25;

export const DEFAULT_REWARD_PROGRESS: RewardProgressV1 = {
  totalXp: 0,
  currentRankId: "cadet",
  lastAwardedAt: null,
  completedSessions: 0,
};

export const RANK_LADDER: RankDefinition[] = [
  { id: "cadet", label: "Cadet", minXp: 0 },
  { id: "operator", label: "Operator", minXp: 100 },
  { id: "specialist", label: "Specialist", minXp: 250 },
  { id: "vanguard", label: "Vanguard", minXp: 500 },
  { id: "architect", label: "Architect", minXp: 900 },
];

export function normalizeRewardProgress(input: unknown): RewardProgressV1 {
  if (!input || typeof input !== "object") return { ...DEFAULT_REWARD_PROGRESS };
  const obj = input as Record<string, unknown>;
  const totalXp = Math.max(0, Math.floor(Number(obj.totalXp || 0) || 0));
  const completedSessions = Math.max(0, Math.floor(Number(obj.completedSessions || 0) || 0));
  const lastAwardedAtRaw = Number(obj.lastAwardedAt || 0);
  const lastAwardedAt = Number.isFinite(lastAwardedAtRaw) && lastAwardedAtRaw > 0 ? Math.floor(lastAwardedAtRaw) : null;
  const resolvedRank = getRankForXp(totalXp);
  const rawRankId = String(obj.currentRankId || "").trim();
  return {
    totalXp,
    completedSessions,
    lastAwardedAt,
    currentRankId: rawRankId && rawRankId === resolvedRank.id ? rawRankId : resolvedRank.id,
  };
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
  return RANK_LADDER[index + 1];
}

export function awardSessionCompletionXp(progress: RewardProgressV1, awardedAt: number): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const nextTotalXp = previous.totalXp + XP_PER_COMPLETED_SESSION;
  const nextRank = getRankForXp(nextTotalXp);
  const next: RewardProgressV1 = {
    totalXp: nextTotalXp,
    currentRankId: nextRank.id,
    lastAwardedAt: Math.max(0, Math.floor(Number(awardedAt || 0) || 0)) || Date.now(),
    completedSessions: previous.completedSessions + 1,
  };
  return {
    amount: XP_PER_COMPLETED_SESSION,
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
