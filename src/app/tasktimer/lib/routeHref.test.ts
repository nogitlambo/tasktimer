import { afterEach, describe, expect, it } from "vitest";

import { Capacitor } from "@capacitor/core";
import { resolveTaskTimerRouteHref } from "./routeHref";

const originalWindow = globalThis.window;
const originalIsNativePlatform = Capacitor.isNativePlatform;

function setWindowLocation(protocol: string, pathname: string) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        protocol,
        pathname,
      },
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Capacitor.isNativePlatform = originalIsNativePlatform;
});

describe("resolveTaskTimerRouteHref", () => {
  it("keeps normal web routes root-relative", () => {
    setWindowLocation("https:", "/login");

    expect(resolveTaskTimerRouteHref("/tasklaunch")).toBe("/tasklaunch");
  });

  it("uses exported index paths in file runtime", () => {
    setWindowLocation("file:", "/login/index.html");

    expect(resolveTaskTimerRouteHref("/tasklaunch")).toBe("/tasklaunch/index.html");
  });

  it("preserves query strings for exported paths", () => {
    setWindowLocation("file:", "/settings/index.html");

    expect(resolveTaskTimerRouteHref("/tasklaunch?page=dashboard")).toBe("/tasklaunch/index.html?page=dashboard");
  });

  it("uses exported index paths in native https localhost runtime", () => {
    setWindowLocation("https:", "/login");
    Capacitor.isNativePlatform = () => true;

    expect(resolveTaskTimerRouteHref("/tasklaunch")).toBe("/tasklaunch/index.html");
  });
});
