import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { ApiRateLimitError, buildPublicRateLimitActorKey, enforcePublicRateLimit, extractClientIp } from "../../shared/rateLimit";
import { sendEarlyAccessConfirmationEmail } from "@/lib/earlyAccessEmail";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

const RESEND_LOCK_MS = 60 * 60 * 1000;

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
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
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

    const db = getFirebaseAdminDb();
    const ref = db.collection("coming_soon_subscriptions").doc(emailNormalized);
    const existingSnap = await ref.get();
    const existingStatus = String(existingSnap.exists ? existingSnap.get("status") || "" : "").trim().toLowerCase();
    if (!existingSnap.exists || existingStatus === "unsubscribed") {
      return NextResponse.json({ error: "This email is not on the early access list." }, { status: 404 });
    }

    const nowMs = Date.now();
    const existingLockedUntilMs = Math.floor(Number(existingSnap.get("confirmationEmailResendLockedUntilMs") || 0));
    if (Number.isFinite(existingLockedUntilMs) && existingLockedUntilMs > nowMs) {
      return NextResponse.json({ ok: true, resent: false, resendLockedUntilMs: existingLockedUntilMs });
    }

    try {
      await ref.set(
        {
          confirmationEmailLastAttemptAt: FieldValue.serverTimestamp(),
          confirmationEmailLastError: null,
        },
        { merge: true }
      );
      await sendEarlyAccessConfirmationEmail({ email });

      const resendLockedUntilMs = nowMs + RESEND_LOCK_MS;
      await ref.set(
        {
          confirmationEmailSentAt: FieldValue.serverTimestamp(),
          confirmationEmailLastError: null,
          confirmationEmailResendLockedUntilMs: resendLockedUntilMs,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true, resent: true, resendLockedUntilMs });
    } catch (emailError: unknown) {
      await ref.set(
        {
          confirmationEmailLastAttemptAt: FieldValue.serverTimestamp(),
          confirmationEmailLastError:
            emailError instanceof Error && emailError.message ? emailError.message.slice(0, 500) : "Email send failed.",
        },
        { merge: true }
      );
      return NextResponse.json({ error: "Could not send the confirmation email right now." }, { status: 500 });
    }
  } catch (error: unknown) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error && error.message ? error.message : "Could not send the confirmation email right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
