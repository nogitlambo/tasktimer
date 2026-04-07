"use client";

import type { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { bootstrapFirebaseWebAppCheck, getFirebaseAppClient } from "@/lib/firebaseClient";
import {
  normalizeTaskTimerPlan,
  type TaskTimerPlan,
  writeTaskTimerPlanToStorage,
} from "./entitlements";

const FUNCTIONS_REGION = (process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";
const shouldLogFunctionDiagnostics = process.env.NODE_ENV !== "production";

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
  await bootstrapFirebaseWebAppCheck();
  const app = getFirebaseAppClient();
  if (!app) {
    const fallbackPlan = "free" as TaskTimerPlan;
    writeTaskTimerPlanToStorage(fallbackPlan, { uid: normalizedUid || null });
    return fallbackPlan;
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const callable = httpsCallable<Record<string, never>, SyncCurrentUserPlanResult>(functions, "syncCurrentUserPlan");
  logFunctionsDiagnostic("Calling syncCurrentUserPlan", {
    region: FUNCTIONS_REGION,
    appId: app.options.appId || null,
    uidPresent: Boolean(normalizedUid),
  });
  try {
    const result = await callable({});
    logFunctionsDiagnostic("syncCurrentUserPlan succeeded", {
      region: FUNCTIONS_REGION,
      plan: normalizeTaskTimerPlan(result.data?.plan),
    });
    const nextPlan = normalizeTaskTimerPlan(result.data?.plan);
    writeTaskTimerPlanToStorage(nextPlan, { uid: normalizedUid || null });
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
  }
}
