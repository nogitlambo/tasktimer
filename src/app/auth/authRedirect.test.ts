import { beforeEach, describe, expect, it, vi } from "vitest";

const startupModuleMocks = vi.hoisted(() => ({
  resolveStartupModulePreference: vi.fn(() => "dashboard"),
  startupModuleToRoute: vi.fn((value: string) => {
    if (value === "friends") return "/friends";
    if (value === "leaderboard") return "/leaderboards";
    if (value === "tasks") return "/tasklaunch";
    return "/dashboard";
  }),
}));

vi.mock("../tasktimer/lib/startupModule", () => startupModuleMocks);
vi.mock("../tasktimer/lib/workspaceRepository", () => ({
  createTaskTimerWorkspaceRepository: vi.fn(() => ({})),
  createTaskTimerWorkspacePreferencesPersistence: vi.fn(() => ({})),
}));

import { resolveAuthSuccessRoute, runAuthSuccessRedirect, shouldFallbackFromAuthSuccessRoute } from "./authRedirect";

describe("resolveAuthSuccessRoute", () => {
  beforeEach(() => {
    startupModuleMocks.resolveStartupModulePreference.mockClear();
    startupModuleMocks.startupModuleToRoute.mockClear();
    startupModuleMocks.resolveStartupModulePreference.mockReturnValue("dashboard");
  });

  it("uses the startup module route for the login page", () => {
    startupModuleMocks.resolveStartupModulePreference.mockReturnValue("friends");

    expect(resolveAuthSuccessRoute()).toBe("/friends");
    expect(startupModuleMocks.resolveStartupModulePreference).toHaveBeenCalledTimes(1);
    expect(startupModuleMocks.startupModuleToRoute).toHaveBeenCalledWith("friends");
  });

  it("preserves an explicit friends return route", () => {
    expect(resolveAuthSuccessRoute("/friends")).toBe("/friends");
    expect(startupModuleMocks.resolveStartupModulePreference).not.toHaveBeenCalled();
  });

  it("preserves an explicit leaderboards return route", () => {
    expect(resolveAuthSuccessRoute("/leaderboards")).toBe("/leaderboards");
    expect(startupModuleMocks.resolveStartupModulePreference).not.toHaveBeenCalled();
  });

  it("runs the success redirect once with the resolved startup route", () => {
    startupModuleMocks.resolveStartupModulePreference.mockReturnValue("tasks");
    const markRedirected = vi.fn();
    const replace = vi.fn();

    expect(
      runAuthSuccessRedirect({
        hasRedirected: false,
        shouldStartProCheckout: false,
        bypassAutoRedirect: false,
        markRedirected,
        replace,
      })
    ).toBe(true);

    expect(markRedirected).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/tasklaunch");
  });

  it("does not redirect when checkout owns the next navigation", () => {
    const markRedirected = vi.fn();
    const replace = vi.fn();

    expect(
      runAuthSuccessRedirect({
        hasRedirected: false,
        shouldStartProCheckout: true,
        bypassAutoRedirect: false,
        markRedirected,
        replace,
      })
    ).toBe(false);

    expect(markRedirected).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect during a signed-out bypass handoff", () => {
    const markRedirected = vi.fn();
    const replace = vi.fn();

    expect(
      runAuthSuccessRedirect({
        hasRedirected: false,
        shouldStartProCheckout: false,
        bypassAutoRedirect: true,
        markRedirected,
        replace,
      })
    ).toBe(false);

    expect(markRedirected).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("shouldFallbackFromAuthSuccessRoute", () => {
  it("falls back only when auth success remains on the login route", () => {
    expect(shouldFallbackFromAuthSuccessRoute("/login", "/dashboard")).toBe(true);
    expect(shouldFallbackFromAuthSuccessRoute("/login/", "/tasklaunch?page=dashboard")).toBe(true);
    expect(shouldFallbackFromAuthSuccessRoute("/login/index.html", "/dashboard/index.html")).toBe(true);
    expect(shouldFallbackFromAuthSuccessRoute("/dashboard", "/dashboard")).toBe(false);
    expect(shouldFallbackFromAuthSuccessRoute("/login", "/login")).toBe(false);
  });
});

describe("runAuthSuccessRedirect", () => {
  beforeEach(() => {
    startupModuleMocks.resolveStartupModulePreference.mockClear();
    startupModuleMocks.startupModuleToRoute.mockClear();
    startupModuleMocks.resolveStartupModulePreference.mockReturnValue("dashboard");
  });

  it("schedules a browser fallback when the login route is still active", () => {
    const markRedirected = vi.fn();
    const replace = vi.fn();
    const fallbackReplace = vi.fn();
    const scheduledCallbacks: Array<() => void> = [];
    const scheduleFallback = vi.fn((callback: () => void) => {
      scheduledCallbacks.push(callback);
    });

    expect(
      runAuthSuccessRedirect({
        hasRedirected: false,
        shouldStartProCheckout: false,
        bypassAutoRedirect: false,
        markRedirected,
        replace,
        fallbackReplace,
        getCurrentPathname: () => "/login",
        scheduleFallback,
      })
    ).toBe(true);

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(scheduleFallback).toHaveBeenCalledTimes(1);
    scheduledCallbacks[0]?.();
    expect(fallbackReplace).toHaveBeenCalledWith("/dashboard");
  });

  it("uses the provided route resolver before replacing or falling back", () => {
    startupModuleMocks.resolveStartupModulePreference.mockReturnValue("tasks");
    const markRedirected = vi.fn();
    const replace = vi.fn();
    const fallbackReplace = vi.fn();
    const scheduledCallbacks: Array<() => void> = [];

    runAuthSuccessRedirect({
      hasRedirected: false,
      shouldStartProCheckout: false,
      bypassAutoRedirect: false,
      markRedirected,
      replace,
      fallbackReplace,
      getCurrentPathname: () => "/login",
      scheduleFallback: (callback) => {
        scheduledCallbacks.push(callback);
      },
      resolveRoute: (route) => `${route}/index.html`,
    });

    expect(replace).toHaveBeenCalledWith("/tasklaunch/index.html");
    scheduledCallbacks[0]?.();
    expect(fallbackReplace).toHaveBeenCalledWith("/tasklaunch/index.html");
  });

  it("does not run the browser fallback after client navigation leaves login", () => {
    const fallbackReplace = vi.fn();
    const scheduledCallbacks: Array<() => void> = [];

    runAuthSuccessRedirect({
      hasRedirected: false,
      shouldStartProCheckout: false,
      bypassAutoRedirect: false,
      markRedirected: vi.fn(),
      replace: vi.fn(),
      fallbackReplace,
      getCurrentPathname: () => "/dashboard",
      scheduleFallback: (callback) => {
        scheduledCallbacks.push(callback);
      },
    });

    scheduledCallbacks[0]?.();
    expect(fallbackReplace).not.toHaveBeenCalled();
  });
});
