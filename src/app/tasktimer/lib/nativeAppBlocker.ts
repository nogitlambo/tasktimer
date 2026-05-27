"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeBlockedApp = {
  packageName: string;
  label: string;
};

export type NativeAppBlockerStatus = {
  supported: boolean;
  usageAccessGranted: boolean;
  overlayPermissionGranted: boolean;
  active: boolean;
};

type TaskLaunchAppBlockerPlugin = {
  getStatus: () => Promise<NativeAppBlockerStatus>;
  openUsageAccessSettings: () => Promise<void>;
  openOverlaySettings: () => Promise<void>;
  listLaunchableApps: () => Promise<{ apps?: NativeBlockedApp[] }>;
  startBlockingSession: (input: {
    blockedPackages: string[];
    taskId: string;
    taskName: string;
  }) => Promise<void>;
  stopBlockingSession: () => Promise<void>;
};

export const APP_BLOCKING_ENABLED_KEY_SUFFIX = "appBlockingEnabled";
export const BLOCKED_ANDROID_APP_PACKAGES_KEY_SUFFIX = "blockedAndroidAppPackages";

const TaskLaunchAppBlocker = registerPlugin<TaskLaunchAppBlockerPlugin>("TaskLaunchAppBlocker");

function isAndroidNativeRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function normalizePackageName(value: unknown) {
  return String(value || "").trim();
}

export function normalizeBlockedAppPackages(values: unknown): string[] {
  const input = Array.isArray(values) ? values : [];
  return Array.from(new Set(input.map(normalizePackageName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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

function safeParsePackages(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return normalizeBlockedAppPackages(parsed);
  } catch {
    return normalizeBlockedAppPackages(trimmed.split(","));
  }
}

export function getAppBlockingEnabled(storageKey: string) {
  return safeReadLocalStorage(`${storageKey}:${APP_BLOCKING_ENABLED_KEY_SUFFIX}`).toLowerCase() === "true";
}

export function setAppBlockingEnabled(storageKey: string, enabled: boolean) {
  safeWriteLocalStorage(`${storageKey}:${APP_BLOCKING_ENABLED_KEY_SUFFIX}`, enabled ? "true" : "false");
}

export function loadBlockedAndroidAppPackages(storageKey: string) {
  return safeParsePackages(safeReadLocalStorage(`${storageKey}:${BLOCKED_ANDROID_APP_PACKAGES_KEY_SUFFIX}`));
}

export function saveBlockedAndroidAppPackages(storageKey: string, packages: unknown) {
  safeWriteLocalStorage(
    `${storageKey}:${BLOCKED_ANDROID_APP_PACKAGES_KEY_SUFFIX}`,
    JSON.stringify(normalizeBlockedAppPackages(packages))
  );
}

export function toggleBlockedAndroidAppPackage(storageKey: string, packageNameRaw: unknown) {
  const packageName = normalizePackageName(packageNameRaw);
  if (!packageName) return loadBlockedAndroidAppPackages(storageKey);
  const current = new Set(loadBlockedAndroidAppPackages(storageKey));
  if (current.has(packageName)) current.delete(packageName);
  else current.add(packageName);
  const next = normalizeBlockedAppPackages(Array.from(current));
  saveBlockedAndroidAppPackages(storageKey, next);
  return next;
}

export function isNativeAppBlockingAvailable() {
  return isAndroidNativeRuntime();
}

export async function getNativeAppBlockerStatus(): Promise<NativeAppBlockerStatus> {
  if (!isAndroidNativeRuntime()) {
    return {
      supported: false,
      usageAccessGranted: false,
      overlayPermissionGranted: false,
      active: false,
    };
  }
  return TaskLaunchAppBlocker.getStatus();
}

export async function openNativeAppBlockerUsageAccessSettings() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchAppBlocker.openUsageAccessSettings();
}

export async function openNativeAppBlockerOverlaySettings() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchAppBlocker.openOverlaySettings();
}

export async function listNativeLaunchableApps(): Promise<NativeBlockedApp[]> {
  if (!isAndroidNativeRuntime()) return [];
  const result = await TaskLaunchAppBlocker.listLaunchableApps();
  return Array.isArray(result?.apps)
    ? result.apps
        .map((app) => ({
          packageName: normalizePackageName(app.packageName),
          label: String(app.label || app.packageName || "App").trim() || "App",
        }))
        .filter((app) => !!app.packageName)
    : [];
}

export async function startNativeAppBlockingForFocusMode(input: {
  storageKey: string;
  taskId: string | null | undefined;
  taskName: string | null | undefined;
}): Promise<NativeAppBlockerStatus> {
  const status = await getNativeAppBlockerStatus();
  if (!status.supported || !getAppBlockingEnabled(input.storageKey)) return status;
  const blockedPackages = loadBlockedAndroidAppPackages(input.storageKey);
  if (!blockedPackages.length || !status.usageAccessGranted || !status.overlayPermissionGranted) return status;
  await TaskLaunchAppBlocker.startBlockingSession({
    blockedPackages,
    taskId: normalizePackageName(input.taskId),
    taskName: String(input.taskName || "Task").trim() || "Task",
  });
  return getNativeAppBlockerStatus();
}

export async function stopNativeAppBlockingForFocusMode() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchAppBlocker.stopBlockingSession();
}
