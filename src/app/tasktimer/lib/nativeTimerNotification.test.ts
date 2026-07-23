import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TIMER_NOTIFICATION_CACHE_KEY = "__taskLaunchTimerNotificationPlugin";
const androidTimerNotificationPluginPath = resolve(
  process.cwd(),
  "android/app/src/main/java/com/tasklaunch/app/TaskLaunchTimerNotificationPlugin.java",
);
const androidCheckpointAlarmServicePath = resolve(
  process.cwd(),
  "android/app/src/main/java/com/tasklaunch/app/TaskLaunchCheckpointAlarmService.java",
);

function clearTimerNotificationPluginCache() {
  delete (globalThis as typeof globalThis & Record<string, unknown>)[TIMER_NOTIFICATION_CACHE_KEY];
}

async function setupNativeTimerNotificationModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  clearTimerNotificationPluginCache();
  const showRunningTimer = vi.fn(async () => ({ notificationId: 1 }));
  const clearRunningTimer = vi.fn(async () => {});
  const getAlarmPermissionStatus = vi.fn(async () => ({ exactAlarmGranted: true, notificationsGranted: true }));
  const openAlarmPermissionSettings = vi.fn(async () => {});
  const cancelCheckpointAlarms = vi.fn(async () => {});
  const syncCheckpointAlarms = vi.fn(async () => {});
  const dismissCheckpointAlarm = vi.fn(async () => {});
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      Plugins: {},
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      showRunningTimer,
      clearRunningTimer,
      getAlarmPermissionStatus,
      openAlarmPermissionSettings,
      cancelCheckpointAlarms,
      syncCheckpointAlarms,
      dismissCheckpointAlarm,
    })),
  }));
  vi.stubGlobal("window", {});
  const mod = await import("./nativeTimerNotification");
  return { mod, showRunningTimer, clearRunningTimer, cancelCheckpointAlarms, syncCheckpointAlarms };
}

describe("native timer notification bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTimerNotificationPluginCache();
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
      timeGoalTriggerAtMs: 10_000,
    });
    await mod.clearNativeRunningTimerNotification("task-1");

    expect(showRunningTimer).toHaveBeenCalledWith({
      taskId: "task-1",
      taskName: "Focus",
      startedAtMs: 1000,
      elapsedBeforeStartMs: 250,
      timeGoalTriggerAtMs: 10_000,
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

  it("omits invalid time-goal trigger values", async () => {
    const { mod, showRunningTimer } = await setupNativeTimerNotificationModule({
      native: true,
      platform: "android",
    });

    await mod.showNativeRunningTimerNotification({
      taskId: "task-1",
      taskName: "Focus",
      startedAtMs: 1000,
      timeGoalTriggerAtMs: 0,
    });

    expect(showRunningTimer).toHaveBeenCalledWith(expect.not.objectContaining({
      timeGoalTriggerAtMs: expect.anything(),
    }));
  });

  it("reuses an existing Capacitor plugin proxy across module reloads", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    clearTimerNotificationPluginCache();
    const pluginProxy = {
      showRunningTimer: vi.fn(async () => ({ notificationId: 1 })),
      clearRunningTimer: vi.fn(async () => {}),
      getAlarmPermissionStatus: vi.fn(async () => ({ exactAlarmGranted: true, notificationsGranted: true })),
      openAlarmPermissionSettings: vi.fn(async () => {}),
      syncCheckpointAlarms: vi.fn(async () => {}),
      cancelCheckpointAlarms: vi.fn(async () => {}),
      dismissCheckpointAlarm: vi.fn(async () => {}),
    };
    const capacitor = {
      Plugins: {} as Record<string, typeof pluginProxy>,
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };
    const registerPlugin = vi.fn(() => {
      capacitor.Plugins.TaskLaunchTimerNotification = pluginProxy;
      return pluginProxy;
    });
    vi.doMock("@capacitor/core", () => ({
      Capacitor: capacitor,
      registerPlugin,
    }));
    vi.stubGlobal("window", {});

    await import("./nativeTimerNotification");
    clearTimerNotificationPluginCache();
    vi.resetModules();
    await import("./nativeTimerNotification");

    expect(registerPlugin).toHaveBeenCalledTimes(1);
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

  it("keeps running timer notifications dismissible only by tap or swipe", () => {
    const source = readFileSync(androidTimerNotificationPluginPath, "utf8");
    const builderStart = source.indexOf("NotificationCompat.Builder builder = new NotificationCompat.Builder");
    const notifyCall = source.indexOf("NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());");
    expect(builderStart).toBeGreaterThan(-1);
    expect(notifyCall).toBeGreaterThan(builderStart);

    const builderSource = source.slice(builderStart, notifyCall);
    expect(builderSource).toContain(".setOngoing(false)");
    expect(builderSource).toContain(".setAutoCancel(true)");
    expect(builderSource).toContain(".setContentIntent(openPendingIntent)");
    expect(builderSource).not.toContain(".addAction(");
  });

  it("uses a packaged public asset for native checkpoint alarm playback", () => {
    const source = readFileSync(androidCheckpointAlarmServicePath, "utf8");
    const assetPaths = Array.from(source.matchAll(/getAssets\(\)\.openFd\("([^"]+)"\)/g))
      .map((match) => match[1])
      .filter(Boolean);

    expect(assetPaths).toContain("public/checkpoint.mp3");
    assetPaths.forEach((assetPath) => {
      expect(existsSync(resolve(process.cwd(), assetPath))).toBe(true);
    });
  });
});
