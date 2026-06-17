import { describe, expect, it } from "vitest";

import { extractWrappedEmailSignInLink, wrapEmailSignInLinkForApp } from "./emailLinkUrl";

describe("email sign-in app links", () => {
  it("wraps Firebase email sign-in links in the app login route", () => {
    const firebaseLink =
      "https://tasktimer-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc&continueUrl=https%3A%2F%2Ftasklaunch.app%2Flogin%2F";

    const appLink = wrapEmailSignInLinkForApp(firebaseLink, "https://tasklaunch.app/login/");

    expect(appLink).toBe(
      `https://tasklaunch.app/login/?emailLink=${encodeURIComponent(firebaseLink)}`
    );
    expect(extractWrappedEmailSignInLink(appLink)).toBe(firebaseLink);
  });

  it("preserves an unwrapped Firebase link when no http continue URL is available", () => {
    const firebaseLink = "https://tasktimer-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc";

    expect(wrapEmailSignInLinkForApp(firebaseLink, "capacitor://localhost/login")).toBe(firebaseLink);
  });
});
