import { describe, expect, it, vi } from "vitest";
import {
  formatTimeGoalAwardText,
  getTimeGoalConfettiStage,
  getTimeGoalXpCountDurationMs,
  startTimeGoalConfetti,
  startTimeGoalXpCount,
  startTimeGoalXpSplash,
  startTimeGoalXpSplashAfterConfetti,
  stopTimeGoalConfetti,
  TIME_GOAL_CONFETTI_DURATION_MS,
  TIME_GOAL_XP_COUNT_MAX_DURATION_MS,
  TIME_GOAL_XP_COUNT_MIN_DURATION_MS,
  TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS,
} from "./time-goal-confetti";

function elementStub(opts?: { closest?: HTMLElement | null }) {
  const classes = new Set<string>();
  return {
    dataset: {} as Record<string, string>,
    textContent: "",
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
  it("formats the task complete award text", () => {
    expect(formatTimeGoalAwardText(12)).toBe("You got 12 XP!");
    expect(formatTimeGoalAwardText(-4)).toBe("You got 0 XP!");
  });

  it("scales xp count duration from one to three seconds by 50 XP", () => {
    expect(getTimeGoalXpCountDurationMs(0)).toBe(0);
    expect(getTimeGoalXpCountDurationMs(1)).toBe(TIME_GOAL_XP_COUNT_MIN_DURATION_MS + 40);
    expect(getTimeGoalXpCountDurationMs(25)).toBe(2000);
    expect(getTimeGoalXpCountDurationMs(50)).toBe(TIME_GOAL_XP_COUNT_MAX_DURATION_MS);
    expect(getTimeGoalXpCountDurationMs(120)).toBe(TIME_GOAL_XP_COUNT_MAX_DURATION_MS);
  });

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

  it("starts the xp count and settles on the final award value", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const frames: Array<(timestamp: number) => void> = [];

    expect(
      startTimeGoalXpCount(text, 12, {
        requestAnimationFrameFn: (handler) => {
          frames.push(handler);
          return frames.length;
        },
        cancelAnimationFrameFn: vi.fn(),
      })
    ).toBe(true);

    expect(text.textContent).toBe("You got 0 XP!");
    expect(fx.classList.contains("isCounting")).toBe(true);

    frames[0]?.(100);
    frames[1]?.(700);
    expect(text.textContent).not.toBe("You got 0 XP!");

    frames[2]?.(1580);

    expect(text.textContent).toBe("You got 12 XP!");
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.dataset.xpCountState).toBe("complete");
  });

  it("delays the xp count until the confetti and zoom splash finish", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    const scheduledDelays: number[] = [];
    const frames: Array<(timestamp: number) => void> = [];

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 10,
        setTimeoutFn: (handler, timeout) => {
          scheduledHandlers.push(handler);
          scheduledDelays.push(timeout);
          return scheduledHandlers.length;
        },
        requestAnimationFrameFn: (handler) => {
          frames.push(handler);
          return frames.length;
        },
      })
    ).toBe(true);

    expect(text.textContent).toBe("You got 0 XP!");
    expect(scheduledDelays).toEqual([TIME_GOAL_CONFETTI_DURATION_MS]);

    scheduledHandlers[0]?.();

    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(text.textContent).toBe("You got 0 XP!");
    expect(scheduledDelays).toEqual([TIME_GOAL_CONFETTI_DURATION_MS, TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS]);

    scheduledHandlers[1]?.();
    frames[0]?.(0);
    frames[1]?.(1400);

    expect(text.textContent).toBe("You got 10 XP!");
    expect(fx.classList.contains("isCounting")).toBe(false);
  });

  it("shows final xp immediately when reduced motion is enabled", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const onStart = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 9,
        setTimeoutFn: () => {
          throw new Error("unexpected timer");
        },
        matchMediaFn: () => ({ matches: true }),
        onStart,
      })
    ).toBe(true);

    expect(text.textContent).toBe("You got 9 XP!");
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("replaces an active xp count when a new count starts on the same text", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const frames: Array<(timestamp: number) => void> = [];
    const cancelAnimationFrameFn = vi.fn();

    startTimeGoalXpCount(text, 10, {
      requestAnimationFrameFn: (handler) => {
        frames.push(handler);
        return frames.length;
      },
      cancelAnimationFrameFn,
    });
    frames[0]?.(0);

    startTimeGoalXpCount(text, 20, {
      requestAnimationFrameFn: (handler) => {
        frames.push(handler);
        return frames.length;
      },
      cancelAnimationFrameFn,
    });

    expect(cancelAnimationFrameFn).toHaveBeenCalledTimes(1);
    expect(text.textContent).toBe("You got 0 XP!");

    frames[2]?.(0);
    frames[3]?.(1800);

    expect(text.textContent).toBe("You got 20 XP!");
    expect(fx.classList.contains("isCounting")).toBe(false);
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
