import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeServer } from "@/lib/stripeServer";
import {
  findUidByStripeCustomerId,
  planFromStripeSubscriptionStatus,
  upsertUserSubscriptionAndPlan,
  type SubscriptionPlan,
} from "@/lib/subscriptionStore";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function logStripeWebhook(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[stripe-webhook] ${message}`, details);
    return;
  }
  console.info(`[stripe-webhook] ${message}`);
}

async function upsertUserBillingState(input: {
  uid: string;
  plan: SubscriptionPlan;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
}) {
  logStripeWebhook("upserting billing state", {
    uid: input.uid,
    plan: input.plan,
    customerId: input.customerId || "",
    subscriptionId: input.subscriptionId || "",
    priceId: input.priceId || "",
    status: input.status || "",
  });
  await upsertUserSubscriptionAndPlan(input);
  logStripeWebhook("billing state upsert completed", {
    uid: input.uid,
    plan: input.plan,
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const uid = asString(session.client_reference_id) || asString(session.metadata?.uid);
  const customerId = asString(session.customer);
  const subscriptionId = asString(session.subscription);
  logStripeWebhook("processing checkout.session.completed", {
    uid,
    customerId,
    subscriptionId,
    checkoutSessionId: asString(session.id),
  });
  if (!uid) {
    logStripeWebhook("skipping checkout.session.completed because uid could not be resolved", {
      customerId,
      subscriptionId,
      checkoutSessionId: asString(session.id),
    });
    return;
  }

  await upsertUserBillingState({
    uid,
    plan: "pro",
    customerId,
    subscriptionId,
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
    logStripeWebhook("resolving uid from stripe customer id", {
      customerId,
      subscriptionId,
      eventStatus: status,
    });
    resolvedUid = await findUidByStripeCustomerId(customerId);
  }
  logStripeWebhook("processing subscription create/update", {
    metadataUid: uid,
    resolvedUid,
    customerId,
    subscriptionId,
    priceId,
    status,
  });
  if (!resolvedUid) {
    logStripeWebhook("skipping subscription create/update because uid could not be resolved", {
      customerId,
      subscriptionId,
      priceId,
      status,
    });
    return;
  }

  await upsertUserBillingState({
    uid: resolvedUid,
    plan: planFromStripeSubscriptionStatus(status),
    customerId,
    subscriptionId,
    priceId,
    status,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const uid = asString(subscription.metadata?.uid);
  const customerId = asString(subscription.customer);
  const subscriptionId = asString(subscription.id);
  const priceId = asString(subscription.items.data[0]?.price?.id);
  const status = asString(subscription.status) || "canceled";
  let resolvedUid = uid;

  if (!resolvedUid && customerId) {
    logStripeWebhook("resolving uid for deleted subscription from stripe customer id", {
      customerId,
      subscriptionId,
      status,
    });
    resolvedUid = await findUidByStripeCustomerId(customerId);
  }
  logStripeWebhook("processing customer.subscription.deleted", {
    metadataUid: uid,
    resolvedUid,
    customerId,
    subscriptionId,
    priceId,
    status,
  });
  if (!resolvedUid) {
    logStripeWebhook("skipping customer.subscription.deleted because uid could not be resolved", {
      customerId,
      subscriptionId,
      priceId,
      status,
    });
    return;
  }

  await upsertUserBillingState({
    uid: resolvedUid,
    plan: "free",
    customerId,
    subscriptionId,
    priceId,
    status,
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
    logStripeWebhook("received event", {
      eventType: event.type,
      eventId: event.id,
    });

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
    console.error("[stripe-webhook] webhook handling failed", {
      message,
      error,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
