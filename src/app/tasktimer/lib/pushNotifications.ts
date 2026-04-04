"use client";

import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type PushNotificationSchema,
  type PushNotificationToken,
  type ActionPerformed,
} from "@capacitor/push-notifications";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { STORAGE_KEY } from "./storage";

const PUSH_DEVICE_ID_KEY = "tasktimer:pushDeviceId";
const PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
export const TASKLAUNCH_PUSH_CHANNEL_ID = "tasklaunch-default";

export type PushDiagnostics = {
  runtime: "native" | "web";
  platform: string;
  deviceId: string;
  permission: string;
  localTokenPresent: boolean;
  cloudDocPresent: boolean;
  cloudTokenPresent: boolean;
};

type CapAppListenerHandle = {
  remove: () => Promise<void> | void;
};

type CapAppPlugin = {
  addListener?: (
    eventName: string,
    listener: (state: { isActive?: boolean } | null) => void
  ) => Promise<CapAppListenerHandle> | CapAppListenerHandle;
};

type CapacitorWindowShape = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    registerPlugin?: (name: string) => CapAppPlugin;
    Plugins?: {
      App?: CapAppPlugin;
    };
    App?: CapAppPlugin;
  };
};

let initPromise: Promise<() => void> | null = null;
let latestPushToken = "";

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return !!value && typeof value === "object" && "then" in value && typeof value.then === "function";
}

function isNativePushRuntime() {
  if (typeof window === "undefined") return false;
  if (!isNativeOrFileRuntime()) return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore crypto failures
  }
  return `push-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function getPushDeviceId() {
  if (typeof window === "undefined") return "server";
  try {
    const existing = String(window.localStorage.getItem(PUSH_DEVICE_ID_KEY) || "").trim();
    if (existing) return existing;
    const created = randomId();
    window.localStorage.setItem(PUSH_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

export function getTaskTimerPushDeviceId() {
  return getPushDeviceId();
}

function getTaskTimerRootPath() {
  if (typeof window === "undefined") return "/tasklaunch";
  const pathname = window.location.pathname || "";
  const normalized = pathname.replace(/\/+$/, "");
  const taskLaunchMatch = normalized.match(/^(.*?)(\/tasklaunch)(?:\/|$)/);
  if (taskLaunchMatch) return `${taskLaunchMatch[1] || ""}/tasklaunch`;
  const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide|feedback|dashboard|friends|index\.html)$/, "");
  return pageStyleRoot || normalized || "/tasklaunch";
}

function resolveTaskTimerTasksRoute() {
  if (typeof window === "undefined") return "/tasklaunch";
  const rootPath = getTaskTimerRootPath();
  const cap = (window as CapacitorWindowShape).Capacitor;
  const isNativeCapacitorRuntime = !!(
    cap &&
    typeof cap.isNativePlatform === "function" &&
    cap.isNativePlatform()
  );
  const currentPath = window.location.pathname || "";
  const usesExportedHtmlPaths =
    window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
  if (!usesExportedHtmlPaths) return rootPath;
  return `${rootPath.replace(/\/+$/, "")}/index.html`;
}

function getCapAppPlugin() {
  const cap = (window as CapacitorWindowShape).Capacitor;
  if (!cap) return null;
  const direct = cap?.Plugins?.App || cap?.App;
  if (direct) return direct;
  if (typeof cap?.registerPlugin === "function") {
    try {
      return cap.registerPlugin("App");
    } catch {
      return null;
    }
  }
  return null;
}

function setPendingPushTaskId(taskId: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    const normalizedTaskId = String(taskId || "").trim();
    if (normalizedTaskId) window.localStorage.setItem(PENDING_PUSH_TASK_ID_KEY, normalizedTaskId);
    else window.localStorage.removeItem(PENDING_PUSH_TASK_ID_KEY);
  } catch {
    // Ignore localStorage failures.
  }
}

function isAppActivelyForegrounded() {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

async function savePushDevicePatchForUser(user: User | null, patch: Record<string, unknown>) {
  const uid = String(user?.uid || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!uid || !db) return;
  const platform = (() => {
    try {
      return String(Capacitor.getPlatform?.() || "native");
    } catch {
      return "native";
    }
  })();
  await setDoc(
    doc(db, "users", uid, "devices", getPushDeviceId()),
    {
      platform,
      provider: "fcm",
      channelId: TASKLAUNCH_PUSH_CHANNEL_ID,
      native: true,
      appId: "com.tasklaunch.app",
      ...patch,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function savePushTokenForUser(user: User | null, token: string) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;
  await savePushDevicePatchForUser(user, {
    token: normalizedToken,
    appActive: isAppActivelyForegrounded(),
    appStateUpdatedAtMs: Date.now(),
  });
}

async function savePushAppStateForUser(user: User | null, isActive: boolean) {
  await savePushDevicePatchForUser(user, {
    appActive: !!isActive,
    appStateUpdatedAtMs: Date.now(),
  });
}

async function registerForPush() {
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] Notification permission not granted", { receive: permission.receive });
    }
    return;
  }
  try {
    await PushNotifications.createChannel({
      id: TASKLAUNCH_PUSH_CHANNEL_ID,
      name: "TaskLaunch Alerts",
      description: "TaskLaunch push notifications",
      importance: 5,
      visibility: 1,
      sound: "default",
    });
  } catch {
    // Channel creation is Android-only and safe to ignore elsewhere.
  }
  await PushNotifications.register();
}

export async function initTaskTimerPushNotifications(): Promise<() => void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isNativePushRuntime()) return () => {};

    const auth = getFirebaseAuthClient();
    if (!auth) return () => {};

    const registrationHandle = await PushNotifications.addListener("registration", (token: PushNotificationToken) => {
      latestPushToken = String(token.value || "").trim();
      if (!latestPushToken) return;
      void savePushTokenForUser(auth.currentUser, latestPushToken).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[push] Failed to save registration token", error);
        }
      });
    });

    const registrationErrorHandle = await PushNotifications.addListener("registrationError", (event) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Registration error", event);
      }
    });

    const receivedHandle = await PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[push] Notification received", notification);
      }
    });

    const actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (event: ActionPerformed) => {
      const data = event?.notification?.data && typeof event.notification.data === "object"
        ? (event.notification.data as Record<string, unknown>)
        : {};
      const taskId = String(data.taskId || "").trim();
      const route = String(data.route || "/tasklaunch").trim();
      if (taskId) setPendingPushTaskId(taskId);
      try {
        window.dispatchEvent(new CustomEvent(PENDING_PUSH_TASK_EVENT, { detail: { taskId } }));
      } catch {
        // Ignore custom event failures.
      }
      if (
        route.startsWith("/tasklaunch") &&
        !(/\/tasklaunch\/?$/i.test(window.location.pathname || "") || /\/tasklaunch\/index\.html$/i.test(window.location.pathname || ""))
      ) {
        window.location.href = resolveTaskTimerTasksRoute();
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[push] Notification action", event);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user && latestPushToken) {
        void savePushTokenForUser(user, latestPushToken).catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.error("[push] Failed to sync token after auth change", error);
          }
        });
      }
      void savePushAppStateForUser(user, isAppActivelyForegrounded()).catch(() => {});
    });

    const onVisibilityChange = () => {
      void savePushAppStateForUser(auth.currentUser, isAppActivelyForegrounded()).catch(() => {});
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    let removeCapAppStateListener: (() => void) | null = null;
    try {
      const capApp = getCapAppPlugin();
      if (capApp?.addListener) {
        const maybePromise = capApp.addListener("appStateChange", (state: { isActive?: boolean } | null) => {
          void savePushAppStateForUser(auth.currentUser, !!state?.isActive).catch(() => {});
        });
        if (isPromiseLike(maybePromise)) {
          maybePromise
            .then((h) => {
              if (h?.remove) removeCapAppStateListener = () => h.remove();
            })
            .catch(() => {});
        } else if (maybePromise?.remove) {
          removeCapAppStateListener = () => maybePromise.remove();
        }
      }
    } catch {
      // Ignore native app-state listener failures.
    }

    await registerForPush().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Failed to register for push notifications", error);
      }
    });
    void savePushAppStateForUser(auth.currentUser, isAppActivelyForegrounded()).catch(() => {});

    return () => {
      unsubAuth();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (removeCapAppStateListener) removeCapAppStateListener();
      void registrationHandle.remove();
      void registrationErrorHandle.remove();
      void receivedHandle.remove();
      void actionHandle.remove();
      initPromise = null;
    };
  })();

  return initPromise;
}

export async function getTaskTimerPushDiagnostics(uid: string | null | undefined): Promise<PushDiagnostics> {
  const normalizedUid = String(uid || "").trim();
  const nativeRuntime = isNativePushRuntime();
  const deviceId = getPushDeviceId();
  const platform = (() => {
    try {
      return String(Capacitor.getPlatform?.() || (nativeRuntime ? "native" : "web"));
    } catch {
      return nativeRuntime ? "native" : "web";
    }
  })();

  let permission = "n/a";
  if (nativeRuntime) {
    try {
      const result = await PushNotifications.checkPermissions();
      permission = String(result.receive || "unknown");
    } catch {
      permission = "unknown";
    }
  }

  const diagnostics: PushDiagnostics = {
    runtime: nativeRuntime ? "native" : "web",
    platform,
    deviceId,
    permission,
    localTokenPresent: !!latestPushToken,
    cloudDocPresent: false,
    cloudTokenPresent: false,
  };

  if (!normalizedUid) return diagnostics;

  const db = getFirebaseFirestoreClient();
  if (!db) return diagnostics;

  try {
    const snap = await getDoc(doc(db, "users", normalizedUid, "devices", deviceId));
    diagnostics.cloudDocPresent = snap.exists();
    diagnostics.cloudTokenPresent = snap.exists() && !!String(snap.get("token") || "").trim();
  } catch {
    // Keep the diagnostics partial when Firestore is unavailable.
  }

  return diagnostics;
}
