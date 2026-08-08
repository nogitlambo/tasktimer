import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { RecoverySessionSchema, type RecoverySession, type RecoverySessionStatus } from "./recoveryContract";

type RawRow = Record<string, unknown>;

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) ? Math.floor(millis) : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return 0;
}

function toIso(value: unknown) {
  const millis = asMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : String(value || "");
}

export function buildRecoverySessionFirestoreRecord(session: RecoverySession) {
  return {
    ...session,
    createdAt: Timestamp.fromMillis(Date.parse(session.createdAt)),
    expiresAt: Timestamp.fromMillis(Date.parse(session.expiresAt)),
    completedAt: session.completedAt ? Timestamp.fromMillis(Date.parse(session.completedAt)) : null,
  };
}

export function parseRecoverySessionRecord(value: unknown): RecoverySession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawRow;
  const sessionData = { ...raw };
  delete sessionData.updatedAt;
  const parsed = RecoverySessionSchema.safeParse({
    ...sessionData,
    createdAt: toIso(raw.createdAt),
    expiresAt: toIso(raw.expiresAt),
    completedAt: raw.completedAt == null ? null : toIso(raw.completedAt),
  });
  return parsed.success ? parsed.data : null;
}

export type RecoverySessionRepository = {
  loadSession(uid: string, recoveryId: string): Promise<RecoverySession | null>;
  saveSession(uid: string, session: RecoverySession): Promise<void>;
  dismissSession(uid: string, recoveryId: string, nowMs: number): Promise<RecoverySession | null>;
  completeSession(uid: string, recoveryId: string, nowMs: number): Promise<RecoverySession | null>;
};

export function createFirestoreRecoverySessionRepository(db: Firestore = getFirebaseAdminDb()): RecoverySessionRepository {
  function sessionRef(uid: string, recoveryId: string) {
    return db.collection("users").doc(uid).collection("recoverySessions").doc(recoveryId);
  }

  async function updateStatus(repository: RecoverySessionRepository, uid: string, recoveryId: string, status: Extract<RecoverySessionStatus, "DISMISSED" | "COMPLETED">, nowMs: number) {
    const safeUid = asString(uid, 120);
    const safeRecoveryId = asString(recoveryId, 180);
    if (!safeUid || !safeRecoveryId) return null;
    const existing = await repository.loadSession(safeUid, safeRecoveryId);
    if (!existing || existing.userId !== safeUid) return null;
    if (Date.parse(existing.expiresAt) <= nowMs && existing.status === "ACTIVE") {
      const expired = { ...existing, status: "EXPIRED" as const };
      await repository.saveSession(safeUid, expired);
      return expired;
    }
    if (existing.status === status) return existing;
    if (existing.status !== "ACTIVE" && existing.status !== "PARTIALLY_APPLIED") return existing;
    const updated = {
      ...existing,
      status,
      ...(status === "COMPLETED" ? { completedAt: new Date(nowMs).toISOString() } : {}),
    };
    await repository.saveSession(safeUid, updated);
    return updated;
  }

  const repository: RecoverySessionRepository = {
    async loadSession(uid, recoveryId) {
      const safeUid = asString(uid, 120);
      const safeRecoveryId = asString(recoveryId, 180);
      if (!safeUid || !safeRecoveryId) return null;
      const snapshot = await sessionRef(safeUid, safeRecoveryId).get();
      return snapshot.exists ? parseRecoverySessionRecord(snapshot.data()) : null;
    },
    async saveSession(uid, session) {
      const safeUid = asString(uid, 120);
      if (!safeUid || session.userId !== safeUid) throw new Error("Recovery session ownership mismatch.");
      const parsed = RecoverySessionSchema.parse(session);
      await sessionRef(safeUid, parsed.id).set(buildRecoverySessionFirestoreRecord(parsed));
    },
    async dismissSession(uid, recoveryId, nowMs) {
      return updateStatus(repository, uid, recoveryId, "DISMISSED", nowMs);
    },
    async completeSession(uid, recoveryId, nowMs) {
      return updateStatus(repository, uid, recoveryId, "COMPLETED", nowMs);
    },
  };
  return repository;
}
