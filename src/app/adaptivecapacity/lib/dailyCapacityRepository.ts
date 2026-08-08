import { createHash } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

import { calculateRemainingFocusWindowMinutes } from "./capacityAvailability";
import { aggregateCapacityHistory, CapacityHistoryFeaturesSchema, type CapacityHistoryFeatures } from "./capacityHistory";
import { DailyCapacitySnapshotSchema, type DailyCapacitySnapshot } from "./dailyCapacityContract";

type RawRow = Record<string, unknown>;

function safeString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return Number((value as { toMillis: () => number }).toMillis()) || 0;
  }
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric < 1e12 ? Math.floor(numeric * 1000) : Math.floor(numeric);
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function snapshotFromFirestore(row: RawRow): DailyCapacitySnapshot | null {
  const toIso = (value: unknown) => {
    const millis = asMillis(value);
    return millis > 0 ? new Date(millis).toISOString() : String(value || "");
  };
  const parsed = DailyCapacitySnapshotSchema.safeParse({
    ...row,
    generatedAt: toIso(row.generatedAt),
    expiresAt: toIso(row.expiresAt),
  });
  return parsed.success ? parsed.data : null;
}

function historyFeaturesFromFirestore(row: RawRow): CapacityHistoryFeatures | null {
  const calculatedAtMs = asMillis(row.calculatedAt);
  const parsed = CapacityHistoryFeaturesSchema.safeParse({
    ...row,
    calculatedAt: calculatedAtMs > 0 ? new Date(calculatedAtMs).toISOString() : row.calculatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function stableSourceVersion(rows: Array<{ timestampMs: number; minutes: number }>, preferences: RawRow | null = null, focusWindowRemainingMinutes: number | null = null) {
  return createHash("sha256").update(JSON.stringify({
    rows: rows.sort((a, b) => a.timestampMs - b.timestampMs),
    preferences: preferences ? {
      optimalProductivityStartTime: safeString(preferences.optimalProductivityStartTime, 8),
      optimalProductivityEndTime: safeString(preferences.optimalProductivityEndTime, 8),
      optimalProductivityDays: Array.isArray(preferences.optimalProductivityDays) ? preferences.optimalProductivityDays.map((day) => safeString(day, 8)).sort() : [],
    } : null,
    focusWindowRemainingMinutes,
  })).digest("hex");
}

export type DailyCapacitySourceContext = {
  completedMinutesToday: number;
  availableMinutesCeiling: number | null;
  sourceVersion: string;
  historyFeatures?: CapacityHistoryFeatures | null;
};

export interface DailyCapacityRepository {
  loadSourceContext(input: { uid: string; localDate: string; timezone: string; nowMs?: number }): Promise<DailyCapacitySourceContext>;
  loadSnapshot(uid: string, localDate: string): Promise<DailyCapacitySnapshot | null>;
  saveSnapshot(snapshot: DailyCapacitySnapshot): Promise<void>;
}

export function createFirestoreDailyCapacityRepository(db: Firestore = getFirebaseAdminDb()): DailyCapacityRepository {
  function userDoc(uid: string) {
    return db.collection("users").doc(uid);
  }

  return {
    async loadSourceContext({ uid, localDate, timezone, nowMs = Date.now() }) {
      const safeUid = safeString(uid, 120);
      const normalizedDate = normalizeDate(localDate);
      if (!safeUid || !normalizedDate) return { completedMinutesToday: 0, availableMinutesCeiling: null, sourceVersion: stableSourceVersion([]), historyFeatures: null };
      const historyRef = userDoc(safeUid).collection("historyEntries");
      const aggregateRef = userDoc(safeUid).collection("behaviourFeatures").doc("capacity");
      const preferencesRef = userDoc(safeUid).collection("preferences").doc("v1");
      const [historySnapshot, aggregateSnapshot, preferencesSnapshot] = await Promise.all([historyRef.get(), aggregateRef.get(), preferencesRef.get()]);
      const rows = historySnapshot.docs.map((doc) => doc.data() as RawRow).map((row) => ({
        timestampMs: asMillis(row.finishedAtMs) || asMillis(row.ts),
        minutes: Math.max(0, Math.floor(Number(row.ms) / 60_000 || 0)),
      })).filter((row) => row.timestampMs > 0);
      const todayRows = rows.filter((row) => localDateForRecommendationTimezone(timezone, row.timestampMs) === normalizedDate);
      const daysByDate = new Map<string, { date: string; sessionCount: number; completedMinutes: number }>();
      rows.forEach((row) => {
        const date = localDateForRecommendationTimezone(timezone, row.timestampMs);
        if (date === normalizedDate) return;
        const existing = daysByDate.get(date) || { date, sessionCount: 0, completedMinutes: 0 };
        existing.sessionCount += 1;
        existing.completedMinutes += row.minutes;
        daysByDate.set(date, existing);
      });
      const calculatedFeatures = aggregateCapacityHistory(Array.from(daysByDate.values()), { calculatedAtMs: Date.now() });
      const storedFeatures = aggregateSnapshot.exists ? historyFeaturesFromFirestore(aggregateSnapshot.data() as RawRow) : null;
      const historyFeatures = storedFeatures?.sourceVersion === calculatedFeatures.sourceVersion ? storedFeatures : calculatedFeatures;
      if (!storedFeatures || storedFeatures.sourceVersion !== calculatedFeatures.sourceVersion) {
        await aggregateRef.set(calculatedFeatures);
      }
      const preferences = preferencesSnapshot.exists ? preferencesSnapshot.data() as RawRow : null;
      const focusWindowRemainingMinutes = preferences
        ? calculateRemainingFocusWindowMinutes({
            nowMs,
            timezone,
            startTime: safeString(preferences.optimalProductivityStartTime, 8),
            endTime: safeString(preferences.optimalProductivityEndTime, 8),
            days: Array.isArray(preferences.optimalProductivityDays) ? preferences.optimalProductivityDays.map((day) => safeString(day, 8)) : [],
          })
        : null;
      return {
        completedMinutesToday: todayRows.reduce((sum, row) => sum + row.minutes, 0),
        availableMinutesCeiling: focusWindowRemainingMinutes,
        sourceVersion: stableSourceVersion(rows, preferences, focusWindowRemainingMinutes),
        historyFeatures,
      };
    },
    async loadSnapshot(uid, localDate) {
      const safeUid = safeString(uid, 120);
      const normalizedDate = normalizeDate(localDate);
      if (!safeUid || !normalizedDate) return null;
      const snapshot = await userDoc(safeUid).collection("dailyCapacity").doc(normalizedDate).get();
      return snapshot.exists ? snapshotFromFirestore(snapshot.data() as RawRow) : null;
    },
    async saveSnapshot(snapshot) {
      const safeUid = safeString(snapshot.userId, 120);
      const normalizedDate = normalizeDate(snapshot.localDate);
      if (!safeUid || !normalizedDate) throw new Error("Daily capacity identity is invalid.");
      await userDoc(safeUid).collection("dailyCapacity").doc(normalizedDate).set({
        ...snapshot,
        generatedAt: Timestamp.fromMillis(Date.parse(snapshot.generatedAt)),
        expiresAt: Timestamp.fromMillis(Date.parse(snapshot.expiresAt)),
        updatedAt: Timestamp.now(),
      });
    },
  };
}
