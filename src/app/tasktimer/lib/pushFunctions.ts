"use client";

import type { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { getFirebaseAppClient } from "@/lib/firebaseClient";

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

type PushTestResult = {
  ok?: boolean;
  tokenCount?: number;
  successCount?: number;
  failureCount?: number;
  invalidTokens?: Array<{
    deviceId?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
};

export async function sendPushTestNotification(input?: {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}): Promise<PushTestResult> {
  const app = getFirebaseAppClient();
  if (!app) {
    throw new Error("Firebase client is not configured.");
  }
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const callable = httpsCallable<
    { title?: string; body?: string; data?: Record<string, string> },
    PushTestResult
  >(functions, "sendPushTest");
  logFunctionsDiagnostic("Calling sendPushTest", {
    region: FUNCTIONS_REGION,
    appId: app.options.appId || null,
    titlePresent: Boolean(String(input?.title || "").trim()),
    bodyPresent: Boolean(String(input?.body || "").trim()),
  });
  try {
    const result = await callable({
      title: input?.title,
      body: input?.body,
      data: input?.data,
    });
    logFunctionsDiagnostic("sendPushTest succeeded", {
      region: FUNCTIONS_REGION,
      ok: result.data?.ok ?? null,
      successCount: result.data?.successCount ?? null,
      failureCount: result.data?.failureCount ?? null,
    });
    return result.data || {};
  } catch (error: unknown) {
    logFunctionsDiagnostic("sendPushTest failed", {
      region: FUNCTIONS_REGION,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { value: String(error) },
    });
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
      "Unable to send test push right now.";
    const normalizedMessage = baseMessage
      .replace(/^functions\/internal\s*/i, "")
      .replace(/^internal\s*/i, "")
      .trim();
    throw new Error(normalizedMessage || "Unable to send test push right now.");
  }
}
