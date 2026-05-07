export function startTimeGoalConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  stage.classList.remove("isPlaying");
  stage.dataset.confettiState = "stopped";
  void stage.offsetWidth;
  stage.classList.add("isPlaying");
  stage.dataset.confettiState = "playing";
}

export function stopTimeGoalConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  stage.classList.remove("isPlaying");
  stage.dataset.confettiState = "stopped";
}

export function getTimeGoalConfettiStage(overlay: HTMLElement | null | undefined) {
  return (overlay?.querySelector("#timeGoalCompleteConfettiStage") as HTMLElement | null) || null;
}
