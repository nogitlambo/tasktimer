import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const defaultDatabaseId = "timebase";
const databaseId =
  String(process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || defaultDatabaseId).trim() ||
  defaultDatabaseId;

export function getFirebaseAdminApp() {
  return getApps().length ? getApp() : initializeApp();
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp(), databaseId);
}

export { databaseId as FIREBASE_ADMIN_DATABASE_ID };
