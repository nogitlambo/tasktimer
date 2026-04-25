import { afterEach, describe, expect, it, vi } from "vitest";

function createLocalStorageStub(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

async function loadStartupModuleHelpers(cachedStartupModule?: string | null) {
  vi.resetModules();
  vi.doMock("./storage", () => ({
    STORAGE_KEY: "taskticker_tasks_v1",
    loadCachedPreferences: () =>
      cachedStartupModule
        ? ({
            startupModule: cachedStartupModule,
          })
        : null,
  }));
  return import("./startupModule");
}

describe("startupModule helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("./storage");
  });

  it("defaults to dashboard when no stored preference exists", async () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub(),
    });
    const { readStartupAppPagePreference, readStartupModulePreference } = await loadStartupModuleHelpers(null);

    expect(readStartupModulePreference("startupModule")).toBe("dashboard");
    expect(readStartupAppPagePreference("startupModule")).toBe("dashboard");
  });

  it("maps tasks to the generic tasklaunch route", async () => {
    const { startupModuleToAppPage, startupModuleToRoute } = await loadStartupModuleHelpers(null);

    expect(startupModuleToRoute("tasks")).toBe("/tasklaunch");
    expect(startupModuleToAppPage("tasks")).toBe("tasks");
  });

  it("maps friends and leaderboard to their explicit routes", async () => {
    const { startupModuleToAppPage, startupModuleToRoute } = await loadStartupModuleHelpers(null);

    expect(startupModuleToRoute("friends")).toBe("/friends");
    expect(startupModuleToAppPage("friends")).toBe("friends");
    expect(startupModuleToRoute("leaderboard")).toBe("/leaderboard");
    expect(startupModuleToAppPage("leaderboard")).toBe("leaderboard");
  });

  it("reads a stored startup module preference from local storage when no cache exists", async () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub({
        startupModule: "friends",
      }),
    });
    const { readStartupAppPagePreference, readStartupModulePreference } = await loadStartupModuleHelpers(null);

    expect(readStartupModulePreference("startupModule")).toBe("friends");
    expect(readStartupAppPagePreference("startupModule")).toBe("friends");
  });

  it("prefers local storage over cached preferences", async () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub({
        startupModule: "friends",
      }),
    });
    const { readStartupModulePreference } = await loadStartupModuleHelpers("leaderboard");

    expect(readStartupModulePreference("startupModule")).toBe("friends");
  });
});
