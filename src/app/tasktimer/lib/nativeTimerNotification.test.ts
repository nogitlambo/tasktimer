import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeTimerNotificationModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  const showRunningTimer = vi.fn(async () => ({ notificationId: 1 }));
  const clearRunningTimer = vi.fn(async () => {});
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      showRunningTimer,
      clearRunningTimer,
    })),
  }));
  vi.stubGlobal("window", {});
  const mod = await import("./nativeTimerNotification");
  return { mod, showRunningTimer, clearRunningTimer };
}

describe("native timer notification bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows and clears running timer notifications on native Android", async () => {
    const { mod, showRunningTimer, clearRunningTimer } = await setupNativeTimerNotificationModule({
      native: true,
      platform: "android",
    });

    mod.setPendingRunningTimerSourceNotification("task-1", 42);
    await mod.showNativeRunningTimerNotification({
      taskId: "task-1",
      taskName: "Focus",
      startedAtMs: 1000,
      elapsedBeforeStartMs: 250,
    });
    await mod.clearNativeRunningTimerNotification("task-1");

    expect(showRunningTimer).toHaveBeenCalledWith({
      taskId: "task-1",
      taskName: "Focus",
      startedAtMs: 1000,
      elapsedBeforeStartMs: 250,
      sourceNotificationId: 42,
    });
    expect(clearRunningTimer).toHaveBeenCalledWith({ taskId: "task-1" });
  });

  it("no-ops outside native Android", async () => {
    const { mod, showRunningTimer, clearRunningTimer } = await setupNativeTimerNotificationModule({
      native: false,
      platform: "web",
    });

    mod.setPendingRunningTimerSourceNotification("task-1", 42);
    await mod.showNativeRunningTimerNotification({
      taskId: "task-1",
      taskName: "Focus",
      startedAtMs: 1000,
    });
    await mod.clearNativeRunningTimerNotification("task-1");

    expect(showRunningTimer).not.toHaveBeenCalled();
    expect(clearRunningTimer).not.toHaveBeenCalled();
  });
});
