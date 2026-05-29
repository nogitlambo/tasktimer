import { describe, expect, it } from "vitest";
import {
  getStartMobileSwipeCloseState,
  shouldCloseFromMobileSwipe,
} from "./mobileSwipeClose";

describe("mobile swipe close gesture", () => {
  it("closes on a downward swipe past the threshold", () => {
    const state = getStartMobileSwipeCloseState(7, 120, 20);

    expect(shouldCloseFromMobileSwipe(state, 7, 124, 92, 70)).toBe(true);
  });

  it("ignores horizontal and upward gestures", () => {
    const state = getStartMobileSwipeCloseState(7, 120, 120);

    expect(shouldCloseFromMobileSwipe(state, 7, 220, 200, 70)).toBe(false);
    expect(shouldCloseFromMobileSwipe(state, 7, 120, 40, 70)).toBe(false);
  });

  it("ignores events from another active pointer or touch", () => {
    const state = getStartMobileSwipeCloseState(7, 120, 20);

    expect(shouldCloseFromMobileSwipe(state, 8, 120, 120, 70)).toBe(false);
  });
});
