import { afterEach, describe, expect, it } from "vitest";
import {
  buildUserPlanMirrorWriteData,
  planFromStripeSubscriptionStatus,
} from "./subscriptionStore";

describe("subscriptionStore plan normalization", () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_PLUS_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_PLUS_YEARLY;
  });

  it("preserves cadence-specific PLUS plans in the user plan mirror", () => {
    expect(buildUserPlanMirrorWriteData({ uid: "uid-1", plan: "plus_monthly" }, null).plan).toBe("plus_monthly");
    expect(buildUserPlanMirrorWriteData({ uid: "uid-1", plan: "plus_yearly" }, null).plan).toBe("plus_yearly");
  });

  it("resolves active subscription cadence from offer metadata", () => {
    expect(planFromStripeSubscriptionStatus("active", { offer: "plus_monthly" })).toBe("plus_monthly");
    expect(planFromStripeSubscriptionStatus("trialing", { offer: "plus_yearly" })).toBe("plus_yearly");
  });

  it("resolves active subscription cadence from configured Stripe price ids", () => {
    process.env.STRIPE_PRICE_ID_PLUS_MONTHLY = "price_monthly";
    process.env.STRIPE_PRICE_ID_PLUS_YEARLY = "price_yearly";

    expect(planFromStripeSubscriptionStatus("active", { priceId: "price_monthly" })).toBe("plus_monthly");
    expect(planFromStripeSubscriptionStatus("past_due", { priceId: "price_yearly" })).toBe("plus_yearly");
  });

  it("falls back to generic PLUS for active subscriptions without cadence context", () => {
    expect(planFromStripeSubscriptionStatus("active")).toBe("plus");
    expect(planFromStripeSubscriptionStatus("canceled", { offer: "plus_yearly" })).toBe("free");
  });
});
