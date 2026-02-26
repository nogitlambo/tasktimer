import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseClientConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

function createFirebaseAuth(): Auth | null {
  // Prevent Firebase Web Auth initialization during SSR/prerender/build.
  if (typeof window === "undefined") return null;
  if (!hasFirebaseClientConfig) return null;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return getAuth(app);
  } catch {
    return null;
  }
}

let firebaseAuthInstance: Auth | null | undefined;

export function getFirebaseAuthClient(): Auth | null {
  if (firebaseAuthInstance !== undefined) return firebaseAuthInstance;
  firebaseAuthInstance = createFirebaseAuth();
  return firebaseAuthInstance;
}

export const hasFirebaseAuthClientConfig = hasFirebaseClientConfig;
