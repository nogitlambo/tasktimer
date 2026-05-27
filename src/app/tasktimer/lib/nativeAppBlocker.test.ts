import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeAppBlockerModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  const getStatus = vi.fn(async () => ({
    supported: true,
    usageAccessGranted: true,
    overlayPermissionGranted: true,
    active: false,
  }));
  const startBlockingSession = vi.fn(async () => {});
  const stopBlockingSession = vi.fn(async () => {});
  const listLaunchableApps = vi.fn(async () => ({
    apps: [{ packageName: "com.example.app", label: "Example" }],
  }));
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      getStatus,
      openUsageAccessSettings: vi.fn(async () => {}),
      openOverlaySettings: vi.fn(async () => {}),
      listLaunchableApps,
      startBlockingSession,
      stopBlockingSession,
    })),
  }));
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
  const mod = await import("./nativeAppBlocker");
  return { mod, getStatus, startBlockingSession, stopBlockingSession, listLaunchableApps, storage };
}

describe("native app blocker bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes and stores blocked app packages locally", async () => {
    const { mod } = await setupNativeAppBlockerModule();

    mod.saveBlockedAndroidAppPackages("taskticker_tasks_v1", [" com.two ", "", "com.one", "com.two"]);
    expect(mod.loadBlockedAndroidAppPackages("taskticker_tasks_v1")).toEqual(["com.one", "com.two"]);
    expect(mod.toggleBlockedAndroidAppPackage("taskticker_tasks_v1", "com.one")).toEqual(["com.two"]);
  });

  it("no-ops outside native Android", async () => {
    const { mod, getStatus, startBlockingSession, stopBlockingSession } = await setupNativeAppBlockerModule({
      native: false,
      platform: "web",
    });

    mod.setAppBlockingEnabled("taskticker_tasks_v1", true);
    mod.saveBlockedAndroidAppPackages("taskticker_tasks_v1", ["com.example.app"]);
    const status = await mod.startNativeAppBlockingForFocusMode({
      storageKey: "taskticker_tasks_v1",
      taskId: "task-1",
      taskName: "Focus",
    });
    await mod.stopNativeAppBlockingForFocusMode();

    expect(status.supported).toBe(false);
    expect(getStatus).not.toHaveBeenCalled();
    expect(startBlockingSession).not.toHaveBeenCalled();
    expect(stopBlockingSession).not.toHaveBeenCalled();
  });

  it("starts a blocking session only when enabled, configured, and permitted", async () => {
    const { mod, startBlockingSession } = await setupNativeAppBlockerModule({
      native: true,
      platform: "android",
    });

    mod.setAppBlockingEnabled("taskticker_tasks_v1", true);
    mod.saveBlockedAndroidAppPackages("taskticker_tasks_v1", ["com.example.app"]);
    await mod.startNativeAppBlockingForFocusMode({
      storageKey: "taskticker_tasks_v1",
      taskId: "task-1",
      taskName: "Focus",
    });

    expect(startBlockingSession).toHaveBeenCalledWith({
      blockedPackages: ["com.example.app"],
      taskId: "task-1",
      taskName: "Focus",
    });
  });

  it("does not start when permissions are missing", async () => {
    const { mod, getStatus, startBlockingSession } = await setupNativeAppBlockerModule({
      native: true,
      platform: "android",
    });
    getStatus.mockResolvedValue({
      supported: true,
      usageAccessGranted: false,
      overlayPermissionGranted: true,
      active: false,
    });

    mod.setAppBlockingEnabled("taskticker_tasks_v1", true);
    mod.saveBlockedAndroidAppPackages("taskticker_tasks_v1", ["com.example.app"]);
    await mod.startNativeAppBlockingForFocusMode({
      storageKey: "taskticker_tasks_v1",
      taskId: "task-1",
      taskName: "Focus",
    });

    expect(startBlockingSession).not.toHaveBeenCalled();
  });
});
