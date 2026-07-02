import { afterEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  cachedPreferences: null as { startupModule?: unknown } | null,
  loadCachedPreferences: vi.fn(() => storageMocks.cachedPreferences),
  STORAGE_KEY: "taskticker_tasks_v1",
}));

vi.mock("./storage", () => storageMocks);

import { normalizeStartupModule, readStartupModulePreference, startupModuleToAppPage, startupModuleToRoute } from "./startupModule";

function stubLocalStorage(values: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => values[key] ?? null),
    },
  });
}

afterEach(() => {
  storageMocks.cachedPreferences = null;
  storageMocks.loadCachedPreferences.mockClear();
  vi.unstubAllGlobals();
});

describe("startupModule", () => {
  it("defaults missing and invalid startup modules to Tasks", () => {
    expect(normalizeStartupModule(undefined)).toBe("tasks");
    expect(normalizeStartupModule("")).toBe("tasks");
    expect(normalizeStartupModule("legacy-module")).toBe("tasks");
  });

  it("maps Tasks to the Tasks app page and route", () => {
    expect(normalizeStartupModule("tasks")).toBe("tasks");
    expect(startupModuleToAppPage("tasks")).toBe("tasks");
    expect(startupModuleToRoute("tasks")).toBe("/tasklaunch");
  });

  it("defaults to Tasks when reading startup preference without browser storage", () => {
    expect(readStartupModulePreference()).toBe("tasks");
  });

  it("uses cached preferences before stale local startup module storage", () => {
    storageMocks.cachedPreferences = { startupModule: "friends" };
    stubLocalStorage({ "taskticker_tasks_v1:startupModule": "dashboard" });

    expect(readStartupModulePreference()).toBe("friends");
  });

  it("uses local startup module storage when cached preferences are missing", () => {
    stubLocalStorage({ "taskticker_tasks_v1:startupModule": "dashboard" });

    expect(readStartupModulePreference()).toBe("dashboard");
  });

  it("accepts Notes as a startup module", () => {
    expect(normalizeStartupModule("notes")).toBe("notes");
    expect(startupModuleToAppPage("notes")).toBe("notes");
    expect(startupModuleToRoute("notes")).toBe("/notes");
  });

  it("does not preserve the legacy Session Notes startup module value", () => {
    expect(normalizeStartupModule("session-notes")).toBe("tasks");
  });
});
