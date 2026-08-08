import type { NextBestActionReasonCode } from "./nextBestActionRecommendation";

const reasonText: Record<NextBestActionReasonCode, string> = {
  DUE_TODAY: "due today",
  DUE_SOON: "due soon",
  HIGH_PRIORITY: "high priority",
  MEDIUM_PRIORITY: "a medium priority task",
  FITS_AVAILABLE_TIME: "fits the time you have available",
  FITS_REMAINING_CAPACITY: "fits your remaining capacity",
  MATCHES_FOCUS_WINDOW: "matches your current focus window",
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

export function buildNextBestActionExplanation(reasonCodes: NextBestActionReasonCode[], availableMinutes?: number | null) {
  const reasons = Array.from(new Set(reasonCodes))
    .filter((code) => code !== "LOW_DURATION_CONFIDENCE" && code !== "EXCEEDS_AVAILABLE_TIME")
    .map((code) => {
      if (code === "FITS_AVAILABLE_TIME" && availableMinutes != null) return `fits the ${availableMinutes} minutes you have available`;
      return reasonText[code];
    });
  return `Recommended because it is ${joinReasons(reasons)}.`;
}
