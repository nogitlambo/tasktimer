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
import { AVATAR_CATALOG } from "./avatarCatalog";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import { getRankForXp, getRewardStreakLength, normalizeRewardProgress, type RewardProgressV1 } from "./rewards";
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
  isPlaceholder: boolean;
  isDummy: boolean;
};

type LeaderboardIdentityFields = Pick<
  LeaderboardProfile,
  "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl" | "rankThumbnailSrc" | "rewardCurrentRankId" | "memberSinceMs"
>;

const LEADERBOARD_SCHEMA_VERSION = 1;
const LEADERBOARD_IDENTITY_CACHE_TTL_MS = 60_000;
const WEEKLY_LEADERBOARD_DISPLAY_LIMIT = 10;
const LEADERBOARD_TABLE_START_RANK = 4;
const LEADERBOARD_DUMMY_TOTAL_XP_FALLBACK_CAP = 900;
const LEADERBOARD_DUMMY_WEEKLY_XP_FALLBACK_CAP = 180;
const LEADERBOARD_DUMMY_ALIASES = [
  "NovaPilot",
  "CircuitFox",
  "PixelForge",
  "OrbitMason",
  "SignalVale",
  "ByteHarbor",
  "ZenithQuill",
  "AtlasBloom",
  "EchoVector",
  "NorthPulse",
  "SolarMint",
  "TempoDrift",
];
const LEADERBOARD_DUMMY_AVATAR_IDS = [
  "bottts/bottts-1777441132037",
  "bottts/bottts-1777442377436",
  "bottts/bottts-1777442388888",
  "bottts/bottts-1777442393598",
  "bottts/bottts-1777442397847",
  "bottts/bottts-1777442402287",
  "toons/toon-01-cap-glasses",
  "toons/toon-02-brown-hair",
  "toons/toon-03-blonde-hair",
  "toons/toon-07-green-shirt",
];
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

function sumWeeklyXpGain(rewards: RewardProgressV1, weekStart: DashboardWeekStart, nowValue: number): number {
  const weekStartMs = startOfCurrentWeekMs(nowValue, weekStart);
  return normalizeRewardProgress(rewards).awardLedger.reduce((sum, entry) => {
    const ts = normalizeInt(entry?.ts);
    const xp = normalizeInt(entry?.xp);
    if (!ts || ts < weekStartMs || ts > nowValue || xp <= 0) return sum;
    return sum + xp;
  }, 0);
}

function sumWeeklyFocusMs(projectedHistory: HistoryByTaskId, weekStart: DashboardWeekStart, nowValue: number): number {
  const weekStartMs = startOfCurrentWeekMs(nowValue, weekStart);
  return Object.values(projectedHistory).reduce((sum, entries) => {
    if (!Array.isArray(entries)) return sum;
    return (
      sum +
      entries.reduce((entrySum, entry) => {
        const ts = normalizeInt(entry?.ts);
        if (!ts || ts < weekStartMs || ts > nowValue) return entrySum;
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
  const weekStarting = input.weekStarting || "mon";
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
  const weeklyFocusMs = sumWeeklyFocusMs(projectedHistory, weekStarting, nowValue);

  return {
    rewardCurrentRankId: normalizeString(rewards.currentRankId, 120),
    rewardTotalXp: normalizeInt(rewards.totalXp),
    streakDays: getRewardStreakLength(projectedHistory),
    totalFocusMs,
    weeklyFocusMs,
    weeklyXpGain: sumWeeklyXpGain(rewards, weekStarting, nowValue),
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

function filterCurrentUid(entries: LeaderboardProfile[], currentUid: string) {
  return entries.filter((entry) => entry.uid !== currentUid);
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

function createPlaceholderLeaderboardRow(rank: number): WeeklyLeaderboardRow {
  return {
    profile: {
      uid: `leaderboard-placeholder-${rank}`,
      username: "",
      displayLabel: "",
      rewardTotalXp: 0,
      rewardCurrentRankId: "unranked",
      weeklyXpGain: 0,
      streakDays: 0,
      totalFocusMs: 0,
      weeklyFocusMs: 0,
      memberSinceMs: null,
      schemaVersion: LEADERBOARD_SCHEMA_VERSION,
      avatarId: null,
      avatarCustomSrc: null,
      googlePhotoUrl: null,
      rankThumbnailSrc: null,
    },
    rank,
    rankLabel: formatWeeklyRankLabel(rank),
    playerLabel: "",
    isCurrentUser: false,
    isPlaceholder: true,
    isDummy: false,
  };
}

type LeaderboardDummyMetric = "totalXp" | "weeklyXp";

function hashLeaderboardSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dummySeedForRows(scope: string, rows: WeeklyLeaderboardRow[]): string {
  const rowSeed = rows
    .filter((row) => !row.isPlaceholder && !row.isDummy)
    .map((row) => `${row.rank || "x"}:${row.profile.uid}:${row.profile.rewardTotalXp}:${row.profile.weeklyXpGain}`)
    .join("|");
  return `${scope}:${rowSeed}`;
}

function leaderboardMetricValue(profile: LeaderboardProfile, metric: LeaderboardDummyMetric): number {
  return metric === "weeklyXp" ? normalizeInt(profile.weeklyXpGain) : normalizeInt(profile.rewardTotalXp);
}

function leaderboardDummyFallbackCap(metric: LeaderboardDummyMetric): number {
  return metric === "weeklyXp" ? LEADERBOARD_DUMMY_WEEKLY_XP_FALLBACK_CAP : LEADERBOARD_DUMMY_TOTAL_XP_FALLBACK_CAP;
}

function resolveDummyXpCap(rows: WeeklyLeaderboardRow[], metric: LeaderboardDummyMetric): number {
  const podiumValues = rows
    .filter((row) => row.rank && row.rank >= 1 && row.rank < LEADERBOARD_TABLE_START_RANK && !row.isPlaceholder && !row.isDummy)
    .map((row) => leaderboardMetricValue(row.profile, metric));
  if (!podiumValues.length) return leaderboardDummyFallbackCap(metric);
  return Math.min(...podiumValues);
}

function createDummyLeaderboardRow(rank: number, options: { metric: LeaderboardDummyMetric; seed: string; cap: number }): WeeklyLeaderboardRow {
  const maxXp = Math.max(0, normalizeInt(options.cap) - 1);
  const seed = hashLeaderboardSeed(`${options.seed}:${rank}`);
  const alias = LEADERBOARD_DUMMY_ALIASES[seed % LEADERBOARD_DUMMY_ALIASES.length] || `User ${rank}`;
  const avatarId = LEADERBOARD_DUMMY_AVATAR_IDS[(seed >>> 8) % LEADERBOARD_DUMMY_AVATAR_IDS.length] || null;
  const band = Math.max(1, Math.floor((maxXp + 1) / (WEEKLY_LEADERBOARD_DISPLAY_LIMIT - LEADERBOARD_TABLE_START_RANK + 2)));
  const rankOffset = rank - LEADERBOARD_TABLE_START_RANK;
  const jitter = band > 1 ? (seed >>> 16) % band : 0;
  const xp = Math.max(0, maxXp - rankOffset * band - jitter);
  const profile: LeaderboardProfile = {
    uid: `leaderboard-dummy-${options.metric}-${rank}-${seed.toString(36)}`,
    username: alias,
    displayLabel: alias,
    rewardTotalXp: options.metric === "weeklyXp" ? Math.max(xp, Math.floor(xp * 4)) : xp,
    rewardCurrentRankId: getRankForXp(options.metric === "weeklyXp" ? Math.max(xp, Math.floor(xp * 4)) : xp).id,
    weeklyXpGain: options.metric === "weeklyXp" ? xp : Math.max(0, Math.floor(xp / 8)),
    streakDays: 0,
    totalFocusMs: 0,
    weeklyFocusMs: 0,
    memberSinceMs: null,
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
    avatarId,
    avatarCustomSrc: null,
    googlePhotoUrl: null,
    rankThumbnailSrc: null,
  };

  return {
    profile,
    rank,
    rankLabel: formatWeeklyRankLabel(rank),
    playerLabel: alias,
    isCurrentUser: false,
    isPlaceholder: false,
    isDummy: true,
  };
}

function padLeaderboardRows(
  rows: WeeklyLeaderboardRow[],
  options: { dummyMetric: LeaderboardDummyMetric; dummySeedScope: string }
): WeeklyLeaderboardRow[] {
  const visibleRanks = new Set(
    rows
      .map((row) => row.rank)
      .filter((rank): rank is number => !!rank && rank >= 1 && rank <= WEEKLY_LEADERBOARD_DISPLAY_LIMIT)
  );
  const placeholders: WeeklyLeaderboardRow[] = [];
  const dummyRows: WeeklyLeaderboardRow[] = [];
  const dummyCap = resolveDummyXpCap(rows, options.dummyMetric);
  const dummySeed = `${dummySeedForRows(options.dummySeedScope, rows)}:cap=${dummyCap}`;

  for (let rank = 1; rank <= WEEKLY_LEADERBOARD_DISPLAY_LIMIT; rank += 1) {
    if (visibleRanks.has(rank)) continue;
    if (rank >= LEADERBOARD_TABLE_START_RANK) {
      dummyRows.push(createDummyLeaderboardRow(rank, { metric: options.dummyMetric, seed: `${dummySeed}:rank=${rank}:cap=${dummyCap}`, cap: dummyCap }));
    } else {
      placeholders.push(createPlaceholderLeaderboardRow(rank));
    }
  }

  return [...rows, ...placeholders, ...dummyRows].sort((left, right) => {
    const leftRank = left.rank && left.rank > 0 ? left.rank : Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank && right.rank > 0 ? right.rank : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.isPlaceholder !== right.isPlaceholder) return left.isPlaceholder ? 1 : -1;
    return String(left.profile.uid).localeCompare(String(right.profile.uid));
  });
}

export function buildGlobalLeaderboardRows(input: {
  topEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUid = String(input.currentUserEntry?.uid || "").trim();
  const rows = (input.topEntries || []).slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT).map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: isCurrentUser ? "You" : String(profile.username || profile.displayLabel || "User").trim() || "User",
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  if (!input.currentUserEntry || rows.some((row) => row.profile.uid === input.currentUserEntry!.uid)) {
    return padLeaderboardRows(rows, { dummyMetric: "totalXp", dummySeedScope: "global" });
  }

  return padLeaderboardRows([
    {
      profile: input.currentUserEntry,
      rank: input.currentUserRank,
      rankLabel: formatWeeklyRankLabel(input.currentUserRank),
      playerLabel: "You",
      isCurrentUser: true,
      isPlaceholder: false,
      isDummy: false,
    },
    ...rows,
  ], { dummyMetric: "totalXp", dummySeedScope: "global" });
}

export function buildRivalLeaderboardRows(input: {
  rivalEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserRivalRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUid = String(input.currentUserEntry?.uid || "").trim();
  const rows = (input.rivalEntries || []).slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT).map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = isCurrentUser && input.currentUserRivalRank ? input.currentUserRivalRank : index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: isCurrentUser ? "You" : String(profile.username || profile.displayLabel || "User").trim() || "User",
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  if (input.currentUserEntry && !rows.some((row) => row.profile.uid === input.currentUserEntry!.uid)) {
    const inferredRank =
      input.currentUserRivalRank && input.currentUserRivalRank > 0
        ? input.currentUserRivalRank
        : Math.min(rows.length + 1, WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
    const currentUserRow: WeeklyLeaderboardRow = {
      profile: input.currentUserEntry,
      rank: inferredRank,
      rankLabel: formatWeeklyRankLabel(inferredRank),
      playerLabel: "You",
      isCurrentUser: true,
      isPlaceholder: false,
      isDummy: false,
    };
    if (inferredRank > WEEKLY_LEADERBOARD_DISPLAY_LIMIT) {
      rows.unshift(currentUserRow);
    } else {
      rows.splice(Math.max(0, inferredRank - 1), 0, currentUserRow);
    }
  }

  return padLeaderboardRows(rows, { dummyMetric: "totalXp", dummySeedScope: "rivals" });
}

export function buildWeeklyLeaderboardRows(input: {
  weeklyEntries: LeaderboardProfile[];
  currentUserEntry: LeaderboardProfile | null;
  currentUserWeeklyRank: number | null;
}): WeeklyLeaderboardRow[] {
  const currentUid = String(input.currentUserEntry?.uid || "").trim();
  const sortedEntries = sortWeeklyEntries(input.weeklyEntries || []).slice(0, WEEKLY_LEADERBOARD_DISPLAY_LIMIT);
  const rows = sortedEntries.map((profile, index): WeeklyLeaderboardRow => {
    const isCurrentUser = !!currentUid && profile.uid === currentUid;
    const rank = index + 1;
    return {
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank),
      playerLabel: isCurrentUser ? "You" : String(profile.username || profile.displayLabel || "User").trim() || "User",
      isCurrentUser,
      isPlaceholder: false,
      isDummy: false,
    };
  });

  if (!input.currentUserEntry || rows.some((row) => row.profile.uid === input.currentUserEntry!.uid)) {
    return padLeaderboardRows(rows, { dummyMetric: "weeklyXp", dummySeedScope: "weekly" });
  }

  return padLeaderboardRows([
    {
      profile: input.currentUserEntry,
      rank: input.currentUserWeeklyRank,
      rankLabel: formatWeeklyRankLabel(input.currentUserWeeklyRank),
      playerLabel: "You",
      isCurrentUser: true,
      isPlaceholder: false,
      isDummy: false,
    },
    ...rows,
  ], { dummyMetric: "weeklyXp", dummySeedScope: "weekly" });
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
  const [topSnap, risingSnap, weeklySnap, currentUserSnap] = await Promise.all([
    getDocs(query(profiles, orderBy("rewardTotalXp", "desc"), limit(10))),
    getDocs(query(profiles, orderBy("weeklyXpGain", "desc"), limit(3))),
    getDocs(query(profiles, orderBy("weeklyXpGain", "desc"), limit(10))),
    getDoc(doc(db, "leaderboardProfiles", currentUid)),
  ]);

  const topEntries = topSnap.docs
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .map((row) => applyOwnIdentity(row, currentUid, ownIdentity));
  const weeklyEntries = weeklySnap.docs
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .map((row) => applyOwnIdentity(row, currentUid, ownIdentity));
  const currentUserEntry = currentUserSnap.exists()
    ? normalizeLeaderboardProfileRecord(currentUserSnap.id, currentUserSnap.data() as Record<string, unknown>)
    : null;
  const currentUserEntryWithIdentity = currentUserEntry ? applyOwnIdentity(currentUserEntry, currentUid, ownIdentity) : null;

  if (!currentUserEntryWithIdentity) {
    return {
      topEntries,
      risingEntries: filterCurrentUid(
        risingSnap.docs
          .map((row) => asLeaderboardProfile(row))
          .filter((row): row is LeaderboardProfile => !!row)
          .map((row) => applyOwnIdentity(row, currentUid, ownIdentity)),
        currentUid
      ),
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

  const currentUserRankId = currentUserEntryWithIdentity.rewardCurrentRankId || getRankForXp(currentUserEntryWithIdentity.rewardTotalXp).id;
  const [higherXpResult, aboveResult, rivalResult, higherRivalResult, higherWeeklyResult] = await Promise.allSettled([
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp))),
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp), orderBy("rewardTotalXp", "asc"), limit(1))),
    getDocs(query(profiles, where("rewardCurrentRankId", "==", currentUserRankId), orderBy("rewardTotalXp", "desc"), limit(10))),
    getDocs(query(profiles, where("rewardCurrentRankId", "==", currentUserRankId), where("rewardTotalXp", ">", currentUserEntryWithIdentity.rewardTotalXp))),
    getDocs(query(profiles, where("weeklyXpGain", ">", currentUserEntryWithIdentity.weeklyXpGain))),
  ]);
  const higherXpSize = sizeFromSettledQuery(higherXpResult);
  const higherRivalSize = sizeFromSettledQuery(higherRivalResult);
  const higherWeeklySize = sizeFromSettledQuery(higherWeeklyResult);

  const risingEntries = filterCurrentUid(
    risingSnap.docs
      .map((row) => asLeaderboardProfile(row))
      .filter((row): row is LeaderboardProfile => !!row)
      .map((row) => applyOwnIdentity(row, currentUid, ownIdentity)),
    currentUid
  );
  const aboveEntries = docsFromSettledQuery(aboveResult)
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .map((row) => applyOwnIdentity(row, currentUid, ownIdentity))
    .filter((row) => row.uid !== currentUid);
  const rivalEntries = docsFromSettledQuery(rivalResult)
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .map((row) => applyOwnIdentity(row, currentUid, ownIdentity));
  const currentUserGapToNextXp =
    aboveEntries.length > 0 ? Math.max(0, aboveEntries[0]!.rewardTotalXp - currentUserEntryWithIdentity.rewardTotalXp) : null;

  return {
    topEntries,
    risingEntries,
    rivalEntries,
    weeklyEntries,
    currentUserEntry: currentUserEntryWithIdentity,
    currentUserRank: higherXpSize == null ? null : higherXpSize + 1,
    currentUserGapToNextXp,
    currentUserRivalRank: higherRivalSize == null ? null : higherRivalSize + 1,
    currentUserWeeklyEntry: currentUserEntryWithIdentity,
    currentUserWeeklyRank: higherWeeklySize == null ? null : higherWeeklySize + 1,
  };
}

export function getLeaderboardAvatarSrc(profile: LeaderboardProfile | null | undefined): string {
  if (!profile) return "";
  const customSrc = String(profile.avatarCustomSrc || "").trim();
  if (customSrc) return customSrc;
  const avatarId = String(profile.avatarId || "").trim();
  if (avatarId) {
    if (/^google\/profile-photo:/i.test(avatarId)) {
      return String(profile.googlePhotoUrl || "").trim();
    }
    const builtInSrc = resolveBuiltInAvatarSrc(avatarId);
    if (builtInSrc) return builtInSrc;
    if (/^(?:data:|blob:|https?:\/\/|file:)/i.test(avatarId) || /^\/(?:tasklaunch\/)?avatars\//i.test(avatarId)) return avatarId;
  }
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
