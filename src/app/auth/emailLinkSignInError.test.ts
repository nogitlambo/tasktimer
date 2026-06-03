import { describe, expect, it } from "vitest";

import { getEmailLinkSignInErrorMessage, USED_OR_EXPIRED_EMAIL_LINK_MESSAGE } from "./emailLinkSignInError";

describe("getEmailLinkSignInErrorMessage", () => {
  it("maps invalid action-code failures to the used or expired link message", () => {
    expect(getEmailLinkSignInErrorMessage({ code: "auth/invalid-action-code" }, "Fallback")).toBe(
      USED_OR_EXPIRED_EMAIL_LINK_MESSAGE
    );
  });

  it("maps expired action-code failures found in the message", () => {
    expect(getEmailLinkSignInErrorMessage(new Error("Firebase: Error (auth/expired-action-code)."), "Fallback")).toBe(
      USED_OR_EXPIRED_EMAIL_LINK_MESSAGE
    );
  });

  it("preserves generic auth error messages", () => {
    expect(getEmailLinkSignInErrorMessage(new Error("Could not reach Firebase."), "Fallback")).toBe(
      "Could not reach Firebase."
    );
  });
});
