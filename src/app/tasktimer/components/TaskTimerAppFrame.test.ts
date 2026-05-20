import { describe, expect, it } from "vitest";
import {
  getDesktopHeaderRankId,
  getTaskLaunchMobileMenuItems,
  shouldRenderDesktopInsigniaUpgrade,
  type DesktopInsigniaUpgradePayload,
} from "./TaskTimerAppFrame";

describe("TaskTimerAppFrame mobile menu", () => {
  it("does not show Account in the hamburger menu", () => {
    const items = getTaskLaunchMobileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "Sign Out"]);
    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(items.filter((item) => item.kind === "link").map((item) => item.href)).toEqual(["/settings"]);
  });
});

describe("TaskTimerAppFrame desktop promotion insignia", () => {
  it("holds the previous rank in the desktop header while the promotion modal is active", () => {
    expect(getDesktopHeaderRankId("operator", "initiate", null)).toBe("initiate");
  });

  it("uses the promoted rank while the close-triggered insignia upgrade is active", () => {
    expect(getDesktopHeaderRankId("operator", "initiate", { nextRankId: "operator" })).toBe("operator");
  });

  it("renders the desktop insignia upgrade only for the active payload sequence", () => {
    const upgrade: DesktopInsigniaUpgradePayload = {
      seq: 2,
      previousRankId: "initiate",
      nextRankId: "operator",
    };

    expect(shouldRenderDesktopInsigniaUpgrade(upgrade, 2)).toBe(true);
    expect(shouldRenderDesktopInsigniaUpgrade(upgrade, 1)).toBe(false);
    expect(shouldRenderDesktopInsigniaUpgrade(null, 2)).toBe(false);
  });

  it("does not render a desktop insignia upgrade without both rank ids", () => {
    expect(shouldRenderDesktopInsigniaUpgrade({ seq: 1, previousRankId: "", nextRankId: "operator" }, 1)).toBe(false);
    expect(shouldRenderDesktopInsigniaUpgrade({ seq: 1, previousRankId: "initiate", nextRankId: "" }, 1)).toBe(false);
  });
});
