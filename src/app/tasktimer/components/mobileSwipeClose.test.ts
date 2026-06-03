import { describe, expect, it } from "vitest";
import {
  getMobileSwipeCloseDragY,
  getStartMobileSwipeCloseState,
  getUpdatedMobileSwipeCloseState,
  shouldCloseFromMobileSwipe,
} from "./mobileSwipeClose";

describe("mobile swipe close gesture", () => {
  it("tracks downward drag distance and clamps upward movement", () => {
    const started = getStartMobileSwipeCloseState(7, 120, 120);
    const draggedDown = getUpdatedMobileSwipeCloseState(started, 7, 124, 170);
    const draggedUp = getUpdatedMobileSwipeCloseState(started, 7, 124, 80);

    expect(getMobileSwipeCloseDragY(draggedDown)).toBe(50);
    expect(getMobileSwipeCloseDragY(draggedUp)).toBe(0);
  });

  it("closes on release after a downward swipe past the threshold", () => {
    const state = getUpdatedMobileSwipeCloseState(getStartMobileSwipeCloseState(7, 120, 20), 7, 124, 92);

    expect(shouldCloseFromMobileSwipe(state, 70)).toBe(true);
  });

  it("ignores horizontal and upward gestures", () => {
    const horizontal = getUpdatedMobileSwipeCloseState(getStartMobileSwipeCloseState(7, 120, 120), 7, 220, 200);
    const upward = getUpdatedMobileSwipeCloseState(getStartMobileSwipeCloseState(7, 120, 120), 7, 120, 40);

    expect(shouldCloseFromMobileSwipe(horizontal, 70)).toBe(false);
    expect(shouldCloseFromMobileSwipe(upward, 70)).toBe(false);
  });

  it("ignores events from another active pointer or touch", () => {
    const state = getStartMobileSwipeCloseState(7, 120, 20);
    const updated = getUpdatedMobileSwipeCloseState(state, 8, 120, 120);

    expect(updated).toBe(state);
    expect(getMobileSwipeCloseDragY(updated)).toBe(0);
  });

  it("does not close before the release threshold", () => {
    const state = getUpdatedMobileSwipeCloseState(getStartMobileSwipeCloseState(7, 120, 20), 7, 120, 89);

    expect(getMobileSwipeCloseDragY(state)).toBe(69);
    expect(shouldCloseFromMobileSwipe(state, 70)).toBe(false);
  });
});
