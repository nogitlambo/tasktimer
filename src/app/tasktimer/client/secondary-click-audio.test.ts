import { describe, expect, it, vi } from "vitest";

import {
  getSecondaryClickTarget,
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

  it("matches cancel, close, and exit controls by accessible label or text", () => {
    const textSelector = "button,a";

    for (const label of ["Cancel", "Close", "Exit"]) {
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

  it("ignores unrelated and disabled controls", () => {
    const directSelector = ".switch,[role=\"switch\"],input[type=\"checkbox\"],[role=\"checkbox\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    const textSelector = "button,a";
    const unrelated = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Save" });
    const disabled = makeElement({ selectorMatches: { [directSelector]: true }, disabled: true });
    const ariaDisabled = makeElement({
      selectorMatches: { [directSelector]: true },
      attributes: { "aria-disabled": "true" },
    });

    expect(getSecondaryClickTarget(unrelated)).toBeNull();
    expect(getSecondaryClickTarget(disabled)).toBeNull();
    expect(getSecondaryClickTarget(ariaDisabled)).toBeNull();
  });

  it("defers primary action controls to primary click audio", () => {
    const directSelector = ".switch,[role=\"switch\"],input[type=\"checkbox\"],[role=\"checkbox\"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
    const primaryDirectTarget = makeElement({
      selectorMatches: { [directSelector]: true, ".btn-accent": true },
    });

    expect(getSecondaryClickTarget(primaryDirectTarget)).toBeNull();
  });

  it("plays the configured audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playSecondaryClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(SECONDARY_CLICK_AUDIO_SRC);
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
});
