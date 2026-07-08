import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_CHOICE_PROMPT,
  ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT,
  ONBOARDING_CHRONOTYPE_OPTIONS,
  ONBOARDING_CHRONOTYPE_REQUIRED_MESSAGE,
  ONBOARDING_CHRONOTYPE_SELECTION_PROMPT,
  ONBOARDING_DAYS_BACKGROUND_ACCENT,
  ONBOARDING_GREETING_SUBTEXT,
  ONBOARDING_NEUTRAL_BACKGROUND_ACCENT,
  ONBOARDING_BEAR_CHRONOTYPE_SUMMARY,
  ONBOARDING_DOLPHIN_CHRONOTYPE_SUMMARY,
  ONBOARDING_LION_CHRONOTYPE_SUMMARY,
  ONBOARDING_WOLF_CHRONOTYPE_SUMMARY,
  ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE,
  ONBOARDING_STEPS,
  canContinueOnboardingStep,
  formatOnboardingChronotypeProductivityCopy,
  formatOnboardingClockTimeLabel,
  isOnboardingUsernameTakenError,
  isOnboardingContinueDisabled,
  isOnboardingContinueReservedHidden,
  isOnboardingFinishDisabled,
  normalizeOnboardingProductivityDays,
  onboardingBackgroundAccentForStep,
  onboardingBackNavigation,
  onboardingAvatarProfilePatch,
  onboardingContinueBlockedMessage,
  onboardingChronotypeResultCopy,
  onboardingChronotypeResultSummary,
  onboardingProductivityHoursSubtext,
  resolveOnboardingAvatarId,
  shouldShowOnboardingStepImage,
  shouldShowOnboardingStepSubtext,
  shouldResetChronotypeChoiceForNavigation,
  onboardingStepPreferencePayload,
  onboardingTitle,
  resolveOnboardingChronotypeResult,
  seedOnboardingChronotypeHours,
  toggleAllOnboardingProductivityDays,
  toggleOnboardingChronotypeChoice,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps Finish clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("keeps productivity hours inside the chronotype result step", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual([
      "username",
      "greeting",
      "chronotypeChoice",
      "chronotypeSelection",
      "chronotypeResult",
      "days",
      "firstTask",
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
      "Your chronotype reflects your natural daily rhythm, including when your focus and energy are at peak levels.",
      "TaskLaunch applies that rhythm to guide smarter task planning and place tasks where they fit best.",
    ]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.label)).toEqual(["1", "2", "4", "3"]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.description)).toEqual([
      "Rises early, tends to function best between early morning to early afternoon.",
      "Wakes up with the sun. Most productive from mid-morning to late afternoon.",
      "Light sleeper, prone to insomnia, and most productive from midday to early evening.",
      "Night owl who struggles to wake up early and doesn't reach peak productivity until the evening.",
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

  it("resolves chronotype result summaries that use the styled summary step", () => {
    expect(onboardingChronotypeResultSummary("early-riser")).toEqual(ONBOARDING_LION_CHRONOTYPE_SUMMARY);
    expect(onboardingChronotypeResultSummary("early-riser")).toMatchObject({
      animal: "lion",
      animalLabel: "Lion",
      emblemSrc: "/onboarding/lion.webp",
      percentage: "15%",
      headingCopy: "of people are Lion chronotypes.",
      bodyCopy: "Lions prefer to wake up early. They are disciplined starters and are often most productive in the first half of the day.",
      stats: [
        { label: "Most Productive", value: "9 AM - 2 PM", accent: true },
      ],
    });
    expect(onboardingChronotypeResultSummary("sun-aligned")).toEqual(ONBOARDING_BEAR_CHRONOTYPE_SUMMARY);
    expect(onboardingChronotypeResultSummary("sun-aligned")).toMatchObject({
      animal: "bear",
      animalLabel: "Bear",
      emblemSrc: "/onboarding/bear.webp",
      percentage: "55%",
      headingCopy: "of people are Bear chronotypes.",
      bodyCopy:
        "Bears tend to follow a steady daytime rhythm. They feel best with a balanced routine and are often most productive from late morning into the afternoon.",
      stats: [
        { label: "Most Productive", value: "10 AM - 3 PM", accent: true },
      ],
    });
    expect(onboardingChronotypeResultSummary("light-sleeper")).toEqual(ONBOARDING_DOLPHIN_CHRONOTYPE_SUMMARY);
    expect(onboardingChronotypeResultSummary("light-sleeper")).toMatchObject({
      animal: "dolphin",
      animalLabel: "Dolphin",
      emblemSrc: "/onboarding/dolphin.webp",
      percentage: "10-15%",
      headingCopy: "of people are Dolphin chronotypes.",
      bodyCopy:
        "Dolphins are light sleepers with a more sensitive rhythm. They often do best with flexible routines and can find their strongest focus from afternoon into evening.",
      stats: [
        { label: "Most Productive", value: "3 PM - 9 PM", accent: true },
      ],
    });
    expect(onboardingChronotypeResultSummary("night-owl")).toEqual(ONBOARDING_WOLF_CHRONOTYPE_SUMMARY);
    expect(onboardingChronotypeResultSummary("night-owl")).toMatchObject({
      animal: "wolf",
      animalLabel: "Wolf",
      emblemSrc: "/onboarding/wolf.webp",
      percentage: "15-30%",
      headingCopy: "of people are Wolf chronotypes.",
      bodyCopy:
        "Wolves naturally lean later in the day. They may struggle with early starts and often reach their strongest focus in the evening.",
      stats: [
        { label: "Most Productive", value: "5 PM - 11 PM", accent: true },
      ],
    });
    expect(onboardingChronotypeResultSummary("missing")).toBeNull();
  });

  it("keeps the productivity-days title after the chronotype result step", () => {
    expect(onboardingTitle("days", "Avery")).toBe("Productivity Days");
    expect(onboardingTitle("firstTask", "Avery")).toBe("Let's create your first task");
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
    expect(shouldShowOnboardingStepImage("firstTask")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("firstTask")).toBe(false);
    expect(shouldShowOnboardingStepImage("push")).toBe(false);
  });

  it("keeps the neutral background accent until the chronotype result reveal", () => {
    expect(onboardingBackgroundAccentForStep("chronotypeSelection", "#ffad33")).toBe(ONBOARDING_NEUTRAL_BACKGROUND_ACCENT);
    expect(onboardingBackgroundAccentForStep("chronotypeResult", "#ffad33")).toBe(ONBOARDING_NEUTRAL_BACKGROUND_ACCENT);
    expect(onboardingBackgroundAccentForStep("chronotypeResult", "#ffad33", true)).toBe("#ffad33");
    expect(onboardingBackgroundAccentForStep("days", "#ffad33", true)).toBe(ONBOARDING_DAYS_BACKGROUND_ACCENT);
  });

  it("does not create a preference payload for visual-only steps", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "greeting",
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
        selectedDays: ["mon", "tue", "wed", "thu", "fri"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: false,
        pushTouched: false,
      })
    ).toBeNull();
    expect(
      onboardingStepPreferencePayload({
        step: "firstTask",
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
        selectedDays: ["mon"],
        startTime: "09:00",
        endTime: "17:00",
        pushEnabled: true,
        pushTouched: true,
      })
    ).toEqual({ pushNotificationsEnabled: true });
  });

  it("saves productivity hours on the productivity hours step", () => {
    expect(
      onboardingStepPreferencePayload({
        step: "hours",
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

  it("toggles all onboarding productivity days on and off", () => {
    expect(toggleAllOnboardingProductivityDays(["mon", "wed"])).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(toggleAllOnboardingProductivityDays(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).toEqual([]);
    expect(toggleAllOnboardingProductivityDays([])).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
  });

  it("blocks continuing from the chronotype selection step until a tile is selected", () => {
    expect(canContinueOnboardingStep("chronotypeChoice", [], "")).toBe(true);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "missing")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "early-riser")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeChoice", [], "")).toBe(false);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "missing")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "early-riser")).toBe(false);
    expect(isOnboardingContinueDisabled(false, "days", [], "")).toBe(false);
    expect(isOnboardingContinueDisabled(true, "chronotypeSelection", [], "early-riser")).toBe(true);
    expect(isOnboardingContinueReservedHidden("chronotypeChoice", "")).toBe(false);
    expect(isOnboardingContinueReservedHidden("chronotypeSelection", "")).toBe(true);
    expect(isOnboardingContinueReservedHidden("chronotypeSelection", "missing")).toBe(true);
    expect(isOnboardingContinueReservedHidden("chronotypeSelection", "early-riser")).toBe(false);
    expect(isOnboardingContinueReservedHidden("days", "")).toBe(false);
    expect(onboardingContinueBlockedMessage("chronotypeSelection")).toBe(ONBOARDING_CHRONOTYPE_REQUIRED_MESSAGE);
    expect(onboardingContinueBlockedMessage("chronotypeSelection")).toBe("Please select one option");
    expect(onboardingContinueBlockedMessage("days")).toBe("Select at least one productivity day before continuing.");
  });

  it("toggles chronotype choice selection when the selected tile is clicked again", () => {
    expect(toggleOnboardingChronotypeChoice("", "early-riser")).toBe("early-riser");
    expect(toggleOnboardingChronotypeChoice("early-riser", "early-riser")).toBe("");
    expect(toggleOnboardingChronotypeChoice("early-riser", "night-owl")).toBe("night-owl");
    expect(canContinueOnboardingStep("chronotypeSelection", [], toggleOnboardingChronotypeChoice("early-riser", "early-riser"))).toBe(false);
  });

  it("clears chronotype choice when backing out of or returning to the selection step", () => {
    expect(shouldResetChronotypeChoiceForNavigation("chronotypeSelection", "chronotypeChoice")).toBe(true);
    expect(shouldResetChronotypeChoiceForNavigation("chronotypeResult", "chronotypeSelection")).toBe(true);
    expect(shouldResetChronotypeChoiceForNavigation("chronotypeChoice", "chronotypeSelection")).toBe(true);
    expect(shouldResetChronotypeChoiceForNavigation("chronotypeSelection", "chronotypeResult")).toBe(false);
    expect(shouldResetChronotypeChoiceForNavigation("chronotypeResult", "days")).toBe(false);
  });

  it("deselects the selected chronotype in place when backing on the selection step", () => {
    const selectionStepIndex = ONBOARDING_STEPS.findIndex((step) => step.key === "chronotypeSelection");
    const choiceStepIndex = ONBOARDING_STEPS.findIndex((step) => step.key === "chronotypeChoice");

    expect(
      onboardingBackNavigation({
        activeStep: "chronotypeSelection",
        chronotypeResultPhase: "summary",
        selectedChronotypeChoiceId: "early-riser",
        stepIndex: selectionStepIndex,
      })
    ).toEqual({
      nextStepIndex: selectionStepIndex,
      nextChronotypeResultPhase: "summary",
      resetChronotypeChoice: true,
    });

    expect(
      onboardingBackNavigation({
        activeStep: "chronotypeSelection",
        chronotypeResultPhase: "summary",
        selectedChronotypeChoiceId: "",
        stepIndex: selectionStepIndex,
      })
    ).toEqual({
      nextStepIndex: choiceStepIndex,
      nextChronotypeResultPhase: "summary",
      resetChronotypeChoice: true,
    });
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

  it("describes productivity hours scheduling before manual fine-tuning", () => {
    expect(onboardingProductivityHoursSubtext()).toBe(
      [
        "When you create scheduled tasks, TaskLaunch will automatically try to fit it within your productivity hours.",
        "You can adjust these hours now, or from Settings/Preferences later.",
      ].join("\n\n")
    );
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
