import { describe, expect, it } from "vitest";
import { getSettingsNavItems, getVisibleSettingsNavItems } from "./useSettingsPaneState";

describe("settings navigation", () => {
  it("exposes Profile as a desktop-only Settings pane", () => {
    const items = getSettingsNavItems();
    const profileItem = items.find((item) => item.key === "general");

    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(profileItem).toMatchObject({ label: "Profile", desktopOnly: true });
  });

  it("uses the mobile-safe nav list by default for SSR hydration", () => {
    const labels = getVisibleSettingsNavItems().map((item) => item.label);

    expect(labels).toEqual(["Preferences", "Appearance", "Sounds & Alerts", "Help Center", "Data", "About"]);
  });

  it("includes Profile in the desktop nav list", () => {
    const labels = getVisibleSettingsNavItems(true).map((item) => item.label);

    expect(labels).toEqual(["Preferences", "Profile", "Appearance", "Sounds & Alerts", "Help Center", "Data", "About"]);
  });
});
