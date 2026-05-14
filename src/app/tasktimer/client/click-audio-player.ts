export type ClickAudioLike = {
  currentTime: number;
  preload?: string;
  readyState?: number;
  load?: () => void;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  play: () => Promise<unknown> | void;
};

export type ClickAudioFactory = (src: string) => ClickAudioLike;

export function createClickAudioPlayer(src: string, audioFactory?: ClickAudioFactory) {
  const pool: ClickAudioLike[] = [];
  let nextIndex = 0;
  let warmedFactoryAudio: ClickAudioLike | null = null;
  const readyAudios = new WeakSet<ClickAudioLike>();
  const waiters = new Set<(status: "played" | "timed_out" | "unavailable") => void>();

  function markReady(audio: ClickAudioLike) {
    readyAudios.add(audio);
    if (!waiters.size) return;
    for (const resolve of Array.from(waiters)) resolve("played");
    waiters.clear();
  }

  function isAudioReady(audio: ClickAudioLike | null | undefined) {
    if (!audio) return false;
    if (readyAudios.has(audio)) return true;
    const readyState = Number(audio.readyState || 0);
    return Number.isFinite(readyState) && readyState >= 2;
  }

  function createAudio() {
    const factory = audioFactory || ((audioSrc: string) => new Audio(audioSrc));
    const audio = factory(src);
    audio.preload = "auto";
    if (isAudioReady(audio)) {
      markReady(audio);
    } else {
      const onReady = () => {
        audio.removeEventListener?.("canplay", onReady);
        audio.removeEventListener?.("canplaythrough", onReady);
        audio.removeEventListener?.("loadeddata", onReady);
        markReady(audio);
      };
      audio.addEventListener?.("canplay", onReady);
      audio.addEventListener?.("canplaythrough", onReady);
      audio.addEventListener?.("loadeddata", onReady);
    }
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

  function getOrCreateWarmAudio() {
    if (!audioFactory) return null;
    if (warmedFactoryAudio) return warmedFactoryAudio;
    warmedFactoryAudio = createAudio();
    return warmedFactoryAudio;
  }

  return {
    warm() {
      try {
        if (audioFactory) {
          getOrCreateWarmAudio();
          return;
        }
        getAudio();
      } catch {
        // Audio feedback is optional.
      }
    },
    isReady() {
      try {
        if (audioFactory) return isAudioReady(getOrCreateWarmAudio());
        if (!pool.length) getAudio();
        return pool.some((audio) => isAudioReady(audio));
      } catch {
        return false;
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
    playWhenReady(timeoutMs: number) {
      try {
        const readyAudio = audioFactory
          ? getOrCreateWarmAudio()
          : (!pool.length ? getAudio() : null, pool.find((audio) => isAudioReady(audio)));
        if (readyAudio && isAudioReady(readyAudio)) {
          readyAudio.currentTime = 0;
          const playback = readyAudio.play();
          if (playback && typeof playback.catch === "function") playback.catch(() => {});
          return Promise.resolve<"played" | "timed_out" | "unavailable">("played");
        }
        if (!audioFactory && !pool.length) return Promise.resolve<"played" | "timed_out" | "unavailable">("unavailable");
        if (audioFactory && !warmedFactoryAudio) return Promise.resolve<"played" | "timed_out" | "unavailable">("unavailable");
      } catch {
        return Promise.resolve<"played" | "timed_out" | "unavailable">("unavailable");
      }

      return new Promise<"played" | "timed_out" | "unavailable">((resolve) => {
        let settled = false;
        const finish = (status: "played" | "timed_out" | "unavailable") => {
          if (settled) return;
          settled = true;
          waiters.delete(onReady);
          if (timeoutId != null) window.clearTimeout(timeoutId);
          resolve(status);
        };
        const onReady = (status: "played" | "timed_out" | "unavailable") => {
          const readyAudio = audioFactory
            ? warmedFactoryAudio
            : pool.find((audio) => isAudioReady(audio));
          if (!readyAudio) {
            finish(status);
            return;
          }
          try {
            readyAudio.currentTime = 0;
            const playback = readyAudio.play();
            if (playback && typeof playback.catch === "function") playback.catch(() => {});
          } catch {
            // Playback remains best-effort after readiness.
          }
          finish("played");
        };
        waiters.add(onReady);
        const timeoutId =
          typeof window !== "undefined"
            ? window.setTimeout(() => finish("timed_out"), Math.max(0, Math.floor(Number(timeoutMs) || 0)))
            : null;
      });
    },
  };
}
