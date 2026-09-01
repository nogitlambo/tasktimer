import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeMicrophoneModule(options: { native?: boolean; platform?: string } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal("window", {});
  const getMicrophonePermissionStatus = vi.fn(async () => ({ granted: true, state: "granted" }));
  const requestMicrophonePermission = vi.fn(async () => ({ granted: true, state: "granted" }));
  const openMicrophonePermissionSettings = vi.fn(async () => {});
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      getMicrophonePermissionStatus,
      requestMicrophonePermission,
      openMicrophonePermissionSettings,
    })),
  }));
  const mod = await import("./nativeMicrophonePermission");
  return { mod, getMicrophonePermissionStatus, requestMicrophonePermission, openMicrophonePermissionSettings };
}

describe("native microphone permission bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("no-ops outside native Android", async () => {
    const { mod, getMicrophonePermissionStatus, requestMicrophonePermission } = await setupNativeMicrophoneModule();

    expect(await mod.getNativeMicrophonePermissionStatus()).toEqual({ supported: false, granted: false, state: "unavailable" });
    expect(await mod.requestNativeMicrophonePermission()).toEqual({ supported: false, granted: false, state: "unavailable" });
    expect(getMicrophonePermissionStatus).not.toHaveBeenCalled();
    expect(requestMicrophonePermission).not.toHaveBeenCalled();
  });

  it("checks and requests microphone access on native Android", async () => {
    const { mod, getMicrophonePermissionStatus, requestMicrophonePermission, openMicrophonePermissionSettings } = await setupNativeMicrophoneModule({
      native: true,
      platform: "android",
    });

    expect(await mod.getNativeMicrophonePermissionStatus()).toMatchObject({ supported: true, granted: true });
    expect(await mod.requestNativeMicrophonePermission()).toMatchObject({ supported: true, granted: true });
    await mod.openNativeMicrophonePermissionSettings();
    expect(getMicrophonePermissionStatus).toHaveBeenCalledWith();
    expect(requestMicrophonePermission).toHaveBeenCalledWith();
    expect(openMicrophonePermissionSettings).toHaveBeenCalledWith();
  });
});
