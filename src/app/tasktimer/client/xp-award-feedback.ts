import { playInteractionHaptic } from "./interaction-haptics";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

export type XpAwardDeliveryHapticsOptions = {
  isEnabled?: boolean;
  intensity?: InteractionHapticsIntensity;
};

export function shouldPlayXpAwardDeliveryHaptic(startXp: number, endXp: number, isEnabled: boolean): boolean {
  return isEnabled && Math.floor(Number(endXp) || 0) > Math.floor(Number(startXp) || 0);
}

export function playXpAwardDeliveryHaptic(options?: XpAwardDeliveryHapticsOptions): void {
  if (!options?.isEnabled) return;
  playInteractionHaptic("light", undefined, normalizeInteractionHapticsIntensity(options.intensity));
}
