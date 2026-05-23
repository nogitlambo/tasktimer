import { describe, expect, it } from "vitest";
import {
  buildSettingsPreferencesOptimalProductivityDaysHref,
  getSettingsRouteHighlight,
  getSettingsRouteRedirect,
  SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS,
} from "./settingsRoute";

describe("settings route compatibility redirects", () => {
  it("redirects the legacy Account pane URL to the dedicated Account route", () => {
    expect(getSettingsRouteRedirect(new URLSearchParams("pane=general"))).toBe("/account");
  });

  it("does not redirect other Settings panes", () => {
    expect(getSettingsRouteRedirect(new URLSearchParams("pane=preferences"))).toBeNull();
    expect(getSettingsRouteRedirect(new URLSearchParams(""))).toBeNull();
  });

  it("reads the optimal productivity days highlight query", () => {
    expect(getSettingsRouteHighlight(new URLSearchParams("highlight=optimalProductivityDays"))).toBe(
      SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS
    );
    expect(getSettingsRouteHighlight(new URLSearchParams("highlight=unknown"))).toBeNull();
    expect(getSettingsRouteHighlight(new URLSearchParams(""))).toBeNull();
  });

  it("builds the Settings preferences highlight route", () => {
    expect(buildSettingsPreferencesOptimalProductivityDaysHref()).toBe(
      "/settings?pane=preferences&highlight=optimalProductivityDays"
    );
  });
});
