import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export type SubscriptionPlan = "free" | "pro";

export type UserSubscriptionRecord = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeSubscriptionStatus: string;
  stripeSyncedAt: unknown;
  schemaVersion: 1;
};

export type UpsertUserSubscriptionInput = {
  uid: string;
  plan: SubscriptionPlan;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlan(value: unknown): SubscriptionPlan {
  return asString(value).toLowerCase() === "pro" ? "pro" : "free";
}

export function planFromStripeSubscriptionStatus(status: unknown): SubscriptionPlan {
  const activeStatuses = new Set(["trialing", "active", "past_due"]);
  return activeStatuses.has(asString(status).toLowerCase()) ? "pro" : "free";
}

export function normalizeUserSubscriptionRecord(data: Record<string, unknown> | null | undefined): UserSubscriptionRecord | null {
  if (!data) return null;
  const stripeCustomerId = asString(data.stripeCustomerId);
  if (!stripeCustomerId) return null;
  return {
    stripeCustomerId,
    stripeSubscriptionId: asString(data.stripeSubscriptionId),
    stripePriceId: asString(data.stripePriceId),
    stripeSubscriptionStatus: asString(data.stripeSubscriptionStatus),
    stripeSyncedAt: data.stripeSyncedAt || null,
    schemaVersion: 1,
  };
}

export function buildUserSubscriptionWriteData(
  input: UpsertUserSubscriptionInput,
  existingCreatedAt: unknown,
  syncedAt: Timestamp = Timestamp.now()
) {
  return {
    schemaVersion: 1,
    stripeCustomerId: asString(input.customerId) || FieldValue.delete(),
    stripeSubscriptionId: asString(input.subscriptionId) || FieldValue.delete(),
    stripePriceId: asString(input.priceId) || FieldValue.delete(),
    stripeSubscriptionStatus: asString(input.status) || FieldValue.delete(),
    stripeSyncedAt: syncedAt,
    createdAt: existingCreatedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export function buildUserPlanMirrorWriteData(input: UpsertUserSubscriptionInput, existingCreatedAt: unknown) {
  return {
    schemaVersion: 1,
    plan: normalizePlan(input.plan),
    planUpdatedAt: FieldValue.serverTimestamp(),
    createdAt: existingCreatedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function loadUserSubscription(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedUid = asString(uid);
  if (!normalizedUid) return null;
  const snap = await db.collection("userSubscriptions").doc(normalizedUid).get();
  return normalizeUserSubscriptionRecord(snap.exists ? snap.data() : null);
}

export async function loadStripeCustomerIdForUser(uid: string, db: Firestore = getFirebaseAdminDb()) {
  return (await loadUserSubscription(uid, db))?.stripeCustomerId || "";
}

export async function findUidByStripeCustomerId(customerId: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedCustomerId = asString(customerId);
  if (!normalizedCustomerId) return "";
  const snap = await db
    .collection("userSubscriptions")
    .where("stripeCustomerId", "==", normalizedCustomerId)
    .limit(1)
    .get();
  return snap.empty ? "" : snap.docs[0]?.id || "";
}

export async function upsertUserSubscriptionAndPlan(input: UpsertUserSubscriptionInput, db: Firestore = getFirebaseAdminDb()) {
  const uid = asString(input.uid);
  if (!uid) return;

  const userRef = db.collection("users").doc(uid);
  const subscriptionRef = db.collection("userSubscriptions").doc(uid);
  const [userSnap, subscriptionSnap] = await Promise.all([userRef.get(), subscriptionRef.get()]);

  const batch = db.batch();
  batch.set(
    subscriptionRef,
    buildUserSubscriptionWriteData(input, subscriptionSnap.exists ? subscriptionSnap.get("createdAt") : null),
    { merge: true }
  );
  batch.set(
    userRef,
    buildUserPlanMirrorWriteData(input, userSnap.exists ? userSnap.get("createdAt") : null),
    { merge: true }
  );
  await batch.commit();

  const verifiedSubscriptionSnap = await subscriptionRef.get();
  const verifiedUserSnap = await userRef.get();
  console.info("[stripe-subscription-store] post-commit verification", {
    subscriptionPath: subscriptionRef.path,
    subscriptionExists: verifiedSubscriptionSnap.exists,
    subscriptionData: verifiedSubscriptionSnap.exists ? verifiedSubscriptionSnap.data() : null,
    userPath: userRef.path,
    userExists: verifiedUserSnap.exists,
    userPlan: verifiedUserSnap.exists ? verifiedUserSnap.get("plan") || null : null,
  });
}
