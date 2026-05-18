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
