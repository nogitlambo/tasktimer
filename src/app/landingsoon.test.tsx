import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingSoon from "./landingsoon";

describe("LandingSoon", () => {
  it("renders the early access hero without below-the-fold sections", () => {
    const html = renderToStaticMarkup(<LandingSoon showTitlePhase={true} showActions={true} />);

    expect(html).toContain('src="/rocket_breaking_chains4_opticalflow_60fps_50pct.mp4"');
    expect(html).toContain('class="landingV2RocketHotspot"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Early Access Countdown");
    expect(html).toContain("25th May 2026");
    expect(html).toContain("Progress over perfection");
    expect(html).toContain("Break free");
    expect(html).toContain("Designed for the neurodivergent, TaskLaunch uses non-traditional productivity methods");
    expect(html).toContain("Request Early Access");
    expect(html).not.toContain('href="/privacy"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain("Watch Demo");
    expect(html).not.toContain("Core capabilities");
    expect(html).not.toContain("Interface preview");
    expect(html).toContain('href="/about"');
  });
});
