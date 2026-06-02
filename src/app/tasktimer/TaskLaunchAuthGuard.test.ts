import { describe, expect, it } from "vitest";

import { resolveTaskLaunchAuthGuardAuthState } from "./TaskLaunchAuthGuard";

describe("resolveTaskLaunchAuthGuardAuthState", () => {
  it("redirects signed-out users when auth is required", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, false)).toBe("redirect");
  });

  it("redirects anonymous users when auth is required", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, true, true)).toBe("redirect");
  });

  it("allows authenticated users when auth is required", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, true, false)).toBe("ready");
  });
});
