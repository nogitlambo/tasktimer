import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  planFromStripeSubscriptionStatus: vi.fn<
    (status: unknown, context?: { offer?: unknown; priceId?: unknown }) => "free" | "plus" | "plus_monthly" | "plus_yearly" | "plus_lifetime" | "pro"
  >((status: unknown) => (String(status).toLowerCase() === "active" ? "plus" : "free")),
  upsertUserSubscriptionAndPlan: vi.fn(),
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripeServer: () => ({
    webhooks: {
      constructEvent: mocks.constructEvent,
    },
  }),
}));

vi.mock("@/lib/subscriptionStore", () => ({
  deleteRetainedSubscriptionByEmail: vi.fn(),
  findRetainedSubscriptionByStripeCustomerId: vi.fn(),
  findUidByStripeCustomerId: vi.fn(),
  hasRetainedSubscriptionEntitlement: vi.fn(),
  planFromStripeSubscriptionStatus: mocks.planFromStripeSubscriptionStatus,
  upsertRetainedSubscription: vi.fn(),
  upsertUserSubscriptionAndPlan: mocks.upsertUserSubscriptionAndPlan,
}));

import { POST } from "./route";

function stripeWebhookRequest() {
  return new Request("https://tasklaunch.app/api/stripe/webhook/", {
    method: "POST",
    headers: {
      "stripe-signature": "t=1,v1=test",
    },
    body: JSON.stringify({ id: "evt_test" }),
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("writes monthly billing state when checkout completes", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "uid-123",
          metadata: { uid: "uid-123", offer: "plus_monthly", priceId: "price_monthly" },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const response = await POST(stripeWebhookRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true });
    expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith({
      uid: "uid-123",
      plan: "plus_monthly",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      priceId: "price_monthly",
      status: "checkout_completed",
    });
  });

  it("writes yearly billing state when checkout completes", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout_yearly",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_yearly",
          client_reference_id: "uid-123",
          metadata: { uid: "uid-123", offer: "plus_yearly", priceId: "price_yearly" },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const response = await POST(stripeWebhookRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true });
    expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith({
      uid: "uid-123",
      plan: "plus_yearly",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      priceId: "price_yearly",
      status: "checkout_completed",
    });
  });

  it("passes subscription metadata and price id to plan resolution on subscription updates", async () => {
    mocks.planFromStripeSubscriptionStatus.mockReturnValueOnce("plus_yearly");
    mocks.constructEvent.mockReturnValue({
      id: "evt_subscription_updated",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          metadata: { uid: "uid-123", offer: "plus_yearly" },
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_yearly" },
                current_period_end: 1800000000,
              },
            ],
          },
        },
      },
    });

    const response = await POST(stripeWebhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.planFromStripeSubscriptionStatus).toHaveBeenCalledWith("active", {
      offer: "plus_yearly",
      priceId: "price_yearly",
    });
    expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "uid-123",
        plan: "plus_yearly",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        priceId: "price_yearly",
        status: "active",
      })
    );
  });
});
