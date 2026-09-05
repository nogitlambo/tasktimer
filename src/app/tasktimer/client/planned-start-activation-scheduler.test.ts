import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { createPlannedStartActivationScheduler } from "./planned-start-activation-scheduler";

function task(id: string, date: string, time: string): Task {
  return { id, name: id, plannedStartDate: date, plannedStartTime: time } as Task;
}

describe("planned start activation scheduler", () => {
  it("arms the earliest activation, fires, and rearms", async () => {
    let currentMs = new Date(2026, 8, 2, 9, 0).getTime();
    const tasks = [task("later", "2026-09-02", "11:00"), task("first", "2026-09-02", "10:00")];
    const timerRef: { handler?: () => void } = {};
    const onActivation = vi.fn();
    const scheduler = createPlannedStartActivationScheduler({
      getTasks: () => tasks,
      onActivation,
      nowMs: () => currentMs,
      setTimeoutRef: (nextHandler) => { timerRef.handler = nextHandler; return 7; },
      clearTimeoutRef: vi.fn(),
    });

    scheduler.sync();
    expect(timerRef.handler).toEqual(expect.any(Function));
    currentMs = new Date(2026, 8, 2, 10, 0).getTime();
    timerRef.handler?.();
    await Promise.resolve();

    expect(onActivation).toHaveBeenCalledTimes(1);
    expect(timerRef.handler).toEqual(expect.any(Function));
  });

  it("signals schedule changes after initial sync", () => {
    let tasks = [task("one", "2026-09-03", "10:00")];
    const onScheduleChanged = vi.fn();
    const scheduler = createPlannedStartActivationScheduler({
      getTasks: () => tasks,
      onActivation: vi.fn(),
      onScheduleChanged,
      nowMs: () => new Date(2026, 8, 2, 9, 0).getTime(),
      setTimeoutRef: vi.fn(() => 1),
      clearTimeoutRef: vi.fn(),
    });

    scheduler.sync();
    tasks = [task("one", "2026-09-04", "10:00")];
    scheduler.sync();

    expect(onScheduleChanged).toHaveBeenCalledTimes(1);
  });

  it("catches up after resume and clears its timer on destruction", async () => {
    let currentMs = new Date(2026, 8, 2, 9, 0).getTime();
    const clearTimeoutRef = vi.fn();
    const onActivation = vi.fn();
    const scheduler = createPlannedStartActivationScheduler({
      getTasks: () => [task("one", "2026-09-02", "10:00")],
      onActivation,
      nowMs: () => currentMs,
      setTimeoutRef: vi.fn(() => 42),
      clearTimeoutRef,
    });

    scheduler.sync();
    currentMs = new Date(2026, 8, 2, 10, 5).getTime();
    scheduler.handleResume();
    await Promise.resolve();
    scheduler.destroy();

    expect(onActivation).toHaveBeenCalledTimes(1);
    expect(clearTimeoutRef).toHaveBeenCalledWith(42);
  });
});
