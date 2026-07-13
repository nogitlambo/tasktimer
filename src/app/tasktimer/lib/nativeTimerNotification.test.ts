import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeTimerNotificationModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  const showRunningTimer = vi.fn(async () => ({ notificationId: 1 }));
  const clearRunningTimer = vi.fn(async () => {});
  const cancelCheckpointAlarms = vi.fn(async () => {});
  const syncCheckpointAlarms = vi.fn(async () => {});
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      showRunningTimer,
      clearRunningTimer,
      cancelCheckpointAlarms,
      syncCheckpointAlarms,
    })),
  }));
  vi.stubGlobal("window", {});
  const mod = await import("./nativeTimerNotification");
  return { mod, showRunningTimer, clearRunningTimer, cancelCheckpointAlarms, syncCheckpointAlarms };
}

describe("native timer notification bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows and clears running timer notifications on native Android", async () => {
    const { mod, showRunningTimer, clearRunningTimer, cancelCheckpointAlarms } = await setupNativeTimerNotificationModule({
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
    expect(cancelCheckpointAlarms).toHaveBeenCalledWith({ taskId: "task-1" });
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

  it("preserves independent sound and vibration flags for Android checkpoint alarms", async () => {
    const { mod, syncCheckpointAlarms } = await setupNativeTimerNotificationModule({ native: true, platform: "android" });
    const nowMs = Date.now();

    await mod.syncNativeCheckpointAlarms([{
      taskId: "task-1",
      taskName: "Focus",
      checkpointKey: "600",
      checkpointLabel: "10m checkpoint",
      triggerAtMs: nowMs + 60_000,
      soundMode: "once",
      soundEnabled: false,
      vibrationEnabled: true,
    }]);

    expect(syncCheckpointAlarms).toHaveBeenCalledWith({
      alarms: [expect.objectContaining({ soundEnabled: false, vibrationEnabled: true })],
    });
  });
});
