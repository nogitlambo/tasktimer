import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_INTRO,
  ONBOARDING_GREETING_SUBTEXT,
  ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE,
  ONBOARDING_STEPS,
  canContinueOnboardingStep,
  formatOnboardingClockTimeLabel,
  isOnboardingUsernameTakenError,
  isOnboardingFinishDisabled,
  normalizeOnboardingProductivityDays,
  onboardingCompletedProgressPercent,
  onboardingAvatarProfilePatch,
  resolveOnboardingAvatarId,
  shouldShowOnboardingProgressRing,
  shouldShowOnboardingStepImage,
  shouldShowOnboardingStepSubtext,
  onboardingStepPreferencePayload,
  onboardingTitle,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps Finish clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding progress", () => {
  it("uses completed steps only for the first visible progress-capable step", () => {
    expect(onboardingCompletedProgressPercent(2, 7)).toBe(29);
  });

  it("keeps the final onboarding screen below complete until Finish closes onboarding", () => {
    expect(onboardingCompletedProgressPercent(6, 7)).toBe(86);
  });

  it("clamps invalid totals and step indexes", () => {
    expect(onboardingCompletedProgressPercent(4, 0)).toBe(0);
    expect(onboardingCompletedProgressPercent(4, -1)).toBe(0);
    expect(onboardingCompletedProgressPercent(-1, 7)).toBe(0);
    expect(onboardingCompletedProgressPercent(9, 7)).toBe(100);
  });

  it("hides the progress ring on the first two onboarding steps", () => {
    expect(shouldShowOnboardingProgressRing(0)).toBe(false);
    expect(shouldShowOnboardingProgressRing(1)).toBe(false);
    expect(shouldShowOnboardingProgressRing(2)).toBe(true);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("places the greeting after username before the chronotype and productivity setup steps", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual(["username", "greeting", "intro", "days", "hours", "weekStart", "push"]);
  });

  it("uses the username greeting for the standalone greeting step", () => {
    expect(onboardingTitle("greeting", "Avery")).toBe("Good to meet you, Avery!");
    expect(ONBOARDING_GREETING_SUBTEXT).toBe("Please take a moment to optimise your profile and complete this quick onboarding process.");
  });

  it("keeps the realistic productivity copy on the intro step", () => {
    expect(onboardingTitle("intro", "Avery")).toBe("A realistic productivity tool");
    expect(ONBOARDING_CHRONOTYPE_INTRO).toBe(
      "TaskLaunch is a time tracking app built to turn even the smallest effort into lasting habits. Plan tasks around the days and times your focus and energy are strongest, instead of forcing productivity when it does not fit."
    );
  });

  it("keeps the productivity-days title after the greeting moves to the intro step", () => {
    expect(onboardingTitle("days", "Avery")).toBe("Productivity Days");
  });

  it("uses the notifications title for the final onboarding step", () => {
    expect(onboardingTitle("push", "Avery")).toBe("Notifications");
  });

  it("hides image and subtext content on the week-start step", () => {
    expect(shouldShowOnboardingStepImage("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepImage("hours")).toBe(true);
    expect(shouldShowOnboardingStepSubtext("hours")).toBe(true);
  });

  it("does not create a preference payload for the standalone intro step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "greeting",
        weekStarting: "mon",
        selectedDays: ["mon", "tue", "wed", "thu", "fri"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toBeNull();
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
