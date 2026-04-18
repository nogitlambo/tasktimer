import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeEmail(value: unknown) {
  return asString(value, 320).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const email = asString(body.email, 320);
    const emailNormalized = normalizeEmail(body.email);

    if (!emailNormalized || !isValidEmail(emailNormalized)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const userAgent = asString(req.headers.get("user-agent"), 512) || null;
    const referer = asString(req.headers.get("referer"), 2048) || null;
    const db = getFirebaseAdminDb();
    const ref = db.collection("coming_soon_subscriptions").doc(emailNormalized);
    const existingSnap = await ref.get();

    await ref.set(
      {
        email,
        emailNormalized,
        source: "landingClassic",
        userAgent,
        referer,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, alreadySubscribed: existingSnap.exists });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "Could not save your email right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
