import { describe, expect, it } from "vitest";
import { getSettingsNavItems } from "./useSettingsPaneState";

describe("settings navigation", () => {
  it("does not expose Account as a Settings pane", () => {
    const items = getSettingsNavItems();

    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(items.map((item) => item.key)).not.toContain("general");
  });
});
