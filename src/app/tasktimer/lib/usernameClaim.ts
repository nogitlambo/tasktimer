import { getFirebaseAuthClient } from "@/lib/firebaseClient";
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

  const idToken = await user.getIdToken();
  if (!idToken) {
    throw new Error("Your sign-in session is no longer valid. Please sign in again.");
  }

  for (let attempt = 0; attempt < USERNAME_CLAIM_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch("/api/account/claim-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ username: rawUsername }),
      });
      const payload = (await response.json().catch(() => ({}))) as { usernameKey?: string; error?: string };
      if (!response.ok) {
        throw new Error(String(payload.error || "Unable to update your username right now."));
      }
      return { usernameKey: String(payload.usernameKey || usernameKey).trim() || usernameKey };
    } catch (err) {
      if (attempt >= USERNAME_CLAIM_MAX_RETRIES - 1 || !shouldRetryUsernameClaim(err)) {
        throw err;
      }
    }
  }

  return { usernameKey };
}
