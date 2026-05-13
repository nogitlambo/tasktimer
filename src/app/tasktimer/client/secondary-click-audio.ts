export const SECONDARY_CLICK_AUDIO_SRC = "/click-secondary.mp3";

type AudioLike = {
  currentTime: number;
  preload?: string;
  play: () => Promise<unknown> | void;
};

type AudioFactory = (src: string) => AudioLike;

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
const SECONDARY_CLICK_LABELS = new Set(["cancel", "close", "exit"]);

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
    .toLowerCase();
}

function isSecondaryClickTextControl(element: HTMLElement): boolean {
  const label = getControlLabel(element);
  return SECONDARY_CLICK_LABELS.has(label);
}

export function getSecondaryClickTarget(target: EventTarget | null): HTMLElement | null {
  if (getClosestElement(target, ".btn-accent")) return null;

  const directTarget = getClosestElement(target, SECONDARY_CLICK_DIRECT_SELECTOR);
  if (directTarget) return isDisabledControl(directTarget) ? null : directTarget;

  const textTarget = getClosestElement(target, SECONDARY_CLICK_TEXT_SELECTOR);
  if (!textTarget || !isSecondaryClickTextControl(textTarget)) return null;
  return isDisabledControl(textTarget) ? null : textTarget;
}

export function playSecondaryClickAudio(audioFactory?: AudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  try {
    const factory = audioFactory || ((src: string) => new Audio(src));
    const audio = factory(SECONDARY_CLICK_AUDIO_SRC);
    audio.preload = "auto";
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for secondary click feedback.
  }
}

export function registerSecondaryClickAudio(options: {
  on: (el: EventTarget | null | undefined, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => void;
  documentRef: Document;
  playAudio?: () => void;
}) {
  options.on(options.documentRef, "click", (event: Event) => {
    if (event.defaultPrevented) return;
    if ("isTrusted" in event && event.isTrusted === false) return;
    if (!getSecondaryClickTarget(event.target)) return;
    (options.playAudio || playSecondaryClickAudio)();
  }, { capture: true });
}
