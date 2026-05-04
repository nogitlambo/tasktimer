import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
import { verifyFirebaseRequestUser } from "../../shared/auth";
import { POST } from "./route";

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: vi.fn(),
}));

vi.mock("../../shared/auth", () => ({
  createApiAuthErrorResponse: vi.fn((error: unknown, fallbackMessage: string) => {
    const source = error as { message?: string; code?: string; status?: number };
    return Response.json(
      { error: source.message || fallbackMessage, code: source.code || "auth/internal" },
      { status: source.status || 500 }
    );
  }),
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
  return {
    ...actual,
    enforceUidRateLimit: vi.fn(),
  };
});

describe("POST /api/account/sync-identity", () => {
  beforeEach(() => {
    vi.mocked(verifyFirebaseRequestUser).mockResolvedValue({
      uid: "user-123",
      email: "user@example.com",
      idToken: "token",
    });
    vi.mocked(enforceUidRateLimit).mockReset();
  });

  it("returns a reportable log ID for rate limited identity sync attempts", async () => {
    vi.mocked(enforceUidRateLimit).mockRejectedValue(
      new ApiRateLimitError(
        "account/sync-identity-rate-limited",
        "Too many identity sync attempts recently. Please wait before trying again.",
        429
      )
    );

    const response = await POST(
      new Request("https://tasklaunch.test/api/account/sync-identity", {
        method: "POST",
        body: JSON.stringify({ displayName: "User" }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toMatchObject({
      error: "Too many identity sync attempts recently. Please wait before trying again.",
      code: "account/sync-identity-rate-limited",
    });
    expect(payload.logId).toMatch(/^acct-sync-/);
  });
});
