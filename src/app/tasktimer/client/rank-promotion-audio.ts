export const RANK_PROMOTION_TIMING = {
  dimDurationMs: 1000,
  modalRevealDurationMs: 280,
  impactAudioLeadMs: 1000,
  drumsSmashMarkMs: 3500,
  impactBoomTwoDelayMs: 1200,
  labelSmashRevealDelayMs: 2900,
  bloomHoldMs: 100,
  settleMs: 3300,
  completeSpinDurationMs: 8000,
  drumsAfterIntroStartDelayMs: 1200,
  drumsFadeInMs: 2000,
} as const;

export const RANK_PROMOTION_SMASH_PHASE_START_MS =
  RANK_PROMOTION_TIMING.dimDurationMs + RANK_PROMOTION_TIMING.modalRevealDurationMs;
export const RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS =
  RANK_PROMOTION_TIMING.completeSpinDurationMs / 4;
export const RANK_PROMOTION_SMASH_DURATION_MS =
  RANK_PROMOTION_TIMING.impactAudioLeadMs +
  RANK_PROMOTION_TIMING.bloomHoldMs +
  RANK_PROMOTION_TIMING.settleMs;

export const RANK_PROMOTION_AUDIO_SRC = {
  intro: "/rank_up.mp3",
  boomTwo: "/promotion_boom2.mp3",
  bassDrive: "/promotion_bass_drive.mp3",
  labelImpact: "/promotion_impact.mp3",
  hit: "/promotion_hit.mp3",
  drums: "/promotion_drums.mp3",
} as const;

const RANK_PROMOTION_DRUMS_START_VOLUME = 0.1;
const RANK_PROMOTION_DRUMS_END_VOLUME = 0.8;

export type RankPromotionAudioLike = {
  currentTime: number;
  playbackRate?: number;
  preload?: string;
  volume: number;
  load?: () => void;
  pause?: () => void;
  play: () => Promise<unknown> | void;
  addEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean,
  ) => void;
};

export type RankPromotionAudioFactory = (src: string) => RankPromotionAudioLike;

type RankPromotionAudioControllerOptions = {
  audioFactory?: RankPromotionAudioFactory;
};

export type RankPromotionAudioController = {
  startSmashCues: () => void;
  startHitCue: () => void;
  dispose: () => void;
  getActiveAudioCount: () => number;
};

export function createRankPromotionAudioController(
  options: RankPromotionAudioControllerOptions = {},
): RankPromotionAudioController {
  const audioFactory =
    options.audioFactory ||
    ((src: string) => {
      if (typeof Audio === "undefined") {
        throw new Error("Audio is unavailable");
      }
      return new Audio(src);
    });

  const activeAudios = new Set<RankPromotionAudioLike>();
  const cleanupByAudio = new WeakMap<RankPromotionAudioLike, () => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const animationFrames = new Set<number>();
  let disposed = false;
  let drumsStarted = false;

  const clearTimer = (timer: ReturnType<typeof setTimeout>) => {
    timers.delete(timer);
    clearTimeout(timer);
  };

  const setTimer = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      clearTimer(timer);
      callback();
    }, delayMs);
    timers.add(timer);
    return timer;
  };

  const requestFrame = (callback: FrameRequestCallback) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return 0;
    const frame = window.requestAnimationFrame((now) => {
      animationFrames.delete(frame);
      callback(now);
    });
    animationFrames.add(frame);
    return frame;
  };

  const cancelFrame = (frame: number) => {
    if (!frame) return;
    animationFrames.delete(frame);
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(frame);
    }
  };

  const releaseAudio = (audio: RankPromotionAudioLike) => {
    cleanupByAudio.get(audio)?.();
    cleanupByAudio.delete(audio);
    activeAudios.delete(audio);
  };

  const createRetainedAudio = (src: string, playbackRate = 1, volume = 1) => {
    if (disposed) return null;
    try {
      const audio = audioFactory(src);
      audio.preload = "auto";
      audio.playbackRate = playbackRate;
      audio.volume = volume;
      audio.currentTime = 0;

      const onDone = () => releaseAudio(audio);
      audio.addEventListener?.("ended", onDone, { once: true });
      audio.addEventListener?.("error", onDone, { once: true });
      cleanupByAudio.set(audio, () => {
        audio.removeEventListener?.("ended", onDone);
        audio.removeEventListener?.("error", onDone);
      });
      activeAudios.add(audio);

      try {
        audio.load?.();
      } catch {
        // Preload support varies; playback remains best-effort.
      }

      return audio;
    } catch {
      return null;
    }
  };

  const playAudio = (src: string, playbackRate = 1, volume = 1) => {
    const audio = createRetainedAudio(src, playbackRate, volume);
    if (!audio) return null;
    try {
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") playback.catch(() => {});
    } catch {
      releaseAudio(audio);
      return null;
    }
    return audio;
  };

  const playAudioFadeIn = (src: string, startVolume: number, endVolume: number, durationMs: number) => {
    const audio = playAudio(src, 1, startVolume);
    if (!audio) return null;

    const startTime =
      typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const step = (now: number) => {
      if (disposed || !activeAudios.has(audio)) return;
      const progress = Math.min(1, (now - startTime) / durationMs);
      audio.volume = startVolume + (endVolume - startVolume) * progress;
      if (progress < 1) requestFrame(step);
    };
    requestFrame(step);
    return audio;
  };

  const startDrums = () => {
    if (disposed || drumsStarted) return;
    drumsStarted = true;
    playAudioFadeIn(
      RANK_PROMOTION_AUDIO_SRC.drums,
      RANK_PROMOTION_DRUMS_START_VOLUME,
      RANK_PROMOTION_DRUMS_END_VOLUME,
      RANK_PROMOTION_TIMING.drumsFadeInMs,
    );
  };

  playAudio(RANK_PROMOTION_AUDIO_SRC.intro);
  setTimer(startDrums, RANK_PROMOTION_TIMING.drumsAfterIntroStartDelayMs);

  return {
    startSmashCues() {
      if (disposed) return;
      playAudio(RANK_PROMOTION_AUDIO_SRC.bassDrive);
      setTimer(() => {
        playAudio(RANK_PROMOTION_AUDIO_SRC.boomTwo);
      }, RANK_PROMOTION_TIMING.impactBoomTwoDelayMs);
      setTimer(() => {
        playAudio(RANK_PROMOTION_AUDIO_SRC.labelImpact);
      }, RANK_PROMOTION_TIMING.labelSmashRevealDelayMs);
    },
    startHitCue() {
      if (disposed) return;
      playAudio(RANK_PROMOTION_AUDIO_SRC.hit);
    },
    dispose() {
      disposed = true;
      for (const timer of Array.from(timers)) clearTimer(timer);
      for (const frame of Array.from(animationFrames)) cancelFrame(frame);
      for (const audio of Array.from(activeAudios)) {
        try {
          audio.pause?.();
        } catch {
          // Promotion audio cleanup is best-effort.
        }
        releaseAudio(audio);
      }
    },
    getActiveAudioCount() {
      return activeAudios.size;
    },
  };
}
