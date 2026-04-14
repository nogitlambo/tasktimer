import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export class ApiRateLimitError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.name = "ApiRateLimitError";
    this.code = code;
    this.status = status;
  }
}

function rateLimitDocKey(namespace: string, uid: string) {
  return `${asString(namespace, 80)}__${asString(uid, 120)}`;
}

function normalizeEventTimes(value: unknown, nowMs: number, windowMs: number) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((entry) => Math.floor(Number(entry || 0)))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && nowMs - entry < windowMs);
}

export async function enforceUidRateLimit(input: {
  namespace: string;
  uid: string;
  windowMs: number;
  maxEvents: number;
  code: string;
  message: string;
}) {
  const namespace = asString(input.namespace, 80);
  const uid = asString(input.uid, 120);
  if (!namespace || !uid) {
    throw new ApiRateLimitError(input.code, input.message);
  }

  const db = getFirebaseAdminDb();
  const nowMs = Date.now();
  const ref = db.collection("api_rate_limits").doc(rateLimitDocKey(namespace, uid));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const eventTimes = normalizeEventTimes(snap.get("events"), nowMs, input.windowMs);
    if (eventTimes.length >= input.maxEvents) {
      throw new ApiRateLimitError(input.code, input.message);
    }
    eventTimes.push(nowMs);
    tx.set(
      ref,
      {
        namespace,
        uid,
        schemaVersion: 1,
        events: eventTimes.slice(-input.maxEvents),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}
