import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTaskTimerRouteHref } from "./routeHref";

describe("resolveTaskTimerRouteHref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps app routes on native https runtime without forcing index.html", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/settings",
        protocol: "https:",
      },
    });

    expect(resolveTaskTimerRouteHref("/?signedOut=1")).toBe("/?signedOut=1");
  });

  it("uses index.html paths for file runtime exports", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/android_asset/public/settings/index.html",
        protocol: "file:",
      },
    });

    expect(resolveTaskTimerRouteHref("/?signedOut=1")).toBe("/index.html?signedOut=1");
  });

  it("uses index.html paths when already on an exported html route", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/tasklaunch/index.html",
        protocol: "https:",
      },
    });

    expect(resolveTaskTimerRouteHref("/feedback")).toBe("/feedback/index.html");
  });
});
