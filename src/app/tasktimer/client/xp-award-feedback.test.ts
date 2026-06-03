import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./interaction-haptics", () => ({
  playInteractionHaptic: vi.fn(),
}));

import { playInteractionHaptic } from "./interaction-haptics";
import {
  playXpAwardDeliveryDoneAudio,
  playXpAwardDeliveryAudio,
  playXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
  warmXpAwardDeliveryAudio,
  XP_AWARD_DELIVERY_DONE_AUDIO_SRC,
  XP_AWARD_DELIVERY_AUDIO_SRC,
} from "./xp-award-feedback";

type MockAudio = {
  currentTime: number;
  loop: boolean;
  preload?: string;
  load: () => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  play: () => void;
  pause: () => void;
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

  it("starts xp delivery audio and returns a handle that stops it", () => {
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const play = vi.fn();
    const pause = vi.fn();
    const load = vi.fn();
    const removeEventListener = vi.fn((type: string) => listeners.delete(type));
    const created: Array<{ src: string; audio: MockAudio }> = [];
    const audioFactory = vi.fn((src: string) => {
      const audio = {
        currentTime: 5,
        loop: false,
        load,
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listeners.set(type, listener),
        removeEventListener,
        play,
        pause,
      };
      created.push({ src, audio });
      return audio;
    });

    const handle = playXpAwardDeliveryAudio(audioFactory);

    expect(audioFactory).toHaveBeenCalledWith(XP_AWARD_DELIVERY_AUDIO_SRC);
    expect(created[0]?.audio.preload).toBe("auto");
    expect(created[0]?.audio.loop).toBe(true);
    expect(created[0]?.audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);

    const endedListener = listeners.get("ended");
    expect(endedListener).toBeTypeOf("function");
    handle?.stop();

    expect(removeEventListener).toHaveBeenCalledWith("ended", endedListener);
    expect(created[0]?.audio.loop).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(created[0]?.audio.currentTime).toBe(0);
    expect(audioFactory).toHaveBeenCalledTimes(1);
  });

  it("reuses warmed xp delivery audio when playback starts", () => {
    const firstPlay = vi.fn();
    const secondPlay = vi.fn();
    const created: Array<{ src: string; audio: MockAudio }> = [];
    const audioFactory = vi
      .fn()
      .mockImplementationOnce((src: string) => {
        const audio = {
          currentTime: 5,
          loop: false,
          load: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          play: firstPlay,
          pause: vi.fn(),
        };
        created.push({ src, audio });
        return audio;
      })
      .mockImplementationOnce((src: string) => {
        const audio = {
          currentTime: 9,
          loop: false,
          load: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          play: secondPlay,
          pause: vi.fn(),
        };
        created.push({ src, audio });
        return audio;
      });

    warmXpAwardDeliveryAudio(audioFactory);
    const handle = playXpAwardDeliveryAudio(audioFactory);

    expect(audioFactory).toHaveBeenCalledTimes(1);
    expect(created[0]?.audio.load).toHaveBeenCalledTimes(1);
    expect(created[0]?.src).toBe(XP_AWARD_DELIVERY_AUDIO_SRC);
    expect(firstPlay).toHaveBeenCalledTimes(1);
    expect(secondPlay).not.toHaveBeenCalled();
    handle?.stop();
  });

  it("does not throw or replay cleanup when stopped more than once", () => {
    const pause = vi.fn();
    const audioFactory = vi.fn(() => ({
      currentTime: 5,
      loop: false,
      load: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      play: vi.fn(),
      pause,
    }));
    const handle = playXpAwardDeliveryAudio(audioFactory);

    expect(() => {
      handle?.stop();
      handle?.stop();
    }).not.toThrow();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("plays the done audio when requested by the animation", () => {
    const play = vi.fn();
    const created: Array<{ src: string; audio: MockAudio }> = [];
    const audioFactory = vi.fn((src: string) => {
      const audio = {
        currentTime: 5,
        loop: false,
        load: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        play,
        pause: vi.fn(),
      };
      created.push({ src, audio });
      return audio;
    });

    playXpAwardDeliveryDoneAudio(audioFactory);

    expect(audioFactory).toHaveBeenCalledWith(XP_AWARD_DELIVERY_DONE_AUDIO_SRC);
    expect(created[0]?.audio.preload).toBe("auto");
    expect(created[0]?.audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
