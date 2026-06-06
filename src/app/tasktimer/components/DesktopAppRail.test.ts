import { describe, expect, it } from "vitest";
import { TASKTIMER_OPEN_ONBOARDING_EVENT } from "../client/onboarding-events";
import {
  getDesktopRailHelpCenterMenuItems,
  getDesktopRailPrimaryNavItems,
  getDesktopRailProfileMenuItems,
  getDesktopRailProfileSignOutLabel,
  getMobileFooterNavItems,
  openTaskLaunchOnboarding,
  shouldShowDesktopRailDevEnv,
} from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("keeps Session Notes under Tasks in the desktop rail and third in the mobile footer", () => {
    const desktopItems = getDesktopRailPrimaryNavItems();
    const mobileItems = getMobileFooterNavItems();

    expect(desktopItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Tasks",
      "Session Notes",
      "Friends",
      "Leaderboards",
    ]);
    expect(mobileItems.map((item) => item.mobileId)).toEqual([
      "footerDashboardBtn",
      "footerTasksBtn",
      "footerSessionNotesBtn",
      "footerTest2Btn",
      "footerLeaderboardBtn",
    ]);
    expect(desktopItems.find((item) => item.page === "session-notes")?.iconSrc).toBe("/icons/icons_default/notes.webp");
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

  it("keeps normal account sign-out labels", () => {
    expect(getDesktopRailProfileSignOutLabel(false)).toBe("Sign Out");
    expect(getDesktopRailProfileSignOutLabel(true)).toBe("Signing Out");
  });
});

describe("DesktopAppRail Dev env gate", () => {
  it("shows on localhost development when the flag is unset", () => {
    expect(shouldShowDesktopRailDevEnv({ hostname: "localhost", protocol: "http:", nodeEnv: "development" })).toBe(true);
  });

  it("shows on 127.0.0.1 development when the flag is unset", () => {
    expect(shouldShowDesktopRailDevEnv({ hostname: "127.0.0.1", protocol: "http:", nodeEnv: "development" })).toBe(true);
  });

  it("hides on non-localhost development even when the flag is enabled", () => {
    expect(
      shouldShowDesktopRailDevEnv({
        hostname: "tasklaunch.test",
        protocol: "https:",
        nodeEnv: "development",
        flag: "true",
      })
    ).toBe(false);
  });

  it("hides on localhost production", () => {
    expect(shouldShowDesktopRailDevEnv({ hostname: "localhost", protocol: "http:", nodeEnv: "production" })).toBe(false);
  });

  it.each(["false", "0", "off"])("hides on localhost development when the flag is %s", (flag) => {
    expect(shouldShowDesktopRailDevEnv({ hostname: "localhost", protocol: "http:", nodeEnv: "development", flag })).toBe(
      false
    );
  });

  it("hides in native-style localhost runtimes", () => {
    expect(shouldShowDesktopRailDevEnv({ hostname: "localhost", protocol: "capacitor:", nodeEnv: "development" })).toBe(
      false
    );
    expect(shouldShowDesktopRailDevEnv({ hostname: "", protocol: "file:", nodeEnv: "development" })).toBe(false);
  });

  it("dispatches the onboarding event from the Dev env action", () => {
    const target = new EventTarget();
    const events: string[] = [];
    target.addEventListener(TASKTIMER_OPEN_ONBOARDING_EVENT, (event) => events.push(event.type));

    expect(openTaskLaunchOnboarding(target)).toBe(true);
    expect(events).toEqual([TASKTIMER_OPEN_ONBOARDING_EVENT]);
  });
});

