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
  currentRankId: "unranked",
  lastAwardedAt: null,
  completedSessions: 0,
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
