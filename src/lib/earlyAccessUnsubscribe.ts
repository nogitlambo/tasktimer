import { FieldValue, type Firestore } from "firebase-admin/firestore";

import {
  normalizeEarlyAccessEmail,
  verifyEarlyAccessUnsubscribeToken,
} from "./earlyAccessEmail";
import { getFirebaseAdminDb } from "./firebaseAdmin";

export type EarlyAccessUnsubscribeResult =
  | { status: "unsubscribed"; email: string }
  | { status: "already-unsubscribed"; email: string }
  | { status: "invalid"; email: string };

export async function unsubscribeEarlyAccessEmail(input: {
  email: string;
  token: string;
  db?: Firestore;
}): Promise<EarlyAccessUnsubscribeResult> {
  const email = normalizeEarlyAccessEmail(input.email);
  if (!email || !verifyEarlyAccessUnsubscribeToken(email, input.token)) {
    return { status: "invalid", email };
  }

  const db = input.db || getFirebaseAdminDb();
  const ref = db.collection("coming_soon_subscriptions").doc(email);
  const snap = await ref.get();
  const status = String(snap.exists ? snap.get("status") || "" : "").trim().toLowerCase();
  if (status === "unsubscribed") {
    return { status: "already-unsubscribed", email };
  }

  await ref.set(
    {
      emailNormalized: email,
      status: "unsubscribed",
      unsubscribedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { status: "unsubscribed", email };
}
