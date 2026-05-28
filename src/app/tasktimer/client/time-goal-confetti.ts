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
