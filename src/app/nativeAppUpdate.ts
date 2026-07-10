"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeAppUpdateStatus = "not_available" | "not_allowed" | "started" | "failed";

export type NativeAppUpdateResult = {
  status: NativeAppUpdateStatus;
  availableVersionCode?: number;
  updateAvailability?: number;
  resultCode?: number;
  message?: string;
};

export type NativeAppUpdateGateResult =
  | { status: "skipped"; reason: "not_android_native" }
  | { status: "timeout" }
  | NativeAppUpdateResult;

type TaskLaunchAppUpdatePlugin = {
  checkForImmediateUpdate: () => Promise<NativeAppUpdateResult>;
};

type NativeAppUpdateGateOptions = {
  timeoutMs?: number;
  recordNonFatal?: (error: unknown, context?: Record<string, string | number | boolean>) => Promise<void> | void;
};

export const NATIVE_APP_UPDATE_TIMEOUT_MS = 3000;

const TaskLaunchAppUpdate = registerPlugin<TaskLaunchAppUpdatePlugin>("TaskLaunchAppUpdate");

let gateState: "idle" | "pending" | "settled" = "idle";
let gatePromise: Promise<NativeAppUpdateGateResult> | null = null;

function isAndroidNativeRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const message = String(error ?? "").trim();
  return message || "Unknown native app update error.";
}

async function recordNativeAppUpdateNonFatal(
  error: unknown,
  context: Record<string, string | number | boolean>,
  recorder?: NativeAppUpdateGateOptions["recordNonFatal"]
) {
  try {
    if (recorder) {
      await recorder(error, context);
      return;
    }
    const telemetry = await import("@/lib/firebaseTelemetry");
    await telemetry.recordNonFatal(error, context);
  } catch {
    // Update checks must never block launch because telemetry failed.
  }
}

function timeoutAfter(ms: number): Promise<NativeAppUpdateGateResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ status: "timeout" }), Math.max(0, ms));
  });
}

export function getNativeAppUpdateGateInitialPending() {
  return isAndroidNativeRuntime() && gateState !== "settled";
}

export function resetNativeAppUpdateGateForTests() {
  gateState = "idle";
  gatePromise = null;
}

export function runNativeAndroidAppUpdateGate(options: NativeAppUpdateGateOptions = {}): Promise<NativeAppUpdateGateResult> {
  if (!isAndroidNativeRuntime()) {
    gateState = "settled";
    return Promise.resolve({ status: "skipped", reason: "not_android_native" });
  }
  if (gatePromise) return gatePromise;

  gateState = "pending";
  const timeoutMs = options.timeoutMs ?? NATIVE_APP_UPDATE_TIMEOUT_MS;
  const updateCheck = TaskLaunchAppUpdate.checkForImmediateUpdate().catch((error: unknown): NativeAppUpdateResult => ({
    status: "failed",
    message: normalizeErrorMessage(error),
  }));

  gatePromise = Promise.race([updateCheck, timeoutAfter(timeoutMs)]).then(async (result) => {
    gateState = "settled";
    if (result.status === "timeout") {
      await recordNativeAppUpdateNonFatal(new Error("Native app update check timed out."), {
        flow: "native_app_update_gate",
        outcome: "timeout",
        timeout_ms: timeoutMs,
      }, options.recordNonFatal);
      return result;
    }
    if (result.status === "failed") {
      await recordNativeAppUpdateNonFatal(new Error(result.message || "Native app update check failed."), {
        flow: "native_app_update_gate",
        outcome: "failed",
        available_version_code: result.availableVersionCode ?? 0,
        update_availability: result.updateAvailability ?? 0,
        result_code: result.resultCode ?? 0,
      }, options.recordNonFatal);
    }
    return result;
  });

  return gatePromise;
}
