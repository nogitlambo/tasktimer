import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NativePlusUpsellModal, {
  getNativePlusUpsellPanelForOffer,
  getNativePlusUpsellToggleCopy,
} from "./NativePlusUpsellModal";

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
    expect(html).toContain("$99.00");
    expect(html).toContain("One-off payment");
    expect(html).toContain("Unlock AI-guided workflow optimisation");
    expect(html).toContain('class="confirmBtns nativePlusUpsellActions"');
    expect(html).toContain('class="nativePlusUpsellTopSection"');
    expect(html).toContain('class="nativePlusUpsellOfferViewport"');
    expect(html).toContain('class="nativePlusUpsellOfferTrack"');
    expect(html).toContain("Get PLUS Lifetime");
    expect(html).not.toContain(">Close<");
    expect(html).toContain("Start my 14-day free trial");
    expect(html).not.toContain('class="nativePlusUpsellOfferList"');
  });

  it("keeps native upsell modal styling scoped to the overlay allowlist", () => {
    const css = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("#nativePlusUpsellOverlay .modal{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellCloseBtn{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellHeader{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellTitleAccent{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellTopSection{");
    const topSectionRule = css.match(/#nativePlusUpsellOverlay \.nativePlusUpsellTopSection\{[\s\S]*?\n\}/)?.[0] || "";
    expect(topSectionRule).toContain("border-radius: 16px 16px 0 0 !important;");
    expect(topSectionRule).toContain("overflow: visible !important;");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferViewport{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferTrack{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferCard{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferTitleAccent{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellOfferBadge{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellFeatureList{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellActions{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellToggleLink{");
  });

  it("maps checkout offers to the matching visible offer panel", () => {
    expect(getNativePlusUpsellPanelForOffer("plus_monthly")).toBe("monthly");
    expect(getNativePlusUpsellPanelForOffer("plus_lifetime")).toBe("lifetime");
  });

  it("uses the correct toggle link copy for each panel state", () => {
    expect(getNativePlusUpsellToggleCopy("monthly")).toBe("Get PLUS Lifetime");
    expect(getNativePlusUpsellToggleCopy("lifetime")).toBe("Back to monthly");
  });
});
