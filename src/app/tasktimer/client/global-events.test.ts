import { describe, expect, it, vi } from "vitest";

import { registerTaskTimerWindowRuntimeEvents } from "./global-events";

function createWindowRuntimeHarness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const calls: string[] = [];
  const applyAppPage = vi.fn((page: string, opts?: unknown) => {
    calls.push(`apply:${page}:${JSON.stringify(opts || {})}`);
  });
  const maybeHandlePendingTaskJump = vi.fn(() => calls.push("jump"));
  const maybeHandlePendingPushAction = vi.fn(() => calls.push("action"));
  const maybeRestorePendingTimeGoalFlow = vi.fn(() => calls.push("restore"));
  const rehydrateFromCloudAndRender = vi.fn(async () => {
    calls.push("rehydrate");
  });

  registerTaskTimerWindowRuntimeEvents({
    on: (_target, event, handler) => {
      handlers.set(event, handler);
    },
    windowRef: {
      document: {
        visibilityState: "visible",
      },
    } as unknown as Window,
    runtimeDestroyed: () => false,
    pendingPushEvent: "tasktimer:pendingTaskJump",
    applyAppPage,
    maybeHandlePendingTaskJump,
    maybeHandlePendingPushAction,
    rehydrateFromCloudAndRender,
    maybeRestorePendingTimeGoalFlow,
    flushPendingCloudWrites: vi.fn(async () => {}),
  });

  return {
    calls,
    handlers,
    applyAppPage,
    maybeHandlePendingTaskJump,
    maybeHandlePendingPushAction,
    maybeRestorePendingTimeGoalFlow,
    rehydrateFromCloudAndRender,
  };
}

describe("registerTaskTimerWindowRuntimeEvents", () => {
  it("routes friend request push taps to the Friends page before rehydrating", async () => {
    const harness = createWindowRuntimeHarness();

    harness.handlers.get("tasktimer:pendingTaskJump")?.({ detail: { route: "/friends", taskId: "" } });
    await Promise.resolve();

    expect(harness.applyAppPage).toHaveBeenCalledWith("friends", { syncUrl: "replace" });
    expect(harness.rehydrateFromCloudAndRender).toHaveBeenCalledWith({ force: true });
    expect(harness.calls.slice(0, 4)).toEqual(["apply:friends:{\"syncUrl\":\"replace\"}", "jump", "action", "rehydrate"]);
    expect(harness.maybeRestorePendingTimeGoalFlow).toHaveBeenCalled();
  });

  it("keeps task push handling without route switching", async () => {
    const harness = createWindowRuntimeHarness();

    harness.handlers.get("tasktimer:pendingTaskJump")?.({ detail: { route: "/tasklaunch", taskId: "task-1" } });
    await Promise.resolve();

    expect(harness.applyAppPage).not.toHaveBeenCalled();
    expect(harness.maybeHandlePendingTaskJump).toHaveBeenCalledTimes(2);
    expect(harness.maybeHandlePendingPushAction).toHaveBeenCalledTimes(2);
    expect(harness.rehydrateFromCloudAndRender).toHaveBeenCalledWith({ force: true });
  });
});
