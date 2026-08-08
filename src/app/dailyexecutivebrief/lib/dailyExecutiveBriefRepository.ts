import { createHash } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { DailyExecutiveBriefSnapshotSchema, type DailyExecutiveBriefSnapshot } from "./dailyExecutiveBriefContract";
import { DailyExecutiveBriefAvailabilitySchema, type DailyExecutiveBriefPlanningInput, type DailyExecutiveBriefTask } from "./dailyExecutiveBriefPlanning";

type RawRow = Record<string, unknown>;

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function positiveMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}

function completedMinutesFromTask(row: RawRow) {
  const explicit = Math.max(0, Math.floor(Number(row.completedMinutes) || 0));
  const accumulated = Math.max(0, Math.floor(Number(row.accumulatedMs) / 60_000 || 0));
  return Math.min(1440, Math.max(explicit, accumulated));
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return Number((value as { toMillis: () => number }).toMillis()) || 0;
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
}

function mapTask(id: string, row: RawRow): DailyExecutiveBriefTask {
  const dueDate = asString(row.onceOffTargetDate, 10);
  return {
    id: asString(row.id, 160) || id,
    estimatedMinutes: positiveMinutes(row.timeGoalMinutes),
    completedMinutes: completedMinutesFromTask(row),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    priority: row.priority === "urgent" || row.priority === "high" || row.priority === "medium" || row.priority === "low" ? row.priority : undefined,
    hardDeadline: row.hardDeadline === true,
    flexible: row.plannedStartOpenEnded === true || !row.plannedStartTime,
    pinned: row.pinned === true,
    inProgress: row.running === true,
    requiresClarification: row.requiresClarification === true,
    blocksImportantWork: row.blocksImportantWork === true,
  };
}

function stableValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return asMillis(value);
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as RawRow).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
}

function buildSourceVersion(tasks: RawRow[], preferences: RawRow | null) {
  return createHash("sha256").update(JSON.stringify(stableValue({ tasks, preferences }))).digest("hex");
}

function snapshotFromFirestore(row: RawRow): DailyExecutiveBriefSnapshot | null {
  const toIso = (value: unknown) => {
    const millis = asMillis(value);
    return millis > 0 ? new Date(millis).toISOString() : String(value || "");
  };
  const parsed = DailyExecutiveBriefSnapshotSchema.safeParse({
    ...row,
    generatedAt: toIso(row.generatedAt),
    expiresAt: toIso(row.expiresAt),
  });
  return parsed.success ? parsed.data : null;
}

export type DailyExecutiveBriefSourceContext = Pick<DailyExecutiveBriefPlanningInput, "tasks" | "availability"> & { sourceVersion: string };

export interface DailyExecutiveBriefRepository {
  loadSourceContext(uid: string): Promise<DailyExecutiveBriefSourceContext>;
  loadBrief(uid: string, date: string): Promise<DailyExecutiveBriefSnapshot | null>;
  saveBrief(uid: string, snapshot: DailyExecutiveBriefSnapshot): Promise<void>;
  dismissAdjustment(input: { uid: string; date: string; adjustmentId: string; nowMs: number }): Promise<"dismissed" | "idempotent" | "not-found" | "expired">;
}

export function createFirestoreDailyExecutiveBriefRepository(db: Firestore = getFirebaseAdminDb()): DailyExecutiveBriefRepository {
  function userDoc(uid: string) {
    return db.collection("users").doc(uid);
  }

  return {
    async loadSourceContext(uid) {
      const safeUid = asString(uid, 120);
      if (!safeUid) return { tasks: [], availability: DailyExecutiveBriefAvailabilitySchema.parse({}), sourceVersion: buildSourceVersion([], null) };
      const root = userDoc(safeUid);
      const [taskSnapshot, preferenceSnapshot] = await Promise.all([
        root.collection("tasks").get(),
        root.collection("preferences").doc("v1").get(),
      ]);
      const rows = taskSnapshot.docs.map((doc) => doc.data() as RawRow);
      const preferences = preferenceSnapshot.exists ? preferenceSnapshot.data() as RawRow : null;
      const focusWindowPresent = !!(asString(preferences?.optimalProductivityStartTime, 8) && asString(preferences?.optimalProductivityEndTime, 8));
      return {
        tasks: taskSnapshot.docs.map((doc) => mapTask(doc.id, doc.data() as RawRow)),
        availability: DailyExecutiveBriefAvailabilitySchema.parse({ focusWindowPresent }),
        sourceVersion: buildSourceVersion(rows, preferences),
      };
    },
    async loadBrief(uid, date) {
      const safeUid = asString(uid, 120);
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
      if (!safeUid || !safeDate) return null;
      const snapshot = await userDoc(safeUid).collection("dailyBriefs").doc(safeDate).get();
      return snapshot.exists ? snapshotFromFirestore(snapshot.data() as RawRow) : null;
    },
    async saveBrief(uid, snapshot) {
      const safeUid = asString(uid, 120);
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) ? snapshot.date : "";
      if (!safeUid || !safeDate) throw new Error("Daily brief identity is invalid.");
      await userDoc(safeUid).collection("dailyBriefs").doc(safeDate).set({
        ...snapshot,
        generatedAt: Timestamp.fromMillis(Date.parse(snapshot.generatedAt)),
        expiresAt: Timestamp.fromMillis(Date.parse(snapshot.expiresAt)),
        updatedAt: Timestamp.now(),
      });
    },
    async dismissAdjustment({ uid, date, adjustmentId, nowMs }) {
      const safeUid = asString(uid, 120);
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
      const safeAdjustmentId = asString(adjustmentId, 320);
      if (!safeUid || !safeDate || !safeAdjustmentId || safeAdjustmentId.includes("/")) return "not-found";
      const briefRef = userDoc(safeUid).collection("dailyBriefs").doc(safeDate);
      return db.runTransaction(async (transaction) => {
        const briefSnapshot = await transaction.get(briefRef);
        if (!briefSnapshot.exists) return "not-found" as const;
        const current = snapshotFromFirestore(briefSnapshot.data() as RawRow);
        if (!current) return "not-found" as const;
        if (Date.parse(current.expiresAt) <= nowMs) return "expired" as const;
        const adjustment = current.plan.adjustments.find((candidate) => candidate.adjustmentId === safeAdjustmentId);
        if (!adjustment) return "not-found" as const;
        if (adjustment.status === "DISMISSED") return "idempotent" as const;
        const next: DailyExecutiveBriefSnapshot = {
          ...current,
          plan: {
            ...current.plan,
            adjustments: current.plan.adjustments.map((candidate) => candidate.adjustmentId === safeAdjustmentId ? { ...candidate, status: "DISMISSED" as const } : candidate),
          },
        };
        transaction.set(briefRef, {
          ...next,
          generatedAt: Timestamp.fromMillis(Date.parse(next.generatedAt)),
          expiresAt: Timestamp.fromMillis(Date.parse(next.expiresAt)),
          updatedAt: Timestamp.now(),
        });
        return "dismissed" as const;
      });
    },
  };
}
