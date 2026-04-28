import Stripe from "stripe";

import { NextResponse } from "next/server";

import { getStripeServer } from "@/lib/stripeServer";
import {
  isActiveSubscriptionStatus,
  isPeriodEndInFuture,
  loadUserSubscription,
  upsertRetainedSubscription,
} from "@/lib/subscriptionStore";
import {
  createApiAuthErrorResponse,
  createApiInternalErrorResponse,
  verifyFirebaseRequestUser,
} from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSubscriptionPeriodEndAt(subscription: Stripe.Subscription) {
  const itemPeriodEndMs = (subscription.items?.data || []).reduce<number | null>((latest, item) => {
    const nextValue = Number(item?.current_period_end || 0);
    if (!Number.isFinite(nextValue) || nextValue <= 0) return latest;
    return latest == null ? nextValue * 1000 : Math.max(latest, nextValue * 1000);
  }, null);
  if (itemPeriodEndMs != null) return itemPeriodEndMs;

  const cancelAt = Number(subscription.cancel_at || 0);
  return Number.isFinite(cancelAt) && cancelAt > 0 ? cancelAt * 1000 : null;
}

async function resolveCurrentPeriodEndAt(subscriptionId: string) {
  const normalizedSubscriptionId = asString(subscriptionId);
  if (!normalizedSubscriptionId) return null;
  const stripe = getStripeServer();
  const subscription = (await stripe.subscriptions.retrieve(normalizedSubscriptionId)) as Stripe.Subscription;
  return resolveSubscriptionPeriodEndAt(subscription);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid, email } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "account-retain-subscription-before-delete",
      uid,
      windowMs: 30 * 60 * 1000,
      maxEvents: 4,
      code: "account/retain-subscription-rate-limited",
      message: "Too many subscription retention attempts recently. Please wait before trying again.",
    });
    const normalizedEmail = asString(email).toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ retained: false, reason: "missing-email" });
    }

    const subscription = await loadUserSubscription(uid);
    if (!subscription?.stripeCustomerId || !isActiveSubscriptionStatus(subscription.stripeSubscriptionStatus)) {
      return NextResponse.json({ retained: false, reason: "no-active-subscription" });
    }

    let currentPeriodEndAt = subscription.currentPeriodEndAt;
    if (!isPeriodEndInFuture(currentPeriodEndAt) && subscription.stripeSubscriptionId) {
      currentPeriodEndAt = await resolveCurrentPeriodEndAt(subscription.stripeSubscriptionId);
    }
    if (!isPeriodEndInFuture(currentPeriodEndAt)) {
      return NextResponse.json({ retained: false, reason: "no-active-period" });
    }

    await upsertRetainedSubscription({
      email: normalizedEmail,
      sourceUid: uid,
      customerId: subscription.stripeCustomerId,
      subscriptionId: subscription.stripeSubscriptionId,
      priceId: subscription.stripePriceId,
      status: subscription.stripeSubscriptionStatus,
      currentPeriodEndAt,
    });

    return NextResponse.json({ retained: true });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not preserve subscription access before deletion.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not preserve subscription access before deletion.",
      "[api/account/retain-subscription-before-delete] Request failed"
    );
  }
}
