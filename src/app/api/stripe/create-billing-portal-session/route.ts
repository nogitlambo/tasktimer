import { NextResponse } from "next/server";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripeServer";
import { loadStripeCustomerIdForUser } from "@/lib/subscriptionStore";
import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSafeReturnPath(value: unknown) {
  const raw = asString(value) || "/account";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("//") || normalized.includes("\\") || normalized.includes("://")) {
    return "/account";
  }
  const pathOnly = normalized.split("#")[0]?.split("?")[0] || "/account";
  const allowedPaths = new Set(["/account", "/settings", "/dashboard", "/tasklaunch", "/pricing"]);
  return allowedPaths.has(pathOnly.replace(/\/+$/, "") || "/") ? normalized : "/account";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "stripe-create-billing-portal-session",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 5,
      code: "stripe/billing-portal-rate-limited",
      message: "Too many billing portal attempts recently. Please wait before trying again.",
    });
    const returnPath = resolveSafeReturnPath(body.returnPath);

    const customerId = await loadStripeCustomerIdForUser(uid);

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe billing profile was found for this account yet." },
        { status: 400 },
      );
    }

    const stripe = getStripeServer();
    const appBaseUrl = getAppBaseUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appBaseUrl}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not create billing portal session.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not create billing portal session.",
      "[api/stripe/create-billing-portal-session] Request failed"
    );
  }
}
