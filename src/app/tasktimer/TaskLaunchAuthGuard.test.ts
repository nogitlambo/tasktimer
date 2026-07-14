import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_DELETION_REDIRECT_INTENT_KEY, markAccountDeletionLandingRedirectIntent } from "./lib/accountDeletionRedirectIntent";
import {
  resolveTaskLaunchAuthGuardAuthState,
  resolveTaskLaunchPushAlertPreferences,
  resolveTaskLaunchSignedOutRedirectTarget,
} from "./TaskLaunchAuthGuard";

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

describe("resolveTaskLaunchPushAlertPreferences", () => {
  it("uses canonical resolved defaults for a signed-in user without cached preferences", () => {
    const readSignedOutFallback = vi.fn(() => ({
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: true,
    }));

    expect(
      resolveTaskLaunchPushAlertPreferences({
        isSignedIn: true,
        cachedPreferences: null,
        resolvedPreferences: {
          mobilePushAlertsEnabled: false,
          webPushAlertsEnabled: false,
        },
        readSignedOutFallback,
      })
    ).toEqual({
      mobilePushAlertsEnabled: false,
      webPushAlertsEnabled: false,
    });
    expect(readSignedOutFallback).not.toHaveBeenCalled();
  });

  it("preserves local fallback for signed-out and pre-auth preference reads", () => {
    const readSignedOutFallback = vi.fn(() => ({
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: false,
    }));

    expect(
      resolveTaskLaunchPushAlertPreferences({
        isSignedIn: false,
        cachedPreferences: null,
        resolvedPreferences: null,
        readSignedOutFallback,
      })
    ).toEqual({
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: false,
    });
    expect(readSignedOutFallback).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit cache for signed-in users", () => {
    const readSignedOutFallback = vi.fn(() => ({
      mobilePushAlertsEnabled: false,
      webPushAlertsEnabled: false,
    }));

    expect(
      resolveTaskLaunchPushAlertPreferences({
        isSignedIn: true,
        cachedPreferences: {
          mobilePushAlertsEnabled: true,
          webPushAlertsEnabled: false,
        },
        resolvedPreferences: {
          mobilePushAlertsEnabled: false,
          webPushAlertsEnabled: false,
        },
        readSignedOutFallback,
      })
    ).toEqual({
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: false,
    });
    expect(readSignedOutFallback).not.toHaveBeenCalled();
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
