import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CHRONOTYPE_CHOICE_PROMPT,
  ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT,
  ONBOARDING_CHRONOTYPE_OPTIONS,
  ONBOARDING_CHRONOTYPE_CONTINUE_REVEAL_DELAY_MS,
  ONBOARDING_CHRONOTYPE_REQUIRED_MESSAGE,
  ONBOARDING_CHRONOTYPE_SELECTION_PROMPT,
  ONBOARDING_DAYS_BACKGROUND_ACCENT,
  ONBOARDING_GREETING_SUBTEXT,
  ONBOARDING_NEUTRAL_BACKGROUND_ACCENT,
  ONBOARDING_BEAR_CHRONOTYPE_SUMMARY,
  ONBOARDING_DOLPHIN_CHRONOTYPE_SUMMARY,
  ONBOARDING_LION_CHRONOTYPE_SUMMARY,
  ONBOARDING_WOLF_CHRONOTYPE_SUMMARY,
  ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME,
  ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD,
  ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT,
  ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE,
  ONBOARDING_FIRST_TASK_DEFAULT_TYPE,
  ONBOARDING_FIRST_TASK_PRESET_COLORS,
  ONBOARDING_FIRST_TASK_PRESET_DESCRIPTIONS,
  ONBOARDING_FIRST_TASK_PRESET_IMAGE_SRCS,
  ONBOARDING_FIRST_TASK_PRESET_NAMES,
  ONBOARDING_FIRST_TASK_PRESET_PARAMETER_LABELS,
  ONBOARDING_FIRST_TASK_PRESET_TIME_GOAL_VALUES,
  ONBOARDING_IMPLEMENTATION_INTENTIONS_SUBTEXT,
  ONBOARDING_IMPLEMENTATION_INTENTIONS_TITLE,
  ONBOARDING_MISSED_DAYS_PROGRESS_SUBTEXT,
  ONBOARDING_MISSED_DAYS_PROGRESS_TITLE,
  ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE,
  ONBOARDING_USERNAME_SUCCESS_TICK_MS,
  ONBOARDING_STEPS,
  canContinueOnboardingStep,
  chronotypeChoiceAfterNavigation,
  formatOnboardingChronotypeProductivityCopy,
  formatOnboardingClockTimeLabel,
  isOnboardingUsernameTakenError,
  isOnboardingContinueDisabled,
  isOnboardingContinueReservedHidden,
  isOnboardingFinishDisabled,
  shouldDelayOnboardingUsernameSuccess,
  shouldShowOnboardingUsernameConflictMark,
  normalizeOnboardingProductivityDays,
  onboardingBackgroundAccentForStep,
  onboardingBackNavigation,
  onboardingAvatarProfilePatch,
  onboardingContinueBlockedMessage,
  onboardingChronotypeResultCopy,
  onboardingChronotypeResultSummary,
  onboardingFirstTaskSelectionTitle,
  onboardingNextStepIndex,
  onboardingNextStepIndexForPhase,
  onboardingPresetTaskCreatePayload,
  onboardingPresetTaskTimeGoalLabel,
  onboardingProductivityHoursSubtext,
  shouldShowOnboardingBackAction,
  onboardingStepIndexAfterTaskCreated,
  onboardingStepIndex,
  resolveOnboardingAvatarId,
  shouldShowOnboardingStepImage,
  shouldShowOnboardingStepHeading,
  shouldShowOnboardingStepSubtext,
  shouldResetChronotypeChoiceForNavigation,
  onboardingStepPreferencePayload,
  onboardingTitle,
  resolveOnboardingChronotypeResult,
  seedOnboardingChronotypeHours,
  toggleAllOnboardingProductivityDays,
  toggleOnboardingProductivityDay,
  toggleOnboardingChronotypeChoice,
  validateOnboardingFirstTaskDetails,
} from "./TaskLaunchOnboarding";

describe("TaskLaunchOnboarding finish action", () => {
  it("keeps the final onboarding action clickable unless onboarding is busy", () => {
    expect(isOnboardingFinishDisabled(false)).toBe(false);
    expect(isOnboardingFinishDisabled(true)).toBe(true);
  });
});

describe("TaskLaunchOnboarding Continue action", () => {
  it("disables the productivity days Continue action until at least one day is selected", () => {
    expect(isOnboardingContinueDisabled(false, "days", [])).toBe(true);
    expect(isOnboardingContinueDisabled(false, "days", ["mon"])).toBe(false);
  });

  it("delays advancement only after a successful username confirmation", () => {
    expect(ONBOARDING_USERNAME_SUCCESS_TICK_MS).toBe(650);
    expect(shouldDelayOnboardingUsernameSuccess("username", true)).toBe(true);
    expect(shouldDelayOnboardingUsernameSuccess("username", false)).toBe(false);
    expect(shouldDelayOnboardingUsernameSuccess("greeting", true)).toBe(false);
  });
});

describe("TaskLaunchOnboarding steps", () => {
  it("keeps productivity hours inside the chronotype result step", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual([
      "intro",
      "username",
      "greeting",
      "chronotypeChoice",
      "chronotypeSelection",
      "chronotypeResult",
      "days",
      "missedDaysProgress",
      "firstTask",
      "firstTaskSelection",
      "implementationIntentions",
      "push",
    ]);
  });

  it("uses the username greeting for the standalone greeting step", () => {
    expect(onboardingTitle("intro", "Avery")).toBe("Intro");
    expect(onboardingTitle("username", "Avery")).toBe("Profile Setup");
    expect(onboardingTitle("greeting", "Avery")).toBe("Welcome, Avery");
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
      "Best focus from early morning to early afternoon.",
      "Most productive from mid-morning to late afternoon.",
      "Energy builds later, with strongest focus from midday to early evening.",
      "Starts slower and reaches peak focus later in the day.",
    ]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.title)).toEqual([
      "Rises early",
      "Wakes up with the sun",
      "Light sleeper",
      "Up late",
    ]);
    expect(ONBOARDING_CHRONOTYPE_OPTIONS.map((option) => option.peakWindow)).toEqual(["6 AM – 2 PM", "9 AM – 5 PM", "12 PM – 7 PM", "4 PM – 11 PM"]);
  });

  it("shows selected chronotype result copy after the choice step", () => {
    expect(onboardingTitle("chronotypeResult", "Avery", "early-riser")).toBe("Your chronotype is lion");
    expect(onboardingTitle("chronotypeResult", "Avery", "sun-aligned")).toBe("Your chronotype is bear");
    expect(onboardingTitle("chronotypeResult", "Avery", "night-owl")).toBe("Your chronotype is wolf");
    expect(onboardingTitle("chronotypeResult", "Avery", "light-sleeper")).toBe("Your chronotype is dolphin");
    expect(onboardingChronotypeResultCopy("early-riser")).toEqual([
      "It may surprise you that only ~15% of people fall into this category.",
      "Lion chronotypes are most productive between 6:00 AM and 2:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("sun-aligned")).toEqual([
      "This is the most common chronotype, with ~55% of people in this category.",
      "Bear chronotypes are most productive between 9:00 AM and 5:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("night-owl")).toEqual([
      "Wolf chronotypes account for ~15-30% of people.",
      "Wolf chronotypes are most productive between 4:00 PM and 11:00 PM.",
    ]);
    expect(onboardingChronotypeResultCopy("light-sleeper")).toEqual([
      "Dolphin chronotypes are less common, accounting for ~10-15% of people.",
      "Dolphin chronotypes are most productive between 12:00 PM and 7:00 PM.",
    ]);
    expect(formatOnboardingChronotypeProductivityCopy(resolveOnboardingChronotypeResult("early-riser")!)).toBe(
      "Lion chronotypes are most productive between 6:00 AM and 2:00 PM."
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
        { label: "Most Productive", value: "6 AM - 2 PM", accent: true },
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
        { label: "Most Productive", value: "9 AM - 5 PM", accent: true },
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
        { label: "Most Productive", value: "12 PM - 7 PM", accent: true },
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
        { label: "Most Productive", value: "4 PM - 11 PM", accent: true },
      ],
    });
    expect(onboardingChronotypeResultSummary("missing")).toBeNull();
  });

  it("keeps the productivity-days title after the chronotype result step", () => {
    expect(onboardingTitle("days", "Avery")).toBe("Productivity Days");
    expect(onboardingTitle("missedDaysProgress", "Avery")).toBe(ONBOARDING_MISSED_DAYS_PROGRESS_TITLE);
    expect(ONBOARDING_MISSED_DAYS_PROGRESS_TITLE).toBe("Missed Days Do Not Erase Progress");
    expect(ONBOARDING_MISSED_DAYS_PROGRESS_SUBTEXT).toBe(
      "A disrupted routine is not a failed routine. Returning after a difficult day is part of building the habit, not proof that you have lost it."
    );
    expect(onboardingTitle("firstTask", "Avery")).toBe("Let's add your first task");
    expect(onboardingFirstTaskSelectionTitle("specific")).toBe("Specific Task");
    expect(onboardingFirstTaskSelectionTitle("select")).toBe("Select a Task");
    expect(onboardingTitle("firstTaskSelection", "Avery", "", "specific")).toBe("Specific Task");
    expect(onboardingTitle("firstTaskSelection", "Avery", "", "select")).toBe("Select a Task");
    expect(onboardingTitle("implementationIntentions", "Avery")).toBe(ONBOARDING_IMPLEMENTATION_INTENTIONS_TITLE);
    expect(ONBOARDING_FIRST_TASK_DEFAULT_TYPE).toBe("recurring");
    expect(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE).toBe(2);
    expect(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT).toBe("minute");
    expect(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD).toBe("day");
    expect(ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME).toBe("09:00");
  });

  it("uses the notifications title for the final onboarding step", () => {
    expect(onboardingTitle("push", "Avery")).toBe("Notifications");
  });

  it("hides image and subtext content on full-custom steps", () => {
    expect(shouldShowOnboardingStepImage("intro")).toBe(true);
    expect(shouldShowOnboardingStepHeading("intro")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("intro")).toBe(false);
    expect(shouldShowOnboardingStepImage("chronotypeChoice")).toBe(true);
    expect(shouldShowOnboardingStepHeading("chronotypeChoice")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeChoice")).toBe(false);
    expect(shouldShowOnboardingStepImage("chronotypeSelection")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeSelection")).toBe(false);
    expect(shouldShowOnboardingStepImage("chronotypeResult")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("chronotypeResult")).toBe(false);
    expect(shouldShowOnboardingStepImage("missedDaysProgress")).toBe(true);
    expect(shouldShowOnboardingStepHeading("missedDaysProgress")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("missedDaysProgress")).toBe(false);
    expect(shouldShowOnboardingStepImage("firstTask")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("firstTask")).toBe(true);
    expect(shouldShowOnboardingStepImage("firstTaskSelection")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("firstTaskSelection")).toBe(false);
    expect(shouldShowOnboardingStepImage("implementationIntentions")).toBe(true);
    expect(shouldShowOnboardingStepHeading("implementationIntentions")).toBe(false);
    expect(shouldShowOnboardingStepSubtext("implementationIntentions")).toBe(false);
    expect(shouldShowOnboardingStepImage("push")).toBe(false);
  });

  it("routes the first-task branch page back into notifications", () => {
    expect(onboardingNextStepIndex("intro", onboardingStepIndex("intro"))).toBe(onboardingStepIndex("username"));
    expect(onboardingNextStepIndex("chronotypeResult", onboardingStepIndex("chronotypeResult"))).toBe(onboardingStepIndex("days"));
    expect(onboardingNextStepIndexForPhase("chronotypeResult", onboardingStepIndex("chronotypeResult"), "summary")).toBe(
      onboardingStepIndex("days")
    );
    expect(onboardingNextStepIndexForPhase("chronotypeResult", onboardingStepIndex("chronotypeResult"), "hours")).toBe(onboardingStepIndex("days"));
    expect(onboardingNextStepIndex("days", onboardingStepIndex("days"))).toBe(onboardingStepIndex("missedDaysProgress"));
    expect(onboardingNextStepIndex("missedDaysProgress", onboardingStepIndex("missedDaysProgress"))).toBe(onboardingStepIndex("firstTask"));
    expect(onboardingNextStepIndex("firstTask", onboardingStepIndex("firstTask"))).toBe(onboardingStepIndex("firstTask"));
    expect(onboardingNextStepIndex("firstTaskSelection", onboardingStepIndex("firstTaskSelection"))).toBe(
      onboardingStepIndex("implementationIntentions")
    );
    expect(onboardingNextStepIndex("implementationIntentions", onboardingStepIndex("implementationIntentions"))).toBe(onboardingStepIndex("push"));
    expect(onboardingStepIndexAfterTaskCreated()).toBe(onboardingStepIndex("implementationIntentions"));
    expect(ONBOARDING_IMPLEMENTATION_INTENTIONS_TITLE).toBe("Start Smaller Than You Think");
    expect(ONBOARDING_IMPLEMENTATION_INTENTIONS_SUBTEXT).toBe(
      "A five-minute task may feel insignificant, but it creates something motivation rarely provides on its own: momentum. Starting small makes the next step easier."
    );
    expect(isOnboardingContinueDisabled(false, "firstTask", ["mon"], "")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "firstTaskSelection", ["mon"], "", false)).toBe(true);
    expect(isOnboardingContinueDisabled(false, "firstTaskSelection", ["mon"], "", true)).toBe(false);
    expect(isOnboardingContinueReservedHidden("firstTask")).toBe(true);
  });

  it("removes Back after the onboarding task has been added", () => {
    expect(shouldShowOnboardingBackAction("intro", onboardingStepIndex("intro"))).toBe(false);
    expect(shouldShowOnboardingBackAction("firstTaskSelection", onboardingStepIndex("firstTaskSelection"))).toBe(true);
    expect(shouldShowOnboardingBackAction("implementationIntentions", onboardingStepIndex("implementationIntentions"))).toBe(false);
    expect(shouldShowOnboardingBackAction("push", onboardingStepIndex("push"))).toBe(false);
  });

  it("uses the default task parameters for select-a-task preset creation", () => {
    expect(ONBOARDING_FIRST_TASK_PRESET_NAMES).toEqual(["Tidy small area", "Movement break", "Plan next day"]);
    expect(ONBOARDING_FIRST_TASK_PRESET_TIME_GOAL_VALUES).toEqual({
      "Tidy small area": 3,
      "Movement break": 5,
      "Plan next day": 2,
    });
    expect(onboardingPresetTaskTimeGoalLabel("Tidy small area")).toBe("Goal: 3 min/day");
    expect(onboardingPresetTaskTimeGoalLabel("Movement break")).toBe("Goal: 5 min/day");
    expect(onboardingPresetTaskTimeGoalLabel("Plan next day")).toBe("Goal: 2 min/day");
    expect(ONBOARDING_FIRST_TASK_PRESET_PARAMETER_LABELS).toEqual(["Type: Recurring", "Time Goal: 2 min/day", "Scheduled Time: 9:00 AM"]);
    expect(ONBOARDING_FIRST_TASK_PRESET_DESCRIPTIONS).toEqual({
      "Tidy small area": "Even a small reduction in visual clutter can lower cognitive load.",
      "Movement break": "Movements like stretching and walking often help regulate attention and reduce restlessness.",
      "Plan next day": "Write down your top priority for tomorrow. This reduces decision paralysis when you start the day.",
    });
    expect(ONBOARDING_FIRST_TASK_PRESET_IMAGE_SRCS).toEqual({
      "Tidy small area": "/onboarding/tile_tidyarea.png",
      "Movement break": "/onboarding/tile_movement.png",
      "Plan next day": "/onboarding/tile_planday.png",
    });
    expect(Object.values(ONBOARDING_FIRST_TASK_PRESET_COLORS)).toEqual(["#f44336", "#e91e63", "#9c27b0"]);
    expect(onboardingPresetTaskCreatePayload("Brush teeth")).toEqual({
      name: "Brush teeth",
      taskType: "recurring",
      timeGoalValue: 2,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      plannedStartTime: "09:00",
    });
    expect(onboardingPresetTaskCreatePayload("  Movement break  ")).toEqual({
      name: "Movement break",
      taskType: ONBOARDING_FIRST_TASK_DEFAULT_TYPE,
      timeGoalValue: 5,
      timeGoalUnit: ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT,
      timeGoalPeriod: ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD,
      plannedStartTime: ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME,
    });
    expect(onboardingPresetTaskCreatePayload("Tidy small area").timeGoalValue).toBe(3);
    expect(onboardingPresetTaskCreatePayload("Plan next day").timeGoalValue).toBe(2);
  });

  it("validates onboarding task details before runtime creation", () => {
    expect(validateOnboardingFirstTaskDetails({ name: "Write notes", timeGoalValue: 2, plannedStartTime: "09:00" })).toBe("");
    expect(validateOnboardingFirstTaskDetails({ name: "", timeGoalValue: 2, plannedStartTime: "09:00" })).toBe("Task name is required");
    expect(validateOnboardingFirstTaskDetails({ name: "Write notes", timeGoalValue: 0, plannedStartTime: "09:00" })).toBe(
      "Enter a time amount greater than 0"
    );
    expect(validateOnboardingFirstTaskDetails({ name: "Write notes", timeGoalValue: 2, plannedStartTime: "bad" })).toBe(
      "Choose a planned start time."
    );
  });

  it("keeps the neutral background accent until the chronotype result reveal", () => {
    expect(onboardingBackgroundAccentForStep("chronotypeSelection", "#c9ff24")).toBe(ONBOARDING_NEUTRAL_BACKGROUND_ACCENT);
    expect(onboardingBackgroundAccentForStep("chronotypeResult", "#c9ff24")).toBe(ONBOARDING_NEUTRAL_BACKGROUND_ACCENT);
    expect(onboardingBackgroundAccentForStep("chronotypeResult", "#c9ff24", true)).toBe("#c9ff24");
    expect(onboardingBackgroundAccentForStep("days", "#c9ff24", true)).toBe(ONBOARDING_DAYS_BACKGROUND_ACCENT);
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
    expect(
      onboardingStepPreferencePayload({
        step: "firstTaskSelection",
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

  it("toggles selected onboarding productivity days off", () => {
    expect(toggleOnboardingProductivityDay(["mon", "tue"], "tue")).toEqual(["mon"]);
    expect(toggleOnboardingProductivityDay(["mon"], "tue")).toEqual(["mon", "tue"]);
  });

  it("blocks continuing from the chronotype selection step until a tile is selected", () => {
    expect(ONBOARDING_CHRONOTYPE_CONTINUE_REVEAL_DELAY_MS).toBe(360);
    expect(canContinueOnboardingStep("chronotypeChoice", [], "")).toBe(true);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "missing")).toBe(false);
    expect(canContinueOnboardingStep("chronotypeSelection", [], "early-riser")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeChoice", [], "")).toBe(false);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "missing")).toBe(true);
    expect(isOnboardingContinueDisabled(false, "chronotypeSelection", [], "early-riser")).toBe(false);
    expect(isOnboardingContinueDisabled(false, "days", [], "")).toBe(true);
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
    expect(chronotypeChoiceAfterNavigation("chronotypeChoice", "chronotypeSelection", "early-riser")).toBe("");
    expect(chronotypeChoiceAfterNavigation("chronotypeResult", "chronotypeSelection", "night-owl")).toBe("");
    expect(chronotypeChoiceAfterNavigation("chronotypeSelection", "chronotypeResult", "early-riser")).toBe("early-riser");
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

  it("routes Back from chronotype productivity hours to the chronotype summary", () => {
    expect(
      onboardingBackNavigation({
        activeStep: "chronotypeResult",
        chronotypeResultPhase: "hours",
        selectedChronotypeChoiceId: "early-riser",
        stepIndex: onboardingStepIndex("chronotypeResult"),
      })
    ).toEqual({
      nextStepIndex: onboardingStepIndex("chronotypeResult"),
      nextChronotypeResultPhase: "summary",
      resetChronotypeChoice: false,
    });
  });

  it("resolves chronotype metadata and conservative productivity hour defaults", () => {
    expect(resolveOnboardingChronotypeResult("early-riser")).toMatchObject({
      animal: "lion",
      imageSrc: "/onboarding/chronotype_lion.webp",
      thumbnailSrc: "/onboarding/chronotype_lion_thumbnail.webp",
      accentColor: "#ffb000",
      productivityStartTime: "06:00",
      productivityEndTime: "14:00",
    });
    expect(resolveOnboardingChronotypeResult("sun-aligned")).toMatchObject({
      animal: "bear",
      thumbnailSrc: "/onboarding/chronotype_bear_thumbnail.webp",
      accentColor: "#27bfff",
      productivityStartTime: "09:00",
      productivityEndTime: "17:00",
    });
    expect(resolveOnboardingChronotypeResult("light-sleeper")).toMatchObject({
      animal: "dolphin",
      thumbnailSrc: "/onboarding/chronotype_dolphin_thumbnail.webp",
      accentColor: "#14e7d3",
      productivityStartTime: "12:00",
      productivityEndTime: "19:00",
    });
    expect(resolveOnboardingChronotypeResult("night-owl")).toMatchObject({
      animal: "wolf",
      thumbnailSrc: "/onboarding/chronotype_wolf_thumbnail.webp",
      accentColor: "#c45cff",
      productivityStartTime: "16:00",
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
    ).toEqual({ startTime: "06:00", endTime: "14:00" });
    expect(
      seedOnboardingChronotypeHours({
        selectedChronotypeChoiceId: "night-owl",
        currentStartTime: "06:00",
        currentEndTime: "12:00",
        hoursTouched: false,
      })
    ).toEqual({ startTime: "16:00", endTime: "23:00" });
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
        "Tap to adjust these hours now, or from the Settings/Preferences menu later.",
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

  it("shows the conflict field marker only for taken usernames", () => {
    expect(shouldShowOnboardingUsernameConflictMark("That username is already taken.")).toBe(true);
    expect(shouldShowOnboardingUsernameConflictMark("Unable to update your username right now.")).toBe(false);
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
