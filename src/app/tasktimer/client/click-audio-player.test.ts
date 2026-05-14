import { afterEach, describe, expect, it, vi } from "vitest";

import { createClickAudioPlayer } from "./click-audio-player";

function makeAudioMock(opts: { readyState?: number } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    currentTime: 0,
    preload: "",
    readyState: opts.readyState ?? 0,
    load: vi.fn(),
    play: vi.fn(),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const bucket = listeners.get(type) || new Set<() => void>();
      bucket.add(listener);
      listeners.set(type, bucket);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string) {
      this.readyState = 3;
      for (const listener of Array.from(listeners.get(type) || [])) listener();
    },
  };
}

describe("click audio player", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("warms a small reusable audio pool for low-latency playback", () => {
    const play = vi.fn();
    const load = vi.fn();
    const created: Array<{ currentTime: number; preload?: string; load: typeof load; play: typeof play }> = [];
    const AudioMock = vi.fn(function AudioMock(this: unknown, src: string) {
      const audio = { src, currentTime: 10, load, play, preload: "" };
      created.push(audio);
      return audio;
    });

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", AudioMock);

    const player = createClickAudioPlayer("/click.mp3");
    player.warm();
    player.play();
    player.play();
    player.play();
    player.play();

    expect(AudioMock).toHaveBeenCalledTimes(3);
    expect(AudioMock).toHaveBeenCalledWith("/click.mp3");
    expect(load).toHaveBeenCalledTimes(3);
    expect(play).toHaveBeenCalledTimes(4);
    expect(created.map((audio) => audio.preload)).toEqual(["auto", "auto", "auto"]);
  });

  it("keeps injected factories single-use for isolated tests", () => {
    const play = vi.fn();
    const audioFactory = vi.fn(() => ({ currentTime: 4, play }));

    const player = createClickAudioPlayer("/click.mp3", audioFactory);
    player.play();
    player.play();

    expect(audioFactory).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("reports warmed pooled audio as ready when it already has buffered data", () => {
    const AudioMock = vi.fn(function AudioMock(this: unknown) {
      return makeAudioMock({ readyState: 3 });
    });

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", AudioMock);

    const player = createClickAudioPlayer("/click.mp3");
    player.warm();

    expect(player.isReady()).toBe(true);
  });

  it("waits for unready audio to become ready before playing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const audio = makeAudioMock();
    const player = createClickAudioPlayer("/click.mp3", vi.fn(() => audio));

    player.warm();
    const playback = player.playWhenReady(120);
    audio.dispatch("canplay");

    await expect(playback).resolves.toBe("played");
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("times out when warmed audio does not become ready in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const audio = makeAudioMock();
    const player = createClickAudioPlayer("/click.mp3", vi.fn(() => audio));

    player.warm();
    const playback = player.playWhenReady(120);
    vi.advanceTimersByTime(120);

    await expect(playback).resolves.toBe("timed_out");
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("returns unavailable when audio cannot be created", async () => {
    const player = createClickAudioPlayer("/click.mp3", vi.fn(() => {
      throw new Error("boom");
    }));

    await expect(player.playWhenReady(120)).resolves.toBe("unavailable");
  });
});
