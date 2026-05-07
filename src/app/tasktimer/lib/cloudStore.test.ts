import { describe, expect, it } from "vitest";

import { buildIdentitySyncResponseError, isLargeImplicitHistoryDelete } from "./cloudStore";

describe("buildIdentitySyncResponseError", () => {
  it("preserves reportable identity sync response fields", async () => {
    const error = await buildIdentitySyncResponseError(
      new Response(
        JSON.stringify({
          error: "Too many identity sync attempts recently. Please wait before trying again.",
          code: "account/sync-identity-rate-limited",
          logId: "acct-sync-ABC123",
        }),
        { status: 429 }
      )
    );

    expect(error.message).toBe("Too many identity sync attempts recently. Please wait before trying again. (status 429)");
    expect(error.code).toBe("account/sync-identity-rate-limited");
    expect(error.status).toBe(429);
    expect(error.logId).toBe("acct-sync-ABC123");
  });
});

describe("isLargeImplicitHistoryDelete", () => {
  it("flags large accidental history shrinks", () => {
    expect(isLargeImplicitHistoryDelete(100, 70)).toBe(true);
    expect(isLargeImplicitHistoryDelete(8, 2)).toBe(true);
  });

  it("allows small edits and additions", () => {
    expect(isLargeImplicitHistoryDelete(100, 96)).toBe(false);
    expect(isLargeImplicitHistoryDelete(5, 0)).toBe(false);
    expect(isLargeImplicitHistoryDelete(10, 12)).toBe(false);
  });
});
