import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NativePlusUpsellModal from "./NativePlusUpsellModal";

describe("NativePlusUpsellModal", () => {
  it("renders the native Plus upsell content with standard modal structure", () => {
    const html = renderToStaticMarkup(
      <NativePlusUpsellModal
        open
        busy={false}
        error=""
        selectedOffer="plus_monthly"
        onClose={() => {}}
        onSelectOffer={() => {}}
        onConfirm={() => {}}
      />
    );

    expect(html).toContain('id="nativePlusUpsellOverlay"');
    expect(html).toContain('class="modal nativePlusUpsellPrimitiveModal"');
    expect(html).toContain('aria-label="Upgrade to Plus"');
    expect(html).toContain('class="iconBtn nativePlusUpsellCloseBtn"');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("Get <span");
    expect(html).toContain(">PLUS</span>");
    expect(html).toContain("14-DAY FREE TRIAL");
    expect(html).toContain("$6.99");
    expect(html).toContain("PLUS Lifetime");
    expect(html).toContain("ONE-TIME");
    expect(html).toContain("One-time purchase");
    expect(html).toContain("Unlock AI-guided workflow optimisation");
    expect(html).toContain('class="confirmBtns nativePlusUpsellActions"');
    expect(html).not.toContain(">Close<");
    expect(html).toContain("Start my 14-day free trial");
  });

  it("keeps native upsell modal styling scoped to the overlay allowlist", () => {
    const css = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("#nativePlusUpsellOverlay .modal{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellCloseBtn{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellHeader{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellTitleAccent{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferCard{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellFeatureList{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellActions{");
  });
});
