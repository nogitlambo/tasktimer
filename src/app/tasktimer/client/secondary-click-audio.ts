import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";

export const SECONDARY_CLICK_AUDIO_SRC = "/click-secondary.mp3";
export const CANCEL_CLICK_AUDIO_SRC = "/click_cancel.mp3";
export const CLOSE_CLICK_AUDIO_SRC = "/click_close.mp3";

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

const SECONDARY_CLICK_DIRECT_SELECTOR = [
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
].join(",");

const SECONDARY_CLICK_TEXT_SELECTOR = "button,a";
const SECONDARY_CLICK_EXCLUDED_LABELS = new Set([
  "save",
  "cancel",
  "create",
  "delete",
  "save & close",
  "close",
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
  const directTarget = getClosestElement(target, SECONDARY_CLICK_DIRECT_SELECTOR);
  if (directTarget) {
    if (isDisabledControl(directTarget) || isSecondaryClickExcludedControl(directTarget)) return null;
    return directTarget;
  }

  const textTarget = getClosestElement(target, SECONDARY_CLICK_TEXT_SELECTOR);
  if (!textTarget || isSecondaryClickExcludedControl(textTarget)) return null;
  return isDisabledControl(textTarget) ? null : textTarget;
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
}) {
  const player = options.playAudio ? null : createClickAudioPlayer(SECONDARY_CLICK_AUDIO_SRC);
  const cancelPlayer = options.playCancelAudio ? null : createClickAudioPlayer(CANCEL_CLICK_AUDIO_SRC);
  const closePlayer = options.playCloseAudio ? null : createClickAudioPlayer(CLOSE_CLICK_AUDIO_SRC);
  player?.warm();
  cancelPlayer?.warm();
  closePlayer?.warm();

  options.on(
    options.documentRef,
    "click",
    (event: Event) => {
      if (event.defaultPrevented) return;
      if ("isTrusted" in event && event.isTrusted === false) return;
      if (getCloseClickTarget(event.target)) {
        (options.playCloseAudio || (() => closePlayer?.play()))();
        return;
      }
      if (getCancelClickTarget(event.target)) {
        (options.playCancelAudio || (() => cancelPlayer?.play()))();
        return;
      }
      if (!getSecondaryClickTarget(event.target)) return;
      (options.playAudio || (() => player?.play()))();
    },
    { capture: true }
  );
}
