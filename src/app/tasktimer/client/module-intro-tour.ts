import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { STORAGE_KEY } from "../lib/storage";
import type { AppPage } from "./types";

export const TASKTIMER_MODULE_INTRO_TOUR_START_EVENT = "tasktimer:moduleIntroTourStart";
export const TASKTIMER_MODULE_INTRO_TOUR_APPLY_PAGE_EVENT = "tasktimer:moduleIntroTourApplyPage";
export const MODULE_INTRO_TOUR_VERSION = 1;

export type ModuleIntroTourPage = Exclude<AppPage, "schedule">;

export type ModuleIntroTourStep = {
  page: ModuleIntroTourPage;
  label: string;
  message: string;
};

export type ModuleIntroTourStartEventDetail = {
  uid?: string | null;
};

export type ModuleIntroTourApplyPageEventDetail = {
  page: ModuleIntroTourPage;
};

export const MODULE_INTRO_TOUR_STEPS: ModuleIntroTourStep[] = [
  {
    page: "tasks",
    label: "Tasks",
    message: "Tasks is where you launch, schedule, and manage the work you want to focus on.",
  },
  {
    page: "dashboard",
    label: "Dashboard",
    message: "Dashboard shows your progress, trends, and productivity insights at a glance.",
  },
  {
    page: "notes",
    label: "Notes",
    message: "Notes keeps session notes and context connected to your focus work.",
  },
  {
    page: "friends",
    label: "Friends",
    message: "Friends is where you connect, share progress, and manage your accountability circle.",
  },
  {
    page: "leaderboard",
    label: "Leaderboards",
    message: "Leaderboards show rankings, XP, and progress across your network.",
  },
  {
    page: "history",
    label: "History",
    message: "History lets you review, analyze, and manage completed focus sessions.",
  },
];

export function normalizeModuleIntroTourPage(value: unknown): ModuleIntroTourPage | null {
  const page = String(value || "").trim();
  return MODULE_INTRO_TOUR_STEPS.some((step) => step.page === page) ? (page as ModuleIntroTourPage) : null;
}

export function getModuleIntroTourStep(index: number): ModuleIntroTourStep {
  return MODULE_INTRO_TOUR_STEPS[Math.max(0, Math.min(MODULE_INTRO_TOUR_STEPS.length - 1, Math.floor(index)))] || MODULE_INTRO_TOUR_STEPS[0];
}

export function getNextModuleIntroTourIndex(index: number): number | null {
  const nextIndex = Math.floor(index) + 1;
  return nextIndex >= MODULE_INTRO_TOUR_STEPS.length ? null : nextIndex;
}

export function isFinalModuleIntroTourStep(index: number): boolean {
  return getNextModuleIntroTourIndex(index) == null;
}

export function moduleIntroTourPendingStorageKey(uid: string) {
  return `${STORAGE_KEY}:moduleIntroTour:pending:v${MODULE_INTRO_TOUR_VERSION}:${uid}`;
}

export function moduleIntroTourCompletedStorageKey(uid: string) {
  return `${STORAGE_KEY}:moduleIntroTour:completed:v${MODULE_INTRO_TOUR_VERSION}:${uid}`;
}

function normalizeUid(uidRaw: unknown) {
  return String(uidRaw || "").trim();
}

function normalizePositiveMs(value: unknown): number {
  const numeric = Math.max(0, Math.floor(Number(value || 0) || 0));
  return numeric > 0 ? numeric : 0;
}

function safeGetLocalStorage(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage failures.
  }
}

function safeRemoveLocalStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore localStorage failures.
  }
}

export function readLocalModuleIntroTourPending(uidRaw: unknown): boolean {
  const uid = normalizeUid(uidRaw);
  return !!uid && safeGetLocalStorage(moduleIntroTourPendingStorageKey(uid)) === "true";
}

export function writeLocalModuleIntroTourPending(uidRaw: unknown): void {
  const uid = normalizeUid(uidRaw);
  if (!uid) return;
  safeSetLocalStorage(moduleIntroTourPendingStorageKey(uid), "true");
}

export function clearLocalModuleIntroTourPending(uidRaw: unknown): void {
  const uid = normalizeUid(uidRaw);
  if (!uid) return;
  safeRemoveLocalStorage(moduleIntroTourPendingStorageKey(uid));
}

export function readLocalModuleIntroTourCompletedAtMs(uidRaw: unknown): number {
  const uid = normalizeUid(uidRaw);
  if (!uid) return 0;
  return normalizePositiveMs(safeGetLocalStorage(moduleIntroTourCompletedStorageKey(uid)));
}

export function writeLocalModuleIntroTourCompleted(uidRaw: unknown, completedAtMsRaw?: unknown): number {
  const uid = normalizeUid(uidRaw);
  if (!uid) return 0;
  const completedAtMs = normalizePositiveMs(completedAtMsRaw) || Date.now();
  safeSetLocalStorage(moduleIntroTourCompletedStorageKey(uid), String(completedAtMs));
  clearLocalModuleIntroTourPending(uid);
  return completedAtMs;
}

function accountStateDoc(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db || !uid) return null;
  return doc(db, "users", uid, "accountState", "v1");
}

export async function loadRemoteModuleIntroTourCompletedAtMs(uidRaw: unknown): Promise<number> {
  const uid = normalizeUid(uidRaw);
  const ref = accountStateDoc(uid);
  if (!ref) return 0;
  const snap = await getDoc(ref);
  const completedAtMs = snap.exists() ? normalizePositiveMs(snap.get("moduleIntroTourCompletedAtMs")) : 0;
  if (completedAtMs) writeLocalModuleIntroTourCompleted(uid, completedAtMs);
  return completedAtMs;
}

export async function hasCompletedModuleIntroTour(uidRaw: unknown): Promise<boolean> {
  const uid = normalizeUid(uidRaw);
  if (!uid) return true;
  if (readLocalModuleIntroTourCompletedAtMs(uid)) return true;
  try {
    return (await loadRemoteModuleIntroTourCompletedAtMs(uid)) > 0;
  } catch {
    return false;
  }
}

export async function markModuleIntroTourCompleted(uidRaw: unknown): Promise<number> {
  const uid = normalizeUid(uidRaw);
  if (!uid) return 0;
  const completedAtMs = writeLocalModuleIntroTourCompleted(uid);
  const ref = accountStateDoc(uid);
  if (ref) {
    await setDoc(
      ref,
      {
        moduleIntroTourVersion: MODULE_INTRO_TOUR_VERSION,
        moduleIntroTourCompletedAtMs: completedAtMs,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  return completedAtMs;
}

export function dispatchModuleIntroTourStartEvent(uidRaw: unknown): void {
  if (typeof window === "undefined") return;
  const uid = normalizeUid(uidRaw);
  if (!uid) return;
  writeLocalModuleIntroTourPending(uid);
  window.dispatchEvent(
    new CustomEvent<ModuleIntroTourStartEventDetail>(TASKTIMER_MODULE_INTRO_TOUR_START_EVENT, {
      detail: { uid },
    })
  );
}

export function dispatchModuleIntroTourApplyPageEvent(page: ModuleIntroTourPage): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ModuleIntroTourApplyPageEventDetail>(TASKTIMER_MODULE_INTRO_TOUR_APPLY_PAGE_EVENT, {
      detail: { page },
    })
  );
}
