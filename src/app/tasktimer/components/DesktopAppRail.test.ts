import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("does not show Account in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "History"]);
    expect(items.map((item) => item.href)).toEqual(["/settings", "/history-manager"]);
  });
});
