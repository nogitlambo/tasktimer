import { describe, expect, it, vi } from "vitest";
import {
  finishTimeGoalConfetti,
  formatTimeGoalAwardCountText,
  formatTimeGoalAwardText,
  formatTimeGoalXpAwardedText,
  getTimeGoalConfettiStage,
  getTimeGoalXpCueDelaysMs,
  getTimeGoalXpCountDurationMs,
  startTimeGoalConfetti,
  startTimeGoalXpCalculating,
  startTimeGoalXpCount,
  startTimeGoalXpIntervalSplash,
  startTimeGoalXpSplash,
  startTimeGoalXpSplashAfterConfetti,
  showStaticTimeGoalXpAward,
  stopTimeGoalConfetti,
  TIME_GOAL_CONFETTI_DURATION_MS,
  TIME_GOAL_XP_CALCULATING_TEXT,
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

function canvasStageStub(opts?: { canvas?: HTMLCanvasElement | null }) {
  const stage = elementStub() as HTMLElement & { querySelector: (selector: string) => HTMLCanvasElement | null };
  stage.querySelector = (selector: string) => (selector === ".timeGoalCompleteConfettiCanvas" ? opts?.canvas || null : null);
  return stage;
}

function canvasStub() {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    globalAlpha: 1,
    fillStyle: "",
  };
  const canvas = {
    clientWidth: 320,
    clientHeight: 240,
    height: 0,
    style: {} as CSSStyleDeclaration,
    width: 0,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    getContext: (contextType: string) => (contextType === "2d" ? context : null),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

describe("time goal confetti", () => {
  it("formats the task complete award text", () => {
    expect(formatTimeGoalAwardText(12)).toBe("You got 12 XP!");
    expect(formatTimeGoalAwardText(0)).toBe("No XP awarded");
    expect(formatTimeGoalAwardText(-4)).toBe("No XP awarded");
    expect(formatTimeGoalAwardText(Number.NaN)).toBe("No XP awarded");
    expect(formatTimeGoalAwardCountText(0)).toBe("You got 0 XP!");
    expect(formatTimeGoalXpAwardedText(12)).toBe("XP Awarded: 12");
    expect(formatTimeGoalXpAwardedText(-4)).toBe("XP Awarded: 0");
  });

  it("shows static awarded xp without count animation classes", () => {
    const fx = elementStub();
    fx.classList.add("isPlaying");
    fx.classList.add("isCounting");
    fx.classList.add("isIntervalSplashing");
    const text = elementStub({ closest: fx });

    expect(showStaticTimeGoalXpAward(text, 18)).toBe(true);

    expect(text.textContent).toBe("XP Awarded: 18");
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isIntervalSplashing")).toBe(false);
    expect(fx.dataset.xpCountState).toBe("static");
  });

  it("updates only the modal XP value child when present", () => {
    const value = elementStub();
    const text = {
      ...elementStub(),
      querySelector: (selector: string) => (selector === "#timeGoalCompleteXpValue" ? value : null),
    } as unknown as HTMLElement;

    expect(showStaticTimeGoalXpAward(text, 18)).toBe(true);

    expect(text.textContent).toBe("");
    expect(value.textContent).toBe("18");
  });

  it("uses tiered xp count durations", () => {
    expect(getTimeGoalXpCountDurationMs(0)).toBe(0);
    expect(getTimeGoalXpCountDurationMs(1)).toBe(500);
    expect(getTimeGoalXpCountDurationMs(10)).toBe(500);
    expect(getTimeGoalXpCountDurationMs(11)).toBe(1500);
    expect(getTimeGoalXpCountDurationMs(25)).toBe(1500);
    expect(getTimeGoalXpCountDurationMs(26)).toBe(2000);
    expect(getTimeGoalXpCountDurationMs(50)).toBe(2000);
    expect(getTimeGoalXpCountDurationMs(51)).toBe(2500);
    expect(getTimeGoalXpCountDurationMs(120)).toBe(2500);
  });

  it("returns xp count cue delays for each duration tier", () => {
    expect(getTimeGoalXpCueDelaysMs(0)).toEqual([]);
    expect(getTimeGoalXpCueDelaysMs(10)).toEqual([500]);
    expect(getTimeGoalXpCueDelaysMs(25)).toEqual([500, 1500]);
    expect(getTimeGoalXpCueDelaysMs(50)).toEqual([500, 1500, 2000]);
    expect(getTimeGoalXpCueDelaysMs(51)).toEqual([500, 1500, 2000, 2500]);
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

  it("starts canvas confetti when a canvas context is available", () => {
    const { canvas, context } = canvasStub();
    const stage = canvasStageStub({ canvas });
    const frames: Array<(timestamp: number) => void> = [];

    expect(
      startTimeGoalConfetti(stage, {
        requestAnimationFrameFn: (handler) => {
          frames.push(handler);
          return frames.length;
        },
      })
    ).toBe(true);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.classList.contains("hasCanvasConfetti")).toBe(true);
    expect(stage.dataset.confettiRenderer).toBe("canvas");
    expect(canvas.width).toBeGreaterThanOrEqual(320);
    expect(canvas.height).toBeGreaterThanOrEqual(240);
    expect(context.setTransform).toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    frames[0]?.(16);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 320, 240);
    expect(frames).toHaveLength(2);
  });

  it("stops canvas confetti and cancels the animation frame", () => {
    const { canvas, context } = canvasStub();
    const stage = canvasStageStub({ canvas });
    const cancelAnimationFrameFn = vi.fn();

    startTimeGoalConfetti(stage, {
      requestAnimationFrameFn: () => "frame-1",
      cancelAnimationFrameFn,
    });

    stopTimeGoalConfetti(stage);

    expect(cancelAnimationFrameFn).toHaveBeenCalledWith("frame-1");
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 320, 240);
    expect(stage.classList.contains("hasCanvasConfetti")).toBe(false);
    expect(stage.dataset.confettiRenderer).toBeUndefined();
    expect(stage.dataset.confettiState).toBe("stopped");
  });

  it("finishes canvas confetti without cancelling the active frame immediately", () => {
    const { canvas, context } = canvasStub();
    const stage = canvasStageStub({ canvas });
    const frames: Array<(timestamp: number) => void> = [];
    const cancelAnimationFrameFn = vi.fn();

    startTimeGoalConfetti(stage, {
      requestAnimationFrameFn: (handler) => {
        frames.push(handler);
        return frames.length;
      },
      cancelAnimationFrameFn,
    });

    expect(finishTimeGoalConfetti(stage)).toBe(true);

    expect(cancelAnimationFrameFn).not.toHaveBeenCalled();
    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.classList.contains("isFinishing")).toBe(true);
    expect(stage.dataset.confettiState).toBe("finishing");

    frames[0]?.(16);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 320, 240);
    expect(frames.length).toBeGreaterThan(1);
    expect(stage.classList.contains("isPlaying")).toBe(true);
  });

  it("removes canvas particles instead of recycling while finishing and cleans up when drained", () => {
    const { canvas, context } = canvasStub();
    const stage = canvasStageStub({ canvas });
    const frames: Array<(timestamp: number) => void> = [];
    const cancelAnimationFrameFn = vi.fn();

    startTimeGoalConfetti(stage, {
      requestAnimationFrameFn: (handler) => {
        frames.push(handler);
        return frames.length;
      },
      cancelAnimationFrameFn,
    });
    finishTimeGoalConfetti(stage);

    for (let index = 0; index < 220 && stage.dataset.confettiState !== "stopped"; index += 1) {
      frames[index]?.(index * 16);
    }

    expect(stage.dataset.confettiState).toBe("stopped");
    expect(stage.classList.contains("isPlaying")).toBe(false);
    expect(stage.classList.contains("hasCanvasConfetti")).toBe(false);
    expect(stage.classList.contains("isFinishing")).toBe(false);
    expect(stage.dataset.confettiRenderer).toBeUndefined();
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 320, 240);
  });

  it("falls back to DOM confetti when the canvas context is unavailable", () => {
    const stage = canvasStageStub({ canvas: null });

    expect(startTimeGoalConfetti(stage)).toBe(true);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.classList.contains("hasCanvasConfetti")).toBe(false);
    expect(stage.dataset.confettiRenderer).toBe("dom");
  });

  it("finishes DOM fallback confetti with delayed cleanup", () => {
    const stage = canvasStageStub({ canvas: null });
    const scheduledHandlers: Array<() => void> = [];
    const clearTimeoutFn = vi.fn();

    startTimeGoalConfetti(stage);

    expect(
      finishTimeGoalConfetti(stage, {
        setTimeoutFn: (handler) => {
          scheduledHandlers.push(handler);
          return "finish-timeout";
        },
        clearTimeoutFn,
      })
    ).toBe(true);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.classList.contains("isFinishing")).toBe(true);
    expect(stage.dataset.confettiState).toBe("finishing");
    expect(scheduledHandlers).toHaveLength(1);

    scheduledHandlers[0]?.();

    expect(clearTimeoutFn).toHaveBeenCalledWith("finish-timeout");
    expect(stage.classList.contains("isPlaying")).toBe(false);
    expect(stage.classList.contains("isFinishing")).toBe(false);
    expect(stage.dataset.confettiState).toBe("stopped");
    expect(stage.dataset.confettiRenderer).toBeUndefined();
  });

  it("hard-stops DOM fallback confetti and cancels delayed finish cleanup", () => {
    const stage = canvasStageStub({ canvas: null });
    const clearTimeoutFn = vi.fn();

    startTimeGoalConfetti(stage);
    finishTimeGoalConfetti(stage, {
      setTimeoutFn: () => "finish-timeout",
      clearTimeoutFn,
    });
    stopTimeGoalConfetti(stage);

    expect(clearTimeoutFn).toHaveBeenCalledWith("finish-timeout");
    expect(stage.classList.contains("isPlaying")).toBe(false);
    expect(stage.classList.contains("isFinishing")).toBe(false);
    expect(stage.dataset.confettiState).toBe("stopped");
  });

  it("keeps DOM fallback active when reduced motion prevents canvas startup", () => {
    const { canvas } = canvasStub();
    const stage = canvasStageStub({ canvas });

    expect(startTimeGoalConfetti(stage, { matchMediaFn: () => ({ matches: true }) })).toBe(true);

    expect(stage.classList.contains("isPlaying")).toBe(true);
    expect(stage.classList.contains("hasCanvasConfetti")).toBe(false);
    expect(stage.dataset.confettiRenderer).toBe("dom");
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

  it("restarts the interval text splash and gold shatter on the nearest xp fx wrapper", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });

    expect(startTimeGoalXpIntervalSplash(text)).toBe(true);

    expect(fx.classList.contains("isIntervalSplashing")).toBe(true);
    expect(fx.dataset.xpIntervalSplashState).toBe("playing");
    expect(text.classList.contains("isIntervalSplashing")).toBe(false);
  });

  it("delays the xp splash until the confetti animation finishes", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    let scheduledDelay = 0;
    const onStart = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 8,
        setTimeoutFn: (handler, timeout) => {
          scheduledHandlers.push(handler);
          scheduledDelay = timeout;
        },
        onStart,
      })
    ).toBe(true);

    expect(scheduledDelay).toBe(TIME_GOAL_CONFETTI_DURATION_MS);
    expect(text.textContent).toBe(TIME_GOAL_XP_CALCULATING_TEXT);
    expect(fx.classList.contains("isCalculating")).toBe(true);
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(onStart).not.toHaveBeenCalled();

    scheduledHandlers[0]?.();

    expect(fx.classList.contains("isCalculating")).toBe(false);
    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.dataset.xpSplashState).toBe("playing");
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("starts the xp count and settles on the final award value", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const frames: Array<(timestamp: number) => void> = [];
    const onFinish = vi.fn();
    startTimeGoalXpCalculating(text);
    const calculatingText = text.textContent;

    expect(
      startTimeGoalXpCount(text, 12, {
        requestAnimationFrameFn: (handler) => {
          frames.push(handler);
          return frames.length;
        },
        cancelAnimationFrameFn: vi.fn(),
        onFinish,
      })
    ).toBe(true);

    expect(calculatingText).toBe(TIME_GOAL_XP_CALCULATING_TEXT);
    expect(text.textContent).toBe("You got 0 XP!");
    expect(fx.classList.contains("isCalculating")).toBe(false);
    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.classList.contains("isCounting")).toBe(true);
    expect(fx.classList.contains("isCountComplete")).toBe(false);

    frames[0]?.(100);
    expect(text.textContent).toBe("You got 1 XP!");
    frames[1]?.(700);
    expect(text.textContent).not.toBe("You got 0 XP!");
    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.classList.contains("isCounting")).toBe(true);

    frames[2]?.(1600);

    expect(text.textContent).toBe("You got 12 XP!");
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isCountComplete")).toBe(true);
    expect(fx.dataset.xpCountState).toBe("complete");
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("delays the xp count until the confetti and zoom splash finish", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    const scheduledDelays: number[] = [];
    const frames: Array<(timestamp: number) => void> = [];

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 51,
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

    expect(text.textContent).toBe(TIME_GOAL_XP_CALCULATING_TEXT);
    expect(fx.classList.contains("isCalculating")).toBe(true);
    expect(scheduledDelays).toEqual([TIME_GOAL_CONFETTI_DURATION_MS]);

    scheduledHandlers[0]?.();

    expect(fx.classList.contains("isCalculating")).toBe(false);
    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.classList.contains("isCounting")).toBe(true);
    expect(text.textContent).toBe("You got 0 XP!");
    expect(scheduledDelays).toEqual([TIME_GOAL_CONFETTI_DURATION_MS]);

    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.classList.contains("isCounting")).toBe(true);
    frames[0]?.(0);
    frames[1]?.(1400);

    expect(text.textContent).not.toBe("You got 51 XP!");
    expect(fx.classList.contains("isPlaying")).toBe(true);
    expect(fx.classList.contains("isCounting")).toBe(true);

    frames[2]?.(2600);

    expect(text.textContent).toBe("You got 51 XP!");
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isCountComplete")).toBe(true);
  });

  it("schedules xp interval cues during the count phase", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    const scheduledDelays: number[] = [];
    const onIntervalCue = vi.fn();

    expect(
      startTimeGoalXpCount(text, 51, {
        setTimeoutFn: (handler, timeout) => {
          scheduledHandlers.push(handler);
          scheduledDelays.push(timeout);
          return scheduledHandlers.length;
        },
        requestAnimationFrameFn: () => 1,
        onIntervalCue,
      })
    ).toBe(true);

    expect(scheduledDelays).toEqual([500, 1500, 2000, 2500]);

    scheduledHandlers[0]?.();
    scheduledHandlers[3]?.();

    expect(onIntervalCue).toHaveBeenNthCalledWith(1, 500);
    expect(onIntervalCue).toHaveBeenNthCalledWith(2, 2500);
  });

  it("fires pending due xp interval cues before finishing a count", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const frames: Array<(timestamp: number) => void> = [];
    const onIntervalCue = vi.fn();

    startTimeGoalXpCount(text, 10, {
      setTimeoutFn: () => 1,
      clearTimeoutFn: vi.fn(),
      requestAnimationFrameFn: (handler) => {
        frames.push(handler);
        return frames.length;
      },
      onIntervalCue,
    });

    frames[0]?.(0);
    frames[1]?.(500);

    expect(text.textContent).toBe("You got 10 XP!");
    expect(onIntervalCue).toHaveBeenCalledWith(500);
  });

  it("does not start xp splash, count, timers, or reward audio for zero xp", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const scheduledHandlers: Array<() => void> = [];
    const scheduledDelays: number[] = [];
    const onStart = vi.fn();
    const onFinish = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 0,
        setTimeoutFn: (handler, timeout) => {
          scheduledHandlers.push(handler);
          scheduledDelays.push(timeout);
          return scheduledHandlers.length;
        },
        requestAnimationFrameFn: () => {
          throw new Error("unexpected frame");
        },
        onStart,
        onFinish,
      })
    ).toBe(true);

    expect(text.textContent).toBe(TIME_GOAL_XP_CALCULATING_TEXT);
    expect(fx.classList.contains("isCalculating")).toBe(true);
    expect(scheduledDelays).toEqual([TIME_GOAL_CONFETTI_DURATION_MS]);
    expect(onFinish).not.toHaveBeenCalled();

    scheduledHandlers[0]?.();

    expect(text.textContent).toBe("No XP awarded");
    expect(fx.classList.contains("isCalculating")).toBe(false);
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isCountComplete")).toBe(false);
    expect(fx.dataset.xpSplashState).toBeUndefined();
    expect(fx.dataset.xpCountState).toBeUndefined();
    expect(onStart).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows final xp immediately when reduced motion is enabled", () => {
    const fx = elementStub();
    fx.classList.add("isCountComplete");
    const text = elementStub({ closest: fx });
    const onStart = vi.fn();
    const onIntervalCue = vi.fn();
    const onFinish = vi.fn();

    expect(
      startTimeGoalXpSplashAfterConfetti(text, {
        awardedXp: 9,
        setTimeoutFn: () => {
          throw new Error("unexpected timer");
        },
        matchMediaFn: () => ({ matches: true }),
        onStart,
        onIntervalCue,
        onFinish,
      })
    ).toBe(true);

    expect(text.textContent).toBe("You got 9 XP!");
    expect(fx.classList.contains("isCalculating")).toBe(false);
    expect(fx.classList.contains("isPlaying")).toBe(false);
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isCountComplete")).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onIntervalCue).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("replaces an active xp count when a new count starts on the same text", () => {
    const fx = elementStub();
    const text = elementStub({ closest: fx });
    const frames: Array<(timestamp: number) => void> = [];
    const cancelAnimationFrameFn = vi.fn();
    const clearTimeoutFn = vi.fn();

    startTimeGoalXpCount(text, 10, {
      setTimeoutFn: () => "cue-timeout",
      clearTimeoutFn,
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
    expect(clearTimeoutFn).toHaveBeenCalledWith("cue-timeout");
    expect(text.textContent).toBe("You got 0 XP!");

    frames[2]?.(0);
    frames[3]?.(1800);

    expect(text.textContent).toBe("You got 20 XP!");
    expect(fx.classList.contains("isCounting")).toBe(false);
    expect(fx.classList.contains("isCountComplete")).toBe(true);
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
