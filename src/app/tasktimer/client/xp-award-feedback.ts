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

export type XpAwardDeliveryAudioHandle = {
  stop: () => void;
  playDone: () => void;
};

let warmedXpAwardDeliveryAudio: ClickAudioLike | null = null;

export function shouldPlayXpAwardDeliveryHaptic(startXp: number, endXp: number, isEnabled: boolean): boolean {
  return isEnabled && Math.floor(Number(endXp) || 0) > Math.floor(Number(startXp) || 0);
}

export function playXpAwardDeliveryHaptic(options?: XpAwardDeliveryHapticsOptions): void {
  if (!options?.isEnabled) return;
  playInteractionHaptic("light", undefined, normalizeInteractionHapticsIntensity(options.intensity));
}

export function warmXpAwardDeliveryAudio(audioFactory?: ClickAudioFactory): void {
  if (typeof window === "undefined" && !audioFactory) return;

  try {
    const audio = createXpAwardAudio(XP_AWARD_DELIVERY_AUDIO_SRC, audioFactory);
    if (!audio) return;
    warmedXpAwardDeliveryAudio = audio;
  } catch {
    // Warming is optional; playback can still try to create audio later.
  }
}

export function playXpAwardDeliveryAudio(audioFactory?: ClickAudioFactory): XpAwardDeliveryAudioHandle | null {
  if (typeof window === "undefined" && !audioFactory) return null;

  try {
    const audio = warmedXpAwardDeliveryAudio || createXpAwardAudio(XP_AWARD_DELIVERY_AUDIO_SRC, audioFactory);
    warmedXpAwardDeliveryAudio = null;
    if (!audio) return null;

    let stopped = false;

    const onEnded = () => {
      audio.removeEventListener?.("ended", onEnded);
      stopped = true;
    };

    audio.addEventListener?.("ended", onEnded);
    audio.loop = true;
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});

    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        audio.removeEventListener?.("ended", onEnded);
        audio.loop = false;
        try {
          audio.pause?.();
        } catch {
          // Pausing feedback audio is best-effort.
        }
        try {
          audio.currentTime = 0;
        } catch {
          // Some audio implementations may reject seeking before metadata is ready.
        }
      },
      playDone: () => playXpAwardDeliveryDoneAudio(audioFactory),
    };
  } catch {
    // Browser autoplay failures are non-blocking for XP feedback.
    return null;
  }
}

export function playXpAwardDeliveryDoneAudio(audioFactory?: ClickAudioFactory): void {
  if (typeof window === "undefined" && !audioFactory) return;

  try {
    const doneAudio = createXpAwardAudio(XP_AWARD_DELIVERY_DONE_AUDIO_SRC, audioFactory);
    if (!doneAudio) return;
    doneAudio.currentTime = 0;
    const donePlayback = doneAudio.play();
    if (donePlayback && typeof donePlayback.catch === "function") donePlayback.catch(() => {});
  } catch {
    // Completion audio is optional.
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
