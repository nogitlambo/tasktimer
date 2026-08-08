import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export const RECOVERY_MEANINGFUL_ACTIVITY_MINUTES = 5;
export const RECOVERY_MISSED_SCHEDULE_LOOKBACK_DAYS = 30;
export const RECOVERY_RECENT_SIGNAL_WINDOW_DAYS = 30;

type RawRow = Record<string, unknown>;

export type RecoveryEligibilityTaskSource = RawRow & { id?: string };
export type RecoveryEligibilityHistorySource = RawRow;
export type RecoveryEligibilityScheduleRepairSource = RawRow;

export type RecoveryEligibilitySource = {
  inactiveLocalDays: number;
  actionableBacklogCount: number;
  overdueCount: number;
  missedScheduledDays: number;
  repeatedPlanOverloadCount: number;
  repeatedRepairDismissalCount: number;
  backlogEstimatedMinutes: number;
  lastDismissedAtMs: number | null;
};

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) && millis > 0 ? Math.floor(millis) : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function asDate(value: unknown) {
  const date = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function dateOffset(localDate: string, days: number) {
  const timestamp = Date.parse(`${localDate}T12:00:00.000Z`);
  return Number.isFinite(timestamp)
    ? new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : localDate;
}

function dateDifference(laterDate: string, earlierDate: string) {
  const later = Date.parse(`${laterDate}T00:00:00.000Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00.000Z`);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0;
  return Math.max(0, Math.floor((later - earlier) / (24 * 60 * 60 * 1000)));
}

function taskIsActive(task: RecoveryEligibilityTaskSource) {
  return task.active !== false && task.completed !== true && task.status !== "inactive" && task.status !== "completed" && task.actionable !== false;
}

function taskDueDate(task: RecoveryEligibilityTaskSource) {
  return asDate(task.onceOffTargetDate) || asDate(task.dueDate) || "";
}

function taskIsCarriedOver(task: RecoveryEligibilityTaskSource, localDate: string) {
  const targetDate = taskDueDate(task);
  const pendingSince = asDate(task.resumePendingSinceDayKey);
  return task.carriedOver === true || (targetDate !== "" && targetDate < localDate) || (pendingSince !== "" && pendingSince < localDate);
}

function taskEstimatedMinutes(task: RecoveryEligibilityTaskSource) {
  const direct = Math.floor(Number(task.estimatedMinutes ?? task.timeGoalMinutes));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const value = Math.floor(Number(task.timeGoalValue));
  if (Number.isFinite(value) && value > 0) return task.timeGoalUnit === "hour" ? value * 60 : value;
  return 0;
}

function historyTimestamp(row: RecoveryEligibilityHistorySource) {
  return asMillis(row.finishedAtMs) || asMillis(row.ts) || asMillis(row.startedAtMs);
}

function historyMinutes(row: RecoveryEligibilityHistorySource) {
  return Math.max(0, Math.floor(Number(row.ms) / 60_000 || 0));
}

function isMeaningfulHistory(row: RecoveryEligibilityHistorySource) {
  return historyMinutes(row) >= RECOVERY_MEANINGFUL_ACTIVITY_MINUTES;
}

function scheduleDayKey(localDate: string) {
  const weekday = new Date(`${localDate}T12:00:00.000Z`).getUTCDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekday];
}

function isRecentSignal(row: RawRow, localDate: string) {
  const timestamp = asMillis(row.createdAt) || asMillis(row.createdAtMs) || asMillis(row.updatedAt) || asMillis(row.updatedAtMs);
  if (!timestamp) return true;
  const signalDate = new Date(timestamp).toISOString().slice(0, 10);
  return dateDifference(localDate, signalDate) <= RECOVERY_RECENT_SIGNAL_WINDOW_DAYS;
}

export function summarizeRecoveryEligibilitySource(input: {
  localDate: string;
  timezone: string;
  nowMs: number;
  tasks: RecoveryEligibilityTaskSource[];
  historyEntries: RecoveryEligibilityHistorySource[];
  scheduleRepairs: RecoveryEligibilityScheduleRepairSource[];
  lastDismissedAtMs?: number | null;
}): RecoveryEligibilitySource {
  const activeTasks = input.tasks.filter(taskIsActive);
  const backlogTasks = activeTasks.filter((task) => taskIsCarriedOver(task, input.localDate));
  const overdueCount = activeTasks.filter((task) => {
    const dueDate = taskDueDate(task);
    return dueDate !== "" && dueDate < input.localDate;
  }).length;
  const activityDates = new Set<string>();
  let latestMeaningfulActivityAtMs = 0;
  for (const row of input.historyEntries) {
    const timestamp = historyTimestamp(row);
    if (!timestamp || !isMeaningfulHistory(row)) continue;
    activityDates.add(localDateForRecommendationTimezone(input.timezone, timestamp));
    latestMeaningfulActivityAtMs = Math.max(latestMeaningfulActivityAtMs, timestamp);
  }
  const latestTaskCreatedAtMs = activeTasks.reduce((latest, task) => Math.max(latest, asMillis(task.createdAtMs) || asMillis(task.createdAt)), 0);
  const latestActivityDate = latestMeaningfulActivityAtMs
    ? localDateForRecommendationTimezone(input.timezone, latestMeaningfulActivityAtMs)
    : latestTaskCreatedAtMs
      ? localDateForRecommendationTimezone(input.timezone, latestTaskCreatedAtMs)
      : input.localDate;
  const inactiveLocalDays = dateDifference(input.localDate, latestActivityDate);
  const scheduledDayKeys = new Set(
    activeTasks
      .filter((task) => task.taskType !== "once-off" && typeof task.plannedStartDay === "string")
      .map((task) => asString(task.plannedStartDay, 3).toLowerCase())
      .filter((day) => ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(day))
  );
  let missedScheduledDays = 0;
  for (let offset = -1; offset >= -RECOVERY_MISSED_SCHEDULE_LOOKBACK_DAYS; offset -= 1) {
    const date = dateOffset(input.localDate, offset);
    if (scheduledDayKeys.has(scheduleDayKey(date)) && !activityDates.has(date)) missedScheduledDays += 1;
  }
  const recentOverloadedPlans = input.scheduleRepairs.filter((row) =>
    isRecentSignal(row, input.localDate) &&
    (row.planHealthBefore === "SLIGHTLY_OVERLOADED" || row.planHealthBefore === "SIGNIFICANTLY_OVERLOADED")
  ).length;
  const recentDismissals = input.scheduleRepairs.filter((row) => isRecentSignal(row, input.localDate) && row.status === "DISMISSED").length;
  return {
    inactiveLocalDays,
    actionableBacklogCount: backlogTasks.length,
    overdueCount,
    missedScheduledDays,
    repeatedPlanOverloadCount: recentOverloadedPlans,
    repeatedRepairDismissalCount: recentDismissals,
    backlogEstimatedMinutes: backlogTasks.reduce((total, task) => total + taskEstimatedMinutes(task), 0),
    lastDismissedAtMs: input.lastDismissedAtMs == null ? null : Math.max(0, Math.floor(input.lastDismissedAtMs)),
  };
}

export type RecoveryEligibilityRepository = {
  loadSource(input: { uid: string; localDate: string; timezone: string; nowMs: number }): Promise<RecoveryEligibilitySource>;
  recordDismissal(uid: string, dismissedAtMs: number): Promise<void>;
};

export function createFirestoreRecoveryEligibilityRepository(db: Firestore = getFirebaseAdminDb()): RecoveryEligibilityRepository {
  function userDocument(uid: string) {
    return db.collection("users").doc(uid);
  }

  return {
    async loadSource({ uid, localDate, timezone, nowMs }) {
      const safeUid = asString(uid, 120);
      if (!safeUid) {
        return summarizeRecoveryEligibilitySource({ localDate, timezone, nowMs, tasks: [], historyEntries: [], scheduleRepairs: [] });
      }
      const user = userDocument(safeUid);
      const [tasksSnapshot, historySnapshot, scheduleRepairsSnapshot, stateSnapshot] = await Promise.all([
        user.collection("tasks").get(),
        user.collection("historyEntries").get(),
        user.collection("scheduleRepairs").get(),
        user.collection("recoveryState").doc("eligibility").get(),
      ]);
      const state = stateSnapshot.exists ? stateSnapshot.data() as RawRow : null;
      return summarizeRecoveryEligibilitySource({
        localDate,
        timezone,
        nowMs,
        tasks: tasksSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as RawRow) })),
        historyEntries: historySnapshot.docs.map((doc) => doc.data() as RawRow),
        scheduleRepairs: scheduleRepairsSnapshot.docs.map((doc) => doc.data() as RawRow),
        lastDismissedAtMs: state ? asMillis(state.lastDismissedAtMs) || asMillis(state.lastDismissedAt) || null : null,
      });
    },
    async recordDismissal(uid, dismissedAtMs) {
      const safeUid = asString(uid, 120);
      const safeDismissedAtMs = Math.max(0, Math.floor(Number(dismissedAtMs) || 0));
      if (!safeUid || !safeDismissedAtMs) throw new Error("Recovery dismissal identity is invalid.");
      await userDocument(safeUid).collection("recoveryState").doc("eligibility").set({
        lastDismissedAtMs: safeDismissedAtMs,
        lastDismissedAt: Timestamp.fromMillis(safeDismissedAtMs),
        updatedAt: Timestamp.fromMillis(safeDismissedAtMs),
      }, { merge: true });
    },
  };
}
