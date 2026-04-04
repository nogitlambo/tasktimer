import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripeServer";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const uid = asString(body.uid);
    const returnPath = asString(body.returnPath) || "/tasklaunch/settings?pane=general";

    if (!uid) {
      return NextResponse.json({ error: "A valid user id is required." }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    const customerId = userSnap.exists ? asString(userSnap.get("stripeCustomerId")) : "";

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
    const message =
      error instanceof Error && error.message ? error.message : "Could not create billing portal session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
