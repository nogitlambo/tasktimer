import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
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
  planFromStripeSubscriptionStatus: vi.fn((status: unknown) => (String(status).toLowerCase() === "active" ? "pro" : "free")),
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

  it("writes the checkout session uid to billing state when checkout completes", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "uid-123",
          metadata: { uid: "uid-123" },
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
      plan: "pro",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      status: "checkout_completed",
    });
  });
});
