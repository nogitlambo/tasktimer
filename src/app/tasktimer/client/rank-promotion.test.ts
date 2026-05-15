import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRankPromotionTestPayload,
  getRankPromotion,
  hasBlockingPromotionXpAnimation,
  hasBlockingPromotionOverlay,
  RANK_PROMOTION_AUDIO_SRC,
  RANK_PROMOTION_OVERLAY_ID,
  startRankPromotionCelebration,
  stopRankPromotionCelebration,
} from "./rank-promotion";
import { TASKTIMER_OVERLAY_CLOSED_EVENT } from "./xp-award-events";

function elementStub(id = "") {
  const classes = new Set<string>();
  return {
    id,
    dataset: {} as Record<string, string>,
    offsetWidth: 1,
    style: { display: "" } as CSSStyleDeclaration,
    getAttribute: () => null,
    classList: {
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
      contains: (className: string) => classes.has(className),
    },
  } as unknown as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rank promotion celebration", () => {
  it("detects an upward rank change and resolves the promoted rank label", () => {
    expect(getRankPromotion("initiate", "operator")).toEqual({
      previousRankId: "initiate",
      previousRankLabel: "Initiate",
      nextRankId: "operator",
      nextRankLabel: "Operator",
    });
  });

  it("does not detect unchanged ranks, demotions, or unknown initial ranks", () => {
    expect(getRankPromotion("initiate", "initiate")).toBeNull();
    expect(getRankPromotion("operator", "initiate")).toBeNull();
    expect(getRankPromotion(null, "initiate")).toBeNull();
  });

  it("builds test promotion payloads from the clicked ladder rank", () => {
    expect(buildRankPromotionTestPayload("operator")).toEqual({
      previousRankId: "initiate",
      previousRankLabel: "Initiate",
      nextRankId: "operator",
      nextRankLabel: "Operator",
    });
    expect(buildRankPromotionTestPayload("unranked")).toEqual({
      previousRankId: "unranked",
      previousRankLabel: "Unranked",
      nextRankId: "unranked",
      nextRankLabel: "Unranked",
    });
    expect(buildRankPromotionTestPayload("unknown")).toBeNull();
  });

  it("waits while another visible overlay is blocking the promotion modal", () => {
    const timeGoalOverlay = elementStub("timeGoalCompleteOverlay");
    timeGoalOverlay.style.display = "flex";
    const promotionOverlay = elementStub("rankPromotionOverlay");
    promotionOverlay.style.display = "flex";
    const documentRef = {
      querySelectorAll: (selector: string) => (selector === ".overlay" ? [timeGoalOverlay, promotionOverlay] : []),
    } as unknown as Document;

    expect(hasBlockingPromotionOverlay(documentRef)).toBe(true);
  });

  it("ignores the promotion overlay when checking for blockers", () => {
    const promotionOverlay = elementStub("rankPromotionOverlay");
    promotionOverlay.style.display = "flex";
    const documentRef = {
      querySelectorAll: (selector: string) => (selector === ".overlay" ? [promotionOverlay] : []),
    } as unknown as Document;

    expect(hasBlockingPromotionOverlay(documentRef)).toBe(false);
  });

  it("waits while an xp award is queued or actively animating", () => {
    const pendingAward = {
      fromXp: 10,
      toXp: 22,
      awardedXp: 12,
      sourceModal: "timeGoalComplete" as const,
      sourceTaskId: "task-1",
      sourceOverlayId: "timeGoalCompleteOverlay",
      sourceElementKey: "timeGoalCompleteAwardText",
      sourceRect: null,
    };

    expect(hasBlockingPromotionXpAnimation({ pending: pendingAward, active: null })).toBe(true);
    expect(hasBlockingPromotionXpAnimation({ pending: null, active: pendingAward })).toBe(true);
    expect(hasBlockingPromotionXpAnimation({ pending: null, active: null })).toBe(false);
  });

  it("opens the modal and plays the promotion audio", () => {
    const overlay = elementStub("rankPromotionOverlay");
    const play = vi.fn(() => Promise.resolve());
    const audioFactory = vi.fn(() => ({ currentTime: 10, play }));
    const documentRef = {
      getElementById: (id: string) => (id === "rankPromotionOverlay" ? overlay : null),
    } as unknown as Document;

    startRankPromotionCelebration(documentRef, audioFactory);

    expect(overlay.style.display).toBe("flex");
    expect(audioFactory).toHaveBeenCalledWith(RANK_PROMOTION_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("dispatches the shared overlay closed event when closing the modal", () => {
    const overlay = elementStub(RANK_PROMOTION_OVERLAY_ID);
    overlay.style.display = "flex";
    const listener = vi.fn();
    const windowRef = new EventTarget();
    const documentRef = {
      getElementById: (id: string) => (id === RANK_PROMOTION_OVERLAY_ID ? overlay : null),
    } as unknown as Document;
    vi.stubGlobal("window", windowRef);

    windowRef.addEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, listener);
    stopRankPromotionCelebration(documentRef);
    windowRef.removeEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, listener);

    expect(overlay.style.display).toBe("none");
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ overlayId: RANK_PROMOTION_OVERLAY_ID });
  });
});
