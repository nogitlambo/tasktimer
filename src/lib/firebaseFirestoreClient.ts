import { getFirestore, type Firestore } from "firebase/firestore";

import { FIREBASE_DATABASE_ID } from "./firebaseDatabase";
import { getFirebaseAppClient, hasFirebaseAuthClientConfig } from "./firebaseClient";

let firestoreClient: Firestore | null | undefined;
const configuredFirestoreDatabaseId = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "").trim();

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
    firestoreClient = app ? getFirestore(app, FIREBASE_DATABASE_ID) : null;
    if (process.env.NODE_ENV !== "production") {
      console.info("[firebase-firestore] Firestore client initialized", {
        databaseId: FIREBASE_DATABASE_ID,
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

