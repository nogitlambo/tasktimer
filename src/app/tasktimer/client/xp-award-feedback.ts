import { playInteractionHaptic } from "./interaction-haptics";
import type { ClickAudioFactory, ClickAudioLike } from "./click-audio-player";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

export const XP_AWARD_DELIVERY_AUDIO_SRC = "/xp_increase.mp3";
export const XP_AWARD_DELIVERY_DONE_AUDIO_SRC = "/xp_increase_done.mp3";
export const XP_AWARD_DELIVERY_DONE_DELAY_MS = 300;

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

  try {
    const audio = createXpAwardAudio(XP_AWARD_DELIVERY_AUDIO_SRC, audioFactory);
    if (!audio) return;

    const playDoneAudio = () => {
      const timeout = typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
      timeout(() => {
        try {
          const doneAudio = createXpAwardAudio(XP_AWARD_DELIVERY_DONE_AUDIO_SRC, audioFactory);
          if (!doneAudio) return;
          doneAudio.currentTime = 0;
          const donePlayback = doneAudio.play();
          if (donePlayback && typeof donePlayback.catch === "function") donePlayback.catch(() => {});
        } catch {
          // Completion audio is optional.
        }
      }, XP_AWARD_DELIVERY_DONE_DELAY_MS);
    };

    const onEnded = () => {
      audio.removeEventListener?.("ended", onEnded);
      playDoneAudio();
    };

    audio.addEventListener?.("ended", onEnded);
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for XP feedback.
  }
}

function createXpAwardAudio(src: string, audioFactory?: ClickAudioFactory): ClickAudioLike | null {
  if (audioFactory) {
    const audio = audioFactory(src);
    audio.preload = "auto";
    try {
      audio.load?.();
    } catch {
      // Preload support varies; playback remains best-effort.
    }
    return audio;
  }
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const audio = new Audio(src);
  audio.preload = "auto";
  try {
    audio.load?.();
  } catch {
    // Preload support varies; playback remains best-effort.
  }
  return audio;
}
