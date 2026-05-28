import { describe, expect, it, vi } from "vitest";
import {
  getTimeGoalConfettiStage,
  startTimeGoalConfetti,
  startTimeGoalXpSplash,
  startTimeGoalXpSplashAfterConfetti,
  stopTimeGoalConfetti,
  TIME_GOAL_CONFETTI_DURATION_MS,
} from "./time-goal-confetti";

function elementStub(opts?: { closest?: HTMLElement | null }) {
  const classes = new Set<string>();
  return {
    dataset: {} as Record<string, string>,
    offsetWidth: 1,
    closest: () => opts?.closest || null,
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

    expect(startTimeGoalConfetti(stage)).toBe(true);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.dataset.confettiState).toBe("playing");
  });

  it("does not restart an already playing confetti stage", () => {
    const stage = elementStub();
    stage.classList.add("isPlaying");
    stage.dataset.confettiState = "playing";
    Object.defineProperty(stage, "offsetWidth", { value: 0, configurable: true });

    expect(startTimeGoalConfetti(stage)).toBe(false);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.dataset.confettiState).toBe("playing");
    expect(stage.offsetWidth).toBe(0);
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

  it("restarts the xp splash on the nearest xp fx wrapper", () => {
    const fx = elementStub();
    fx.classList.add("isPlaying");
    fx.dataset.xpSplashState = "playing";
    const text = elementStub({ closest: fx });

    expect(startTimeGoalXpSplash(text)).toBe(true);

    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.dataset.xpSplashState).toBe("playing");
    expect(text.classList.contains("isPlaying")).toBe(false);
  });

  it("falls back to the xp text element when no wrapper exists", () => {
    const text = elementStub();

    expect(startTimeGoalXpSplash(text)).toBe(true);

    expect(text.classList.contains("isPlaying")).toBe(true);
    expect(text.dataset.xpSplashState).toBe("playing");
  });

  it("delays the xp splash until the confetti animation finishes", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    let scheduledDelay = 0;
    const onStart = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        setTimeoutFn: (handler, timeout) => {
          scheduledHandlers.push(handler);
          scheduledDelay = timeout;
        },
        onStart,
      })
    ).toBe(true);

    expect(scheduledDelay).toBe(TIME_GOAL_CONFETTI_DURATION_MS);
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(onStart).not.toHaveBeenCalled();

    scheduledHandlers[0]?.();

    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.dataset.xpSplashState).toBe("playing");
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("starts the xp splash immediately when reduced motion is enabled", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const onStart = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        setTimeoutFn: () => {
          throw new Error("unexpected timer");
        },
        matchMediaFn: () => ({ matches: true }),
        onStart,
      })
    ).toBe(true);

    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.dataset.xpSplashState).toBe("playing");
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("does not schedule an xp splash without a target", () => {
    expect(
      startTimeGoalXpSplashAfterConfetti(null, {
        setTimeoutFn: () => {
          throw new Error("unexpected timer");
        },
      })
    ).toBe(false);
  });
});
