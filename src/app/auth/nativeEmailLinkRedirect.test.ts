import { describe, expect, it } from "vitest";

import { resolveNativeEmailLinkLoginRoute } from "./nativeEmailLinkRedirect";

describe("resolveNativeEmailLinkLoginRoute", () => {
  it("keeps wrapped app login email links on the login route", () => {
    expect(
      resolveNativeEmailLinkLoginRoute(
        "https://tasklaunch.app/login/?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc"
      )
    ).toBe(
      "/login?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc"
    );
  });

  it("wraps direct Firebase action links for the login page", () => {
    expect(
      resolveNativeEmailLinkLoginRoute(
        "https://tasktimer-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc&continueUrl=https%3A%2F%2Ftasklaunch.app%2Flogin%2F"
      )
    ).toBe(
      "/login?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc%26continueUrl%3Dhttps%253A%252F%252Ftasklaunch.app%252Flogin%252F"
    );
  });

  it("ignores ordinary app links", () => {
    expect(resolveNativeEmailLinkLoginRoute("https://tasklaunch.app/tasklaunch")).toBe("");
  });
});
