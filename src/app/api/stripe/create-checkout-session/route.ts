import { NextResponse } from "next/server";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripeServer";
import { loadStripeCustomerIdForUser } from "@/lib/subscriptionStore";
import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
      return NextResponse.json({ error: "Missing STRIPE_PRICE_ID_PRO_MONTHLY." }, { status: 500 });
    }

    const stripe = getStripeServer();
    const appBaseUrl = getAppBaseUrl();
    const existingCustomerId = await loadStripeCustomerIdForUser(uid);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBaseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/web-sign-in?checkout=cancelled`,
      customer: existingCustomerId || undefined,
      customer_email: existingCustomerId ? undefined : email || undefined,
      client_reference_id: uid,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: { uid },
      },
      metadata: { uid },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not create checkout session.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not create checkout session.",
      "[api/stripe/create-checkout-session] Request failed"
    );
  }
}
