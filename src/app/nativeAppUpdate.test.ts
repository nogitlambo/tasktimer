import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupNativeAppUpdateModule(options: {
  native?: boolean;
  platform?: string;
  result?: unknown;
  reject?: unknown;
} = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  const checkForImmediateUpdate = vi.fn(async () => {
    if (options.reject) throw options.reject;
    return options.result || { status: "not_available" };
  });
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => options.native === true,
      getPlatform: () => options.platform || "web",
    },
    registerPlugin: vi.fn(() => ({
      checkForImmediateUpdate,
    })),
  }));
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
  });
  const mod = await import("./nativeAppUpdate");
  mod.resetNativeAppUpdateGateForTests();
  return { mod, checkForImmediateUpdate };
}

describe("native app update gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not call the plugin outside native Android", async () => {
    const { mod, checkForImmediateUpdate } = await setupNativeAppUpdateModule({
      native: false,
      platform: "web",
    });

    await expect(mod.runNativeAndroidAppUpdateGate()).resolves.toEqual({
      status: "skipped",
      reason: "not_android_native",
    });

    expect(mod.getNativeAppUpdateGateInitialPending()).toBe(false);
    expect(checkForImmediateUpdate).not.toHaveBeenCalled();
  });

  it("calls the native plugin once on Android across repeated gate runs", async () => {
    const { mod, checkForImmediateUpdate } = await setupNativeAppUpdateModule({
      native: true,
      platform: "android",
      result: { status: "not_allowed", availableVersionCode: 31 },
    });

    await expect(mod.runNativeAndroidAppUpdateGate()).resolves.toEqual({
      status: "not_allowed",
      availableVersionCode: 31,
    });
    await expect(mod.runNativeAndroidAppUpdateGate()).resolves.toEqual({
      status: "not_allowed",
      availableVersionCode: 31,
    });

    expect(checkForImmediateUpdate).toHaveBeenCalledTimes(1);
    expect(mod.getNativeAppUpdateGateInitialPending()).toBe(false);
  });

  it("fails open and records telemetry when the plugin rejects", async () => {
    const { mod } = await setupNativeAppUpdateModule({
      native: true,
      platform: "android",
      reject: new Error("play unavailable"),
    });
    const recordNonFatal = vi.fn();

    await expect(mod.runNativeAndroidAppUpdateGate({ recordNonFatal })).resolves.toEqual({
      status: "failed",
      message: "play unavailable",
    });

    expect(recordNonFatal).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      flow: "native_app_update_gate",
      outcome: "failed",
    }));
    expect(mod.getNativeAppUpdateGateInitialPending()).toBe(false);
  });

  it("fails open and records telemetry when the update check times out", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const { mod, checkForImmediateUpdate } = await setupNativeAppUpdateModule({
      native: true,
      platform: "android",
      result: never,
    });
    checkForImmediateUpdate.mockReturnValue(never as never);
    const recordNonFatal = vi.fn();

    const result = mod.runNativeAndroidAppUpdateGate({ timeoutMs: 25, recordNonFatal });
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ status: "timeout" });
    expect(recordNonFatal).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      flow: "native_app_update_gate",
      outcome: "timeout",
      timeout_ms: 25,
    }));
    expect(mod.getNativeAppUpdateGateInitialPending()).toBe(false);
  });
});
