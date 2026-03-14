import { getApp, getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { FIREBASE_DATABASE_ID } from "./firebaseDatabase";

let firestoreAdmin: Firestore | null | undefined;

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
}

function getPrivateKey() {
  return String(process.env.FIREBASE_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();
}

function getClientEmail() {
  return String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
}

function hasServiceAccountConfig() {
  return Boolean(getProjectId() && getClientEmail() && getPrivateKey());
}

export function getFirebaseAdminFirestore(): Firestore | null {
  if (firestoreAdmin !== undefined) return firestoreAdmin;

  try {
    if (!getApps().length) {
      if (hasServiceAccountConfig()) {
        initializeApp({
          credential: cert({
            projectId: getProjectId(),
            clientEmail: getClientEmail(),
            privateKey: getPrivateKey(),
          }),
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
          projectId: getProjectId() || undefined,
        });
      }
    }

    const app = getApp();
    firestoreAdmin = getFirestore(app, FIREBASE_DATABASE_ID);
  } catch {
    firestoreAdmin = null;
  }

  return firestoreAdmin;
}
