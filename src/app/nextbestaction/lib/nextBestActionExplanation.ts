import type { NextBestActionReasonCode } from "./nextBestActionRecommendation";
import { DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS, OPTIMAL_PRODUCTIVITY_DAY_LABELS } from "@/app/tasktimer/lib/productivityPeriod";

export type NextBestActionProductivityWindowExplanation = {
  plannedDay?: string | null;
  plannedStartTime?: string | null;
  days?: readonly string[] | null;
  startTime?: string | null;
  endTime?: string | null;
  matched?: boolean | null;
};

const reasonText: Record<NextBestActionReasonCode, string> = {
  DUE_TODAY: "due today",
  DUE_SOON: "due soon",
  HIGH_PRIORITY: "high priority",
  MEDIUM_PRIORITY: "a medium priority task",
  FITS_AVAILABLE_TIME: "fits the time you have available",
  FITS_REMAINING_CAPACITY: "fits your remaining capacity",
  MATCHES_FOCUS_WINDOW: "within your current focus window",
  HAS_CLEAR_FIRST_ACTION: "already has a clear first action",
  FREQUENTLY_POSTPONED: "has been postponed repeatedly",
  BLOCKS_OTHER_WORK: "blocks other important work",
  RECENTLY_STARTED: "continues work you recently started",
  QUICK_WIN: "is a quick win",
  LONG_FOCUS_FIT: "fits a longer focus window",
  LOW_DURATION_CONFIDENCE: "has an uncertain duration",
  EXCEEDS_AVAILABLE_TIME: "may exceed the time you have available",
  USER_PREFERENCE_MATCH: "matches your preferences",
};

function joinReasons(reasons: string[]) {
  if (reasons.length <= 1) return reasons[0] || "the strongest fit from your eligible tasks";
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}

function dayLabel(day: string | null | undefined) {
  const normalized = String(day || "").trim().toLowerCase();
  return OPTIMAL_PRODUCTIVITY_DAY_LABELS.find((entry) => entry.value === normalized)?.label || "";
}

function dayListLabel(days: readonly string[] | null | undefined) {
  const normalized = Array.from(new Set((days || []).map((day) => String(day || "").trim().toLowerCase()).filter(Boolean)));
  if (!normalized.length || DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.every((day) => normalized.includes(day))) return "all days";
  return normalized.map(dayLabel).filter(Boolean).join(", ") || "your selected days";
}

function timeLabel(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function productivityWindowSentence(window: NextBestActionProductivityWindowExplanation | null | undefined) {
  if (!window) return "TaskLaunch also checks your configured productivity days and hours when scheduled day and time are available.";
  const plannedDay = dayLabel(window.plannedDay);
  const plannedStart = timeLabel(window.plannedStartTime);
  const days = dayListLabel(window.days);
  const start = timeLabel(window.startTime);
  const end = timeLabel(window.endTime);
  const hours = start && end ? `${start}-${end}` : "your configured productivity hours";
  if (window.matched === true && plannedDay && plannedStart) {
    return `It is scheduled for ${plannedDay} at ${plannedStart}, which is inside your productivity days (${days}) and productivity hours (${hours}).`;
  }
  if (window.matched === true && plannedStart) {
    return `Its planned start time of ${plannedStart} is inside your productivity hours (${hours}); no planned day is set, so TaskLaunch uses your selected productivity days (${days}) as the day context.`;
  }
  if (window.matched === false && plannedDay && plannedStart) {
    return `It was checked against your productivity days (${days}) and productivity hours (${hours}); its scheduled ${plannedDay} ${plannedStart} is outside that window.`;
  }
  return `TaskLaunch checked this task against your productivity days (${days}) and productivity hours (${hours}) when ranking it.`;
}

export function buildNextBestActionExplanation(
  reasonCodes: NextBestActionReasonCode[],
  availableMinutesOrOptions?: number | null | {
    availableMinutes?: number | null;
    productivityWindow?: NextBestActionProductivityWindowExplanation | null;
  },
) {
  const availableMinutes =
    typeof availableMinutesOrOptions === "object"
      ? availableMinutesOrOptions?.availableMinutes
      : availableMinutesOrOptions;
  const productivityWindow =
    typeof availableMinutesOrOptions === "object"
      ? availableMinutesOrOptions?.productivityWindow
      : null;
  const reasons = Array.from(new Set(reasonCodes))
    .filter((code) => code !== "LOW_DURATION_CONFIDENCE" && code !== "EXCEEDS_AVAILABLE_TIME")
    .map((code) => {
      if (code === "FITS_AVAILABLE_TIME" && availableMinutes != null) return `fits the ${availableMinutes} minutes you have available`;
      return reasonText[code];
    });
  return `Recommended because it is ${joinReasons(reasons)}. ${productivityWindowSentence(productivityWindow)}`;
}
