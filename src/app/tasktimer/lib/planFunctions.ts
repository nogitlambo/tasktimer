"use client";

import type { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { bootstrapFirebaseWebAppCheck, getFirebaseAppClient, getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  normalizeTaskTimerPlan,
  readTaskTimerPlanFromStorage,
  type TaskTimerPlan,
  writeTaskTimerPlanToStorage,
} from "./entitlements";

const FUNCTIONS_REGION = (process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";
const shouldLogFunctionDiagnostics = process.env.NODE_ENV !== "production";
const PLAN_SYNC_RECENT_WINDOW_MS = 60_000;
const inFlightPlanSyncByUid = new Map<string, Promise<TaskTimerPlan>>();
const lastSuccessfulPlanSyncAtByUid = new Map<string, number>();

function logFunctionsDiagnostic(message: string, details?: Record<string, unknown>) {
  if (!shouldLogFunctionDiagnostics) return;
  if (details) {
    console.info(`[firebase-functions] ${message}`, details);
    return;
  }
  console.info(`[firebase-functions] ${message}`);
}

type SyncCurrentUserPlanResult = {
  plan?: unknown;
};

function normalizeCallableErrorMessage(error: unknown, fallback: string): string {
  const firebaseError = error as FirebaseError & {
    details?: unknown;
    customData?: { details?: unknown };
  };
  const detailMessage =
    firebaseError?.details && typeof firebaseError.details === "object" && "message" in firebaseError.details
      ? String((firebaseError.details as { message?: unknown }).message || "").trim()
      : firebaseError?.customData?.details && typeof firebaseError.customData.details === "object" && "message" in firebaseError.customData.details
        ? String(((firebaseError.customData.details as { message?: unknown }).message) || "").trim()
        : "";
  const baseMessage =
    detailMessage ||
    (typeof firebaseError?.message === "string" ? firebaseError.message.trim() : "") ||
    fallback;
  return baseMessage.replace(/^functions\/[a-z-]+\s*/i, "").trim() || fallback;
}

export async function syncCurrentUserPlanCache(uid?: string | null): Promise<TaskTimerPlan> {
  const normalizedUid = String(uid || "").trim();
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const currentUid = String(currentUser?.uid || "").trim();
  const effectiveUid = normalizedUid || currentUid;
  if (!effectiveUid || !currentUser || currentUid !== effectiveUid) {
    const cachedPlan = readTaskTimerPlanFromStorage();
    logFunctionsDiagnostic("Skipping syncCurrentUserPlan until auth is ready", {
      region: FUNCTIONS_REGION,
      uidPresent: Boolean(effectiveUid),
      authReady: Boolean(currentUser),
      authUidMatches: Boolean(currentUid && effectiveUid && currentUid === effectiveUid),
    });
    return cachedPlan;
  }
  const now = Date.now();
  const lastSuccessAt = lastSuccessfulPlanSyncAtByUid.get(effectiveUid) || 0;
  if (now - lastSuccessAt < PLAN_SYNC_RECENT_WINDOW_MS) {
    return readTaskTimerPlanFromStorage();
  }
  const inFlight = inFlightPlanSyncByUid.get(effectiveUid);
  if (inFlight) return inFlight;
  await bootstrapFirebaseWebAppCheck();
  const app = getFirebaseAppClient();
  if (!app) {
    const cachedPlan = readTaskTimerPlanFromStorage();
    writeTaskTimerPlanToStorage(cachedPlan, { uid: effectiveUid || null });
    return cachedPlan;
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const callable = httpsCallable<Record<string, never>, SyncCurrentUserPlanResult>(functions, "syncCurrentUserPlan");
  const syncPromise = (async () => {
    logFunctionsDiagnostic("Calling syncCurrentUserPlan", {
      region: FUNCTIONS_REGION,
      appId: app.options.appId || null,
      uidPresent: Boolean(effectiveUid),
    });
    try {
      const result = await callable({});
      logFunctionsDiagnostic("syncCurrentUserPlan succeeded", {
        region: FUNCTIONS_REGION,
        plan: normalizeTaskTimerPlan(result.data?.plan),
      });
      const nextPlan = normalizeTaskTimerPlan(result.data?.plan);
      writeTaskTimerPlanToStorage(nextPlan, { uid: effectiveUid || null });
      lastSuccessfulPlanSyncAtByUid.set(effectiveUid, Date.now());
      return nextPlan;
    } catch (error: unknown) {
      logFunctionsDiagnostic("syncCurrentUserPlan failed", {
        region: FUNCTIONS_REGION,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { value: String(error) },
      });
      const message = normalizeCallableErrorMessage(error, "Unable to load your subscription plan right now.");
      throw new Error(message);
    } finally {
      inFlightPlanSyncByUid.delete(effectiveUid);
    }
  })();
  inFlightPlanSyncByUid.set(effectiveUid, syncPromise);
  return syncPromise;
}
