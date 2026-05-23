"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type TaskLaunchTimerNotificationPlugin = {
  showRunningTimer: (input: {
    taskId: string;
    taskName: string;
    startedAtMs: number;
    elapsedBeforeStartMs?: number;
    sourceNotificationId?: number;
  }) => Promise<{ notificationId?: number } | void>;
  clearRunningTimer: (input: { taskId: string }) => Promise<void>;
};

const TaskLaunchTimerNotification = registerPlugin<TaskLaunchTimerNotificationPlugin>("TaskLaunchTimerNotification");
const pendingSourceNotificationIdsByTaskId = new Map<string, number>();

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
}) {
  const taskId = normalizeTaskId(input.taskId);
  if (!taskId || !isAndroidNativeRuntime()) return;
  const sourceNotificationId = consumePendingRunningTimerSourceNotification(taskId);
  await TaskLaunchTimerNotification.showRunningTimer({
    taskId,
    taskName: String(input.taskName || "Task").trim() || "Task",
    startedAtMs: Math.max(0, Math.floor(Number(input.startedAtMs || 0) || 0)),
    elapsedBeforeStartMs: Math.max(0, Math.floor(Number(input.elapsedBeforeStartMs || 0) || 0)),
    sourceNotificationId,
  });
}

export async function clearNativeRunningTimerNotification(taskId: string | null | undefined) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) return;
  pendingSourceNotificationIdsByTaskId.delete(normalizedTaskId);
  if (!isAndroidNativeRuntime()) return;
  await TaskLaunchTimerNotification.clearRunningTimer({ taskId: normalizedTaskId });
}
