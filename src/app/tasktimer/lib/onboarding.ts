import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { STORAGE_KEY } from "./storage";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "./historyChart";
import { normalizeOptimalProductivityDays, normalizeTimeOfDay, type OptimalProductivityDays } from "./productivityPeriod";

export const TASKTIMER_ONBOARDING_VERSION = 1;
export const TASKTIMER_ONBOARDING_DEFAULT_WEEK_START = "mon";
export const TASKTIMER_ONBOARDING_DEFAULT_START_TIME = "09:00";
export const TASKTIMER_ONBOARDING_DEFAULT_END_TIME = "17:00";

export type TaskTimerOnboardingStatus = "completed" | "dismissed";

export type TaskTimerOnboardingState = {
  onboardingVersion: 1;
  onboardingStatus: TaskTimerOnboardingStatus;
  onboardingCompletedAtMs?: number;
  onboardingDismissedAtMs?: number;
  onboardingUsernameConfirmedAtMs?: number;
};

export type TaskTimerOnboardingPreferencePresence = {
  weekStarting: boolean;
  optimalProductivityStartTime: boolean;
  optimalProductivityEndTime: boolean;
  optimalProductivityDays: boolean;
};

export type TaskTimerOnboardingGateInput = {
  uid: string | null | undefined;
  username: string | null | undefined;
  state: TaskTimerOnboardingState | null;
  preferencePresence: TaskTimerOnboardingPreferencePresence | null;
};

export type TaskTimerOnboardingPreferenceDraft = {
  weekStarting: DashboardWeekStart;
  optimalProductivityDays: OptimalProductivityDays;
  optimalProductivityStartTime: string;
  optimalProductivityEndTime: string;
};

export type TaskTimerOnboardingPreferenceSource = Partial<{
  weekStarting: unknown;
  optimalProductivityDays: unknown;
  optimalProductivityStartTime: unknown;
  optimalProductivityEndTime: unknown;
}>;

export function taskTimerOnboardingStorageKey(uid: string) {
  return `${STORAGE_KEY}:onboarding:v1:${uid}`;
}

function normalizeStatus(value: unknown): TaskTimerOnboardingStatus | null {
  return value === "completed" || value === "dismissed" ? value : null;
}

function normalizePositiveMs(value: unknown): number | undefined {
  const numeric = Math.max(0, Math.floor(Number(value || 0) || 0));
  return numeric > 0 ? numeric : undefined;
}

function isFirestorePermissionDenied(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code || "") === "permission-denied"
  );
}

export function normalizeTaskTimerOnboardingState(value: unknown): TaskTimerOnboardingState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const status = normalizeStatus(source.onboardingStatus);
  if (!status) return null;
  return {
    onboardingVersion: TASKTIMER_ONBOARDING_VERSION,
    onboardingStatus: status,
    onboardingCompletedAtMs: normalizePositiveMs(source.onboardingCompletedAtMs),
    onboardingDismissedAtMs: normalizePositiveMs(source.onboardingDismissedAtMs),
    onboardingUsernameConfirmedAtMs: normalizePositiveMs(source.onboardingUsernameConfirmedAtMs),
  };
}

export function readLocalTaskTimerOnboardingState(uid: string): TaskTimerOnboardingState | null {
  if (typeof window === "undefined" || !uid) return null;
  try {
    return normalizeTaskTimerOnboardingState(JSON.parse(window.localStorage.getItem(taskTimerOnboardingStorageKey(uid)) || "null"));
  } catch {
    return null;
  }
}

export function writeLocalTaskTimerOnboardingState(uid: string, state: TaskTimerOnboardingState): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.localStorage.setItem(taskTimerOnboardingStorageKey(uid), JSON.stringify(state));
  } catch {
    // Ignore localStorage failures.
  }
}

function accountStateDoc(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db || !uid) return null;
  return doc(db, "users", uid, "accountState", "v1");
}

function preferencesDoc(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db || !uid) return null;
  return doc(db, "users", uid, "preferences", "v1");
}

export async function loadRemoteTaskTimerOnboardingState(uid: string): Promise<TaskTimerOnboardingState | null> {
  const ref = accountStateDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const state = normalizeTaskTimerOnboardingState(snap.data());
  if (state) writeLocalTaskTimerOnboardingState(uid, state);
  return state;
}

export async function saveTaskTimerOnboardingState(
  uid: string,
  patch: Pick<TaskTimerOnboardingState, "onboardingStatus"> & Partial<TaskTimerOnboardingState>
): Promise<TaskTimerOnboardingState> {
  if (!uid) throw new Error("Sign in is required to save onboarding state.");
  const nowMs = Date.now();
  const next: TaskTimerOnboardingState = {
    onboardingVersion: TASKTIMER_ONBOARDING_VERSION,
    onboardingStatus: patch.onboardingStatus,
    onboardingCompletedAtMs: patch.onboardingCompletedAtMs,
    onboardingDismissedAtMs: patch.onboardingDismissedAtMs,
    onboardingUsernameConfirmedAtMs: patch.onboardingUsernameConfirmedAtMs,
  };
  if (next.onboardingStatus === "completed" && !next.onboardingCompletedAtMs) next.onboardingCompletedAtMs = nowMs;
  if (next.onboardingStatus === "dismissed" && !next.onboardingDismissedAtMs) next.onboardingDismissedAtMs = nowMs;

  writeLocalTaskTimerOnboardingState(uid, next);

  const ref = accountStateDoc(uid);
  if (ref) {
    const remotePatch: Record<string, unknown> = {
      onboardingVersion: next.onboardingVersion,
      onboardingStatus: next.onboardingStatus,
      updatedAt: serverTimestamp(),
    };
    if (next.onboardingCompletedAtMs) remotePatch.onboardingCompletedAtMs = next.onboardingCompletedAtMs;
    if (next.onboardingDismissedAtMs) remotePatch.onboardingDismissedAtMs = next.onboardingDismissedAtMs;
    if (next.onboardingUsernameConfirmedAtMs) {
      remotePatch.onboardingUsernameConfirmedAtMs = next.onboardingUsernameConfirmedAtMs;
    }
    try {
      await setDoc(
        ref,
        remotePatch,
        { merge: true }
      );
    } catch (error: unknown) {
      if (!isFirestorePermissionDenied(error)) throw error;
    }
  }
  return next;
}

export async function loadTaskTimerOnboardingPreferencePresence(
  uid: string
): Promise<TaskTimerOnboardingPreferencePresence | null> {
  const ref = preferencesDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      weekStarting: false,
      optimalProductivityStartTime: false,
      optimalProductivityEndTime: false,
      optimalProductivityDays: false,
    };
  }
  const data = snap.data() || {};
  return {
    weekStarting: Object.prototype.hasOwnProperty.call(data, "weekStarting"),
    optimalProductivityStartTime: Object.prototype.hasOwnProperty.call(data, "optimalProductivityStartTime"),
    optimalProductivityEndTime: Object.prototype.hasOwnProperty.call(data, "optimalProductivityEndTime"),
    optimalProductivityDays: Object.prototype.hasOwnProperty.call(data, "optimalProductivityDays"),
  };
}

export function hasIncompleteTaskTimerOnboardingPreferences(
  preferencePresence: TaskTimerOnboardingPreferencePresence | null
): boolean {
  if (!preferencePresence) return false;
  return (
    !preferencePresence.weekStarting ||
    !preferencePresence.optimalProductivityStartTime ||
    !preferencePresence.optimalProductivityEndTime ||
    !preferencePresence.optimalProductivityDays
  );
}

export function shouldAutoOpenTaskTimerOnboarding(input: TaskTimerOnboardingGateInput): boolean {
  const uid = String(input.uid || "").trim();
  if (!uid) return false;
  if (input.state?.onboardingStatus === "completed" || input.state?.onboardingStatus === "dismissed") return false;
  const missingUsername = !String(input.username || "").trim();
  return missingUsername || hasIncompleteTaskTimerOnboardingPreferences(input.preferencePresence);
}

export function buildTaskTimerOnboardingPreferenceDraft(
  preferences: TaskTimerOnboardingPreferenceSource | null | undefined,
  preferencePresence: TaskTimerOnboardingPreferencePresence | null
): TaskTimerOnboardingPreferenceDraft {
  return {
    weekStarting:
      preferencePresence?.weekStarting && preferences?.weekStarting
        ? normalizeDashboardWeekStart(preferences.weekStarting)
        : normalizeDashboardWeekStart(TASKTIMER_ONBOARDING_DEFAULT_WEEK_START),
    optimalProductivityDays:
      preferencePresence?.optimalProductivityDays && preferences?.optimalProductivityDays
        ? normalizeOptimalProductivityDays(preferences.optimalProductivityDays)
        : [],
    optimalProductivityStartTime:
      preferencePresence?.optimalProductivityStartTime && preferences?.optimalProductivityStartTime
        ? normalizeTimeOfDay(preferences.optimalProductivityStartTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME)
        : TASKTIMER_ONBOARDING_DEFAULT_START_TIME,
    optimalProductivityEndTime:
      preferencePresence?.optimalProductivityEndTime && preferences?.optimalProductivityEndTime
        ? normalizeTimeOfDay(preferences.optimalProductivityEndTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME)
        : TASKTIMER_ONBOARDING_DEFAULT_END_TIME,
  };
}
