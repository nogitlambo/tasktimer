import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems, getDesktopRailProfileSignOutLabel, shouldShowDesktopRailDevEnv } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("shows Settings and User Guide in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "User Guide"]);
    expect(items.map((item) => item.href)).toEqual(["/settings", "/user-guide"]);
  });

  it("labels anonymous guest exit as Sign In", () => {
    expect(getDesktopRailProfileSignOutLabel(false, true)).toBe("Sign In");
  });

  it("keeps normal account sign-out labels", () => {
    expect(getDesktopRailProfileSignOutLabel(false, false)).toBe("Sign Out");
    expect(getDesktopRailProfileSignOutLabel(true, false)).toBe("Signing Out");
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
});

