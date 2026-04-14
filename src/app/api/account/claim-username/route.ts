import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { normalizeUsername, validateUsername } from "@/lib/username";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "claim-username",
      uid,
      windowMs: 15 * 60 * 1000,
      maxEvents: 8,
      code: "account/username-rate-limited",
      message: "Too many username updates attempted recently. Please wait before trying again.",
    });
    const rawUsername = asString(body.username);
    const validationError = validateUsername(rawUsername);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const usernameKey = normalizeUsername(rawUsername);
    const db = getFirebaseAdminDb();
    const userRef = db.collection("users").doc(uid);
    const usernameRef = db.collection("usernames").doc(usernameKey);

    const result = await db.runTransaction(async (tx) => {
      const [userSnap, usernameSnap] = await Promise.all([tx.get(userRef), tx.get(usernameRef)]);
      const existingUsernameUid = usernameSnap.exists ? asString(usernameSnap.get("uid")) : "";
      if (existingUsernameUid && existingUsernameUid !== uid) {
        return { ok: false as const, status: 409, error: "That username is already taken." };
      }

      const currentUsernameKey = userSnap.exists ? asString(userSnap.get("usernameKey")) : "";
      const currentUsername = userSnap.exists ? asString(userSnap.get("username")) : "";
      if (currentUsernameKey === usernameKey && currentUsername === usernameKey && existingUsernameUid === uid) {
        return { ok: true as const };
      }

      tx.set(
        usernameRef,
        {
          uid,
          username: usernameKey,
          usernameKey,
        },
        { merge: true }
      );
      tx.set(
        userRef,
        {
          username: usernameKey,
          usernameKey,
          schemaVersion: 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (currentUsernameKey && currentUsernameKey !== usernameKey) {
        tx.delete(db.collection("usernames").doc(currentUsernameKey));
      }
      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, usernameKey });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not update your username.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not update your username.",
      "[api/account/claim-username] Request failed"
    );
  }
}
