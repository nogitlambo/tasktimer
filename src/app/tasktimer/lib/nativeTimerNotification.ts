"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type TaskLaunchTimerNotificationPlugin = {
  showRunningTimer: (input: {
    taskId: string;
    taskName: string;
    startedAtMs: number;
    elapsedBeforeStartMs?: number;
    timeGoalTriggerAtMs?: number;
    sourceNotificationId?: number;
  }) => Promise<{ notificationId?: number } | void>;
  clearRunningTimer: (input: { taskId: string }) => Promise<void>;
  getAlarmPermissionStatus: () => Promise<{ exactAlarmGranted?: boolean; notificationsGranted?: boolean }>;
  openAlarmPermissionSettings: () => Promise<void>;
  syncCheckpointAlarms: (input: { alarms: NativeCheckpointAlarm[] }) => Promise<void>;
  cancelCheckpointAlarms: (input: { taskId: string }) => Promise<void>;
  dismissCheckpointAlarm: (input?: { taskId?: string }) => Promise<void>;
};

export type NativeCheckpointAlarm = {
  taskId: string;
  taskName: string;
  checkpointKey: string;
  checkpointLabel: string;
  triggerAtMs: number;
  soundMode: "once" | "repeat";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

const TASK_LAUNCH_TIMER_NOTIFICATION_PLUGIN_NAME = "TaskLaunchTimerNotification";
const TASK_LAUNCH_TIMER_NOTIFICATION_CACHE_KEY = "__taskLaunchTimerNotificationPlugin";

type TaskLaunchTimerNotificationGlobal = typeof globalThis & {
  [TASK_LAUNCH_TIMER_NOTIFICATION_CACHE_KEY]?: TaskLaunchTimerNotificationPlugin;
};

type CapacitorPluginRegistry = {
  Plugins?: Record<string, TaskLaunchTimerNotificationPlugin | undefined>;
};

function getTaskLaunchTimerNotificationPlugin() {
  const globalRef = globalThis as TaskLaunchTimerNotificationGlobal;
  if (globalRef[TASK_LAUNCH_TIMER_NOTIFICATION_CACHE_KEY]) {
    return globalRef[TASK_LAUNCH_TIMER_NOTIFICATION_CACHE_KEY];
  }

  const existingPlugin = (Capacitor as unknown as CapacitorPluginRegistry).Plugins?.[
    TASK_LAUNCH_TIMER_NOTIFICATION_PLUGIN_NAME
  ];
  const plugin = existingPlugin || registerPlugin<TaskLaunchTimerNotificationPlugin>(
    TASK_LAUNCH_TIMER_NOTIFICATION_PLUGIN_NAME,
  );
  globalRef[TASK_LAUNCH_TIMER_NOTIFICATION_CACHE_KEY] = plugin;
  return plugin;
}

const TaskLaunchTimerNotification = getTaskLaunchTimerNotificationPlugin();
const pendingSourceNotificationIdsByTaskId = new Map<string, number>();
let lastCheckpointAlarmSignature = "";
const NATIVE_CHECKPOINT_DUE_GRACE_MS = 10_000;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lastCheckpointAlarmSignature = "";
  });
}

function isAndroidNativeRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function normalizeTaskId(taskId: string | null | undefined) {
  return String(taskId || "").trim();
}

export function setPendingRunningTimerSourceNotification(taskId: string | null | undefined, sourceNotificationId: unknown) {
  const normalizedTaskId = normalizeTaskId(taskId);
  const normalizedSourceId = Math.max(0, Math.floor(Number(sourceNotificationId || 0) || 0));
  if (!normalizedTaskId || !normalizedSourceId) return;
  pendingSourceNotificationIdsByTaskId.set(normalizedTaskId, normalizedSourceId);
}

function consumePendingRunningTimerSourceNotification(taskId: string) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) return 0;
  const sourceNotificationId = pendingSourceNotificationIdsByTaskId.get(normalizedTaskId) || 0;
  pendingSourceNotificationIdsByTaskId.delete(normalizedTaskId);
  return sourceNotificationId;
}

export async function showNativeRunningTimerNotification(input: {
  taskId: string;
  taskName: string;
  startedAtMs: number;
  elapsedBeforeStartMs?: number;
  timeGoalTriggerAtMs?: number;
}) {
  const taskId = normalizeTaskId(input.taskId);
  if (!taskId || !isAndroidNativeRuntime()) return;
  const sourceNotificationId = consumePendingRunningTimerSourceNotification(taskId);
  const timeGoalTriggerAtMs = Math.max(0, Math.floor(Number(input.timeGoalTriggerAtMs || 0) || 0));
  await TaskLaunchTimerNotification.showRunningTimer({
    taskId,
    taskName: String(input.taskName || "Task").trim() || "Task",
    startedAtMs: Math.max(0, Math.floor(Number(input.startedAtMs || 0) || 0)),
    elapsedBeforeStartMs: Math.max(0, Math.floor(Number(input.elapsedBeforeStartMs || 0) || 0)),
    ...(timeGoalTriggerAtMs > 0 ? { timeGoalTriggerAtMs } : {}),
    sourceNotificationId,
  });
}

export async function clearNativeRunningTimerNotification(taskId: string | null | undefined) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) return;
  pendingSourceNotificationIdsByTaskId.delete(normalizedTaskId);
  if (!isAndroidNativeRuntime()) return;
  await Promise.all([
    TaskLaunchTimerNotification.clearRunningTimer({ taskId: normalizedTaskId }),
    TaskLaunchTimerNotification.cancelCheckpointAlarms({ taskId: normalizedTaskId }),
  ]);
  lastCheckpointAlarmSignature = "";
}

export function isNativeAndroidCheckpointAlarmRuntime() {
  return isAndroidNativeRuntime();
}

export async function getNativeCheckpointAlarmPermissionStatus() {
  if (!isAndroidNativeRuntime()) return { supported: false, exactAlarmGranted: false, notificationsGranted: false };
  const status = await TaskLaunchTimerNotification.getAlarmPermissionStatus();
  return {
    supported: true,
    exactAlarmGranted: status?.exactAlarmGranted === true,
    notificationsGranted: status?.notificationsGranted === true,
  };
}

export async function openNativeCheckpointAlarmPermissionSettings() {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchTimerNotification.openAlarmPermissionSettings();
}

export async function syncNativeCheckpointAlarms(alarms: NativeCheckpointAlarm[]) {
  if (!isAndroidNativeRuntime()) return;
  const normalized = alarms
    .filter((alarm) => normalizeTaskId(alarm.taskId) && Number(alarm.triggerAtMs) + NATIVE_CHECKPOINT_DUE_GRACE_MS > Date.now())
    .map((alarm) => ({
      ...alarm,
      taskId: normalizeTaskId(alarm.taskId),
      taskName: String(alarm.taskName || "Task").trim() || "Task",
      checkpointKey: String(alarm.checkpointKey || "").trim(),
      checkpointLabel: String(alarm.checkpointLabel || "Checkpoint").trim() || "Checkpoint",
      triggerAtMs: Math.floor(Number(alarm.triggerAtMs)),
      soundMode: alarm.soundMode === "repeat" ? "repeat" as const : "once" as const,
      soundEnabled: alarm.soundEnabled !== false,
      vibrationEnabled: alarm.vibrationEnabled === true,
    }))
    .sort((a, b) => a.triggerAtMs - b.triggerAtMs || a.checkpointKey.localeCompare(b.checkpointKey));
  const signature = JSON.stringify(normalized);
  if (signature === lastCheckpointAlarmSignature) return;
  lastCheckpointAlarmSignature = signature;
  try {
    await TaskLaunchTimerNotification.syncCheckpointAlarms({ alarms: normalized });
  } catch (error) {
    lastCheckpointAlarmSignature = "";
    throw error;
  }
}

export async function dismissNativeCheckpointAlarm(taskId?: string | null) {
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchTimerNotification.dismissCheckpointAlarm({ taskId: normalizeTaskId(taskId) || undefined });
}
