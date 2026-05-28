export const TIME_GOAL_CONFETTI_DURATION_MS = 2700;

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
  fx.dataset.xpSplashState = "stopped";
  void fx.offsetWidth;
  fx.classList.add("isPlaying");
  fx.dataset.xpSplashState = "playing";
  return true;
}

export function startTimeGoalXpSplashAfterConfetti(
  text: HTMLElement | null | undefined,
  opts?: {
    delayMs?: number;
    setTimeoutFn?: (handler: () => void, timeout: number) => unknown;
    matchMediaFn?: (query: string) => { matches: boolean };
    onStart?: () => void;
  }
) {
  const fx = (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
  if (!fx) return false;
  const delayMs = Math.max(0, Math.floor(Number(opts?.delayMs ?? TIME_GOAL_CONFETTI_DURATION_MS) || 0));
  const reducedMotion = !!opts?.matchMediaFn?.("(prefers-reduced-motion: reduce)")?.matches;
  const startSplash = () => {
    const started = startTimeGoalXpSplash(text);
    if (started) opts?.onStart?.();
    return started;
  };
  if (reducedMotion || delayMs <= 0) return startSplash();
  const setTimeoutFn = opts?.setTimeoutFn || globalThis.setTimeout;
  setTimeoutFn(() => {
    startSplash();
  }, delayMs);
  return true;
}
