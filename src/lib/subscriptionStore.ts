import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export type SubscriptionPlan = "free" | "pro";

export type UserSubscriptionRecord = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeSubscriptionStatus: string;
  currentPeriodEndAt: unknown;
  stripeSyncedAt: unknown;
  schemaVersion: 1;
};

export type RetainedSubscriptionRecord = {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeSubscriptionStatus: string;
  currentPeriodEndAt: unknown;
  plan: "pro";
  sourceUid: string;
  retainedAt: unknown;
  updatedAt: unknown;
  schemaVersion: 1;
};

export type UpsertUserSubscriptionInput = {
  uid: string;
  plan: SubscriptionPlan;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
  currentPeriodEndAt?: unknown;
};

export type UpsertRetainedSubscriptionInput = {
  email: string;
  sourceUid?: string;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
  currentPeriodEndAt?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlan(value: unknown): SubscriptionPlan {
  return asString(value).toLowerCase() === "pro" ? "pro" : "free";
}

export function normalizeEmailKey(email: unknown) {
  return asString(email).toLowerCase();
}

export function planFromStripeSubscriptionStatus(status: unknown): SubscriptionPlan {
  const activeStatuses = new Set(["trialing", "active", "past_due"]);
  return activeStatuses.has(asString(status).toLowerCase()) ? "pro" : "free";
}

export function isActiveSubscriptionStatus(status: unknown) {
  return planFromStripeSubscriptionStatus(status) === "pro";
}

function normalizePeriodEnd(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return value;
  }
  const millis = Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return null;
  return Timestamp.fromMillis(Math.floor(millis));
}

export function isPeriodEndInFuture(value: unknown, nowMs = Date.now()) {
  if (!value) return false;
  if (value instanceof Timestamp) return value.toMillis() > nowMs;
  if (typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    try {
      return Number((value as { toMillis: () => number }).toMillis()) > nowMs;
    } catch {
      return false;
    }
  }
  const millis = Number(value);
  return Number.isFinite(millis) && millis > nowMs;
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
    currentPeriodEndAt: normalizePeriodEnd(data.currentPeriodEndAt),
    stripeSyncedAt: data.stripeSyncedAt || null,
    schemaVersion: 1,
  };
}

export function normalizeRetainedSubscriptionRecord(data: Record<string, unknown> | null | undefined): RetainedSubscriptionRecord | null {
  if (!data) return null;
  const email = normalizeEmailKey(data.email);
  const stripeCustomerId = asString(data.stripeCustomerId);
  if (!email || !stripeCustomerId) return null;
  return {
    email,
    stripeCustomerId,
    stripeSubscriptionId: asString(data.stripeSubscriptionId),
    stripePriceId: asString(data.stripePriceId),
    stripeSubscriptionStatus: asString(data.stripeSubscriptionStatus),
    currentPeriodEndAt: normalizePeriodEnd(data.currentPeriodEndAt),
    plan: "pro",
    sourceUid: asString(data.sourceUid),
    retainedAt: data.retainedAt || null,
    updatedAt: data.updatedAt || null,
    schemaVersion: 1,
  };
}

export function hasRetainedSubscriptionEntitlement(record: RetainedSubscriptionRecord | null | undefined, nowMs = Date.now()) {
  if (!record) return false;
  return isActiveSubscriptionStatus(record.stripeSubscriptionStatus) && isPeriodEndInFuture(record.currentPeriodEndAt, nowMs);
}

export function buildUserSubscriptionWriteData(
  input: UpsertUserSubscriptionInput,
  existingCreatedAt: unknown,
  syncedAt: Timestamp = Timestamp.now()
) {
  const row: Record<string, unknown> = {
    schemaVersion: 1,
    stripeSyncedAt: syncedAt,
    createdAt: existingCreatedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const customerId = asString(input.customerId);
  const subscriptionId = asString(input.subscriptionId);
  const priceId = asString(input.priceId);
  const status = asString(input.status);
  const currentPeriodEndAt = normalizePeriodEnd(input.currentPeriodEndAt);

  if (customerId) row.stripeCustomerId = customerId;
  if (subscriptionId) row.stripeSubscriptionId = subscriptionId;
  if (priceId) row.stripePriceId = priceId;
  if (status) row.stripeSubscriptionStatus = status;
  if (currentPeriodEndAt) row.currentPeriodEndAt = currentPeriodEndAt;

  return row;
}

export function buildRetainedSubscriptionWriteData(
  input: UpsertRetainedSubscriptionInput,
  existingCreatedAt: unknown,
  syncedAt: Timestamp = Timestamp.now()
) {
  const email = normalizeEmailKey(input.email);
  const customerId = asString(input.customerId);
  if (!email || !customerId) return null;

  const subscriptionId = asString(input.subscriptionId);
  const priceId = asString(input.priceId);
  const status = asString(input.status);
  const currentPeriodEndAt = normalizePeriodEnd(input.currentPeriodEndAt);
  const sourceUid = asString(input.sourceUid);

  const row: Record<string, unknown> = {
    schemaVersion: 1,
    email,
    stripeCustomerId: customerId,
    plan: "pro",
    retainedAt: existingCreatedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    stripeSyncedAt: syncedAt,
  };

  if (subscriptionId) row.stripeSubscriptionId = subscriptionId;
  if (priceId) row.stripePriceId = priceId;
  if (status) row.stripeSubscriptionStatus = status;
  if (currentPeriodEndAt) row.currentPeriodEndAt = currentPeriodEndAt;
  if (sourceUid) row.sourceUid = sourceUid;

  return row;
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

export async function loadRetainedSubscriptionByEmail(email: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedEmail = normalizeEmailKey(email);
  if (!normalizedEmail) return null;
  const snap = await db.collection("retainedSubscriptions").doc(normalizedEmail).get();
  return normalizeRetainedSubscriptionRecord(snap.exists ? snap.data() : null);
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

export async function findRetainedSubscriptionByStripeCustomerId(customerId: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedCustomerId = asString(customerId);
  if (!normalizedCustomerId) return null;
  const snap = await db
    .collection("retainedSubscriptions")
    .where("stripeCustomerId", "==", normalizedCustomerId)
    .limit(1)
    .get();
  return snap.empty ? null : normalizeRetainedSubscriptionRecord(snap.docs[0]?.data() as Record<string, unknown>);
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
}

export async function upsertRetainedSubscription(input: UpsertRetainedSubscriptionInput, db: Firestore = getFirebaseAdminDb()) {
  const normalizedEmail = normalizeEmailKey(input.email);
  const customerId = asString(input.customerId);
  if (!normalizedEmail || !customerId) return;
  const ref = db.collection("retainedSubscriptions").doc(normalizedEmail);
  const snap = await ref.get();
  const row = buildRetainedSubscriptionWriteData(input, snap.exists ? snap.get("retainedAt") : null);
  if (!row) return;
  await ref.set(row, { merge: true });
}

export async function deleteRetainedSubscriptionByEmail(email: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedEmail = normalizeEmailKey(email);
  if (!normalizedEmail) return;
  await db.collection("retainedSubscriptions").doc(normalizedEmail).delete();
}
