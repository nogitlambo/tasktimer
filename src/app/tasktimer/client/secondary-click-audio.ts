import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";
import { getPrimaryClickTarget, getTaskLaunchClickTarget, getTaskStopClickTarget } from "./primary-click-audio";

export const SECONDARY_CLICK_AUDIO_SRC = "/click-secondary.mp3";
export const CANCEL_CLICK_AUDIO_SRC = "/click_cancel_button.mp3";
export const CLOSE_CLICK_AUDIO_SRC = "/click_close_button.mp3";
export const CHECKBOX_CLICK_AUDIO_SRC = "/click_checkbox.mp3";
export const DROPDOWN_CLICK_AUDIO_SRC = "/click-dropdown.mp3";
export const TASK_FLIP_CLICK_AUDIO_SRC = "/click_flip.mp3";
export const MODAL_OPEN_AUDIO_SRC = "/modal_open.mp3";

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

const SECONDARY_CLICK_DIRECT_SELECTOR = [
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
  '[data-onboarding-next-action="true"]',
  "#openFriendRequestModalBtn",
].join(",");

const CHECKBOX_CLICK_SELECTOR = ['input[type="checkbox"]', '[role="checkbox"]', ".modalPreviewDropdownOption"].join(",");
const DROPDOWN_CLICK_SELECTOR = '.modalPreviewDropdownButton,#menuIcon,[data-action="history"],[data-rank-ladder-open]';
const TASK_FLIP_CLICK_SELECTOR = "[data-task-flip]";
const MODAL_OPEN_CLICK_SELECTOR = "[data-friend-profile-open],[data-leaderboard-profile-open]";
const SECONDARY_CLICK_TEXT_SELECTOR = "button,a";
const SECONDARY_CLICK_EXCLUDED_SELECTOR = '#focusModeBackBtn,[data-history-summary-action="delete-session"]';
const SECONDARY_CLICK_EXCLUDED_LABELS = new Set([
  "save",
  "cancel",
  "create",
  "delete",
  "save & close",
  "close",
  "launch",
]);
const CANCEL_CLICK_SELECTOR = ".modalPreviewSecondaryAction";
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
  if (getClosestElement(element, SECONDARY_CLICK_EXCLUDED_SELECTOR)) return true;
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
  if (getDropdownClickTarget(target)) return null;
  if (getClosestElement(target, TASK_FLIP_CLICK_SELECTOR)) return null;
  if (getModalOpenClickTarget(target)) return null;
  if (getTaskStopClickTarget(target) || getTaskLaunchClickTarget(target) || getPrimaryClickTarget(target)) return null;

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

export function getDropdownClickTarget(target: EventTarget | null): HTMLElement | null {
  const dropdownTarget = getClosestElement(target, DROPDOWN_CLICK_SELECTOR);
  if (!dropdownTarget) return null;
  return isDisabledControl(dropdownTarget) ? null : dropdownTarget;
}

export function getTaskFlipClickTarget(target: EventTarget | null): HTMLElement | null {
  const flipTarget = getClosestElement(target, TASK_FLIP_CLICK_SELECTOR);
  if (!flipTarget) return null;
  return isDisabledControl(flipTarget) ? null : flipTarget;
}

export function getModalOpenClickTarget(target: EventTarget | null): HTMLElement | null {
  const modalOpenTarget = getClosestElement(target, MODAL_OPEN_CLICK_SELECTOR);
  if (!modalOpenTarget) return null;
  return isDisabledControl(modalOpenTarget) ? null : modalOpenTarget;
}

export function getCancelClickTarget(target: EventTarget | null): HTMLElement | null {
  const directTarget = getClosestElement(target, CANCEL_CLICK_SELECTOR);
  if (directTarget) return isDisabledControl(directTarget) ? null : directTarget;

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

export function playDropdownClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(DROPDOWN_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playTaskFlipClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(TASK_FLIP_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playModalOpenClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(MODAL_OPEN_AUDIO_SRC, audioFactory).play();
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
  playDropdownAudio?: () => void;
  playTaskFlipAudio?: () => void;
  playModalOpenAudio?: () => void;
  isEnabled?: () => boolean;
}) {
  const player = options.playAudio ? null : createClickAudioPlayer(SECONDARY_CLICK_AUDIO_SRC);
  const cancelPlayer = options.playCancelAudio ? null : createClickAudioPlayer(CANCEL_CLICK_AUDIO_SRC);
  const closePlayer = options.playCloseAudio ? null : createClickAudioPlayer(CLOSE_CLICK_AUDIO_SRC);
  const checkboxPlayer = options.playCheckboxAudio ? null : createClickAudioPlayer(CHECKBOX_CLICK_AUDIO_SRC);
  const dropdownPlayer = options.playDropdownAudio ? null : createClickAudioPlayer(DROPDOWN_CLICK_AUDIO_SRC);
  const taskFlipPlayer = options.playTaskFlipAudio ? null : createClickAudioPlayer(TASK_FLIP_CLICK_AUDIO_SRC);
  const modalOpenPlayer = options.playModalOpenAudio ? null : createClickAudioPlayer(MODAL_OPEN_AUDIO_SRC);
  player?.warm();
  cancelPlayer?.warm();
  closePlayer?.warm();
  checkboxPlayer?.warm();
  dropdownPlayer?.warm();
  taskFlipPlayer?.warm();
  modalOpenPlayer?.warm();

  options.on(
    options.documentRef,
    "click",
    (event: Event) => {
      if (options.isEnabled && !options.isEnabled()) return;
      if (event.defaultPrevented) return;
      const closeTarget = getCloseClickTarget(event.target);
      const cancelTarget = closeTarget ? null : getCancelClickTarget(event.target);
      const checkboxTarget = closeTarget || cancelTarget ? null : getCheckboxClickTarget(event.target);
      const dropdownTarget = closeTarget || cancelTarget || checkboxTarget ? null : getDropdownClickTarget(event.target);
      const taskFlipTarget = closeTarget || cancelTarget || checkboxTarget || dropdownTarget ? null : getTaskFlipClickTarget(event.target);
      const modalOpenTarget = closeTarget || cancelTarget || checkboxTarget || dropdownTarget || taskFlipTarget ? null : getModalOpenClickTarget(event.target);
      const secondaryTarget = closeTarget || cancelTarget || checkboxTarget || dropdownTarget || taskFlipTarget || modalOpenTarget ? null : getSecondaryClickTarget(event.target);
      const target = closeTarget || cancelTarget || checkboxTarget || dropdownTarget || taskFlipTarget || modalOpenTarget || secondaryTarget;
      if (!target) return;
      if ("isTrusted" in event && event.isTrusted === false) return;

      const playAudio = closeTarget
        ? options.playCloseAudio || (() => closePlayer?.play())
        : cancelTarget
          ? options.playCancelAudio || (() => cancelPlayer?.play())
          : checkboxTarget
          ? options.playCheckboxAudio || (() => checkboxPlayer?.play())
          : dropdownTarget
            ? options.playDropdownAudio || (() => dropdownPlayer?.play())
            : taskFlipTarget
              ? options.playTaskFlipAudio || (() => taskFlipPlayer?.play())
              : modalOpenTarget
                ? options.playModalOpenAudio || (() => modalOpenPlayer?.play())
                : options.playAudio || (() => player?.play());

      playAudio();
    },
    { capture: true }
  );
}
