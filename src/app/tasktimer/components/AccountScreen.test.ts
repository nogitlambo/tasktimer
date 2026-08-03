import { describe, expect, it } from "vitest";

import { getAccountSignOutActionCopy, getAccountSyncActionCopy } from "./AccountScreen";

describe("getAccountSignOutActionCopy", () => {
  it("keeps normal account sign-out copy", () => {
    expect(getAccountSignOutActionCopy(false)).toEqual({
      label: "Sign Out",
    });
    expect(getAccountSignOutActionCopy(true).label).toBe("Signing Out");
  });
});

describe("getAccountSyncActionCopy", () => {
  it("keeps normal account sync copy", () => {
    expect(getAccountSyncActionCopy(false)).toEqual({
      label: "Sync",
    });
    expect(getAccountSyncActionCopy(true).label).toBe("Syncing...");
  });
});
