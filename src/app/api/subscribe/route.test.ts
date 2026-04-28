import { beforeEach, describe, expect, it, vi } from "vitest";

const getFirebaseAdminDb = vi.fn();
const enforcePublicRateLimit = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb,
}));

vi.mock("../shared/rateLimit", () => ({
  ApiRateLimitError: class ApiRateLimitError extends Error {
    status: number;
    code: string;

    constructor(code: string, message: string, status = 429) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  buildPublicRateLimitActorKey: ({ ip, secondaryKey }: { ip: string; secondaryKey?: string | null }) =>
    secondaryKey ? `${ip}::${secondaryKey}` : ip,
  enforcePublicRateLimit,
  extractClientIp: () => "203.0.113.10",
}));

function createRequest(email = "person@example.com") {
  return new Request("http://localhost/api/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/subscribe", () => {
  beforeEach(() => {
    enforcePublicRateLimit.mockReset();
    getFirebaseAdminDb.mockReset().mockReturnValue({
      collection: () => ({
        doc: () => ({
          get: vi.fn().mockResolvedValue({ exists: false }),
          set: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });
  });

  it("returns 429 when the public limit is exceeded", async () => {
    const { ApiRateLimitError } = await import("../shared/rateLimit");
    enforcePublicRateLimit.mockRejectedValueOnce(
      new ApiRateLimitError("subscribe/rate-limited", "Too many subscribe attempts. Please wait before trying again.")
    );

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe("subscribe/rate-limited");
  });

  it("returns 429 when the repeated email limit is exceeded after repeated attempts", async () => {
    const { ApiRateLimitError } = await import("../shared/rateLimit");
    let repeatAttempts = 0;
    enforcePublicRateLimit.mockImplementation(async ({ namespace }: { namespace: string }) => {
      if (namespace === "subscribe-email-repeat") {
        repeatAttempts += 1;
      }
      if (namespace === "subscribe-email-repeat" && repeatAttempts >= 4) {
        throw new ApiRateLimitError(
          "subscribe/repeat-rate-limited",
          "This email was submitted too many times recently. Please try again later."
        );
      }
    });

    const { POST } = await import("./route");
    let lastResponse: Response | null = null;
    for (let index = 0; index < 4; index += 1) {
      lastResponse = await POST(createRequest());
    }

    expect(lastResponse?.status).toBe(429);
    await expect(lastResponse?.json()).resolves.toMatchObject({ code: "subscribe/repeat-rate-limited" });
  });
});
