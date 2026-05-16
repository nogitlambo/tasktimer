import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";

export const PRIMARY_CLICK_AUDIO_SRC = "/click-primary.mp3";
export const TASK_LAUNCH_CLICK_AUDIO_SRC = "/click-primary.mp3";
export const TASK_STOP_CLICK_AUDIO_SRC = "/alert.mp3";
const CLICK_AUDIO_SYNC_TIMEOUT_MS = 120;

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

const PRIMARY_CLICK_SELECTOR = "#saveEditBtn, #addTaskConfirmBtn, .closePopup.isSaveAndClose";
const TASK_LAUNCH_CLICK_SELECTOR =
  'button[data-action="start"][title="Launch"], button[data-action="start"][title="Resume"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';
const TASK_STOP_CLICK_SELECTOR = 'button[data-action="stop"][title="Stop"]';

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

export function getTaskStopClickTarget(target: EventTarget | null): HTMLElement | null {
  const stopTarget = getClosestElement(target, TASK_STOP_CLICK_SELECTOR);
  if (!stopTarget) return null;
  return isDisabledControl(stopTarget) ? null : stopTarget;
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
  isEnabled?: () => boolean;
  playAudio?: () => void;
}) {
  const player = options.playAudio ? null : createClickAudioPlayer(PRIMARY_CLICK_AUDIO_SRC);
  const taskLaunchPlayer = options.playAudio ? null : createClickAudioPlayer(TASK_LAUNCH_CLICK_AUDIO_SRC);
  const taskStopPlayer = options.playAudio ? null : createClickAudioPlayer(TASK_STOP_CLICK_AUDIO_SRC);
  const replayTargets = new WeakSet<HTMLElement>();
  player?.warm();
  taskLaunchPlayer?.warm();
  taskStopPlayer?.warm();

  options.on(options.documentRef, "click", (event: Event) => {
    if (options.isEnabled && !options.isEnabled()) return;
    if (event.defaultPrevented) return;
    const taskStopTarget = getTaskStopClickTarget(event.target);
    const taskLaunchTarget = taskStopTarget ? null : getTaskLaunchClickTarget(event.target);
    const primaryTarget = taskStopTarget || taskLaunchTarget ? null : getPrimaryClickTarget(event.target);
    const target = taskStopTarget || taskLaunchTarget || primaryTarget;
    if (!target) return;
    if (replayTargets.has(target)) {
      replayTargets.delete(target);
      return;
    }
    if ("isTrusted" in event && event.isTrusted === false) return;

    const activePlayer = taskStopTarget ? taskStopPlayer : taskLaunchTarget ? taskLaunchPlayer : player;
    const playAudio = options.playAudio || (() => activePlayer?.play());
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
  }, { capture: true });
}
