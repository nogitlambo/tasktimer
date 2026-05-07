import { describe, expect, it } from "vitest";
import { getTimeGoalConfettiStage, startTimeGoalConfetti, stopTimeGoalConfetti } from "./time-goal-confetti";

function elementStub() {
  const classes = new Set<string>();
  return {
    dataset: {} as Record<string, string>,
    offsetWidth: 1,
    classList: {
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
      contains: (className: string) => classes.has(className),
    },
  } as unknown as HTMLElement;
}

describe("time goal confetti", () => {
  it("starts the confetti stage", () => {
    const stage = elementStub();

    startTimeGoalConfetti(stage);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.dataset.confettiState).toBe("playing");
  });

  it("restarts an already playing confetti stage", () => {
    const stage = elementStub();
    stage.classList.add("isPlaying");
    stage.dataset.confettiState = "playing";

    startTimeGoalConfetti(stage);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.dataset.confettiState).toBe("playing");
  });

  it("stops the confetti stage", () => {
    const stage = elementStub();
    stage.classList.add("isPlaying");
    stage.dataset.confettiState = "playing";

    stopTimeGoalConfetti(stage);

    expect(stage.classList.contains("isPlaying")).toBe(false);
    expect(stage.dataset.confettiState).toBe("stopped");
  });

  it("finds the confetti stage within the task complete overlay", () => {
    const stage = elementStub();
    const overlay = {
      querySelector: (selector: string) => (selector === "#timeGoalCompleteConfettiStage" ? stage : null),
    } as unknown as HTMLElement;

    expect(getTimeGoalConfettiStage(overlay)).toBe(stage);
  });
});
