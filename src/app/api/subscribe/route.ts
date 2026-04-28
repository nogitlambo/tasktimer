import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { ApiRateLimitError, buildPublicRateLimitActorKey, enforcePublicRateLimit, extractClientIp } from "../shared/rateLimit";
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
    const clientIp = extractClientIp(req);
    await enforcePublicRateLimit({
      namespace: "subscribe-burst",
      actorKey: buildPublicRateLimitActorKey({ ip: clientIp, secondaryKey: emailNormalized }),
      windowMs: 10 * 60 * 1000,
      maxEvents: 5,
      code: "subscribe/rate-limited",
      message: "Too many subscribe attempts. Please wait before trying again.",
    });
    await enforcePublicRateLimit({
      namespace: "subscribe-email-repeat",
      actorKey: buildPublicRateLimitActorKey({ ip: "email", secondaryKey: emailNormalized }),
      windowMs: 24 * 60 * 60 * 1000,
      maxEvents: 3,
      code: "subscribe/repeat-rate-limited",
      message: "This email was submitted too many times recently. Please try again later.",
    });

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
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error && error.message ? error.message : "Could not save your email right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
