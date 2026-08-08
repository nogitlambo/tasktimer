import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import type { BrainDumpReviewSession, BrainDumpSessionStore } from "./brainDumpProcessing";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function stripUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefinedValues) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => typeof entryValue !== "undefined")
      .map(([key, entryValue]) => [key, stripUndefinedValues(entryValue)])
  ) as T;
}

export function createFirestoreBrainDumpSessionStore(): BrainDumpSessionStore {
  const db = getFirebaseAdminDb();

  function sessionDoc(uid: string, sessionId: string) {
    return db.collection("users").doc(uid).collection("brainDumpSessions").doc(sessionId);
  }

  return {
    async saveSession(session: BrainDumpReviewSession) {
      await sessionDoc(session.ownerUid, session.id).set(
        stripUndefinedValues({
          ...session,
          schemaVersion: 1,
          ttlExpiresAt: session.state === "review" ? new Date(session.expiresAtMs) : null,
        }),
        { merge: false }
      );
    },
    async getSession(uid: string, sessionId: string) {
      const safeUid = asString(uid, 120);
      const safeSessionId = asString(sessionId, 120);
      if (!safeUid || !safeSessionId) return null;
      const snap = await sessionDoc(safeUid, safeSessionId).get();
      if (!snap.exists) return null;
      const data = snap.data() as BrainDumpReviewSession | undefined;
      if (!data || data.ownerUid !== safeUid || data.id !== safeSessionId) return null;
      if (data.state !== "review" && data.state !== "completed" && data.state !== "expired") return null;
      return data;
    },
  };
}
