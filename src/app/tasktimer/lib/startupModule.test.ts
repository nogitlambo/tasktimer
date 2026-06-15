import { describe, expect, it } from "vitest";

import { normalizeStartupModule, readStartupModulePreference, startupModuleToAppPage, startupModuleToRoute } from "./startupModule";

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

  it("accepts Session Notes as a startup module", () => {
    expect(normalizeStartupModule("session-notes")).toBe("session-notes");
    expect(startupModuleToAppPage("session-notes")).toBe("session-notes");
    expect(startupModuleToRoute("session-notes")).toBe("/session-notes");
  });
});
