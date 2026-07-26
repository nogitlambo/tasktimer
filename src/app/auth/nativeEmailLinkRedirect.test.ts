import { describe, expect, it } from "vitest";

import {
  buildNativeEmailLinkHandoffUrl,
  resolveNativeEmailLinkLoginRoute,
  shouldAttemptNativeEmailLinkHandoff,
} from "./nativeEmailLinkRedirect";

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

  it("keeps custom-scheme native app login links on the login route", () => {
    expect(
      resolveNativeEmailLinkLoginRoute(
        "com.tasklaunch.app://login?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc%26continueUrl%3Dhttps%253A%252F%252Ftasklaunch.app%252Flogin%252F&nativeHandoff=1"
      )
    ).toBe(
      "/login?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc%26continueUrl%3Dhttps%253A%252F%252Ftasklaunch.app%252Flogin%252F&nativeHandoff=1"
    );
  });

  it("ignores ordinary app links", () => {
    expect(resolveNativeEmailLinkLoginRoute("https://tasklaunch.app/tasklaunch")).toBe("");
  });
});

describe("buildNativeEmailLinkHandoffUrl", () => {
  const mobileUserAgent =
    "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
  const desktopUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

  it("builds an Android intent URL with a marked browser fallback", () => {
    const link =
      "https://tasklaunch.app/login/?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2F__%2Fauth%2Faction%3Fmode%3DsignIn%26oobCode%3Dabc";

    const handoffUrl = buildNativeEmailLinkHandoffUrl(link, mobileUserAgent);

    expect(handoffUrl).toContain("intent://login?emailLink=");
    expect(handoffUrl).toContain("scheme=com.tasklaunch.app");
    expect(handoffUrl).toContain("package=com.tasklaunch.app");
    expect(decodeURIComponent(handoffUrl)).toContain("https://tasklaunch.app/login/?emailLink=");
    expect(decodeURIComponent(handoffUrl)).toContain("nativeHandoff=1");
  });

  it("does not attempt native handoff on desktop or after a fallback attempt", () => {
    expect(
      shouldAttemptNativeEmailLinkHandoff(
        "https://tasklaunch.app/login/?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2Fauth%2Flink",
        desktopUserAgent
      )
    ).toBe(false);
    expect(
      shouldAttemptNativeEmailLinkHandoff(
        "https://tasklaunch.app/login/?emailLink=https%3A%2F%2Ftasktimer-prod.firebaseapp.com%2Fauth%2Flink&nativeHandoff=1",
        mobileUserAgent
      )
    ).toBe(false);
  });
});
