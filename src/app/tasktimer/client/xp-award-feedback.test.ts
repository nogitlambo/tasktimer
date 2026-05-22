import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./interaction-haptics", () => ({
  playInteractionHaptic: vi.fn(),
}));

vi.mock("./click-audio-player", () => ({
  createClickAudioPlayer: vi.fn(),
}));

import { createClickAudioPlayer } from "./click-audio-player";
import { playInteractionHaptic } from "./interaction-haptics";
import {
  playXpAwardDeliveryAudio,
  playXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
  XP_AWARD_DELIVERY_AUDIO_SRC,
} from "./xp-award-feedback";

describe("xp award feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClickAudioPlayer).mockReturnValue({
      play: vi.fn(),
      playWhenReady: vi.fn(),
      warm: vi.fn(),
      isReady: vi.fn(() => true),
    });
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

  it("plays the xp delivery audio source without surfacing playback failures", () => {
    const audioFactory = vi.fn();

    playXpAwardDeliveryAudio(audioFactory);

    expect(createClickAudioPlayer).toHaveBeenCalledWith(XP_AWARD_DELIVERY_AUDIO_SRC, audioFactory);
    expect(vi.mocked(createClickAudioPlayer).mock.results[0].value.play).toHaveBeenCalledTimes(1);
  });
});
