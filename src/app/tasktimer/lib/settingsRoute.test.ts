import { describe, expect, it } from "vitest";
import { getSettingsRouteRedirect } from "./settingsRoute";

describe("settings route compatibility redirects", () => {
  it("redirects the legacy Account pane URL to the dedicated Account route", () => {
    expect(getSettingsRouteRedirect(new URLSearchParams("pane=general"))).toBe("/account");
  });

  it("does not redirect other Settings panes", () => {
    expect(getSettingsRouteRedirect(new URLSearchParams("pane=preferences"))).toBeNull();
    expect(getSettingsRouteRedirect(new URLSearchParams(""))).toBeNull();
  });
});
