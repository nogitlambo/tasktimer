import { getStorage, type FirebaseStorage } from "firebase/storage";

import {
  getFirebaseAppCheckClient,
  getFirebaseAppClient,
  hasFirebaseAppCheckClientConfig,
  hasFirebaseAuthClientConfig,
} from "./firebaseClient";

let firebaseStorageClient: FirebaseStorage | null | undefined;

export function getFirebaseStorageClient(): FirebaseStorage | null {
  if (firebaseStorageClient !== undefined) return firebaseStorageClient;
  if (typeof window === "undefined") {
    firebaseStorageClient = null;
    return firebaseStorageClient;
  }
  if (!hasFirebaseAuthClientConfig) {
    firebaseStorageClient = null;
    return firebaseStorageClient;
  }
  try {
    const app = getFirebaseAppClient();
    if (!app) {
      firebaseStorageClient = null;
      return firebaseStorageClient;
    }
    if (hasFirebaseAppCheckClientConfig()) getFirebaseAppCheckClient();
    firebaseStorageClient = getStorage(app);
  } catch {
    firebaseStorageClient = null;
  }
  return firebaseStorageClient;
}
