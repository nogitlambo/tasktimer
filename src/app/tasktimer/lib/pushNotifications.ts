"use client";

import { Capacitor } from "@capacitor/core";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import {
  PushNotifications,
  type PushNotificationSchema,
  type PushNotificationToken,
  type ActionPerformed,
} from "@capacitor/push-notifications";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { getFirebaseAppClient, getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { STORAGE_KEY } from "./storage";
import { normalizePendingPushActionId } from "./pushNotificationAction";

const PUSH_DEVICE_ID_KEY = "tasktimer:pushDeviceId";
const PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const PENDING_PUSH_ACTION_KEY = `${STORAGE_KEY}:pendingPushAction`;
const PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
export const TASKLAUNCH_PUSH_CHANNEL_ID = "tasklaunch-default";
const firebaseWebPushVapidKey = normalizePublicFirebaseConfigValue(
  process.env.NEXT_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY
);

type PendingPushAction = {
  taskId: string;
  route: string;
  actionId: "default" | "launchTask" | "snooze10m" | "postponeNextGap";
};

type PushDiagnostics = {
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

type PushNotificationsPluginShape = typeof PushNotifications & {
  unregister?: () => Promise<void>;
};

type PushChannelPreference = {
  mobileEnabled: boolean;
  webEnabled: boolean;
};

let latestPushToken = "";
let latestWebPushToken = "";
let runtimeCleanup: (() => void) | null = null;
let runtimeEnabled = false;
let desiredPushEnabled: PushChannelPreference = { mobileEnabled: false, webEnabled: false };
let syncPromise: Promise<PushChannelPreference> = Promise.resolve(desiredPushEnabled);
let lastSyncedUid = "";

function normalizePublicFirebaseConfigValue(value: string | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized || /^replace-with-/i.test(normalized)) return "";
  return normalized;
}

function normalizePushChannelPreference(input: boolean | Partial<PushChannelPreference>): PushChannelPreference {
  if (typeof input === "boolean") {
    return { mobileEnabled: input, webEnabled: input };
  }
  return {
    mobileEnabled: !!input.mobileEnabled,
    webEnabled: !!input.webEnabled,
  };
}

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

async function isWebPushRuntimeSupported() {
  if (typeof window === "undefined" || isNativeOrFileRuntime()) return false;
  if (!firebaseWebPushVapidKey) return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
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
  return "/tasklaunch";
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
  lastSyncedUid = uid;
  const nativeRuntime = isNativePushRuntime();
  const platform = nativeRuntime
    ? (() => {
        try {
          return String(Capacitor.getPlatform?.() || "native");
        } catch {
          return "native";
        }
      })()
    : "web";
  await setDoc(
    doc(db, "users", uid, "devices", getPushDeviceId()),
    {
      platform,
      provider: "fcm",
      channelId: nativeRuntime ? TASKLAUNCH_PUSH_CHANNEL_ID : null,
      native: nativeRuntime,
      appId: nativeRuntime ? "com.tasklaunch.app" : null,
      kind: nativeRuntime ? "native" : "webpush",
      scope: nativeRuntime ? "native" : "web",
      ...patch,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function clearDuplicatePushTokenRegistrations(
  uid: string | null | undefined,
  token: string,
  opts?: { keepCurrentDevice?: boolean }
) {
  const normalizedUid = String(uid || "").trim();
  const normalizedToken = String(token || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!normalizedUid || !normalizedToken || !db) return;

  const currentDeviceId = getPushDeviceId();
  const devicesRef = collection(db, "users", normalizedUid, "devices");
  const snapshot = await getDocs(query(devicesRef, where("token", "==", normalizedToken)));
  if (snapshot.empty) return;

  await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      if (opts?.keepCurrentDevice && docSnap.id === currentDeviceId) return;
      await setDoc(
        doc(db, "users", normalizedUid, "devices", docSnap.id),
        {
          enabled: false,
          appActive: false,
          appStateUpdatedAtMs: Date.now(),
          token: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

async function clearPushDeviceForUid(uid: string | null | undefined) {
  const normalizedUid = String(uid || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!normalizedUid || !db) return;
  const tokenToClear = String(latestPushToken || latestWebPushToken || "").trim();
  await setDoc(
    doc(db, "users", normalizedUid, "devices", getPushDeviceId()),
    {
      enabled: false,
      appActive: false,
      appStateUpdatedAtMs: Date.now(),
      token: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (tokenToClear) {
    await clearDuplicatePushTokenRegistrations(normalizedUid, tokenToClear);
  }
}

async function clearPushDeviceForUser(user: User | null) {
  const uid = String(user?.uid || lastSyncedUid || "").trim();
  if (!uid) return;
  await clearPushDeviceForUid(uid);
  if (uid === lastSyncedUid) lastSyncedUid = "";
}

async function savePushTokenForUser(user: User | null, token: string) {
  const normalizedToken = String(token || "").trim();
  const normalizedUid = String(user?.uid || "").trim();
  if (!normalizedToken || !normalizedUid) return;
  await clearDuplicatePushTokenRegistrations(normalizedUid, normalizedToken, { keepCurrentDevice: true });
  await savePushDevicePatchForUser(user, {
    token: normalizedToken,
    enabled: true,
    appActive: isAppActivelyForegrounded(),
    appStateUpdatedAtMs: Date.now(),
  });
}

async function saveWebPushTokenForUser(user: User | null, token: string) {
  const normalizedToken = String(token || "").trim();
  const normalizedUid = String(user?.uid || "").trim();
  if (!normalizedToken || !normalizedUid) return;
  await clearDuplicatePushTokenRegistrations(normalizedUid, normalizedToken, { keepCurrentDevice: true });
  await savePushDevicePatchForUser(user, {
    token: normalizedToken,
    enabled: true,
    native: false,
    platform: "web",
    kind: "webpush",
    scope: "web",
    channelId: null,
    appActive: isAppActivelyForegrounded(),
    appStateUpdatedAtMs: Date.now(),
  });
  if (process.env.NODE_ENV !== "production") {
    console.info("[push] Saved web push token", {
      uid: normalizedUid,
      deviceId: getPushDeviceId(),
      tokenPreview: `${normalizedToken.slice(0, 12)}...`,
    });
  }
}

function normalizePendingPushAction(
  input: Partial<PendingPushAction> | null | undefined
): PendingPushAction | null {
  const taskId = String(input?.taskId || "").trim();
  if (!taskId) return null;
  const route = String(input?.route || "/tasklaunch").trim() || "/tasklaunch";
  const actionId = normalizePendingPushActionId(input?.actionId);
  return { taskId, route, actionId };
}

function setPendingPushAction(action: Partial<PendingPushAction> | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizePendingPushAction(action);
    if (normalized) window.localStorage.setItem(PENDING_PUSH_ACTION_KEY, JSON.stringify(normalized));
    else window.localStorage.removeItem(PENDING_PUSH_ACTION_KEY);
  } catch {
    // Ignore localStorage failures.
  }
}

export function loadPendingPushAction(): PendingPushAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_PUSH_ACTION_KEY);
    if (!raw) return null;
    return normalizePendingPushAction(JSON.parse(raw) as Partial<PendingPushAction>);
  } catch {
    return null;
  }
}

async function savePushAppStateForUser(user: User | null, isActive: boolean) {
  if (!user) return;
  await savePushDevicePatchForUser(user, {
    enabled: true,
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
    return false;
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
  return true;
}

async function unregisterForPush() {
  const plugin = PushNotifications as PushNotificationsPluginShape;
  if (typeof plugin.unregister !== "function") return;
  await plugin.unregister();
}

async function unregisterWebPush() {
  if (!(await isWebPushRuntimeSupported())) return;
  try {
    const app = getFirebaseAppClient();
    if (!app) return;
    await deleteToken(getMessaging(app));
  } catch {
    // Ignore web unregister failures.
  }
  latestWebPushToken = "";
}

function removeListenerHandle(handle: CapAppListenerHandle | null | undefined) {
  if (!handle?.remove) return;
  try {
    void handle.remove();
  } catch {
    // Ignore listener cleanup failures.
  }
}

async function disableTaskTimerPushRuntime(opts?: { clearCloudRegistration?: boolean }) {
  const cleanup = runtimeCleanup;
  runtimeCleanup = null;
  runtimeEnabled = false;
  if (cleanup) cleanup();
  try {
    await unregisterForPush();
  } catch {
    // Ignore unregister failures; removing backend eligibility is the important part.
  }
  if (opts?.clearCloudRegistration) {
    try {
      const auth = getFirebaseAuthClient();
      await clearPushDeviceForUser(auth?.currentUser || null);
    } catch {
      // Ignore cloud cleanup failures so local runtime still tears down cleanly.
    }
  }
  latestPushToken = "";
  await unregisterWebPush().catch(() => {});
}

async function enableTaskTimerPushRuntime(): Promise<boolean> {
  const auth = getFirebaseAuthClient();
  if (!auth) return false;
  const nativeRuntime = isNativePushRuntime();
  const webRuntime = await isWebPushRuntimeSupported();
  if ((nativeRuntime && !desiredPushEnabled.mobileEnabled) || (webRuntime && !desiredPushEnabled.webEnabled)) {
    await disableTaskTimerPushRuntime({ clearCloudRegistration: true });
    return false;
  }
  if (!nativeRuntime && !webRuntime) return true;

  if (runtimeEnabled && runtimeCleanup) {
    void savePushAppStateForUser(auth.currentUser, isAppActivelyForegrounded()).catch(() => {});
    return true;
  }

  await disableTaskTimerPushRuntime({ clearCloudRegistration: false });
  const handlePushPayload = (data: Record<string, unknown>, actionIdOverride?: unknown) => {
    const taskId = String(data.taskId || "").trim();
    const route = String(data.route || "/tasklaunch").trim();
    const actionId = normalizePendingPushActionId(actionIdOverride ?? data.tasktimerActionId ?? data.actionId);
    if (taskId) setPendingPushTaskId(taskId);
    if (taskId) setPendingPushAction({ taskId, route, actionId });
    try {
      window.dispatchEvent(new CustomEvent(PENDING_PUSH_TASK_EVENT, { detail: { taskId, route, actionId } }));
    } catch {
      // Ignore custom event failures.
    }
    if (
      route === "/tasklaunch" &&
      !(/\/tasklaunch\/?$/i.test(window.location.pathname || "") || /\/tasklaunch\/index\.html$/i.test(window.location.pathname || ""))
    ) {
      window.location.href = resolveTaskTimerTasksRoute();
    }
  };

  let registrationHandle: CapAppListenerHandle | null = null;
  let registrationErrorHandle: CapAppListenerHandle | null = null;
  let receivedHandle: CapAppListenerHandle | null = null;
  let actionHandle: CapAppListenerHandle | null = null;

  if (nativeRuntime) {
    registrationHandle = await PushNotifications.addListener("registration", (token: PushNotificationToken) => {
      latestPushToken = String(token.value || "").trim();
      if (!latestPushToken) return;
      void savePushTokenForUser(auth.currentUser, latestPushToken).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[push] Failed to save registration token", error);
        }
      });
    });

    registrationErrorHandle = await PushNotifications.addListener("registrationError", (event) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Registration error", event);
      }
    });

    receivedHandle = await PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[push] Notification received", notification);
      }
    });

    actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (event: ActionPerformed) => {
      const data = event?.notification?.data && typeof event.notification.data === "object"
        ? (event.notification.data as Record<string, unknown>)
        : {};
      handlePushPayload(data, event?.actionId);
      if (process.env.NODE_ENV !== "production") {
        console.info("[push] Notification action", event);
      }
    });
  }

  let serviceWorkerMessageListener: ((event: MessageEvent) => void) | null = null;
  let unsubscribeForegroundWebMessage: (() => void) | null = null;

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    const previousUid = String(lastSyncedUid || "").trim();
    if (user?.uid) {
      lastSyncedUid = user.uid;
      if (latestPushToken) {
        void savePushTokenForUser(user, latestPushToken).catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.error("[push] Failed to sync token after auth change", error);
          }
        });
      }
      if (latestWebPushToken) {
        void saveWebPushTokenForUser(user, latestWebPushToken).catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.error("[push] Failed to sync web token after auth change", error);
          }
        });
      }
      void savePushAppStateForUser(user, isAppActivelyForegrounded()).catch(() => {});
      return;
    }
    if (previousUid) {
      void savePushDevicePatchForUser({ uid: previousUid } as User, {
        enabled: true,
        appActive: false,
        appStateUpdatedAtMs: Date.now(),
      }).catch(() => {});
      lastSyncedUid = "";
    }
  });

  const onVisibilityChange = () => {
    void savePushAppStateForUser(auth.currentUser, isAppActivelyForegrounded()).catch(() => {});
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  let capAppStateHandle: CapAppListenerHandle | null = null;
  try {
    const capApp = getCapAppPlugin();
    if (capApp?.addListener) {
      const maybeHandle = capApp.addListener("appStateChange", (state: { isActive?: boolean } | null) => {
        void savePushAppStateForUser(auth.currentUser, !!state?.isActive).catch(() => {});
      });
      if (isPromiseLike(maybeHandle)) {
        maybeHandle.catch(() => {});
        capAppStateHandle = await maybeHandle.catch(() => null);
      } else {
        capAppStateHandle = maybeHandle;
      }
    }
  } catch {
    // Ignore native app-state listener failures.
  }

  const cleanup = () => {
    unsubAuth();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    removeListenerHandle(capAppStateHandle);
    removeListenerHandle(registrationHandle);
    removeListenerHandle(registrationErrorHandle);
    removeListenerHandle(receivedHandle);
    removeListenerHandle(actionHandle);
    if (unsubscribeForegroundWebMessage) {
      try {
        unsubscribeForegroundWebMessage();
      } catch {
        // Ignore foreground listener cleanup failures.
      }
    }
    if (serviceWorkerMessageListener && typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener("message", serviceWorkerMessageListener);
    }
  };

  let granted = true;
  if (nativeRuntime) {
    granted = await registerForPush().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Failed to register for push notifications", error);
      }
      return false;
    });
  }

  if (webRuntime) {
    try {
      const app = getFirebaseAppClient();
      if (!app || !firebaseWebPushVapidKey) {
        if (process.env.NODE_ENV !== "production" && !app && firebaseWebPushVapidKey) {
          console.warn("[push] Web push registration skipped because Firebase app is missing");
        }
      } else {
        let permission = Notification.permission;
        if (permission === "default") permission = await Notification.requestPermission();
        if (process.env.NODE_ENV !== "production") {
          console.info("[push] Web push permission status", {
            permission,
            hasApp: !!app,
            hasVapidKey: !!firebaseWebPushVapidKey,
          });
        }
        if (permission === "granted") {
          const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          await navigator.serviceWorker.ready;
          if (!serviceWorkerRegistration.active) {
            await new Promise<void>((resolve) => {
              const installingWorker =
                serviceWorkerRegistration.installing || serviceWorkerRegistration.waiting;
              if (!installingWorker) {
                resolve();
                return;
              }
              const handleStateChange = () => {
                if (installingWorker.state === "activated") {
                  installingWorker.removeEventListener("statechange", handleStateChange);
                  resolve();
                }
              };
              installingWorker.addEventListener("statechange", handleStateChange);
            });
          }
          if (process.env.NODE_ENV !== "production") {
            console.info("[push] Web push service worker ready", {
              scope: serviceWorkerRegistration.scope,
              active: !!serviceWorkerRegistration.active,
              installing: !!serviceWorkerRegistration.installing,
              waiting: !!serviceWorkerRegistration.waiting,
            });
          }
          const messaging = getMessaging(app);
          let webToken = "";
          try {
            webToken = String(
              (await getToken(messaging, {
                vapidKey: firebaseWebPushVapidKey,
                serviceWorkerRegistration,
              })) || ""
            ).trim();
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.error("[push] Web getToken failed", {
                error,
                permission,
                scope: serviceWorkerRegistration.scope,
                active: !!serviceWorkerRegistration.active,
                origin: typeof window !== "undefined" ? window.location.origin : null,
              });
            }
            throw error;
          }
          latestWebPushToken = webToken;
          if (process.env.NODE_ENV !== "production") {
            console.info("[push] Web getToken completed", {
              tokenPresent: !!latestWebPushToken,
              tokenPreview: latestWebPushToken ? `${latestWebPushToken.slice(0, 12)}...` : null,
            });
          }
          if (latestWebPushToken) {
            await saveWebPushTokenForUser(auth.currentUser, latestWebPushToken);
          } else if (process.env.NODE_ENV !== "production") {
            console.warn("[push] Web getToken returned an empty token");
          }
          unsubscribeForegroundWebMessage = onMessage(messaging, (payload) => {
            const notification =
              payload?.notification && typeof payload.notification === "object"
                ? payload.notification
                : {};
            const data =
              payload?.data && typeof payload.data === "object"
                ? (payload.data as Record<string, unknown>)
                : {};
            const title = String(notification.title || "Task Reminder").trim() || "Task Reminder";
            const body = String(notification.body || "A task is scheduled to start now.").trim();
            if (Notification.permission === "granted") {
              try {
                void serviceWorkerRegistration.showNotification(title, {
                  body,
                  data,
                });
              } catch (error) {
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[push] Failed to show foreground web notification", { error, data });
                }
              }
            }
            if (process.env.NODE_ENV !== "production") {
              console.info("[push] Foreground web push received", {
                title,
                body,
                taskId: String(data.taskId || "").trim() || null,
              });
            }
          });
          serviceWorkerMessageListener = (event: MessageEvent) => {
            const data =
              event?.data && typeof event.data === "object"
                ? (event.data as Record<string, unknown>)
                : {};
            if (String(data.type || "").trim() !== "tasktimer-push-click") return;
            handlePushPayload(data);
          };
          navigator.serviceWorker.addEventListener("message", serviceWorkerMessageListener);
        } else if (!nativeRuntime) {
          granted = false;
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[push] Failed to register for web push notifications", error);
      }
      if (!nativeRuntime) granted = false;
    }
  }

  if (!granted) {
    cleanup();
    await disableTaskTimerPushRuntime({ clearCloudRegistration: true });
    return false;
  }

  runtimeCleanup = cleanup;
  runtimeEnabled = true;
  void savePushAppStateForUser(auth.currentUser, isAppActivelyForegrounded()).catch(() => {});
  return true;
}

export async function disableTaskTimerPushNotifications(): Promise<void> {
  desiredPushEnabled = { mobileEnabled: false, webEnabled: false };
  await disableTaskTimerPushRuntime({ clearCloudRegistration: true });
}

export async function syncTaskTimerPushNotificationsEnabled(
  enabled: boolean | Partial<PushChannelPreference>
): Promise<PushChannelPreference> {
  desiredPushEnabled = normalizePushChannelPreference(enabled);
  if (!firebaseWebPushVapidKey) {
    desiredPushEnabled = { ...desiredPushEnabled, webEnabled: false };
  }
  syncPromise = syncPromise
    .catch(() => ({ mobileEnabled: false, webEnabled: false }))
    .then(async () => {
      const nativeRuntime = isNativePushRuntime();
      const webRuntime = await isWebPushRuntimeSupported();
      const currentRuntimeEnabled = nativeRuntime
        ? desiredPushEnabled.mobileEnabled
        : webRuntime
          ? desiredPushEnabled.webEnabled
          : desiredPushEnabled.mobileEnabled || desiredPushEnabled.webEnabled;
      if (currentRuntimeEnabled) {
        const active = await enableTaskTimerPushRuntime();
        if (!active) {
          if (nativeRuntime) desiredPushEnabled = { ...desiredPushEnabled, mobileEnabled: false };
          if (webRuntime) desiredPushEnabled = { ...desiredPushEnabled, webEnabled: false };
        }
        return desiredPushEnabled;
      }
      await disableTaskTimerPushRuntime({ clearCloudRegistration: true });
      return desiredPushEnabled;
    });
  return syncPromise;
}

export async function initTaskTimerPushNotifications(): Promise<() => void> {
  await syncTaskTimerPushNotificationsEnabled({ mobileEnabled: true, webEnabled: true });
  return () => {
    void syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: false });
  };
}

export async function getTaskTimerPushDiagnostics(uid: string | null | undefined): Promise<PushDiagnostics> {
  const normalizedUid = String(uid || "").trim();
  const nativeRuntime = isNativePushRuntime();
  const webRuntime = !nativeRuntime;
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
  } else if (typeof window !== "undefined" && "Notification" in window) {
    permission = String(Notification.permission || "unknown");
  }

  const diagnostics: PushDiagnostics = {
    runtime: nativeRuntime ? "native" : webRuntime ? "web" : "web",
    platform,
    deviceId,
    permission,
    localTokenPresent: !!(latestPushToken || latestWebPushToken),
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
