import { NextResponse } from "next/server";
import { FieldValue, type DocumentData, type Firestore, type Query } from "firebase-admin/firestore";

import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminStorageBucket } from "@/lib/firebaseAdmin";
import {
  createApiAuthErrorResponse,
  createApiInternalErrorResponse,
  verifyFirebaseRequestUser,
} from "../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
import { DELETED_ACCOUNT_UIDS_COLLECTION } from "../deletedAccountUid";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return asString(value).toLowerCase();
}

function emailLookupDocKey(email: string) {
  return encodeURIComponent(normalizeEmail(email));
}

async function deleteQueryDocs(query: Query<DocumentData>) {
  const snap = await query.get();
  if (snap.empty) return 0;
  await Promise.all(snap.docs.map((docSnap) => docSnap.ref.delete()));
  return snap.size;
}

async function deleteQueryDocTrees(db: Firestore, query: Query<DocumentData>) {
  const snap = await query.get();
  if (snap.empty) return 0;
  await Promise.all(snap.docs.map((docSnap) => db.recursiveDelete(docSnap.ref)));
  return snap.size;
}

async function deleteFeedbackVotesForUser(db: Firestore, uid: string, authoredFeedbackIds: Set<string>) {
  const pageSize = 200;
  let deletedCount = 0;
  let lastDoc: DocumentData | null = null;

  while (true) {
    let query = db.collection("feedback_items").orderBy("__name__").limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    const matchedDocs = await Promise.all(
      snap.docs.map(async (docSnap) => {
        if (authoredFeedbackIds.has(docSnap.id)) return null;
        const voteRef = docSnap.ref.collection("votes").doc(uid);
        const voteSnap = await voteRef.get();
        return voteSnap.exists ? { feedbackRef: docSnap.ref, voteRef } : null;
      })
    );

    const rows = matchedDocs.filter(
      (entry): entry is { feedbackRef: FirebaseFirestore.DocumentReference<DocumentData>; voteRef: FirebaseFirestore.DocumentReference<DocumentData> } =>
        !!entry
    );

    if (rows.length) {
      const batch = db.batch();
      for (const row of rows) {
        batch.delete(row.voteRef);
        batch.set(
          row.feedbackRef,
          {
            upvoteCount: FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
            lastActivityAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      deletedCount += rows.length;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  return deletedCount;
}

async function deleteHoldingSpaceStorageFiles(uid: string) {
  const bucket = getFirebaseAdminStorageBucket();
  await bucket.deleteFiles({
    prefix: `users/${uid}/holding-space/`,
    force: true,
  });
}

function isAuthUserNotFoundError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code || "") === "auth/user-not-found"
  );
}

async function deleteFirebaseAuthUser(uid: string) {
  try {
    await getFirebaseAdminAuth().deleteUser(uid);
  } catch (error: unknown) {
    if (isAuthUserNotFoundError(error)) return;
    throw error;
  }
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "account-delete-user-data",
      uid,
      windowMs: 24 * 60 * 60 * 1000,
      maxEvents: 2,
      code: "account/delete-user-data-rate-limited",
      message: "Too many account deletion attempts recently. Please wait before trying again.",
    });
    const db = getFirebaseAdminDb();

    const userRef = db.collection("users").doc(uid);
    const subscriptionRef = db.collection("userSubscriptions").doc(uid);
    const leaderboardProfileRef = db.collection("leaderboardProfiles").doc(uid);
    const deletedAccountUidRef = db.collection(DELETED_ACCOUNT_UIDS_COLLECTION).doc(uid);
    const userSnap = await userRef.get();
    const usernameKey = asString(userSnap.exists ? userSnap.get("usernameKey") : "");
    const userEmail = asString(userSnap.exists ? userSnap.get("email") : "") || asString(email);
    const emailKey = userEmail ? emailLookupDocKey(userEmail) : "";
    const authoredFeedbackSnap = await db.collection("feedback_items").where("ownerUid", "==", uid).get();
    const authoredFeedbackIds = new Set(authoredFeedbackSnap.docs.map((docSnap) => docSnap.id));

    await deletedAccountUidRef.set(
      {
        uid,
        schemaVersion: 1,
        deletedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await Promise.all([
      db.recursiveDelete(userRef),
      subscriptionRef.delete(),
      leaderboardProfileRef.delete(),
      deleteQueryDocs(db.collection("scheduled_time_goal_pushes").where("ownerUid", "==", uid)),
      deleteQueryDocs(db.collection("shared_task_reminder_state").where("ownerUid", "==", uid)),
      deleteQueryDocs(db.collection("shared_task_reminder_state").where("lastSentByUid", "==", uid)),
      deleteQueryDocs(db.collection("friend_requests").where("senderUid", "==", uid)),
      deleteQueryDocs(db.collection("friend_requests").where("receiverUid", "==", uid)),
      deleteQueryDocs(db.collection("friendships").where("users", "array-contains", uid)),
      deleteQueryDocs(db.collection("shared_task_summaries").where("ownerUid", "==", uid)),
      deleteQueryDocs(db.collection("shared_task_summaries").where("friendUid", "==", uid)),
      deleteQueryDocTrees(db, db.collection("feedback_items").where("ownerUid", "==", uid)),
      deleteQueryDocs(db.collection("feedback_private").where("ownerUid", "==", uid)),
      deleteFeedbackVotesForUser(db, uid, authoredFeedbackIds),
      deleteQueryDocs(db.collection("api_rate_limits").where("uid", "==", uid)),
      deleteHoldingSpaceStorageFiles(uid),
      db.collection("feedback_limits").doc(uid).delete(),
      (usernameKey ? db.collection("usernames").doc(usernameKey).delete() : Promise.resolve()),
      (emailKey ? db.collection("userEmailLookup").doc(emailKey).delete() : Promise.resolve()),
    ]);
    await deleteFirebaseAuthUser(uid);

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true }));
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "Could not delete your cloud data."));
    }
    return withAuthenticatedApiCors(
      req,
      createApiInternalErrorResponse(
        error,
        "Could not delete your cloud data.",
        "[api/account/delete-user-data] Request failed"
      )
    );
  }
}
