import { describe, expect, it } from "vitest";
import {
  buildNativeCheckoutReturnHandoffUrl,
  isHostedCheckoutReturnUrl,
  resolveHostedCheckoutReturnRoute,
  shouldAttemptNativeCheckoutReturnHandoff,
} from "./nativeCheckoutReturn";

describe("nativeCheckoutReturn", () => {
  it("recognizes hosted checkout return URLs", () => {
    expect(isHostedCheckoutReturnUrl("https://tasklaunch.app/checkout-return/?target=%2Faccount")).toBe(true);
    expect(isHostedCheckoutReturnUrl("https://tasklaunch.app/account?checkout=success")).toBe(false);
  });

  it("resolves hosted checkout returns back to in-app routes", () => {
    expect(
      resolveHostedCheckoutReturnRoute(
        "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success&session_id=cs_test"
      )
    ).toBe("/account?checkout=success&session_id=cs_test");
    expect(
      resolveHostedCheckoutReturnRoute(
        "https://tasklaunch.app/checkout-return/?target=%2Fsettings%3Fpage%3Dgeneral&checkout=cancelled"
      )
    ).toBe("/settings?page=general&checkout=cancelled");
  });

  it("attempts native handoff for mobile hosted checkout returns before fallback", () => {
    const url = "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success";
    expect(shouldAttemptNativeCheckoutReturnHandoff(url, "Mozilla/5.0 (Linux; Android 14)")).toBe(true);
    expect(shouldAttemptNativeCheckoutReturnHandoff(`${url}&nativeHandoff=1`, "Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });

  it("builds an Android intent handoff URL for hosted checkout returns", () => {
    expect(
      buildNativeCheckoutReturnHandoffUrl(
        "https://tasklaunch.app/checkout-return/?target=%2Faccount&checkout=success&session_id=cs_test",
        "Mozilla/5.0 (Linux; Android 14)"
      )
    ).toBe(
      "intent://account?checkout=success&session_id=cs_test#Intent;scheme=com.tasklaunch.app;package=com.tasklaunch.app;S.browser_fallback_url=https%3A%2F%2Ftasklaunch.app%2Fcheckout-return%2F%3Ftarget%3D%252Faccount%26checkout%3Dsuccess%26session_id%3Dcs_test%26nativeHandoff%3D1;end"
    );
  });
});

