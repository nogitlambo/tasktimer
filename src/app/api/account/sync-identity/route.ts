import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeEmail(value: unknown) {
  return asString(value, 320).toLowerCase();
}

function emailLookupDocKey(email: string) {
  return encodeURIComponent(normalizeEmail(email));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    const authEmail = normalizeEmail(email);
    if (!authEmail) {
      return NextResponse.json({ error: "A verified email address is required." }, { status: 400 });
    }

    const displayName = asString(body.displayName, 120) || null;
    const prevEmail = normalizeEmail(body.prevEmail);
    const db = getFirebaseAdminDb();

    const batch = db.batch();
    const currentLookupRef = db.collection("userEmailLookup").doc(emailLookupDocKey(authEmail));
    batch.set(
      currentLookupRef,
      {
        uid,
        email: authEmail,
        displayName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (prevEmail && prevEmail !== authEmail) {
      batch.delete(db.collection("userEmailLookup").doc(emailLookupDocKey(prevEmail)));
    }

    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not sync account identity.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not sync account identity.",
      "[api/account/sync-identity] Request failed"
    );
  }
}
