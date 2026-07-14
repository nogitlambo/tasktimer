import { afterEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerAppShell } from "./app-shell";

let startupAppPage = "tasks";
const getStartupAppPage = vi.fn(() => startupAppPage);

function createShell() {
  const context = {
    initialAppPage: "tasks",
    getCurrentAppPage: () => "tasks",
    getStartupAppPage,
    els: {},
    runtime: { destroyed: false },
  } as unknown as Parameters<typeof createTaskTimerAppShell>[0];
  return createTaskTimerAppShell(context);
}

function stubLocation(pathname: string, search = "", protocol = "http:") {
  vi.stubGlobal("window", {
    location: {
      pathname,
      search,
      protocol,
    },
    requestAnimationFrame: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  });
}

afterEach(() => {
  startupAppPage = "tasks";
  getStartupAppPage.mockClear();
  vi.unstubAllGlobals();
});

describe("createTaskTimerAppShell routing", () => {
  it("resolves the Notes app page from the /notes route", () => {
    stubLocation("/notes");

    expect(createShell().getInitialAppPageFromLocation()).toBe("notes");
  });

  it("resolves the Notes app page from the page query", () => {
    stubLocation("/tasklaunch", "?page=notes");

    expect(createShell().getInitialAppPageFromLocation()).toBe("notes");
  });

  it("does not treat /session-notes as a TaskTimer main app route", () => {
    const shell = createShell();

    expect(shell.isTaskTimerMainAppPath("/session-notes")).toBe(false);
    expect(shell.parseAppPageFromToken("app:tasktimer|page=session-notes")).toBeNull();
  });

  it("resolves bare /tasklaunch through the startup module preference", () => {
    startupAppPage = "dashboard";
    stubLocation("/tasklaunch");

    expect(createShell().getInitialAppPageFromLocation()).toBe("dashboard");
    expect(getStartupAppPage).toHaveBeenCalledTimes(1);
  });

  it("resolves native /tasklaunch/index.html through the startup module preference", () => {
    startupAppPage = "friends";
    stubLocation("/tasklaunch/index.html", "", "file:");

    expect(createShell().getInitialAppPageFromLocation()).toBe("friends");
    expect(getStartupAppPage).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit module routes as direct startup targets", () => {
    startupAppPage = "dashboard";

    stubLocation("/friends");
    expect(createShell().getInitialAppPageFromLocation()).toBe("friends");

    stubLocation("/leaderboards");
    expect(createShell().getInitialAppPageFromLocation()).toBe("leaderboard");

    expect(getStartupAppPage).not.toHaveBeenCalled();
  });
});
