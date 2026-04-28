import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyFirebaseRequestUser = vi.fn();
const createApiAuthErrorResponse = vi.fn((error: Error & { code?: string; status?: number }) =>
  Response.json({ error: error.message, code: error.code || "auth/internal" }, { status: error.status || 500 })
);
const createApiInternalErrorResponse = vi.fn(() =>
  Response.json({ error: "Could not create checkout session.", code: "internal" }, { status: 500 })
);
const enforceUidRateLimit = vi.fn();
const loadStripeCustomerIdForUser = vi.fn();
const sessionsCreate = vi.fn();
const getStripeServer = vi.fn(() => ({
  checkout: {
    sessions: {
      create: sessionsCreate,
    },
  },
}));
const getAppBaseUrl = vi.fn(() => "https://tasklaunch.app");

vi.mock("../../shared/auth", () => ({
  verifyFirebaseRequestUser,
  createApiAuthErrorResponse,
  createApiInternalErrorResponse,
}));

vi.mock("../../shared/rateLimit", () => ({
  enforceUidRateLimit,
  ApiRateLimitError: class ApiRateLimitError extends Error {
    status: number;
    code: string;

    constructor(code: string, message: string, status = 429) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/subscriptionStore", () => ({
  loadStripeCustomerIdForUser,
}));

vi.mock("@/lib/stripeServer", () => ({
  getStripeServer,
  getAppBaseUrl,
}));

function createRequest() {
  return new Request("http://localhost/api/stripe/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ authToken: "token-1" }),
  });
}

describe("POST /api/stripe/create-checkout-session", () => {
  beforeEach(() => {
    verifyFirebaseRequestUser.mockReset().mockResolvedValue({ uid: "user-1", email: "user@example.com" });
    enforceUidRateLimit.mockReset().mockResolvedValue(undefined);
    loadStripeCustomerIdForUser.mockReset().mockResolvedValue("cus_123");
    sessionsCreate.mockReset().mockResolvedValue({ url: "https://stripe.test/session" });
    createApiAuthErrorResponse.mockClear();
    createApiInternalErrorResponse.mockClear();
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = "price_123";
  });

  it("returns 429 when the checkout limit is exceeded", async () => {
    const { ApiRateLimitError } = await import("../../shared/rateLimit");
    enforceUidRateLimit.mockRejectedValueOnce(
      new ApiRateLimitError("stripe/checkout-rate-limited", "Too many checkout attempts recently. Please wait before trying again.")
    );

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe("stripe/checkout-rate-limited");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
