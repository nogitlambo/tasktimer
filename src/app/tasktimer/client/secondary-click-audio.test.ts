import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clickAudioPlayerModule from "./click-audio-player";

import {
  CANCEL_CLICK_AUDIO_SRC,
  CHECKBOX_CLICK_AUDIO_SRC,
  CLOSE_CLICK_AUDIO_SRC,
  getCheckboxClickTarget,
  getCancelClickTarget,
  getCloseClickTarget,
  getSecondaryClickTarget,
  playCancelClickAudio,
  playCheckboxClickAudio,
  playCloseClickAudio,
  playSecondaryClickAudio,
  registerSecondaryClickAudio,
  SECONDARY_CLICK_AUDIO_SRC,
} from "./secondary-click-audio";

function makeElement(opts: {
  selectorMatches?: Record<string, boolean>;
  attributes?: Record<string, string | null>;
  textContent?: string;
  disabled?: boolean;
  disabledAncestor?: boolean;
} = {}) {
  const element = {
    textContent: opts.textContent || "",
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

describe("secondary click audio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("matches requested direct controls", () => {
    const directSelectors = [
      ".switch",
      '[role="switch"]',
      "#closeMenuBtn",
      "#menuIcon",
      "[data-nav-page]",
      ".appFooterBtn",
      ".dashboardRailMenuBtn",
      ".settingsNavTile",
      ".taskLaunchMobileMenuItem",
      "#openAddTaskBtn",
      '[data-action="openAddTask"]',
      '[data-action="reset"]',
      '[data-action="edit"]',
      "#openFriendRequestModalBtn",
    ];
    const combinedSelector = directSelectors.join(",");

    for (const selector of directSelectors) {
      const element = makeElement({ selectorMatches: { [combinedSelector]: true, [selector]: true } });
      expect(getSecondaryClickTarget(element)).toBe(element);
    }
  });

  it("matches checkbox controls for dedicated checkbox audio", () => {
    const checkboxSelectors = ['input[type="checkbox"]', '[role="checkbox"]'];
    const combinedSelector = checkboxSelectors.join(",");

    for (const selector of checkboxSelectors) {
      const element = makeElement({ selectorMatches: { [combinedSelector]: true, [selector]: true } });
      expect(getCheckboxClickTarget(element)).toBe(element);
      expect(getSecondaryClickTarget(element)).toBeNull();
    }
  });

  it("matches ordinary buttons and links by accessible label or text", () => {
    const textSelector = "button,a";

    for (const label of ["Exit", "Done", "Open"]) {
      const byText = makeElement({ selectorMatches: { [textSelector]: true }, textContent: label });
      const byAria = makeElement({
        selectorMatches: { [textSelector]: true },
        attributes: { "aria-label": label },
      });
      const byTitle = makeElement({
        selectorMatches: { [textSelector]: true },
        attributes: { title: label },
      });

      expect(getSecondaryClickTarget(byText)).toBe(byText);
      expect(getSecondaryClickTarget(byAria)).toBe(byAria);
      expect(getSecondaryClickTarget(byTitle)).toBe(byTitle);
    }
  });

  it("excludes action labels with dedicated or destructive sounds from default secondary audio", () => {
    const textSelector = "button,a";

    for (const label of ["Save", "Cancel", "Create", "Delete", "Save & Close", "Close", "Launch", " Save   &   Close "]) {
      const byText = makeElement({ selectorMatches: { [textSelector]: true }, textContent: label });
      const byAria = makeElement({
        selectorMatches: { [textSelector]: true },
        attributes: { "aria-label": label },
      });

      expect(getSecondaryClickTarget(byText)).toBeNull();
      expect(getSecondaryClickTarget(byAria)).toBeNull();
    }
  });

  it("matches cancel controls for dedicated cancel audio", () => {
    const textSelector = "button,a";
    const cancelByText = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" });
    const cancelByAria = makeElement({
      selectorMatches: { [textSelector]: true },
      attributes: { "aria-label": "Cancel" },
    });
    const done = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Done" });

    expect(getCancelClickTarget(cancelByText)).toBe(cancelByText);
    expect(getCancelClickTarget(cancelByAria)).toBe(cancelByAria);
    expect(getCancelClickTarget(done)).toBeNull();
  });

  it("matches close controls for dedicated close audio", () => {
    const textSelector = "button,a";
    const closeByText = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Close" });
    const closeByAria = makeElement({
      selectorMatches: { [textSelector]: true },
      attributes: { "aria-label": "Close" },
    });
    const cancel = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" });

    expect(getCloseClickTarget(closeByText)).toBe(closeByText);
    expect(getCloseClickTarget(closeByAria)).toBe(closeByAria);
    expect(getCloseClickTarget(cancel)).toBeNull();
  });

  it("ignores unrelated and disabled controls", () => {
    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    const unrelated = makeElement({ textContent: "Done" });
    const disabled = makeElement({ selectorMatches: { [directSelector]: true }, disabled: true });
    const ariaDisabled = makeElement({
      selectorMatches: { [directSelector]: true },
      attributes: { "aria-disabled": "true" },
    });

    expect(getSecondaryClickTarget(unrelated)).toBeNull();
    expect(getSecondaryClickTarget(disabled)).toBeNull();
    expect(getSecondaryClickTarget(ariaDisabled)).toBeNull();
  });

  it("does not blanket-exclude accent controls from default secondary audio", () => {
    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    const accentDirectTarget = makeElement({
      selectorMatches: { [directSelector]: true, ".btn-accent": true },
      textContent: "Done",
    });

    expect(getSecondaryClickTarget(accentDirectTarget)).toBe(accentDirectTarget);
  });

  it("plays the configured audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playSecondaryClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(SECONDARY_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured cancel audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playCancelClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(CANCEL_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured close audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playCloseClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(CLOSE_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured checkbox audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playCheckboxClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(CHECKBOX_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("registers one scoped app click listener and skips already-prevented clicks", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();

    registerSecondaryClickAudio({ on, documentRef: documentRef as unknown as Document, playAudio });

    const handler = on.mock.calls[0]?.[2] as EventListener;
    expect(on).toHaveBeenCalledWith(documentRef, "click", expect.any(Function), { capture: true });

    handler({ defaultPrevented: true, target: makeElement({ selectorMatches: { "#menuIcon": true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    handler({ defaultPrevented: false, isTrusted: false, target: makeElement({ selectorMatches: { [directSelector]: true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [directSelector]: true } }) } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(1);
  });

  it("routes checkbox controls to the dedicated checkbox audio callback", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playCheckboxAudio = vi.fn();
    const checkboxSelector = 'input[type="checkbox"],[role="checkbox"]';

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playCheckboxAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [checkboxSelector]: true } }) } as unknown as Event);

    expect(playCheckboxAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("routes close controls to the dedicated close audio callback", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playCancelAudio = vi.fn();
    const playCloseAudio = vi.fn();
    const textSelector = "button,a";

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playCancelAudio,
      playCloseAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Close" }) } as unknown as Event);
    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" }) } as unknown as Event);
    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Done" }) } as unknown as Event);

    expect(playCloseAudio).toHaveBeenCalledTimes(1);
    expect(playCancelAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).toHaveBeenCalledTimes(1);
  });

  it("delays an unready cancel click, then replays it exactly once", async () => {
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
    registerSecondaryClickAudio({ on, documentRef: documentRef as unknown as Document });

    const cancelPlayer = mockPlayers[1];
    cancelPlayer.isReady.mockReturnValue(false);
    const textSelector = "button,a";
    const cancelTarget = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" }) as HTMLElement & { click: ReturnType<typeof vi.fn> };
    cancelTarget.click = vi.fn();
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, isTrusted: true, target: cancelTarget, preventDefault, stopImmediatePropagation } as unknown as Event);
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(cancelPlayer.playWhenReady).toHaveBeenCalledWith(120);
    expect(cancelTarget.click).toHaveBeenCalledTimes(1);

    handler({ defaultPrevented: false, isTrusted: false, target: cancelTarget } as unknown as Event);
    expect(cancelPlayer.play).not.toHaveBeenCalled();
  });

  it("falls back to replaying after timeout when close audio is still unready", async () => {
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
    registerSecondaryClickAudio({ on, documentRef: documentRef as unknown as Document });

    const closePlayer = mockPlayers[2];
    closePlayer.isReady.mockReturnValue(false);
    closePlayer.playWhenReady.mockResolvedValue("timed_out");
    const textSelector = "button,a";
    const closeTarget = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Close" }) as HTMLElement & { click: ReturnType<typeof vi.fn> };
    closeTarget.click = vi.fn();
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      isTrusted: true,
      target: closeTarget,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(closePlayer.playWhenReady).toHaveBeenCalledWith(120);
    expect(closeTarget.click).toHaveBeenCalledTimes(1);
  });
});
