import { playInteractionHaptic } from "./interaction-haptics";
import { createClickAudioPlayer, type ClickAudioFactory } from "./click-audio-player";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

export const XP_AWARD_DELIVERY_AUDIO_SRC = "/xp_increase.mp3";

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

export function playXpAwardDeliveryAudio(audioFactory?: ClickAudioFactory): void {
  if (typeof window === "undefined" && !audioFactory) return;

  createClickAudioPlayer(XP_AWARD_DELIVERY_AUDIO_SRC, audioFactory).play();
}
