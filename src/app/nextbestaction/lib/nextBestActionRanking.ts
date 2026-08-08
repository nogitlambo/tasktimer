import type { HistoryEntry, Task } from "@/app/tasktimer/lib/types";
import type { TaskClarificationStatus } from "@/app/taskclarification/lib/taskClarification";

import type { DurationEstimateSource, NextBestActionReasonCode } from "./nextBestActionRecommendation";

export type NextBestActionPriority = "low" | "medium" | "high";

export type NextBestActionClarificationMetadata = {
  status?: TaskClarificationStatus | null;
  firstAction?: string | null;
  estimatedMinutes?: number | null;
  acceptedEstimatedMinutes?: number | null;
};

export type NextBestActionCandidate = {
  ownerUid: string;
  task: Task;
  taskVersion?: string | null;
  active?: boolean;
  deleted?: boolean;
  completed?: boolean;
  blocked?: boolean;
  actionable?: boolean;
  hardDateEligible?: boolean;
  incompatibleRunning?: boolean;
  explicitPriority?: NextBestActionPriority | null;
  userConfirmedDurationMinutes?: number | null;
  historicalDurationMinutes?: number | null;
  history?: HistoryEntry[];
  clarification?: NextBestActionClarificationMetadata | null;
  focusWindowMatched?: boolean | null;
  postponementCount?: number;
  blocksImportantWork?: boolean;
  recentlyStartedIncomplete?: boolean;
  userPreferenceMatch?: boolean;
};

export type NextBestActionRankingWeights = {
  dueToday: number;
  dueSoon: number;
  highPriority: number;
  mediumPriority: number;
  fitsAvailableTime: number;
  fitsRemainingCapacity: number;
  matchesFocusWindow: number;
  hasClearFirstAction: number;
  frequentlyPostponed: number;
  blocksOtherWork: number;
  recentlyStarted: number;
  lowDurationConfidence: number;
  exceedsAvailableTime: number;
  userPreferenceMatch: number;
};

export type NextBestActionRankingConfig = {
  version: string;
  defaultDurationMinutes: number;
  weights: NextBestActionRankingWeights;
};

export const DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG: NextBestActionRankingConfig = {
  version: "next-best-action-ranking-v1",
  defaultDurationMinutes: 20,
  weights: {
    dueToday: 40,
    dueSoon: 25,
    highPriority: 25,
    mediumPriority: 10,
    fitsAvailableTime: 20,
    fitsRemainingCapacity: 18,
    matchesFocusWindow: 15,
    hasClearFirstAction: 10,
    frequentlyPostponed: 10,
    blocksOtherWork: 15,
    recentlyStarted: 8,
    lowDurationConfidence: -5,
    exceedsAvailableTime: -25,
    userPreferenceMatch: 0,
  },
};

export type NextBestActionRankingContext = {
  userId: string;
  nowMs: number;
  todayDate: string;
  availableMinutes?: number | null;
  remainingCapacityRange?: { min: number; max: number } | null;
  excludedTaskIds?: readonly string[];
  config?: NextBestActionRankingConfig;
};

export type RankedNextBestActionCandidate = {
  taskId: string;
  title: string;
  taskVersion: string | null;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasonCodes: NextBestActionReasonCode[];
  durationMinutes: number;
  durationSource: DurationEstimateSource;
  firstAction: string | null;
  focusWindowMatched: boolean;
  dueDate: string | null;
  explicitPriority: NextBestActionPriority | null;
};

export type NextBestActionRankingResult = {
  configVersion: string;
  candidates: RankedNextBestActionCandidate[];
  primary: RankedNextBestActionCandidate | null;
};

function asPositiveMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function dateDistanceInDays(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86400000);
}

function historicalDurationMinutes(candidate: NextBestActionCandidate) {
  const supplied = asPositiveMinutes(candidate.historicalDurationMinutes);
  if (supplied) return supplied;
  const durations = (candidate.history || [])
    .map((entry) => Math.round(Number(entry.ms || 0) / 60000))
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0 && minutes <= 1440);
  if (!durations.length) return null;
  return Math.max(1, Math.round(durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length));
}

function selectDuration(candidate: NextBestActionCandidate, config: NextBestActionRankingConfig) {
  const userConfirmed = asPositiveMinutes(candidate.userConfirmedDurationMinutes);
  if (userConfirmed) return { minutes: userConfirmed, source: "USER_CONFIRMED" as const };

  const historical = historicalDurationMinutes(candidate);
  if (historical) return { minutes: historical, source: "HISTORICAL" as const };

  const acceptedClarification = asPositiveMinutes(candidate.clarification?.acceptedEstimatedMinutes);
  if (acceptedClarification) return { minutes: acceptedClarification, source: "ACCEPTED_CLARIFICATION" as const };

  const taskGoal = asPositiveMinutes(candidate.task.timeGoalMinutes);
  if (taskGoal) return { minutes: taskGoal, source: "TASK_GOAL" as const };

  return { minutes: Math.max(1, Math.floor(config.defaultDurationMinutes)), source: "DEFAULT" as const };
}

function isEligible(candidate: NextBestActionCandidate, context: NextBestActionRankingContext) {
  const taskId = String(candidate.task.id || "").trim();
  if (!taskId || candidate.ownerUid !== context.userId) return false;
  if ((context.excludedTaskIds || []).includes(taskId)) return false;
  if (candidate.active === false || candidate.deleted || candidate.completed || candidate.blocked) return false;
  if (candidate.actionable === false || candidate.hardDateEligible === false || candidate.incompatibleRunning) return false;
  return true;
}

function confidenceFor(reasonCodes: NextBestActionReasonCode[], durationSource: DurationEstimateSource) {
  const positiveSignals = reasonCodes.filter((code) => code !== "LOW_DURATION_CONFIDENCE" && code !== "EXCEEDS_AVAILABLE_TIME").length;
  if (durationSource !== "DEFAULT" && positiveSignals >= 3) return "HIGH" as const;
  if (positiveSignals >= 1) return "MEDIUM" as const;
  return "LOW" as const;
}

function priorityRank(priority: NextBestActionPriority | null) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0;
}

function compareCandidates(a: RankedNextBestActionCandidate, b: RankedNextBestActionCandidate, sourceByTaskId: Map<string, NextBestActionCandidate>) {
  if (a.score !== b.score) return b.score - a.score;

  const aDue = a.dueDate ? Date.parse(`${a.dueDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? Date.parse(`${b.dueDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  const aPriority = priorityRank(a.explicitPriority);
  const bPriority = priorityRank(b.explicitPriority);
  if (aPriority !== bPriority) return bPriority - aPriority;

  const aKnownDuration = a.durationSource === "DEFAULT" ? Number.POSITIVE_INFINITY : a.durationMinutes;
  const bKnownDuration = b.durationSource === "DEFAULT" ? Number.POSITIVE_INFINITY : b.durationMinutes;
  if (aKnownDuration !== bKnownDuration) return aKnownDuration - bKnownDuration;

  const aCreatedAt = Number(sourceByTaskId.get(a.taskId)?.task.createdAtMs || 0) || Number.POSITIVE_INFINITY;
  const bCreatedAt = Number(sourceByTaskId.get(b.taskId)?.task.createdAtMs || 0) || Number.POSITIVE_INFINITY;
  if (aCreatedAt !== bCreatedAt) return aCreatedAt - bCreatedAt;
  return a.taskId.localeCompare(b.taskId);
}

function rankCandidate(candidate: NextBestActionCandidate, context: NextBestActionRankingContext, config: NextBestActionRankingConfig): RankedNextBestActionCandidate {
  const taskId = String(candidate.task.id).trim();
  const dueDate = normalizeDate(candidate.task.onceOffTargetDate);
  const duration = selectDuration(candidate, config);
  const reasonCodes: NextBestActionReasonCode[] = [];
  let score = 0;
  const addSignal = (reasonCode: NextBestActionReasonCode, weight: number) => {
    if (weight === 0) return;
    if (!reasonCodes.includes(reasonCode)) reasonCodes.push(reasonCode);
    score += weight;
  };

  const daysUntilDue = dueDate ? dateDistanceInDays(context.todayDate, dueDate) : null;
  if (daysUntilDue === 0) addSignal("DUE_TODAY", config.weights.dueToday);
  else if (daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= 3) addSignal("DUE_SOON", config.weights.dueSoon);

  if (candidate.explicitPriority === "high") addSignal("HIGH_PRIORITY", config.weights.highPriority);
  else if (candidate.explicitPriority === "medium") addSignal("MEDIUM_PRIORITY", config.weights.mediumPriority);

  if (context.availableMinutes != null) {
    const availableMinutes = Math.max(1, Math.floor(Number(context.availableMinutes)));
    if (duration.minutes <= availableMinutes) addSignal("FITS_AVAILABLE_TIME", config.weights.fitsAvailableTime);
    else addSignal("EXCEEDS_AVAILABLE_TIME", config.weights.exceedsAvailableTime);
  }
  if (context.remainingCapacityRange) {
    const remainingMax = Math.max(0, Math.floor(Number(context.remainingCapacityRange.max)));
    if (duration.minutes <= remainingMax) addSignal("FITS_REMAINING_CAPACITY", config.weights.fitsRemainingCapacity);
  }
  if (candidate.focusWindowMatched === true) addSignal("MATCHES_FOCUS_WINDOW", config.weights.matchesFocusWindow);

  const firstAction = typeof candidate.clarification?.firstAction === "string" ? candidate.clarification.firstAction.trim() || null : null;
  if (firstAction) addSignal("HAS_CLEAR_FIRST_ACTION", config.weights.hasClearFirstAction);
  if (Number(candidate.postponementCount || 0) >= 2) addSignal("FREQUENTLY_POSTPONED", config.weights.frequentlyPostponed);
  if (candidate.blocksImportantWork === true) addSignal("BLOCKS_OTHER_WORK", config.weights.blocksOtherWork);
  if (candidate.recentlyStartedIncomplete === true) addSignal("RECENTLY_STARTED", config.weights.recentlyStarted);
  if (candidate.userPreferenceMatch === true) addSignal("USER_PREFERENCE_MATCH", config.weights.userPreferenceMatch);
  if (duration.source === "DEFAULT") addSignal("LOW_DURATION_CONFIDENCE", config.weights.lowDurationConfidence);

  return {
    taskId,
    title: String(candidate.task.name || "Task").trim() || "Task",
    taskVersion: typeof candidate.taskVersion === "string" ? candidate.taskVersion.trim() || null : null,
    score,
    confidence: confidenceFor(reasonCodes, duration.source),
    reasonCodes,
    durationMinutes: duration.minutes,
    durationSource: duration.source,
    firstAction,
    focusWindowMatched: candidate.focusWindowMatched === true,
    dueDate,
    explicitPriority: candidate.explicitPriority || null,
  };
}

export function rankNextBestActionCandidates(input: NextBestActionRankingContext & { candidates: NextBestActionCandidate[] }): NextBestActionRankingResult {
  const config = input.config || DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG;
  const sourceByTaskId = new Map(input.candidates.map((candidate) => [String(candidate.task.id || "").trim(), candidate]));
  const ranked = input.candidates.filter((candidate) => isEligible(candidate, input)).map((candidate) => rankCandidate(candidate, input, config));
  ranked.sort((a, b) => compareCandidates(a, b, sourceByTaskId));
  return {
    configVersion: config.version,
    candidates: ranked,
    primary: ranked[0] || null,
  };
}
