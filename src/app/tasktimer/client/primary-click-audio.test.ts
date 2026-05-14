import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clickAudioPlayerModule from "./click-audio-player";

import {
  getPrimaryClickTarget,
  getTaskLaunchClickTarget,
  getTaskStopClickTarget,
  playPrimaryClickAudio,
  playTaskLaunchClickAudio,
  registerPrimaryClickAudio,
  PRIMARY_CLICK_AUDIO_SRC,
  TASK_LAUNCH_CLICK_AUDIO_SRC,
  TASK_STOP_CLICK_AUDIO_SRC,
} from "./primary-click-audio";

function makeElement(opts: {
  selectorMatches?: Record<string, boolean>;
  attributes?: Record<string, string | null>;
  disabled?: boolean;
  disabledAncestor?: boolean;
} = {}) {
  const element = {
    disabled: !!opts.disabled,
    getAttribute: (name: string) => opts.attributes?.[name] ?? null,
    closest: (selector: string) => {
      if (selector === "button:disabled,input:disabled,[aria-disabled='true']") {
        return opts.disabledAncestor ? element : null;
      }
      return opts.selectorMatches?.[selector] ? element : null;
    },
  };
  return element as unknown as HTMLElement;
}

const TASK_LAUNCH_CLICK_SELECTOR =
  'button[data-action="start"][title="Launch"], button[data-action="start"][title="Resume"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';
const TASK_STOP_CLICK_SELECTOR = 'button[data-action="stop"][title="Stop"]';
const PRIMARY_CLICK_SELECTOR = "#saveEditBtn, #addTaskConfirmBtn, .closePopup.isSaveAndClose";

describe("primary click audio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("matches enabled primary action controls", () => {
    const element = makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } });

    expect(getPrimaryClickTarget(element)).toBe(element);
  });

  it("matches save-and-close controls promoted to primary actions", () => {
    const element = makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } });

    expect(getPrimaryClickTarget(element)).toBe(element);
  });

  it("matches enabled task launch controls", () => {
    const element = makeElement({
      selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
    });

    expect(getTaskLaunchClickTarget(element)).toBe(element);
  });

  it("matches enabled task resume controls for primary click audio", () => {
    const element = makeElement({
      selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
    });

    expect(getTaskLaunchClickTarget(element)).toBe(element);
  });

  it("matches enabled task stop controls for alert audio", () => {
    const element = makeElement({
      selectorMatches: { [TASK_STOP_CLICK_SELECTOR]: true },
    });

    expect(getTaskStopClickTarget(element)).toBe(element);
  });

  it("matches the reset task confirm primary action for task launch audio", () => {
    const element = makeElement({
      selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
    });

    expect(getTaskLaunchClickTarget(element)).toBe(element);
  });

  it("matches task-complete next-task tiles for task launch audio", () => {
    const element = makeElement({
      selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
    });

    expect(getTaskLaunchClickTarget(element)).toBe(element);
  });

  it("ignores unrelated and disabled controls", () => {
    const unrelated = makeElement({ selectorMatches: { ".btn-accent": true } });
    const disabled = makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true }, disabled: true });
    const ariaDisabled = makeElement({
      selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true },
      attributes: { "aria-disabled": "true" },
    });

    expect(getPrimaryClickTarget(unrelated)).toBeNull();
    expect(getPrimaryClickTarget(disabled)).toBeNull();
    expect(getPrimaryClickTarget(ariaDisabled)).toBeNull();
  });

  it("plays the configured audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playPrimaryClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(PRIMARY_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured task launch audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playTaskLaunchClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(TASK_LAUNCH_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("registers one scoped app click listener and skips prevented or synthetic clicks", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();

    registerPrimaryClickAudio({ on, documentRef: documentRef as unknown as Document, playAudio });

    const handler = on.mock.calls[0]?.[2] as EventListener;
    expect(on).toHaveBeenCalledWith(documentRef, "click", expect.any(Function), { capture: true });

    handler({ defaultPrevented: true, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, isTrusted: false, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(1);

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
      }),
    } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(2);

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { [TASK_STOP_CLICK_SELECTOR]: true },
      }),
    } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(3);
  });

  it("creates distinct players for primary, resume, and stop sounds", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    vi.spyOn(clickAudioPlayerModule, "createClickAudioPlayer").mockImplementation(() => {
      return {
        warm: vi.fn(),
        play: vi.fn(),
        isReady: vi.fn(() => true),
        playWhenReady: vi.fn(() => Promise.resolve("played" as const)),
      } as never;
    });

    registerPrimaryClickAudio({ on, documentRef: documentRef as unknown as Document });

    expect(clickAudioPlayerModule.createClickAudioPlayer).toHaveBeenNthCalledWith(1, PRIMARY_CLICK_AUDIO_SRC);
    expect(clickAudioPlayerModule.createClickAudioPlayer).toHaveBeenNthCalledWith(2, TASK_LAUNCH_CLICK_AUDIO_SRC);
    expect(clickAudioPlayerModule.createClickAudioPlayer).toHaveBeenNthCalledWith(3, TASK_STOP_CLICK_AUDIO_SRC);
  });

  it("delays an unready primary click, then replays it exactly once", async () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const mockPlayers: Array<{
      warm: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      isReady: ReturnType<typeof vi.fn>;
      playWhenReady: ReturnType<typeof vi.fn>;
    }> = [];
    vi.spyOn(clickAudioPlayerModule, "createClickAudioPlayer").mockImplementation(() => {
      const player = {
        warm: vi.fn(),
        play: vi.fn(),
        isReady: vi.fn(() => true),
        playWhenReady: vi.fn(() => Promise.resolve("played" as const)),
      };
      mockPlayers.push(player);
      return player as never;
    });
    registerPrimaryClickAudio({ on, documentRef: documentRef as unknown as Document });

    const primaryPlayer = mockPlayers[0];
    primaryPlayer.isReady.mockReturnValue(false);
    const replay = makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) as HTMLElement;
    const replayClick = vi.fn();
    Object.defineProperty(replay, "click", { value: replayClick });
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, isTrusted: true, target: replay, preventDefault, stopImmediatePropagation } as unknown as Event);
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(primaryPlayer.playWhenReady).toHaveBeenCalledWith(120);
    expect(replayClick).toHaveBeenCalledTimes(1);

    handler({ defaultPrevented: false, isTrusted: false, target: replay } as unknown as Event);
    expect(primaryPlayer.play).not.toHaveBeenCalled();
  });

  it("does not delay an already-ready primary click", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const mockPlayers: Array<{
      warm: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      isReady: ReturnType<typeof vi.fn>;
      playWhenReady: ReturnType<typeof vi.fn>;
    }> = [];
    vi.spyOn(clickAudioPlayerModule, "createClickAudioPlayer").mockImplementation(() => {
      const player = {
        warm: vi.fn(),
        play: vi.fn(),
        isReady: vi.fn(() => true),
        playWhenReady: vi.fn(() => Promise.resolve("played" as const)),
      };
      mockPlayers.push(player);
      return player as never;
    });
    registerPrimaryClickAudio({ on, documentRef: documentRef as unknown as Document });

    const primaryPlayer = mockPlayers[0];
    primaryPlayer.isReady.mockReturnValue(true);
    const replay = makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) as HTMLElement;
    const replayClick = vi.fn();
    Object.defineProperty(replay, "click", { value: replayClick });
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, isTrusted: true, target: replay, preventDefault, stopImmediatePropagation } as unknown as Event);

    expect(primaryPlayer.play).toHaveBeenCalledTimes(1);
    expect(primaryPlayer.playWhenReady).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(replayClick).not.toHaveBeenCalled();
  });
});
