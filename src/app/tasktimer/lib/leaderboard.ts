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
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { AVATAR_CATALOG } from "./avatarCatalog";
import { startOfCurrentWeekMs, type DashboardWeekStart } from "./historyChart";
import { getRewardStreakLength, normalizeRewardProgress, type RewardProgressV1 } from "./rewards";
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
  currentUserEntry: LeaderboardProfile | null;
  currentUserRank: number | null;
  currentUserGapToNextXp: number | null;
};

type LeaderboardIdentityFields = Pick<
  LeaderboardProfile,
  "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl" | "rankThumbnailSrc" | "rewardCurrentRankId"
>;

const LEADERBOARD_SCHEMA_VERSION = 1;
const LEADERBOARD_IDENTITY_CACHE_TTL_MS = 60_000;
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

function normalizeLeaderboardProfileRecord(id: string, raw: Record<string, unknown> | null | undefined): LeaderboardProfile | null {
  if (!raw) return null;
  const uid = String(raw.uid || id || "").trim();
  if (!uid) return null;
  const username = normalizeString(raw.username, 64);
  const displayLabel = normalizeString(raw.displayLabel, 80) || username || "User";
  return {
    uid,
    username,
    displayLabel,
    avatarId: normalizeString(raw.avatarId, 120),
    avatarCustomSrc: normalizeString(raw.avatarCustomSrc, 900_000),
    googlePhotoUrl: normalizeString(raw.googlePhotoUrl, 2_000),
    rankThumbnailSrc: normalizeString(raw.rankThumbnailSrc, 900_000),
    rewardCurrentRankId: normalizeString(raw.rewardCurrentRankId, 120),
    rewardTotalXp: normalizeInt(raw.rewardTotalXp),
    streakDays: normalizeInt(raw.streakDays),
    totalFocusMs: normalizeInt(raw.totalFocusMs),
    weeklyXpGain: normalizeInt(raw.weeklyXpGain),
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
  };
}

function asLeaderboardProfile(docSnap: QueryDocumentSnapshot | null): LeaderboardProfile | null {
  if (!docSnap) return null;
  return normalizeLeaderboardProfileRecord(docSnap.id, docSnap.data() as Record<string, unknown>);
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

async function loadOwnLeaderboardIdentity(uid: string): Promise<LeaderboardIdentityFields> {
  const cached = leaderboardIdentityCache.get(uid);
  const nowValue = Date.now();
  if (cached && cached.expiresAtMs > nowValue) return cached.value;

  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const fallbackDisplayName = normalizeString(currentUser?.displayName, 80);
  const db = dbOrNull();
  let username: string | null = null;
  let displayLabel: string | null = null;
  let avatarId: string | null = null;
  let avatarCustomSrc: string | null = null;
  let googlePhotoUrl: string | null = normalizeString(currentUser?.photoURL, 2_000);
  let rankThumbnailSrc: string | null = null;
  let rewardCurrentRankId: string | null = null;

  if (db && uid) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        username = normalizeString(snap.get("username"), 64);
        displayLabel = normalizeString(snap.get("displayName"), 80);
        avatarId = normalizeString(snap.get("avatarId"), 120);
        avatarCustomSrc = normalizeString(snap.get("avatarCustomSrc"), 900_000);
        googlePhotoUrl = normalizeString(snap.get("googlePhotoUrl"), 2_000) || googlePhotoUrl;
        rankThumbnailSrc = normalizeString(snap.get("rankThumbnailSrc"), 900_000);
        rewardCurrentRankId = normalizeString(snap.get("rewardCurrentRankId"), 120);
      }
    } catch {
      // Fall back to auth/local identity.
    }
  }

  const resolved: LeaderboardIdentityFields = {
    username,
    displayLabel: username || displayLabel || fallbackDisplayName || "User",
    avatarId,
    avatarCustomSrc,
    googlePhotoUrl,
    rankThumbnailSrc,
    rewardCurrentRankId,
  };

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

export async function saveLeaderboardProfile(uid: string, metrics: LeaderboardMetricsSnapshot): Promise<void> {
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
      schemaVersion: LEADERBOARD_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  dispatchLeaderboardProfileUpdated(uid);
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
    nextPatch.displayLabel = normalizeString(patch.displayName, 80);
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
  if (Object.keys(nextPatch).length <= 3) return;
  const cachedIdentity = leaderboardIdentityCache.get(uid);
  if (cachedIdentity) {
    leaderboardIdentityCache.set(uid, {
      expiresAtMs: Date.now() + LEADERBOARD_IDENTITY_CACHE_TTL_MS,
      value: {
        ...cachedIdentity.value,
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "username") ? { username: normalizeString(nextPatch.username, 64) } : {}),
        ...(Object.prototype.hasOwnProperty.call(nextPatch, "displayLabel")
          ? { displayLabel: normalizeString(nextPatch.displayLabel, 80) || cachedIdentity.value.displayLabel }
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
      },
    });
  }
  await setDoc(ref, nextPatch, { merge: true });
  dispatchLeaderboardProfileUpdated(uid);
}

function filterCurrentUid(entries: LeaderboardProfile[], currentUid: string) {
  return entries.filter((entry) => entry.uid !== currentUid);
}

export async function loadLeaderboardScreenData(currentUid: string): Promise<LeaderboardScreenData> {
  const db = dbOrNull();
  if (!db || !currentUid) {
    return {
      topEntries: [],
      risingEntries: [],
      rivalEntries: [],
      currentUserEntry: null,
      currentUserRank: null,
      currentUserGapToNextXp: null,
    };
  }

  const profiles = collection(db, "leaderboardProfiles");
  const [topSnap, risingSnap, currentUserSnap] = await Promise.all([
    getDocs(query(profiles, orderBy("rewardTotalXp", "desc"), limit(6))),
    getDocs(query(profiles, orderBy("weeklyXpGain", "desc"), limit(3))),
    getDoc(doc(db, "leaderboardProfiles", currentUid)),
  ]);

  const topEntries = topSnap.docs
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row);
  const currentUserEntry = currentUserSnap.exists()
    ? normalizeLeaderboardProfileRecord(currentUserSnap.id, currentUserSnap.data() as Record<string, unknown>)
    : null;

  if (!currentUserEntry) {
    return {
      topEntries,
      risingEntries: filterCurrentUid(
        risingSnap.docs.map((row) => asLeaderboardProfile(row)).filter((row): row is LeaderboardProfile => !!row),
        currentUid
      ),
      rivalEntries: [],
      currentUserEntry: null,
      currentUserRank: null,
      currentUserGapToNextXp: null,
    };
  }

  const [higherXpSnap, aboveSnap, belowSnap] = await Promise.all([
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntry.rewardTotalXp))),
    getDocs(query(profiles, where("rewardTotalXp", ">", currentUserEntry.rewardTotalXp), orderBy("rewardTotalXp", "asc"), limit(2))),
    getDocs(query(profiles, where("rewardTotalXp", "<", currentUserEntry.rewardTotalXp), orderBy("rewardTotalXp", "desc"), limit(2))),
  ]);

  const risingEntries = filterCurrentUid(
    risingSnap.docs.map((row) => asLeaderboardProfile(row)).filter((row): row is LeaderboardProfile => !!row),
    currentUid
  );
  const aboveEntries = aboveSnap.docs
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .filter((row) => row.uid !== currentUid);
  const belowEntries = belowSnap.docs
    .map((row) => asLeaderboardProfile(row))
    .filter((row): row is LeaderboardProfile => !!row)
    .filter((row) => row.uid !== currentUid);
  const rivalEntries = [...aboveEntries, ...belowEntries].slice(0, 3);
  const currentUserGapToNextXp =
    aboveEntries.length > 0 ? Math.max(0, aboveEntries[0]!.rewardTotalXp - currentUserEntry.rewardTotalXp) : null;

  return {
    topEntries,
    risingEntries,
    rivalEntries,
    currentUserEntry,
    currentUserRank: higherXpSnap.size + 1,
    currentUserGapToNextXp,
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
