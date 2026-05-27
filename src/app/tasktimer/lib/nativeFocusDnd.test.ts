import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeFocusDndModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  const getDndStatus = vi.fn(async () => ({
    supported: true,
    policyAccessGranted: true,
    active: false,
    interruptionFilter: "all",
  }));
  const openDndAccessSettings = vi.fn(async () => {});
  const startFocusDndSession = vi.fn(async () => {});
  const stopFocusDndSession = vi.fn(async () => {});
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      getDndStatus,
      openDndAccessSettings,
      startFocusDndSession,
      stopFocusDndSession,
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
  const mod = await import("./nativeFocusDnd");
  return { mod, getDndStatus, openDndAccessSettings, startFocusDndSession, stopFocusDndSession, storage };
}

describe("native focus DND bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the Focus DND toggle locally", async () => {
    const { mod, storage } = await setupNativeFocusDndModule();

    mod.setFocusDndEnabled("taskticker_tasks_v1", true);

    expect(mod.getFocusDndEnabled("taskticker_tasks_v1")).toBe(true);
    expect(storage.get("taskticker_tasks_v1:focusDndEnabled")).toBe("true");
  });

  it("no-ops outside native Android", async () => {
    const { mod, getDndStatus, startFocusDndSession, stopFocusDndSession } = await setupNativeFocusDndModule({
      native: false,
      platform: "web",
    });

    mod.setFocusDndEnabled("taskticker_tasks_v1", true);
    const status = await mod.startNativeFocusDndSession({ storageKey: "taskticker_tasks_v1" });
    await mod.stopNativeFocusDndSession();

    expect(status.supported).toBe(false);
    expect(getDndStatus).not.toHaveBeenCalled();
    expect(startFocusDndSession).not.toHaveBeenCalled();
    expect(stopFocusDndSession).not.toHaveBeenCalled();
  });

  it("starts DND only when enabled and policy access is granted", async () => {
    const { mod, startFocusDndSession } = await setupNativeFocusDndModule({
      native: true,
      platform: "android",
    });

    mod.setFocusDndEnabled("taskticker_tasks_v1", true);
    await mod.startNativeFocusDndSession({ storageKey: "taskticker_tasks_v1" });

    expect(startFocusDndSession).toHaveBeenCalledWith();
  });

  it("does not start DND when policy access is missing", async () => {
    const { mod, getDndStatus, startFocusDndSession } = await setupNativeFocusDndModule({
      native: true,
      platform: "android",
    });
    getDndStatus.mockResolvedValue({
      supported: true,
      policyAccessGranted: false,
      active: false,
      interruptionFilter: "all",
    });

    mod.setFocusDndEnabled("taskticker_tasks_v1", true);
    await mod.startNativeFocusDndSession({ storageKey: "taskticker_tasks_v1" });

    expect(startFocusDndSession).not.toHaveBeenCalled();
  });

  it("stops the native DND session so Android can restore the previous filter", async () => {
    const { mod, stopFocusDndSession } = await setupNativeFocusDndModule({
      native: true,
      platform: "android",
    });

    await mod.stopNativeFocusDndSession();

    expect(stopFocusDndSession).toHaveBeenCalledWith();
  });
});
