import { describe, expect, it } from "vitest";

import { resolveTaskLaunchAuthGuardAuthState } from "./TaskLaunchAuthGuard";

describe("resolveTaskLaunchAuthGuardAuthState", () => {
  it("allows signed-out users when guest access is enabled", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(false, false)).toBe("ready");
  });

  it("redirects signed-out users when auth is required", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, false)).toBe("redirect");
  });

  it("allows authenticated users when auth is required", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, true)).toBe("ready");
  });
});
