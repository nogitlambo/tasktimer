import { describe, expect, it } from "vitest";

import { getAccountSignOutActionCopy } from "./AccountScreen";

describe("getAccountSignOutActionCopy", () => {
  it("keeps normal account sign-out copy", () => {
    expect(getAccountSignOutActionCopy(false)).toEqual({
      label: "Sign Out",
      description: "Log out of your account",
    });
    expect(getAccountSignOutActionCopy(true).label).toBe("Signing Out");
  });
});
