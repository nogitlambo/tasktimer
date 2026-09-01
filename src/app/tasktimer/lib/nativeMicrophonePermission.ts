"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeMicrophonePermissionStatus = {
  supported: boolean;
  granted: boolean;
  state: string;
};

type TaskLaunchMicrophonePermissionPlugin = {
  getMicrophonePermissionStatus: () => Promise<Omit<NativeMicrophonePermissionStatus, "supported">>;
  requestMicrophonePermission: () => Promise<Omit<NativeMicrophonePermissionStatus, "supported">>;
  openMicrophonePermissionSettings: () => Promise<void>;
};

const TaskLaunchMicrophonePermission = registerPlugin<TaskLaunchMicrophonePermissionPlugin>("TaskLaunchMicrophonePermission");
const unavailableStatus: NativeMicrophonePermissionStatus = { supported: false, granted: false, state: "unavailable" };

export function isNativeMicrophonePermissionAvailable() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export async function getNativeMicrophonePermissionStatus(): Promise<NativeMicrophonePermissionStatus> {
  if (!isNativeMicrophonePermissionAvailable()) return unavailableStatus;
  return { supported: true, ...(await TaskLaunchMicrophonePermission.getMicrophonePermissionStatus()) };
}

export async function requestNativeMicrophonePermission(): Promise<NativeMicrophonePermissionStatus> {
  if (!isNativeMicrophonePermissionAvailable()) return unavailableStatus;
  return { supported: true, ...(await TaskLaunchMicrophonePermission.requestMicrophonePermission()) };
}

export async function openNativeMicrophonePermissionSettings() {
  if (!isNativeMicrophonePermissionAvailable()) return;
  await TaskLaunchMicrophonePermission.openMicrophonePermissionSettings();
}
