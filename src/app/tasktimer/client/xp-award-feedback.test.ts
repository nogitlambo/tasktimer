import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./interaction-haptics", () => ({
  playInteractionHaptic: vi.fn(),
}));

import { playInteractionHaptic } from "./interaction-haptics";
import {
  playXpAwardDeliveryHaptic,
  shouldPlayRateLimitedXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
  XP_AWARD_DELIVERY_HAPTIC_MIN_INTERVAL_MS,
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

  it("allows the first rate-limited pulse for an eligible XP delivery", () => {
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 10,
        endXp: 22,
        isEnabled: true,
        totalUnits: 12,
        nowMs: 1000,
        lastPlayedAtMs: null,
      })
    ).toBe(true);
  });

  it("skips rate-limited pulses inside the minimum spacing window", () => {
    expect(XP_AWARD_DELIVERY_HAPTIC_MIN_INTERVAL_MS).toBe(90);
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 10,
        endXp: 22,
        isEnabled: true,
        totalUnits: 12,
        nowMs: 1089,
        lastPlayedAtMs: 1000,
      })
    ).toBe(false);
  });

  it("allows rate-limited pulses after the minimum spacing window", () => {
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 10,
        endXp: 22,
        isEnabled: true,
        totalUnits: 12,
        nowMs: 1090,
        lastPlayedAtMs: 1000,
      })
    ).toBe(true);
  });

  it("blocks rate-limited pulses when disabled or no XP units will be delivered", () => {
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 10,
        endXp: 22,
        isEnabled: false,
        totalUnits: 12,
        nowMs: 1000,
        lastPlayedAtMs: null,
      })
    ).toBe(false);
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 10,
        endXp: 22,
        isEnabled: true,
        totalUnits: 0,
        nowMs: 1000,
        lastPlayedAtMs: null,
      })
    ).toBe(false);
    expect(
      shouldPlayRateLimitedXpAwardDeliveryHaptic({
        startXp: 22,
        endXp: 22,
        isEnabled: true,
        totalUnits: 1,
        nowMs: 1000,
        lastPlayedAtMs: null,
      })
    ).toBe(false);
  });
});
