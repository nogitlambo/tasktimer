import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import {
  AutomationHistoryOutcomeSchema,
  AutomationHistorySchema,
  type AutomationHistory,
} from "./trustedAutomationPersistence";

export const AUTOMATION_HISTORY_COLLECTION = "automationHistory";
export const AUTOMATION_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function normalizedUid(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function normalizedHistoryId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return Number((value as { toMillis: () => number }).toMillis());
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return Number.NaN;
}

function toIso(value: unknown) {
  const millis = asMillis(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
}

export function buildAutomationHistoryFirestoreRecord(history: AutomationHistory) {
  return {
    ...history,
    createdAt: Timestamp.fromMillis(Date.parse(history.createdAt)),
    retentionExpiresAt: Timestamp.fromMillis(Date.parse(history.retentionExpiresAt)),
  };
}

export function parseAutomationHistoryRecord(value: unknown): AutomationHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const parsed = AutomationHistorySchema.safeParse({
    ...raw,
    createdAt: toIso(raw.createdAt),
    retentionExpiresAt: toIso(raw.retentionExpiresAt),
  });
  return parsed.success ? parsed.data : null;
}

export interface AutomationHistoryRepository {
  append(uid: string, history: AutomationHistory): Promise<void>;
  get(uid: string, historyId: string): Promise<AutomationHistory | null>;
  list(uid: string, input?: { limit?: number; cursor?: string; outcome?: AutomationHistory["outcome"] }): Promise<{ items: AutomationHistory[]; nextCursor: string | null }>;
}

export function createFirestoreAutomationHistoryRepository(db: Firestore = getFirebaseAdminDb()): AutomationHistoryRepository {
  function historyRef(uid: string, historyId: string) {
    return db.collection("users").doc(uid).collection(AUTOMATION_HISTORY_COLLECTION).doc(historyId);
  }

  return {
    async append(uid, history) {
      const safeUid = normalizedUid(uid);
      if (!safeUid || history.userId !== safeUid || !normalizedHistoryId(history.id)) {
        throw Object.assign(new Error("Automation history ownership mismatch."), { code: "automation/ownership" });
      }
      const parsed = AutomationHistorySchema.parse(history);
      await historyRef(safeUid, parsed.id).create(buildAutomationHistoryFirestoreRecord(parsed));
    },
    async get(uid, historyId) {
      const safeUid = normalizedUid(uid);
      const safeHistoryId = normalizedHistoryId(historyId);
      if (!safeUid || !safeHistoryId) return null;
      const snapshot = await historyRef(safeUid, safeHistoryId).get();
      return snapshot.exists ? parseAutomationHistoryRecord(snapshot.data()) : null;
    },
    async list(uid, input = {}) {
      const safeUid = normalizedUid(uid);
      if (!safeUid) return { items: [], nextCursor: null };
      const limit = Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 20)));
      let query = db.collection("users").doc(safeUid).collection(AUTOMATION_HISTORY_COLLECTION) as unknown as {
        where: (field: string, operator: "==", value: string) => unknown;
        orderBy: (field: string, direction: "desc") => unknown;
        startAfter: (cursor: string) => unknown;
        limit: (value: number) => unknown;
        get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
      };
      if (input.outcome && AutomationHistoryOutcomeSchema.safeParse(input.outcome).success) {
        query = query.where("outcome", "==", input.outcome) as typeof query;
      }
      query = query.orderBy("createdAt", "desc") as typeof query;
      if (input.cursor) query = query.startAfter(input.cursor.slice(0, 180)) as typeof query;
      query = query.limit(limit + 1) as typeof query;
      const snapshot = await query.get();
      const hasMore = snapshot.docs.length > limit;
      const page = snapshot.docs.slice(0, limit).map((doc) => parseAutomationHistoryRecord(doc.data())).filter((entry): entry is AutomationHistory => !!entry);
      return { items: page, nextCursor: hasMore ? snapshot.docs[limit - 1]?.id || null : null };
    },
  };
}
