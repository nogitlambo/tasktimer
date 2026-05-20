import { beforeEach, describe, expect, it, vi } from "vitest";

const startupModuleMocks = vi.hoisted(() => ({
  readStartupModulePreference: vi.fn(() => "dashboard"),
  startupModuleToRoute: vi.fn((value: string) => {
    if (value === "friends") return "/friends";
    if (value === "leaderboard") return "/leaderboards";
    if (value === "tasks") return "/tasklaunch";
    return "/dashboard";
  }),
}));

vi.mock("../tasktimer/lib/startupModule", () => startupModuleMocks);

import { resolveAuthSuccessRoute } from "./authRedirect";

describe("resolveAuthSuccessRoute", () => {
  beforeEach(() => {
    startupModuleMocks.readStartupModulePreference.mockClear();
    startupModuleMocks.startupModuleToRoute.mockClear();
    startupModuleMocks.readStartupModulePreference.mockReturnValue("dashboard");
  });

  it("uses the startup module route for the login page", () => {
    startupModuleMocks.readStartupModulePreference.mockReturnValue("friends");

    expect(resolveAuthSuccessRoute()).toBe("/friends");
    expect(startupModuleMocks.readStartupModulePreference).toHaveBeenCalledTimes(1);
    expect(startupModuleMocks.startupModuleToRoute).toHaveBeenCalledWith("friends");
  });

  it("preserves an explicit friends return route", () => {
    expect(resolveAuthSuccessRoute("/friends")).toBe("/friends");
    expect(startupModuleMocks.readStartupModulePreference).not.toHaveBeenCalled();
  });

  it("preserves an explicit leaderboards return route", () => {
    expect(resolveAuthSuccessRoute("/leaderboards")).toBe("/leaderboards");
    expect(startupModuleMocks.readStartupModulePreference).not.toHaveBeenCalled();
  });
});
