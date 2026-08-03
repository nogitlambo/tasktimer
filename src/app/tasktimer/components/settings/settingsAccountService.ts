"use client";

import { signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { saveUserRootPatch } from "@/app/tasktimer/lib/cloudStore";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { createTaskTimerWorkspaceRepository } from "@/app/tasktimer/lib/workspaceRepository";
import { claimUsernameClient } from "@/app/tasktimer/lib/usernameClaim";
import { resolveTaskTimerRouteHref } from "@/app/tasktimer/lib/routeHref";
import { markAccountDeletionLandingRedirectIntent } from "@/app/tasktimer/lib/accountDeletionRedirectIntent";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";

const workspaceRepository = createTaskTimerWorkspaceRepository();
const PROFILE_SYNC_TIMEOUT_MS = 15000;

export type ProfileSyncResult = {
  checkedAtMs: number;
  hadPendingBefore: boolean;
};

class ProfileSyncError extends Error {
  code: "not-signed-in" | "timeout" | "pending";

  constructor(code: "not-signed-in" | "timeout" | "pending", message: string) {
    super(message);
    this.code = code;
    this.name = "ProfileSyncError";
  }
}

export function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function hasPendingProfileSyncState() {
  return (
    workspaceRepository.hasPendingTaskOrHistorySync?.() === true ||
    workspaceRepository.hasPendingPreferenceSync?.() === true
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new ProfileSyncError("timeout", message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId != null) clearTimeout(timeoutId);
  }) as Promise<T>;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  window.location.assign(resolveTaskTimerRouteHref("/login"));
}

function redirectToLanding() {
  if (typeof window === "undefined") return;
  window.location.assign(resolveTaskTimerRouteHref("/"));
}

async function finalizeDeletedAccountSession(auth: ReturnType<typeof getFirebaseAuthClient>) {
  markAccountDeletionLandingRedirectIntent();
  if (auth) await signOut(auth).catch(() => {});
  workspaceRepository.clearScopedState();
  redirectToLanding();
}

export function userDocRef(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  return doc(db, "users", uid);
}

export async function saveUserDocPatch(uid: string, patch: Record<string, unknown>) {
  const ref = userDocRef(uid);
  if (!ref) throw new Error("Cloud Firestore is not available.");
  await saveUserRootPatch(uid, patch);
}

export async function syncLocalProfileDataToCloud({
  timeoutMs = PROFILE_SYNC_TIMEOUT_MS,
}: {
  timeoutMs?: number;
} = {}): Promise<ProfileSyncResult> {
  const auth = getFirebaseAuthClient();
  if (!auth?.currentUser) {
    throw new ProfileSyncError("not-signed-in", "You must be signed in to sync your latest local data.");
  }
  const hadPendingBefore = hasPendingProfileSyncState();
  await withTimeout(
    (async () => {
      await workspaceRepository.waitForPendingTaskSync();
      await workspaceRepository.flushPendingCloudWrites();
    })(),
    timeoutMs,
    "Could not sync your latest local data to the cloud because the sync timed out. Please try again."
  );
  if (hasPendingProfileSyncState()) {
    throw new ProfileSyncError("pending", "Could not sync your latest local data to the cloud. Please try again.");
  }
  return {
    checkedAtMs: Date.now(),
    hadPendingBefore,
  };
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
  try {
    await syncLocalProfileDataToCloud();
  } catch (error) {
    if (error instanceof ProfileSyncError && error.code === "timeout") {
      throw new Error(
        "Could not sign out because your latest local data could not sync to the cloud before the request timed out. Please try Sync again."
      );
    }
    throw new Error("Could not sign out because your latest local data could not sync to the cloud. Please try Sync again.");
  }
  await signOut(auth);
  workspaceRepository.clearScopedState();
  redirectToLogin();
}

export async function handleDeleteAccountFlow(user: User) {
  const auth = getFirebaseAuthClient();
  if (!auth) throw new Error("You must be signed in to delete your account.");

  const preserveRetainedSubscription = async (targetUser: User) => {
    const idToken = await targetUser.getIdToken();
    if (!idToken) return;
    await fetch(getApiUrl("/api/account/retain-subscription-before-delete/"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-firebase-auth": idToken,
      },
      body: JSON.stringify({ uid: targetUser.uid }),
    }).catch(() => {});
  };

  const deleteCloudData = async (targetUser: User) => {
    const idToken = await targetUser.getIdToken();
    if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
    const response = await fetch(getApiUrl("/api/account/delete-user-data/"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-firebase-auth": idToken,
      },
      body: JSON.stringify({ uid: targetUser.uid }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || "Could not delete your cloud data.");
    }
  };

  const deleteSignedInUser = async (targetUser: User) => {
    await preserveRetainedSubscription(targetUser);
    await deleteCloudData(targetUser);
    await finalizeDeletedAccountSession(auth);
  };

  await deleteSignedInUser(user);
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
