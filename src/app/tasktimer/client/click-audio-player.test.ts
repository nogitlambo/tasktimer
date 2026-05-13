import { afterEach, describe, expect, it, vi } from "vitest";

import { createClickAudioPlayer } from "./click-audio-player";

describe("click audio player", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
