import { describe, expect, it, vi } from "vitest";

import {
  normalizeStartupModule,
  resolveStartupAppPagePreference,
  resolveStartupModulePreference,
  startupModuleToAppPage,
  startupModuleToRoute,
} from "./startupModule";

function createPreferenceSource(cached: unknown, resolved: unknown = "tasks") {
  return {
    loadCached: vi.fn(() => (cached == null ? null : { startupModule: cached })),
    loadResolved: vi.fn(() => ({ startupModule: resolved })),
  };
}

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

  it("defaults to Tasks when signed-out preference fallback is missing", () => {
    expect(
      resolveStartupModulePreference({
        preferences: createPreferenceSource(null),
        isSignedIn: false,
        readSignedOutFallback: () => null,
      })
    ).toBe("tasks");
  });

  it("uses cached preferences before stale local startup module storage", () => {
    const readSignedOutFallback = vi.fn(() => "dashboard");

    expect(
      resolveStartupModulePreference({
        preferences: createPreferenceSource("friends"),
        isSignedIn: true,
        readSignedOutFallback,
      })
    ).toBe("friends");
    expect(readSignedOutFallback).not.toHaveBeenCalled();
  });

  it("uses canonical defaults instead of signed-out storage when a signed-in cache is missing", () => {
    const readSignedOutFallback = vi.fn(() => "dashboard");

    expect(
      resolveStartupModulePreference({
        preferences: createPreferenceSource(null, "tasks"),
        isSignedIn: true,
        readSignedOutFallback,
      })
    ).toBe("tasks");
    expect(readSignedOutFallback).not.toHaveBeenCalled();
  });

  it("preserves signed-out startup module storage fallback", () => {
    expect(
      resolveStartupAppPagePreference({
        preferences: createPreferenceSource(null),
        isSignedIn: false,
        readSignedOutFallback: () => "dashboard",
      })
    ).toBe("dashboard");
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
