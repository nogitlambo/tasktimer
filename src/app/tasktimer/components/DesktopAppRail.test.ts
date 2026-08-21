import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDesktopRailHelpCenterMenuItems,
  getDesktopRailPrimaryNavItems,
  getDesktopRailProfileMenuItems,
  getDesktopRailProfileSignOutLabel,
  getMobileFooterNavItems,
  getMobileFooterUtilityItems,
  shouldCloseDesktopRailProfileMenuOnPointerDown,
} from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("keeps Notes in the desktop rail and Executive in the mobile footer", () => {
    const desktopItems = getDesktopRailPrimaryNavItems();
    const mobileItems = getMobileFooterNavItems();

    expect(desktopItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Notes",
      "Tasks",
      "Executive",
      "Friends",
      "Leaderboards",
    ]);
    expect(mobileItems.map((item) => item.mobileId)).toEqual([
      "footerDashboardBtn",
      "footerExecutiveBtn",
      "footerTasksBtn",
      "footerTest2Btn",
      "footerLeaderboardBtn",
    ]);
    expect(desktopItems.find((item) => item.page === "notes")?.iconSrc).toBe("/icons/icons_default/notes.webp");
    expect(desktopItems.find((item) => item.page === "notes")?.href).toBe("/notes");
    expect(desktopItems.find((item) => item.page === "executive")?.iconSrc).toBe("/icons/icons_default/executive.webp");
    expect(desktopItems.find((item) => item.page === "executive")?.href).toBe("/executive");
    expect(mobileItems.some((item) => item.mobileId === "footerSessionNotesBtn")).toBe(false);
    expect(mobileItems.find((item) => item.page === "executive")?.iconSrc).toBe("/icons/icons_default/executive.webp");
    expect(mobileItems.find((item) => item.page === "executive")?.href).toBe("/executive");
    expect(desktopItems.find((item) => item.page === "leaderboard")?.iconSrc).toBe("/icons/icons_default/leaderboards.webp");
  });

  it("shows Settings as the flat profile menu item", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings"]);
    expect(items.map((item) => item.href)).toEqual(["/settings"]);
  });

  it("moves Profile, Settings, and User Guide into the mobile footer utility sheet", () => {
    const items = getMobileFooterUtilityItems();

    expect(items.map((item) => item.label)).toEqual(["Account", "Settings", "User Guide"]);
    expect(items.map((item) => item.href)).toEqual(["/account", "/settings", "/user-guide"]);
  });

  it("resolves footer sheet utility links through the shared TaskTimer route helper", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");

    expect(source).toContain('import { resolveTaskTimerRouteHref } from "../lib/routeHref";');
    expect(source).toContain('className="appFooterSheetUtility"');
    expect(source).toContain("href={resolveTaskTimerRouteHref(item.href)}");
  });

  it("keeps the mobile footer sheet out of desktop layout and the fixed nav outside the transformed panel", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");
    const css = readFileSync(resolve(__dirname, "../styles/09-desktop-rail.css"), "utf8");

    expect(css).toMatch(/\.appFooterSheet\s*\{[^}]*display:\s*none;/);
    expect(source).toMatch(/<\/section>\s*<div className="appFooterNav"/);
    expect(css).not.toContain(".appFooterSheetPanel .appFooterNav{");
  });

  it("shows User Guide and Feedback in the Help Center submenu", () => {
    const items = getDesktopRailHelpCenterMenuItems();

    expect(items.map((item) => item.label)).toEqual(["User Guide", "Feedback"]);
    expect(items.map((item) => item.href)).toEqual(["/user-guide", "/feedback"]);
    expect(items.find((item) => item.label === "User Guide")?.iconSrc).toBe("/icons/icons_default/user-guide.webp");
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

  it("uses the shared API URL helper for billing portal requests", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");

    expect(source).toContain('fetch(getApiUrl("/api/stripe/create-billing-portal-session/"), {');
  });

  it("does not render a manual sync action in the profile menu", () => {
    const source = readFileSync(resolve(__dirname, "DesktopAppRail.tsx"), "utf8");

    expect(source).not.toContain('src="/icons/icons_default/refresh.webp"');
    expect(source).not.toContain('aria-label="Sync"');
    expect(source).not.toContain("renderProfileSyncButton");
  });
});

