export const DELETE_ALERT_AUDIO_SRC = "/alert.mp3";

type AudioLike = {
  currentTime: number;
  preload?: string;
  play: () => Promise<unknown> | void;
};

type AudioFactory = (src: string) => AudioLike;

type DeleteAlertAudioOptions = {
  repeatCount?: number;
  repeatDelayMs?: number;
};

function playDeleteAlertAudioOnce(audioFactory?: AudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;

  try {
    const factory = audioFactory || ((src: string) => new Audio(src));
    const audio = factory(DELETE_ALERT_AUDIO_SRC);
    audio.preload = "auto";
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for destructive confirmation UI.
  }
}

export function playDeleteAlertAudio(audioFactory?: AudioFactory, options: DeleteAlertAudioOptions = {}) {
  if (typeof window === "undefined" && !audioFactory) return;

  const repeatCount = Math.max(1, Math.floor(options.repeatCount ?? 1));
  const repeatDelayMs = Math.max(0, Math.floor(options.repeatDelayMs ?? 100));

  playDeleteAlertAudioOnce(audioFactory);
  for (let index = 1; index < repeatCount; index += 1) {
    globalThis.setTimeout(() => playDeleteAlertAudioOnce(audioFactory), repeatDelayMs * index);
  }
}
