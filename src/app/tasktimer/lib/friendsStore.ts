import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import type { FirebaseError } from "firebase/app";

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
  rankThumbnailSrc: string | null;
  currentRankId: string | null;
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
  taskMode: "mode1" | "mode2" | "mode3";
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
  taskMode: "mode1" | "mode2" | "mode3";
  timerState: "running" | "stopped";
  focusTrend7dMs: number[];
  checkpointScaleMs: number | null;
  taskCreatedAtMs: number | null;
  avgTimeLoggedThisWeekMs: number;
  totalTimeLoggedMs: number;
};

type SendRequestResult = { ok: true; request: FriendRequest } | { ok: false; message: string };

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function sortedPair(a: string, b: string): [string, string] {
  // Match Firestore rules string ordering checks (`<` / `>`) deterministically.
  return [a, b].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)) as [string, string];
}

function requestDocId(senderUid: string, receiverUid: string) {
  return `pending:${senderUid}:${receiverUid}`;
}

function emailLookupDocKey(email: string) {
  return encodeURIComponent(String(email || "").trim().toLowerCase());
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

function normalizeRankThumbnailSrc(value: unknown): string | null {
  const out = String(value || "").trim();
  return out ? out.slice(0, 900_000) : null;
}

async function loadOwnProfile(uid: string): Promise<FriendProfile> {
  const db = dbOrNull();
  if (!db || !uid) return { alias: null, avatarId: null, avatarCustomSrc: null, rankThumbnailSrc: null, currentRankId: null };
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { alias: null, avatarId: null, avatarCustomSrc: null, rankThumbnailSrc: null, currentRankId: null };
    return {
      alias: normalizeAlias(snap.get("displayName")),
      avatarId: normalizeAvatarId(snap.get("avatarId")),
      avatarCustomSrc: normalizeAvatarCustomSrc(snap.get("avatarCustomSrc")),
      rankThumbnailSrc: normalizeRankThumbnailSrc(snap.get("rankThumbnailSrc")),
      currentRankId: normalizeAvatarId(snap.get("rewardCurrentRankId")),
    };
  } catch {
    return { alias: null, avatarId: null, avatarCustomSrc: null, rankThumbnailSrc: null, currentRankId: null };
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
      rankThumbnailSrc: normalizeRankThumbnailSrc(valueObj.rankThumbnailSrc),
      currentRankId: normalizeAvatarId(valueObj.currentRankId),
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
  const taskModeRaw = String(row.taskMode || "").trim();
  const taskMode: "mode1" | "mode2" | "mode3" = taskModeRaw === "mode2" || taskModeRaw === "mode3" ? taskModeRaw : "mode1";
  const rawTrend = Array.isArray(row.focusTrend7dMs) ? row.focusTrend7dMs : [];
  const focusTrend7dMs = new Array(7).fill(0).map((_, i) => Math.max(0, Math.floor(Number(rawTrend[i] || 0))));
  return {
    shareDocId: String(row.shareDocId || id),
    ownerUid: String(row.ownerUid || ""),
    friendUid: String(row.friendUid || ""),
    taskId: String(row.taskId || ""),
    taskName: String(row.taskName || ""),
    taskMode,
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
    const db = dbOrNull();
    if (!db) return { ok: false, message: "Cloud Firestore is not available." };

    const receiverEmail = String(receiverEmailRaw || "").trim().toLowerCase();
    if (!senderUid) return { ok: false, message: "You must be signed in." };
    if (!receiverEmail) return { ok: false, message: "Email address is required." };
    const senderEmailNorm = String(senderEmail || "").trim().toLowerCase();
    if (senderEmailNorm && senderEmailNorm === receiverEmail) {
      return { ok: false, message: "You cannot send a request to yourself." };
    }

    let lookupSnap;
    try {
      lookupSnap = await getDoc(doc(db, "userEmailLookup", emailLookupDocKey(receiverEmail)));
    } catch (err: unknown) {
      const firebaseErr = err as FirebaseError | undefined;
      if (String(firebaseErr?.code || "").trim() === "permission-denied") {
        return { ok: false, message: "Permission denied reading user lookup." };
      }
      return { ok: false, message: "Could not read user lookup for this email address." };
    }
    if (!lookupSnap.exists()) return { ok: false, message: "No user found for this email address." };
    const receiverUid = String(lookupSnap.get("uid") || "").trim();
    if (!receiverUid) return { ok: false, message: "Could not resolve user account." };
    if (receiverUid === senderUid) return { ok: false, message: "You cannot send a request to yourself." };
    const senderProfile = await loadOwnProfile(senderUid);

    const requestId = requestDocId(senderUid, receiverUid);
    const requestRef = doc(db, "friend_requests", requestId);
    const pairRef = doc(db, "friendships", friendshipDocId(senderUid, receiverUid));

    let failure: string | null = null;
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(requestRef);
      const friendship = await tx.get(pairRef);

      if (friendship.exists()) {
        failure = "You are already friends with this user.";
        return;
      }

      const receiverEmailRawValue = lookupSnap.get("email");
      const receiverEmailValue = receiverEmailRawValue == null ? null : String(receiverEmailRawValue || "");
      if (existing.exists()) {
        const status = String(existing.get("status") || "pending");
        if (status === "pending") {
          failure = "A pending request already exists for this user.";
          return;
        }
        if (status === "approved") {
          failure = "You are already friends with this user.";
          return;
        }
        if (status !== "declined") {
          failure = "Request state is invalid. Remove or fix the existing request first.";
          return;
        }

        // Retry path: update only mutable fields so immutable-rule comparisons remain intact.
        tx.update(requestRef, {
          status: "pending",
          senderEmail: senderEmail || null,
          receiverEmail: receiverEmailValue,
          senderAlias: senderProfile.alias,
          senderAvatarId: senderProfile.avatarId,
          senderRankThumbnailSrc: senderProfile.rankThumbnailSrc,
          senderCurrentRankId: senderProfile.currentRankId,
          receiverAlias: normalizeAlias(lookupSnap.get("displayName")),
          receiverAvatarId: normalizeAvatarId(lookupSnap.get("avatarId")),
          receiverRankThumbnailSrc: normalizeRankThumbnailSrc(lookupSnap.get("rankThumbnailSrc")),
          receiverCurrentRankId: normalizeAvatarId(lookupSnap.get("rewardCurrentRankId")),
          updatedAt: serverTimestamp(),
          respondedAt: null,
          respondedBy: null,
        });
        return;
      }

      tx.set(requestRef, {
        requestId,
        senderUid,
        receiverUid,
        senderEmail: senderEmail || null,
        receiverEmail: receiverEmailValue,
        senderAlias: senderProfile.alias,
        senderAvatarId: senderProfile.avatarId,
        senderRankThumbnailSrc: senderProfile.rankThumbnailSrc,
        senderCurrentRankId: senderProfile.currentRankId,
        receiverAlias: normalizeAlias(lookupSnap.get("displayName")),
        receiverAvatarId: normalizeAvatarId(lookupSnap.get("avatarId")),
        receiverRankThumbnailSrc: normalizeRankThumbnailSrc(lookupSnap.get("rankThumbnailSrc")),
        receiverCurrentRankId: normalizeAvatarId(lookupSnap.get("rewardCurrentRankId")),
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null,
        respondedBy: null,
      });
    });

    if (failure) return { ok: false, message: failure };
    const snap = await getDoc(requestRef);
    return { ok: true, request: asFriendRequest(requestId, (snap.data() || {}) as Record<string, unknown>) };
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
    const taskMode: "mode1" | "mode2" | "mode3" = summary.taskMode === "mode2" || summary.taskMode === "mode3" ? summary.taskMode : "mode1";
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
      taskMode,
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
        alias: normalizeAlias(senderProfile.alias || row.senderAlias || row.senderEmail),
        avatarId: normalizeAvatarId(senderProfile.avatarId || row.senderAvatarId),
        avatarCustomSrc: normalizeAvatarCustomSrc(senderProfile.avatarCustomSrc),
        rankThumbnailSrc: normalizeRankThumbnailSrc(senderProfile.rankThumbnailSrc || row.senderRankThumbnailSrc),
        currentRankId: normalizeAvatarId(senderProfile.currentRankId || (snap.data() as Record<string, unknown>)?.senderCurrentRankId),
      },
      [row.receiverUid]: {
        alias: normalizeAlias(receiverProfile.alias || row.receiverAlias || row.receiverEmail),
        avatarId: normalizeAvatarId(receiverProfile.avatarId || row.receiverAvatarId),
        avatarCustomSrc: normalizeAvatarCustomSrc(receiverProfile.avatarCustomSrc),
        rankThumbnailSrc: normalizeRankThumbnailSrc(receiverProfile.rankThumbnailSrc || row.receiverRankThumbnailSrc),
        currentRankId: normalizeAvatarId(receiverProfile.currentRankId || (snap.data() as Record<string, unknown>)?.receiverCurrentRankId),
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
  const db = dbOrNull();
  if (!db) return { ok: false, message: "Cloud Firestore is not available." };
  const ref = doc(db, "friend_requests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, message: "Request not found." };
  const row = asFriendRequest(requestId, snap.data() as Record<string, unknown>);
  if (row.senderUid !== senderUid) return { ok: false, message: "You cannot cancel this request." };
  if (row.status !== "pending") return { ok: false, message: "Request is no longer pending." };

  await updateDoc(ref, {
    status: "declined",
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
    respondedBy: senderUid,
  });
  return { ok: true };
}

export async function syncOwnFriendshipProfile(
  uid: string,
  patch: Partial<Pick<FriendProfile, "alias" | "avatarId" | "avatarCustomSrc" | "rankThumbnailSrc" | "currentRankId">>
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
  if (Object.prototype.hasOwnProperty.call(patch, "rankThumbnailSrc")) {
    profilePatch[`profileByUid.${ownUid}.rankThumbnailSrc`] = normalizeRankThumbnailSrc(patch.rankThumbnailSrc);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "currentRankId")) {
    profilePatch[`profileByUid.${ownUid}.currentRankId`] = normalizeAvatarId(patch.currentRankId);
  }
  if (!Object.keys(profilePatch).length) return;
  const snap = await getDocs(query(collection(db, "friendships"), where("users", "array-contains", ownUid)));
  await Promise.all(snap.docs.map((row) => updateDoc(row.ref, profilePatch)));
}
