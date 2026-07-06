import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_CHOICE_PROMPT,
  ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT,
  ONBOARDING_CHRONOTYPE_OPTIONS,
  ONBOARDING_CHRONOTYPE_SELECTION_PROMPT,
  ONBOARDING_GREETING_SUBTEXT,
  ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE,
  ONBOARDING_STEPS,
  canContinueOnboardingStep,
  formatOnboardingChronotypeProductivityCopy,
  formatOnboardingClockTimeLabel,
  isOnboardingUsernameTakenError,
  isOnboardingFinishDisabled,
  normalizeOnboardingProductivityDays,
  onboardingAvatarProfilePatch,
  onboardingChronotypeResultCopy,
  resolveOnboardingAvatarId,
  shouldShowOnboardingStepImage,
  shouldShowOnboardingStepSubtext,
  onboardingStepPreferencePayload,
  onboardingTitle,
  resolveOnboardingChronotypeResult,
  seedOnboardingChronotypeHours,
  toggleOnboardingChronotypeChoice,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps Finish clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("places productivity hours before productivity days", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual([
      "username",
      "greeting",
      "chronotypeChoice",
      "chronotypeSelection",
      "chronotypeResult",
      "hours",
      "days",
      "weekStart",
      "push",
    ]);
  });

  it("uses the username greeting for the standalone greeting step", () => {
    expect(onboardingTitle("greeting", "Avery")).toBe("Good to meet you, Avery!");
    expect(ONBOARDING_GREETING_SUBTEXT).toBe("Let's set up your profile around how you work best. A few quick questions will help personalise your experience.");
  });

  it("adds chronotype information and selection steps after the greeting", () => {
    expect(onboardingTitle("chronotypeChoice", "Avery")).toBe(ONBOARDING_CHRONOTYPE_CHOICE_PROMPT);
    expect(onboardingTitle("chronotypeSelection", "Avery")).toBe(ONBOARDING_CHRONOTYPE_SELECTION_PROMPT);
    expect(ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT).toEqual([
      "Your chronotype reflects the times of day when your energy and focus are at peak levels.",
      "There are four commonly recognised chronotypes, each represented by an animal with its own natural pattern of energy, focus, and rest.",
    ]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.label)).toEqual(["1", "2", "4", "3"]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.description)).toEqual([
      "Early riser, and tend to function best between early morning to early afternoon.",
      "Sleep-wake patterns align closely with the sun. Most productive from mid-morning to late afternoon.",
      "Light sleeper, prone to insomnia, and most productive from midday to early evening.",
      "Classic night owl who struggles to wake up early and doesn't reach peak productivity until the evening.",
    ]);
  });

  it("shows selected chronotype result copy after the choice step", () => {
    expect(onboardingTitle("chronotypeResult", "Avery", "early-riser")).toBe("Your chronotype is lion");
    expect(onboardingTitle("chronotypeResult", "Avery", "sun-aligned")).toBe("Your chronotype is bear");
    expect(onboardingTitle("chronotypeResult", "Avery", "night-owl")).toBe("Your chronotype is wolf");
    expect(onboardingTitle("chronotypeResult", "Avery", "light-sleeper")).toBe("Your chronotype is dolphin");
    expect(onboardingChronotypeResultCopy("early-riser")).toEqual([
      "It may surprise you that only ~15% of people fall into this category.",
      "Lion chronotypes are most productive between 9:00 AM and 2:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("sun-aligned")).toEqual([
      "This is the most common chronotype, with ~55% of people in this category.",
      "Bear chronotypes are most productive between 10:00 AM and 3:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("night-owl")).toEqual([
      "Wolf chronotypes account for ~15-30% of people.",
      "Wolf chronotypes are most productive between 5:00 PM and 11:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("light-sleeper")).toEqual([
      "Dolphin chronotypes are less common, accounting for ~10-15% of people.",
      "Dolphin chronotypes are most productive between 3:00 PM and 9:00 PM.",
    ]);
    expect(formatOnboardingChronotypeProductivityCopy(resolveOnboardingChronotypeResult("early-riser")!)).toBe(
      "Lion chronotypes are most productive between 9:00 AM and 2:00 PM."
    );
  });

  it("keeps the productivity-days title after the chronotype result step", () => {
    expect(onboardingTitle("days", "Avery")).toBe("Productivity Days");
  });

  it("uses the notifications title for the final onboarding step", () => {
    expect(onboardingTitle("push", "Avery")).toBe("Notifications");
  });

  it("hides image and subtext content on full-custom steps", () => {
    expect(shouldShowOnboardingStepImage("chronotypeChoice")).toBe(true);
    expect(shouldShowOnboardingStepSubtext("chronotypeChoice")).toBe(false);
    expect(shouldShowOnboardingStepImage("chronotypeSelection")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeSelection")).toBe(false);
    expect(shouldShowOnboardingStepImage("chronotypeResult")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeResult")).toBe(false);
    expect(shouldShowOnboardingStepImage("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("weekStart")).toBe(false);
    expect(shouldShowOnboardingStepImage("push")).toBe(false);
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
        step: "chronotypeSelection",
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
        step: "chronotypeResult",
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

  it("blocks continuing from the chronotype selection step until a tile is selected", () => {
    expect(canContinueOnboardingStep("chronotypeChoice", [], "")).toBe(true);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "missing")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "early-riser")).toBe(true);
  });

  it("toggles chronotype choice selection when the selected tile is clicked again", () => {
    expect(toggleOnboardingChronotypeChoice("", "early-riser")).toBe("early-riser");
    expect(toggleOnboardingChronotypeChoice("early-riser", "early-riser")).toBe("");
    expect(toggleOnboardingChronotypeChoice("early-riser", "night-owl")).toBe("night-owl");
    expect(canContinueOnboardingStep("chronotypeSelection", [], toggleOnboardingChronotypeChoice("early-riser", "early-riser"))).toBe(false);
  });

  it("resolves chronotype metadata and conservative productivity hour defaults", () => {
    expect(resolveOnboardingChronotypeResult("early-riser")).toMatchObject({
      animal: "lion",
      imageSrc: "/onboarding/chronotype_lion.webp",
      thumbnailSrc: "/onboarding/chronotype_lion_thumbnail.webp",
      accentColor: "#ffad33",
      productivityStartTime: "09:00",
      productivityEndTime: "14:00",
    });
    expect(resolveOnboardingChronotypeResult("sun-aligned")).toMatchObject({
      animal: "bear",
      thumbnailSrc: "/onboarding/chronotype_bear_thumbnail.webp",
      accentColor: "#4db8ff",
      productivityStartTime: "10:00",
      productivityEndTime: "15:00",
    });
    expect(resolveOnboardingChronotypeResult("light-sleeper")).toMatchObject({
      animal: "dolphin",
      thumbnailSrc: "/onboarding/chronotype_dolphin_thumbnail.webp",
      accentColor: "#35d7dc",
      productivityStartTime: "15:00",
      productivityEndTime: "21:00",
    });
    expect(resolveOnboardingChronotypeResult("night-owl")).toMatchObject({
      animal: "wolf",
      thumbnailSrc: "/onboarding/chronotype_wolf_thumbnail.webp",
      accentColor: "#b58cff",
      productivityStartTime: "17:00",
      productivityEndTime: "23:00",
    });
  });

  it("seeds chronotype hours only before manual edits", () => {
    expect(
      seedOnboardingChronotypeHours({
        selectedChronotypeChoiceId: "early-riser",
        currentStartTime: "09:00",
        currentEndTime: "17:00",
        hoursTouched: false,
      })
    ).toEqual({ startTime: "09:00", endTime: "14:00" });
    expect(
      seedOnboardingChronotypeHours({
        selectedChronotypeChoiceId: "night-owl",
        currentStartTime: "06:00",
        currentEndTime: "12:00",
        hoursTouched: false,
      })
    ).toEqual({ startTime: "17:00", endTime: "23:00" });
    expect(
      seedOnboardingChronotypeHours({
        selectedChronotypeChoiceId: "sun-aligned",
        currentStartTime: "08:30",
        currentEndTime: "14:30",
        hoursTouched: true,
      })
    ).toEqual({ startTime: "08:30", endTime: "14:30" });
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
