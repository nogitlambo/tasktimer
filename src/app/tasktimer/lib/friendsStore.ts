import {
  collection,
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

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

export type FriendRequestStatus = "pending" | "approved" | "declined";

export type FriendRequest = {
  requestId: string;
  senderUid: string;
  receiverUid: string;
  senderEmail: string | null;
  receiverEmail: string | null;
  status: FriendRequestStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  respondedAt: Timestamp | null;
  respondedBy: string | null;
};

export type Friendship = {
  pairId: string;
  users: [string, string];
  createdAt: Timestamp | null;
  createdBy: string;
};

type SendRequestResult = { ok: true; request: FriendRequest } | { ok: false; message: string };

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function sortedPair(a: string, b: string): [string, string] {
  return [a, b].sort((x, y) => x.localeCompare(y)) as [string, string];
}

function requestDocId(senderUid: string, receiverUid: string) {
  return `pending:${senderUid}:${receiverUid}`;
}

function friendshipDocId(uidA: string, uidB: string) {
  const [a, b] = sortedPair(uidA, uidB);
  return `pair:${a}:${b}`;
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
  return {
    pairId: id,
    users: pair,
    createdAt: (row.createdAt as Timestamp) || null,
    createdBy: String(row.createdBy || ""),
  };
}

export async function sendFriendRequest(
  senderUid: string,
  senderEmail: string | null,
  receiverUidRaw: string,
  secretTokenRaw: string
): Promise<SendRequestResult> {
  const db = dbOrNull();
  if (!db) return { ok: false, message: "Cloud Firestore is not available." };

  const receiverUid = String(receiverUidRaw || "").trim();
  const secretToken = String(secretTokenRaw || "").trim();
  if (!senderUid) return { ok: false, message: "You must be signed in." };
  if (!receiverUid) return { ok: false, message: "User ID is required." };
  if (!secretToken) return { ok: false, message: "Secret token is required." };
  if (receiverUid === senderUid) return { ok: false, message: "You cannot send a request to yourself." };

  const receiverUserRef = doc(db, "users", receiverUid);
  const accountStateRef = doc(db, "users", receiverUid, "accountState", "v1");
  const requestId = requestDocId(senderUid, receiverUid);
  const requestRef = doc(db, "friend_requests", requestId);

  let failure: string | null = null;
  await runTransaction(db, async (tx) => {
    const [receiverUserSnap, accountStateSnap, existing] = await Promise.all([
      tx.get(receiverUserRef),
      tx.get(accountStateRef),
      tx.get(requestRef),
    ]);

    if (!receiverUserSnap.exists()) {
      failure = "No user found for this User ID.";
      return;
    }

    const activeToken = accountStateSnap.exists() ? String(accountStateSnap.get("friendInviteKey") || "") : "";
    if (!activeToken) {
      failure = "This user does not have an active secret token.";
      return;
    }
    if (activeToken !== secretToken) {
      failure = "Secret token is invalid.";
      return;
    }

    if (existing.exists() && String(existing.get("status") || "pending") === "pending") {
      failure = "A pending request already exists for this user.";
      return;
    }

    const receiverEmail = receiverUserSnap.get("email") ? String(receiverUserSnap.get("email")) : null;
    tx.set(
      requestRef,
      {
        requestId,
        senderUid,
        receiverUid,
        senderEmail: senderEmail || null,
        receiverEmail,
        status: "pending",
        createdAt: existing.exists() ? (existing.get("createdAt") || serverTimestamp()) : serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null,
        respondedBy: null,
      },
      { merge: true }
    );
    // One-time key consumption: remove immediately after a valid request is created.
    tx.set(accountStateRef, { friendInviteKey: null, friendInviteKeyExpiresAt: null, updatedAt: serverTimestamp() }, { merge: true });
  });

  if (failure) return { ok: false, message: failure };
  const snap = await getDoc(requestRef);
  return { ok: true, request: asFriendRequest(requestId, (snap.data() || {}) as Record<string, unknown>) };
}

export async function loadIncomingRequests(uid: string): Promise<FriendRequest[]> {
  const db = dbOrNull();
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, "friend_requests"), where("receiverUid", "==", uid)));
  return snap.docs
    .map((d) => asFriendRequest(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function loadOutgoingRequests(uid: string): Promise<FriendRequest[]> {
  const db = dbOrNull();
  if (!db || !uid) return [];
  const snap = await getDocs(query(collection(db, "friend_requests"), where("senderUid", "==", uid)));
  return snap.docs
    .map((d) => asFriendRequest(d.id, d.data() as Record<string, unknown>))
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

export async function approveFriendRequest(requestId: string, receiverUid: string): Promise<{ ok: boolean; message?: string }> {
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
  const pairRef = doc(db, "friendships", pairId);
  const pairSnap = await getDoc(pairRef);
  if (!pairSnap.exists()) {
    await setDoc(pairRef, {
      pairId,
      users: pair,
      createdBy: receiverUid,
      createdAt: serverTimestamp(),
    });
  }

  return { ok: true };
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
