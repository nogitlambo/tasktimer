import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

import { FIREBASE_DATABASE_ID } from "./firebaseDatabase";
import { getFirebaseAppCheckClient, getFirebaseAppClient, hasFirebaseAuthClientConfig, isNativeOrFileRuntime } from "./firebaseClient";

let firestoreClient: Firestore | null | undefined;
const configuredFirestoreDatabaseId = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "").trim();

function isLocalDevelopmentHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2";
}

function isAndroidUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = String(navigator.userAgent || "");
  const userAgentPlatform =
    typeof (navigator as Navigator & { userAgentData?: { platform?: unknown } }).userAgentData?.platform === "string"
      ? String((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || "")
      : "";
  return /\bAndroid\b/i.test(`${userAgent} ${userAgentPlatform}`.trim());
}

function getFirestoreTransportConfig() {
  if (typeof window === "undefined") {
    return {
      forceLongPolling: false,
      reason: "server",
    };
  }
  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  if (isLocalDevelopmentHost(hostname)) {
    return {
      forceLongPolling: true,
      reason: isAndroidUserAgent() ? "android-localhost" : "localhost-dev",
    };
  }
  if (isNativeOrFileRuntime()) {
    return {
      forceLongPolling: true,
      reason: window.location.protocol === "file:" ? "file-runtime" : "native-runtime",
    };
  }
  return {
    forceLongPolling: false,
    reason: "default",
  };
}

function describeError(error: unknown): Record<string, unknown> {
  if (!error) return { value: error };
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; customData?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof withCode.code === "string" ? withCode.code : withCode.code,
      stack: error.stack || null,
      customData: withCode.customData ?? null,
    };
  }
  if (typeof error === "object") {
    try {
      return { ...(error as Record<string, unknown>) };
    } catch {
      return { value: String(error) };
    }
  }
  return { value: error };
}

export function getFirebaseFirestoreClient(): Firestore | null {
  if (firestoreClient !== undefined) return firestoreClient;
  if (typeof window === "undefined") {
    firestoreClient = null;
    return firestoreClient;
  }
  if (!hasFirebaseAuthClientConfig) {
    firestoreClient = null;
    return firestoreClient;
  }
  if (
    configuredFirestoreDatabaseId &&
    configuredFirestoreDatabaseId !== FIREBASE_DATABASE_ID &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn("[firebase-firestore] Ignoring mismatched NEXT_PUBLIC_FIREBASE_DATABASE_ID", {
      configuredDatabaseId: configuredFirestoreDatabaseId,
      expectedDatabaseId: FIREBASE_DATABASE_ID,
    });
  }
  try {
    const app = getFirebaseAppClient();
    const appCheck = getFirebaseAppCheckClient();
    const transportConfig = getFirestoreTransportConfig();
    firestoreClient = app
      ? transportConfig.forceLongPolling
        ? initializeFirestore(app, { experimentalForceLongPolling: true }, FIREBASE_DATABASE_ID)
        : getFirestore(app, FIREBASE_DATABASE_ID)
      : null;
    if (process.env.NODE_ENV !== "production") {
      console.info("[firebase-firestore] Firestore client initialized", {
        databaseId: FIREBASE_DATABASE_ID,
        appCheckRegistered: Boolean(appCheck),
        transport: transportConfig.forceLongPolling ? "long-polling" : "default",
        transportReason: transportConfig.reason,
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[firebase-firestore] Failed to initialize Firestore client", {
        databaseId: FIREBASE_DATABASE_ID,
        error: describeError(error),
      });
    }
    firestoreClient = null;
  }
  return firestoreClient;
}

