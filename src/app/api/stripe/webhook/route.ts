import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { getStripeServer } from "@/lib/stripeServer";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function upsertUserBillingState(input: {
  uid: string;
  plan: "free" | "pro";
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
}) {
  const db = getFirebaseAdminDb();
  const userRef = db.collection("users").doc(input.uid);
  const existing = await userRef.get();
  const createdAt = existing.exists ? existing.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp();

  await userRef.set(
    {
      schemaVersion: 1,
      plan: input.plan,
      planUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt,
      stripeCustomerId: input.customerId || FieldValue.delete(),
      stripeSubscriptionId: input.subscriptionId || FieldValue.delete(),
      stripePriceId: input.priceId || FieldValue.delete(),
      stripeSubscriptionStatus: input.status || FieldValue.delete(),
      stripeSyncedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const uid = asString(session.client_reference_id) || asString(session.metadata?.uid);
  if (!uid) return;

  await upsertUserBillingState({
    uid,
    plan: "pro",
    customerId: asString(session.customer),
    subscriptionId: asString(session.subscription),
    status: "checkout_completed",
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const uid = asString(subscription.metadata?.uid);
  const customerId = asString(subscription.customer);
  const subscriptionId = asString(subscription.id);
  const priceId = asString(subscription.items.data[0]?.price?.id);
  const status = asString(subscription.status);

  let resolvedUid = uid;
  if (!resolvedUid && customerId) {
    const db = getFirebaseAdminDb();
    const snap = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
    resolvedUid = snap.empty ? "" : snap.docs[0]?.id || "";
  }
  if (!resolvedUid) return;

  const activeStatuses = new Set(["trialing", "active", "past_due"]);
  await upsertUserBillingState({
    uid: resolvedUid,
    plan: activeStatuses.has(status) ? "pro" : "free",
    customerId,
    subscriptionId,
    priceId,
    status,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const uid = asString(subscription.metadata?.uid);
  const customerId = asString(subscription.customer);
  let resolvedUid = uid;

  if (!resolvedUid && customerId) {
    const db = getFirebaseAdminDb();
    const snap = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
    resolvedUid = snap.empty ? "" : snap.docs[0]?.id || "";
  }
  if (!resolvedUid) return;

  await upsertUserBillingState({
    uid: resolvedUid,
    plan: "free",
    customerId,
    subscriptionId: asString(subscription.id),
    priceId: asString(subscription.items.data[0]?.price?.id),
    status: asString(subscription.status) || "canceled",
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = asString(process.env.STRIPE_WEBHOOK_SECRET);

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing Stripe webhook configuration." }, { status: 400 });
  }

  try {
    const stripe = getStripeServer();
    const rawBody = await req.text();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Webhook handling failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
