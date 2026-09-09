import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  listCheckoutSessions: vi.fn(),
  retrieveSubscription: vi.fn(),
  findUidByStripeCustomerId: vi.fn(),
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
    checkout: { sessions: { list: mocks.listCheckoutSessions } },
    subscriptions: { retrieve: mocks.retrieveSubscription },
  }),
}));

vi.mock("@/lib/subscriptionStore", () => ({
  deleteRetainedSubscriptionByEmail: vi.fn(),
  findRetainedSubscriptionByStripeCustomerId: vi.fn(),
  findUidByStripeCustomerId: mocks.findUidByStripeCustomerId,
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
    mocks.planFromStripeSubscriptionStatus.mockReset().mockImplementation((status) =>
      String(status).toLowerCase() === "active" ? "plus" : "free"
    );
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.findUidByStripeCustomerId.mockResolvedValue("");
    mocks.listCheckoutSessions.mockResolvedValue({ data: [] });
    mocks.retrieveSubscription.mockResolvedValue({
      id: "sub_123", customer: "cus_123", metadata: {}, status: "active",
      items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1800000000 }] },
    });
  });

  it("persists a Payment Link trial's real status so plan reconciliation does not downgrade it", async () => {
    mocks.retrieveSubscription.mockResolvedValue({
      id: "sub_123", customer: "cus_123", metadata: {}, status: "trialing",
      items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1800000000 }] },
    });
    mocks.planFromStripeSubscriptionStatus.mockReturnValueOnce("plus_monthly");
    mocks.constructEvent.mockReturnValue({
      id: "evt_payment_link_checkout", type: "checkout.session.completed",
      data: { object: {
        id: "cs_payment_link", client_reference_id: "uid-123", metadata: {},
        customer: "cus_123", subscription: "sub_123",
      } },
    });

    const response = await POST(stripeWebhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith({
      uid: "uid-123", plan: "plus_monthly", customerId: "cus_123", subscriptionId: "sub_123",
      priceId: "price_monthly", status: "trialing", currentPeriodEndAt: 1800000000000,
    });
  });

  it.each([
    ["customer.subscription.created", "trialing", "plus_monthly"],
    ["customer.subscription.updated", "active", "plus_monthly"],
    ["customer.subscription.deleted", "canceled", "free"],
  ])("resolves payment-link user attribution for %s before a customer mapping exists", async (eventType, status, plan) => {
    mocks.planFromStripeSubscriptionStatus.mockReturnValue("plus_monthly");
    mocks.listCheckoutSessions.mockResolvedValue({ data: [{
      id: "cs_payment_link", status: "complete", customer: "cus_new", subscription: "sub_new",
      client_reference_id: "uid-new", metadata: {},
    }] });
    mocks.constructEvent.mockReturnValue({
      id: "evt_payment_link_subscription", type: eventType,
      data: { object: {
        id: "sub_new", customer: "cus_new", metadata: {}, status,
        items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1800000000 }] },
      } },
    });

    const response = await POST(stripeWebhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.listCheckoutSessions).toHaveBeenCalledWith({ subscription: "sub_new", limit: 1 });
    expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith(expect.objectContaining({
      uid: "uid-new", plan, customerId: "cus_new", subscriptionId: "sub_new", status,
    }));
  });

  it.each(["missing-reference", "different-customer", "lookup-failure", "known-customer"])(
    "handles %s when resolving a subscription without metadata", async (scenario) => {
      mocks.constructEvent.mockReturnValue({
        id: "evt_subscription", type: "customer.subscription.updated",
        data: { object: {
          id: "sub_new", customer: "cus_new", metadata: {}, status: "active",
          items: { data: [{ price: { id: "price_monthly" } }] },
        } },
      });
      mocks.listCheckoutSessions.mockResolvedValue({ data: [{
        customer: scenario === "different-customer" ? "cus_other" : "cus_new",
        client_reference_id: scenario === "missing-reference" ? null : "uid-new",
        metadata: {},
      }] });
      if (scenario === "lookup-failure") mocks.listCheckoutSessions.mockRejectedValueOnce(new Error("Stripe unavailable"));
      if (scenario === "known-customer") mocks.findUidByStripeCustomerId.mockResolvedValueOnce("uid-known");

      const response = await POST(stripeWebhookRequest());

      expect(response.status).toBe(scenario === "lookup-failure" ? 400 : 200);
      if (scenario === "known-customer") {
        expect(mocks.listCheckoutSessions).not.toHaveBeenCalled();
        expect(mocks.upsertUserSubscriptionAndPlan).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-known", plan: "plus" }));
      } else {
        expect(mocks.upsertUserSubscriptionAndPlan).not.toHaveBeenCalled();
      }
    }
  );

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
