import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import {
  findStoredCustomAvatarUploadSrc,
  googleAvatarIdForUid,
  isCustomAvatarIdForUid,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
} from "./accountProfileStorage";
import { AVATAR_CATALOG, normalizeBundledAvatarWebpSrc } from "./avatarCatalog";
import type { DashboardWeekStart } from "./historyChart";
import { RANK_LADDER, getNextRank, getRankForXp, getRewardStreakLength, normalizeRewardProgress, type RankDefinition, type RewardProgressV1 } from "./rewards";
import type { HistoryByTaskId, HistoryEntry, LiveSessionsByTaskId } from "./types";

export const LEADERBOARD_PROFILE_UPDATED_EVENT = "tasktimer:leaderboardProfileUpdated";

export type LeaderboardProfile = {
  uid: string;
  username: string | null;
  displayLabel: string;
  avatarId: string | null;
  avatarCustomSrc: string | null;
  googlePhotoUrl: string | null;
  rankThumbnailSrc: string | null;
  rewardCurrentRankId: string | null;
  rewardTotalXp: number;
  completedTaskCount: number;
  streakDays: number;
  totalFocusMs: number;
  weeklyFocusMs: number;
  weeklyXpGain: number;
  memberSinceMs: number | null;
  schemaVersion: 1;
};

type LeaderboardMetricsSnapshot = {
  rewardCurrentRankId: string | null;
  rewardTotalXp: number;
  completedTaskCount: number;
  streakDays: number;
  totalFocusMs: number;
  weeklyFocusMs: number;
  weeklyXpGain: number;
};

export type LeaderboardScreenData = {
  topEntries: LeaderboardProfile[];
  risingEntries: LeaderboardProfile[];
  rivalEntries: LeaderboardProfile[];
  weeklyEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRank: number | null;
  currentUserGapToNextXp: number | null;
  currentUserRivalRank: number | null;
  currentUserWeeklyEntry: LeaderboardProfile | null;
  currentUserWeeklyRank: number | null;
};

export type WeeklyLeaderboardRow = {
  profile: LeaderboardProfile;
  rank: number | null;
  rankLabel: string;
  playerLabel: string;
  isCurrentUser: boolean;
  isPinnedCurrentUser?: boolean;
  isPlaceholder: boolean;
  isDummy: boolean;
};

export type RankRivalStatus = "closest" | "current" | "rival";

export type RankRivalLadderRow = WeeklyLeaderboardRow & {
  status: RankRivalStatus;
  statusLabel: string;
  remainingXp: number | null;
  remainingLabel: string;
  progressPct: number;
  progressLabel: string;
};

export type RankRivalLadderViewModel = {
  previousRank: RankDefinition | null;
  currentRank: RankDefinition;
  nextRank: RankDefinition | null;
  targetLabel: string;
  targetXp: number | null;
  subtitle: string;
  rows: RankRivalLadderRow[];
  isMaxRank: boolean;
};

type LeaderboardIdentityFields = Pick<
  LeaderboardProfile,
  "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl" | "rankThumbnailSrc" | "rewardCurrentRankId" | "memberSinceMs"
>;

const LEADERBOARD_SCHEMA_VERSION = 1;
const LEADERBOARD_IDENTITY_CACHE_TTL_MS = 60_000;
const WEEKLY_LEADERBOARD_DISPLAY_LIMIT = 10;
const RANK_RIVALS_QUERY_LIMIT = 100;
const EXCLUDED_LEADERBOARD_USERNAMES = new Set(["codexemaillin_yixnc2", "codexemaillinktest"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const avatarSrcById = AVATAR_CATALOG.reduce<Record<string, string>>((acc, avatar) => {
  const id = String(avatar?.id || "").trim();
  const src = String(avatar?.src || "").trim();
  if (id && src) acc[id] = src;
  return acc;
}, {});
const leaderboardIdentityCache = new Map<string, { expiresAtMs: number; value: LeaderboardIdentityFields }>();

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function leaderboardDoc(uid: string) {
  const db = dbOrNull();
  if (!db || !uid) return null;
  return doc(db, "leaderboardProfiles", uid);
}

function normalizeString(value: unknown, maxLength = 200): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeInt(value: unknown): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function normalizeOptionalTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" || typeof value === "string") {
    const parsed = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }
  if (typeof value === "object") {
    const record = value as { toMillis?: () => number; seconds?: number };
    if (typeof record.toMillis === "function") {
      const millis = record.toMillis();
      return Number.isFinite(millis) && millis > 0 ? Math.floor(millis) : null;
    }
    if (Number.isFinite(Number(record.seconds))) {
      const millis = Number(record.seconds) * 1000;
      return millis > 0 ? Math.floor(millis) : null;
    }
  }
  return null;
}

function normalizeLeaderboardProfileRecord(id: string, raw: Record<string, unknown> | null | undefined): LeaderboardProfile | null {
  if (!raw) return null;
  const uid = String(raw.uid || id || "").trim();
  if (!uid) return null;
  const username = normalizeString(raw.username, 64);
  const displayLabel = username || "User";
  const rewardTotalXp = normalizeInt(raw.rewardTotalXp);
  const rewardCurrentRankId = getRankForXp(rewardTotalXp).id;
  const completedTaskCount = normalizeInt(raw.completedTaskCount);
  return {
    uid,
    username,
    displayLabel,
    avatarId: normalizeString(raw.avatarId, 120),
    avatarCustomSrc: normalizeString(raw.avatarCustomSrc, 900_000),
    googlePhotoUrl: normalizeString(raw.googlePhotoUrl, 2_000),
    rankThumbnailSrc: normalizeString(raw.rankThumbnailSrc, 900_000),
    rewardCurrentRankId,
    rewardTotalXp,
    completedTaskCount,
    streakDays: normalizeInt(raw.streakDays),
    totalFocusMs: normalizeInt(raw.totalFocusMs),
    weeklyFocusMs: normalizeInt(raw.weeklyFocusMs),
    weeklyXpGain: normalizeInt(raw.weeklyXpGain),
    memberSinceMs: normalizeOptionalTimestampMs(raw.memberSinceMs),
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
  };
}

function asLeaderboardProfile(docSnap: QueryDocumentSnapshot | null): LeaderboardProfile | null {
  if (!docSnap) return null;
  return normalizeLeaderboardProfileRecord(docSnap.id, docSnap.data() as Record<string, unknown>);
}

function isExcludedLeaderboardProfile(profile: LeaderboardProfile | null | undefined): boolean {
  if (!profile) return false;
  const username = String(profile.username || profile.displayLabel || "").trim().toLowerCase();
  return EXCLUDED_LEADERBOARD_USERNAMES.has(username);
}

function visibleLeaderboardProfiles(profiles: Array<LeaderboardProfile | null | undefined>): LeaderboardProfile[] {
  return profiles.filter((profile): profile is LeaderboardProfile => !!profile && !isExcludedLeaderboardProfile(profile));
}

function docsFromSettledQuery<T extends { docs: QueryDocumentSnapshot[] }>(
  result: PromiseSettledResult<T>
): QueryDocumentSnapshot[] {
  return result.status === "fulfilled" ? result.value.docs : [];
}

function sizeFromSettledQuery<T extends { size: number }>(result: PromiseSettledResult<T>): number | null {
  return result.status === "fulfilled" ? result.value.size : null;
}

function buildProjectedHistory(historyByTaskId: HistoryByTaskId, liveSessionsByTaskId: LiveSessionsByTaskId): HistoryByTaskId {
  const projected: HistoryByTaskId = {};
  const taskIds = new Set<string>([
    ...Object.keys(historyByTaskId || {}).filter(Boolean),
    ...Object.keys(liveSessionsByTaskId || {}).filter(Boolean),
  ]);
  taskIds.forEach((taskId) => {
    const finalized = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId].slice() : [];
    const liveSession = liveSessionsByTaskId?.[taskId];
    if (liveSession && String(liveSession.taskId || "").trim() === String(taskId || "").trim()) {
      const ts = normalizeInt(liveSession.updatedAtMs || liveSession.startedAtMs);
      const ms = normalizeInt(liveSession.elapsedMs);
      if (ts > 0) {
        const liveEntry: HistoryEntry = {
          ts,
          ms,
          name: String(liveSession.name || "").trim() || "Task",
          ...(liveSession.color ? { color: liveSession.color } : {}),
          ...(liveSession.note ? { note: liveSession.note } : {}),
        };
        finalized.push(liveEntry);
      }
    }
    if (finalized.length) projected[taskId] = finalized;
  });
  return projected;
}

export function getWeeklyLeaderboardUtcPeriod(nowMs = Date.now()): { startMs: number; endMs: number } {
  const nowDate = new Date(normalizeInt(nowMs) || Date.now());
  const startMs = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate() - nowDate.getUTCDay(),
    0,
    0,
    0,
    0
  );
  return {
    startMs,
    endMs: startMs + 7 * DAY_MS - 1,
  };
}

export function formatWeeklyLeaderboardUtcPeriodLabel(nowMs = Date.now()): string {
  const period = getWeeklyLeaderboardUtcPeriod(nowMs);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Week period from ${formatter.format(new Date(period.startMs))} to ${formatter.format(new Date(period.endMs))} UTC`;
}

export function formatWeeklyLeaderboardUtcPeriodTitle(nowMs = Date.now()): string {
  const period = getWeeklyLeaderboardUtcPeriod(nowMs);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  return `Week ${formatter.format(new Date(period.startMs))} to ${formatter.format(new Date(period.endMs))} UTC`;
}

export function formatWeeklyLeaderboardTimeRemaining(nowMs = Date.now()): string {
  const period = getWeeklyLeaderboardUtcPeriod(nowMs);
  const remainingMs = Math.max(0, period.endMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function sumWeeklyXpGain(rewards: RewardProgressV1, period: { startMs: number; endMs: number }): number {
  return normalizeRewardProgress(rewards).awardLedger.reduce((sum, entry) => {
    const ts = normalizeInt(entry?.ts);
    const xp = normalizeInt(entry?.xp);
    if (!ts || ts < period.startMs || ts > period.endMs || xp <= 0) return sum;
    return sum + xp;
  }, 0);
}

function sumWeeklyFocusMs(projectedHistory: HistoryByTaskId, period: { startMs: number; endMs: number }): number {
  return Object.values(projectedHistory).reduce((sum, entries) => {
    if (!Array.isArray(entries)) return sum;
    return (
      sum +
      entries.reduce((entrySum, entry) => {
        const ts = normalizeInt(entry?.ts);
        if (!ts || ts < period.startMs || ts > period.endMs) return entrySum;
        return entrySum + normalizeInt(entry?.ms);
      }, 0)
    );
  }, 0);
}

function resolveBuiltInAvatarSrc(avatarIdRaw: string | null | undefined): string {
  const avatarId = String(avatarIdRaw || "").trim();
  if (!avatarId) return "";
  return String(avatarSrcById[avatarId] || "").trim();
}

function dispatchLeaderboardProfileUpdated(uid: string): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.dispatchEvent(new CustomEvent(LEADERBOARD_PROFILE_UPDATED_EVENT, { detail: { uid } }));
  } catch {
    // Ignore custom-event failures.
  }
}

function applyLocalAvatarIdentity(uid: string, identity: LeaderboardIdentityFields): LeaderboardIdentityFields {
  if (typeof window === "undefined" || !uid) return identity;
  const storedAvatarId = readStoredAvatarId(uid);
  if (!storedAvatarId) return identity;
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const customSrc = isCustomAvatarIdForUid(uid, storedAvatarId)
    ? findStoredCustomAvatarUploadSrc(uid, storedAvatarId) || readStoredCustomAvatarSrc(uid)
    : "";
  return {
    ...identity,
    avatarId: storedAvatarId,
    avatarCustomSrc: customSrc || null,
    googlePhotoUrl: storedAvatarId === googleAvatarIdForUid(uid) ? normalizeString(currentUser?.photoURL, 2_000) : identity.googlePhotoUrl,
  };
}

async function loadOwnLeaderboardIdentity(uid: string): Promise<LeaderboardIdentityFields> {
  const cached = leaderboardIdentityCache.get(uid);
  const nowValue = Date.now();
  if (cached && cached.expiresAtMs > nowValue) return applyLocalAvatarIdentity(uid, cached.value);

  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const db = dbOrNull();
  let username: string | null = null;
  let avatarId: string | null = null;
  let avatarCustomSrc: string | null = null;
  let googlePhotoUrl: string | null = normalizeString(currentUser?.photoURL, 2_000);
  let rankThumbnailSrc: string | null = null;
  let rewardCurrentRankId: string | null = null;
  let memberSinceMs: number | null = normalizeOptionalTimestampMs(currentUser?.metadata?.creationTime);

  if (db && uid) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        username = normalizeString(snap.get("username"), 64);
        avatarId = normalizeString(snap.get("avatarId"), 120);
        avatarCustomSrc = normalizeString(snap.get("avatarCustomSrc"), 900_000);
        googlePhotoUrl = normalizeString(snap.get("googlePhotoUrl"), 2_000) || googlePhotoUrl;
        rankThumbnailSrc = normalizeString(snap.get("rankThumbnailSrc"), 900_000);
        rewardCurrentRankId = normalizeString(snap.get("rewardCurrentRankId"), 120);
        memberSinceMs = normalizeOptionalTimestampMs(snap.get("createdAt")) || memberSinceMs;
      }
    } catch {
      // Fall back to auth/local identity.
    }
  }

  const resolved: LeaderboardIdentityFields = applyLocalAvatarIdentity(uid, {
    username,
    displayLabel: username || "User",
    avatarId,
    avatarCustomSrc,
    googlePhotoUrl,
    rankThumbnailSrc,
    rewardCurrentRankId,
    memberSinceMs,
  });

  leaderboardIdentityCache.set(uid, {
    expiresAtMs: nowValue + LEADERBOARD_IDENTITY_CACHE_TTL_MS,
    value: resolved,
  });
  return resolved;
}

export function buildLeaderboardMetricsSnapshot(input: {
  historyByTaskId: HistoryByTaskId;
  liveSessionsByTaskId: LiveSessionsByTaskId;
  rewards: RewardProgressV1 | null | undefined;
  nowMs?: number;
  weekStarting?: DashboardWeekStart;
}): LeaderboardMetricsSnapshot {
  const nowValue = normalizeInt(input.nowMs || Date.now()) || Date.now();
  const weeklyPeriod = getWeeklyLeaderboardUtcPeriod(nowValue);
  const rewards = normalizeRewardProgress(input.rewards);
  const projectedHistory = buildProjectedHistory(input.historyByTaskId || {}, input.liveSessionsByTaskId || {});
  const totalFocusMs = Object.values(projectedHistory).reduce((sum, entries) => {
    return (
      sum +
      (Array.isArray(entries)
        ? entries.reduce((entrySum, entry) => entrySum + normalizeInt(entry?.ms), 0)
        : 0)
    );
  }, 0);
  const weeklyFocusMs = sumWeeklyFocusMs(projectedHistory, weeklyPeriod);

  return {
    rewardCurrentRankId: normalizeString(rewards.currentRankId, 120),
    rewardTotalXp: normalizeInt(rewards.totalXp),
    completedTaskCount: normalizeInt(rewards.completedSessions),
    streakDays: getRewardStreakLength(projectedHistory),
    totalFocusMs,
    weeklyFocusMs,
    weeklyXpGain: sumWeeklyXpGain(rewards, weeklyPeriod),
  };
}

export async function saveLeaderboardProfile(
  uid: string,
  metrics: LeaderboardMetricsSnapshot,
  options?: { dispatchUpdatedEvent?: boolean }
): Promise<void> {
  const ref = leaderboardDoc(uid);
  if (!ref || !uid) return;
  const identity = await loadOwnLeaderboardIdentity(uid);
  await setDoc(
    ref,
    {
      uid,
      username: identity.username,
      displayLabel: identity.displayLabel,
      avatarId: identity.avatarId,
      avatarCustomSrc: identity.avatarCustomSrc,
      googlePhotoUrl: identity.googlePhotoUrl,
      rankThumbnailSrc: identity.rankThumbnailSrc,
      rewardCurrentRankId: normalizeString(metrics.rewardCurrentRankId, 120) || identity.rewardCurrentRankId,
      rewardTotalXp: normalizeInt(metrics.rewardTotalXp),
      completedTaskCount: normalizeInt(metrics.completedTaskCount),
      streakDays: normalizeInt(metrics.streakDays),
      totalFocusMs: normalizeInt(metrics.totalFocusMs),
      weeklyFocusMs: normalizeInt(metrics.weeklyFocusMs),
      weeklyXpGain: normalizeInt(metrics.weeklyXpGain),
      memberSinceMs: identity.memberSinceMs,
      schemaVersion: LEADERBOARD_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (options?.dispatchUpdatedEvent !== false) {
    dispatchLeaderboardProfileUpdated(uid);
  }
}

export async function patchLeaderboardProfileFromUserRoot(uid: string, patch: Record<string, unknown>): Promise<void> {
  const ref = leaderboardDoc(uid);
  if (!ref || !uid) return;
  const nextPatch: Record<string, unknown> = {
    uid,
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  };
  if (Object.prototype.hasOwnProperty.call(patch, "username")) {
    nextPatch.username = normalizeString(patch.username, 64);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    nextPatch.displayLabel = normalizeString(patch.displayName, 120) || "User";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatarId")) {
    nextPatch.avatarId = normalizeString(patch.avatarId, 120);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatarCustomSrc")) {
    nextPatch.avatarCustomSrc = normalizeString(patch.avatarCustomSrc, 900_000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "googlePhotoUrl")) {
    nextPatch.googlePhotoUrl = normalizeString(patch.googlePhotoUrl, 2_000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rankThumbnailSrc")) {
    nextPatch.rankThumbnailSrc = normalizeString(patch.rankThumbnailSrc, 900_000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rewardCurrentRankId")) {
    nextPatch.rewardCurrentRankId = normalizeString(patch.rewardCurrentRankId, 120);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rewardTotalXp")) {
    nextPatch.rewardTotalXp = normalizeInt(patch.rewardTotalXp);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "completedTaskCount")) {
    nextPatch.completedTaskCount = normalizeInt(patch.completedTaskCount);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "createdAt")) {
    nextPatch.memberSinceMs = normalizeOptionalTimestampMs(patch.createdAt);
  }
  if (Object.keys(nextPatch).length <= 3) return;
  const cachedIdentity = leaderboardIdentityCache.get(uid);
  if (cachedIdentity) {
    leaderboardIdentityCache.set(uid, {
      expiresAtMs: Date.now() + LEADERBOARD_IDENTITY_CACHE_TTL_MS,
      value: {
        ...cachedIdentity.value,
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "username") ? { username: normalizeString(nextPatch.username, 64) } : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "displayLabel")
          ? { displayLabel: cachedIdentity.value.username || "User" }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "avatarId") ? { avatarId: normalizeString(nextPatch.avatarId, 120) } : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "avatarCustomSrc")
          ? { avatarCustomSrc: normalizeString(nextPatch.avatarCustomSrc, 900_000) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "googlePhotoUrl")
          ? { googlePhotoUrl: normalizeString(nextPatch.googlePhotoUrl, 2_000) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "rankThumbnailSrc")
          ? { rankThumbnailSrc: normalizeString(nextPatch.rankThumbnailSrc, 900_000) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "rewardCurrentRankId")
          ? { rewardCurrentRankId: normalizeString(nextPatch.rewardCurrentRankId, 120) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "memberSinceMs")
          ? { memberSinceMs: normalizeOptionalTimestampMs(nextPatch.memberSinceMs) }
          : {}),
      },
    });
  }
  const existingProfile = await getDoc(ref);
  if (!existingProfile.exists()) return;
  await updateDoc(ref, nextPatch);
  dispatchLeaderboardProfileUpdated(uid);
}

function filterCurrentUid(entries: Array<LeaderboardProfile | null | undefined>, currentUid: string) {
  return visibleLeaderboardProfiles(entries).filter((entry) => entry.uid !== currentUid);
}

function sortWeeklyEntries(entries: LeaderboardProfile[]): LeaderboardProfile[] {
  return entries.slice().sort((left, right) => {
    const weeklyDelta = normalizeInt(right.weeklyXpGain) - normalizeInt(left.weeklyXpGain);
    if (weeklyDelta !== 0) return weeklyDelta;
    const totalDelta = normalizeInt(right.rewardTotalXp) - normalizeInt(left.rewardTotalXp);
    if (totalDelta !== 0) return totalDelta;
    return String(left.username || left.displayLabel || left.uid).localeCompare(String(right.username || right.displayLabel || right.uid));
  });
}

function formatWeeklyRankLabel(rank: number | null): string {
  if (!rank || rank < 1) return "Unranked";
  return `#${rank}`;
}

function sortLeaderboardRows(rows: WeeklyLeaderboardRow[]): WeeklyLeaderboardRow[] {
  return rows.slice().sort((left, right) => {
    const leftRank = left.rank && left.rank > 0 ? left.rank : Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank && right.rank > 0 ? right.rank : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.isPlaceholder !== right.isPlaceholder) return left.isPlaceholder ? 1 : -1;
    return String(left.profile.uid).localeCompare(String(right.profile.uid));
  });
}

function getRankScope(profile: LeaderboardProfile | null | undefined): { id: string } | null {
  if (!profile) return null;
  const rank = getRankForXp(profile.rewardTotalXp);
  return { id: rank.id };
}

function filterProfilesByRankScope(profiles: LeaderboardProfile[], rankScope: { id: string } | null): LeaderboardProfile[] {
  if (!rankScope) return profiles;
  return profiles.filter((profile) => getRankForXp(profile.rewardTotalXp).id === rankScope.id);
}

function sortRankRivals(entries: LeaderboardProfile[]): LeaderboardProfile[] {
  return entries.slice().sort((left, right) => {
    const totalDelta = normalizeInt(right.rewardTotalXp) - normalizeInt(left.rewardTotalXp);
    if (totalDelta !== 0) return totalDelta;
    return String(left.username || left.displayLabel || left.uid).localeCompare(String(right.username || right.displayLabel || right.uid));
  });
}

function getLeaderboardPlayerLabel(profile: LeaderboardProfile): string {
  return String(profile.username || profile.displayLabel || "User").trim() || "User";
}

function createCurrentUserLeaderboardRow(
  profile: LeaderboardProfile,
  options: {
    rank: number | null;
    metric: "totalXp" | "weeklyXp";
    visibleRows: WeeklyLeaderboardRow[];
  }
): WeeklyLeaderboardRow {
  const currentMetric = options.metric === "weeklyXp" ? normalizeInt(profile.weeklyXpGain) : normalizeInt(profile.rewardTotalXp);
  const inferredRank =
    options.visibleRows.filter((row) => {
      if (row.isPlaceholder || row.isCurrentUser) return false;
      const rowMetric = options.metric === "weeklyXp" ? normalizeInt(row.profile.weeklyXpGain) : normalizeInt(row.profile.rewardTotalXp);
      return rowMetric > currentMetric;
    }).length + 1;
  const rank = options.rank && options.rank > 0 ? options.rank : inferredRank;

  return {
    profile,
    rank,
    rankLabel: formatWeeklyRankLabel(rank),
    playerLabel: getLeaderboardPlayerLabel(profile),
    isCurrentUser: true,
    isPinnedCurrentUser: true,
    isPlaceholder: false,
    isDummy: false,
  };
}

export function buildGlobalLeaderboardRows(input: {
  topEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUserEntry = isExcludedLeaderboardProfile(input.currentUserEntry) ? null : input.currentUserEntry;
  const currentUid = String(currentUserEntry?.uid || "").trim();
  const rows = visibleLeaderboardProfiles(input.topEntries || []).slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT).map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: getLeaderboardPlayerLabel(profile),
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  if (!currentUserEntry || rows.some((row) => row.profile.uid === currentUserEntry.uid)) {
    return sortLeaderboardRows(rows);
  }

  const visibleRows = sortLeaderboardRows(rows);
  return [
    ...visibleRows,
    createCurrentUserLeaderboardRow(currentUserEntry, {
      rank: input.currentUserRank,
      metric: "totalXp",
      visibleRows,
    }),
  ];
}

export function buildRivalLeaderboardRows(input: {
  rivalEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRivalRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUserEntry = isExcludedLeaderboardProfile(input.currentUserEntry) ? null : input.currentUserEntry;
  const currentUid = String(currentUserEntry?.uid || "").trim();
  const rankScope = getRankScope(currentUserEntry);
  const scopedRivalEntries = filterProfilesByRankScope(visibleLeaderboardProfiles(input.rivalEntries || []), rankScope);
  const rows = scopedRivalEntries.slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT).map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = isCurrentUser && input.currentUserRivalRank ? input.currentUserRivalRank : index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: getLeaderboardPlayerLabel(profile),
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  const currentUserRivalRank =
    input.currentUserRivalRank && input.currentUserRivalRank > 0 ? input.currentUserRivalRank : rows.length + 1;
  const currentUserIsInRows = currentUserEntry && rows.some((row) => row.profile.uid === currentUserEntry.uid);
  if (currentUserEntry && !currentUserIsInRows && currentUserRivalRank <= WEEKLY_LEADERBOARD_DISPLAY_LIMIT) {
    rows.splice(Math.max(0, currentUserRivalRank - 1), 0, {
      profile: currentUserEntry,
      rank: currentUserRivalRank,
      rankLabel: formatWeeklyRankLabel(currentUserRivalRank),
      playerLabel: getLeaderboardPlayerLabel(currentUserEntry),
      isCurrentUser: true,
      isPlaceholder: false,
      isDummy: false,
    });
    rows.splice(WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
    rows.forEach((row, index) => {
      row.rank = index + 1;
      row.rankLabel = formatWeeklyRankLabel(index + 1);
    });
  }

  if (currentUserEntry && !currentUserIsInRows && currentUserRivalRank > WEEKLY_LEADERBOARD_DISPLAY_LIMIT) {
    const visibleRows = sortLeaderboardRows(rows);
    return [
      ...visibleRows,
      createCurrentUserLeaderboardRow(currentUserEntry, {
        rank: currentUserRivalRank,
        metric: "totalXp",
        visibleRows,
      }),
    ];
  }

  return sortLeaderboardRows(rows);
}

function getRankIndex(rank: RankDefinition): number {
  return RANK_LADDER.findIndex((entry) => entry.id === rank.id);
}

function selectRankRivalProfiles(input: {
  rivalEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile;
}): LeaderboardProfile[] {
  const rankScope = getRankScope(input.currentUserEntry);
  const byUid = new Map<string, LeaderboardProfile>();
  filterProfilesByRankScope(visibleLeaderboardProfiles(input.rivalEntries || []), rankScope).forEach((profile) => {
    byUid.set(profile.uid, profile);
  });
  byUid.set(input.currentUserEntry.uid, input.currentUserEntry);
  return sortRankRivals(Array.from(byUid.values()));
}

export function buildRankRivalLadderViewModel(input: {
  rivalEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRivalRank: number | null;
}): RankRivalLadderViewModel | null {
  const currentUserEntry = isExcludedLeaderboardProfile(input.currentUserEntry) ? null : input.currentUserEntry;
  if (!currentUserEntry) return null;

  const currentRank = getRankForXp(currentUserEntry.rewardTotalXp);
  const currentRankIndex = getRankIndex(currentRank);
  const previousRank = currentRankIndex > 0 ? RANK_LADDER[currentRankIndex - 1] || null : null;
  const nextRank = getNextRank(currentUserEntry.rewardTotalXp);
  const isMaxRank = !nextRank;
  const bandStart = currentRank.minXp;
  const bandEnd = nextRank?.minXp ?? currentRank.minXp;
  const bandWidth = Math.max(1, bandEnd - bandStart);
  const selectedProfiles = selectRankRivalProfiles({
    rivalEntries: input.rivalEntries,
    currentUserEntry,
  });
  const sortedAllProfiles = sortRankRivals(
    filterProfilesByRankScope(visibleLeaderboardProfiles([...input.rivalEntries, currentUserEntry]), { id: currentRank.id })
  );
  const currentUid = String(currentUserEntry.uid || "").trim();
  const closestRivalUid = sortedAllProfiles.find((profile) => profile.uid !== currentUid)?.uid || "";
  const rankByUid = new Map<string, number>();
  sortedAllProfiles.forEach((profile, index) => {
    if (!rankByUid.has(profile.uid)) rankByUid.set(profile.uid, index + 1);
  });
  if (input.currentUserRivalRank && input.currentUserRivalRank > 0) {
    rankByUid.set(currentUserEntry.uid, input.currentUserRivalRank);
  }

  const rows = selectedProfiles.map((profile, index): RankRivalLadderRow => {
    const isCurrentUser = profile.uid === currentUid;
    const rank = rankByUid.get(profile.uid) || index + 1;
    const totalXp = normalizeInt(profile.rewardTotalXp);
    const remainingXp = nextRank ? Math.max(0, nextRank.minXp - totalXp) : null;
    const progressPct = nextRank
      ? Math.max(0, Math.min(100, ((totalXp - bandStart) / bandWidth) * 100))
      : 100;
    const status: RankRivalStatus = isCurrentUser ? "current" : profile.uid === closestRivalUid ? "closest" : "rival";
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: getLeaderboardPlayerLabel(profile),
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
      status,
      statusLabel: status === "closest" ? "Closest Rival" : status === "current" ? "Current User" : "Rival",
      remainingXp,
      remainingLabel: remainingXp == null ? "-" : `${remainingXp.toLocaleString()} XP`,
      progressPct,
      progressLabel: `${Math.round(progressPct)}%`,
    };
  });

  return {
    previousRank,
    currentRank,
    nextRank,
    targetLabel: nextRank ? nextRank.label : "Max Rank",
    targetXp: nextRank ? nextRank.minXp : null,
    subtitle: nextRank
      ? `Competing to reach: ${nextRank.label} (${nextRank.minXp.toLocaleString()} XP)`
      : `${currentRank.label} rank standing`,
    rows,
    isMaxRank,
  };
}

export function buildWeeklyLeaderboardRows(input: {
  weeklyEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserWeeklyRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUserEntry = isExcludedLeaderboardProfile(input.currentUserEntry) ? null : input.currentUserEntry;
  const currentUid = String(currentUserEntry?.uid || "").trim();
  const sortedEntries = sortWeeklyEntries(visibleLeaderboardProfiles(input.weeklyEntries || [])).slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
  const rows = sortedEntries.map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: getLeaderboardPlayerLabel(profile),
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  if (!currentUserEntry || rows.some((row) => row.profile.uid === currentUserEntry.uid)) {
    return sortLeaderboardRows(rows);
  }

  const visibleRows = sortLeaderboardRows(rows);
  return [
    ...visibleRows,
    createCurrentUserLeaderboardRow(currentUserEntry, {
      rank: input.currentUserWeeklyRank,
      metric: "weeklyXp",
      visibleRows,
    }),
  ];
}

function applyOwnIdentity(profile: LeaderboardProfile, currentUid: string, identity: LeaderboardIdentityFields | null): LeaderboardProfile {
  if (!identity || profile.uid !== currentUid) return profile;
  return {
    ...profile,
    username: identity.username,
    displayLabel: identity.displayLabel,
    avatarId: identity.avatarId,
    avatarCustomSrc: identity.avatarCustomSrc,
    googlePhotoUrl: identity.googlePhotoUrl,
    rankThumbnailSrc: identity.rankThumbnailSrc,
    rewardCurrentRankId: identity.rewardCurrentRankId || profile.rewardCurrentRankId,
    memberSinceMs: identity.memberSinceMs || profile.memberSinceMs,
  };
}

export async function loadLeaderboardScreenData(currentUid: string): Promise<LeaderboardScreenData> {
  const db = dbOrNull();
  if (!db || !currentUid) {
    return {
      topEntries: [],
      risingEntries: [],
      rivalEntries: [],
      weeklyEntries: [],
      currentUserEntry: null,
      currentUserRank: null,
      currentUserGapToNextXp: null,
      currentUserRivalRank: null,
      currentUserWeeklyEntry: null,
      currentUserWeeklyRank: null,
    };
  }

  const ownIdentity = await loadOwnLeaderboardIdentity(currentUid).catch(() => null);
  const profiles = collection(db, "leaderboardProfiles");
  const leaderboardQueryLimit = WEEKLY_LEADERBOARD_DISPLAY_LIMIT + EXCLUDED_LEADERBOARD_USERNAMES.size;
  const risingQueryLimit = 3 + EXCLUDED_LEADERBOARD_USERNAMES.size;
  const [topSnap, risingSnap, weeklySnap, currentUserSnap] = await Promise.all([
    getDocs(query(profiles, orderBy("rewardTotalXp", "desc"), limit(leaderboardQueryLimit))),
    getDocs(query(profiles, orderBy("weeklyXpGain", "desc"), limit(risingQueryLimit))),
    getDocs(query(profiles, orderBy("weeklyXpGain", "desc"), limit(leaderboardQueryLimit))),
    getDoc(doc(db, "leaderboardProfiles", currentUid)),
  ]);

  const topEntries = visibleLeaderboardProfiles(topSnap.docs
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
  const weeklyEntries = visibleLeaderboardProfiles(weeklySnap.docs
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
  const currentUserEntry = currentUserSnap.exists()
    ? normalizeLeaderboardProfileRecord(currentUserSnap.id, currentUserSnap.data() as Record<string, unknown>)
    : null;
  const currentUserEntryWithIdentity = currentUserEntry ? applyOwnIdentity(currentUserEntry, currentUid, ownIdentity) : null;

  if (!currentUserEntryWithIdentity || isExcludedLeaderboardProfile(currentUserEntryWithIdentity)) {
    return {
      topEntries,
      risingEntries: filterCurrentUid(
        risingSnap.docs
          .map((row) => asLeaderboardProfile(row))
          .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)),
        currentUid
      ).slice(0, 3),
      rivalEntries: [],
      weeklyEntries,
      currentUserEntry: null,
      currentUserRank: null,
      currentUserGapToNextXp: null,
      currentUserRivalRank: null,
      currentUserWeeklyEntry: null,
      currentUserWeeklyRank: null,
    };
  }

  const currentUserRank = getRankForXp(currentUserEntryWithIdentity.rewardTotalXp);
  const nextRank = getNextRank(currentUserEntryWithIdentity.rewardTotalXp);
  const rankBandStartXp = currentUserRank.minXp;
  const [higherXpResult, aboveResult, rivalResult, higherRivalResult, higherWeeklyResult] = await Promise.allSettled([
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp))),
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp), orderBy("rewardTotalXp", "asc"), limit(1))),
    nextRank
      ? getDocs(
          query(
            profiles,
            where("rewardTotalXp", ">=", rankBandStartXp),
            where("rewardTotalXp", "<", nextRank.minXp),
            orderBy("rewardTotalXp", "desc"),
            limit(RANK_RIVALS_QUERY_LIMIT)
          )
        )
      : getDocs(
          query(
            profiles,
            where("rewardTotalXp", ">=", rankBandStartXp),
            orderBy("rewardTotalXp", "desc"),
            limit(RANK_RIVALS_QUERY_LIMIT)
          )
        ),
    nextRank
      ? getDocs(
          query(
            profiles,
            where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp),
            where("rewardTotalXp", "<", nextRank.minXp)
          )
        )
      : getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp))),
    getDocs(query(profiles, where("weeklyXpGain", ">", currentUserEntryWithIdentity.weeklyXpGain))),
  ]);
  const higherXpSize = sizeFromSettledQuery(higherXpResult);
  const higherRivalSize = sizeFromSettledQuery(higherRivalResult);
  const higherWeeklySize = sizeFromSettledQuery(higherWeeklyResult);

  const risingEntries = filterCurrentUid(
    risingSnap.docs
      .map((row) => asLeaderboardProfile(row))
      .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)),
    currentUid
  ).slice(0, 3);
  const higherXpEntries = visibleLeaderboardProfiles(docsFromSettledQuery(higherXpResult)
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .filter((row) => row.uid !== currentUid);
  const aboveEntries = visibleLeaderboardProfiles(docsFromSettledQuery(aboveResult)
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .filter((row) => row.uid !== currentUid);
  const rivalEntries = visibleLeaderboardProfiles(docsFromSettledQuery(rivalResult)
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .slice(0, RANK_RIVALS_QUERY_LIMIT);
  const higherRivalEntries = visibleLeaderboardProfiles(docsFromSettledQuery(higherRivalResult)
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .filter((row) => row.uid !== currentUid);
  const higherWeeklyEntries = visibleLeaderboardProfiles(docsFromSettledQuery(higherWeeklyResult)
    .map((row) => asLeaderboardProfile(row))
    .map((row) => (row ? applyOwnIdentity(row, currentUid, ownIdentity) : null)))
    .filter((row) => row.uid !== currentUid);
  const currentUserGapToNextXp =
    aboveEntries.length > 0 ? Math.max(0, aboveEntries[0]!.rewardTotalXp - currentUserEntryWithIdentity.rewardTotalXp) : null;

  return {
    topEntries,
    risingEntries,
    rivalEntries,
    weeklyEntries,
    currentUserEntry: currentUserEntryWithIdentity,
    currentUserRank: higherXpSize == null ? null : higherXpEntries.length + 1,
    currentUserGapToNextXp,
    currentUserRivalRank: higherRivalSize == null ? null : higherRivalEntries.length + 1,
    currentUserWeeklyEntry: currentUserEntryWithIdentity,
    currentUserWeeklyRank: higherWeeklySize == null ? null : higherWeeklyEntries.length + 1,
  };
}

export function getLeaderboardAvatarSrc(profile: LeaderboardProfile | null | undefined): string {
  if (!profile) return "";
  const avatarId = String(profile.avatarId || "").trim();
  if (avatarId) {
    const customSrc = String(profile.avatarCustomSrc || "").trim();
    if (isCustomAvatarIdForUid(profile.uid, avatarId) && customSrc) {
      return normalizeBundledAvatarWebpSrc(customSrc);
    }
    if (/^google\/profile-photo:/i.test(avatarId)) {
      return String(profile.googlePhotoUrl || "").trim();
    }
    const builtInSrc = resolveBuiltInAvatarSrc(avatarId);
    if (builtInSrc) return builtInSrc;
    if (/^(?:data:|blob:|https?:\/\/|file:)/i.test(avatarId) || /^\/(?:tasklaunch\/)?avatars\//i.test(avatarId)) {
      return normalizeBundledAvatarWebpSrc(avatarId);
    }
  }
  const customSrc = String(profile.avatarCustomSrc || "").trim();
  if (customSrc) return normalizeBundledAvatarWebpSrc(customSrc);
  const googlePhotoUrl = String(profile.googlePhotoUrl || "").trim();
  if (googlePhotoUrl) return googlePhotoUrl;
  return "";
}

export function getLeaderboardInitials(labelRaw: string): string {
  const label = String(labelRaw || "").trim();
  if (!label) return "?";
  const parts = label.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return label.charAt(0).toUpperCase() || "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function getLeaderboardResolvedRank(profile: Pick<LeaderboardProfile, "rewardTotalXp">) {
  return getRankForXp(profile.rewardTotalXp);
}
