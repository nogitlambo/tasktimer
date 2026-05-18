import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "./landing";

describe("Landing", () => {
  it("renders the landing hero without removing the primary actions", () => {
    const html = renderToStaticMarkup(<Landing showTitlePhase={true} showActions={true} />);

    expect(html).not.toContain('class="landingV2HeroVisual"');
    expect(html).not.toContain('src="/landing_feature_wide.png"');
    expect(html).toContain('src="/rocket_breaking_chains4.mp4"');
    expect(html).not.toContain('poster="/rocket_breaking_chains3_poster.jpg"');
    expect(html).not.toContain("autoPlay");
    expect(html).toContain('preload="auto"');
    expect(html).toContain('class="landingV2RocketHotspot"');
    expect(html).toContain('aria-label="Play rocket animation"');
    expect(html).not.toContain("loop");
    expect(html).not.toContain("isLaunchStarting");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Get Started");
    expect(html).toContain("Watch Demo");
    expect(html).toContain('class="landingV2MobileMenu"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-label="Close navigation menu"');
    expect(html).toContain('href="/landingsoon"');
    expect(html).toContain("Landing Soon");
    expect(html).not.toContain("Continue without account");
  });
});
