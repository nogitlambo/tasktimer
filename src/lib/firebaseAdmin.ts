import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FIREBASE_DATABASE_ID } from "./firebaseDatabase";

function asString(value: string | undefined) {
  return String(value || "").trim();
}

function getFirebaseAdminProjectId() {
  return (
    asString(process.env.FIREBASE_ADMIN_PROJECT_ID) ||
    asString(process.env.GOOGLE_CLOUD_PROJECT) ||
    asString(process.env.GCLOUD_PROJECT) ||
    asString(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  );
}

function getFirebaseAdminCredential() {
  const projectId = getFirebaseAdminProjectId();
  const clientEmail = asString(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = asString(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return undefined;
  return cert({ projectId, clientEmail, privateKey });
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApp();
  const projectId = getFirebaseAdminProjectId();
  const credential = getFirebaseAdminCredential();
  if (credential && projectId) {
    return initializeApp({ credential, projectId });
  }
  if (projectId) {
    return initializeApp({ projectId });
  }
  return initializeApp();
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp(), FIREBASE_DATABASE_ID);
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}
