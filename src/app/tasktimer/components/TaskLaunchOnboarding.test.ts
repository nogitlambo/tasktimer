import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_INTRO,
  ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE,
  ONBOARDING_STEPS,
  canContinueOnboardingStep,
  formatOnboardingClockTimeLabel,
  isOnboardingUsernameTakenError,
  isOnboardingFinishDisabled,
  normalizeOnboardingProductivityDays,
  onboardingAvatarProfilePatch,
  resolveOnboardingAvatarId,
  onboardingStepPreferencePayload,
  onboardingTitle,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps Finish clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("places the chronotype intro after username before the productivity setup steps", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual(["username", "intro", "days", "hours", "push", "weekStart"]);
  });

  it("uses the username greeting for the standalone intro step", () => {
    expect(onboardingTitle("intro", "Avery")).toBe("Good to meet you, Avery!");
    expect(ONBOARDING_CHRONOTYPE_INTRO).toBe(
      "Most productivity tools organize your time. TaskLaunch goes a step further by using chronotype alignment to help you match demanding work with your peak focus periods, so you can achieve more with less mental strain."
    );
  });

  it("keeps the productivity-days title after the greeting moves to the intro step", () => {
    expect(onboardingTitle("days", "Avery")).toBe("Productivity Days");
  });

  it("uses the week-start title for the final onboarding step", () => {
    expect(onboardingTitle("weekStart", "Avery")).toBe("Week Start");
  });

  it("does not create a preference payload for the standalone intro step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "intro",
        weekStarting: "mon",
        selectedDays: ["mon", "tue", "wed", "thu", "fri"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toBeNull();
  });

  it("saves only productivity days on the productivity days step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "days",
        weekStarting: "sun",
        selectedDays: ["mon", "wed"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toEqual({ optimalProductivityDays: ["mon", "wed"] });
  });

  it("saves push notifications only when touched on the notifications step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "push",
        weekStarting: "sun",
        selectedDays: ["mon"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toBeNull();
    expect(
      onboardingStepPreferencePayload({
        step: "push",
        weekStarting: "sun",
        selectedDays: ["mon"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: true,
        pushTouched: true,
      })
    ).toEqual({ pushNotificationsEnabled: true });
  });

  it("saves week start on the week-start step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "weekStart",
        weekStarting: "sun",
        selectedDays: ["mon"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toEqual({ weekStarting: "sun" });
  });

  it("saves productivity hours on the productivity hours step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "hours",
        weekStarting: "sun",
        selectedDays: ["mon"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toEqual({
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "17:00",
    });
  });

  it("allows an empty onboarding productivity day draft and blocks continuing", () => {
    expect(normalizeOnboardingProductivityDays([])).toEqual([]);
    expect(canContinueOnboardingStep("days", [])).toBe(false);
    expect(canContinueOnboardingStep("days", ["mon"])).toBe(true);
  });

  it("formats productivity hour values as clock labels", () => {
    expect(formatOnboardingClockTimeLabel("09:00", "08:00")).toBe("9:00 AM");
    expect(formatOnboardingClockTimeLabel("17:00", "08:00")).toBe("5:00 PM");
    expect(formatOnboardingClockTimeLabel("not-a-time", "08:30")).toBe("8:30 AM");
  });

  it("identifies the taken username error for Step 1 inline messaging", () => {
    expect(isOnboardingUsernameTakenError("That username is already taken.")).toBe(true);
    expect(isOnboardingUsernameTakenError(" That username is already taken. ")).toBe(true);
    expect(isOnboardingUsernameTakenError("Unable to update your username right now.")).toBe(false);
    expect(ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE).toBe("That username is already taken. Try another one.");
  });

  it("prefers a saved catalog avatar before falling back to random selection", () => {
    const avatars = [{ id: "one" }, { id: "two" }, { id: "three" }];

    expect(resolveOnboardingAvatarId("two", avatars, 0)).toBe("two");
    expect(resolveOnboardingAvatarId("missing", avatars, 0.7)).toBe("three");
    expect(resolveOnboardingAvatarId("", avatars, 0)).toBe("one");
    expect(resolveOnboardingAvatarId("", [], 0)).toBe("");
  });

  it("builds the onboarding avatar profile patch with custom avatar data cleared", () => {
    expect(onboardingAvatarProfilePatch("toons/toon-01-cap-glasses")).toEqual({
      avatarId: "toons/toon-01-cap-glasses",
      avatarCustomSrc: null,
    });
  });
});
