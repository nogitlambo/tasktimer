import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("shows Settings and User Guide in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "User Guide"]);
    expect(items.map((item) => item.href)).toEqual(["/settings", "/user-guide"]);
  });
});

