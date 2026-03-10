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
  reason: "launch" | "session" | "dailyConsistency";
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

export type LaunchXpContext = {
  taskId: string;
  awardedAt: number;
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

export const XP_PER_TASK_LAUNCH = 5;
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

export const RANK_MODAL_THUMBNAIL_BY_ID: Record<string, string> = {
  director: "/insignias/director.png",
  ascendent: "/insignias/ascendent.png",
  commander: "/insignias/commander.png",
  architect: "/insignias/architect.png",
};

const RANK_BY_ID = new Map(RANK_LADDER.map((rank) => [rank.id, rank] as const));
const RANK_ID_BY_MODAL_THUMBNAIL = new Map(
  Object.entries(RANK_MODAL_THUMBNAIL_BY_ID).map(([rankId, src]) => [String(src || "").trim(), rankId] as const)
);

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
      const reason: RewardLedgerEntry["reason"] =
        obj.reason === "dailyConsistency" ? "dailyConsistency" : obj.reason === "launch" ? "launch" : "session";
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
  return String(RANK_MODAL_THUMBNAIL_BY_ID[String(rankId || "").trim().toLowerCase()] || "").trim();
}

export function getRankLadderThumbnailSrc(currentRankId: string, storedThumbnailSrc: string): string {
  const currentRankThumbnail = getRankThumbnailById(currentRankId);
  if (currentRankThumbnail) return currentRankThumbnail;
  const storedRankId = getRankIdForThumbnailSrc(storedThumbnailSrc);
  return storedRankId ? getRankThumbnailById(storedRankId) : "";
}

export function getRankIdForThumbnailSrc(src: string): string | null {
  const normalizedSrc = String(src || "").trim();
  return normalizedSrc ? RANK_ID_BY_MODAL_THUMBNAIL.get(normalizedSrc) || null : null;
}

export function getRankLabelForThumbnailSrc(src: string): string | null {
  const rankId = getRankIdForThumbnailSrc(src);
  return rankId ? getRankLabelById(rankId) : null;
}

export function awardSessionCompletionXp(progress: RewardProgressV1, awardedAt: number): RewardAwardResult {
  return awardTaskLaunchXp(progress, {
    taskId: null,
    awardedAt,
  });
}

export function awardTaskLaunchXp(
  progress: RewardProgressV1,
  context: LaunchXpContext | { taskId: string | null; awardedAt: number }
): RewardAwardResult {
  const previous = normalizeRewardProgress(progress);
  const awardedAt = Math.max(0, Math.floor(Number(context.awardedAt || 0) || 0)) || Date.now();
  const rawTaskId = context.taskId == null ? "" : String(context.taskId || "").trim();
  const launchAwardXp = XP_PER_TASK_LAUNCH;
  const nextLedger = normalizeAwardLedger(previous.awardLedger);
  nextLedger.push({
    ts: awardedAt,
    dayKey: localDayKey(awardedAt),
    taskId: rawTaskId || null,
    xp: launchAwardXp,
    eligibleMs: 0,
    reason: "launch",
  });

  const nextTotalXp = previous.totalXp + launchAwardXp;
  const nextRank = getRankForXp(nextTotalXp);
  const next: RewardProgressV1 = {
    totalXp: nextTotalXp,
    currentRankId: nextRank.id,
    lastAwardedAt: awardedAt,
    completedSessions: previous.completedSessions,
    awardLedger: normalizeAwardLedger(nextLedger),
  };

  return {
    amount: launchAwardXp,
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
