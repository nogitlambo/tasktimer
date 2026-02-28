import { getApp, getApps } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

import { hasFirebaseAuthClientConfig } from "./firebaseClient";

let firestoreClient: Firestore | null | undefined;

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
  try {
    const app = getApps().length ? getApp() : null;
    firestoreClient = app ? getFirestore(app) : null;
  } catch {
    firestoreClient = null;
  }
  return firestoreClient;
}

