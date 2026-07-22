import { playInteractionHaptic } from "./interaction-haptics";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

export type XpAwardDeliveryHapticsOptions = {
  isEnabled?: boolean;
  intensity?: InteractionHapticsIntensity;
};

export type RateLimitedXpAwardDeliveryHapticOptions = {
  startXp: number;
  endXp: number;
  isEnabled: boolean;
  totalUnits: number;
  nowMs: number;
  lastPlayedAtMs: number | null;
  minIntervalMs?: number;
};

export const XP_AWARD_DELIVERY_HAPTIC_MIN_INTERVAL_MS = 90;

export function shouldPlayXpAwardDeliveryHaptic(startXp: number, endXp: number, isEnabled: boolean): boolean {
  return isEnabled && Math.floor(Number(endXp) || 0) > Math.floor(Number(startXp) || 0);
}

export function shouldPlayRateLimitedXpAwardDeliveryHaptic(options: RateLimitedXpAwardDeliveryHapticOptions): boolean {
  const totalUnits = Math.max(0, Math.floor(Number(options.totalUnits) || 0));
  if (totalUnits <= 0) return false;
  if (!shouldPlayXpAwardDeliveryHaptic(options.startXp, options.endXp, options.isEnabled)) return false;
  if (options.lastPlayedAtMs == null) return true;
  const nowMs = Math.max(0, Number(options.nowMs) || 0);
  const lastPlayedAtMs = Math.max(0, Number(options.lastPlayedAtMs) || 0);
  const minIntervalMs = Math.max(0, Math.floor(Number(options.minIntervalMs ?? XP_AWARD_DELIVERY_HAPTIC_MIN_INTERVAL_MS) || 0));
  return nowMs - lastPlayedAtMs >= minIntervalMs;
}

export function playXpAwardDeliveryHaptic(options?: XpAwardDeliveryHapticsOptions): void {
  if (!options?.isEnabled) return;
  playInteractionHaptic("light", undefined, normalizeInteractionHapticsIntensity(options.intensity));
}
