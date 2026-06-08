"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeFocusDndStatus = {
  supported: boolean;
  policyAccessGranted: boolean;
  active: boolean;
  interruptionFilter?: string;
};

export type NativeFocusDndAccessRequestResult = {
  launched: boolean;
  target: "detail" | "list" | "settings" | "none";
};

type TaskLaunchFocusDndPlugin = {
  getDndStatus: () => Promise<NativeFocusDndStatus>;
  openDndAccessSettings: () => Promise<void>;
  requestDndPolicyAccess: () => Promise<NativeFocusDndAccessRequestResult>;
  startFocusDndSession: () => Promise<void>;
  stopFocusDndSession: () => Promise<void>;
};

export const FOCUS_DND_ENABLED_KEY_SUFFIX = "focusDndEnabled";

const TaskLaunchFocusDnd = registerPlugin<TaskLaunchFocusDndPlugin>("TaskLaunchFocusDnd");

function isAndroidNativeRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function safeReadLocalStorage(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeWriteLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore local-only preference persistence failures.
  }
}

export function getFocusDndEnabled(storageKey: string) {
  return safeReadLocalStorage(`${storageKey}:${FOCUS_DND_ENABLED_KEY_SUFFIX}`).toLowerCase() === "true";
}

export function setFocusDndEnabled(storageKey: string, enabled: boolean) {
  safeWriteLocalStorage(`${storageKey}:${FOCUS_DND_ENABLED_KEY_SUFFIX}`, enabled ? "true" : "false");
}

export function isNativeFocusDndAvailable() {
  return isAndroidNativeRuntime();
}

export async function getNativeFocusDndStatus(): Promise<NativeFocusDndStatus> {
  if (!isAndroidNativeRuntime()) {
    return {
      supported: false,
      policyAccessGranted: false,
      active: false,
    };
  }
  return TaskLaunchFocusDnd.getDndStatus();
}

export async function openNativeFocusDndAccessSettings() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchFocusDnd.openDndAccessSettings();
}

export async function requestNativeFocusDndAccess(): Promise<NativeFocusDndAccessRequestResult> {
  if (!isAndroidNativeRuntime()) return { launched: false, target: "none" };
  return TaskLaunchFocusDnd.requestDndPolicyAccess();
}

export async function startNativeFocusDndSession(input: { storageKey: string }): Promise<NativeFocusDndStatus> {
  const status = await getNativeFocusDndStatus();
  if (!status.supported || !getFocusDndEnabled(input.storageKey) || !status.policyAccessGranted) return status;
  await TaskLaunchFocusDnd.startFocusDndSession();
  return getNativeFocusDndStatus();
}

export async function stopNativeFocusDndSession() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchFocusDnd.stopFocusDndSession();
}
