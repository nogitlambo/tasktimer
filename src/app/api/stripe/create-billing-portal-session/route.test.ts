import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billingPortalSessionsCreate: vi.fn(),
  loadStripeCustomerIdForUser: vi.fn(),
}));

vi.mock("@/lib/stripeServer", () => ({
  getAppBaseUrl: () => "https://tasklaunch.app",
  getStripeServer: () => ({
    billingPortal: {
      sessions: {
        create: mocks.billingPortalSessionsCreate,
      },
    },
  }),
}));

vi.mock("@/lib/subscriptionStore", () => ({
  loadStripeCustomerIdForUser: mocks.loadStripeCustomerIdForUser,
}));

vi.mock("../../shared/auth", () => ({
  createApiAuthErrorResponse: vi.fn(),
  createApiInternalErrorResponse: vi.fn(),
  verifyFirebaseRequestUser: vi.fn(async () => ({ uid: "uid-123" })),
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

function billingPortalRequest(body: Record<string, unknown> = { idToken: "token", returnPath: "/account" }) {
  return new Request("https://tasklaunch.app/api/stripe/create-billing-portal-session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/create-billing-portal-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadStripeCustomerIdForUser.mockResolvedValue("cus_123");
    mocks.billingPortalSessionsCreate.mockResolvedValue({ url: "https://billing.stripe.com/session" });
  });

  it("creates a billing portal session for the stored Stripe customer", async () => {
    await POST(billingPortalRequest());

    expect(mocks.billingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://tasklaunch.app/account",
    });
  });

  it("returns a validation error when no customer is stored", async () => {
    mocks.loadStripeCustomerIdForUser.mockResolvedValue("");

    const response = await POST(billingPortalRequest());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "No Stripe billing profile was found for this account yet." });
  });

  it("answers authenticated CORS preflight for native app origins", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/stripe/create-billing-portal-session", {
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
      new Request("https://tasklaunch.app/api/stripe/create-billing-portal-session", {
        method: "POST",
        headers: { origin: "capacitor://localhost" },
        body: JSON.stringify({ idToken: "token", returnPath: "/account" }),
      })
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("vary")).toBe("Origin");
  });
});
