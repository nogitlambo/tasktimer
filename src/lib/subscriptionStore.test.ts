import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import {
  buildUserPlanMirrorWriteData,
  buildRetainedSubscriptionWriteData,
  buildUserSubscriptionWriteData,
  hasRetainedSubscriptionEntitlement,
  normalizeRetainedSubscriptionRecord,
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
        currentPeriodEndAt: Timestamp.fromMillis(999),
        stripeSyncedAt: syncedAt,
      })
    ).toEqual({
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      stripeSubscriptionStatus: "active",
      currentPeriodEndAt: Timestamp.fromMillis(999),
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
        currentPeriodEndAt: Timestamp.fromMillis(300),
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
      currentPeriodEndAt: Timestamp.fromMillis(300),
      stripeSyncedAt: syncedAt,
      createdAt,
    });
  });

  it("preserves omitted optional subscription fields and mirrors a free plan", () => {
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
    expect("stripeSubscriptionId" in subscriptionRow).toBe(false);
    expect("stripePriceId" in subscriptionRow).toBe(false);
    expect(subscriptionRow.stripeSubscriptionStatus).toBe("canceled");
    expect(planRow.plan).toBe("free");
    expect(planRow.schemaVersion).toBe(1);
  });

  it("normalizes retained subscription records and validates entitlement windows", () => {
    const retained = normalizeRetainedSubscriptionRecord({
      email: " User@Example.com ",
      stripeCustomerId: " cus_123 ",
      stripeSubscriptionId: " sub_123 ",
      stripePriceId: " price_123 ",
      stripeSubscriptionStatus: " active ",
      currentPeriodEndAt: Timestamp.fromMillis(5_000),
      sourceUid: " user_123 ",
      retainedAt: Timestamp.fromMillis(1_000),
      updatedAt: Timestamp.fromMillis(2_000),
    });

    expect(retained).toEqual({
      email: "user@example.com",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      stripeSubscriptionStatus: "active",
      currentPeriodEndAt: Timestamp.fromMillis(5_000),
      plan: "pro",
      sourceUid: "user_123",
      retainedAt: Timestamp.fromMillis(1_000),
      updatedAt: Timestamp.fromMillis(2_000),
      schemaVersion: 1,
    });
    expect(hasRetainedSubscriptionEntitlement(retained, 4_000)).toBe(true);
    expect(hasRetainedSubscriptionEntitlement(retained, 6_000)).toBe(false);
  });

  it("builds minimal retained subscription writes", () => {
    const row = buildRetainedSubscriptionWriteData(
      {
        email: "user@example.com",
        sourceUid: "user_123",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        priceId: "price_123",
        status: "active",
        currentPeriodEndAt: Timestamp.fromMillis(300),
      },
      Timestamp.fromMillis(100),
      Timestamp.fromMillis(200)
    );

    expect(row).toMatchObject({
      schemaVersion: 1,
      email: "user@example.com",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      stripeSubscriptionStatus: "active",
      currentPeriodEndAt: Timestamp.fromMillis(300),
      plan: "pro",
      sourceUid: "user_123",
      retainedAt: Timestamp.fromMillis(100),
      stripeSyncedAt: Timestamp.fromMillis(200),
    });
  });
});
