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
        ctaLabel="Launch My 7-Day Free Trial"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    expect(html).toContain('id="nativePlusUpsellOverlay"');
    expect(html).toContain('class="modal"');
    expect(html).toContain('aria-label="Upgrade to Plus"');
    expect(html).toContain(">PRO<");
    expect(html).toContain("7-DAY FREE TRIAL");
    expect(html).toContain("$7.99");
    expect(html).toContain("Unlock AI-guided workflow optimisation");
    expect(html).toContain('class="confirmBtns nativePlusUpsellActions"');
    expect(html).toContain("Launch My 7-Day Free Trial");
  });

  it("keeps native upsell modal styling scoped to the overlay allowlist", () => {
    const css = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("#nativePlusUpsellOverlay .modal{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellHeader{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellFeatureList{");
    expect(css).toContain("#nativePlusUpsellOverlay .nativePlusUpsellActions{");
  });
});
