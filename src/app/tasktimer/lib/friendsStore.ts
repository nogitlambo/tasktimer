import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import type { FirebaseError } from "firebase/app";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

export type FriendRequestStatus = "pending" | "approved" | "declined";

export type FriendRequest = {
  requestId: string;
  senderUid: string;
  receiverUid: string;
  senderEmail: string | null;
  receiverEmail: string | null;
  senderAlias: string | null;
  senderAvatarId: string | null;
  senderRankThumbnailSrc: string | null;
  receiverAlias: string | null;
  receiverAvatarId: string | null;
  receiverRankThumbnailSrc: string | null;
  status: FriendRequestStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  respondedAt: Timestamp | null;
  respondedBy: string | null;
};

export type FriendProfile = {
  alias: string | null;
  avatarId: string | null;
  avatarCustomSrc: string | null;
  googlePhotoUrl: string | null;
  rankThumbnailSrc: string | null;
  currentRankId: string | null;
  totalXp: number | null;
};

export type Friendship = {
  pairId: string;
  users: [string, string];
  profileByUid: Record<string, FriendProfile>;
  createdAt: Timestamp | null;
  createdBy: string;
};

export type SharedTaskSummary = {
  shareDocId: string;
  ownerUid: string;
  friendUid: string;
  taskId: string;
  taskName: string;
  timerState: "running" | "stopped";
  focusTrend7dMs: number[];
  checkpointScaleMs: number | null;
  taskCreatedAtMs: number | null;
  avgTimeLoggedThisWeekMs: number;
  totalTimeLoggedMs: number;
  sharedAt: Timestamp | null;
  updatedAt: Timestamp | null;
  schemaVersion: number;
};

export type SharedTaskTarget = {
  friendUid: string;
};

export type SharedTaskSummaryInput = {
  ownerUid: string;
  friendUid: string;
  taskId: string;
  taskName: string;
  timerState: "running" | "stopped";
  focusTrend7dMs: number[];
  checkpointScaleMs: number | null;
  taskCreatedAtMs: number | null;
  avgTimeLoggedThisWeekMs: number;
  totalTimeLoggedMs: number;
};

type SendRequestResult = { ok: true; request?: FriendRequest | null } | { ok: false; message: string };

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function sortedPair(a: string, b: string): [string, string] {
  // Match Firestore rules string ordering checks (`<` / `>`) deterministically.
  return [a, b].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)) as [string, string];
}

function friendshipDocId(uidA: string, uidB: string) {
  const [a, b] = sortedPair(uidA, uidB);
  return `pair:${a}:${b}`;
}

function sharedTaskSummaryDocId(ownerUid: string, friendUid: string, taskId: string) {
  return `share:${ownerUid}:${friendUid}:${taskId}`;
}

function normalizeAlias(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 40) : null;
}

function normalizeAvatarId(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 120) : null;
}

function normalizeAvatarCustomSrc(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 900_000) : null;
}

function normalizeGooglePhotoUrl(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 2_000) : null;
}

function normalizeRankThumbnailSrc(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 900_000) : null;
}

function normalizeTotalXp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

async function loadOwnProfile(uid: string): Promise<FriendProfile> {
  const db = dbOrNull();
  if (!db || !uid) {
    return { alias: null, avatarId: null, avatarCustomSrc: null, googlePhotoUrl: null, rankThumbnailSrc: null, currentRankId: null, totalXp: null };
  }
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      return { alias: null, avatarId: null, avatarCustomSrc: null, googlePhotoUrl: null, rankThumbnailSrc: null, currentRankId: null, totalXp: null };
    }
    return {
      alias: normalizeAlias(snap.get("username")),
      avatarId: normalizeAvatarId(snap.get("avatarId")),
      avatarCustomSrc: normalizeAvatarCustomSrc(snap.get("avatarCustomSrc")),
      googlePhotoUrl: normalizeGooglePhotoUrl(snap.get("googlePhotoUrl")),
      rankThumbnailSrc: normalizeRankThumbnailSrc(snap.get("rankThumbnailSrc")),
      currentRankId: normalizeAvatarId(snap.get("rewardCurrentRankId")),
      totalXp: normalizeTotalXp(snap.get("rewardTotalXp")),
    };
  } catch {
    return { alias: null, avatarId: null, avatarCustomSrc: null, googlePhotoUrl: null, rankThumbnailSrc: null, currentRankId: null, totalXp: null };
  }
}

export async function loadFriendProfile(uid: string): Promise<FriendProfile> {
  return loadOwnProfile(uid);
}

function asFriendRequest(id: string, row: Record<string, unknown>): FriendRequest {
  const statusRaw = String(row.status || "pending");
  const status: FriendRequestStatus =
    statusRaw === "approved" || statusRaw === "declined" ? statusRaw : "pending";
  return {
    requestId: id,
    senderUid: String(row.senderUid || ""),
    receiverUid: String(row.receiverUid || ""),
    senderEmail: row.senderEmail == null ? null : String(row.senderEmail || ""),
    receiverEmail: row.receiverEmail == null ? null : String(row.receiverEmail || ""),
    senderAlias: row.senderAlias == null ? null : String(row.senderAlias || ""),
    senderAvatarId: row.senderAvatarId == null ? null : String(row.senderAvatarId || ""),
    senderRankThumbnailSrc: row.senderRankThumbnailSrc == null ? null : String(row.senderRankThumbnailSrc || ""),
    receiverAlias: row.receiverAlias == null ? null : String(row.receiverAlias || ""),
    receiverAvatarId: row.receiverAvatarId == null ? null : String(row.receiverAvatarId || ""),
    receiverRankThumbnailSrc: row.receiverRankThumbnailSrc == null ? null : String(row.receiverRankThumbnailSrc || ""),
    status,
    createdAt: (row.createdAt as Timestamp) || null,
    updatedAt: (row.updatedAt as Timestamp) || null,
    respondedAt: (row.respondedAt as Timestamp) || null,
    respondedBy: row.respondedBy == null ? null : String(row.respondedBy || ""),
  };
}

function asFriendship(id: string, row: Record<string, unknown>): Friendship {
  const users = Array.isArray(row.users) ? row.users.map((x) => String(x || "")) : [];
  const pair = sortedPair(users[0] || "", users[1] || "");
  const profileByUidRaw =
    row.profileByUid && typeof row.profileByUid === "object" ? (row.profileByUid as Record<string, unknown>) : {};
  const profileByUid: Record<string, FriendProfile> = {};
  pair.forEach((uid) => {
    const value = profileByUidRaw[uid];
    const valueObj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      profileByUid[uid] = {
        alias: normalizeAlias(valueObj.alias),
        avatarId: normalizeAvatarId(valueObj.avatarId),
        avatarCustomSrc: normalizeAvatarCustomSrc(valueObj.avatarCustomSrc),
        googlePhotoUrl: normalizeGooglePhotoUrl(valueObj.googlePhotoUrl),
        rankThumbnailSrc: normalizeRankThumbnailSrc(valueObj.rankThumbnailSrc),
        currentRankId: normalizeAvatarId(valueObj.currentRankId),
        totalXp: normalizeTotalXp(valueObj.totalXp),
      };
  });
  return {
    pairId: id,
    users: pair,
    profileByUid,
    createdAt: (row.createdAt as Timestamp) || null,
    createdBy: String(row.createdBy || ""),
  };
}

function asSharedTaskSummary(id: string, row: Record<string, unknown>): SharedTaskSummary {
  const timerStateRaw = String(row.timerState || "").trim().toLowerCase();
  const timerState: "running" | "stopped" = timerStateRaw === "running" ? "running" : "stopped";
  const rawTrend = Array.isArray(row.focusTrend7dMs) ? row.focusTrend7dMs : [];
  const focusTrend7dMs = new Array(7).fill(0).map((_, i) => Math.max(0, Math.floor(Number(rawTrend[i] || 0))));
  return {
    shareDocId: String(row.shareDocId || id),
    ownerUid: String(row.ownerUid || ""),
    friendUid: String(row.friendUid || ""),
    taskId: String(row.taskId || ""),
    taskName: String(row.taskName || ""),
    timerState,
    focusTrend7dMs,
    checkpointScaleMs: row.checkpointScaleMs == null ? null : Math.max(0, Number(row.checkpointScaleMs || 0)),
    taskCreatedAtMs: row.taskCreatedAtMs == null ? null : Number(row.taskCreatedAtMs || 0),
    avgTimeLoggedThisWeekMs: Math.max(0, Number(row.avgTimeLoggedThisWeekMs || 0)),
    totalTimeLoggedMs: Math.max(0, Number(row.totalTimeLoggedMs || 0)),
    sharedAt: (row.sharedAt as Timestamp) || null,
    updatedAt: (row.updatedAt as Timestamp) || null,
    schemaVersion: Number(row.schemaVersion || 1),
  };
}

export async function sendFriendRequest(
  senderUid: string,
  senderEmail: string | null,
  receiverEmailRaw: string
): Promise<SendRequestResult> {
  try {
    const receiverEmail = String(receiverEmailRaw || "").trim().toLowerCase();
    if (!senderUid) return { ok: false, message: "You must be signed in." };
    if (!receiverEmail) return { ok: false, message: "Email address is required." };
    const senderEmailNorm = String(senderEmail || "").trim().toLowerCase();
    if (senderEmailNorm && senderEmailNorm === receiverEmail) {
      return { ok: false, message: "You cannot send a request to yourself." };
    }
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser || null;
    const idToken = await currentUser?.getIdToken();
    if (!idToken) {
      return { ok: false, message: "Your sign-in session is no longer valid. Please sign in again." };
    }
    const response = await fetch("/api/friends/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-firebase-auth": idToken,
      },
      body: JSON.stringify({ receiverEmail }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      request?: FriendRequest | null;
      error?: string;
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, message: String(payload.error || "Could not send friend request.") };
    }
    return { ok: true, request: payload.request || null };
  } catch (err: unknown) {
    const firebaseErr = err as FirebaseError | undefined;
    const code = String(firebaseErr?.code || "").trim();
    if (code === "permission-denied") {
      return { ok: false, message: "Permission denied writing friend request." };
    }
    if (code === "failed-precondition") {
      return { ok: false, message: "Firestore precondition failed. Check indexes/rules." };
    }
    const message = String(firebaseErr?.message || "").trim();
    if (message) return { ok: false, message };
    return { ok: false, message: "Could not send friend request." };
  }
}

export async function loadIncomingRequests(uid: string): Promise<FriendRequest[]> {
  const db = dbOrNull();
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, "friend_requests"), where("receiverUid", "==", uid)));
  return snap.docs
    .map((d) => asFriendRequest(d.id, d.data() as Record<string, unknown>))
    .filter((row) => row.status === "pending")
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function loadOutgoingRequests(uid: string): Promise<FriendRequest[]> {
  const db = dbOrNull();
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, "friend_requests"), where("senderUid", "==", uid)));
  return snap.docs
    .map((d) => asFriendRequest(d.id, d.data() as Record<string, unknown>))
    .filter((row) => row.status === "pending")
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function loadFriendships(uid: string): Promise<Friendship[]> {
  const db = dbOrNull();
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, "friendships"), where("users", "array-contains", uid)));
  return snap.docs
    .map((d) => asFriendship(d.id, d.data() as Record<string, unknown>))
    .filter((row) => row.users[0] && row.users[1]);
}

export async function loadFriendsForOwner(ownerUid: string): Promise<Friendship[]> {
  return loadFriendships(ownerUid);
}

export async function loadSharedTaskSummariesForViewer(viewerUid: string): Promise<SharedTaskSummary[]> {
  const db = dbOrNull();
  if (!db || !viewerUid) return [];
  const snap = await getDocs(query(collection(db, "shared_task_summaries"), where("friendUid", "==", viewerUid)));
  return snap.docs
    .map((d) => asSharedTaskSummary(d.id, d.data() as Record<string, unknown>))
    .filter((row) => row.ownerUid && row.friendUid && row.taskId)
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function loadSharedTaskSummariesForOwner(ownerUid: string): Promise<SharedTaskSummary[]> {
  const db = dbOrNull();
  if (!db || !ownerUid) return [];
  const snap = await getDocs(query(collection(db, "shared_task_summaries"), where("ownerUid", "==", ownerUid)));
  return snap.docs
    .map((d) => asSharedTaskSummary(d.id, d.data() as Record<string, unknown>))
    .filter((row) => row.ownerUid && row.friendUid && row.taskId);
}

export async function upsertSharedTaskSummary(
  summary: SharedTaskSummaryInput
): Promise<{ ok: boolean; message?: string }> {
  try {
    const db = dbOrNull();
    if (!db) return { ok: false, message: "Cloud Firestore is not available." };
    const ownerUid = String(summary.ownerUid || "").trim();
    const friendUid = String(summary.friendUid || "").trim();
    const taskId = String(summary.taskId || "").trim();
    const taskName = String(summary.taskName || "").trim();
    const timerState: "running" | "stopped" = summary.timerState === "running" ? "running" : "stopped";
    const focusTrend7dMs = new Array(7)
      .fill(0)
      .map((_, i) => Math.max(0, Math.floor(Number((summary.focusTrend7dMs || [])[i] || 0))));
    const checkpointScaleMs =
      summary.checkpointScaleMs == null ? null : Math.max(0, Math.floor(Number(summary.checkpointScaleMs) || 0));
    if (!ownerUid || !friendUid || !taskId || !taskName) {
      return { ok: false, message: "Missing required summary fields." };
    }
    if (ownerUid === friendUid) return { ok: false, message: "Cannot share a task with yourself." };

    const shareDocId = sharedTaskSummaryDocId(ownerUid, friendUid, taskId);
    const ref = doc(db, "shared_task_summaries", shareDocId);
    const taskCreatedAtMs =
      summary.taskCreatedAtMs == null ? null : Math.max(0, Math.floor(Number(summary.taskCreatedAtMs) || 0));
    const avgTimeLoggedThisWeekMs = Math.max(0, Math.floor(Number(summary.avgTimeLoggedThisWeekMs) || 0));
    const totalTimeLoggedMs = Math.max(0, Math.floor(Number(summary.totalTimeLoggedMs) || 0));

    await setDoc(ref, {
      shareDocId,
      ownerUid,
      friendUid,
      taskId,
      taskName,
      timerState,
      focusTrend7dMs,
      checkpointScaleMs,
      taskCreatedAtMs,
      avgTimeLoggedThisWeekMs,
      totalTimeLoggedMs,
      sharedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    return { ok: true };
  } catch (err: unknown) {
    const firebaseErr = err as FirebaseError | undefined;
    const message = String(firebaseErr?.message || "").trim();
    return { ok: false, message: message || "Could not share task summary." };
  }
}

export async function deleteSharedTaskSummary(ownerUid: string, friendUid: string, taskId: string): Promise<void> {
  const db = dbOrNull();
  if (!db || !ownerUid || !friendUid || !taskId) return;
  await deleteDoc(doc(db, "shared_task_summaries", sharedTaskSummaryDocId(ownerUid, friendUid, taskId)));
}

export async function deleteSharedTaskSummariesForTask(ownerUid: string, taskId: string): Promise<void> {
  const db = dbOrNull();
  if (!db || !ownerUid || !taskId) return;
  const snap = await getDocs(
    query(collection(db, "shared_task_summaries"), where("ownerUid", "==", ownerUid), where("taskId", "==", taskId))
  );
  await Promise.all(snap.docs.map((row) => deleteDoc(row.ref)));
}

export async function deleteFriendship(
  ownUid: string,
  friendUid: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const db = dbOrNull();
    const ownerUid = String(ownUid || "").trim();
    const peerUid = String(friendUid || "").trim();
    if (!db) return { ok: false, message: "Cloud Firestore is not available." };
    if (!ownerUid || !peerUid) return { ok: false, message: "Friend account could not be resolved." };
    if (ownerUid === peerUid) return { ok: false, message: "You cannot delete yourself as a friend." };

    const pairRef = doc(db, "friendships", friendshipDocId(ownerUid, peerUid));
    const pairSnap = await getDoc(pairRef);
    if (!pairSnap.exists()) return { ok: false, message: "Friendship not found." };

    // Query only sets that are guaranteed readable under rules:
    // - current user's owned summaries
    // - summaries where the current user is the friend/recipient
    const ownedSharedSnap = await getDocs(query(collection(db, "shared_task_summaries"), where("ownerUid", "==", ownerUid)));
    const peerSharedSnap = await getDocs(query(collection(db, "shared_task_summaries"), where("friendUid", "==", ownerUid)));
    const ownedSharedDocs = ownedSharedSnap.docs.filter((row) => String(row.get("friendUid") || "").trim() === peerUid);
    const peerSharedDocs = peerSharedSnap.docs.filter((row) => String(row.get("ownerUid") || "").trim() === peerUid);
    await deleteDoc(pairRef);

    const cleanupResults = await Promise.allSettled([
      ...ownedSharedDocs.map((row) => deleteDoc(row.ref)),
      ...peerSharedDocs.map((row) => deleteDoc(row.ref)),
    ]);
    const cleanupFailures = cleanupResults.filter((result) => result.status === "rejected");
    if (cleanupFailures.length) {
      return {
        ok: true,
        message: "Friend removed. Some shared task links could not be cleaned up automatically.",
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    const firebaseErr = err as FirebaseError | undefined;
    const code = String(firebaseErr?.code || "").trim();
    if (process.env.NODE_ENV !== "production") {
      console.error("[friendsStore] deleteFriendship failed", {
        ownerUid: ownUid,
        peerUid: friendUid,
        code: code || null,
        message: String(firebaseErr?.message || "").trim() || null,
      });
    }
    if (code === "permission-denied") {
      return { ok: false, message: "Permission denied while deleting friend." };
    }
    const message = String(firebaseErr?.message || "").trim();
    return { ok: false, message: message || "Could not delete friend." };
  }
}

export async function approveFriendRequest(requestId: string, receiverUid: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const db = dbOrNull();
    if (!db) return { ok: false, message: "Cloud Firestore is not available." };
    const ref = doc(db, "friend_requests", requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Request not found." };
    const row = asFriendRequest(requestId, snap.data() as Record<string, unknown>);
    if (row.receiverUid !== receiverUid) return { ok: false, message: "You cannot approve this request." };
    if (row.status !== "pending") return { ok: false, message: "Request is no longer pending." };

    await updateDoc(ref, {
      status: "approved",
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
      respondedBy: receiverUid,
    });

    const pairId = friendshipDocId(row.senderUid, row.receiverUid);
    const pair = sortedPair(row.senderUid, row.receiverUid);
    const senderProfile = await loadOwnProfile(row.senderUid);
    const receiverProfile = await loadOwnProfile(receiverUid);
    const pairRef = doc(db, "friendships", pairId);
    const pairSnap = await getDoc(pairRef);
    const profileByUid = {
      [row.senderUid]: {
        alias: normalizeAlias(senderProfile.alias || row.senderEmail || row.senderUid),
        avatarId: normalizeAvatarId(senderProfile.avatarId || row.senderAvatarId),
        avatarCustomSrc: normalizeAvatarCustomSrc(senderProfile.avatarCustomSrc),
        googlePhotoUrl: normalizeGooglePhotoUrl(senderProfile.googlePhotoUrl),
        rankThumbnailSrc: normalizeRankThumbnailSrc(senderProfile.rankThumbnailSrc || row.senderRankThumbnailSrc),
        currentRankId: normalizeAvatarId(senderProfile.currentRankId || (snap.data() as Record<string, unknown>)?.senderCurrentRankId),
        totalXp: normalizeTotalXp(senderProfile.totalXp ?? (snap.data() as Record<string, unknown>)?.senderTotalXp),
      },
      [row.receiverUid]: {
        alias: normalizeAlias(receiverProfile.alias || row.receiverEmail || row.receiverUid),
        avatarId: normalizeAvatarId(receiverProfile.avatarId || row.receiverAvatarId),
        avatarCustomSrc: normalizeAvatarCustomSrc(receiverProfile.avatarCustomSrc),
        googlePhotoUrl: normalizeGooglePhotoUrl(receiverProfile.googlePhotoUrl),
        rankThumbnailSrc: normalizeRankThumbnailSrc(receiverProfile.rankThumbnailSrc || row.receiverRankThumbnailSrc),
        currentRankId: normalizeAvatarId(receiverProfile.currentRankId || (snap.data() as Record<string, unknown>)?.receiverCurrentRankId),
        totalXp: normalizeTotalXp(receiverProfile.totalXp ?? (snap.data() as Record<string, unknown>)?.receiverTotalXp),
      },
    };
    if (!pairSnap.exists()) {
      await setDoc(pairRef, {
        pairId,
        users: pair,
        profileByUid,
        createdBy: receiverUid,
        createdAt: serverTimestamp(),
      });
    }

    return { ok: true };
  } catch (err: unknown) {
    const firebaseErr = err as FirebaseError | undefined;
    const code = String(firebaseErr?.code || "").trim();
    if (code === "permission-denied") {
      return { ok: false, message: "Permission denied while approving request." };
    }
    const message = String(firebaseErr?.message || "").trim();
    return { ok: false, message: message || "Could not approve friend request." };
  }
}

export async function declineFriendRequest(requestId: string, receiverUid: string): Promise<{ ok: boolean; message?: string }> {
  const db = dbOrNull();
  if (!db) return { ok: false, message: "Cloud Firestore is not available." };
  const ref = doc(db, "friend_requests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, message: "Request not found." };
  const row = asFriendRequest(requestId, snap.data() as Record<string, unknown>);
  if (row.receiverUid !== receiverUid) return { ok: false, message: "You cannot decline this request." };
  if (row.status !== "pending") return { ok: false, message: "Request is no longer pending." };

  await updateDoc(ref, {
    status: "declined",
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
    respondedBy: receiverUid,
  });
  return { ok: true };
}

export async function cancelOutgoingFriendRequest(
  requestId: string,
  senderUid: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const db = dbOrNull();
    if (!db) return { ok: false, message: "Cloud Firestore is not available." };
    const ref = doc(db, "friend_requests", requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, message: "Request not found." };
    const row = asFriendRequest(requestId, snap.data() as Record<string, unknown>);
    if (row.senderUid !== senderUid) return { ok: false, message: "You cannot cancel this request." };
    if (row.status !== "pending") return { ok: false, message: "Request is no longer pending." };

    await deleteDoc(ref);
    return { ok: true };
  } catch (err: unknown) {
    const firebaseErr = err as FirebaseError | undefined;
    const code = String(firebaseErr?.code || "").trim();
    if (code === "permission-denied") {
      return { ok: false, message: "Permission denied while cancelling request." };
    }
    const message = String(firebaseErr?.message || "").trim();
    return { ok: false, message: message || "Could not cancel friend request." };
  }
}

export async function syncOwnFriendshipProfile(
  uid: string,
  patch: Partial<
    Pick<FriendProfile, "alias" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl" | "rankThumbnailSrc" | "currentRankId" | "totalXp">
  >
): Promise<void> {
  const db = dbOrNull();
  const ownUid = String(uid || "").trim();
  if (!db || !ownUid) return;
  const profilePatch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "alias")) {
    profilePatch[`profileByUid.${ownUid}.alias`] = normalizeAlias(patch.alias);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatarId")) {
    profilePatch[`profileByUid.${ownUid}.avatarId`] = normalizeAvatarId(patch.avatarId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatarCustomSrc")) {
    profilePatch[`profileByUid.${ownUid}.avatarCustomSrc`] = normalizeAvatarCustomSrc(patch.avatarCustomSrc);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "googlePhotoUrl")) {
    profilePatch[`profileByUid.${ownUid}.googlePhotoUrl`] = normalizeGooglePhotoUrl(patch.googlePhotoUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rankThumbnailSrc")) {
    profilePatch[`profileByUid.${ownUid}.rankThumbnailSrc`] = normalizeRankThumbnailSrc(patch.rankThumbnailSrc);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "currentRankId")) {
    profilePatch[`profileByUid.${ownUid}.currentRankId`] = normalizeAvatarId(patch.currentRankId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "totalXp")) {
    profilePatch[`profileByUid.${ownUid}.totalXp`] = normalizeTotalXp(patch.totalXp);
  }
  if (!Object.keys(profilePatch).length) return;
  const snap = await getDocs(query(collection(db, "friendships"), where("users", "array-contains", ownUid)));
  await Promise.all(snap.docs.map((row) => updateDoc(row.ref, profilePatch)));
}
