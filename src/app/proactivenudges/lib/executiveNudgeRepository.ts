import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import {
  ExecutiveNudgeDeliverySchema,
  ExecutiveNudgePreferencesSchema,
  createDefaultExecutiveNudgePreferences,
  type ExecutiveNudgeDelivery,
  type ExecutiveNudgeDeliveryInput,
  type ExecutiveNudgePreferences,
} from "./executiveNudgeContract";

type RawRow = Record<string, unknown>;

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return Number((value as { toMillis: () => number }).toMillis()) || 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return 0;
}

function toIso(value: unknown) {
  const millis = asMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : "";
}

function preferencesFromFirestore(value: RawRow, uid: string): ExecutiveNudgePreferences | null {
  const parsed = ExecutiveNudgePreferencesSchema.safeParse({
    ...value,
    userId: asString(value.userId, 120) || uid,
    createdAt: toIso(value.createdAt),
    updatedAt: toIso(value.updatedAt),
  });
  return parsed.success && parsed.data.userId === uid ? parsed.data : null;
}

function preferencesToFirestore(preferences: ExecutiveNudgePreferences) {
  return {
    ...preferences,
    createdAt: Timestamp.fromMillis(Date.parse(preferences.createdAt)),
    updatedAt: Timestamp.fromMillis(Date.parse(preferences.updatedAt)),
  };
}

function deliveryToFirestore(delivery: ExecutiveNudgeDelivery) {
  return {
    ...delivery,
    createdAt: Timestamp.fromMillis(Date.parse(delivery.createdAt)),
    deliveredAt: delivery.deliveredAt ? Timestamp.fromMillis(Date.parse(delivery.deliveredAt)) : null,
    openedAt: delivery.openedAt ? Timestamp.fromMillis(Date.parse(delivery.openedAt)) : null,
    actionedAt: delivery.actionedAt ? Timestamp.fromMillis(Date.parse(delivery.actionedAt)) : null,
    dismissedAt: delivery.dismissedAt ? Timestamp.fromMillis(Date.parse(delivery.dismissedAt)) : null,
    expiredAt: delivery.expiredAt ? Timestamp.fromMillis(Date.parse(delivery.expiredAt)) : null,
  };
}

export interface ExecutiveNudgeRepository {
  loadOrCreatePreferences(uid: string): Promise<ExecutiveNudgePreferences>;
  savePreferences(uid: string, preferences: ExecutiveNudgePreferences): Promise<void>;
  saveDelivery(uid: string, delivery: ExecutiveNudgeDeliveryInput): Promise<void>;
}

export function createFirestoreExecutiveNudgeRepository(
  db: Firestore = getFirebaseAdminDb(),
  now: () => number = Date.now,
): ExecutiveNudgeRepository {
  function preferencesRef(uid: string) {
    return db.collection("users").doc(uid).collection("nudgePreferences").doc("current");
  }

  function requireUid(value: string) {
    const uid = asString(value, 120);
    if (!uid || uid.includes("/")) {
      throw Object.assign(new Error("Executive Nudge ownership is invalid."), { code: "executive-nudge/ownership" });
    }
    return uid;
  }

  return {
    async loadOrCreatePreferences(uid) {
      const safeUid = requireUid(uid);
      const ref = preferencesRef(safeUid);
      const snapshot = await ref.get();
      const parsed = snapshot.exists ? preferencesFromFirestore(snapshot.data() as RawRow, safeUid) : null;
      if (parsed) return parsed;
      const preferences = createDefaultExecutiveNudgePreferences(safeUid, now());
      await ref.set(preferencesToFirestore(preferences));
      return preferences;
    },

    async savePreferences(uid, preferences) {
      const safeUid = requireUid(uid);
      const parsed = ExecutiveNudgePreferencesSchema.safeParse(preferences);
      if (!parsed.success || parsed.data.userId !== safeUid) {
        throw Object.assign(new Error("Executive Nudge preference ownership is invalid."), { code: "executive-nudge/ownership" });
      }
      await preferencesRef(safeUid).set(preferencesToFirestore(parsed.data));
    },

    async saveDelivery(uid, delivery) {
      const safeUid = requireUid(uid);
      const parsed = ExecutiveNudgeDeliverySchema.safeParse(delivery);
      if (!parsed.success || parsed.data.userId !== safeUid) {
        throw Object.assign(new Error("Executive Nudge delivery ownership is invalid."), { code: "executive-nudge/ownership" });
      }

      await db
        .collection("users")
        .doc(safeUid)
        .collection("nudgeDeliveries")
        .doc(parsed.data.id)
        .set(deliveryToFirestore(parsed.data));
    },
  };
}
