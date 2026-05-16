import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";

export const SECONDARY_CLICK_AUDIO_SRC = "/click-secondary.mp3";
export const CANCEL_CLICK_AUDIO_SRC = "/click_cancel_button.mp3";
export const CLOSE_CLICK_AUDIO_SRC = "/click_close_button.mp3";
export const CHECKBOX_CLICK_AUDIO_SRC = "/click_checkbox.mp3";
const CLICK_AUDIO_SYNC_TIMEOUT_MS = 120;

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

const SECONDARY_CLICK_DIRECT_SELECTOR = [
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
].join(",");

const CHECKBOX_CLICK_SELECTOR = ['input[type="checkbox"]', '[role="checkbox"]'].join(",");
const SECONDARY_CLICK_TEXT_SELECTOR = "button,a";
const SECONDARY_CLICK_EXCLUDED_LABELS = new Set([
  "save",
  "cancel",
  "create",
  "delete",
  "save & close",
  "close",
  "launch",
]);
const CANCEL_CLICK_LABELS = new Set(["cancel"]);
const CLOSE_CLICK_LABELS = new Set(["close"]);

function getClosestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  const node = target as (ClosestCapable & Element) | null;
  return (node?.closest?.(selector) as HTMLElement | null) || null;
}

function isDisabledControl(element: HTMLElement): boolean {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if ("disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement).disabled)) return true;
  const disabledAncestor = element.closest?.("button:disabled,input:disabled,[aria-disabled='true']");
  return !!disabledAncestor;
}

function getControlLabel(element: HTMLElement): string {
  return String(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent ||
      ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isSecondaryClickExcludedControl(element: HTMLElement): boolean {
  return SECONDARY_CLICK_EXCLUDED_LABELS.has(getControlLabel(element));
}

function isCancelClickControl(element: HTMLElement): boolean {
  return CANCEL_CLICK_LABELS.has(getControlLabel(element));
}

function isCloseClickControl(element: HTMLElement): boolean {
  return CLOSE_CLICK_LABELS.has(getControlLabel(element));
}

export function getSecondaryClickTarget(target: EventTarget | null): HTMLElement | null {
  if (getCheckboxClickTarget(target)) return null;

  const directTarget = getClosestElement(target, SECONDARY_CLICK_DIRECT_SELECTOR);
  if (directTarget) {
    if (isDisabledControl(directTarget) || isSecondaryClickExcludedControl(directTarget)) return null;
    return directTarget;
  }

  const textTarget = getClosestElement(target, SECONDARY_CLICK_TEXT_SELECTOR);
  if (!textTarget || isSecondaryClickExcludedControl(textTarget)) return null;
  return isDisabledControl(textTarget) ? null : textTarget;
}

export function getCheckboxClickTarget(target: EventTarget | null): HTMLElement | null {
  const checkboxTarget = getClosestElement(target, CHECKBOX_CLICK_SELECTOR);
  if (!checkboxTarget) return null;
  return isDisabledControl(checkboxTarget) ? null : checkboxTarget;
}

export function getCancelClickTarget(target: EventTarget | null): HTMLElement | null {
  const textTarget = getClosestElement(target, SECONDARY_CLICK_TEXT_SELECTOR);
  if (!textTarget || !isCancelClickControl(textTarget)) return null;
  return isDisabledControl(textTarget) ? null : textTarget;
}

export function getCloseClickTarget(target: EventTarget | null): HTMLElement | null {
  const textTarget = getClosestElement(target, SECONDARY_CLICK_TEXT_SELECTOR);
  if (!textTarget || !isCloseClickControl(textTarget)) return null;
  return isDisabledControl(textTarget) ? null : textTarget;
}

export function playSecondaryClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(SECONDARY_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playCancelClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(CANCEL_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playCloseClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(CLOSE_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playCheckboxClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(CHECKBOX_CLICK_AUDIO_SRC, audioFactory).play();
}

export function registerSecondaryClickAudio(options: {
  on: (
    el: EventTarget | null | undefined,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions
  ) => void;
  documentRef: Document;
  playAudio?: () => void;
  playCancelAudio?: () => void;
  playCloseAudio?: () => void;
  playCheckboxAudio?: () => void;
  isEnabled?: () => boolean;
}) {
  const player = options.playAudio ? null : createClickAudioPlayer(SECONDARY_CLICK_AUDIO_SRC);
  const cancelPlayer = options.playCancelAudio ? null : createClickAudioPlayer(CANCEL_CLICK_AUDIO_SRC);
  const closePlayer = options.playCloseAudio ? null : createClickAudioPlayer(CLOSE_CLICK_AUDIO_SRC);
  const checkboxPlayer = options.playCheckboxAudio ? null : createClickAudioPlayer(CHECKBOX_CLICK_AUDIO_SRC);
  const replayTargets = new WeakSet<HTMLElement>();
  player?.warm();
  cancelPlayer?.warm();
  closePlayer?.warm();
  checkboxPlayer?.warm();

  options.on(
    options.documentRef,
    "click",
    (event: Event) => {
      if (options.isEnabled && !options.isEnabled()) return;
      if (event.defaultPrevented) return;
      const closeTarget = getCloseClickTarget(event.target);
      const cancelTarget = closeTarget ? null : getCancelClickTarget(event.target);
      const checkboxTarget = closeTarget || cancelTarget ? null : getCheckboxClickTarget(event.target);
      const secondaryTarget = closeTarget || cancelTarget || checkboxTarget ? null : getSecondaryClickTarget(event.target);
      const target = closeTarget || cancelTarget || checkboxTarget || secondaryTarget;
      if (!target) return;
      if (replayTargets.has(target)) {
        replayTargets.delete(target);
        return;
      }
      if ("isTrusted" in event && event.isTrusted === false) return;

      const activePlayer = closeTarget
        ? closePlayer
        : cancelTarget
          ? cancelPlayer
          : checkboxTarget
            ? checkboxPlayer
            : player;
      const playAudio = closeTarget
        ? options.playCloseAudio || (() => closePlayer?.play())
        : cancelTarget
          ? options.playCancelAudio || (() => cancelPlayer?.play())
          : checkboxTarget
            ? options.playCheckboxAudio || (() => checkboxPlayer?.play())
            : options.playAudio || (() => player?.play());

      if (!activePlayer || activePlayer.isReady()) {
        playAudio();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void activePlayer.playWhenReady(CLICK_AUDIO_SYNC_TIMEOUT_MS).finally(() => {
        replayTargets.add(target);
        target.click();
      });
    },
    { capture: true }
  );
}
