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
    expect(source).toContain("onSelectOffer={account.onSelectNativePlusCheckoutOffer}");
  });

  it("routes the dedicated account screen upgrade CTA through shared account actions and modal state", () => {
    const source = readSource("./AccountScreen.tsx");

    expect(source).toContain('onClick={() => void account.onOpenPlanAction()}');
    expect(source).toContain("<NativePlusUpsellModal");
    expect(source).toContain("onConfirm={account.onStartNativePlusCheckout}");
    expect(source).toContain("onSelectOffer={account.onSelectNativePlusCheckoutOffer}");
  });

  it("uses shared API URL helpers for native checkout and billing portal requests", () => {
    const source = readSource("./settings/useSettingsAccountState.ts");
    const upsellSource = readSource("./useNativePlusUpsell.ts");

    expect(source).toContain('import { useNativePlusUpsell } from "../useNativePlusUpsell";');
    expect(upsellSource).toContain('getApiUrl("/api/stripe/create-checkout-session/")');
    expect(upsellSource).toContain("successReturnPath: returnPath");
    expect(upsellSource).toContain("cancelReturnPath: returnPath");
    expect(source).toContain('fetch(getApiUrl("/api/stripe/create-billing-portal-session/"), {');
    expect(source).toContain("await Browser.open({ url: data.url });");
    expect(upsellSource).toContain("window.location.assign(data.url);");
    expect(source).not.toContain('window.location.assign("/pricing")');
    expect(upsellSource).not.toContain('window.location.assign("/pricing")');
  });

  it("loads subscription renewal dates for every renewing paid plan", () => {
    const source = readSource("./settings/useSettingsAccountState.ts");

    expect(source).toContain('function isRenewingSubscriptionPlan(plan: SettingsAccountViewModel["authPlan"])');
    expect(source).toContain('plan === "plus" || plan === "plus_monthly" || plan === "plus_yearly" || plan === "pro"');
    expect(source).toContain("if (isRenewingSubscriptionPlan(nextPlan))");
    expect(source).toContain("void loadUserSubscriptionRenewalAtMs(uid)");
    expect(source).not.toContain('if (nextPlan === "plus")');
    expect(source).not.toContain('if (authPlan === "plus")');
  });
});
