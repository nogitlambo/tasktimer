import { beforeEach, describe, expect, it, vi } from "vitest";

const checkoutSessionsCreate = vi.fn();
const loadStripeCustomerIdForUser = vi.fn(async () => "");
const isStripeApiError = vi.fn<(error: unknown) => boolean>(() => false);
const createStripeApiErrorResponse = vi.fn<(error: unknown, fallbackMessage: string, logLabel: string) => Response>();

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
  loadStripeCustomerIdForUser: () => loadStripeCustomerIdForUser(),
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
  createStripeApiErrorResponse: (error: unknown, fallbackMessage: string, logLabel: string) =>
    createStripeApiErrorResponse(error, fallbackMessage, logLabel),
  isStripeApiError: (error: unknown) => isStripeApiError(error),
}));

import { OPTIONS, POST } from "./route";

function checkoutRequest(body: Record<string, unknown> = { idToken: "token" }) {
  return new Request("https://tasklaunch.app/api/stripe/create-checkout-session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/create-checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_ID_PLUS_MONTHLY = "price_live_monthly";
    process.env.STRIPE_PRICE_ID_PLUS_YEARLY = "price_live_plus_yearly";
    loadStripeCustomerIdForUser.mockResolvedValue("");
    isStripeApiError.mockReturnValue(false);
    createStripeApiErrorResponse.mockReturnValue(new Response("stripe error", { status: 500 }));
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  });

  it.each([undefined, "plus_monthly"])("creates monthly checkout with a web return URL for offer %s", async (offer) => {
    const response = await POST(checkoutRequest({ offer }));

    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url).toBe("https://checkout.stripe.com/session");
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_live_monthly", quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { uid: "uid-123", offer: "plus_monthly", priceId: "price_live_monthly" },
      },
      client_reference_id: "uid-123",
      customer_email: "user@example.com",
      success_url: "https://tasklaunch.app/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://tasklaunch.app/login?checkout=cancelled",
    }));
  });

  it("creates a subscription checkout session for the yearly offer", async () => {
    await POST(checkoutRequest({ offer: "plus_yearly" }));

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_live_plus_yearly", quantity: 1 }],
        subscription_data: {
          metadata: { uid: "uid-123", offer: "plus_yearly", priceId: "price_live_plus_yearly" },
        },
        metadata: { uid: "uid-123", offer: "plus_yearly", priceId: "price_live_plus_yearly" },
      })
    );
  });

  it.each(["plus_monthly", "plus_yearly"])("creates native account return URLs for %s", async (offer) => {
    await POST(
      checkoutRequest({
        idToken: "token",
        offer,
        returnTarget: "native",
        successReturnPath: "/account",
        cancelReturnPath: "/settings?page=general",
      })
    );

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success&session_id=%7BCHECKOUT_SESSION_ID%7D",
        cancel_url: "https://tasklaunch.app/checkout-return/?target=%2Fsettings%3Fpage%3Dgeneral&checkout=cancelled",
        subscription_data: {
          ...(offer === "plus_monthly" ? { trial_period_days: 30 } : {}),
          metadata: {
            uid: "uid-123", offer,
            priceId: offer === "plus_monthly" ? "price_live_monthly" : "price_live_plus_yearly",
          },
        },
      })
    );
  });

  it("falls back to safe defaults when native return paths are unsafe", async () => {
    await POST(
      checkoutRequest({
        idToken: "token",
        offer: "plus_yearly",
        returnTarget: "native",
        successReturnPath: "https://evil.example/account",
        cancelReturnPath: "//evil.example/settings",
      })
    );

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success&session_id=%7BCHECKOUT_SESSION_ID%7D",
        cancel_url: "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=cancelled",
      })
    );
  });

  it("answers authenticated CORS preflight for native app origins", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/stripe/create-checkout-session", {
        method: "OPTIONS",
        headers: { origin: "capacitor://localhost" },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("applies authenticated CORS headers to successful responses", async () => {
    const response = await POST(
      new Request("https://tasklaunch.app/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { origin: "capacitor://localhost" },
        body: JSON.stringify({ idToken: "token", returnTarget: "native" }),
      })
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it.each(["plus_monthly", "plus_yearly"])("preserves %s trial settings when retrying a missing customer", async (offer) => {
    loadStripeCustomerIdForUser.mockResolvedValue("cus_stale");
    checkoutSessionsCreate
      .mockRejectedValueOnce({
        type: "StripeInvalidRequestError",
        code: "resource_missing",
        param: "customer",
      })
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/session" });

    const response = await POST(checkoutRequest({ offer }));

    expect(response.status).toBe(200);
    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(2);
    expect(checkoutSessionsCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        customer: "cus_stale",
        customer_email: undefined,
      })
    );
    expect(checkoutSessionsCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        customer: undefined,
        customer_email: "user@example.com",
        subscription_data: {
          ...(offer === "plus_monthly" ? { trial_period_days: 30 } : {}),
          metadata: {
            uid: "uid-123", offer,
            priceId: offer === "plus_monthly" ? "price_live_monthly" : "price_live_plus_yearly",
          },
        },
      })
    );
  });

  it("does not retry when Stripe says the configured price is missing", async () => {
    isStripeApiError.mockReturnValue(true);
    checkoutSessionsCreate.mockRejectedValueOnce({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      param: "line_items[0][price]",
    });

    const response = await POST(checkoutRequest({ offer: "plus_yearly" }));

    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    expect(createStripeApiErrorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        param: "line_items[0][price]",
      }),
      "Could not create checkout session.",
      "[api/stripe/create-checkout-session] Stripe request failed"
    );
    expect(response.status).toBe(500);
  });
});
