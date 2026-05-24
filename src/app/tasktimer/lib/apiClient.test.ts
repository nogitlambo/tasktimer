import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isNativeOrFileRuntime: vi.fn(),
}));

vi.mock("@/lib/firebaseClient", () => ({
  isNativeOrFileRuntime: mocks.isNativeOrFileRuntime,
}));

describe("getApiUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.isNativeOrFileRuntime.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("uses relative API paths in hosted web runtime", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://tasklaunch.app";
    const { getApiUrl } = await import("./apiClient");

    expect(getApiUrl("/api/friends/requests/")).toBe("/api/friends/requests/");
    expect(getApiUrl("/api/account/claim-username/")).toBe("/api/account/claim-username/");
    expect(getApiUrl("/api/account/sync-identity/")).toBe("/api/account/sync-identity/");
  });

  it("uses the configured hosted origin in native or file runtime", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);
    process.env.NEXT_PUBLIC_APP_URL = "https://tasklaunch.app/tasklaunch";
    const { getApiUrl } = await import("./apiClient");

    expect(getApiUrl("/api/friends/requests/")).toBe("https://tasklaunch.app/api/friends/requests/");
    expect(getApiUrl("/api/account/claim-username/")).toBe("https://tasklaunch.app/api/account/claim-username/");
    expect(getApiUrl("/api/account/sync-identity/")).toBe("https://tasklaunch.app/api/account/sync-identity/");
  });
});
