import type { ActionCodeSettings } from "firebase-admin/auth";
import { after, NextResponse } from "next/server";

import { getFirebaseAdminAuth } from "@/lib/firebaseAdmin";
import { sendAuthSignInEmail } from "@/lib/authEmailLink";
import { wrapEmailSignInLinkForApp } from "@/app/auth/emailLinkUrl";
import { resolveEmailLinkContinueUrl } from "@/app/login/emailLinkAuth";
import {
  ApiRateLimitError,
  buildPublicRateLimitActorKey,
  enforcePublicRateLimit,
  extractClientIp,
} from "../../shared/rateLimit";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";

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

function requestLocation(req: Request) {
  const origin = asString(req.headers.get("origin"), 2048);
  const referer = asString(req.headers.get("referer"), 2048);
  const source = origin || referer;
  if (!source) return null;
  try {
    const url = new URL(source);
    return {
      origin: url.origin,
      protocol: url.protocol,
      hostname: url.hostname,
    };
  } catch {
    return null;
  }
}

function getActionCodeSettings(req: Request): ActionCodeSettings {
  const actionCodeSettings: ActionCodeSettings = {
    url: resolveEmailLinkContinueUrl({ location: requestLocation(req) }),
    handleCodeInApp: true,
  };
  const linkDomain = asString(process.env.AUTH_EMAIL_LINK_DOMAIN, 255)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (linkDomain) actionCodeSettings.linkDomain = linkDomain;
  return actionCodeSettings;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const email = asString(body.email, 320);
    const emailNormalized = normalizeEmail(body.email);

    if (!emailNormalized || !isValidEmail(emailNormalized)) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
      );
    }

    const clientIp = extractClientIp(req);
    await Promise.all([
      enforcePublicRateLimit({
        namespace: "auth-email-link-burst",
        actorKey: buildPublicRateLimitActorKey({ ip: clientIp, secondaryKey: emailNormalized }),
        windowMs: 10 * 60 * 1000,
        maxEvents: 5,
        code: "auth-email-link/rate-limited",
        message: "Too many sign-in email attempts. Please wait before trying again.",
      }),
      enforcePublicRateLimit({
        namespace: "auth-email-link-email-repeat",
        actorKey: buildPublicRateLimitActorKey({ ip: "email", secondaryKey: emailNormalized }),
        windowMs: 60 * 60 * 1000,
        maxEvents: 3,
        code: "auth-email-link/repeat-rate-limited",
        message: "This email was sent too many sign-in links recently. Please try again later.",
      }),
    ]);

    const actionCodeSettings = getActionCodeSettings(req);
    const signInLink = await getFirebaseAdminAuth().generateSignInWithEmailLink(email, actionCodeSettings);
    const appSignInLink = wrapEmailSignInLinkForApp(signInLink, actionCodeSettings.url);
    after(async () => {
      try {
        await sendAuthSignInEmail({ email, signInLink: appSignInLink });
      } catch (error) {
        console.error("Could not send auth sign-in email.", error);
      }
    });

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true }));
  } catch (error: unknown) {
    if (error instanceof ApiRateLimitError) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
      );
    }
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({ error: "Could not send sign-in email right now." }, { status: 500 })
    );
  }
}
