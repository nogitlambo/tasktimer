import { beforeEach, describe, expect, it, vi } from "vitest";

const checkoutSessionsCreate = vi.fn();

vi.mock("@/lib/stripeServer", () => ({
  getAppBaseUrl: () => "https://tasklaunch.app",
  getStripeServer: () => ({
    checkout: {
      sessions: {
        create: checkoutSessionsCreate,
      },
    },
  }),
}));

vi.mock("@/lib/subscriptionStore", () => ({
  loadStripeCustomerIdForUser: vi.fn(async () => ""),
}));

vi.mock("../../shared/auth", () => ({
  createApiAuthErrorResponse: vi.fn(),
  createApiInternalErrorResponse: vi.fn(),
  verifyFirebaseRequestUser: vi.fn(async () => ({ uid: "uid-123", email: "user@example.com" })),
}));

vi.mock("../../shared/rateLimit", () => ({
  ApiRateLimitError: class ApiRateLimitError extends Error {},
  enforceUidRateLimit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/stripeApiErrors", () => ({
  createStripeApiErrorResponse: vi.fn(),
  isStripeApiError: vi.fn(() => false),
}));

import { POST } from "./route";

function checkoutRequest() {
  return new Request("https://tasklaunch.app/api/stripe/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ idToken: "token" }),
  });
}

describe("POST /api/stripe/create-checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = "price_live_no_trial";
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  });

  it("creates a subscription checkout session for the configured price without forcing a trial", async () => {
    await POST(checkoutRequest());

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_live_no_trial", quantity: 1 }],
        subscription_data: {
          metadata: { uid: "uid-123" },
        },
      })
    );
    expect(checkoutSessionsCreate.mock.calls[0]?.[0]?.subscription_data).not.toHaveProperty("trial_period_days");
  });
});
