import { describe, expect, it } from "vitest";
import { getTaskLaunchMobileMenuItems } from "./TaskTimerAppFrame";

describe("TaskTimerAppFrame mobile menu", () => {
  it("does not show Account in the hamburger menu", () => {
    const items = getTaskLaunchMobileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "Sign Out"]);
    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(items.filter((item) => item.kind === "link").map((item) => item.href)).toEqual(["/settings"]);
  });
});
