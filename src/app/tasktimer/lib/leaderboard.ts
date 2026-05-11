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
  weeklyXpGain: number;
  memberSinceMs: number | null;
  schemaVersion: 1;
};

type LeaderboardMetricsSnapshot = {
  rewardCurrentRankId: string | null;
  rewardTotalXp: number;
  streakDays: number;
  totalFocusMs: number;
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
};

type LeaderboardIdentityFields = Pick<
  LeaderboardProfile,
  "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl" | "rankThumbnailSrc" | "rewardCurrentRankId" | "memberSinceMs"
>;

const LEADERBOARD_SCHEMA_VERSION = 1;
const LEADERBOARD_IDENTITY_CACHE_TTL_MS = 60_000;
const WEEKLY_LEADERBOARD_DISPLAY_LIMIT = 10;
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

  return {
    rewardCurrentRankId: normalizeString(rewards.currentRankId, 120),
    rewardTotalXp: normalizeInt(rewards.totalXp),
    streakDays: getRewardStreakLength(projectedHistory),
    totalFocusMs,
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

function formatWeeklyRankLabel(rank: number | null, profile: LeaderboardProfile): string {
  if (!rank || rank < 1 || normalizeInt(profile.weeklyXpGain) <= 0) return "Unranked";
  return `#${rank}`;
}

function buildWeeklyPlaceholderProfile(rank: number): LeaderboardProfile {
  const safeRank = Math.max(1, Math.floor(rank || 1));
  const weeklyXpGain = Math.max(24, 320 - (safeRank - 1) * 26);
  const rewardTotalXp = Math.max(weeklyXpGain, 4_800 - (safeRank - 1) * 320);
  const totalFocusMs = Math.max(30 * 60 * 1000, (14 - safeRank) * 42 * 60 * 1000);
  const streakDays = Math.max(1, 12 - safeRank);
  const label = `Focus Pilot ${safeRank}`;
  return {
    uid: `weekly-placeholder-${safeRank}`,
    username: label,
    displayLabel: label,
    avatarId: null,
    avatarCustomSrc: null,
    googlePhotoUrl: null,
    rankThumbnailSrc: null,
    rewardCurrentRankId: getRankForXp(rewardTotalXp).id,
    rewardTotalXp,
    streakDays,
    totalFocusMs,
    weeklyXpGain,
    memberSinceMs: null,
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
  };
}

export function isWeeklyLeaderboardPlaceholderProfile(profile: LeaderboardProfile | null | undefined): boolean {
  return /^weekly-placeholder-\d+$/i.test(String(profile?.uid || "").trim());
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
      rankLabel: formatWeeklyRankLabel(rank, profile),
      playerLabel: isCurrentUser ? "You" : String(profile.username || profile.displayLabel || "User").trim() || "User",
      isCurrentUser,
      isPlaceholder: false,
    };
  });

  while (rows.length < WEEKLY_LEADERBOARD_DISPLAY_LIMIT) {
    const rank = rows.length + 1;
    const profile = buildWeeklyPlaceholderProfile(rank);
    rows.push({
      profile,
      rank,
      rankLabel: formatWeeklyRankLabel(rank, profile),
      playerLabel: String(profile.username || profile.displayLabel || "User").trim() || "User",
      isCurrentUser: false,
      isPlaceholder: true,
    });
  }

  if (!input.currentUserEntry || rows.some((row) => row.profile.uid === input.currentUserEntry!.uid)) return rows;

  return [
    {
      profile: input.currentUserEntry,
      rank: input.currentUserWeeklyRank,
      rankLabel: formatWeeklyRankLabel(input.currentUserWeeklyRank, input.currentUserEntry),
      playerLabel: "You",
      isCurrentUser: true,
      isPlaceholder: false,
    },
    ...rows,
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
