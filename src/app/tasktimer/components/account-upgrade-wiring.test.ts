import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("account upgrade wiring", () => {
  it("routes the settings account pane upgrade CTA through shared account actions and modal state", () => {
    const source = readSource("./settings/SettingsAccountPane.tsx");

    expect(source).toContain('onClick={() => void account.onOpenPlanAction()}');
    expect(source).toContain("<NativePlusUpsellModal");
    expect(source).toContain("onConfirm={account.onStartNativePlusCheckout}");
  });

  it("routes the dedicated account screen upgrade CTA through shared account actions and modal state", () => {
    const source = readSource("./AccountScreen.tsx");

    expect(source).toContain('onClick={() => void account.onOpenPlanAction()}');
    expect(source).toContain("<NativePlusUpsellModal");
    expect(source).toContain("onConfirm={account.onStartNativePlusCheckout}");
  });

  it("uses the shared API URL helper for native checkout and billing portal requests", () => {
    const source = readSource("./settings/useSettingsAccountState.ts");

    expect(source).toContain('const checkoutApiUrl = getApiUrl("/api/stripe/create-checkout-session/");');
    expect(source).toContain("fetch(checkoutApiUrl, {");
    expect(source).toContain('fetch(getApiUrl("/api/stripe/create-billing-portal-session/"), {');
    expect(source).toContain('logNativePlusCheckout("Starting native checkout"');
    expect(source).toContain('warnNativePlusCheckout("Native checkout failed"');
    expect(source).not.toContain('window.location.assign("/pricing")');
  });
});
