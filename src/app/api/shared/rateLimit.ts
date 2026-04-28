import { createHash } from "node:crypto";
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

type RateLimitActorType = "uid" | "public";

function hashActorKey(actorType: RateLimitActorType, actorKey: string) {
  return createHash("sha256")
    .update(`${actorType}:${actorKey}`)
    .digest("hex");
}

function rateLimitDocKey(namespace: string, actorType: RateLimitActorType, actorKeyHash: string) {
  return `${asString(namespace, 80)}__${actorType}__${asString(actorKeyHash, 128)}`;
}

function normalizeEventTimes(value: unknown, nowMs: number, windowMs: number) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((entry) => Math.floor(Number(entry || 0)))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && nowMs - entry < windowMs);
}

export function extractClientIp(req: Request) {
  const forwardedFor = asString(req.headers.get("x-forwarded-for"), 1000);
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    const candidate = asString(first, 240);
    if (candidate) return candidate;
  }
  const realIp = asString(req.headers.get("x-real-ip"), 240);
  if (realIp) return realIp;
  const cloudflareIp = asString(req.headers.get("cf-connecting-ip"), 240);
  if (cloudflareIp) return cloudflareIp;
  return "unknown";
}

export function buildPublicRateLimitActorKey(input: { ip: string; secondaryKey?: string | null }) {
  const ip = asString(input.ip, 240) || "unknown";
  const secondaryKey = asString(input.secondaryKey ?? "", 1000);
  return secondaryKey ? `${ip}::${secondaryKey}` : ip;
}

async function enforceRateLimit(input: {
  namespace: string;
  actorType: RateLimitActorType;
  actorKey: string;
  uid?: string;
  windowMs: number;
  maxEvents: number;
  code: string;
  message: string;
}) {
  const namespace = asString(input.namespace, 80);
  const actorType = input.actorType;
  const actorKey = asString(input.actorKey, 1000);
  const uid = actorType === "uid" ? asString(input.uid ?? input.actorKey, 120) : "";
  if (!namespace || !actorKey || (actorType === "uid" && !uid)) {
    throw new ApiRateLimitError(input.code, input.message);
  }

  const db = getFirebaseAdminDb();
  const nowMs = Date.now();
  const actorKeyHash = hashActorKey(actorType, actorKey);
  const ref = db.collection("api_rate_limits").doc(rateLimitDocKey(namespace, actorType, actorKeyHash));

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
        actorType,
        actorKeyHash,
        uid: uid || null,
        schemaVersion: 1,
        events: eventTimes.slice(-input.maxEvents),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function enforceUidRateLimit(input: {
  namespace: string;
  uid: string;
  windowMs: number;
  maxEvents: number;
  code: string;
  message: string;
}) {
  return enforceRateLimit({
    ...input,
    actorType: "uid",
    actorKey: input.uid,
  });
}

export async function enforcePublicRateLimit(input: {
  namespace: string;
  actorKey: string;
  windowMs: number;
  maxEvents: number;
  code: string;
  message: string;
}) {
  return enforceRateLimit({
    ...input,
    actorType: "public",
  });
}
