import { NextResponse } from "next/server";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripeServer";
import { createStripeApiErrorResponse, isStripeApiError } from "@/lib/stripeApiErrors";
import { buildNativeAppRouteUrl } from "@/lib/nativeAppLinks";
import { loadStripeCustomerIdForUser } from "@/lib/subscriptionStore";
import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSafeReturnPath(value: unknown, fallbackPath: string) {
  const raw = asString(value) || fallbackPath;
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("//") || normalized.includes("\\") || normalized.includes("://")) {
    return fallbackPath;
  }
  const pathOnly = normalized.split("#")[0]?.split("?")[0] || fallbackPath;
  const allowedPaths = new Set(["/account", "/settings", "/dashboard", "/tasklaunch", "/pricing", "/login"]);
  return allowedPaths.has(pathOnly.replace(/\/+$/, "") || "/") ? normalized : fallbackPath;
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/%7B/g, "{").replace(/%7D/g, "}");
}

function buildReturnUrl(path: string, target: "native" | "web", appBaseUrl: string, params: Record<string, string>) {
  const hashIndex = path.indexOf("#");
  const queryIndex = path.indexOf("?");
  const cutIndex =
    queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
  const pathOnly = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
  const existingQuery = queryIndex >= 0 ? path.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : "";
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const nextQueryParts = existingQuery ? [existingQuery] : [];
  for (const [key, value] of Object.entries(params)) {
    nextQueryParts.push(`${encodeURIComponent(key)}=${encodeQueryValue(value)}`);
  }
  const query = nextQueryParts.length ? `?${nextQueryParts.join("&")}` : "";
  if (target === "native") {
    return buildNativeAppRouteUrl(`${pathOnly}${query}${hash}`);
  }
  return `${appBaseUrl}${pathOnly}${query}${hash}`;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "stripe-create-checkout-session",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 5,
      code: "stripe/checkout-rate-limited",
      message: "Too many checkout attempts recently. Please wait before trying again.",
    });

    const priceId = asString(process.env.STRIPE_PRICE_ID_PRO_MONTHLY);
    if (!priceId) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Missing STRIPE_PRICE_ID_PRO_MONTHLY." }, { status: 500 }));
    }

    const stripe = getStripeServer();
    const appBaseUrl = getAppBaseUrl();
    const existingCustomerId = await loadStripeCustomerIdForUser(uid);
    const returnTarget = asString(body.returnTarget).toLowerCase() === "native" ? "native" : "web";
    const successReturnPath = resolveSafeReturnPath(body.successReturnPath, returnTarget === "native" ? "/account" : "/dashboard");
    const cancelReturnPath = resolveSafeReturnPath(body.cancelReturnPath, returnTarget === "native" ? successReturnPath : "/login");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildReturnUrl(successReturnPath, returnTarget, appBaseUrl, {
        checkout: "success",
        session_id: "{CHECKOUT_SESSION_ID}",
      }),
      cancel_url: buildReturnUrl(cancelReturnPath, returnTarget, appBaseUrl, {
        checkout: "cancelled",
      }),
      customer: existingCustomerId || undefined,
      customer_email: existingCustomerId ? undefined : email || undefined,
      client_reference_id: uid,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { uid },
      },
      metadata: { uid },
    });

    return withAuthenticatedApiCors(req, NextResponse.json({ url: session.url }));
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "Could not create checkout session."));
    }
    if (isStripeApiError(error)) {
      return withAuthenticatedApiCors(
        req,
        createStripeApiErrorResponse(
          error,
          "Could not create checkout session.",
          "[api/stripe/create-checkout-session] Stripe request failed"
        )
      );
    }
    return withAuthenticatedApiCors(
      req,
      createApiInternalErrorResponse(
        error,
        "Could not create checkout session.",
        "[api/stripe/create-checkout-session] Request failed"
      )
    );
  }
}
