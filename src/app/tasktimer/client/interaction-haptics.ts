import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { getPrimaryClickTarget, getTaskLaunchClickTarget, getTaskStopClickTarget } from "./primary-click-audio";
import {
  getCancelClickTarget,
  getCheckboxClickTarget,
  getCloseClickTarget,
  getSecondaryClickTarget,
} from "./secondary-click-audio";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

export type InteractionHapticImpact = "light" | "medium" | "heavy";

type ClosestCapable = {
  closest?: (selector: string) => Element | null;
};

type HapticsAdapter = {
  impact: (options: { style: ImpactStyle }) => Promise<void>;
  vibrate?: (options: { duration: number }) => Promise<void>;
};

const ANDROID_INTENSITY_DURATIONS_MS: Record<InteractionHapticImpact, number> = {
  light: 18,
  medium: 42,
  heavy: 75,
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

export function applyInteractionHapticsIntensity(
  impact: InteractionHapticImpact,
  intensity: InteractionHapticsIntensity
): InteractionHapticImpact {
  const normalizedIntensity = normalizeInteractionHapticsIntensity(intensity);
  if (normalizedIntensity === "low") return "light";
  if (normalizedIntensity === "medium") return "medium";
  return "heavy";
}

function isAndroidHapticsRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

export function playInteractionHaptic(
  impact: InteractionHapticImpact,
  haptics: HapticsAdapter = Haptics,
  intensity: InteractionHapticsIntensity = "max"
): void {
  if (!isInteractionHapticsRuntimeAvailable()) return;
  const resolvedImpact = applyInteractionHapticsIntensity(impact, intensity);
  if (isAndroidHapticsRuntime() && haptics.vibrate) {
    void haptics.vibrate({ duration: ANDROID_INTENSITY_DURATIONS_MS[resolvedImpact] }).catch(() => {});
    return;
  }
  const style = resolvedImpact === "heavy" ? ImpactStyle.Heavy : resolvedImpact === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
  void haptics.impact({ style }).catch(() => {});
}

export function registerInteractionHaptics(options: {
  on: (el: EventTarget | null | undefined, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => void;
  documentRef: Document;
  isEnabled?: () => boolean;
  getIntensity?: () => InteractionHapticsIntensity;
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
      if (options.playHaptic) {
        options.playHaptic(impact);
        return;
      }
      playInteractionHaptic(impact, Haptics, normalizeInteractionHapticsIntensity(options.getIntensity?.()));
    },
    { capture: true }
  );
}
