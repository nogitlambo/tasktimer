import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import LandingSoon from "./landingsoon";

describe("LandingSoon", () => {
  it("renders the early access hero without below-the-fold sections", () => {
    const html = renderToStaticMarkup(<LandingSoon showTitlePhase={true} showActions={true} />);

    expect(html).toContain('src="/rocket_breaking_chains4_opticalflow_60fps_50pct.mp4"');
    expect(html).toContain('class="landingV2RocketHotspot"');
    expect(html).toContain('type="email"');
    expect(html).not.toContain(["Progress", "over", "perfection"].join(" "));
    expect(html).toContain("Break free");
    expect(html).toContain("Designed for the neurodivergent, TaskLaunch uses non-traditional productivity methods");
    expect(html).toContain('aria-label="Request early access"');
    expect(html).toContain("Join Early Access List");
    expect(html).not.toContain('href="/privacy"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain("Watch Demo");
    expect(html).not.toContain("Core capabilities");
    expect(html).not.toContain("Interface preview");
    expect(html).toContain('href="/about"');
  });

  it("keeps the email field visible in the narrow mobile form layout", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const mobileBlock = css.match(/@media \(max-width: 700px\) \{[\s\S]*?(?=\n@media|\n$)/)?.[0] || "";

    expect(mobileBlock).toContain(".landingV2 .landingSoonV2Input");
    expect(mobileBlock).toContain("padding: 0 14px;");
    expect(mobileBlock).toContain(".landingV2 .landingSoonV2Submit");
    expect(mobileBlock).toContain("position: static;");
    expect(mobileBlock).toContain("width: 100%;");
  });
});
