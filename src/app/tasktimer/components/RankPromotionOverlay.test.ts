import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./RankThumbnail", () => ({
  default: ({ rankId, className }: { rankId: string; className?: string }) =>
    createElement("span", { className, "data-rank-id": rankId }),
}));

import RankPromotionOverlay from "./RankPromotionOverlay";

describe("RankPromotionOverlay", () => {
  it("renders the promotion modal with stable hooks and shield frame", () => {
    const html = renderToStaticMarkup(
      createElement(RankPromotionOverlay, {
        previousRankId: "initiate",
        previousRankLabel: "Initiate",
        nextRankId: "operator",
        nextRankLabel: "Operator",
        achievementSoundsEnabled: false,
        onPresentationStart: vi.fn(),
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('id="rankPromotionOverlay"');
    expect(html).toContain("rankPromotionModal");
    expect(html).toContain('class="rankPromotionShieldFrame"');
    expect(html).toContain('class="rankPromotionShieldClipLayer"');
    expect(html).toContain('id="rankPromotionText"');
    expect(html).toContain('id="rankPromotionCloseBtn"');
  });
});
