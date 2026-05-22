import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("only shows Settings in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings"]);
    expect(items.map((item) => item.href)).toEqual(["/settings"]);
  });
});
