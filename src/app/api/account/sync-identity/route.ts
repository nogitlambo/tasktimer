import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
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

export async function POST(req: Request) {
  let requestUid = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    requestUid = uid;
    await enforceUidRateLimit({
      namespace: "account-sync-identity",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 12,
      code: "account/sync-identity-rate-limited",
      message: "Too many identity sync attempts recently. Please wait before trying again.",
    });
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
    if (error instanceof ApiRateLimitError) {
      const logId = createReportableLogId("acct-sync");
      writeReportableLog("warn", "[api/account/sync-identity] Rate limited", {
        logId,
        route: "/api/account/sync-identity",
        uid: requestUid || null,
        code: error.code,
        status: error.status,
      });
      return NextResponse.json({ error: error.message, code: error.code, logId }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not sync account identity.");
    }
    const logId = createReportableLogId("acct-sync");
    writeReportableLog("error", "[api/account/sync-identity] Request failed", {
      logId,
      route: "/api/account/sync-identity",
      uid: requestUid || null,
      error,
    });
    return NextResponse.json(
      { error: "Could not sync account identity.", code: "internal", logId },
      { status: 500 }
    );
  }
}
