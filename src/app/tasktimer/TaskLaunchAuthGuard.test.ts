import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_DELETION_REDIRECT_INTENT_KEY, markAccountDeletionLandingRedirectIntent } from "./lib/accountDeletionRedirectIntent";
import { resolveTaskLaunchAuthGuardAuthState, resolveTaskLaunchSignedOutRedirectTarget } from "./TaskLaunchAuthGuard";

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

describe("resolveTaskLaunchSignedOutRedirectTarget", () => {
  beforeEach(() => {
    const sessionValues = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn((key: string) => sessionValues.get(key) || null),
        removeItem: vi.fn((key: string) => {
          sessionValues.delete(key);
        }),
        setItem: vi.fn((key: string, value: string) => {
          sessionValues.set(key, value);
        }),
      },
    });
  });

  it("redirects signed-out users to login by default", () => {
    expect(resolveTaskLaunchSignedOutRedirectTarget()).toBe("/login");
    expect(window.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("redirects signed-out users to landing once after account deletion", () => {
    markAccountDeletionLandingRedirectIntent();

    expect(resolveTaskLaunchSignedOutRedirectTarget()).toBe("/");
    expect(window.sessionStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_DELETION_REDIRECT_INTENT_KEY);
    expect(resolveTaskLaunchSignedOutRedirectTarget()).toBe("/login");
  });

  it("keeps anonymous-user cleanup on the login redirect path", () => {
    expect(resolveTaskLaunchAuthGuardAuthState(true, true, true)).toBe("redirect");
    expect(resolveTaskLaunchSignedOutRedirectTarget()).toBe("/login");
  });
});
