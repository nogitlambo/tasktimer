import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE_ALERT_AUDIO_SRC, playDeleteAlertAudio } from "./delete-alert-audio";

afterEach(() => {
  vi.useRealTimers();
});

describe("delete alert audio", () => {
  it("plays alert.mp3 once by default", () => {
    const play = vi.fn();
    const audioFactory = vi.fn(() => ({ currentTime: 4, play }));

    playDeleteAlertAudio(audioFactory);

    expect(audioFactory).toHaveBeenCalledTimes(1);
    expect(audioFactory).toHaveBeenCalledWith(DELETE_ALERT_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays alert.mp3 three times when repeat count is requested", () => {
    vi.useFakeTimers();
    const play = vi.fn();
    const audioFactory = vi.fn(() => ({ currentTime: 4, play }));

    playDeleteAlertAudio(audioFactory, { repeatCount: 3 });

    expect(audioFactory).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(99);
    expect(audioFactory).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(audioFactory).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(99);
    expect(audioFactory).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1);
    expect(audioFactory).toHaveBeenCalledTimes(3);
    expect(play).toHaveBeenCalledTimes(3);
  });
});
