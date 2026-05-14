import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";

export const PRIMARY_CLICK_AUDIO_SRC = "/click_save_create.mp3";
export const TASK_LAUNCH_CLICK_AUDIO_SRC = "/click-primary.mp3";

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

const PRIMARY_CLICK_SELECTOR = "#saveEditBtn, #addTaskConfirmBtn";
const TASK_LAUNCH_CLICK_SELECTOR =
  'button[data-action="start"][title="Launch"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';

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

export function getPrimaryClickTarget(target: EventTarget | null): HTMLElement | null {
  const primaryTarget = getClosestElement(target, PRIMARY_CLICK_SELECTOR);
  if (!primaryTarget) return null;
  return isDisabledControl(primaryTarget) ? null : primaryTarget;
}

export function getTaskLaunchClickTarget(target: EventTarget | null): HTMLElement | null {
  const launchTarget = getClosestElement(target, TASK_LAUNCH_CLICK_SELECTOR);
  if (!launchTarget) return null;
  return isDisabledControl(launchTarget) ? null : launchTarget;
}

export function playPrimaryClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(PRIMARY_CLICK_AUDIO_SRC, audioFactory).play();
}

export function playTaskLaunchClickAudio(audioFactory?: ClickAudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(TASK_LAUNCH_CLICK_AUDIO_SRC, audioFactory).play();
}

export function registerPrimaryClickAudio(options: {
  on: (el: EventTarget | null | undefined, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => void;
  documentRef: Document;
  playAudio?: () => void;
}) {
  const player = options.playAudio ? null : createClickAudioPlayer(PRIMARY_CLICK_AUDIO_SRC);
  const taskLaunchPlayer = options.playAudio ? null : createClickAudioPlayer(TASK_LAUNCH_CLICK_AUDIO_SRC);
  player?.warm();
  taskLaunchPlayer?.warm();

  options.on(options.documentRef, "click", (event: Event) => {
    if (event.defaultPrevented) return;
    if ("isTrusted" in event && event.isTrusted === false) return;
    if (getTaskLaunchClickTarget(event.target)) {
      (options.playAudio || (() => taskLaunchPlayer?.play()))();
      return;
    }
    if (!getPrimaryClickTarget(event.target)) return;
    (options.playAudio || (() => player?.play()))();
  }, { capture: true });
}
