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
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = "price_live_no_trial";
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  });

  it("creates a subscription checkout session for the configured price without forcing a trial", async () => {
    await POST(checkoutRequest());

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_live_no_trial", quantity: 1 }],
        success_url: "https://tasklaunch.app/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://tasklaunch.app/login?checkout=cancelled",
        subscription_data: {
          metadata: { uid: "uid-123" },
        },
      })
    );
    expect(checkoutSessionsCreate.mock.calls[0]?.[0]?.subscription_data).not.toHaveProperty("trial_period_days");
  });

  it("creates native account return URLs when the caller requests native checkout routing", async () => {
    await POST(
      checkoutRequest({
        idToken: "token",
        returnTarget: "native",
        successReturnPath: "/account",
        cancelReturnPath: "/settings?page=general",
      })
    );

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success&session_id=%7BCHECKOUT_SESSION_ID%7D",
        cancel_url: "https://tasklaunch.app/checkout-return/?target=%2Fsettings%3Fpage%3Dgeneral&checkout=cancelled",
      })
    );
  });

  it("falls back to safe defaults when native return paths are unsafe", async () => {
    await POST(
      checkoutRequest({
        idToken: "token",
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
});
