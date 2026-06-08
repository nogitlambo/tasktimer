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
    expect(html).toContain('class="rankPromotionTitleRibbon"');
    expect(html).toContain('<div class="rankPromotionContent"><h2 class="rankPromotionTitleRibbon">You&#x27;ve been promoted!</h2><div class="modal rankPromotionModal');
    expect(html).toContain('</div></div></div><div class="confirmBtns rankPromotionCloseSlot"><button class="btn btn-accent" id="rankPromotionCloseBtn"');

    const titleIndex = html.indexOf("rankPromotionTitleRibbon");
    const modalIndex = html.indexOf("rankPromotionModal");
    const closeSlotIndex = html.indexOf("rankPromotionCloseSlot");

    expect(titleIndex).toBeGreaterThan(-1);
    expect(modalIndex).toBeGreaterThan(titleIndex);
    expect(closeSlotIndex).toBeGreaterThan(modalIndex);
  });
});
