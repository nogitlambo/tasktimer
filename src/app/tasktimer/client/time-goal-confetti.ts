export const TIME_GOAL_CONFETTI_DURATION_MS = 2700;
export const TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS = 1050;
export const TIME_GOAL_XP_COUNT_SMALL_DURATION_MS = 500;
export const TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS = 1500;
export const TIME_GOAL_XP_COUNT_LARGE_DURATION_MS = 2000;
export const TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS = 2500;
export const TIME_GOAL_XP_CUE_DELAYS_MS = [
  TIME_GOAL_XP_COUNT_SMALL_DURATION_MS,
  TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS,
  TIME_GOAL_XP_COUNT_LARGE_DURATION_MS,
  TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS,
] as const;

type TimeoutFn = (handler: () => void, timeout: number) => unknown;
type ClearTimeoutFn = (handle: unknown) => void;
type AnimationFrameFn = (handler: (timestamp: number) => void) => unknown;
type CancelAnimationFrameFn = (handle: unknown) => void;

type XpCountAnimation = {
  timeoutHandle: unknown | null;
  timeoutHandles: unknown[];
  frameHandle: unknown | null;
  clearTimeoutFn: ClearTimeoutFn;
  cancelAnimationFrameFn: CancelAnimationFrameFn;
};

const xpCountAnimations = new WeakMap<HTMLElement, XpCountAnimation>();

function defaultSetTimeoutFn(handler: () => void, timeout: number) {
  return globalThis.setTimeout(handler, timeout);
}

function defaultClearTimeoutFn(handle: unknown) {
  globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
}

function defaultRequestAnimationFrameFn(handler: (timestamp: number) => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(handler);
  }
  return globalThis.setTimeout(() => handler(Date.now()), 16);
}

function defaultCancelAnimationFrameFn(handle: unknown) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && typeof handle === "number") {
    window.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
}

function cancelTimeGoalXpCount(text: HTMLElement, opts?: { preserveHoldClasses?: boolean }) {
  const active = xpCountAnimations.get(text);
  if (!active) return;
  if (active.timeoutHandle != null) active.clearTimeoutFn(active.timeoutHandle);
  active.timeoutHandles.forEach((handle) => active.clearTimeoutFn(handle));
  if (active.frameHandle != null) active.cancelAnimationFrameFn(active.frameHandle);
  xpCountAnimations.delete(text);
  if (!opts?.preserveHoldClasses) {
    const fx = (text.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text;
    fx.classList.remove("isCounting");
    fx.classList.remove("isPlaying");
  }
}

export function formatTimeGoalAwardText(xp: number): string {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  return safeXp > 0 ? `You got ${safeXp} XP!` : "No XP awarded";
}

export function formatTimeGoalAwardCountText(xp: number): string {
  return `You got ${Math.max(0, Math.floor(Number(xp) || 0))} XP!`;
}

export function getTimeGoalXpCountDurationMs(awardedXp: number): number {
  const xp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  if (xp <= 0) return 0;
  if (xp <= 10) return TIME_GOAL_XP_COUNT_SMALL_DURATION_MS;
  if (xp <= 25) return TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS;
  if (xp <= 50) return TIME_GOAL_XP_COUNT_LARGE_DURATION_MS;
  return TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS;
}

export function getTimeGoalXpCueDelaysMs(awardedXp: number): number[] {
  const durationMs = getTimeGoalXpCountDurationMs(awardedXp);
  if (durationMs <= 0) return [];
  return TIME_GOAL_XP_CUE_DELAYS_MS.filter((delayMs) => delayMs <= durationMs);
}

export function startTimeGoalConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return false;
  if (stage.dataset.confettiState === "playing") return false;
  stage.classList.remove("isPlaying");
  stage.dataset.confettiState = "stopped";
  void stage.offsetWidth;
  stage.classList.add("isPlaying");
  stage.dataset.confettiState = "playing";
  return true;
}

export function stopTimeGoalConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  stage.classList.remove("isPlaying");
  stage.dataset.confettiState = "stopped";
}

export function getTimeGoalConfettiStage(overlay: HTMLElement | null | undefined) {
  return (overlay?.querySelector("#timeGoalCompleteConfettiStage") as HTMLElement | null) || null;
}

export function startTimeGoalXpSplash(text: HTMLElement | null | undefined, opts?: { holdForCount?: boolean }) {
  const fx = (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
  if (!fx) return false;
  fx.classList.remove("isPlaying");
  fx.classList.remove("isCounting");
  fx.dataset.xpSplashState = "stopped";
  void fx.offsetWidth;
  if (opts?.holdForCount) fx.classList.add("isCounting");
  fx.classList.add("isPlaying");
  fx.dataset.xpSplashState = "playing";
  return true;
}

export function startTimeGoalXpIntervalSplash(text: HTMLElement | null | undefined) {
  const fx = (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
  if (!fx) return false;
  fx.classList.remove("isIntervalSplashing");
  void fx.offsetWidth;
  fx.classList.add("isIntervalSplashing");
  fx.dataset.xpIntervalSplashState = "playing";
  return true;
}

export function startTimeGoalXpCount(
  text: HTMLElement | null | undefined,
  awardedXp: number,
  opts?: {
    setTimeoutFn?: TimeoutFn;
    clearTimeoutFn?: ClearTimeoutFn;
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    preserveHeldSplash?: boolean;
    onIntervalCue?: (delayMs: number) => void;
  }
) {
  if (!text) return false;
  const targetXp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  cancelTimeGoalXpCount(text, { preserveHoldClasses: opts?.preserveHeldSplash });
  text.textContent = targetXp > 0 ? formatTimeGoalAwardCountText(0) : formatTimeGoalAwardText(0);
  const durationMs = getTimeGoalXpCountDurationMs(targetXp);
  if (durationMs <= 0) {
    text.textContent = formatTimeGoalAwardText(targetXp);
    return true;
  }

  const fx = (text.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text;
  const requestAnimationFrameFn = opts?.requestAnimationFrameFn || defaultRequestAnimationFrameFn;
  const setTimeoutFn = opts?.setTimeoutFn || defaultSetTimeoutFn;
  const cancelAnimationFrameFn = opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  let startMs: number | null = null;
  const firedCueDelays = new Set<number>();

  const active: XpCountAnimation = {
    timeoutHandle: null,
    timeoutHandles: [],
    frameHandle: null,
    clearTimeoutFn,
    cancelAnimationFrameFn,
  };
  xpCountAnimations.set(text, active);
  fx.classList.add("isCounting");
  fx.dataset.xpCountState = "playing";

  const fireIntervalCue = (delayMs: number) => {
    if (xpCountAnimations.get(text) !== active || firedCueDelays.has(delayMs)) return;
    firedCueDelays.add(delayMs);
    opts?.onIntervalCue?.(delayMs);
  };

  active.timeoutHandles = getTimeGoalXpCueDelaysMs(targetXp).map((delayMs) =>
    setTimeoutFn(() => {
      fireIntervalCue(delayMs);
    }, delayMs)
  );

  const finish = () => {
    if (xpCountAnimations.get(text) !== active) return;
    getTimeGoalXpCueDelaysMs(targetXp).forEach((delayMs) => fireIntervalCue(delayMs));
    active.timeoutHandles.forEach((handle) => clearTimeoutFn(handle));
    active.timeoutHandles = [];
    text.textContent = formatTimeGoalAwardText(targetXp);
    fx.classList.remove("isCounting");
    fx.classList.remove("isPlaying");
    fx.dataset.xpCountState = "complete";
    xpCountAnimations.delete(text);
  };

  const tick = (timestamp: number) => {
    if (xpCountAnimations.get(text) !== active) return;
    if (startMs == null) startMs = timestamp;
    const progress = Math.max(0, Math.min(1, (timestamp - startMs) / durationMs));
    text.textContent = formatTimeGoalAwardCountText(Math.round(targetXp * progress));
    if (progress >= 1) {
      finish();
      return;
    }
    active.frameHandle = requestAnimationFrameFn(tick);
  };

  active.frameHandle = requestAnimationFrameFn(tick);
  return true;
}

export function startTimeGoalXpSplashAfterConfetti(
  text: HTMLElement | null | undefined,
  opts?: {
    awardedXp?: number;
    delayMs?: number;
    setTimeoutFn?: TimeoutFn;
    clearTimeoutFn?: ClearTimeoutFn;
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    matchMediaFn?: (query: string) => { matches: boolean };
    onStart?: () => void;
    onIntervalCue?: (delayMs: number) => void;
  }
) {
  const fx = (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
  if (!fx) return false;
  const awardedXp = Math.max(0, Math.floor(Number(opts?.awardedXp) || 0));
  const delayMs = Math.max(0, Math.floor(Number(opts?.delayMs ?? TIME_GOAL_CONFETTI_DURATION_MS) || 0));
  const reducedMotion = !!opts?.matchMediaFn?.("(prefers-reduced-motion: reduce)")?.matches;
  const setTimeoutFn = opts?.setTimeoutFn || defaultSetTimeoutFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  if (text) cancelTimeGoalXpCount(text);
  if (awardedXp <= 0) {
    if (text) text.textContent = formatTimeGoalAwardText(0);
    return true;
  }
  if (text) text.textContent = formatTimeGoalAwardCountText(0);
  const startSplash = () => {
    if (reducedMotion) {
      if (text) text.textContent = formatTimeGoalAwardText(awardedXp);
      opts?.onStart?.();
      return true;
    }
    const started = startTimeGoalXpSplash(text, { holdForCount: awardedXp > 0 });
    if (started) opts?.onStart?.();
    if (started && text && awardedXp > 0) {
      const timeoutHandle = setTimeoutFn(() => {
        const active = xpCountAnimations.get(text);
        if (active) active.timeoutHandle = null;
        startTimeGoalXpCount(text, awardedXp, {
          clearTimeoutFn,
          requestAnimationFrameFn: opts?.requestAnimationFrameFn,
          cancelAnimationFrameFn: opts?.cancelAnimationFrameFn,
          preserveHeldSplash: true,
          onIntervalCue: opts?.onIntervalCue,
        });
      }, TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS);
      xpCountAnimations.set(text, {
        timeoutHandle,
        timeoutHandles: [],
        frameHandle: null,
        clearTimeoutFn,
        cancelAnimationFrameFn: opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn,
      });
    }
    return started;
  };
  if (reducedMotion || delayMs <= 0) return startSplash();
  setTimeoutFn(() => {
    startSplash();
  }, delayMs);
  return true;
}
