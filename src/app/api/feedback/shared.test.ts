import { describe, expect, it, vi } from "vitest";

const verifyIdToken = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  canUseFirebaseAdminDefaultCredentials: () => false,
  getFirebaseAdminAuth: () => ({ verifyIdToken }),
  getFirebaseAdminDb: vi.fn(),
  hasFirebaseAdminCredentialConfig: () => true,
}));

import { FeedbackApiError, verifyFeedbackRequestUser } from "./shared";

describe("verifyFeedbackRequestUser", () => {
  it("rejects requests without a verified auth token, even when guest fields are present", async () => {
    const req = new Request("https://tasklaunch.test/api/feedback", { method: "POST" });

    await expect(
      verifyFeedbackRequestUser(req, {
        guest: true,
        guestFingerprint: "legacy-guest-device",
      })
    ).rejects.toMatchObject({
      code: "feedback/unauthenticated",
      status: 401,
    } satisfies Partial<FeedbackApiError>);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("accepts authenticated requests regardless of anonymous display preference", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "uid-1", email: "user@example.com" });
    const req = new Request("https://tasklaunch.test/api/feedback", {
      method: "POST",
      headers: { authorization: "Bearer id-token-1" },
    });

    await expect(verifyFeedbackRequestUser(req, { isAnonymous: true })).resolves.toEqual({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "id-token-1",
    });
    expect(verifyIdToken).toHaveBeenCalledWith("id-token-1");
  });
});
