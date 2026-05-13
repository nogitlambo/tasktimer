import { describe, expect, it, vi } from "vitest";

import {
  CANCEL_CLICK_AUDIO_SRC,
  CLOSE_CLICK_AUDIO_SRC,
  getCancelClickTarget,
  getCloseClickTarget,
  getSecondaryClickTarget,
  playCancelClickAudio,
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
  it("matches requested direct controls", () => {
    const directSelectors = [
      ".switch",
      '[role="switch"]',
      'input[type="checkbox"]',
      '[role="checkbox"]',
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

    for (const label of ["Save", "Cancel", "Create", "Delete", "Save & Close", "Close", " Save   &   Close "]) {
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
    const directSelector = ".switch,[role=\"switch\"],input[type=\"checkbox\"],[role=\"checkbox\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
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
    const directSelector = ".switch,[role=\"switch\"],input[type=\"checkbox\"],[role=\"checkbox\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
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

  it("registers one scoped app click listener and skips already-prevented clicks", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();

    registerSecondaryClickAudio({ on, documentRef: documentRef as unknown as Document, playAudio });

    const handler = on.mock.calls[0]?.[2] as EventListener;
    expect(on).toHaveBeenCalledWith(documentRef, "click", expect.any(Function), { capture: true });

    handler({ defaultPrevented: true, target: makeElement({ selectorMatches: { "#menuIcon": true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    const directSelector = ".switch,[role=\"switch\"],input[type=\"checkbox\"],[role=\"checkbox\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    handler({ defaultPrevented: false, isTrusted: false, target: makeElement({ selectorMatches: { [directSelector]: true } }) } as unknown as Event);
    expect(playAudio).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { [directSelector]: true } }) } as unknown as Event);
    expect(playAudio).toHaveBeenCalledTimes(1);
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
});
