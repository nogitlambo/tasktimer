import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";
import { createReportableLogId, writeReportableLog } from "../../shared/reportableLog";
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

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  let requestUid = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    requestUid = uid;
    const authEmail = normalizeEmail(email);
    if (!authEmail) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "A verified email address is required." }, { status: 400 }));
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
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true }));
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "Could not sync account identity."));
    }
    const logId = createReportableLogId("acct-sync");
    writeReportableLog("error", "[api/account/sync-identity] Request failed", {
      logId,
      route: "/api/account/sync-identity",
      uid: requestUid || null,
      error,
    });
    return withAuthenticatedApiCors(
      req,
      NextResponse.json(
        { error: "Could not sync account identity.", code: "internal", logId },
        { status: 500 }
      )
    );
  }
}
