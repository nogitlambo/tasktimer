import { NextResponse } from "next/server";
import type { DocumentData, Query } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  createApiAuthErrorResponse,
  createApiInternalErrorResponse,
  verifyFirebaseRequestUser,
} from "../../shared/auth";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function deleteQueryDocs(query: Query<DocumentData>) {
  const snap = await query.get();
  if (snap.empty) return 0;
  await Promise.all(snap.docs.map((docSnap) => docSnap.ref.delete().catch(() => {})));
  return snap.size;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();

    const userRef = db.collection("users").doc(uid);
    const subscriptionRef = db.collection("userSubscriptions").doc(uid);
    const userSnap = await userRef.get();
    const usernameKey = asString(userSnap.exists ? userSnap.get("usernameKey") : "");
    const userEmail = asString(userSnap.exists ? userSnap.get("email") : "") || asString(email);
    const emailKey = userEmail.toLowerCase();

    await Promise.all([
      db.recursiveDelete(userRef).catch(() => {}),
      subscriptionRef.delete().catch(() => {}),
      deleteQueryDocs(db.collection("scheduled_time_goal_pushes").where("ownerUid", "==", uid)).catch(() => 0),
      deleteQueryDocs(db.collection("friend_requests").where("senderUid", "==", uid)).catch(() => 0),
      deleteQueryDocs(db.collection("friend_requests").where("receiverUid", "==", uid)).catch(() => 0),
      deleteQueryDocs(db.collection("friendships").where("users", "array-contains", uid)).catch(() => 0),
      deleteQueryDocs(db.collection("shared_task_summaries").where("ownerUid", "==", uid)).catch(() => 0),
      deleteQueryDocs(db.collection("shared_task_summaries").where("friendUid", "==", uid)).catch(() => 0),
      (usernameKey ? db.collection("usernames").doc(usernameKey).delete().catch(() => {}) : Promise.resolve()),
      (emailKey ? db.collection("userEmailLookup").doc(emailKey).delete().catch(() => {}) : Promise.resolve()),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not delete your cloud data.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not delete your cloud data.",
      "[api/account/delete-user-data] Request failed"
    );
  }
}
