import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./RankThumbnail", () => ({
  default: ({ rankId, className }: { rankId: string; className?: string }) =>
    createElement("span", { className, "data-rank-id": rankId }),
}));

import RankPromotionOverlay, { startRankPromotionIntroPresentation } from "./RankPromotionOverlay";

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
    expect(html).toContain('class="rankPromotionOldLabelPlate"');
    expect(html).toContain('class="modalSubtext confirmText rankPromotionLabel rankPromotionOldLabelText"');
    expect(html).toContain('class="rankPromotionOldLabelShatter" aria-hidden="true"');
    expect(html.match(/class="rankPromotionOldLabelShard"/g)).toHaveLength(32);
    expect(html).toContain('<span class="rankPromotionOldLabelShard"></span>');
    expect(html.match(/Initiate/g)).toHaveLength(1);
    expect(html).not.toContain('id="rankPromotionCloseBtn"');
    expect(html).toContain('<span class="rankPromotionTapCloseText" aria-hidden="true">Tap to close</span>');
    expect(html).toContain('class="rankPromotionTitleRibbon"');
    expect(html).toContain('<div class="rankPromotionContent"><h2 class="rankPromotionTitleRibbon">LEVEL UP!</h2><div class="modal rankPromotionModal');
    expect(html).toContain('</div></div></div><div class="confirmBtns rankPromotionCloseSlot" aria-live="polite"><span class="rankPromotionTapCloseText"');

    const titleIndex = html.indexOf("rankPromotionTitleRibbon");
    const modalIndex = html.indexOf("rankPromotionModal");
    const closeSlotIndex = html.indexOf("rankPromotionCloseSlot");

    expect(titleIndex).toBeGreaterThan(-1);
    expect(modalIndex).toBeGreaterThan(titleIndex);
    expect(closeSlotIndex).toBeGreaterThan(modalIndex);
  });

  it("starts promotion smash cues when the old insignia presentation begins", () => {
    const startSmashCues = vi.fn();
    const onPresentationStart = vi.fn();

    startRankPromotionIntroPresentation({ startSmashCues }, true, onPresentationStart);

    expect(startSmashCues).toHaveBeenCalledTimes(1);
    expect(onPresentationStart).toHaveBeenCalledTimes(1);
    expect(startSmashCues.mock.invocationCallOrder[0]).toBeLessThan(onPresentationStart.mock.invocationCallOrder[0]);
  });

  it("does not start promotion smash cues when achievement sounds are disabled", () => {
    const startSmashCues = vi.fn();
    const onPresentationStart = vi.fn();

    startRankPromotionIntroPresentation({ startSmashCues }, false, onPresentationStart);

    expect(startSmashCues).not.toHaveBeenCalled();
    expect(onPresentationStart).toHaveBeenCalledTimes(1);
  });
});
