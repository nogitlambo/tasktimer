import { afterEach, describe, expect, it, vi } from "vitest";

const startupModuleMocks = vi.hoisted(() => ({
  startupAppPage: "tasks",
  readStartupAppPagePreference: vi.fn(() => startupModuleMocks.startupAppPage),
}));

vi.mock("../lib/startupModule", () => startupModuleMocks);

import { createTaskTimerAppShell } from "./app-shell";

function createShell() {
  const context = {
    initialAppPage: "tasks",
    getCurrentAppPage: () => "tasks",
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
  startupModuleMocks.startupAppPage = "tasks";
  startupModuleMocks.readStartupAppPagePreference.mockClear();
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
    startupModuleMocks.startupAppPage = "dashboard";
    stubLocation("/tasklaunch");

    expect(createShell().getInitialAppPageFromLocation()).toBe("dashboard");
    expect(startupModuleMocks.readStartupAppPagePreference).toHaveBeenCalledTimes(1);
  });

  it("resolves native /tasklaunch/index.html through the startup module preference", () => {
    startupModuleMocks.startupAppPage = "friends";
    stubLocation("/tasklaunch/index.html", "", "file:");

    expect(createShell().getInitialAppPageFromLocation()).toBe("friends");
    expect(startupModuleMocks.readStartupAppPagePreference).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit module routes as direct startup targets", () => {
    startupModuleMocks.startupAppPage = "dashboard";

    stubLocation("/friends");
    expect(createShell().getInitialAppPageFromLocation()).toBe("friends");

    stubLocation("/leaderboards");
    expect(createShell().getInitialAppPageFromLocation()).toBe("leaderboard");

    expect(startupModuleMocks.readStartupAppPagePreference).not.toHaveBeenCalled();
  });
});
