import {
  type ExecutiveNudgeCandidate,
  type ExecutiveNudgeDeliveryInput,
  type ExecutiveNudgeDeliveryChannel,
  type ExecutiveNudgePreferences,
  type ExecutiveNudgePriority,
  type ExecutiveNudgeSuppressionCode,
  type ExecutiveNudgeType,
} from "./executiveNudgeContract";

export const EXECUTIVE_NUDGE_SOURCE_FRESHNESS_VALUES = ["CURRENT", "STALE", "INVALID"] as const;
export type ExecutiveNudgeSourceFreshness = (typeof EXECUTIVE_NUDGE_SOURCE_FRESHNESS_VALUES)[number];

export type ExecutiveNudgeArbitrationConfig = {
  priorityWeights: Record<ExecutiveNudgePriority, number>;
  minimumScore: number;
  globalCooldownMs: number;
  typeCooldownMs: number;
  duplicateWindowMs: number;
  dismissalSuppressionMs: number;
  activeSessionSuppressedTypes: readonly ExecutiveNudgeType[];
};

export type ExecutiveNudgeSuppression = {
  candidateId: string;
  code: ExecutiveNudgeSuppressionCode;
};

export type ExecutiveNudgeArbitrationResult = {
  selected: ExecutiveNudgeCandidate | null;
  selectedCount: 0 | 1;
  selectedScore: number | null;
  suppressions: ExecutiveNudgeSuppression[];
};

export type ExecutiveNudgeArbitrationInput = {
  userId: string;
  candidates: readonly ExecutiveNudgeCandidate[];
  preferences: ExecutiveNudgePreferences;
  now: string;
  localTime: string;
  localDate?: string;
  activeTaskSession: boolean;
  deliveryChannel?: ExecutiveNudgeDeliveryChannel;
  recentDeliveries: readonly ExecutiveNudgeDeliveryInput[];
  sourceFreshnessByCandidateId?: Readonly<Record<string, ExecutiveNudgeSourceFreshness>>;
  config?: ExecutiveNudgeArbitrationConfig;
};

export function createDefaultExecutiveNudgeArbitrationConfig(): ExecutiveNudgeArbitrationConfig {
  return {
    priorityWeights: {
      CRITICAL_ATTENTION: 400,
      HIGH: 300,
      NORMAL: 200,
      LOW: 100,
    },
    minimumScore: 1,
    globalCooldownMs: 120 * 60 * 1_000,
    typeCooldownMs: 8 * 60 * 60 * 1_000,
    duplicateWindowMs: 6 * 60 * 60 * 1_000,
    dismissalSuppressionMs: 24 * 60 * 60 * 1_000,
    activeSessionSuppressedTypes: ["START_OPPORTUNITY", "FOCUS_WINDOW_START", "FIRST_ACTION_AVAILABLE", "RESUME_TASK"],
  };
}

function timeOfDayToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isQuietHours(localTime: string, preferences: ExecutiveNudgePreferences) {
  const current = timeOfDayToMinutes(localTime);
  const start = timeOfDayToMinutes(preferences.quietHours.startTime);
  const end = timeOfDayToMinutes(preferences.quietHours.endTime);
  if (current === null || start === null || end === null) return true;
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function timestamp(value: string | null | undefined) {
  const millis = Date.parse(value || "");
  return Number.isFinite(millis) ? millis : null;
}

function occurredWithin(delivery: ExecutiveNudgeDeliveryInput, nowMs: number, windowMs: number) {
  const occurredAt = timestamp(delivery.deliveredAt || delivery.createdAt);
  if (occurredAt === null) return false;
  const age = nowMs - occurredAt;
  return age >= 0 && age <= windowMs;
}

function isVisibleDelivery(delivery: ExecutiveNudgeDeliveryInput) {
  return delivery.status !== "SUPPRESSED" && delivery.status !== "EXPIRED";
}

function sameSemanticNudge(candidate: ExecutiveNudgeCandidate, delivery: ExecutiveNudgeDeliveryInput) {
  return candidate.type === delivery.candidateType
    && candidate.sourceEntityId === delivery.sourceEntityId
    && candidate.action.type === delivery.action.type;
}

function scoreCandidate(candidate: ExecutiveNudgeCandidate, config: ExecutiveNudgeArbitrationConfig) {
  return config.priorityWeights[candidate.priority]
    + candidate.urgency
    + candidate.usefulness
    - candidate.interruptionCost;
}

function asSuppression(candidate: ExecutiveNudgeCandidate, code: ExecutiveNudgeSuppressionCode): ExecutiveNudgeSuppression {
  return { candidateId: candidate.id, code };
}

export function arbitrateExecutiveNudges(input: ExecutiveNudgeArbitrationInput): ExecutiveNudgeArbitrationResult {
  const config = input.config || createDefaultExecutiveNudgeArbitrationConfig();
  const nowMs = timestamp(input.now);
  const suppressions: ExecutiveNudgeSuppression[] = [];
  if (nowMs === null || input.preferences.userId !== input.userId) {
    return {
      selected: null,
      selectedCount: 0,
      selectedScore: null,
      suppressions: input.candidates.map((candidate) => asSuppression(candidate, "SOURCE_INVALID")),
    };
  }

  const recentDeliveries = input.recentDeliveries.filter((delivery) => delivery.userId === input.userId && isVisibleDelivery(delivery));
  const localDate = input.localDate || input.now.slice(0, 10);
  const pushDeliveriesToday = recentDeliveries.filter((delivery) => (
    delivery.channel === "ANDROID_PUSH" && (delivery.deliveredAt || delivery.createdAt).slice(0, 10) === localDate
  )).length;
  const eligible: Array<{ candidate: ExecutiveNudgeCandidate; score: number }> = [];

  for (const candidate of input.candidates) {
    let suppressionCode: ExecutiveNudgeSuppressionCode | null = null;
    const freshness = input.sourceFreshnessByCandidateId?.[candidate.id] || "CURRENT";
    const matchingDeliveries = recentDeliveries.filter((delivery) => sameSemanticNudge(candidate, delivery));

    if (candidate.userId !== input.userId) suppressionCode = "SOURCE_INVALID";
    else if (timestamp(candidate.expiresAt) === null || timestamp(candidate.expiresAt)! <= nowMs) suppressionCode = "ACTION_NO_LONGER_AVAILABLE";
    else if (freshness === "STALE") suppressionCode = "SOURCE_STALE";
    else if (freshness === "INVALID") suppressionCode = "SOURCE_INVALID";
    else if (!input.preferences.enabled) suppressionCode = "NUDGES_DISABLED";
    else if (input.preferences.paused) suppressionCode = "NUDGES_PAUSED";
    else if (!input.preferences.typeEnabled[candidate.type]) suppressionCode = "NUDGE_TYPE_DISABLED";
    else if (isQuietHours(input.localTime, input.preferences)) suppressionCode = "QUIET_HOURS";
    else if (input.activeTaskSession && config.activeSessionSuppressedTypes.includes(candidate.type)) suppressionCode = "ACTIVE_TASK_SESSION";
    else if (input.deliveryChannel === "ANDROID_PUSH" && pushDeliveriesToday >= input.preferences.maximumPushNudgesPerDay) suppressionCode = "DAILY_LIMIT_REACHED";
    else if (matchingDeliveries.some((delivery) => delivery.status === "DISMISSED" && occurredWithin(delivery, nowMs, config.dismissalSuppressionMs))) suppressionCode = "RECENTLY_DISMISSED";
    else if (matchingDeliveries.some((delivery) => occurredWithin(delivery, nowMs, config.duplicateWindowMs))) suppressionCode = "DUPLICATE";
    else if (recentDeliveries.some((delivery) => occurredWithin(delivery, nowMs, config.globalCooldownMs))) suppressionCode = "GLOBAL_COOLDOWN";
    else if (recentDeliveries.some((delivery) => delivery.candidateType === candidate.type && occurredWithin(delivery, nowMs, config.typeCooldownMs))) suppressionCode = "TYPE_COOLDOWN";

    const score = scoreCandidate(candidate, config);
    if (!suppressionCode && score < config.minimumScore) suppressionCode = "LOW_VALUE";
    if (suppressionCode) suppressions.push(asSuppression(candidate, suppressionCode));
    else eligible.push({ candidate, score });
  }

  eligible.sort((left, right) => (
    right.score - left.score
    || left.candidate.id.localeCompare(right.candidate.id)
  ));

  const selected = eligible.shift() || null;
  for (const remaining of eligible) suppressions.push(asSuppression(remaining.candidate, "HIGHER_PRIORITY_SELECTED"));

  return {
    selected: selected?.candidate || null,
    selectedCount: selected ? 1 : 0,
    selectedScore: selected?.score || null,
    suppressions,
  };
}
