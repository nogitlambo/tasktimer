import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { AutomationDeadLetterSchema, type AutomationDeadLetter } from "./trustedAutomationDeadLetter";

export const AUTOMATION_DEAD_LETTER_COLLECTION = "automationDeadLetters";

function normalized(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export interface AutomationDeadLetterRepository {
  append(uid: string, item: AutomationDeadLetter): Promise<void>;
  list(uid: string, limit?: number): Promise<AutomationDeadLetter[]>;
}

export function createFirestoreAutomationDeadLetterRepository(db: Firestore = getFirebaseAdminDb()): AutomationDeadLetterRepository {
  function collection(uid: string) {
    return db.collection("users").doc(uid).collection(AUTOMATION_DEAD_LETTER_COLLECTION);
  }

  return {
    async append(uid, item) {
      const safeUid = normalized(uid, 120);
      const parsed = AutomationDeadLetterSchema.parse(item);
      if (!safeUid || parsed.userId !== safeUid) throw Object.assign(new Error("Automation dead-letter ownership mismatch."), { code: "automation/ownership" });
      await collection(safeUid).doc(parsed.id).create({ ...parsed, failedAt: Timestamp.fromMillis(Date.parse(parsed.failedAt)) });
    },
    async list(uid, limit = 20) {
      const safeUid = normalized(uid, 120);
      if (!safeUid) return [];
      const snapshot = await collection(safeUid).orderBy("failedAt", "desc").limit(Math.min(50, Math.max(1, Math.floor(limit)))).get();
      return snapshot.docs.map((doc) => AutomationDeadLetterSchema.safeParse({ ...doc.data(), failedAt: doc.data().failedAt?.toDate?.()?.toISOString?.() || doc.data().failedAt }).success
        ? AutomationDeadLetterSchema.parse({ ...doc.data(), failedAt: doc.data().failedAt?.toDate?.()?.toISOString?.() || doc.data().failedAt })
        : null).filter((item): item is AutomationDeadLetter => !!item);
    },
  };
}
