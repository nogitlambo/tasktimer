import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("shows Account above Settings in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Account", "Settings", "History"]);
    expect(items.map((item) => item.href)).toEqual(["/account", "/settings", "/history-manager"]);
  });
});
