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

    expect(labels).toEqual(["Preferences", "Appearance", "Sounds & Alerts", "Notifications", "Help Center", "Data", "About"]);
  });

  it("uses default webp icons for mobile Settings menu items", () => {
    const iconsByLabel = new Map(getVisibleSettingsNavItems().map((item) => [item.label, item.icon]));

    expect(iconsByLabel.get("Preferences")).toBe("/icons/icons_default/preferences.webp");
    expect(iconsByLabel.get("Appearance")).toBe("/icons/icons_default/appearance.webp");
    expect(iconsByLabel.get("Data")).toBe("/icons/icons_default/data.webp");
    expect(iconsByLabel.get("About")).toBe("/icons/icons_default/about.webp");
  });

  it("includes Profile in the desktop nav list", () => {
    const labels = getVisibleSettingsNavItems(true).map((item) => item.label);

    expect(labels).toEqual(["Profile", "Preferences", "Appearance", "Sounds & Alerts", "Notifications", "Help Center", "Data", "About"]);
  });
});
