import type { Firestore } from "firebase-admin/firestore";

export const DELETED_ACCOUNT_UIDS_COLLECTION = "deletedAccountUids";

export async function isDeletedAccountUid(db: Firestore, uid: string): Promise<boolean> {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return false;
  const snap = await db.collection(DELETED_ACCOUNT_UIDS_COLLECTION).doc(normalizedUid).get();
  return snap.exists;
}
