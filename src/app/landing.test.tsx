import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "./landing";

describe("Landing", () => {
  it("renders the landing hero without removing the primary actions", () => {
    const html = renderToStaticMarkup(<Landing showTitlePhase={true} showActions={true} />);

    expect(html).not.toContain('class="landingV2HeroVisual"');
    expect(html).not.toContain('src="/landing_feature_wide.png"');
    expect(html).toContain('src="/rocket_breaking_chains4_opticalflow_60fps_50pct.mp4"');
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
    expect(html).toContain('href="/landingsoon"');
    expect(html).toContain("Landing Soon");
    expect(html).not.toContain("Continue without account");
  });

  it("uses static rocket still assets below 1080px on the landing page only", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const landingTabletBlock = css.match(/@media \(max-width: 1079px\) \{[\s\S]*?(?=\n@media|\n$)/)?.[0] || "";
    const landingMobileBlock = css.match(/@media \(max-width: 699px\) \{[\s\S]*?(?=\n@media|\n$)/)?.[0] || "";

    expect(css).toContain(".landingV2LandingPage");
    expect(landingTabletBlock).toContain('url("/rocket_breaking_chains4_opticalflow_60fps_50pct_lastframe_tablet.webp")');
    expect(landingTabletBlock).toContain(".landingV2LandingPage::before");
    expect(landingTabletBlock).toContain("display: block;");
    expect(landingTabletBlock).toContain(".landingV2LandingPage .landingV2BackgroundVideo");
    expect(landingTabletBlock).toContain('display: none;');
    expect(landingMobileBlock).toContain('url("/rocket_breaking_chains4_opticalflow_60fps_50pct_lastframe_mobile.webp")');
  });

  it("adds a scoped 32px gap between the public landing headers and hero text", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const publicLandingGapBlock = css.match(/\.landingV2LandingPage,\n\.landingSoonV2 \{[\s\S]*?\n\}/)?.[0] || "";
    const heroRule = css.match(/\.landingV2 \.landingV2Hero \{[\s\S]*?\n\}/)?.[0] || "";
    const mobileBlock = css.match(/@media \(max-width: 700px\) \{[\s\S]*?(?=\n@media|\n$)/)?.[0] || "";

    expect(publicLandingGapBlock).toContain("--landing-header-hero-gap: 32px;");
    expect(heroRule).toContain("calc(var(--landing-hero-pad-top-scale) + var(--landing-header-hero-gap, 0px))");
    expect(mobileBlock).toContain("calc(clamp(10px, 2.8svh, 18px) + var(--landing-header-hero-gap, 0px))");
  });
});
