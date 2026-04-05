"use client";

import { GoogleAuthProvider, deleteUser, getRedirectResult, reauthenticateWithPopup, reauthenticateWithRedirect, signOut, type User } from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { clearScopedStorageState, waitForPendingTaskSync } from "@/app/tasktimer/lib/storage";
import { claimUsernameClient } from "@/app/tasktimer/lib/usernameClaim";

export const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";

export function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export function shouldUseRedirectAuth() {
  return isNativeOrFileRuntime();
}

export function accountStateDocRef(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  return doc(db, "users", uid, "accountState", "v1");
}

export function userDocRef(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  return doc(db, "users", uid);
}

export async function saveUserDocPatch(uid: string, patch: Record<string, unknown>) {
  const ref = userDocRef(uid);
  if (!ref) throw new Error("Cloud Firestore is not available.");
  await setDoc(
    ref,
    {
      schemaVersion: 1,
      updatedAt: serverTimestamp(),
      ...patch,
    },
    { merge: true },
  );
}

export async function loadClaimedUsername(uid: string): Promise<string> {
  const ref = userDocRef(uid);
  if (!ref) return "";
  const snap = await getDoc(ref);
  if (!snap.exists()) return "";
  return String(snap.get("username") || "").trim();
}

export async function handleSignOutFlow() {
  const auth = getFirebaseAuthClient();
  if (!auth) throw new Error("Email sign-in is not configured for this environment.");
  await waitForPendingTaskSync().catch(() => {});
  await signOut(auth);
  clearScopedStorageState();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(SIGN_OUT_LANDING_BYPASS_KEY, "1");
    } catch {
      // ignore
    }
    window.location.assign("/signed-out?signedOut=1");
  }
}

export async function resumePendingDeleteFlow(uid: string) {
  const auth = getFirebaseAuthClient();
  if (!auth || !uid) return { resumed: false };
  const ref = accountStateDocRef(uid);
  if (!ref) return { resumed: false };

  let stateSnap;
  try {
    stateSnap = await getDoc(ref);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
    if (code === "permission-denied") return { resumed: false };
    throw err;
  }

  const pendingDelete = stateSnap.exists() && stateSnap.get("deleteReauthPending") === true;
  if (!pendingDelete) return { resumed: false };

  try {
    await getRedirectResult(auth);
  } catch (err: unknown) {
    await setDoc(ref, { deleteReauthPending: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    return { resumed: true, error: getErrorMessage(err, "Could not complete Google re-authentication for account deletion.") };
  }

  if (!auth.currentUser) return { resumed: true };

  await setDoc(ref, { deleteReauthPending: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  await deleteUser(auth.currentUser);
  if (typeof window !== "undefined") window.location.assign("/");
  return { resumed: true };
}

export async function handleDeleteAccountFlow(user: User) {
  const auth = getFirebaseAuthClient();
  if (!auth) throw new Error("You must be signed in to delete your account.");

  const deleteSignedInUser = async (targetUser: User) => {
    const deleteUid = targetUser.uid;
    await deleteUser(targetUser);
    const accountRef = accountStateDocRef(deleteUid);
    if (accountRef) await deleteDoc(accountRef).catch(() => {});
    if (typeof window !== "undefined") window.location.assign("/");
  };

  try {
    await deleteSignedInUser(user);
    return;
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
    const providerIds = new Set((user.providerData || []).map((provider) => String(provider?.providerId || "")).filter(Boolean));
    const canUseGoogleReauth = providerIds.has("google.com");
    if (code !== "auth/requires-recent-login") throw err;
    if (!canUseGoogleReauth) {
      throw new Error("Recent sign-in required. Sign out, sign in again, then retry Delete Account.");
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    if (shouldUseRedirectAuth()) {
      const ref = accountStateDocRef(user.uid);
      if (ref) await setDoc(ref, { deleteReauthPending: true, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      await reauthenticateWithRedirect(user, provider);
      return;
    }

    await reauthenticateWithPopup(user, provider);
    await deleteSignedInUser(auth.currentUser || user);
  }
}

export async function updateAliasFlow(uid: string, currentAlias: string, nextAliasRaw: string) {
  const nextAlias = nextAliasRaw.trim();
  if (!uid) throw new Error("Sign in is required to update your username.");
  if (!nextAlias) throw new Error("Username cannot be empty.");
  const validationError = validateUsername(nextAlias);
  if (validationError) throw new Error(validationError);
  const normalizedNextAlias = normalizeUsername(nextAlias);
  if (normalizedNextAlias === currentAlias) return { username: currentAlias, changed: false };
  const result = await claimUsernameClient(nextAlias);
  return {
    username: String(result.usernameKey || normalizedNextAlias).trim(),
    changed: true,
  };
}
