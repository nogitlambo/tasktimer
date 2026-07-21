"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { AVATAR_CATALOG, type AvatarOption } from "../lib/avatarCatalog";
import { ADD_TASK_PRESET_NAMES } from "../lib/addTaskNames";
import { syncOwnFriendshipProfile } from "../lib/friendsStore";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import { TASK_COLOR_PALETTE } from "../lib/taskColors";
import {
  TASKTIMER_ONBOARDING_DEFAULT_END_TIME,
  TASKTIMER_ONBOARDING_DEFAULT_START_TIME,
  buildTaskTimerOnboardingPreferenceDraft,
  consumePendingEmailLinkOnboardingHint,
  loadRemoteTaskTimerOnboardingState,
  loadTaskTimerOnboardingPreferencePresence,
  readLocalTaskTimerOnboardingNewUserHint,
  readLocalTaskTimerOnboardingState,
  saveTaskTimerOnboardingState,
  shouldAutoOpenTaskTimerOnboarding,
  type TaskTimerOnboardingPreferencePresence,
} from "../lib/onboarding";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import { DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS, OPTIMAL_PRODUCTIVITY_DAY_LABELS, normalizeTimeOfDay } from "../lib/productivityPeriod";
import {
  ACCOUNT_PROFILE_UPDATED_EVENT,
  notifyAccountAvatarUpdated,
  notifyAccountProfileUpdated,
  readStoredAvatarId,
  writeStoredAvatarId,
} from "../lib/accountProfileStorage";
import {
  TASKTIMER_OPEN_ONBOARDING_EVENT,
  createOnboardingTaskViaRuntime,
  getOnboardingTaskDefaultsViaRuntime,
  resolveOnboardingCreateTaskError,
  resolveOnboardingPreferenceError,
  saveOnboardingPreferencesViaRuntime,
  type TaskTimerOnboardingTaskType,
  type TaskTimerOnboardingTimeGoalPeriod,
  type TaskTimerOnboardingTimeGoalUnit,
} from "../client/onboarding-events";
import { dispatchModuleIntroTourStartEvent } from "../client/module-intro-tour";
import { getErrorMessage, loadClaimedUsername, saveUserDocPatch, updateAliasFlow } from "./settings/settingsAccountService";

type TaskLaunchOnboardingProps = {
  preferences: UserPreferencesV1 | null;
};

export type StepKey =
  | "username"
  | "greeting"
  | "chronotypeChoice"
  | "chronotypeSelection"
  | "chronotypeResult"
  | "showingUpProgress"
  | "days"
  | "missedDaysProgress"
  | "firstTask"
  | "firstTaskSelection"
  | "implementationIntentions"
  | "push";
type OnboardingTimeField = "start" | "end";
export type ChronotypeResultPhase = "summary" | "hours";

export const ONBOARDING_GREETING_SUBTEXT = "Let's set up your profile around how you work best. A few quick questions will help personalise your experience.";

export const ONBOARDING_CHRONOTYPE_CHOICE_PROMPT = "Do you know your chronotype?";
export const ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT = [
  "Your chronotype reflects your natural daily rhythm, including when your focus and energy are at peak levels.",
  "TaskLaunch applies that rhythm to guide smarter task planning and place tasks where they fit best.",
] as const;
export const ONBOARDING_CHRONOTYPE_SELECTION_PROMPT = "Which best describes you?";
export const ONBOARDING_NEUTRAL_BACKGROUND_ACCENT = "rgba(170, 178, 190, .46)";
export const ONBOARDING_DAYS_BACKGROUND_ACCENT = "rgba(54, 58, 66, .58)";
export type OnboardingFirstTaskChoiceId = "specific" | "select";
export const ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE = 2;
export const ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT: TaskTimerOnboardingTimeGoalUnit = "minute";
export const ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD: TaskTimerOnboardingTimeGoalPeriod = "day";
export const ONBOARDING_FIRST_TASK_DEFAULT_TYPE: TaskTimerOnboardingTaskType = "recurring";
export const ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME = "09:00";
export const ONBOARDING_FIRST_TASK_PRESET_PARAMETER_LABELS = ["Type: Recurring", "Time Goal: 2 min/day", "Scheduled Time: 9:00 AM"] as const;
export const ONBOARDING_FIRST_TASK_PRESET_TIME_GOAL_VALUES: Readonly<Record<string, number>> = {
  "Tidy small area": 3,
  "Movement break": 5,
  "Plan next day": 2,
};
export const ONBOARDING_FIRST_TASK_PRESET_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "Tidy small area": "Even a small reduction in visual clutter can lower cognitive load.",
  "Movement break": "Movements like stretching and walking often help regulate attention and reduce restlessness.",
  "Plan next day": "Write down your top priority for tomorrow. This reduces decision paralysis when you start the day.",
};
export const ONBOARDING_FIRST_TASK_PRESET_IMAGE_SRCS: Readonly<Record<string, string>> = {
  "Tidy small area": "/onboarding/tile_tidyarea.png",
  "Movement break": "/onboarding/tile_movement.png",
  "Plan next day": "/onboarding/tile_planday.png",
};
export const ONBOARDING_FIRST_TASK_PRESET_COLORS: Readonly<Record<string, string>> = {
  "Tidy small area": TASK_COLOR_PALETTE[0],
  "Movement break": TASK_COLOR_PALETTE[1],
  "Plan next day": TASK_COLOR_PALETTE[2],
};
export const ONBOARDING_FIRST_TASK_PRESET_NAMES = ADD_TASK_PRESET_NAMES.filter((presetName) => presetName !== "Brush teeth");
export const ONBOARDING_SHOWING_UP_PROGRESS_TITLE = "Focus on Showing Up";
export const ONBOARDING_SHOWING_UP_PROGRESS_SUBTEXT =
  "Some days will produce major progress. Others may only produce a few focused minutes. Both matter, because showing up keeps the habit alive.";
export const ONBOARDING_MISSED_DAYS_PROGRESS_TITLE = "Missed Days Do Not Erase Progress";
export const ONBOARDING_MISSED_DAYS_PROGRESS_SUBTEXT =
  "A disrupted routine is not a failed routine. Returning after a difficult day is part of building the habit, not proof that you have lost it.";
export const ONBOARDING_IMPLEMENTATION_INTENTIONS_TITLE = "Your brain responds to precision";
export const ONBOARDING_IMPLEMENTATION_INTENTIONS_SUBTEXT =
  "Vague goals create vague results.\n\nResearch on implementation intentions shows that people who define exactly what they plan to do are two to three times more likely to follow through. You've already taken that first step, which means you're no longer just thinking about change. You're building a clear path towards making it happen.";

export const ONBOARDING_STEPS: ReadonlyArray<{ key: StepKey; title: string }> = [
  { key: "username", title: "Username" },
  { key: "greeting", title: "Greeting" },
  { key: "chronotypeChoice", title: ONBOARDING_CHRONOTYPE_CHOICE_PROMPT },
  { key: "chronotypeSelection", title: ONBOARDING_CHRONOTYPE_SELECTION_PROMPT },
  { key: "chronotypeResult", title: "Chronotype Result" },
  { key: "showingUpProgress", title: ONBOARDING_SHOWING_UP_PROGRESS_TITLE },
  { key: "days", title: "Productivity Days" },
  { key: "missedDaysProgress", title: ONBOARDING_MISSED_DAYS_PROGRESS_TITLE },
  { key: "firstTask", title: "Let's add your first task" },
  { key: "firstTaskSelection", title: "Specific Task" },
  { key: "implementationIntentions", title: ONBOARDING_IMPLEMENTATION_INTENTIONS_TITLE },
  { key: "push", title: "Notifications" },
];

export function onboardingStepIndex(step: StepKey) {
  const index = ONBOARDING_STEPS.findIndex((item) => item.key === step);
  return index >= 0 ? index : 0;
}

export function onboardingFirstTaskSelectionTitle(choiceId: OnboardingFirstTaskChoiceId | "" = "") {
  return choiceId === "select" ? "Select a Task" : "Specific Task";
}

export function onboardingNextStepIndex(activeStep: StepKey, stepIndex: number) {
  if (activeStep === "showingUpProgress") return onboardingStepIndex("chronotypeResult");
  if (activeStep === "firstTask") return stepIndex;
  if (activeStep === "firstTaskSelection") return onboardingStepIndex("implementationIntentions");
  return Math.min(ONBOARDING_STEPS.length - 1, stepIndex + 1);
}

export function onboardingNextStepIndexForPhase(activeStep: StepKey, stepIndex: number, chronotypeResultPhase: ChronotypeResultPhase) {
  if (activeStep === "chronotypeResult" && chronotypeResultPhase === "hours") return onboardingStepIndex("days");
  return onboardingNextStepIndex(activeStep, stepIndex);
}

export function onboardingStepIndexAfterTaskCreated() {
  return onboardingStepIndex("implementationIntentions");
}

export function shouldResetChronotypeChoiceForNavigation(currentStep: StepKey, nextStep: StepKey) {
  if (nextStep === "chronotypeSelection") return true;
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStep);
  const nextIndex = ONBOARDING_STEPS.findIndex((step) => step.key === nextStep);
  return currentStep === "chronotypeSelection" && nextIndex >= 0 && currentIndex >= 0 && nextIndex < currentIndex;
}

export function chronotypeChoiceAfterNavigation(currentStep: StepKey, nextStep: StepKey, currentChoiceId: OnboardingChronotypeChoiceId | "" = "") {
  return shouldResetChronotypeChoiceForNavigation(currentStep, nextStep) ? "" : currentChoiceId;
}

export function onboardingBackNavigation(input: {
  activeStep: StepKey;
  chronotypeResultPhase: ChronotypeResultPhase;
  selectedChronotypeChoiceId?: string;
  stepIndex: number;
}) {
  if (input.activeStep === "chronotypeResult" && input.chronotypeResultPhase === "hours") {
    return {
      nextStepIndex: onboardingStepIndex("showingUpProgress"),
      nextChronotypeResultPhase: "summary" as ChronotypeResultPhase,
      resetChronotypeChoice: false,
    };
  }

  if (
    input.activeStep === "chronotypeSelection" &&
    ONBOARDING_CHRONOTYPE_OPTIONS.some((option) => option.id === input.selectedChronotypeChoiceId)
  ) {
    return {
      nextStepIndex: input.stepIndex,
      nextChronotypeResultPhase: "summary" as ChronotypeResultPhase,
      resetChronotypeChoice: true,
    };
  }

  const nextStepIndex = Math.max(0, input.stepIndex - 1);
  const nextStep = ONBOARDING_STEPS[nextStepIndex]?.key || input.activeStep;
  return {
    nextStepIndex,
    nextChronotypeResultPhase: "summary" as ChronotypeResultPhase,
    resetChronotypeChoice: shouldResetChronotypeChoiceForNavigation(input.activeStep, nextStep),
  };
}

export function onboardingBackgroundAccentForStep(step: StepKey, selectedChronotypeAccentColor = "", useChronotypeAccent = false) {
  if (step === "days") return ONBOARDING_DAYS_BACKGROUND_ACCENT;
  if (step === "chronotypeResult" && useChronotypeAccent && selectedChronotypeAccentColor) return selectedChronotypeAccentColor;
  return ONBOARDING_NEUTRAL_BACKGROUND_ACCENT;
}

export const ONBOARDING_CHRONOTYPE_OPTIONS = [
  {
    id: "early-riser",
    label: "1",
    animal: "lion",
    title: "Rises early",
    peakWindow: "6 AM – 2 PM",
    iconVariant: "early",
    imageSrc: "/onboarding/chronotype_lion.webp",
    thumbnailSrc: "/onboarding/chronotype_lion_thumbnail.webp",
    accentColor: "#ffb000",
    resultCopy: [
      "Your chronotype is similar to that of a lion.",
      "It may surprise you that only ~15% of people fall into this category.",
      "Most productive - 6:00 AM to 2:00 PM",
    ],
    productivityStartTime: "06:00",
    productivityEndTime: "14:00",
    description: "Best focus from early morning to early afternoon.",
  },
  {
    id: "sun-aligned",
    label: "2",
    animal: "bear",
    title: "Wakes up with the sun",
    peakWindow: "9 AM – 5 PM",
    iconVariant: "sun",
    imageSrc: "/onboarding/chronotype_bear.webp",
    thumbnailSrc: "/onboarding/chronotype_bear_thumbnail.webp",
    accentColor: "#27bfff",
    resultCopy: [
      "Your chronotype is similar to that of a bear.",
      "This is the most common chronotype, with ~55% of people in this category.",
      "Most productive - 9:00 AM to 5:00 PM",
    ],
    productivityStartTime: "09:00",
    productivityEndTime: "17:00",
    description: "Most productive from mid-morning to late afternoon.",
  },
  {
    id: "light-sleeper",
    label: "4",
    animal: "dolphin",
    title: "Light sleeper",
    peakWindow: "12 PM – 7 PM",
    iconVariant: "teal",
    imageSrc: "/onboarding/chronotype_dolphin.webp",
    thumbnailSrc: "/onboarding/chronotype_dolphin_thumbnail.webp",
    accentColor: "#14e7d3",
    resultCopy: [
      "Your chronotype is similar to that of a dolphin.",
      "Dolphin chronotypes are less common, accounting for ~10-15% of people.",
      "Most productive - 12:00 PM to 7:00 PM",
    ],
    productivityStartTime: "12:00",
    productivityEndTime: "19:00",
    description: "Energy builds later, with strongest focus from midday to early evening.",
  },
  {
    id: "night-owl",
    label: "3",
    animal: "wolf",
    title: "Up late",
    peakWindow: "4 PM – 11 PM",
    iconVariant: "late",
    imageSrc: "/onboarding/chronotype_wolf.webp",
    thumbnailSrc: "/onboarding/chronotype_wolf_thumbnail.webp",
    accentColor: "#c45cff",
    resultCopy: [
      "Your chronotype is similar to that of a wolf.",
      "Wolf chronotypes account for ~15-30% of people.",
      "Most productive - 4:00 PM to 11:00 PM",
    ],
    productivityStartTime: "16:00",
    productivityEndTime: "23:00",
    description: "Starts slower and reaches peak focus later in the day.",
  },
] as const;

type OnboardingChronotypeChoiceId = (typeof ONBOARDING_CHRONOTYPE_OPTIONS)[number]["id"];

export const ONBOARDING_LION_CHRONOTYPE_SUMMARY = {
  choiceId: "early-riser",
  animal: "lion",
  animalLabel: "Lion",
  emblemSrc: "/onboarding/lion.webp",
  percentage: "15%",
  headingCopy: "of people are Lion chronotypes.",
  headingLead: "of people are",
  headingSuffix: "chronotypes.",
  bodyCopy: "Lions prefer to wake up early. They are disciplined starters and are often most productive in the first half of the day.",
  stats: [
    { label: "Most Productive", value: "6 AM - 2 PM", accent: true },
  ],
} as const;

export const ONBOARDING_BEAR_CHRONOTYPE_SUMMARY = {
  choiceId: "sun-aligned",
  animal: "bear",
  animalLabel: "Bear",
  emblemSrc: "/onboarding/bear.webp",
  percentage: "55%",
  headingCopy: "of people are Bear chronotypes.",
  headingLead: "of people are",
  headingSuffix: "chronotypes.",
  bodyCopy:
    "Bears tend to follow a steady daytime rhythm. They feel best with a balanced routine and are often most productive from late morning into the afternoon.",
  stats: [
    { label: "Most Productive", value: "9 AM - 5 PM", accent: true },
  ],
} as const;

export const ONBOARDING_DOLPHIN_CHRONOTYPE_SUMMARY = {
  choiceId: "light-sleeper",
  animal: "dolphin",
  animalLabel: "Dolphin",
  emblemSrc: "/onboarding/dolphin.webp",
  percentage: "10-15%",
  headingCopy: "of people are Dolphin chronotypes.",
  headingLead: "of people are",
  headingSuffix: "chronotypes.",
  bodyCopy:
    "Dolphins are light sleepers with a more sensitive rhythm. They often do best with flexible routines and can find their strongest focus from afternoon into evening.",
  stats: [
    { label: "Most Productive", value: "12 PM - 7 PM", accent: true },
  ],
} as const;

export const ONBOARDING_WOLF_CHRONOTYPE_SUMMARY = {
  choiceId: "night-owl",
  animal: "wolf",
  animalLabel: "Wolf",
  emblemSrc: "/onboarding/wolf.webp",
  percentage: "15-30%",
  headingCopy: "of people are Wolf chronotypes.",
  headingLead: "of people are",
  headingSuffix: "chronotypes.",
  bodyCopy:
    "Wolves naturally lean later in the day. They may struggle with early starts and often reach their strongest focus in the evening.",
  stats: [
    { label: "Most Productive", value: "4 PM - 11 PM", accent: true },
  ],
} as const;

const ONBOARDING_CHRONOTYPE_SUMMARIES = [
  ONBOARDING_LION_CHRONOTYPE_SUMMARY,
  ONBOARDING_BEAR_CHRONOTYPE_SUMMARY,
  ONBOARDING_DOLPHIN_CHRONOTYPE_SUMMARY,
  ONBOARDING_WOLF_CHRONOTYPE_SUMMARY,
] as const;

const PRODUCTIVITY_WEEKDAY_PILLS: ReadonlyArray<DashboardWeekStart> = ["mon", "tue", "wed", "thu", "fri"];
const PRODUCTIVITY_WEEKEND_PILLS: ReadonlyArray<DashboardWeekStart> = ["sat", "sun"];

const PRODUCTIVITY_DAY_LABELS = new Map(
  OPTIMAL_PRODUCTIVITY_DAY_LABELS.map((day) => [normalizeDashboardWeekStart(day.value), day.label.slice(0, 3).toUpperCase()] as const)
);
const USERNAME_TAKEN_ERROR_MESSAGE = "That username is already taken.";
export const ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE = "That username is already taken. Try another one.";
export const ONBOARDING_CHRONOTYPE_REQUIRED_MESSAGE = "Please select one option";
const ONBOARDING_USERNAME_ERROR_ID = "onboardingUsernameError";
const ONBOARDING_CHRONOTYPE_ERROR_ID = "onboardingChronotypeError";

export function isOnboardingUsernameTakenError(message: unknown) {
  return String(message || "").trim() === USERNAME_TAKEN_ERROR_MESSAGE;
}

export function resolveOnboardingAvatarId(
  savedAvatarId: unknown,
  avatars: ReadonlyArray<Pick<AvatarOption, "id">>,
  randomValue = Math.random()
) {
  if (!avatars.length) return "";
  const saved = String(savedAvatarId || "").trim();
  if (saved && avatars.some((avatar) => avatar.id === saved)) return saved;
  const index = Math.max(0, Math.min(avatars.length - 1, Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * avatars.length)));
  return avatars[index]?.id || avatars[0]?.id || "";
}

export function onboardingAvatarProfilePatch(avatarId: string) {
  return {
    avatarId,
    avatarCustomSrc: null,
  };
}

export function normalizeOnboardingProductivityDays(value: unknown): DashboardWeekStart[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? String(value).split(",") : [];
  const seen = new Set<DashboardWeekStart>();
  for (const entry of source) {
    const day = normalizeDashboardWeekStart(entry);
    if (String(entry || "").trim().toLowerCase() === day) seen.add(day);
  }
  return DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.filter((day) => seen.has(day));
}

export function canContinueOnboardingStep(
  step: StepKey,
  selectedDays: ReadonlyArray<DashboardWeekStart>,
  selectedChronotypeChoiceId = ""
) {
  if (step === "days") return selectedDays.length > 0;
  if (step === "chronotypeSelection") {
    return ONBOARDING_CHRONOTYPE_OPTIONS.some((option) => option.id === selectedChronotypeChoiceId);
  }
  return true;
}

export function isOnboardingContinueDisabled(
  busy: boolean,
  step: StepKey,
  selectedDays: ReadonlyArray<DashboardWeekStart>,
  selectedChronotypeChoiceId = "",
  firstTaskDetailsReady = true
) {
  if (busy) return true;
  if (step === "days") return !canContinueOnboardingStep(step, selectedDays, selectedChronotypeChoiceId);
  if (step === "chronotypeSelection") return !canContinueOnboardingStep(step, selectedDays, selectedChronotypeChoiceId);
  if (step === "firstTask") return true;
  if (step === "firstTaskSelection") return !firstTaskDetailsReady;
  return false;
}

export function isOnboardingContinueReservedHidden(step: StepKey, selectedChronotypeChoiceId = "") {
  return (
    step === "firstTask" ||
    (step === "chronotypeSelection" && !ONBOARDING_CHRONOTYPE_OPTIONS.some((option) => option.id === selectedChronotypeChoiceId))
  );
}

export function onboardingContinueBlockedMessage(step: StepKey) {
  if (step === "chronotypeSelection") return ONBOARDING_CHRONOTYPE_REQUIRED_MESSAGE;
  if (step === "days") return "Select at least one productivity day before continuing.";
  if (step === "firstTaskSelection") return "Complete the task details before continuing.";
  return "";
}

export function onboardingPresetTaskTimeGoalValue(name: string) {
  const trimmedName = String(name || "").trim();
  return ONBOARDING_FIRST_TASK_PRESET_TIME_GOAL_VALUES[trimmedName] || ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE;
}

export function onboardingPresetTaskTimeGoalLabel(name: string) {
  return `Goal: ${onboardingPresetTaskTimeGoalValue(name)} min/day`;
}

export function onboardingPresetTaskCreatePayload(name: string) {
  const trimmedName = String(name || "").trim();
  return {
    name: trimmedName,
    taskType: ONBOARDING_FIRST_TASK_DEFAULT_TYPE,
    timeGoalValue: onboardingPresetTaskTimeGoalValue(trimmedName),
    timeGoalUnit: ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT,
    timeGoalPeriod: ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD,
    plannedStartTime: ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME,
  };
}

export function validateOnboardingFirstTaskDetails(input: {
  name: string;
  timeGoalValue: number;
  plannedStartTime: string;
}) {
  if (!String(input.name || "").trim()) return "Task name is required";
  if (!(Math.floor(Number(input.timeGoalValue) || 0) > 0)) return "Enter a time amount greater than 0";
  if (!normalizeTimeOfDay(input.plannedStartTime, "")) return "Choose a planned start time.";
  return "";
}

export function toggleOnboardingChronotypeChoice(currentId: string, nextId: OnboardingChronotypeChoiceId) {
  return currentId === nextId ? "" : nextId;
}

export function toggleAllOnboardingProductivityDays(currentDays: unknown) {
  const normalized = normalizeOnboardingProductivityDays(currentDays);
  return normalized.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length ? [] : Array.from(DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS);
}

export function toggleOnboardingProductivityDay(currentDays: unknown, day: DashboardWeekStart) {
  const normalized = normalizeOnboardingProductivityDays(currentDays);
  const hasDay = normalized.includes(day);
  const next = hasDay ? normalized.filter((value) => value !== day) : normalized.concat(day);
  return normalizeOnboardingProductivityDays(next);
}

export function resolveOnboardingChronotypeResult(choiceId: string) {
  return ONBOARDING_CHRONOTYPE_OPTIONS.find((option) => option.id === choiceId) || null;
}

export function onboardingChronotypeResultTitle(choiceId: string) {
  const result = resolveOnboardingChronotypeResult(choiceId);
  return result ? `Your chronotype is ${result.animal}` : "Your chronotype is your selected type";
}

type OnboardingChronotypeResult = NonNullable<ReturnType<typeof resolveOnboardingChronotypeResult>>;

function titleCaseOnboardingChronotypeAnimal(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Selected";
}

export function formatOnboardingChronotypeProductivityCopy(result: OnboardingChronotypeResult) {
  const animal = titleCaseOnboardingChronotypeAnimal(result.animal);
  const startLabel = formatOnboardingClockTimeLabel(result.productivityStartTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME);
  const endLabel = formatOnboardingClockTimeLabel(result.productivityEndTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME);
  return `${animal} chronotypes are most productive between ${startLabel} and ${endLabel}.`;
}

export function onboardingChronotypeResultCopy(choiceId: string) {
  const result = resolveOnboardingChronotypeResult(choiceId);
  if (!result) return [];
  const informationalCopy = result.resultCopy.slice(1).filter((line) => !line.startsWith("Most productive"));
  return [...informationalCopy, formatOnboardingChronotypeProductivityCopy(result)];
}

export function onboardingChronotypeResultSummary(choiceId: string) {
  return ONBOARDING_CHRONOTYPE_SUMMARIES.find((summary) => summary.choiceId === choiceId) || null;
}

export function seedOnboardingChronotypeHours(input: {
  selectedChronotypeChoiceId: string;
  currentStartTime: string;
  currentEndTime: string;
  hoursTouched: boolean;
}) {
  const result = resolveOnboardingChronotypeResult(input.selectedChronotypeChoiceId);
  if (!result || input.hoursTouched) {
    return {
      startTime: input.currentStartTime,
      endTime: input.currentEndTime,
    };
  }
  return {
    startTime: result.productivityStartTime,
    endTime: result.productivityEndTime,
  };
}

const ONBOARDING_PRODUCTIVITY_HOURS_SUBTEXT_LINES = [
  "When you create scheduled tasks, TaskLaunch will automatically try to fit it within your productivity hours.",
  "Tap to adjust these hours now, or from the Settings/Preferences menu later.",
] as const;

export function onboardingProductivityHoursSubtext() {
  return ONBOARDING_PRODUCTIVITY_HOURS_SUBTEXT_LINES.join("\n\n");
}

function stepIntro(step: StepKey, isNativeRuntime: boolean) {
  if (step === "username") return "Confirm the username people will see in TaskLaunch social surfaces.";
  if (step === "chronotypeChoice") return ONBOARDING_CHRONOTYPE_CHOICE_PROMPT;
  if (step === "chronotypeSelection") return ONBOARDING_CHRONOTYPE_SELECTION_PROMPT;
  if (step === "showingUpProgress") return ONBOARDING_SHOWING_UP_PROGRESS_SUBTEXT;
  if (step === "days") return "Choose the days that count toward your productivity streaks, rewards, and dashboard insights.";
  if (step === "firstTask") {
    return "These simple tasks are easy to complete for a quick win, while also helping you build positive daily habits and support your mental wellbeing.";
  }
  if (step === "implementationIntentions") return ONBOARDING_IMPLEMENTATION_INTENTIONS_SUBTEXT;
  void isNativeRuntime;
  return "To receive task reminders and alerts, please enable push notifications.";
}

function alertUsernameError(message: string) {
  if (typeof window !== "undefined") window.alert(message);
}

export function onboardingTitle(
  step: StepKey,
  username: string,
  selectedChronotypeChoiceId = "",
  selectedFirstTaskChoiceId: OnboardingFirstTaskChoiceId | "" = ""
) {
  if (step === "username") return "Profile Setup";
  if (step === "greeting") return `Welcome, ${username}`;
  if (step === "chronotypeChoice") return ONBOARDING_CHRONOTYPE_CHOICE_PROMPT;
  if (step === "chronotypeSelection") return ONBOARDING_CHRONOTYPE_SELECTION_PROMPT;
  if (step === "chronotypeResult") return onboardingChronotypeResultTitle(selectedChronotypeChoiceId);
  if (step === "firstTaskSelection") return onboardingFirstTaskSelectionTitle(selectedFirstTaskChoiceId);
  return ONBOARDING_STEPS.find((item) => item.key === step)?.title || "TaskLaunch Setup";
}

export function formatOnboardingClockTimeLabel(value: unknown, fallback: string) {
  const normalized = normalizeTimeOfDay(value, fallback);
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour24 = Math.max(0, Math.min(23, Number(hourRaw || 0)));
  const hour12 = hour24 % 12 || 12;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(Number(minuteRaw || 0)).padStart(2, "0")} ${meridiem}`;
}

export function onboardingStepPreferencePayload(input: {
  step: StepKey | "hours";
  selectedDays: ReadonlyArray<DashboardWeekStart>;
  startTime: string;
  endTime: string;
  pushEnabled: boolean;
  pushTouched: boolean;
}) {
  if (input.step === "days") {
    return {
      optimalProductivityDays: Array.from(input.selectedDays),
    };
  }
  if (input.step === "hours") {
    return {
      optimalProductivityStartTime: input.startTime,
      optimalProductivityEndTime: input.endTime,
    };
  }
  if (input.step === "push") {
    return input.pushTouched ? { pushNotificationsEnabled: input.pushEnabled } : null;
  }
  return null;
}

export function isOnboardingFinishDisabled(busy: boolean) {
  return busy;
}

export function shouldShowOnboardingStepImage(step: StepKey) {
  return (
    step !== "username" &&
    step !== "greeting" &&
    step !== "chronotypeSelection" &&
    step !== "chronotypeResult" &&
    step !== "firstTask" &&
    step !== "firstTaskSelection" &&
    step !== "implementationIntentions" &&
    step !== "push"
  );
}

export function shouldShowOnboardingStepSubtext(step: StepKey) {
  return (
    step !== "days" &&
    step !== "showingUpProgress" &&
    step !== "missedDaysProgress" &&
    step !== "greeting" &&
    step !== "chronotypeChoice" &&
    step !== "chronotypeSelection" &&
    step !== "chronotypeResult" &&
    step !== "firstTaskSelection"
  );
}

export function shouldShowOnboardingStepHeading(step: StepKey) {
  return step !== "chronotypeChoice" && step !== "showingUpProgress" && step !== "missedDaysProgress";
}

export function shouldShowOnboardingBackAction(step: StepKey, stepIndex: number) {
  return stepIndex > 0 && step !== "implementationIntentions";
}

type OnboardingCustomPropertyStyle = CSSProperties & {
  "--accent"?: string;
  "--onboarding-background-accent"?: string;
  "--onboarding-background-base"?: string;
  "--onboarding-background-reveal-accent"?: string;
  "--onboarding-chronotype-accent"?: string;
  "--onboarding-task-preset-color"?: string;
  "--onboarding-handoff-duration"?: string;
  "--onboarding-handoff-height"?: string;
  "--onboarding-handoff-left"?: string;
  "--onboarding-handoff-scale"?: string;
  "--onboarding-handoff-top"?: string;
  "--onboarding-handoff-translate-x"?: string;
  "--onboarding-handoff-translate-y"?: string;
  "--onboarding-handoff-width"?: string;
};

export default function TaskLaunchOnboarding({ preferences }: TaskLaunchOnboardingProps) {
  const [uid, setUid] = useState("");
  const [username, setUsername] = useState("");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [usernameConfirmedAtMs, setUsernameConfirmedAtMs] = useState<number | null>(null);
  const [selectedChronotypeChoiceId, setSelectedChronotypeChoiceId] = useState<OnboardingChronotypeChoiceId | "">("");
  const [productivityDays, setProductivityDays] = useState<DashboardWeekStart[]>([]);
  const [startTime, setStartTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_END_TIME);
  const [hoursTouched, setHoursTouched] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushTouched, setPushTouched] = useState(false);
  const [selectedFirstTaskChoiceId, setSelectedFirstTaskChoiceId] = useState<OnboardingFirstTaskChoiceId | "">("");
  const [selectedFirstTaskPresetName, setSelectedFirstTaskPresetName] = useState("");
  const [firstTaskNameDraft, setFirstTaskNameDraft] = useState("");
  const [firstTaskDetailsReady, setFirstTaskDetailsReady] = useState(false);
  const [firstTaskType, setFirstTaskType] = useState<TaskTimerOnboardingTaskType>(ONBOARDING_FIRST_TASK_DEFAULT_TYPE);
  const [firstTaskTimeGoalValue, setFirstTaskTimeGoalValue] = useState(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE);
  const [firstTaskTimeGoalUnit, setFirstTaskTimeGoalUnit] = useState<TaskTimerOnboardingTimeGoalUnit>(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT);
  const [firstTaskTimeGoalPeriod, setFirstTaskTimeGoalPeriod] = useState<TaskTimerOnboardingTimeGoalPeriod>(
    ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD
  );
  const [firstTaskPlannedStartTime, setFirstTaskPlannedStartTime] = useState(ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME);
  const [firstTaskPlannedStartTouched, setFirstTaskPlannedStartTouched] = useState(false);
  const [visibleTimeFallback, setVisibleTimeFallback] = useState<OnboardingTimeField | null>(null);
  const [busy, setBusy] = useState(false);
  const [chronotypeResultPhase, setChronotypeResultPhase] = useState<ChronotypeResultPhase>("summary");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [usernameInlineError, setUsernameInlineError] = useState("");
  const openRef = useRef(false);
  const avatarSavePromiseRef = useRef<Promise<void> | null>(null);
  const profileSyncPromiseRef = useRef<Promise<void> | null>(null);
  const startTimeInputRef = useRef<HTMLInputElement | null>(null);
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);

  const activeStep = ONBOARDING_STEPS[stepIndex]?.key || "username";
  const isNativeRuntime = isNativeOrFileRuntime();
  const usernameValidation = usernameDraft.trim() ? validateUsername(usernameDraft) : "Username is required.";
  const usernameConfirmed = !!usernameConfirmedAtMs && normalizeUsername(usernameDraft) === normalizeUsername(username);
  const selectedDays = useMemo(() => normalizeOnboardingProductivityDays(productivityDays), [productivityDays]);
  const selectedChronotypeResult = resolveOnboardingChronotypeResult(selectedChronotypeChoiceId);
  const selectedChronotypeSummary = onboardingChronotypeResultSummary(selectedChronotypeChoiceId);
  const selectedChronotypeMostProductiveStat =
    selectedChronotypeSummary?.stats.find((stat) => stat.label === "Most Productive") ?? selectedChronotypeSummary?.stats[0] ?? null;
  const onboardingGreetingName = username || normalizeUsername(usernameDraft) || "there";
  const onboardingHeadingText = onboardingTitle(activeStep, onboardingGreetingName, selectedChronotypeChoiceId, selectedFirstTaskChoiceId);
  const showStepImage = shouldShowOnboardingStepImage(activeStep);
  const showStepSubtext = shouldShowOnboardingStepSubtext(activeStep) || (activeStep === "chronotypeResult" && chronotypeResultPhase === "hours");
  const selectedAvatar = AVATAR_CATALOG.find((avatar) => avatar.id === selectedAvatarId) || AVATAR_CATALOG[0] || null;
  const productivityHoursIntroSubtext = ONBOARDING_PRODUCTIVITY_HOURS_SUBTEXT_LINES[0];
  const productivityHoursFineTuneSubtext = ONBOARDING_PRODUCTIVITY_HOURS_SUBTEXT_LINES[1];
  const firstTaskDetailsActive = activeStep === "firstTaskSelection" && firstTaskDetailsReady;
  const firstTaskTimeGoalValueNormalized = Math.max(0, Math.floor(Number(firstTaskTimeGoalValue) || 0));

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const resetChronotypeResultPhase = useCallback(() => {
    setChronotypeResultPhase("summary");
  }, []);

  useEffect(() => {
    if (activeStep !== "chronotypeResult" || chronotypeResultPhase !== "hours") setVisibleTimeFallback(null);
    if (activeStep !== "username") setAvatarPickerOpen(false);
    if (activeStep !== "chronotypeResult") setChronotypeResultPhase("summary");
  }, [activeStep, chronotypeResultPhase]);

  useEffect(() => {
    if (!firstTaskDetailsActive || firstTaskPlannedStartTouched) return;
    let cancelled = false;
    void getOnboardingTaskDefaultsViaRuntime({
      taskType: firstTaskType,
      timeGoalValue: firstTaskTimeGoalValueNormalized || ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE,
      timeGoalUnit: firstTaskTimeGoalUnit,
      timeGoalPeriod: firstTaskType === "once-off" ? "day" : firstTaskTimeGoalPeriod,
      optimalProductivityStartTime: startTime,
      optimalProductivityEndTime: endTime,
    }).then((result) => {
      if (cancelled || !result.ok || !result.plannedStartTime) return;
      setFirstTaskPlannedStartTime(normalizeTimeOfDay(result.plannedStartTime, ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME));
    });
    return () => {
      cancelled = true;
    };
  }, [
    firstTaskDetailsActive,
    firstTaskPlannedStartTouched,
    firstTaskTimeGoalPeriod,
    firstTaskTimeGoalUnit,
    firstTaskTimeGoalValueNormalized,
    firstTaskType,
    startTime,
    endTime,
  ]);

  const resetDrafts = useCallback(
    (nextUid: string, nextUsername: string, nextPresence: TaskTimerOnboardingPreferencePresence | null) => {
      const normalizedUsername = normalizeUsername(nextUsername);
      const preferenceDraft = buildTaskTimerOnboardingPreferenceDraft(preferences, nextPresence);
      const nextAvatarId = resolveOnboardingAvatarId(readStoredAvatarId(nextUid), AVATAR_CATALOG);
      setUsername(normalizedUsername);
      setUsernameDraft(normalizedUsername);
      setSelectedAvatarId(nextAvatarId);
      setAvatarPickerOpen(false);
      resetChronotypeResultPhase();
      setUsernameConfirmedAtMs(null);
      setSelectedChronotypeChoiceId("");
      setChronotypeResultPhase("summary");
      setProductivityDays(normalizeOnboardingProductivityDays(preferenceDraft.optimalProductivityDays));
      setStartTime(preferenceDraft.optimalProductivityStartTime);
      setEndTime(preferenceDraft.optimalProductivityEndTime);
      setHoursTouched(false);
      setPushEnabled(isNativeRuntime ? !!preferences?.mobilePushAlertsEnabled : !!preferences?.webPushAlertsEnabled);
      setPushTouched(false);
      setSelectedFirstTaskChoiceId("");
      setSelectedFirstTaskPresetName("");
      setFirstTaskNameDraft("");
      setFirstTaskDetailsReady(false);
      setFirstTaskType(ONBOARDING_FIRST_TASK_DEFAULT_TYPE);
      setFirstTaskTimeGoalValue(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE);
      setFirstTaskTimeGoalUnit(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT);
      setFirstTaskTimeGoalPeriod(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD);
      setFirstTaskPlannedStartTime(ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME);
      setFirstTaskPlannedStartTouched(false);
      setStepIndex(0);
      setStatus("");
      setError("");
      setUsernameInlineError("");
      avatarSavePromiseRef.current = null;
      profileSyncPromiseRef.current = null;
    },
    [isNativeRuntime, preferences, resetChronotypeResultPhase]
  );

  const refreshForUser = useCallback(
    async (user: User | null, options?: { forceOpen?: boolean }) => {
      const nextUid = String(user?.uid || "").trim();
      setUid(nextUid);
      if (!nextUid || user?.isAnonymous) {
        resetChronotypeResultPhase();
        setOpen(false);
        setUsername("");
        return;
      }

      const localState = readLocalTaskTimerOnboardingState(nextUid);
      const newUserHint = readLocalTaskTimerOnboardingNewUserHint(nextUid) || consumePendingEmailLinkOnboardingHint(nextUid);

      const [remoteState, nextPresence, claimedUsername] = await Promise.all([
        loadRemoteTaskTimerOnboardingState(nextUid).catch(() => localState),
        loadTaskTimerOnboardingPreferencePresence(nextUid).catch(() => null),
        loadClaimedUsername(nextUid).catch(() => ""),
      ]);

      setUsername(normalizeUsername(claimedUsername));

      if (options?.forceOpen) {
        resetDrafts(nextUid, claimedUsername, nextPresence);
        setOpen(true);
        return;
      }

      const shouldOpen = shouldAutoOpenTaskTimerOnboarding({
        uid: nextUid,
        username: claimedUsername,
        state: remoteState || localState || null,
        preferencePresence: nextPresence,
        newUserHint,
      });
      if (shouldOpen && !openRef.current) {
        resetDrafts(nextUid, claimedUsername, nextPresence);
        setOpen(true);
      }
    },
    [resetChronotypeResultPhase, resetDrafts]
  );

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const runRefresh = (user: User | null, options?: { forceOpen?: boolean }) => {
      void refreshForUser(user, options).catch(() => {
        if (!cancelled) setError("Could not load onboarding state.");
      });
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => runRefresh(user));
    const openOnboarding = () => runRefresh(auth.currentUser, { forceOpen: true });
    const refreshProfile = () => runRefresh(auth.currentUser);
    window.addEventListener(TASKTIMER_OPEN_ONBOARDING_EVENT, openOnboarding);
    window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    if (auth.currentUser) runRefresh(auth.currentUser);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(TASKTIMER_OPEN_ONBOARDING_EVENT, openOnboarding);
      window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    };
  }, [refreshForUser]);

  const savePreferenceStep = useCallback(
    async (payload: Parameters<typeof saveOnboardingPreferencesViaRuntime>[0]) => {
      setBusy(true);
      setError("");
      try {
        const result = await saveOnboardingPreferencesViaRuntime(payload);
        if (!result.ok) throw new Error(result.error || "Could not save onboarding settings.");
        setStatus("Saved.");
        return true;
      } catch (err: unknown) {
        setError(resolveOnboardingPreferenceError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const saveOnboardingTaskStep = useCallback(async () => {
    const validationMessage = validateOnboardingFirstTaskDetails({
      name: firstTaskNameDraft,
      timeGoalValue: firstTaskTimeGoalValueNormalized,
      plannedStartTime: firstTaskPlannedStartTime,
    });
    if (validationMessage) {
      setError(validationMessage);
      return false;
    }

    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await createOnboardingTaskViaRuntime({
        name: firstTaskNameDraft.trim(),
        taskType: firstTaskType,
        timeGoalValue: firstTaskTimeGoalValueNormalized,
        timeGoalUnit: firstTaskTimeGoalUnit,
        timeGoalPeriod: firstTaskType === "once-off" ? "day" : firstTaskTimeGoalPeriod,
        plannedStartTime: normalizeTimeOfDay(firstTaskPlannedStartTime, ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME),
      });
      if (!result.ok) throw new Error(result.error || "Could not create onboarding task.");
      setStatus("Task created.");
      return true;
    } catch (err: unknown) {
      setError(resolveOnboardingCreateTaskError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    firstTaskNameDraft,
    firstTaskPlannedStartTime,
    firstTaskTimeGoalPeriod,
    firstTaskTimeGoalUnit,
    firstTaskTimeGoalValueNormalized,
    firstTaskType,
  ]);

  const savePresetOnboardingTaskStep = useCallback(async (presetName: string) => {
    const payload = onboardingPresetTaskCreatePayload(presetName);
    const validationMessage = validateOnboardingFirstTaskDetails({
      name: payload.name,
      timeGoalValue: payload.timeGoalValue,
      plannedStartTime: payload.plannedStartTime,
    });
    if (validationMessage) {
      setError(validationMessage);
      return false;
    }

    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await createOnboardingTaskViaRuntime(payload);
      if (!result.ok) throw new Error(result.error || "Could not create onboarding task.");
      setStatus("Task created.");
      return true;
    } catch (err: unknown) {
      setError(resolveOnboardingCreateTaskError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const saveSelectedOnboardingAvatar = useCallback(async () => {
    const avatarId = selectedAvatarId || AVATAR_CATALOG[0]?.id || "";
    if (!uid || !avatarId) return;
    const patch = onboardingAvatarProfilePatch(avatarId);
    writeStoredAvatarId(uid, avatarId);
    await saveUserDocPatch(uid, patch);
    await syncOwnFriendshipProfile(uid, patch);
    notifyAccountAvatarUpdated();
  }, [selectedAvatarId, uid]);

  const queueSelectedOnboardingAvatarSave = useCallback(() => {
    const promise = saveSelectedOnboardingAvatar();
    avatarSavePromiseRef.current = promise;
    void promise.catch((err: unknown) => {
      if (avatarSavePromiseRef.current !== promise) return;
      setError(getErrorMessage(err, "Unable to save avatar right now."));
    });
  }, [saveSelectedOnboardingAvatar]);

  const queueOnboardingProfileSync = useCallback((promise: Promise<void>) => {
    profileSyncPromiseRef.current = promise;
    void promise.catch((err: unknown) => {
      if (profileSyncPromiseRef.current !== promise) return;
      setError(getErrorMessage(err, "Unable to sync profile right now."));
    });
  }, []);

  const confirmUsername = useCallback(async () => {
    const nextUsername = usernameDraft.trim();
    const validation = validateUsername(nextUsername);
    if (validation) {
      setError(validation);
      setUsernameInlineError("");
      setUsernameConfirmedAtMs(null);
      alertUsernameError(validation);
      return false;
    }
    if (!uid) {
      const message = "Sign in is required to update your username.";
      setError(message);
      setUsernameInlineError("");
      setUsernameConfirmedAtMs(null);
      alertUsernameError(message);
      return false;
    }

    setBusy(true);
    setError("");
    setUsernameInlineError("");
    setStatus("");
    setUsernameConfirmedAtMs(null);
    try {
      if (normalizeUsername(nextUsername) !== normalizeUsername(username)) {
        const result = await updateAliasFlow(uid, username, nextUsername);
        if (result.changed) {
          setUsername(result.username);
          setUsernameDraft(result.username);
          queueOnboardingProfileSync(syncOwnFriendshipProfile(uid, { alias: result.username }));
          notifyAccountProfileUpdated();
        }
      } else {
        setUsername(normalizeUsername(nextUsername));
        setUsernameDraft(normalizeUsername(nextUsername));
      }
      await saveSelectedOnboardingAvatar();
      const confirmedAtMs = Date.now();
      setUsernameConfirmedAtMs(confirmedAtMs);
      setUsernameInlineError("");
      setStatus("Username confirmed.");
      queueSelectedOnboardingAvatarSave();
      return true;
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Unable to update username right now.");
      setUsernameConfirmedAtMs(null);
      if (isOnboardingUsernameTakenError(message)) {
        setError("");
        setUsernameInlineError(ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE);
        return false;
      }
      setError(message);
      setUsernameInlineError("");
      alertUsernameError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [queueOnboardingProfileSync, queueSelectedOnboardingAvatarSave, saveSelectedOnboardingAvatar, uid, username, usernameDraft]);

  const handlePushToggle = useCallback(
    async (nextEnabled: boolean) => {
      setPushEnabled(nextEnabled);
      setPushTouched(true);
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const result = await saveOnboardingPreferencesViaRuntime({ pushNotificationsEnabled: nextEnabled });
        if (!result.ok) throw new Error(result.error || "Could not update notifications.");
        setPushTouched(false);
        setStatus(nextEnabled ? "Notification preference saved." : "Notifications disabled.");
      } catch (err: unknown) {
        setPushEnabled(!nextEnabled);
        setError(resolveOnboardingPreferenceError(err));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const saveCurrentStep = useCallback(async () => {
    if (activeStep === "username") return confirmUsername();
    if (activeStep === "firstTaskSelection") {
      if (!firstTaskDetailsReady) {
        setError(onboardingContinueBlockedMessage(activeStep));
        return false;
      }
      return saveOnboardingTaskStep();
    }
    if (!canContinueOnboardingStep(activeStep, selectedDays, selectedChronotypeChoiceId)) {
      setError(onboardingContinueBlockedMessage(activeStep));
      return false;
    }
    if (activeStep === "chronotypeResult" && chronotypeResultPhase === "summary") return true;
    const preferencePayload = onboardingStepPreferencePayload({
      step: activeStep === "chronotypeResult" && chronotypeResultPhase === "hours" ? "hours" : activeStep,
      selectedDays,
      startTime,
      endTime,
      pushEnabled,
      pushTouched,
    });
    return preferencePayload ? savePreferenceStep(preferencePayload) : true;
  }, [
    activeStep,
    chronotypeResultPhase,
    confirmUsername,
    firstTaskDetailsReady,
    pushEnabled,
    pushTouched,
    saveOnboardingTaskStep,
    savePreferenceStep,
    selectedChronotypeChoiceId,
    selectedDays,
    startTime,
    endTime,
  ]);

  const closeWithState = useCallback(
    async (nextStatus: "completed" | "dismissed") => {
      if (!uid) return;
      setBusy(true);
      setError("");
      try {
        const next = await saveTaskTimerOnboardingState(uid, {
          onboardingStatus: nextStatus,
          onboardingUsernameConfirmedAtMs: usernameConfirmedAtMs || undefined,
        });
        void next;
        resetChronotypeResultPhase();
        setOpen(false);
        if (nextStatus === "completed") dispatchModuleIntroTourStartEvent(uid);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not save onboarding state."));
      } finally {
        setBusy(false);
      }
    },
    [resetChronotypeResultPhase, uid, usernameConfirmedAtMs]
  );

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) return;
    const nextIndex = onboardingNextStepIndexForPhase(activeStep, stepIndex, chronotypeResultPhase);
    const nextStep = ONBOARDING_STEPS[nextIndex]?.key || activeStep;
    const advanceToNextStep = () => {
      if (shouldResetChronotypeChoiceForNavigation(activeStep, nextStep)) {
        setSelectedChronotypeChoiceId(chronotypeChoiceAfterNavigation(activeStep, nextStep, selectedChronotypeChoiceId));
      }
      setStepIndex(nextIndex);
      setChronotypeResultPhase("summary");
      setStatus("");
    };
    if (activeStep === "chronotypeResult" && chronotypeResultPhase === "summary") {
      advanceToNextStep();
      return;
    }
    if (activeStep === "showingUpProgress") {
      setStepIndex(onboardingStepIndex("chronotypeResult"));
      setChronotypeResultPhase("hours");
      setStatus("");
      setError("");
      return;
    }
    advanceToNextStep();
  }, [activeStep, chronotypeResultPhase, saveCurrentStep, selectedChronotypeChoiceId, stepIndex]);

  const selectPresetTask = useCallback(
    async (presetName: string) => {
      const saved = await savePresetOnboardingTaskStep(presetName);
      if (!saved) return;
      setSelectedFirstTaskPresetName(presetName);
      setFirstTaskNameDraft(presetName);
      setFirstTaskDetailsReady(false);
      setStepIndex(onboardingStepIndexAfterTaskCreated());
      setChronotypeResultPhase("summary");
      setStatus("");
      setError("");
    },
    [savePresetOnboardingTaskStep]
  );

  const selectFirstTaskChoice = useCallback(
    async (choiceId: OnboardingFirstTaskChoiceId) => {
      const saved = await saveCurrentStep();
      if (!saved) return;
      setSelectedFirstTaskChoiceId(choiceId);
      setFirstTaskDetailsReady(choiceId === "specific");
      setFirstTaskType(ONBOARDING_FIRST_TASK_DEFAULT_TYPE);
      setFirstTaskTimeGoalValue(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_VALUE);
      setFirstTaskTimeGoalUnit(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_UNIT);
      setFirstTaskTimeGoalPeriod(ONBOARDING_FIRST_TASK_DEFAULT_TIME_GOAL_PERIOD);
      setFirstTaskPlannedStartTime(ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME);
      setFirstTaskPlannedStartTouched(false);
      if (choiceId === "specific") setSelectedFirstTaskPresetName("");
      if (choiceId === "select") {
        setSelectedFirstTaskPresetName("");
        setFirstTaskNameDraft("");
      }
      setStepIndex(onboardingStepIndex("firstTaskSelection"));
      setStatus("");
      setError("");
    },
    [saveCurrentStep]
  );

  const handleBack = useCallback(() => {
    if (activeStep === "firstTaskSelection") {
      setStepIndex(onboardingStepIndex("firstTask"));
      setStatus("");
      setError("");
      return;
    }
    const backNavigation = onboardingBackNavigation({
      activeStep,
      chronotypeResultPhase,
      selectedChronotypeChoiceId,
      stepIndex,
    });
    if (backNavigation.resetChronotypeChoice) {
      setSelectedChronotypeChoiceId("");
    }
    setStepIndex(backNavigation.nextStepIndex);
    setChronotypeResultPhase(backNavigation.nextChronotypeResultPhase);
    setStatus("");
    setError("");
  }, [activeStep, chronotypeResultPhase, selectedChronotypeChoiceId, stepIndex]);

  const handleFinish = useCallback(async () => {
    if (!usernameConfirmed) {
      setStepIndex(0);
      setError("Confirm your username before finishing onboarding.");
      return;
    }
    const saved = await saveCurrentStep();
    if (!saved) return;
    await closeWithState("completed");
  }, [closeWithState, saveCurrentStep, usernameConfirmed]);

  const toggleProductivityDay = (day: DashboardWeekStart) => {
    setProductivityDays((current) => toggleOnboardingProductivityDay(current, day));
    setStatus("");
    setError("");
  };

  const selectAllProductivityDays = () => {
    setProductivityDays((current) => toggleAllOnboardingProductivityDays(current));
    setStatus("");
    setError("");
  };

  const selectChronotypeChoice = (nextOptionId: OnboardingChronotypeChoiceId) => {
    const nextId = toggleOnboardingChronotypeChoice(selectedChronotypeChoiceId, nextOptionId);
    const nextHours = seedOnboardingChronotypeHours({
      selectedChronotypeChoiceId: nextId,
      currentStartTime: startTime,
      currentEndTime: endTime,
      hoursTouched,
    });
    setSelectedChronotypeChoiceId(nextId);
    setStartTime(nextHours.startTime);
    setEndTime(nextHours.endTime);
    setStatus("");
    setError("");
  };

  const openClockTimePicker = (field: OnboardingTimeField) => {
    const input = field === "start" ? startTimeInputRef.current : endTimeInputRef.current;
    if (!input) return;
    input.focus();
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fall back to the visible native field when browser picker access is blocked.
      }
    }
    setVisibleTimeFallback(field);
    window.setTimeout(() => input.focus(), 0);
  };

  if (!open) return null;

  const isGreetingStep = activeStep === "greeting";
  const isChronotypeChoiceStep = activeStep === "chronotypeChoice";
  const isChronotypeSelectionStep = activeStep === "chronotypeSelection";
  const isChronotypeResultStep = activeStep === "chronotypeResult";
  const isShowingUpProgressStep = activeStep === "showingUpProgress";
  const isMissedDaysProgressStep = activeStep === "missedDaysProgress";
  const isAnecdoteStep = isShowingUpProgressStep || isMissedDaysProgressStep;
  const isImageStoryStep = isChronotypeChoiceStep || isAnecdoteStep;
  const isChronotypeHoursPhase = isChronotypeResultStep && chronotypeResultPhase === "hours";
  const isChronotypeResultSummaryStep = isChronotypeResultStep && chronotypeResultPhase === "summary" && !!selectedChronotypeSummary;
  const selectedChronotypeChoiceIndex = ONBOARDING_CHRONOTYPE_OPTIONS.findIndex((option) => option.id === selectedChronotypeChoiceId);
  const onboardingActionsDisabled = busy;
  const onboardingContinueDisabled = isOnboardingContinueDisabled(
    onboardingActionsDisabled,
    activeStep,
    selectedDays,
    selectedChronotypeChoiceId,
    activeStep !== "firstTaskSelection" || firstTaskDetailsReady
  );
  const onboardingContinueReservedHidden =
    isOnboardingContinueReservedHidden(activeStep, selectedChronotypeChoiceId) ||
    (activeStep === "firstTaskSelection" && selectedFirstTaskChoiceId === "select" && !firstTaskDetailsReady);
  const showOnboardingBackAction = shouldShowOnboardingBackAction(activeStep, stepIndex);
  const onboardingBackgroundAccent = onboardingBackgroundAccentForStep(activeStep, selectedChronotypeResult?.accentColor, isChronotypeHoursPhase);
  const onboardingModalStyle = {
    "--onboarding-background-accent": onboardingBackgroundAccent,
    "--onboarding-background-base": "var(--bg, #0d0f13)",
    "--onboarding-background-reveal-accent": isChronotypeResultSummaryStep
      ? selectedChronotypeResult?.accentColor || ONBOARDING_NEUTRAL_BACKGROUND_ACCENT
      : onboardingBackgroundAccent,
  } as OnboardingCustomPropertyStyle;
  const anecdoteStepContent = isShowingUpProgressStep
    ? {
        title: ONBOARDING_SHOWING_UP_PROGRESS_TITLE,
        subtext: ONBOARDING_SHOWING_UP_PROGRESS_SUBTEXT,
        imageSrc: "/onboarding/onboarding_showing_up.png",
        titleId: "onboardingShowingUpProgressTitle",
      }
    : {
        title: ONBOARDING_MISSED_DAYS_PROGRESS_TITLE,
        subtext: ONBOARDING_MISSED_DAYS_PROGRESS_SUBTEXT,
        imageSrc: "/onboarding/onboarding_missed_days.png",
        titleId: "onboardingMissedDaysProgressTitle",
      };

  return (
    <div className="overlay" id="onboardingOverlay" style={{ display: "flex" }}>
      <div
        className={`modal${isChronotypeSelectionStep ? " onboardingChronotypeSelectionModal" : ""}${
          isChronotypeResultSummaryStep ? " onboardingChronotypeResultSummaryModal" : ""
        }${isImageStoryStep ? " onboardingAnecdoteModal" : ""}${isChronotypeChoiceStep ? " onboardingChronotypeKnowledgeModal" : ""}`}
        style={onboardingModalStyle}
        role="dialog"
        aria-modal="true"
        aria-label="TaskLaunch onboarding"
      >
        {activeStep !== "username" && !isGreetingStep && !isChronotypeSelectionStep ? (
          <button className="onboardingSkipLink" type="button" onClick={() => void closeWithState("dismissed")} disabled={onboardingActionsDisabled}>
            Skip
          </button>
        ) : null}
        <div
          className={`onboardingContent${isChronotypeSelectionStep ? " onboardingContentChronotypeSelection" : ""}${
            isChronotypeResultSummaryStep ? " onboardingContentChronotypeResultSummary" : ""
          }${isChronotypeHoursPhase ? " onboardingContentChronotypeHours" : ""}${
            isImageStoryStep ? " onboardingContentAnecdote" : ""
          }`}
        >
          {activeStep === "username" ? (
            <AppImg
              className="onboardingProfileSetupImage"
              src="/onboarding/profile_setup.png"
              alt=""
              width={837}
              height={1002}
              aria-hidden="true"
            />
          ) : null}
          {showStepImage && isChronotypeChoiceStep ? (
            <section className="onboardingAnecdoteCard onboardingChronotypeKnowledgeCard" aria-labelledby="onboardingChronotypeKnowledgeTitle">
              <AppImg
                className="onboardingChronotypePreview onboardingAnecdoteCardPreview onboardingChronotypeKnowledgePreview"
                src="/onboarding/onboarding_know_your_chronotype.png"
                alt=""
                width={1024}
                height={1536}
                aria-hidden="true"
              />
              <div className="onboardingAnecdoteTextOverlay onboardingChronotypeKnowledgeTextOverlay">
                <h2 className="onboardingAnecdoteTitle onboardingChronotypeKnowledgeTitle" id="onboardingChronotypeKnowledgeTitle">
                  {ONBOARDING_CHRONOTYPE_CHOICE_PROMPT}
                </h2>
                <div className="onboardingAnecdoteSubtext onboardingChronotypeKnowledgeSubtext">
                  {ONBOARDING_CHRONOTYPE_CHOICE_SUBTEXT.map((line) => (
                    <p className="onboardingChronotypeKnowledgeSubtextLine" key={line}>{line}</p>
                  ))}
                </div>
              </div>
            </section>
          ) : showStepImage && isAnecdoteStep ? (
            <section className="onboardingAnecdoteCard" aria-labelledby={anecdoteStepContent.titleId}>
              <AppImg
                className="onboardingChronotypePreview onboardingAnecdoteCardPreview"
                src={anecdoteStepContent.imageSrc}
                alt=""
                width={966}
                height={1628}
                aria-hidden="true"
              />
              <div className="onboardingAnecdoteTextOverlay">
                <h2 className="onboardingAnecdoteTitle" id={anecdoteStepContent.titleId}>
                  {anecdoteStepContent.title}
                </h2>
                <p className="onboardingAnecdoteSubtext">{anecdoteStepContent.subtext}</p>
              </div>
            </section>
          ) : showStepImage ? (
            <AppImg
              className={`onboardingChronotypePreview${activeStep === "days" ? " onboardingProductivityDaysPreview" : ""}`}
              src={
                activeStep === "days"
                  ? "/onboarding/onboarding_productivity_days.webp"
                  : selectedChronotypeResult?.thumbnailSrc || "/onboarding/chronotypes.webp"
              }
              alt={
                activeStep === "days"
                  ? "Productivity days preview"
                  : selectedChronotypeResult
                    ? `${selectedChronotypeResult.animal} chronotype`
                    : "Chronotype alignment preview"
              }
              width={activeStep === "days" ? 1967 : 512}
              height={activeStep === "days" ? 799 : 512}
            />
          ) : null}
          {isChronotypeResultSummaryStep && selectedChronotypeResult ? (
            <>
              <div
                className={`onboardingChronotypeResultIntro${
                  selectedChronotypeSummary ? " onboardingChronotypeResultIntroWithSummary" : ""
                }`}
              >
                <AppImg
                  className="onboardingChronotypePreview onboardingChronotypeResultImage"
                  src={selectedChronotypeResult.thumbnailSrc}
                  alt={`${selectedChronotypeResult.animal} chronotype`}
                  width={512}
                  height={512}
                />
                <h2
                  className="onboardingGreetingTitle onboardingChronotypeResultTitle"
                  key={`onboarding-heading-${activeStep}`}
                  aria-label={`Your chronotype is ${selectedChronotypeResult.animal}`}
                >
                  <span className="onboardingChronotypeResultTitleBase">Your chronotype is</span>
                  <span className="onboardingChronotypeResultDots" aria-hidden="true">
                    <span className="onboardingChronotypeResultDot">.</span>
                    <span className="onboardingChronotypeResultDot">.</span>
                    <span className="onboardingChronotypeResultDot">.</span>
                  </span>
                  <span
                    className="onboardingChronotypeAccent onboardingChronotypeResultAnimal"
                    style={
                      {
                        "--onboarding-chronotype-accent": selectedChronotypeResult.accentColor,
                      } as OnboardingCustomPropertyStyle
                    }
                    aria-hidden="true"
                  >
                    {selectedChronotypeResult.animal}
                  </span>
                </h2>
              </div>
              {selectedChronotypeSummary ? (
                <section
                  className="onboardingChronotypeResultSummary"
                  data-chronotype-summary={selectedChronotypeSummary.animal}
                  aria-label={`${selectedChronotypeSummary.animalLabel} chronotype summary`}
                >
                  <div className="onboardingChronotypeResultSummaryHero">
                    <div className="onboardingChronotypeResultSummaryHeading">
                      <p className="onboardingChronotypeResultSummaryPercent onboardingChronotypeResultSummaryHeadingRest">
                        {selectedChronotypeSummary.percentage}
                      </p>
                      <p className="onboardingChronotypeResultSummaryType">
                        <span className="onboardingChronotypeResultSummaryHeadingRest">{selectedChronotypeSummary.headingLead}</span>
                        <strong className="onboardingChronotypeResultSummaryAnimalName">{selectedChronotypeSummary.animalLabel}</strong>
                        <span className="onboardingChronotypeResultSummaryHeadingRest">{selectedChronotypeSummary.headingSuffix}</span>
                      </p>
                    </div>
                    <AppImg
                      className="onboardingChronotypeResultSummaryEmblem"
                      src={selectedChronotypeSummary.emblemSrc}
                      alt={`${selectedChronotypeSummary.animalLabel} chronotype emblem`}
                      width={1024}
                      height={1024}
                    />
                  </div>
                  <div className="onboardingChronotypeResultSummaryBodyReveal">
                    <div className="onboardingChronotypeResultSummaryDivider onboardingChronotypeResultSummaryDividerTop" aria-hidden="true" />
                    <p className="onboardingChronotypeResultSummaryBody">{selectedChronotypeSummary.bodyCopy}</p>
                    <div
                      className="onboardingChronotypeResultSummaryDivider onboardingChronotypeResultSummaryDividerBottom"
                      aria-hidden="true"
                    />
                  </div>
                  <dl className="onboardingChronotypeResultSummaryStats">
                    {selectedChronotypeSummary.stats.map((stat) => {
                      const isMostProductiveStat = stat.label === "Most Productive";
                      return (
                        <div
                          className={`onboardingChronotypeResultSummaryStat${
                            isMostProductiveStat ? " onboardingChronotypeResultSummaryMostProductiveStat" : ""
                          }`}
                          key={stat.label}
                        >
                          <dt>{stat.label}</dt>
                          <dd className={stat.accent ? "isAccent" : ""}>{stat.value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ) : null}
            </>
          ) : isChronotypeHoursPhase && selectedChronotypeSummary && selectedChronotypeMostProductiveStat ? (
            <section
              className="onboardingChronotypeResultSummary onboardingHoursHeadingSummary"
              data-chronotype-summary={selectedChronotypeSummary.animal}
              aria-label={`${selectedChronotypeSummary.animalLabel} ${selectedChronotypeMostProductiveStat.label.toLowerCase()} window`}
            >
              <div className="onboardingHoursHeadingText">
                <p className="onboardingHoursHeadingLabel">Optimal Productivity Hours</p>
              </div>
            </section>
          ) : isChronotypeSelectionStep ? (
            <div className="onboardingChronotypeSelectionHeader" key={`onboarding-heading-${activeStep}`}>
              <h2 className="onboardingChronotypeSelectionTitle">
                <span>When do you feel most </span>
                <span className="onboardingChronotypeSelectionTitleAccent">switched on?</span>
              </h2>
              <div
                className="onboardingGreetingDivider onboardingDaysDivider onboardingChronotypeSelectionDivider"
                key={`onboarding-divider-${activeStep}`}
                aria-hidden="true"
              />
              <p className="onboardingChronotypeSelectionSubtitle">
                Choose the rhythm that best describes you.
              </p>
            </div>
          ) : shouldShowOnboardingStepHeading(activeStep) ? (
            <h2 className={`onboardingGreetingTitle${isGreetingStep ? " onboardingGreetingStepTitle" : ""}`} key={`onboarding-heading-${activeStep}`}>
              {isGreetingStep ? (
                <>
                  <span className="onboardingGreetingStepLead">Welcome,</span>
                  <span className="onboardingGreetingStepAlias">{onboardingGreetingName}</span>
                </>
              ) : isChronotypeChoiceStep ? (
                <>
                  Do you know your{" "}
                  <span className="onboardingChronotypePromptWord">
                    <strong><em>chronotype</em></strong>?
                  </span>
                </>
              ) : (
                onboardingHeadingText
              )}
            </h2>
          ) : null}
          {isGreetingStep ? (
            <>
              <div
                className="onboardingGreetingDivider onboardingGreetingStepDivider"
                key={`onboarding-divider-${activeStep}`}
                aria-hidden="true"
              />
              <p className="modalSubtext onboardingGreetingStepSubtext" key={`onboarding-subtext-${activeStep}`}>
                {ONBOARDING_GREETING_SUBTEXT}
              </p>
            </>
          ) : null}
          {!isGreetingStep &&
          !isChronotypeChoiceStep &&
          !isChronotypeSelectionStep &&
          !isMissedDaysProgressStep &&
          (!isChronotypeResultStep || isChronotypeHoursPhase) &&
          activeStep !== "days" ? (
            <div
              className={`onboardingGreetingDivider onboardingDaysDivider${isChronotypeHoursPhase ? " onboardingHoursDivider" : ""}`}
              data-chronotype-summary={isChronotypeHoursPhase ? selectedChronotypeSummary?.animal : undefined}
              key={`onboarding-divider-${activeStep}`}
              aria-hidden="true"
            />
          ) : null}
          {showStepSubtext ? (
            <p
              className={`modalSubtext${isChronotypeHoursPhase ? " onboardingHoursSubtext" : ""}${
                activeStep === "push" ? " onboardingNotificationsSubtext" : ""
              }${activeStep === "push" ? " onboardingPushSubtext" : ""}${
                activeStep === "username" ? " onboardingUsernameSubtext" : ""
              }`}
              key={`onboarding-subtext-${activeStep}`}
            >
              {activeStep === "username" ? (
                "Please choose an avatar and set a username for your profile:"
              ) : isChronotypeHoursPhase ? (
                productivityHoursIntroSubtext
              ) : (
                stepIntro(activeStep, isNativeRuntime)
              )}
            </p>
          ) : null}
        {activeStep === "username" ? (
          <div className="field modalDropdownField onboardingField onboardingUsernameField">
            <div className="onboardingUsernameRow">
              <button
                className="onboardingAvatarFrameBtn"
                type="button"
                aria-label="Choose avatar"
                aria-expanded={avatarPickerOpen}
                onClick={() => setAvatarPickerOpen((open) => !open)}
              >
                <span className="onboardingAvatarFrame">
                  {selectedAvatar ? <AppImg className="onboardingAvatarImage" src={selectedAvatar.src} alt={`${selectedAvatar.label} avatar`} /> : null}
                </span>
              </button>
              <div className="onboardingUsernameInputStack">
                <input
                  id="onboardingUsernameInput"
                  className="onboardingTextInput"
                  type="text"
                  aria-label="Username"
                  value={usernameDraft}
                  onChange={(event) => {
                    setUsernameDraft(event.target.value);
                    setUsernameConfirmedAtMs(null);
                    setStatus("");
                    setError("");
                    setUsernameInlineError("");
                  }}
                  maxLength={20}
                  aria-describedby={usernameInlineError ? ONBOARDING_USERNAME_ERROR_ID : undefined}
                  aria-invalid={!!usernameValidation || !!usernameInlineError}
                />
                {usernameInlineError ? (
                  <p className="onboardingUsernameInlineError" id={ONBOARDING_USERNAME_ERROR_ID}>
                    {usernameInlineError}
                  </p>
                ) : null}
              </div>
            </div>
            {avatarPickerOpen ? (
              <div className="onboardingAvatarPicker" role="list" aria-label="Available avatars">
                {AVATAR_CATALOG.map((avatar) => (
                  <button
                    className={`onboardingAvatarOption${avatar.id === selectedAvatarId ? " isSelected" : ""}`}
                    type="button"
                    key={avatar.id}
                    aria-label={`Select ${avatar.label} avatar`}
                    aria-pressed={avatar.id === selectedAvatarId}
                    onClick={() => {
                      setSelectedAvatarId(avatar.id);
                      setAvatarPickerOpen(false);
                    }}
                  >
                    <AppImg className="onboardingAvatarOptionImage" src={avatar.src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isChronotypeSelectionStep ? (
          <div
            className={`onboardingChronotypeTileGrid${
              selectedChronotypeChoiceId && selectedChronotypeChoiceIndex >= 0 ? ` hasSelection selectedIndex${selectedChronotypeChoiceIndex}` : ""
            }`}
            role="radiogroup"
            aria-label={ONBOARDING_CHRONOTYPE_SELECTION_PROMPT}
          >
            {ONBOARDING_CHRONOTYPE_OPTIONS.map((option, optionIndex) => {
              const selected = option.id === selectedChronotypeChoiceId;
              const faded = !!selectedChronotypeChoiceId && !selected;
              return (
                <div className={`onboardingChronotypeTileReveal onboardingChronotypeTileReveal${optionIndex}`} key={option.id}>
                  <button
                    className={`onboardingChronotypeTile${selected ? " isSelected selected" : ""}${faded ? " isFaded" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-describedby={error ? ONBOARDING_CHRONOTYPE_ERROR_ID : undefined}
                    style={{ "--accent": option.accentColor, "--onboarding-chronotype-accent": option.accentColor } as OnboardingCustomPropertyStyle}
                    onClick={() => {
                      selectChronotypeChoice(option.id);
                    }}
                  >
                    <span className="onboardingChronotypeTileImageFrame" aria-hidden="true">
                      <AppImg className="onboardingChronotypeTileImage" src={option.imageSrc} alt="" width={128} height={128} />
                    </span>
                    <span className="onboardingChronotypeTileBody">
                      <span className="onboardingChronotypeTileTitle">{option.title}</span>
                      <span className="onboardingChronotypeTileDescription">{option.description}</span>
                    </span>
                    {selected ? <span className="onboardingChronotypeSelectedBadge" aria-hidden="true" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {activeStep === "firstTask" ? (
          <div className="onboardingFirstTaskPresetGroup">
            <ul className="onboardingTaskPresetList" aria-label="Curated task presets">
              {ONBOARDING_FIRST_TASK_PRESET_NAMES.map((presetName) => {
                const selected = selectedFirstTaskPresetName === presetName;
                const description = ONBOARDING_FIRST_TASK_PRESET_DESCRIPTIONS[presetName] || "";
                const imageSrc = ONBOARDING_FIRST_TASK_PRESET_IMAGE_SRCS[presetName] || "";
                const presetColor = ONBOARDING_FIRST_TASK_PRESET_COLORS[presetName] || "#dce775";
                return (
                  <li className="onboardingTaskPresetListItem" key={presetName}>
                    <button
                      className={`onboardingTaskPresetItem${selected ? " isSelected" : ""}`}
                      type="button"
                      aria-pressed={selected}
                      data-onboarding-preset-task={presetName}
                      data-onboarding-next-action="true"
                      style={{ "--onboarding-task-preset-color": presetColor } as OnboardingCustomPropertyStyle}
                      onClick={() => void selectPresetTask(presetName)}
                      disabled={onboardingActionsDisabled}
                    >
                      {imageSrc ? (
                        <span className="onboardingTaskPresetImageFrame" aria-hidden="true">
                          <AppImg className="onboardingTaskPresetImage" src={imageSrc} alt="" width={96} height={96} />
                        </span>
                      ) : null}
                      <span className="onboardingTaskPresetName">{presetName}</span>
                      <span className="onboardingTaskPresetTimeGoal">{onboardingPresetTaskTimeGoalLabel(presetName)}</span>
                      {description ? <span className="onboardingTaskPresetDescription">{description}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              className="onboardingCreateOwnTaskLink"
              type="button"
              data-onboarding-task-choice="specific"
              onClick={() => void selectFirstTaskChoice("specific")}
              disabled={onboardingActionsDisabled}
            >
              Create my own task
            </button>
          </div>
        ) : null}

        {firstTaskDetailsActive ? (
          <div className="onboardingTaskDetailsGrid">
            <div className="field onboardingSpecificTaskField">
              <label htmlFor="onboardingTaskNameInput">Task Name</label>
              <div className="addTaskNameCombo onboardingSpecificTaskNameCombo" id="onboardingTaskNameCombo">
                <div className="taskNameRow onboardingTaskNameRow">
                  <input
                    id="onboardingTaskNameInput"
                    type="text"
                    placeholder="Enter a description for this task"
                    value={firstTaskNameDraft}
                    onChange={(event) => {
                      setFirstTaskNameDraft(event.target.value);
                      setStatus("");
                      setError("");
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="onboardingTaskTypePills" role="group" aria-label="Task type">
              <button
                id="onboardingTaskTypeRecurringBtn"
                className={`btn btn-ghost small unitBtn timerTypePill taskScreenPill taskScreenHeaderBtn${firstTaskType === "recurring" ? " isOn" : ""}`}
                type="button"
                aria-pressed={firstTaskType === "recurring"}
                onClick={() => {
                  setFirstTaskType("recurring");
                  setStatus("");
                  setError("");
                }}
                disabled={onboardingActionsDisabled}
              >
                Recurring
              </button>
              <button
                id="onboardingTaskTypeOnceOffBtn"
                className={`btn btn-ghost small unitBtn timerTypePill taskScreenPill taskScreenHeaderBtn${firstTaskType === "once-off" ? " isOn" : ""}`}
                type="button"
                aria-pressed={firstTaskType === "once-off"}
                onClick={() => {
                  setFirstTaskType("once-off");
                  setFirstTaskTimeGoalPeriod("day");
                  setStatus("");
                  setError("");
                }}
                disabled={onboardingActionsDisabled}
              >
                Once-off
              </button>
            </div>

            <div className="field editTaskTimeGoalField onboardingTaskTimeGoalField">
              <div className="editTaskTimeGoalHeader">
                <label className="editTaskTimeGoalHeaderLabel" htmlFor="onboardingTaskTimeGoalValueInput">
                  Time Goal
                </label>
              </div>
              <div className="addTaskDurationRow editTaskDurationRow onboardingTaskDurationRow" id="onboardingTaskDurationRow">
                <input
                  id="onboardingTaskTimeGoalValueInput"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={firstTaskTimeGoalValue}
                  onChange={(event) => {
                    setFirstTaskTimeGoalValue(Math.max(0, Math.floor(Number(event.target.value) || 0)));
                    setStatus("");
                    setError("");
                  }}
                  disabled={onboardingActionsDisabled}
                />
                <div className="unitPills" role="group" aria-label="Time goal unit">
                  <button
                    className={`btn btn-ghost small unitBtn${firstTaskTimeGoalUnit === "minute" ? " isOn" : ""}`}
                    type="button"
                    aria-pressed={firstTaskTimeGoalUnit === "minute"}
                    onClick={() => {
                      setFirstTaskTimeGoalUnit("minute");
                      setStatus("");
                      setError("");
                    }}
                    disabled={onboardingActionsDisabled}
                  >
                    Min
                  </button>
                  <button
                    className={`btn btn-ghost small unitBtn${firstTaskTimeGoalUnit === "hour" ? " isOn" : ""}`}
                    type="button"
                    aria-pressed={firstTaskTimeGoalUnit === "hour"}
                    onClick={() => {
                      setFirstTaskTimeGoalUnit("hour");
                      setStatus("");
                      setError("");
                    }}
                    disabled={onboardingActionsDisabled}
                  >
                    Hour
                  </button>
                </div>
                <span className={`durationPerLabel${firstTaskType === "once-off" ? " isHidden" : ""}`}>per</span>
                <div className={`unitPills${firstTaskType === "once-off" ? " isHidden" : ""}`} role="group" aria-label="Time goal period">
                  <button
                    className={`btn btn-ghost small unitBtn${firstTaskTimeGoalPeriod === "day" ? " isOn" : ""}`}
                    type="button"
                    aria-pressed={firstTaskTimeGoalPeriod === "day"}
                    onClick={() => {
                      setFirstTaskTimeGoalPeriod("day");
                      setStatus("");
                      setError("");
                    }}
                    disabled={onboardingActionsDisabled}
                  >
                    Day
                  </button>
                  <button
                    className={`btn btn-ghost small unitBtn${firstTaskTimeGoalPeriod === "week" ? " isOn" : ""}`}
                    type="button"
                    aria-pressed={firstTaskTimeGoalPeriod === "week"}
                    onClick={() => {
                      setFirstTaskTimeGoalPeriod("week");
                      setStatus("");
                      setError("");
                    }}
                    disabled={onboardingActionsDisabled}
                  >
                    Week
                  </button>
                </div>
              </div>
            </div>

            <div className="field editPlannedStartField onboardingPlannedStartField">
              <label htmlFor="onboardingTaskPlannedStartTimeInput">Planned Start Time</label>
              <div className="addTaskPlannedStartSection editPlannedStartSection onboardingPlannedStartSection">
                <div className="addTaskPlannedStartSelectorRow">
                  <div className="addTaskPlannedStartTimeCluster">
                    <input
                      id="onboardingTaskPlannedStartTimeInput"
                      className="plannedStartClockInput"
                      type="time"
                      step="300"
                      value={firstTaskPlannedStartTime}
                      onChange={(event) => {
                        setFirstTaskPlannedStartTime(normalizeTimeOfDay(event.target.value, ONBOARDING_FIRST_TASK_DEFAULT_PLANNED_START_TIME));
                        setFirstTaskPlannedStartTouched(true);
                        setStatus("");
                        setError("");
                      }}
                      disabled={onboardingActionsDisabled}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "days" ? (
          <div className="onboardingFieldsGrid">
            <div className="field modalDropdownField onboardingField">
              <div className="onboardingGreetingDivider onboardingDaysDivider" aria-hidden="true" />
              <div className="onboardingProductivityIntroText">
                <p className="onboardingProductivityDaysHelp">
                  Productivity can look different from one day to the next, and that is completely normal. Your focus, energy, and capacity may only line up on
                  certain days each week.
                  <br />
                  <span id="onboardingProductivityDaysLabel">
                    Select the day or days when you are most likely to feel clear, focused, and ready to make progress.
                  </span>
                </p>
              </div>
              <div className="onboardingDayGrid" role="group" aria-labelledby="onboardingProductivityDaysLabel">
                <div className="onboardingDayPillRow onboardingDayPillWeekRow">
                  {PRODUCTIVITY_WEEKDAY_PILLS.map((value, dayIndex) => {
                    const checked = selectedDays.includes(value);
                    return (
                      <button
                        className={`onboardingDayPill onboardingDayPillReveal${dayIndex}${checked ? " isSelected" : ""}`}
                        type="button"
                        key={value}
                        aria-pressed={checked}
                        aria-label={`${PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()} productivity day`}
                        onClick={() => toggleProductivityDay(value)}
                      >
                        {PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <div className="onboardingDayPillRow onboardingDayPillWeekendRow">
                  {PRODUCTIVITY_WEEKEND_PILLS.map((value, weekendDayIndex) => {
                    const checked = selectedDays.includes(value);
                    const dayIndex = PRODUCTIVITY_WEEKDAY_PILLS.length + weekendDayIndex;
                    return (
                      <button
                        className={`onboardingDayPill onboardingDayPillReveal${dayIndex}${checked ? " isSelected" : ""}`}
                        type="button"
                        key={value}
                        aria-pressed={checked}
                        aria-label={`${PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()} productivity day`}
                        onClick={() => toggleProductivityDay(value)}
                      >
                        {PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <div className="onboardingDayPillRow onboardingDayPillAllRow">
                  <button
                    className={`onboardingDayPill onboardingDayPillReveal7${selectedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length ? " isSelected" : ""}`}
                    type="button"
                    aria-pressed={selectedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length}
                    aria-label={
                      selectedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length
                        ? "Deselect all productivity days"
                        : "Select all productivity days"
                    }
                    onClick={selectAllProductivityDays}
                  >
                    ALL
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isChronotypeHoursPhase ? (
          <>
            <p className="modalSubtext onboardingHoursSubtext onboardingHoursFineTuneSubtext">{productivityHoursFineTuneSubtext}</p>
            <div className="onboardingTimeGrid onboardingHoursTimeGrid" data-chronotype-summary={selectedChronotypeSummary?.animal}>
              <div className="field modalDropdownField onboardingField">
                <label htmlFor="onboardingStartTimeInput">Start</label>
                <button
                  className="onboardingClockButton"
                  type="button"
                  aria-label={`Choose start time, current ${formatOnboardingClockTimeLabel(startTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME)}`}
                  onClick={() => openClockTimePicker("start")}
                >
                  <span className="onboardingClockValue">{formatOnboardingClockTimeLabel(startTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME)}</span>
                </button>
                <input
                  id="onboardingStartTimeInput"
                  ref={startTimeInputRef}
                  className={`onboardingTextInput onboardingClockNativeInput${visibleTimeFallback === "start" ? " isFallbackVisible" : ""}`}
                  type="time"
                  value={startTime}
                  onChange={(event) => {
                    setStartTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_START_TIME));
                    setHoursTouched(true);
                    setStatus("");
                    setError("");
                  }}
                />
              </div>
              <div className="field modalDropdownField onboardingField">
                <label htmlFor="onboardingEndTimeInput">End</label>
                <button
                  className="onboardingClockButton"
                  type="button"
                  aria-label={`Choose end time, current ${formatOnboardingClockTimeLabel(endTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME)}`}
                  onClick={() => openClockTimePicker("end")}
                >
                  <span className="onboardingClockValue">{formatOnboardingClockTimeLabel(endTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME)}</span>
                </button>
                <input
                  id="onboardingEndTimeInput"
                  ref={endTimeInputRef}
                  className={`onboardingTextInput onboardingClockNativeInput${visibleTimeFallback === "end" ? " isFallbackVisible" : ""}`}
                  type="time"
                  value={endTime}
                  onChange={(event) => {
                    setEndTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_END_TIME));
                    setHoursTouched(true);
                    setStatus("");
                    setError("");
                  }}
                />
              </div>
            </div>
          </>
        ) : null}

        {activeStep === "push" ? (
          <div className="onboardingFieldsGrid">
            <div className={`chkRow modalCheckboxRow onboardingPushRow${pushEnabled ? " isPushEnabled" : ""}`}>
              <input
                id="onboardingPushToggle"
                type="checkbox"
                checked={pushEnabled}
                disabled={busy}
                onChange={(event) => void handlePushToggle(event.target.checked)}
              />
              <div className="modalCheckboxText">
                <label className={`onboardingPushLabel${pushEnabled ? " isPushEnabled" : ""}`} htmlFor="onboardingPushToggle">
                  Enable push notifications
                </label>
              </div>
            </div>
          </div>
        ) : null}

          {activeStep !== "username" && activeStep !== "push" && !isGreetingStep && status ? <p className="modalSubtext onboardingStatusText">{status}</p> : null}
          {activeStep !== "username" && !isGreetingStep && error ? (
            <p className="confirmText onboardingErrorText" id={isChronotypeSelectionStep ? ONBOARDING_CHRONOTYPE_ERROR_ID : undefined}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="confirmBtns onboardingActions">
          {showOnboardingBackAction ? (
            <button
              className="btn btn-ghost"
              type="button"
              data-onboarding-back-action="true"
              onClick={handleBack}
              disabled={onboardingActionsDisabled}
            >
              Back
            </button>
          ) : null}
          {stepIndex < ONBOARDING_STEPS.length - 1 ? (
            <button
              className={`btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction${
                onboardingContinueReservedHidden ? " onboardingReservedHiddenAction" : ""
              }`}
              type="button"
              data-onboarding-next-action="true"
              onClick={() => void handleNext()}
              disabled={onboardingContinueDisabled}
              aria-hidden={onboardingContinueReservedHidden || undefined}
            >
              {isGreetingStep ? "Let's Go!" : "Continue"}
            </button>
          ) : (
            <button
              className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction"
              type="button"
              data-onboarding-next-action="true"
              onClick={() => void handleFinish()}
              disabled={isOnboardingFinishDisabled(onboardingActionsDisabled)}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
