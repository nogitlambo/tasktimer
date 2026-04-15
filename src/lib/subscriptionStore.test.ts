import { describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  buildUserPlanMirrorWriteData,
  buildUserSubscriptionWriteData,
  normalizeUserSubscriptionRecord,
  planFromStripeSubscriptionStatus,
} from "./subscriptionStore";

describe("subscriptionStore", () => {
  it("normalizes absent or customerless subscription docs to null", () => {
    expect(normalizeUserSubscriptionRecord(null)).toBeNull();
    expect(normalizeUserSubscriptionRecord({ stripeSubscriptionId: "sub_123" })).toBeNull();
  });

  it("normalizes user subscription records", () => {
    const syncedAt = Timestamp.fromMillis(123);

    expect(
      normalizeUserSubscriptionRecord({
        stripeCustomerId: " cus_123 ",
        stripeSubscriptionId: " sub_123 ",
        stripePriceId: " price_123 ",
        stripeSubscriptionStatus: " active ",
        stripeSyncedAt: syncedAt,
      })
    ).toEqual({
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      stripeSubscriptionStatus: "active",
      stripeSyncedAt: syncedAt,
      schemaVersion: 1,
    });
  });

  it("maps Stripe subscription statuses to entitlement plans", () => {
    expect(planFromStripeSubscriptionStatus("trialing")).toBe("pro");
    expect(planFromStripeSubscriptionStatus("active")).toBe("pro");
    expect(planFromStripeSubscriptionStatus("past_due")).toBe("pro");
    expect(planFromStripeSubscriptionStatus("canceled")).toBe("free");
    expect(planFromStripeSubscriptionStatus("incomplete_expired")).toBe("free");
    expect(planFromStripeSubscriptionStatus(null)).toBe("free");
  });

  it("builds subscription writes for active subscription data", () => {
    const createdAt = Timestamp.fromMillis(100);
    const syncedAt = Timestamp.fromMillis(200);
    const row = buildUserSubscriptionWriteData(
      {
        uid: "user_123",
        plan: "pro",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        priceId: "price_123",
        status: "active",
      },
      createdAt,
      syncedAt
    );

    expect(row).toMatchObject({
      schemaVersion: 1,
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      stripeSubscriptionStatus: "active",
      stripeSyncedAt: syncedAt,
      createdAt,
    });
  });

  it("deletes missing optional subscription fields and mirrors a free plan", () => {
    const subscriptionRow = buildUserSubscriptionWriteData(
      {
        uid: "user_123",
        plan: "free",
        customerId: "cus_123",
        status: "canceled",
      },
      null,
      Timestamp.fromMillis(200)
    );
    const planRow = buildUserPlanMirrorWriteData({ uid: "user_123", plan: "free" }, null);

    expect(subscriptionRow.stripeCustomerId).toBe("cus_123");
    expect(subscriptionRow.stripeSubscriptionId).toEqual(FieldValue.delete());
    expect(subscriptionRow.stripePriceId).toEqual(FieldValue.delete());
    expect(subscriptionRow.stripeSubscriptionStatus).toBe("canceled");
    expect(planRow.plan).toBe("free");
    expect(planRow.schemaVersion).toBe(1);
  });
});
