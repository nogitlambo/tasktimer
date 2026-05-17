import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { getPrimaryClickTarget, getTaskLaunchClickTarget, getTaskStopClickTarget } from "./primary-click-audio";
import {
  getCancelClickTarget,
  getCheckboxClickTarget,
  getCloseClickTarget,
  getSecondaryClickTarget,
} from "./secondary-click-audio";

export type InteractionHapticImpact = "light" | "medium" | "heavy";

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

type HapticsAdapter = {
  impact: (options: { style: ImpactStyle }) => Promise<void>;
};

const DESTRUCTIVE_CONFIRM_SELECTOR = [
  "#confirmOverlay.isResetTaskConfirm #confirmOkBtn",
  "#confirmOverlay.isResetAllDeleteConfirm #confirmOkBtn",
  "#confirmOverlay.isDeleteTaskConfirm #confirmOkBtn",
  "#confirmOverlay.isDeleteFriendConfirm #confirmOkBtn",
  "#confirmOverlay #confirmOkBtn.btn-warn",
  "#confirmOverlay #confirmAltBtn.btn-warn",
  ".modal .btn-warn",
].join(",");

function getClosestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  const node = target as (ClosestCapable & Element) | null;
  return (node?.closest?.(selector) as HTMLElement | null) || null;
}

export function isInteractionHapticsRuntimeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() || window.location.protocol === "file:";
  } catch {
    return false;
  }
}

export function getInteractionHapticImpact(target: EventTarget | null): InteractionHapticImpact | null {
  if (getClosestElement(target, DESTRUCTIVE_CONFIRM_SELECTOR)) return "heavy";
  if (getTaskStopClickTarget(target) || getTaskLaunchClickTarget(target) || getPrimaryClickTarget(target)) return "medium";
  if (getCloseClickTarget(target) || getCancelClickTarget(target) || getCheckboxClickTarget(target) || getSecondaryClickTarget(target)) {
    return "light";
  }
  return null;
}

export function playInteractionHaptic(impact: InteractionHapticImpact, haptics: HapticsAdapter = Haptics): void {
  if (!isInteractionHapticsRuntimeAvailable()) return;
  const style = impact === "heavy" ? ImpactStyle.Heavy : impact === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
  void haptics.impact({ style }).catch(() => {});
}

export function registerInteractionHaptics(options: {
  on: (el: EventTarget | null | undefined, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => void;
  documentRef: Document;
  isEnabled?: () => boolean;
  playHaptic?: (impact: InteractionHapticImpact) => void;
}) {
  options.on(
    options.documentRef,
    "click",
    (event: Event) => {
      if (options.isEnabled && !options.isEnabled()) return;
      if (event.defaultPrevented) return;
      if ("isTrusted" in event && event.isTrusted === false) return;
      const impact = getInteractionHapticImpact(event.target);
      if (!impact) return;
      (options.playHaptic || playInteractionHaptic)(impact);
    },
    { capture: true }
  );
}
