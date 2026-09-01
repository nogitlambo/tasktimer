import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./interaction-haptics", () => ({
  playInteractionHaptic: vi.fn(),
}));

import { playInteractionHaptic } from "./interaction-haptics";
import {
  playXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
} from "./xp-award-feedback";

describe("xp award feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("only plays a delivery haptic when xp increases and haptics are enabled", () => {
    expect(shouldPlayXpAwardDeliveryHaptic(10, 22, true)).toBe(true);
    expect(shouldPlayXpAwardDeliveryHaptic(22, 22, true)).toBe(false);
    expect(shouldPlayXpAwardDeliveryHaptic(22, 10, true)).toBe(false);
    expect(shouldPlayXpAwardDeliveryHaptic(10, 22, false)).toBe(false);
  });

  it("plays one light delivery haptic with the selected intensity", () => {
    playXpAwardDeliveryHaptic({ isEnabled: true, intensity: "medium" });

    expect(playInteractionHaptic).toHaveBeenCalledTimes(1);
    expect(playInteractionHaptic).toHaveBeenCalledWith("light", undefined, "medium");
  });

  it("does nothing when delivery haptics are disabled", () => {
    playXpAwardDeliveryHaptic({ isEnabled: false, intensity: "max" });

    expect(playInteractionHaptic).not.toHaveBeenCalled();
  });
});
