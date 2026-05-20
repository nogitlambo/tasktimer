"use client";

import type { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { bootstrapFirebaseWebAppCheck, getFirebaseAppClient } from "@/lib/firebaseClient";

const FUNCTIONS_REGION = (process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";

type PushActionResult = {
  ok?: boolean;
  applied?: boolean;
  actionId?: string;
  reason?: string;
  dueAtMs?: number | null;
};

export async function applyScheduledPushAction(input: {
  actionId: "launchTask" | "snooze10m" | "postponeNextGap";
  taskId: string;
  route?: string;
  deviceId?: string;
}): Promise<PushActionResult> {
  await bootstrapFirebaseWebAppCheck();
  const app = getFirebaseAppClient();
  if (!app) {
    throw new Error("Firebase client is not configured.");
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const callable = httpsCallable<
    { actionId: string; taskId: string; route?: string; deviceId?: string },
    PushActionResult
  >(functions, "applyScheduledPushAction");

  try {
    const result = await callable({
      actionId: input.actionId,
      taskId: input.taskId,
      route: input.route,
      deviceId: input.deviceId,
    });
    return result.data || {};
  } catch (error: unknown) {
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
      "Unable to apply push action right now.";
    const normalizedMessage = baseMessage
      .replace(/^functions\/internal\s*/i, "")
      .replace(/^internal\s*/i, "")
      .trim();
    throw new Error(normalizedMessage || "Unable to apply push action right now.");
  }
}
