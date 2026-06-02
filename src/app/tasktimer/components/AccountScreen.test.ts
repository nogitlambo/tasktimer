import { describe, expect, it } from "vitest";

import { getAccountSignOutActionCopy } from "./AccountScreen";

describe("getAccountSignOutActionCopy", () => {
  it("labels anonymous guest exit as Sign In", () => {
    expect(getAccountSignOutActionCopy(true, false)).toEqual({
      label: "Sign In",
      description: "Secure this guest account",
    });
  });

  it("keeps normal account sign-out copy", () => {
    expect(getAccountSignOutActionCopy(false, false)).toEqual({
      label: "Sign Out",
      description: "Log out of your account",
    });
    expect(getAccountSignOutActionCopy(false, true).label).toBe("Signing Out");
  });
});
