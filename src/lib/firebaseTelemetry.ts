"use client";

import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-firebase/analytics";
import { FirebaseCrashlytics } from "@capacitor-firebase/crashlytics";
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  logEvent as logWebAnalyticsEvent,
  setUserId as setWebAnalyticsUserId,
  type Analytics,
} from "firebase/analytics";

import { getFirebaseAppClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { readTaskTimerPlanFromStorage, type TaskTimerPlan } from "@/app/tasktimer/lib/entitlements";

type TelemetryValue = string | number | boolean;
type TelemetryParams = Record<string, TelemetryValue>;

let initStarted = false;
let webAnalyticsState: Promise<Analytics | null> | null = null;

function isNativeAndroidRuntime() {
  if (typeof window === "undefined") return false;
  if (!isNativeOrFileRuntime()) return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function isWebRuntime() {
  if (typeof window === "undefined") return false;
  return !isNativeOrFileRuntime();
}

function getTelemetryRuntime(): "android" | "web" {
  return isNativeAndroidRuntime() ? "android" : "web";
}

function sanitizeTelemetryValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim();
}

function sanitizeTelemetryParams(params?: TelemetryParams | null) {
  const output: Record<string, string | number> = {};
  if (!params) return output;
  for (const [key, value] of Object.entries(params)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeTelemetryValue(value);
    if (normalizedValue === "") continue;
    output[normalizedKey] = normalizedValue;
  }
  output.runtime = getTelemetryRuntime();
  output.plan_tier = readTaskTimerPlanFromStorage();
  return output;
}

function inferCrashlyticsType(value: string | number | boolean): "string" | "long" | "double" | "boolean" | "int" | "float" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return "long";
    return "double";
  }
  return "string";
}

async function getWebAnalyticsClient(): Promise<Analytics | null> {
  if (!isWebRuntime()) return null;
  if (!webAnalyticsState) {
    webAnalyticsState = (async () => {
      const supported = await isAnalyticsSupported().catch(() => false);
      if (!supported) return null;
      const app = getFirebaseAppClient();
      if (!app) return null;
      try {
        return getAnalytics(app);
      } catch {
        return null;
      }
    })();
  }
  return webAnalyticsState;
}

export async function initTelemetry(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  if (isNativeAndroidRuntime()) {
    await Promise.allSettled([
      FirebaseAnalytics.setEnabled({ enabled: true }),
      FirebaseCrashlytics.setEnabled({ enabled: true }),
      setCrashlyticsContext({
        runtime: "android",
        platform: "android",
        firebase_env: String(process.env.NEXT_PUBLIC_FIREBASE_ENV || "prod").trim() || "prod",
      }),
    ]);
    return;
  }
  await getWebAnalyticsClient();
}

export async function trackScreen(screenName: string, params?: TelemetryParams): Promise<void> {
  const normalizedScreenName = String(screenName || "").trim();
  if (!normalizedScreenName) return;
  await initTelemetry();
  const baseParams = sanitizeTelemetryParams(params);
  if (isNativeAndroidRuntime()) {
    await Promise.allSettled([
      FirebaseAnalytics.setCurrentScreen({
        screenName: normalizedScreenName,
        screenClassOverride: normalizedScreenName,
      }),
      FirebaseAnalytics.logEvent({
        name: "screen_view",
        params: {
          firebase_screen: normalizedScreenName,
          firebase_screen_class: normalizedScreenName,
          ...baseParams,
        },
      }),
      setCrashlyticsContext({
        current_screen: normalizedScreenName,
      }),
    ]);
    return;
  }
  const analytics = await getWebAnalyticsClient();
  if (!analytics) return;
  logWebAnalyticsEvent(analytics, "screen_view", {
    firebase_screen: normalizedScreenName,
    firebase_screen_class: normalizedScreenName,
    ...baseParams,
  });
}

export async function trackEvent(name: string, params?: TelemetryParams): Promise<void> {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return;
  await initTelemetry();
  const normalizedParams = sanitizeTelemetryParams(params);
  if (isNativeAndroidRuntime()) {
    await FirebaseAnalytics.logEvent({
      name: normalizedName,
      params: normalizedParams,
    }).catch(() => {});
    return;
  }
  const analytics = await getWebAnalyticsClient();
  if (!analytics) return;
  logWebAnalyticsEvent(analytics, normalizedName, normalizedParams);
}

export async function setTelemetryUser(userId: string | null): Promise<void> {
  await initTelemetry();
  const normalizedUserId = String(userId || "").trim() || null;
  if (isNativeAndroidRuntime()) {
    await Promise.allSettled([
      FirebaseAnalytics.setUserId({ userId: normalizedUserId }),
      normalizedUserId
        ? FirebaseCrashlytics.setUserId({ userId: normalizedUserId })
        : FirebaseCrashlytics.setUserId({ userId: "" }),
    ]);
    return;
  }
  const analytics = await getWebAnalyticsClient();
  if (!analytics) return;
  setWebAnalyticsUserId(analytics, normalizedUserId);
}

export async function setCrashlyticsContext(keys: TelemetryParams): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  const normalized = sanitizeTelemetryParams(keys);
  const entries = Object.entries(normalized);
  if (!entries.length) return;
  await Promise.allSettled(
    entries.map(([key, value]) =>
      FirebaseCrashlytics.setCustomKey({
        key,
        value,
        type: inferCrashlyticsType(value),
      })
    )
  );
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || "Unknown error";
  const message = String(error ?? "").trim();
  return message || "Unknown error";
}

export async function recordNonFatal(error: unknown, context?: TelemetryParams): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  const message = buildErrorMessage(error);
  const keysAndValues = Object.entries(sanitizeTelemetryParams(context)).map(([key, value]) => ({
    key,
    value,
    type: inferCrashlyticsType(value),
  }));
  await FirebaseCrashlytics.recordException({
    message,
    keysAndValues,
  }).catch(() => {});
}

export async function triggerCrashlyticsTestCrash(): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  const isDebugTelemetryEnv = String(process.env.NEXT_PUBLIC_FIREBASE_ENV || "prod").trim().toLowerCase() === "debug";
  if (!isDebugTelemetryEnv) return;
  await FirebaseCrashlytics.crash({ message: "TaskLaunch Crashlytics test crash" }).catch(() => {});
}

export function getTelemetryPlanTier(): TaskTimerPlan {
  return readTaskTimerPlanFromStorage();
}
