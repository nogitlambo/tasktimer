import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth } from "@/lib/firebaseAdminAuth";
import { getFirebaseAdminFirestore } from "@/lib/firebaseAdminFirestore";
import { normalizeUsername, validateUsername } from "@/lib/username";

function getBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return unauthorizedResponse();

  const auth = getFirebaseAdminAuth();
  const firestore = getFirebaseAdminFirestore();
  if (!auth || !firestore) {
    return NextResponse.json(
      { error: "Unable to claim username right now." },
      { status: 500 }
    );
  }

  let uid = "";
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = String(decoded.uid || "").trim();
  } catch {
    return unauthorizedResponse();
  }

  if (!uid) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawUsername =
    body && typeof body === "object" && "username" in body
      ? String((body as { username?: unknown }).username || "")
      : "";

  const usernameKey = normalizeUsername(rawUsername);
  const error = validateUsername(rawUsername);
  if (error) {
    return NextResponse.json(
      {
        available: false,
        usernameKey,
        error,
      },
      { status: 400 }
    );
  }

  const usersRef = firestore.collection("users").doc(uid);
  const usernamesRef = firestore.collection("usernames").doc(usernameKey);

  try {
    await firestore.runTransaction(async (tx) => {
      const [userSnap, usernameSnap] = await Promise.all([
        tx.get(usersRef),
        tx.get(usernamesRef),
      ]);

      const existingUsernameUid = usernameSnap.exists ? String(usernameSnap.get("uid") || "").trim() : "";
      if (existingUsernameUid && existingUsernameUid !== uid) {
        const conflictError = new Error("USERNAME_CONFLICT");
        (conflictError as Error & { code?: string }).code = "USERNAME_CONFLICT";
        throw conflictError;
      }

      const currentUsernameKey = userSnap.exists ? String(userSnap.get("usernameKey") || "").trim() : "";
      const currentUsername = userSnap.exists ? String(userSnap.get("username") || "").trim() : "";

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
        },
        { merge: true }
      );

      if (currentUsernameKey && currentUsernameKey !== usernameKey) {
        tx.delete(firestore.collection("usernames").doc(currentUsernameKey));
      }
    });

    return NextResponse.json({
      available: true,
      usernameKey,
      error: null,
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "USERNAME_CONFLICT") {
      return NextResponse.json(
        {
          available: false,
          usernameKey,
          error: "That username is already taken.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        available: false,
        usernameKey,
        error: "Unable to claim username right now.",
      },
      { status: 500 }
    );
  }
}
