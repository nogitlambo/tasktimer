import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import type { BrainDumpReviewSession, BrainDumpSessionStore } from "./brainDumpProcessing";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export function createFirestoreBrainDumpSessionStore(): BrainDumpSessionStore {
  const db = getFirebaseAdminDb();

  function sessionDoc(uid: string, sessionId: string) {
    return db.collection("users").doc(uid).collection("brainDumpSessions").doc(sessionId);
  }

  return {
    async saveSession(session: BrainDumpReviewSession) {
      await sessionDoc(session.ownerUid, session.id).set(
        {
          ...session,
          schemaVersion: 1,
        },
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
      if (!data || data.ownerUid !== safeUid || data.id !== safeSessionId || data.state !== "review") return null;
      return data;
    },
  };
}
