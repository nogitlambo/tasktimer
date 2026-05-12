import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "./landing";

describe("Landing", () => {
  it("renders the decorative hero artwork without removing the primary actions", () => {
    const html = renderToStaticMarkup(<Landing showTitlePhase={true} showActions={true} />);

    expect(html).toContain('src="/landing/tasklaunch-hero-neuro-profile.png"');
    expect(html).toContain('class="landingV2HeroVisual"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
    expect(html).toContain('href="/web-sign-in"');
    expect(html).toContain("Get Started");
    expect(html).toContain('href="/tasklaunch"');
    expect(html).toContain("Continue without account");
  });
});
