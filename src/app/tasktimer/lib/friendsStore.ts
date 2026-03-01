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
import type { FirebaseError } from "firebase/app";

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

function emailLookupDocKey(email: string) {
  return encodeURIComponent(String(email || "").trim().toLowerCase());
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

    const requestId = requestDocId(senderUid, receiverUid);
    const requestRef = doc(db, "friend_requests", requestId);

    let failure: string | null = null;
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(requestRef);

      const receiverEmailRawValue = lookupSnap.get("email");
      const receiverEmailValue = receiverEmailRawValue == null ? null : String(receiverEmailRawValue || "");
      if (existing.exists()) {
        const status = String(existing.get("status") || "pending");
        if (status === "pending") {
          failure = "A pending request already exists for this user.";
          return;
        }
        if (status !== "approved" && status !== "declined") {
          failure = "Request state is invalid. Remove or fix the existing request first.";
          return;
        }

        // Retry path: update only mutable fields so immutable-rule comparisons remain intact.
        tx.update(requestRef, {
          status: "pending",
          senderEmail: senderEmail || null,
          receiverEmail: receiverEmailValue,
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
