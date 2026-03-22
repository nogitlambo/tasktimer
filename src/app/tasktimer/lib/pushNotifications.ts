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

const PUSH_DEVICE_ID_KEY = "tasktimer:pushDeviceId";
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

let initPromise: Promise<() => void> | null = null;
let latestPushToken = "";

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

async function savePushTokenForUser(user: User | null, token: string) {
  const uid = String(user?.uid || "").trim();
  const normalizedToken = String(token || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!uid || !normalizedToken || !db) return;
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
      token: normalizedToken,
      platform,
      provider: "fcm",
      channelId: TASKLAUNCH_PUSH_CHANNEL_ID,
      native: true,
      appId: "com.tasklaunch.app",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
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
      if (process.env.NODE_ENV !== "production") {
        console.info("[push] Notification action", event);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !latestPushToken) return;
      void savePushTokenForUser(user, latestPushToken).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[push] Failed to sync token after auth change", error);
        }
      });
    });

    await registerForPush().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Failed to register for push notifications", error);
      }
    });

    return () => {
      unsubAuth();
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
