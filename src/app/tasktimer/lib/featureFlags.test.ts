import { afterEach, describe, expect, it } from "vitest";

import { isArchieEnabled, isOnboardingEnabled } from "./featureFlags";

const originalArchieFlag = process.env.NEXT_PUBLIC_ENABLE_ARCHIE;
const originalOnboardingFlag = process.env.NEXT_PUBLIC_ENABLE_ONBOARDING;

describe("feature flags", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_ARCHIE = originalArchieFlag;
    process.env.NEXT_PUBLIC_ENABLE_ONBOARDING = originalOnboardingFlag;
  });

  it("defaults both flags to enabled", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_ARCHIE;
    delete process.env.NEXT_PUBLIC_ENABLE_ONBOARDING;

    expect(isArchieEnabled()).toBe(true);
    expect(isOnboardingEnabled()).toBe(true);
  });

  it("accepts explicit false values", () => {
    process.env.NEXT_PUBLIC_ENABLE_ARCHIE = "false";
    process.env.NEXT_PUBLIC_ENABLE_ONBOARDING = "0";

    expect(isArchieEnabled()).toBe(false);
    expect(isOnboardingEnabled()).toBe(false);
  });

  it("normalizes common truthy and falsy strings", () => {
    process.env.NEXT_PUBLIC_ENABLE_ARCHIE = "off";
    process.env.NEXT_PUBLIC_ENABLE_ONBOARDING = "YES";

    expect(isArchieEnabled()).toBe(false);
    expect(isOnboardingEnabled()).toBe(true);
  });
});
