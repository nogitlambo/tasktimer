"use client";

import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { STORAGE_KEY } from "./storage";

export type OnboardingStep = "welcome" | "dashboard" | "tasks" | "friends" | "leaderboard" | "settings";
export type OnboardingSessionStatus = "active" | "skipped" | "completed";
export type OnboardingModuleStep = Exclude<OnboardingStep, "welcome">;
export type OnboardingModuleClickDetail = { step: OnboardingModuleStep };
export type OnboardingDashboardPanelStepId = "xp-progress" | "week-hours" | "weekly-time-goals" | "tasks-completed";
export type OnboardingTasksActionStepId = "open-add-task";
export type OnboardingDashboardClickDetail = { source: "dashboard-content" };

export const ONBOARDING_STEPS: OnboardingStep[] = ["welcome", "dashboard", "tasks", "friends", "leaderboard", "settings"];
export const ONBOARDING_DASHBOARD_PANEL_STEPS: OnboardingDashboardPanelStepId[] = [
  "xp-progress",
  "week-hours",
  "weekly-time-goals",
  "tasks-completed",
];
export const ONBOARDING_SESSION_COMPLETED_KEY = `${STORAGE_KEY}:onboardingCompletedThisLogin`;
export const ONBOARDING_SESSION_STATUS_KEY = `${STORAGE_KEY}:onboardingStatusThisLogin`;
export const ONBOARDING_SESSION_STEP_KEY = `${STORAGE_KEY}:onboardingStepThisLogin`;
export const ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY = `${STORAGE_KEY}:onboardingDashboardPanelStepThisLogin`;
export const ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY = `${STORAGE_KEY}:onboardingTasksActionStepThisLogin`;
export const ONBOARDING_SESSION_FINGERPRINT_KEY = `${STORAGE_KEY}:onboardingFingerprintThisLogin`;
export const ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY = `${STORAGE_KEY}:onboardingManualResumeRequiredThisLogin`;
export const ONBOARDING_PENDING_ARCHIE_MESSAGE_KEY = `${STORAGE_KEY}:onboardingPendingArchieMessage`;
export const ONBOARDING_MODULE_CLICK_EVENT = "tasktimer:onboardingModuleClick";
export const ONBOARDING_DASHBOARD_CLICK_EVENT = "tasktimer:onboardingDashboardClick";
export const ONBOARDING_ADD_TASK_CLICK_EVENT = "tasktimer:onboardingAddTaskClick";
export const ONBOARDING_STATE_CHANGED_EVENT = "tasktimer:onboardingStateChanged";

const cloudOnboardingCompleteCache = new Map<string, boolean>();

export function buildOnboardingSessionFingerprint(user: User | null | undefined) {
  const uid = String(user?.uid || "").trim();
  const lastSignInTime = String(user?.metadata?.lastSignInTime || "").trim();
  if (!uid || !lastSignInTime) return "";
  return `${uid}:${lastSignInTime}`;
}

function readSessionStorage(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore sessionStorage failures
  }
}

function removeSessionStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore sessionStorage failures
  }
}

export function getOnboardingStepIndex(step: OnboardingStep) {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index >= 0 ? index : 0;
}

export function getOnboardingStepByIndex(index: number): OnboardingStep {
  const normalizedIndex = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, Math.floor(Number(index) || 0)));
  return ONBOARDING_STEPS[normalizedIndex] || "welcome";
}

export function isOnboardingModuleStep(step: unknown): step is OnboardingModuleStep {
  return step === "dashboard" || step === "tasks" || step === "friends" || step === "leaderboard" || step === "settings";
}

export function isOnboardingDashboardPanelStepId(step: unknown): step is OnboardingDashboardPanelStepId {
  return step === "xp-progress" || step === "week-hours" || step === "weekly-time-goals" || step === "tasks-completed";
}

export function isOnboardingTasksActionStepId(step: unknown): step is OnboardingTasksActionStepId {
  return step === "open-add-task";
}

export function getOnboardingDashboardPanelStepByIndex(index: number): OnboardingDashboardPanelStepId {
  const normalizedIndex = Math.max(0, Math.min(ONBOARDING_DASHBOARD_PANEL_STEPS.length - 1, Math.floor(Number(index) || 0)));
  return ONBOARDING_DASHBOARD_PANEL_STEPS[normalizedIndex] || "xp-progress";
}

export function getOnboardingDashboardPanelStepIndex(step: OnboardingDashboardPanelStepId) {
  const index = ONBOARDING_DASHBOARD_PANEL_STEPS.indexOf(step);
  return index >= 0 ? index : 0;
}

export function shouldOnboardingStepAwaitModuleClick(step: OnboardingStep | null | undefined) {
  return isOnboardingModuleStep(step);
}

export function onboardingModuleStepFromNavPage(page: string | null | undefined): OnboardingModuleStep | null {
  const normalized = String(page || "").trim().toLowerCase();
  if (normalized === "dashboard") return "dashboard";
  if (normalized === "tasks") return "tasks";
  if (normalized === "friends" || normalized === "test2") return "friends";
  if (normalized === "leaderboard") return "leaderboard";
  if (normalized === "settings") return "settings";
  return null;
}

export function readOnboardingStepForCurrentSession(user: User | null | undefined): OnboardingStep {
  const expectedFingerprint = buildOnboardingSessionFingerprint(user);
  if (!expectedFingerprint) return "welcome";
  const storedFingerprint = readSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY);
  if (storedFingerprint !== expectedFingerprint) return "welcome";
  const storedStep = readSessionStorage(ONBOARDING_SESSION_STEP_KEY);
  return ONBOARDING_STEPS.includes(storedStep as OnboardingStep) ? (storedStep as OnboardingStep) : "welcome";
}

export function readOnboardingStatusForCurrentSession(user: User | null | undefined): OnboardingSessionStatus | null {
  const expectedFingerprint = buildOnboardingSessionFingerprint(user);
  if (!expectedFingerprint) return null;
  const storedFingerprint = readSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY);
  if (storedFingerprint !== expectedFingerprint) return null;
  const storedStatus = readSessionStorage(ONBOARDING_SESSION_STATUS_KEY);
  if (storedStatus === "active" || storedStatus === "skipped" || storedStatus === "completed") {
    return storedStatus;
  }
  return null;
}

export function hasCompletedOnboardingForCurrentSession(user: User | null | undefined) {
  const status = readOnboardingStatusForCurrentSession(user);
  return status === "completed" || status === "skipped";
}

export function shouldResumeSkippedOnboarding(user: User | null | undefined) {
  return readOnboardingStatusForCurrentSession(user) === "skipped";
}

export function clearOnboardingSessionState() {
  removeSessionStorage(ONBOARDING_SESSION_COMPLETED_KEY);
  removeSessionStorage(ONBOARDING_SESSION_STATUS_KEY);
  removeSessionStorage(ONBOARDING_SESSION_STEP_KEY);
  removeSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY);
  removeSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY);
  removeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY);
  removeSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY);
  removeSessionStorage(ONBOARDING_PENDING_ARCHIE_MESSAGE_KEY);
}

export function isOnboardingManualResumeRequired() {
  return readSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY) === "true";
}

export function clearCachedCloudOnboardingComplete(uid?: string | null) {
  const normalizedUid = String(uid || "").trim();
  if (normalizedUid) {
    cloudOnboardingCompleteCache.delete(normalizedUid);
    return;
  }
  cloudOnboardingCompleteCache.clear();
}

export async function readCloudOnboardingComplete(uid: string | null | undefined) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return false;
  if (cloudOnboardingCompleteCache.has(normalizedUid)) {
    return !!cloudOnboardingCompleteCache.get(normalizedUid);
  }
  const db = getFirebaseFirestoreClient();
  if (!db) {
    cloudOnboardingCompleteCache.set(normalizedUid, false);
    return false;
  }
  try {
    const snap = await getDoc(doc(db, "users", normalizedUid));
    const completed = snap.exists() && snap.get("onboardingComplete") === true;
    cloudOnboardingCompleteCache.set(normalizedUid, completed);
    return completed;
  } catch {
    cloudOnboardingCompleteCache.set(normalizedUid, false);
    return false;
  }
}

export function startOnboardingForCurrentSession(user: User | null | undefined, step: OnboardingStep = "welcome") {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (!fingerprint) return;
  writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "active");
  writeSessionStorage(ONBOARDING_SESSION_STEP_KEY, step);
  removeSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY);
  removeSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY);
  removeSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY);
}

export function saveOnboardingStepForCurrentSession(user: User | null | undefined, step: OnboardingStep) {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (!fingerprint) return;
  writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "active");
  writeSessionStorage(ONBOARDING_SESSION_STEP_KEY, step);
  removeSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY);
  if (step !== "dashboard") removeSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY);
  if (step !== "tasks") removeSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY);
}

export function readOnboardingDashboardPanelStepForCurrentSession(user: User | null | undefined) {
  const expectedFingerprint = buildOnboardingSessionFingerprint(user);
  if (!expectedFingerprint) return null;
  const storedFingerprint = readSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY);
  if (storedFingerprint !== expectedFingerprint) return null;
  const storedStep = readSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY);
  return isOnboardingDashboardPanelStepId(storedStep) ? storedStep : null;
}

export function saveOnboardingDashboardPanelStepForCurrentSession(
  user: User | null | undefined,
  step: OnboardingDashboardPanelStepId | null | undefined
) {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (!fingerprint) return;
  writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "active");
  if (step && isOnboardingDashboardPanelStepId(step)) {
    writeSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY, step);
    return;
  }
  removeSessionStorage(ONBOARDING_SESSION_DASHBOARD_PANEL_STEP_KEY);
}

export function readOnboardingTasksActionStepForCurrentSession(user: User | null | undefined) {
  const expectedFingerprint = buildOnboardingSessionFingerprint(user);
  if (!expectedFingerprint) return null;
  const storedFingerprint = readSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY);
  if (storedFingerprint !== expectedFingerprint) return null;
  const storedStep = readSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY);
  return isOnboardingTasksActionStepId(storedStep) ? storedStep : null;
}

export function saveOnboardingTasksActionStepForCurrentSession(
  user: User | null | undefined,
  step: OnboardingTasksActionStepId | null | undefined
) {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (!fingerprint) return;
  writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "active");
  if (step && isOnboardingTasksActionStepId(step)) {
    writeSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY, step);
    return;
  }
  removeSessionStorage(ONBOARDING_SESSION_TASKS_ACTION_STEP_KEY);
}

export function skipOnboardingForCurrentSession(user: User | null | undefined, step: OnboardingStep) {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (fingerprint) {
    writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
    writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "skipped");
    writeSessionStorage(ONBOARDING_SESSION_STEP_KEY, step);
  }
  writeSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY, "true");
}

export function completeOnboardingForCurrentSession(user: User | null | undefined) {
  const fingerprint = buildOnboardingSessionFingerprint(user);
  if (!fingerprint) return;
  writeSessionStorage(ONBOARDING_SESSION_COMPLETED_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_FINGERPRINT_KEY, fingerprint);
  writeSessionStorage(ONBOARDING_SESSION_STATUS_KEY, "completed");
  writeSessionStorage(ONBOARDING_SESSION_STEP_KEY, ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1] || "notifications");
  removeSessionStorage(ONBOARDING_SESSION_MANUAL_RESUME_REQUIRED_KEY);
}

export function setPendingOnboardingArchieMessage(message: string) {
  const normalized = String(message || "").trim();
  if (!normalized) return;
  writeSessionStorage(ONBOARDING_PENDING_ARCHIE_MESSAGE_KEY, normalized);
}

export function consumePendingOnboardingArchieMessage() {
  const message = readSessionStorage(ONBOARDING_PENDING_ARCHIE_MESSAGE_KEY);
  if (message) removeSessionStorage(ONBOARDING_PENDING_ARCHIE_MESSAGE_KEY);
  return message;
}

export function getOnboardingStepMessage(step: OnboardingStep) {
  if (step === "welcome") {
    return "Welcome aboard. I'm Archie, your TaskLaunch assistant. I'm going to help you get familiar with the app's features and gather some important information from you to get things moving as quickly as possible.";
  }
  if (step === "dashboard") {
    return "Dashboard gives you a quick overview of your activity, progress, and key stats so you can see how your work is tracking at a glance.\n\nSelect the Dashboard module now";
  }
  if (step === "tasks") {
    return "Tasks is your main workspace for creating tasks, tracking time, starting focus sessions, and reviewing each task's recent history from one place.\n\nTo continue, select the Tasks module";
  }
  if (step === "friends") return "Friends";
  if (step === "leaderboard") return "Leaderboard";
  return "Settings";
}

export function getOnboardingDashboardPanelStepMessage(step: OnboardingDashboardPanelStepId) {
  if (step === "xp-progress") {
    return "XP PROGRESS shows your current XP, how far through the rank bar you are, and how much XP remains until the next rank.\n\nClick anywhere to move forward";
  }
  if (step === "week-hours") {
    return "TODAY gives you a quick snapshot of the time you've logged so far today and how that compares with your daily progress.\n\nClick anywhere to move forward";
  }
  if (step === "weekly-time-goals") {
    return "THIS WEEK shows your total logged time for the week and how close you are to your weekly time goal.\n\nClick anywhere to move forward";
  }
  return "TASKS COMPLETED is an overview of the number of tasks you've seen through to completion for the current day and week.\n\nClick anywhere to move forward";
}

export function getOnboardingTasksActionStepMessage(step: OnboardingTasksActionStepId) {
  if (step === "open-add-task") {
    return "You're in the Tasks module now. Use Add Task to create your first task and start building your workspace.\n\nTo continue, click Add Task";
  }
  return "";
}

export function getSkippedOnboardingNotice() {
  return "Onboarding paused. You can resume at any time by clicking me.";
}

export function getCompletedOnboardingNotice() {
  return "Onboarding finished for this login. If you want a refresher later, click me and I can walk you through it again.";
}

export function notifyOnboardingStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_STATE_CHANGED_EVENT));
}
