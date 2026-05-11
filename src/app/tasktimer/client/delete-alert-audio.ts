export const DELETE_ALERT_AUDIO_SRC = "/alert.mp3";

type AudioLike = {
  currentTime: number;
  preload?: string;
  play: () => Promise<unknown> | void;
};

type AudioFactory = (src: string) => AudioLike;

export function playDeleteAlertAudio(audioFactory?: AudioFactory) {
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
