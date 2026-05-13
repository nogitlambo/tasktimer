export type ClickAudioLike = {
  currentTime: number;
  preload?: string;
  load?: () => void;
  play: () => Promise<unknown> | void;
};

export type ClickAudioFactory = (src: string) => ClickAudioLike;

export function createClickAudioPlayer(src: string, audioFactory?: ClickAudioFactory) {
  const pool: ClickAudioLike[] = [];
  let nextIndex = 0;

  function createAudio() {
    const factory = audioFactory || ((audioSrc: string) => new Audio(audioSrc));
    const audio = factory(src);
    audio.preload = "auto";
    try {
      audio.load?.();
    } catch {
      // Preload support varies; playback remains best-effort.
    }
    return audio;
  }

  function getAudio() {
    if (audioFactory) return createAudio();
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;
    if (!pool.length) {
      pool.push(createAudio(), createAudio(), createAudio());
    }
    const audio = pool[nextIndex] || null;
    nextIndex = (nextIndex + 1) % pool.length;
    return audio;
  }

  return {
    warm() {
      try {
        getAudio();
      } catch {
        // Audio feedback is optional.
      }
    },
    play() {
      try {
        const audio = getAudio();
        if (!audio) return;
        audio.currentTime = 0;
        const playback = audio.play();
        if (playback && typeof playback.catch === "function") playback.catch(() => {});
      } catch {
        // Browser autoplay failures are non-blocking for click feedback.
      }
    },
  };
}
