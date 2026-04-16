import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import type { Task } from "../lib/types";
import type { AppPage } from "./types";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { getTaskTimerPushDeviceId, loadPendingPushAction } from "../lib/pushNotifications";
import { applyScheduledPushAction } from "../lib/pushFunctions";

type HandlePendingPushActionOptions = {
  getTasks: () => Task[];
  clearPendingPushAction: () => void;
  startTaskByIndex: (index: number) => void;
  jumpToTaskById: (taskId: string) => void;
  maybeRestorePendingTimeGoalFlow: () => void;
};

type HandleArchieNavigateOptions = {
  applyAppPage: (page: AppPage, opts?: { pushNavStack?: boolean; syncUrl?: "replace" | "push" | false }) => void;
  navigateToAppRoute: (path: string) => void;
};

type SubscribeToCheckpointAlertMuteSignalsOptions = {
  checkpointRepeatActiveTaskId: () => string | null;
  stopCheckpointRepeatAlert: () => void;
};

export function getCurrentTaskTimerUid() {
  return String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
}

export function getCurrentTaskTimerEmail() {
  return String(getFirebaseAuthClient()?.currentUser?.email || "").trim();
}

export function clearTaskTimerPendingPushAction(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // ignore localStorage failures
  }
}

export async function maybeHandleTaskTimerPendingPushAction(options: HandlePendingPushActionOptions) {
  const pending = loadPendingPushAction();
  if (!pending) return;
  if (!getCurrentTaskTimerUid()) return;
  const taskId = String(pending.taskId || "").trim();
  if (!taskId) {
    options.clearPendingPushAction();
    return;
  }
  const taskIndex = options.getTasks().findIndex((row) => String(row.id || "").trim() === taskId);
  if (taskIndex < 0) return;
  options.clearPendingPushAction();
  if (pending.actionId === "launchTask") {
    void applyScheduledPushAction({
      actionId: "launchTask",
      taskId,
      route: pending.route,
      deviceId: getTaskTimerPushDeviceId(),
    }).catch(() => {});
    options.startTaskByIndex(taskIndex);
    return;
  }
  if (pending.actionId === "snooze10m") {
    void applyScheduledPushAction({
      actionId: "snooze10m",
      taskId,
      route: pending.route,
      deviceId: getTaskTimerPushDeviceId(),
    }).catch(() => {});
    options.jumpToTaskById(taskId);
    return;
  }
  if (pending.actionId === "postponeNextGap") {
    void applyScheduledPushAction({
      actionId: "postponeNextGap",
      taskId,
      route: pending.route,
      deviceId: getTaskTimerPushDeviceId(),
    }).catch(() => {});
    options.jumpToTaskById(taskId);
    return;
  }
  options.jumpToTaskById(taskId);
  options.maybeRestorePendingTimeGoalFlow();
  window.setTimeout(() => options.maybeRestorePendingTimeGoalFlow(), 120);
}

export function handleTaskTimerArchieNavigate(hrefRaw: unknown, options: HandleArchieNavigateOptions) {
  const href = String(hrefRaw || "").trim();
  if (!href) return;
  if (href === "/tasklaunch") {
    options.applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" });
    return;
  }
  if (href === "/dashboard") {
    options.applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" });
    return;
  }
  if (href === "/friends") {
    options.applyAppPage("test2", { pushNavStack: true, syncUrl: "push" });
    return;
  }
  options.navigateToAppRoute(href);
}

export function broadcastTaskTimerCheckpointAlertMute(taskIdRaw: string) {
  const uid = getCurrentTaskTimerUid();
  const taskId = String(taskIdRaw || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!uid || !taskId || !db) return;
  void setDoc(
    doc(db, "users", uid, "devices", getTaskTimerPushDeviceId()),
    {
      checkpointAlertMuteTaskId: taskId,
      checkpointAlertMuteAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  ).catch(() => {});
}

export function extractLatestCheckpointAlertMuteSignal(entries: Array<Record<string, unknown>>, lastProcessedMuteAtMs: number) {
  let latestMuteAtMs = lastProcessedMuteAtMs;
  let latestMutedTaskId = "";
  entries.forEach((data) => {
    const muteAtMs = Math.max(0, Math.floor(Number(data?.checkpointAlertMuteAtMs || 0) || 0));
    if (muteAtMs < latestMuteAtMs) return;
    latestMuteAtMs = muteAtMs;
    latestMutedTaskId = String(data?.checkpointAlertMuteTaskId || "").trim();
  });
  return { latestMuteAtMs, latestMutedTaskId };
}

export function subscribeToTaskTimerCheckpointAlertMuteSignals(options: SubscribeToCheckpointAlertMuteSignalsOptions) {
  const uid = getCurrentTaskTimerUid();
  const db = getFirebaseFirestoreClient();
  if (!uid || !db) return null;
  let isInitialSnapshot = true;
  let lastProcessedMuteAtMs = 0;
  return onSnapshot(
    collection(db, "users", uid, "devices"),
    (snapshot) => {
      const { latestMuteAtMs, latestMutedTaskId } = extractLatestCheckpointAlertMuteSignal(
        snapshot.docs.map((docSnap) => (docSnap.data() as Record<string, unknown>) || {}),
        lastProcessedMuteAtMs
      );
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        lastProcessedMuteAtMs = latestMuteAtMs;
        return;
      }
      if (latestMuteAtMs <= lastProcessedMuteAtMs || !latestMutedTaskId) return;
      lastProcessedMuteAtMs = latestMuteAtMs;
      if (options.checkpointRepeatActiveTaskId() === latestMutedTaskId) {
        options.stopCheckpointRepeatAlert();
      }
    },
    () => {}
  );
}
