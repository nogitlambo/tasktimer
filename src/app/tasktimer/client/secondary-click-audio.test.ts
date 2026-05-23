import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clickAudioPlayerModule from "./click-audio-player";

import {
  CANCEL_CLICK_AUDIO_SRC,
  CHECKBOX_CLICK_AUDIO_SRC,
  CLOSE_CLICK_AUDIO_SRC,
  DROPDOWN_CLICK_AUDIO_SRC,
  getCheckboxClickTarget,
  getCancelClickTarget,
  getCloseClickTarget,
  getDropdownClickTarget,
  getSecondaryClickTarget,
  getTaskFlipClickTarget,
  playCancelClickAudio,
  playCheckboxClickAudio,
  playCloseClickAudio,
  playDropdownClickAudio,
  playSecondaryClickAudio,
  playTaskFlipClickAudio,
  registerSecondaryClickAudio,
  SECONDARY_CLICK_AUDIO_SRC,
  TASK_FLIP_CLICK_AUDIO_SRC,
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
    const checkboxSelectors = ['input[type="checkbox"]', '[role="checkbox"]', ".modalPreviewDropdownOption"];
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

  it("excludes the Focus Mode Exit button from default secondary audio", () => {
    const focusExitButton = makeElement({
      selectorMatches: { "button,a": true, "#focusModeBackBtn": true },
      textContent: "Exit",
    });

    expect(getSecondaryClickTarget(focusExitButton)).toBeNull();
  });

  it("excludes controls handled by primary click audio selectors", () => {
    const primarySelector = "#saveEditBtn, #addTaskConfirmBtn, #friendRequestSendBtn, #historyEntryNoteSaveAndCloseBtn, .modalPreviewPrimaryAction";
    const taskLaunchSelector =
      'button[data-action="start"][title="Launch"], button[data-action="start"][title="Resume"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';
    const taskStopSelector = 'button[data-action="stop"][title="Stop"]';

    const saveButton = makeElement({
      selectorMatches: { [primarySelector]: true, "button,a": true },
      textContent: "Save",
    });
    const resumeButton = makeElement({
      selectorMatches: { [taskLaunchSelector]: true, "button,a": true },
      textContent: "Resume",
      attributes: { title: "Resume" },
    });
    const stopButton = makeElement({
      selectorMatches: { [taskStopSelector]: true, "button,a": true },
      textContent: "Stop",
      attributes: { title: "Stop" },
    });

    expect(getSecondaryClickTarget(saveButton)).toBeNull();
    expect(getSecondaryClickTarget(resumeButton)).toBeNull();
    expect(getSecondaryClickTarget(stopButton)).toBeNull();
  });

  it("matches cancel controls for dedicated cancel audio", () => {
    const textSelector = "button,a";
    const cancelSelector = ".modalPreviewSecondaryAction";
    const cancelByText = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" });
    const cancelByAria = makeElement({
      selectorMatches: { [textSelector]: true },
      attributes: { "aria-label": "Cancel" },
    });
    const cancelByClass = makeElement({ selectorMatches: { [cancelSelector]: true }, textContent: "Secondary" });
    const done = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Done" });

    expect(getCancelClickTarget(cancelByText)).toBe(cancelByText);
    expect(getCancelClickTarget(cancelByAria)).toBe(cancelByAria);
    expect(getCancelClickTarget(cancelByClass)).toBe(cancelByClass);
    expect(getCancelClickTarget(done)).toBeNull();
  });

  it("matches modal preview dropdown trigger for dedicated dropdown audio", () => {
    const dropdownSelector = '.modalPreviewDropdownButton,#menuIcon,[data-action="history"]';
    const dropdownTrigger = makeElement({
      selectorMatches: { [dropdownSelector]: true, ".modalPreviewDropdownButton": true, "button,a": true },
      textContent: "Standard option",
    });
    const mobileMenuTrigger = makeElement({
      selectorMatches: { [dropdownSelector]: true, "#menuIcon": true, "button,a": true },
      attributes: { id: "menuIcon" },
    });
    const dropdownOption = makeElement({
      selectorMatches: { ".modalPreviewDropdownOption": true, "button,a": true, ['input[type="checkbox"],[role="checkbox"],.modalPreviewDropdownOption']: true },
      textContent: "Secondary option",
    });

    expect(getDropdownClickTarget(dropdownTrigger)).toBe(dropdownTrigger);
    expect(getSecondaryClickTarget(dropdownTrigger)).toBeNull();
    expect(getDropdownClickTarget(mobileMenuTrigger)).toBe(mobileMenuTrigger);
    expect(getSecondaryClickTarget(mobileMenuTrigger)).toBeNull();
    expect(getDropdownClickTarget(dropdownOption)).toBeNull();
    expect(getCheckboxClickTarget(dropdownOption)).toBe(dropdownOption);
  });

  it("matches task flip controls for dedicated flip audio", () => {
    const flipSelector = "[data-task-flip]";
    const flipButton = makeElement({
      selectorMatches: { [flipSelector]: true, "button,a": true },
      attributes: { "data-task-flip": "open" },
      textContent: "More actions",
    });

    expect(getTaskFlipClickTarget(flipButton)).toBe(flipButton);
    expect(getSecondaryClickTarget(flipButton)).toBeNull();
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
    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
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
    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
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

  it("plays the configured dropdown audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playDropdownClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(DROPDOWN_CLICK_AUDIO_SRC);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the configured task flip audio source without surfacing playback failures", () => {
    const play = vi.fn(() => Promise.reject(new Error("blocked")));
    const audioFactory = vi.fn(() => ({ currentTime: 12, play }));

    expect(() => playTaskFlipClickAudio(audioFactory)).not.toThrow();

    expect(audioFactory).toHaveBeenCalledWith(TASK_FLIP_CLICK_AUDIO_SRC);
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

    const directSelector = ".switch,[role=\"switch\"],#closeMenuBtn,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action=\"openAddTask\"],[data-action=\"reset\"],[data-action=\"edit\"],#openFriendRequestModalBtn";
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
    const checkboxSelector = 'input[type="checkbox"],[role="checkbox"],.modalPreviewDropdownOption';

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

  it("routes task flip controls to the dedicated flip audio callback", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playTaskFlipAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playTaskFlipAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, target: makeElement({ selectorMatches: { "[data-task-flip]": true } }) } as unknown as Event);

    expect(playTaskFlipAudio).toHaveBeenCalledTimes(1);
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

  it("plays an unready cancel click immediately without delaying the action", () => {
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
    const cancelClick = vi.fn();
    const cancelTarget = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Cancel" }) as HTMLElement & { click: () => void };
    cancelTarget.click = cancelClick;
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({ defaultPrevented: false, isTrusted: true, target: cancelTarget, preventDefault, stopImmediatePropagation } as unknown as Event);

    expect(cancelPlayer.play).toHaveBeenCalledTimes(1);
    expect(cancelPlayer.playWhenReady).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(cancelClick).not.toHaveBeenCalled();

    handler({ defaultPrevented: false, isTrusted: false, target: cancelTarget } as unknown as Event);
    expect(cancelPlayer.play).toHaveBeenCalledTimes(1);
  });

  it("routes modal preview dropdown item selection to checkbox audio", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playCheckboxAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playCheckboxAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: {
          ['input[type="checkbox"],[role="checkbox"],.modalPreviewDropdownOption']: true,
          ".modalPreviewDropdownOption": true,
          "button,a": true,
        },
        textContent: "Secondary option",
      }),
    } as unknown as Event);

    expect(playCheckboxAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("routes modal preview dropdown trigger to dropdown audio instead of default secondary audio", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playDropdownAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playDropdownAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { ['.modalPreviewDropdownButton,#menuIcon,[data-action="history"]']: true, ".modalPreviewDropdownButton": true, "button,a": true },
        textContent: "Standard option",
      }),
    } as unknown as Event);

    expect(playDropdownAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("routes mobile hamburger menu panel toggles to dropdown audio instead of default secondary audio", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playDropdownAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playDropdownAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { ['.modalPreviewDropdownButton,#menuIcon,[data-action="history"]']: true, "#menuIcon": true, "button,a": true },
        attributes: { id: "menuIcon" },
      }),
    } as unknown as Event);

    expect(playDropdownAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("routes task history chart toggles to dropdown audio instead of default secondary audio", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playDropdownAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playDropdownAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { ['.modalPreviewDropdownButton,#menuIcon,[data-action="history"]']: true, '[data-action="history"]': true, "button,a": true },
        textContent: "View Chart",
      }),
    } as unknown as Event);

    expect(playDropdownAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("routes modal preview secondary action to cancel audio instead of default secondary audio", () => {
    const documentRef = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const on = vi.fn();
    const playAudio = vi.fn();
    const playCancelAudio = vi.fn();

    registerSecondaryClickAudio({
      on,
      documentRef: documentRef as unknown as Document,
      playAudio,
      playCancelAudio,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      target: makeElement({
        selectorMatches: { ".modalPreviewSecondaryAction": true, "button,a": true },
        textContent: "Secondary",
      }),
    } as unknown as Event);

    expect(playCancelAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("does not replay close clicks when audio is still unready", () => {
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
    const closeClick = vi.fn();
    const closeTarget = makeElement({ selectorMatches: { [textSelector]: true }, textContent: "Close" }) as HTMLElement & { click: () => void };
    closeTarget.click = closeClick;
    const handler = on.mock.calls[0]?.[2] as EventListener;

    handler({
      defaultPrevented: false,
      isTrusted: true,
      target: closeTarget,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as Event);

    expect(closePlayer.play).toHaveBeenCalledTimes(1);
    expect(closePlayer.playWhenReady).not.toHaveBeenCalled();
    expect(closeClick).not.toHaveBeenCalled();
  });
});
