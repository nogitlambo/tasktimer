import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./interaction-haptics", () => ({
  playInteractionHaptic: vi.fn(),
}));

import { playInteractionHaptic } from "./interaction-haptics";
import {
  playXpAwardDeliveryAudio,
  playXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
  XP_AWARD_DELIVERY_DONE_AUDIO_SRC,
  XP_AWARD_DELIVERY_DONE_DELAY_MS,
  XP_AWARD_DELIVERY_AUDIO_SRC,
} from "./xp-award-feedback";

type MockAudio = {
  currentTime: number;
  preload?: string;
  load: () => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  play: () => void;
};

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

  it("plays the done audio 300ms after the xp delivery audio finishes", () => {
    vi.useFakeTimers();
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const play = vi.fn();
    const load = vi.fn();
    const removeEventListener = vi.fn((type: string) => listeners.delete(type));
    const created: Array<{ src: string; audio: MockAudio }> = [];
    const audioFactory = vi.fn((src: string) => {
      const audio = {
        currentTime: 5,
        load,
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listeners.set(type, listener),
        removeEventListener,
        play,
      };
      created.push({ src, audio });
      return audio;
    });

    playXpAwardDeliveryAudio(audioFactory);

    expect(audioFactory).toHaveBeenCalledWith(XP_AWARD_DELIVERY_AUDIO_SRC);
    expect(created[0]?.audio.preload).toBe("auto");
    expect(created[0]?.audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);

    const endedListener = listeners.get("ended");
    expect(endedListener).toBeTypeOf("function");
    (endedListener as EventListener)({} as Event);
    expect(removeEventListener).toHaveBeenCalledWith("ended", endedListener);

    vi.advanceTimersByTime(XP_AWARD_DELIVERY_DONE_DELAY_MS - 1);
    expect(audioFactory).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(audioFactory).toHaveBeenLastCalledWith(XP_AWARD_DELIVERY_DONE_AUDIO_SRC);
    expect(created[1]?.audio.preload).toBe("auto");
    expect(created[1]?.audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
