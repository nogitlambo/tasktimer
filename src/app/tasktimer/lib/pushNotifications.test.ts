import { beforeEach, describe, expect, it, vi } from "vitest";

describe("syncTaskTimerPushNotificationsEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY;
  });

  it("preserves the web push preference when the current web runtime cannot register", async () => {
    vi.doMock("@/lib/firebaseClient", () => ({
      getFirebaseAppClient: () => null,
      getFirebaseAuthClient: () => ({ currentUser: null }),
      isNativeOrFileRuntime: () => false,
    }));
    vi.doMock("@/lib/firebaseFirestoreClient", () => ({
      getFirebaseFirestoreClient: () => null,
    }));
    vi.doMock("@/lib/firebaseTelemetry", () => ({
      recordNonFatal: vi.fn(),
    }));
    vi.doMock("firebase/messaging", () => ({
      deleteToken: vi.fn(),
      getMessaging: vi.fn(),
      getToken: vi.fn(),
      isSupported: vi.fn(async () => false),
      onMessage: vi.fn(),
    }));
    vi.doMock("firebase/auth", () => ({
      onAuthStateChanged: vi.fn(),
    }));
    vi.doMock("firebase/firestore", () => ({
      collection: vi.fn(),
      deleteField: vi.fn(),
      doc: vi.fn(),
      getDoc: vi.fn(),
      getDocs: vi.fn(),
      query: vi.fn(),
      serverTimestamp: vi.fn(),
      setDoc: vi.fn(),
      where: vi.fn(),
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
      location: { protocol: "https:", pathname: "/tasklaunch", origin: "https://example.test" },
      localStorage: {
        getItem: vi.fn(() => ""),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    vi.stubGlobal("navigator", {});

    const { syncTaskTimerPushNotificationsEnabled } = await import("./pushNotifications");

    await expect(
      syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: true })
    ).resolves.toEqual({ mobileEnabled: false, webEnabled: true });
  });
});
