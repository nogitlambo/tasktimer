import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "./landing";

describe("Landing", () => {
  it("renders the landing hero without removing the primary actions", () => {
    const html = renderToStaticMarkup(<Landing showTitlePhase={true} showActions={true} />);

    expect(html).not.toContain('class="landingV2HeroVisual"');
    expect(html).not.toContain('src="/landing_feature_wide.png"');
    expect(html).toContain('href="/web-sign-in"');
    expect(html).toContain("Get Started");
    expect(html).toContain("Watch Demo");
    expect(html).toContain('class="landingV2MobileMenu"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-label="Close navigation menu"');
    expect(html).not.toContain("Continue without account");
  });
});
