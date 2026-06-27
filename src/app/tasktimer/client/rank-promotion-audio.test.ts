import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RANK_PROMOTION_AUDIO_SRC,
  RANK_PROMOTION_SMASH_PHASE_START_MS,
  RANK_PROMOTION_TIMING,
  createRankPromotionAudioController,
  type RankPromotionAudioLike,
} from "./rank-promotion-audio";

class PromotionAudioMock implements RankPromotionAudioLike {
  currentTime = 12;
  playbackRate = 0;
  preload = "";
  volume = 0;
  load = vi.fn();
  pause = vi.fn();
  play = vi.fn<() => Promise<unknown> | void>();
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(readonly src: string, playImpl?: () => Promise<unknown> | void) {
    if (playImpl) this.play.mockImplementation(playImpl);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const bucket = this.listeners.get(type) || new Set<EventListenerOrEventListenerObject>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    const event = { type } as Event;
    for (const listener of Array.from(this.listeners.get(type) || [])) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

function stubAnimationFrame() {
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  });
}

function createHarness(playImpl?: (src: string) => Promise<unknown> | void) {
  const created: PromotionAudioMock[] = [];
  const controller = createRankPromotionAudioController({
    audioFactory: (src) => {
      const audio = new PromotionAudioMock(src, playImpl ? () => playImpl(src) : undefined);
      created.push(audio);
      return audio;
    },
  });

  return { controller, created };
}

describe("rank promotion audio controller", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts the smash phase immediately after the old insignia reveal", () => {
    expect(RANK_PROMOTION_SMASH_PHASE_START_MS).toBe(
      RANK_PROMOTION_TIMING.dimDurationMs + RANK_PROMOTION_TIMING.modalRevealDurationMs,
    );
  });

  it("starts the intro cue immediately and starts drums 1.2 seconds after intro starts", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    expect(created.map((audio) => audio.src)).toEqual([RANK_PROMOTION_AUDIO_SRC.intro]);
    expect(created[0]?.preload).toBe("auto");
    expect(created[0]?.currentTime).toBe(0);
    expect(created[0]?.playbackRate).toBe(1);
    expect(created[0]?.volume).toBe(1);
    expect(created[0]?.load).toHaveBeenCalledTimes(1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(controller.getActiveAudioCount()).toBe(1);

    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.drumsAfterIntroStartDelayMs - 1);

    expect(created.map((audio) => audio.src)).toEqual([RANK_PROMOTION_AUDIO_SRC.intro]);

    vi.advanceTimersByTime(1);

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.drums,
    ]);
    expect(created[1]?.volume).toBe(0.1);
    expect(created[1]?.play).toHaveBeenCalledTimes(1);
    expect(controller.getActiveAudioCount()).toBe(2);
    controller.dispose();
  });

  it("does not start drums early when intro ends before the 1.2-second timer", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    created[0]?.dispatch("ended");
    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.drumsAfterIntroStartDelayMs - 1);

    expect(created.map((audio) => audio.src)).toEqual([RANK_PROMOTION_AUDIO_SRC.intro]);

    vi.advanceTimersByTime(1);

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.drums,
    ]);
    controller.dispose();
  });

  it("does not start drums after disposal before the 1.2-second timer", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.drumsAfterIntroStartDelayMs - 1);
    controller.dispose();
    vi.advanceTimersByTime(1);

    expect(created.map((audio) => audio.src)).toEqual([RANK_PROMOTION_AUDIO_SRC.intro]);
  });

  it("starts smash cues at their configured offsets", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    controller.startSmashCues();

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.bassDrive,
    ]);

    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.impactBoomTwoDelayMs);
    expect(created.map((audio) => audio.src)).toContain(RANK_PROMOTION_AUDIO_SRC.boomTwo);

    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.labelSmashRevealDelayMs - RANK_PROMOTION_TIMING.impactBoomTwoDelayMs);
    expect(created.map((audio) => audio.src)).toContain(RANK_PROMOTION_AUDIO_SRC.labelImpact);
    controller.dispose();
  });

  it("starts the hit cue on demand", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    controller.startHitCue();

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.hit,
    ]);
    controller.dispose();
  });

  it("clears pending cues and releases active audio on dispose", () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness();

    controller.startSmashCues();
    controller.dispose();
    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.labelSmashRevealDelayMs);

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.bassDrive,
    ]);
    expect(created[0]?.pause).toHaveBeenCalledTimes(1);
    expect(created[1]?.pause).toHaveBeenCalledTimes(1);
    expect(controller.getActiveAudioCount()).toBe(0);
  });

  it("swallows playback rejections without cancelling later scheduled cues", async () => {
    vi.useFakeTimers();
    stubAnimationFrame();

    const { controller, created } = createHarness((src) => {
      if (src === RANK_PROMOTION_AUDIO_SRC.intro) return Promise.reject(new Error("blocked"));
      return undefined;
    });

    controller.startSmashCues();
    vi.advanceTimersByTime(RANK_PROMOTION_TIMING.labelSmashRevealDelayMs);
    await Promise.resolve();

    expect(created.map((audio) => audio.src)).toEqual([
      RANK_PROMOTION_AUDIO_SRC.intro,
      RANK_PROMOTION_AUDIO_SRC.bassDrive,
      RANK_PROMOTION_AUDIO_SRC.drums,
      RANK_PROMOTION_AUDIO_SRC.boomTwo,
      RANK_PROMOTION_AUDIO_SRC.labelImpact,
    ]);
    controller.dispose();
  });
});
