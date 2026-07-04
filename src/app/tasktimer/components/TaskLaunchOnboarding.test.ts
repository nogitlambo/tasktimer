import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_INTRO,
  ONBOARDING_CHRONOTYPE_CHOICE_PROMPT,
  ONBOARDING_CHRONOTYPE_OPTIONS,
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
  toggleOnboardingChronotypeChoice,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps Finish clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding progress", () => {
  it("uses completed steps only for the first visible progress-capable step", () => {
    expect(onboardingCompletedProgressPercent(2, 8)).toBe(25);
  });

  it("keeps the final onboarding screen below complete until Finish closes onboarding", () => {
    expect(onboardingCompletedProgressPercent(7, 8)).toBe(88);
  });

  it("clamps invalid totals and step indexes", () => {
    expect(onboardingCompletedProgressPercent(4, 0)).toBe(0);
    expect(onboardingCompletedProgressPercent(4, -1)).toBe(0);
    expect(onboardingCompletedProgressPercent(-1, 8)).toBe(0);
    expect(onboardingCompletedProgressPercent(9, 8)).toBe(100);
  });

  it("hides the progress ring on the first two onboarding steps", () => {
    expect(shouldShowOnboardingProgressRing(0)).toBe(false);
    expect(shouldShowOnboardingProgressRing(1)).toBe(false);
    expect(shouldShowOnboardingProgressRing(2)).toBe(true);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("places the greeting after username before the chronotype and productivity setup steps", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual([
      "username",
      "greeting",
      "chronotypeChoice",
      "intro",
      "days",
      "hours",
      "weekStart",
      "push",
    ]);
  });

  it("uses the username greeting for the standalone greeting step", () => {
    expect(onboardingTitle("greeting", "Avery")).toBe("Good to meet you, Avery!");
    expect(ONBOARDING_GREETING_SUBTEXT).toBe("Let's set up your profile around how you work best. A few quick questions will help personalise your experience.");
  });

  it("adds a required visual chronotype choice step after the greeting", () => {
    expect(onboardingTitle("chronotypeChoice", "Avery")).toBe(ONBOARDING_CHRONOTYPE_CHOICE_PROMPT);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.label)).toEqual(["1", "2", "4", "3"]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.description)).toEqual([
      "Early riser and tend to function at my best between early to late morning, but fade by mid to late afternoon.",
      "Sleep-wake patterns align closely with the sun. Most productive from mid-morning to late afternoon.",
      "Light sleeper, prone to insomnia, and most productive from midday to early evening.",
      "Classic night owl who struggles to wake up early and doesn't reach peak productivity until the evening.",
    ]);
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

  it("hides image and subtext content on full-custom steps", () => {
    expect(shouldShowOnboardingStepImage("chronotypeChoice")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeChoice")).toBe(false);
    expect(shouldShowOnboardingStepImage("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepImage("hours")).toBe(true);
    expect(shouldShowOnboardingStepSubtext("hours")).toBe(true);
  });

  it("does not create a preference payload for visual-only steps", () => {
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
        step: "chronotypeChoice",
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

  it("blocks continuing from the chronotype choice step until a tile is selected", () => {
    expect(canContinueOnboardingStep("chronotypeChoice", [], "")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeChoice", [], "missing")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeChoice", [], "early-riser")).toBe(true);
  });

  it("toggles chronotype choice selection when the selected tile is clicked again", () => {
    expect(toggleOnboardingChronotypeChoice("", "early-riser")).toBe("early-riser");
    expect(toggleOnboardingChronotypeChoice("early-riser", "early-riser")).toBe("");
    expect(toggleOnboardingChronotypeChoice("early-riser", "night-owl")).toBe("night-owl");
    expect(canContinueOnboardingStep("chronotypeChoice", [], toggleOnboardingChronotypeChoice("early-riser", "early-riser"))).toBe(false);
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
