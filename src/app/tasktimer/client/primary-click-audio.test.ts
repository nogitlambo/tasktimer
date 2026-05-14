import { describe, expect, it, vi } from "vitest";

import {
  getPrimaryClickTarget,
  getTaskLaunchClickTarget,
  playPrimaryClickAudio,
  playTaskLaunchClickAudio,
  registerPrimaryClickAudio,
  PRIMARY_CLICK_AUDIO_SRC,
  TASK_LAUNCH_CLICK_AUDIO_SRC,
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
  'button[data-action="start"][title="Launch"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';

describe("primary click audio", () => {
  it("matches enabled primary action controls", () => {
    const element = makeElement({ selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true } });

    expect(getPrimaryClickTarget(element)).toBe(element);
  });

  it("matches enabled task launch controls", () => {
    const element = makeElement({
      selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
    });

    expect(getTaskLaunchClickTarget(element)).toBe(element);
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
    const disabled = makeElement({ selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true }, disabled: true });
    const ariaDisabled = makeElement({
      selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true },
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

    handler({ defaultPrevented: true, target: makeElement({ selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, isTrusted: false, target: makeElement({ selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { "#saveEditBtn, #addTaskConfirmBtn": true } }) } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(1);

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true },
      }),
    } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(2);
  });
});
