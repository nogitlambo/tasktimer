import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDesktopRailHelpCenterMenuItems,
  getDesktopRailPrimaryNavItems,
  getDesktopRailProfileMenuItems,
  getDesktopRailProfileSignOutLabel,
  getMobileFooterNavItems,
  shouldCloseDesktopRailProfileMenuOnPointerDown,
} from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("keeps Notes before Tasks in the desktop rail and mobile footer", () => {
    const desktopItems = getDesktopRailPrimaryNavItems();
    const mobileItems = getMobileFooterNavItems();

    expect(desktopItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Notes",
      "Tasks",
      "Friends",
      "Leaderboards",
    ]);
    expect(mobileItems.map((item) => item.mobileId)).toEqual([
      "footerDashboardBtn",
      "footerSessionNotesBtn",
      "footerTasksBtn",
      "footerTest2Btn",
      "footerLeaderboardBtn",
    ]);
    expect(desktopItems.find((item) => item.page === "notes")?.iconSrc).toBe("/icons/icons_default/notes.webp");
    expect(desktopItems.find((item) => item.page === "notes")?.href).toBe("/notes");
    expect(desktopItems.find((item) => item.page === "leaderboard")?.iconSrc).toBe("/icons/icons_default/leaderboards.webp");
  });

  it("shows Settings as the flat profile menu item", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings"]);
    expect(items.map((item) => item.href)).toEqual(["/settings"]);
  });

  it("shows User Guide and Feedback in the Help Center submenu", () => {
    const items = getDesktopRailHelpCenterMenuItems();

    expect(items.map((item) => item.label)).toEqual(["User Guide", "Feedback"]);
    expect(items.map((item) => item.href)).toEqual(["/user-guide", "/feedback"]);
  });

  it("opens the Help Center submenu on hover and closes it when hover leaves", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");

    expect(source).toContain("onPointerEnter={() => setHelpCenterMenuOpen(true)}");
    expect(source).toContain("onPointerLeave={() => setHelpCenterMenuOpen(false)}");
  });

  it("keeps the Help Center arrow direction unchanged when the submenu is open", () => {
    const css = readFileSync(resolve(__dirname, "../styles/09-desktop-rail.css"), "utf8");

    expect(css).not.toContain("desktopRailProfileSubmenu[open] .desktopRailProfileSubmenuTrigger::after");
  });

  it("keeps normal account sign-out labels", () => {
    expect(getDesktopRailProfileSignOutLabel(false)).toBe("Sign Out");
    expect(getDesktopRailProfileSignOutLabel(true)).toBe("Signing Out");
  });

  it("collapses the profile menu only for outside pointer targets", () => {
    const insideTarget = {} as Node;
    const outsideTarget = {} as Node;
    const menu = {
      contains: (target: Node) => target === insideTarget,
    };

    expect(shouldCloseDesktopRailProfileMenuOnPointerDown(menu, insideTarget)).toBe(false);
    expect(shouldCloseDesktopRailProfileMenuOnPointerDown(menu, outsideTarget)).toBe(true);
    expect(shouldCloseDesktopRailProfileMenuOnPointerDown(menu, null)).toBe(false);
    expect(shouldCloseDesktopRailProfileMenuOnPointerDown(null, outsideTarget)).toBe(false);
  });

  it("registers a pointerdown listener while the profile menu is expanded", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");

    expect(source).toContain('document.addEventListener("pointerdown", handleProfileMenuOutsidePointerDown)');
    expect(source).toContain('document.removeEventListener("pointerdown", handleProfileMenuOutsidePointerDown)');
    expect(source).toContain("shouldCloseDesktopRailProfileMenuOnPointerDown(profileMenuRef.current, target)");
  });
});

