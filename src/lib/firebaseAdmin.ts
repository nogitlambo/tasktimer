import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getFirebaseAdminApp() {
  return getApps().length ? getApp() : initializeApp();
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
