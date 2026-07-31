import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("native account upgrade wiring", () => {
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
});
