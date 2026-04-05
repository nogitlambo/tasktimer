import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { normalizeUsername, validateUsername } from "@/lib/username";

type ClaimUsernameResult = {
  usernameKey: string;
};

const USERNAME_CLAIM_MAX_RETRIES = 3;

function errorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "").trim() : "";
}

function shouldRetryUsernameClaim(err: unknown): boolean {
  const code = errorCode(err);
  return code === "aborted" || code === "failed-precondition";
}

export async function claimUsernameClient(rawUsername: string): Promise<ClaimUsernameResult> {
  const auth = getFirebaseAuthClient();
  const user = auth?.currentUser || null;
  const uid = String(user?.uid || "").trim();
  if (!user || !uid) {
    throw new Error("Sign in is required to update your username.");
  }

  const usernameKey = normalizeUsername(rawUsername);
  const validationError = validateUsername(rawUsername);
  if (validationError) {
    throw new Error(validationError);
  }

  const db = getFirebaseFirestoreClient();
  if (!db) {
    throw new Error("Cloud Firestore is not available.");
  }

  const usersRef = doc(db, "users", uid);
  const usernamesRef = doc(db, "usernames", usernameKey);

  for (let attempt = 0; attempt < USERNAME_CLAIM_MAX_RETRIES; attempt += 1) {
    try {
      await runTransaction(db, async (tx) => {
        const [userSnap, usernameSnap] = await Promise.all([tx.get(usersRef), tx.get(usernamesRef)]);

        const existingUsernameUid = usernameSnap.exists() ? String(usernameSnap.get("uid") || "").trim() : "";
        if (existingUsernameUid && existingUsernameUid !== uid) {
          throw new Error("That username is already taken.");
        }

        const currentUsernameKey = userSnap.exists() ? String(userSnap.get("usernameKey") || "").trim() : "";
        const currentUsername = userSnap.exists() ? String(userSnap.get("username") || "").trim() : "";

        if (currentUsernameKey === usernameKey && currentUsername === usernameKey && existingUsernameUid === uid) {
          return;
        }

        tx.set(
          usernamesRef,
          {
            uid,
            username: usernameKey,
            usernameKey,
          },
          { merge: true }
        );

        tx.set(
          usersRef,
          {
            username: usernameKey,
            usernameKey,
            schemaVersion: 1,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (currentUsernameKey && currentUsernameKey !== usernameKey) {
          tx.delete(doc(db, "usernames", currentUsernameKey));
        }
      });
      return { usernameKey };
    } catch (err) {
      if (attempt >= USERNAME_CLAIM_MAX_RETRIES - 1 || !shouldRetryUsernameClaim(err)) {
        throw err;
      }
    }
  }

  return { usernameKey };
}
