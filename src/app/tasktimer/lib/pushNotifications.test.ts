import { beforeEach, describe, expect, it, vi } from "vitest";

type SetupOptions = {
  permission?: "default" | "granted" | "denied";
  requestPermissionResult?: "granted" | "denied";
  token?: string;
  saveError?: Error | null;
  cloudDocData?: Record<string, unknown> | null;
};

async function setupPushModule(options: SetupOptions = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY = "test-vapid-key";

  const setDoc = vi.fn(async () => {
    if (options.saveError) throw options.saveError;
  });
  const getDoc = vi.fn(async () => ({
    exists: () => options.cloudDocData != null,
    get: (field: string) => options.cloudDocData?.[field],
  }));
  const getDocs = vi.fn(async () => ({ empty: true, docs: [] }));
  const doc = vi.fn((...segments: unknown[]) => ({
    path: segments.filter((segment) => typeof segment === "string").join("/"),
  }));
  const query = vi.fn((value) => value);
  const where = vi.fn();
  const recordNonFatal = vi.fn();
  const onMessage = vi.fn(() => () => {});
  const getToken = vi.fn(async () => options.token ?? "web-token-123");
  const register = vi.fn(async () => ({
    scope: "/",
    active: {},
    installing: null,
    waiting: null,
    showNotification: vi.fn(),
  }));
  const addServiceWorkerMessageListener = vi.fn();
  const removeServiceWorkerMessageListener = vi.fn();
  const addDocumentListener = vi.fn();
  const removeDocumentListener = vi.fn();
  const localStorageMap = new Map<string, string>([["tasktimer:pushDeviceId", "device-1"]]);

  vi.doMock("@/lib/firebaseClient", () => ({
    getFirebaseAppClient: () => ({ name: "app" }),
    getFirebaseAuthClient: () => ({ currentUser: { uid: "user-1" } }),
    isNativeOrFileRuntime: () => false,
  }));
  vi.doMock("@/lib/firebaseFirestoreClient", () => ({
    getFirebaseFirestoreClient: () => ({ name: "db" }),
  }));
  vi.doMock("@/lib/firebaseTelemetry", () => ({
    recordNonFatal,
  }));
  vi.doMock("firebase/messaging", () => ({
    deleteToken: vi.fn(),
    getMessaging: vi.fn(() => ({ name: "messaging" })),
    getToken,
    isSupported: vi.fn(async () => true),
    onMessage,
  }));
  vi.doMock("firebase/auth", () => ({
    onAuthStateChanged: vi.fn((_auth, callback) => {
      callback({ uid: "user-1" });
      return () => {};
    }),
  }));
  vi.doMock("firebase/firestore", () => ({
    collection: vi.fn((...segments: string[]) => ({ path: segments.join("/") })),
    deleteField: vi.fn(() => "DELETE_FIELD"),
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
    setDoc,
    where,
  }));
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => false,
      getPlatform: () => "web",
    },
  }));
  vi.doMock("@capacitor/push-notifications", () => ({
    PushNotifications: {
      addListener: vi.fn(),
      checkPermissions: vi.fn(),
      createChannel: vi.fn(),
      register: vi.fn(),
      requestPermissions: vi.fn(),
    },
  }));

  vi.stubGlobal("window", {
    location: {
      protocol: "https:",
      pathname: "/tasklaunch",
      origin: "https://example.test",
      href: "https://example.test/tasklaunch",
    },
    Notification: {
      permission: options.permission ?? "granted",
      requestPermission: vi.fn(async () => options.requestPermissionResult ?? "granted"),
    },
    localStorage: {
      getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMap.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        localStorageMap.delete(key);
      }),
    },
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: addDocumentListener,
    removeEventListener: removeDocumentListener,
  });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register,
      ready: Promise.resolve({}),
      addEventListener: addServiceWorkerMessageListener,
      removeEventListener: removeServiceWorkerMessageListener,
    },
  });
  const notificationGlobal = {
    permission: options.permission ?? "granted",
    requestPermission: vi.fn(async () => options.requestPermissionResult ?? "granted"),
  };
  vi.stubGlobal("Notification", notificationGlobal);
  vi.stubGlobal("CustomEvent", class CustomEventMock {
    detail: unknown;
    constructor(_type: string, init?: { detail?: unknown }) {
      this.detail = init?.detail;
    }
  });

  const mod = await import("./pushNotifications");
  return {
    mod,
    setDoc,
    getDoc,
    getDocs,
    getToken,
    recordNonFatal,
    register,
    addDocumentListener,
    removeDocumentListener,
  };
}

describe("pushNotifications web registration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the authoritative webpush device shape when token registration succeeds", async () => {
    const { mod, setDoc } = await setupPushModule();

    const result = await mod.syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: true });

    expect(result).toEqual({ mobileEnabled: false, webEnabled: true });
    expect(setDoc.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ path: "users/user-1/devices/device-1" }),
          expect.objectContaining({
            provider: "fcm",
            platform: "web",
            native: false,
            kind: "webpush",
            scope: "web",
            enabled: true,
            token: "web-token-123",
          }),
          { merge: true },
        ],
      ])
    );
  });

  it("treats an empty web token as a failed registration and disables web push", async () => {
    const { mod, recordNonFatal } = await setupPushModule({ token: "" });

    const result = await mod.syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: true });

    expect(result).toEqual({ mobileEnabled: false, webEnabled: false });
    expect(recordNonFatal).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        flow: "push_registration",
        runtime: "web",
        stage: "empty-token",
      })
    );
  });

  it("does not leave web push enabled when permission is denied", async () => {
    const { mod, setDoc, recordNonFatal } = await setupPushModule({
      permission: "denied",
    });

    const result = await mod.syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: true });

    expect(result).toEqual({ mobileEnabled: false, webEnabled: false });
    expect(setDoc.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ path: "users/user-1/devices/device-1" }),
          expect.objectContaining({
            enabled: false,
            token: "DELETE_FIELD",
          }),
          { merge: true },
        ],
      ])
    );
    expect(recordNonFatal).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        flow: "push_registration",
        runtime: "web",
        stage: "permission-denied",
      })
    );
  });

  it("reports cloud device fields in diagnostics", async () => {
    const { mod } = await setupPushModule({
      cloudDocData: {
        token: "cloud-token",
        enabled: true,
        provider: "fcm",
        platform: "web",
        native: false,
        kind: "webpush",
        scope: "web",
      },
    });

    const diagnostics = await mod.getTaskTimerPushDiagnostics("user-1");

    expect(diagnostics).toMatchObject({
      runtime: "web",
      deviceId: "device-1",
      cloudDocPresent: true,
      cloudTokenPresent: true,
      cloudEnabled: true,
      cloudProvider: "fcm",
      cloudPlatform: "web",
      cloudNative: false,
      cloudKind: "webpush",
      cloudScope: "web",
    });
  });
});
