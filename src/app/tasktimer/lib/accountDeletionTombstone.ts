import { doc, getDoc } from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

export const DELETED_ACCOUNT_UIDS_COLLECTION = "deletedAccountUids";

export async function hasDeletedAccountUidTombstone(uid: string): Promise<boolean> {
  const normalizedUid = String(uid || "").trim();
  const db = getFirebaseFirestoreClient();
  if (!db || !normalizedUid) return false;
  const snap = await getDoc(doc(db, DELETED_ACCOUNT_UIDS_COLLECTION, normalizedUid));
  return snap.exists();
}
