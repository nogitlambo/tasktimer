import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripeServer";

export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const uid = asString(body.uid);
    const email = asString(body.email);

    if (!uid) {
      return NextResponse.json({ error: "A valid user id is required." }, { status: 400 });
    }

    const priceId = asString(process.env.STRIPE_PRICE_ID_PRO_MONTHLY);
    if (!priceId) {
      return NextResponse.json({ error: "Missing STRIPE_PRICE_ID_PRO_MONTHLY." }, { status: 500 });
    }

    const stripe = getStripeServer();
    const db = getFirebaseAdminDb();
    const appBaseUrl = getAppBaseUrl();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const existingCustomerId = userSnap.exists ? asString(userSnap.get("stripeCustomerId")) : "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBaseUrl}/tasktimer/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
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
    const message = error instanceof Error && error.message ? error.message : "Could not create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
