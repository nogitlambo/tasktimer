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

  it("accepts Notes as a startup module", () => {
    expect(normalizeStartupModule("notes")).toBe("notes");
    expect(startupModuleToAppPage("notes")).toBe("notes");
    expect(startupModuleToRoute("notes")).toBe("/notes");
  });

  it("does not preserve the legacy Session Notes startup module value", () => {
    expect(normalizeStartupModule("session-notes")).toBe("tasks");
  });
});
