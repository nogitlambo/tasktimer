export const TIME_GOAL_CONFETTI_DURATION_MS = 2700;
export const TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS = 1050;
export const TIME_GOAL_XP_COUNT_MIN_DURATION_MS = 1000;
export const TIME_GOAL_XP_COUNT_MAX_DURATION_MS = 3000;
export const TIME_GOAL_XP_COUNT_MAX_DURATION_AWARD = 50;

type TimeoutFn = (handler: () => void, timeout: number) => unknown;
type ClearTimeoutFn = (handle: unknown) => void;
type AnimationFrameFn = (handler: (timestamp: number) => void) => unknown;
type CancelAnimationFrameFn = (handle: unknown) => void;

type XpCountAnimation = {
  timeoutHandle: unknown | null;
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

function cancelTimeGoalXpCount(text: HTMLElement) {
  const active = xpCountAnimations.get(text);
  if (!active) return;
  if (active.timeoutHandle != null) active.clearTimeoutFn(active.timeoutHandle);
  if (active.frameHandle != null) active.cancelAnimationFrameFn(active.frameHandle);
  xpCountAnimations.delete(text);
  ((text.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text).classList.remove("isCounting");
}

export function formatTimeGoalAwardText(xp: number): string {
  return `You got ${Math.max(0, Math.floor(Number(xp) || 0))} XP!`;
}

export function getTimeGoalXpCountDurationMs(awardedXp: number): number {
  const xp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  if (xp <= 0) return 0;
  const ratio = Math.min(xp, TIME_GOAL_XP_COUNT_MAX_DURATION_AWARD) / TIME_GOAL_XP_COUNT_MAX_DURATION_AWARD;
  return Math.round(TIME_GOAL_XP_COUNT_MIN_DURATION_MS + ratio * (TIME_GOAL_XP_COUNT_MAX_DURATION_MS - TIME_GOAL_XP_COUNT_MIN_DURATION_MS));
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

export function startTimeGoalXpSplash(text: HTMLElement | null | undefined) {
  const fx = (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
  if (!fx) return false;
  fx.classList.remove("isPlaying");
  fx.classList.remove("isCounting");
  fx.dataset.xpSplashState = "stopped";
  void fx.offsetWidth;
  fx.classList.add("isPlaying");
  fx.dataset.xpSplashState = "playing";
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
  }
) {
  if (!text) return false;
  const targetXp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  cancelTimeGoalXpCount(text);
  text.textContent = formatTimeGoalAwardText(0);
  const durationMs = getTimeGoalXpCountDurationMs(targetXp);
  if (durationMs <= 0) {
    text.textContent = formatTimeGoalAwardText(targetXp);
    return true;
  }

  const fx = (text.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text;
  const requestAnimationFrameFn = opts?.requestAnimationFrameFn || defaultRequestAnimationFrameFn;
  const cancelAnimationFrameFn = opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  let startMs: number | null = null;

  const active: XpCountAnimation = {
    timeoutHandle: null,
    frameHandle: null,
    clearTimeoutFn,
    cancelAnimationFrameFn,
  };
  xpCountAnimations.set(text, active);
  fx.classList.add("isCounting");
  fx.dataset.xpCountState = "playing";

  const finish = () => {
    if (xpCountAnimations.get(text) !== active) return;
    text.textContent = formatTimeGoalAwardText(targetXp);
    fx.classList.remove("isCounting");
    fx.dataset.xpCountState = "complete";
    xpCountAnimations.delete(text);
  };

  const tick = (timestamp: number) => {
    if (xpCountAnimations.get(text) !== active) return;
    if (startMs == null) startMs = timestamp;
    const progress = Math.max(0, Math.min(1, (timestamp - startMs) / durationMs));
    text.textContent = formatTimeGoalAwardText(Math.round(targetXp * progress));
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
  if (text && awardedXp > 0) text.textContent = formatTimeGoalAwardText(0);
  const startSplash = () => {
    if (reducedMotion) {
      if (text) text.textContent = formatTimeGoalAwardText(awardedXp);
      opts?.onStart?.();
      return true;
    }
    const started = startTimeGoalXpSplash(text);
    if (started) opts?.onStart?.();
    if (started && text && awardedXp > 0) {
      const timeoutHandle = setTimeoutFn(() => {
        const active = xpCountAnimations.get(text);
        if (active) active.timeoutHandle = null;
        startTimeGoalXpCount(text, awardedXp, {
          clearTimeoutFn,
          requestAnimationFrameFn: opts?.requestAnimationFrameFn,
          cancelAnimationFrameFn: opts?.cancelAnimationFrameFn,
        });
      }, TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS);
      xpCountAnimations.set(text, {
        timeoutHandle,
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
