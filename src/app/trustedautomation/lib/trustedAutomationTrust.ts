import { z } from "zod";

import {
  AUTOMATION_RULE_TYPE_VALUES,
  AutomationRuleTypeSchema,
  AutomationRuleTrustLevelSchema,
  type AutomationRuleType,
  type AutomationRuleTrustLevel,
} from "./trustedAutomationContract";
import {
  AutomationHistoryOutcomeSchema,
  AutomationHistoryReasonCodeSchema,
  type AutomationHistoryOutcome,
  type AutomationHistoryReasonCode,
} from "./trustedAutomationPersistence";

export const TRUST_RECOMMENDATION_KIND_VALUES = ["NONE", "PROMOTE", "REDUCE"] as const;
export const TRUST_RECOMMENDATION_REASON_VALUES = [
  "SUCCESS_THRESHOLD_MET",
  "RECENT_FAILURE",
  "RECENT_UNDO",
  "RECENT_STALE_CONFLICT",
  "RECENT_REJECTION",
  "FAILURE_THRESHOLD_MET",
] as const;

export const TrustRecommendationSchema = z.object({
  kind: z.enum(TRUST_RECOMMENDATION_KIND_VALUES),
  ruleId: AutomationRuleTypeSchema,
  currentTrustLevel: AutomationRuleTrustLevelSchema,
  suggestedTrustLevel: AutomationRuleTrustLevelSchema.nullable(),
  reasonCodes: z.array(z.enum(TRUST_RECOMMENDATION_REASON_VALUES)),
  successCount: z.number().int().min(0).max(1000),
  acceptedSuccessCount: z.number().int().min(0).max(1000),
  negativeCount: z.number().int().min(0).max(1000),
  advisoryOnly: z.literal(true),
  requiresUserAction: z.literal(true),
}).strict();

export const TrustAnalyticsEventSchema = z.object({
  eventName: z.enum([
    "trusted_automation_recommendation_shown",
    "trusted_automation_recommendation_accepted",
    "trusted_automation_recommendation_dismissed",
  ]),
  ruleCategory: AutomationRuleTypeSchema,
  outcome: AutomationHistoryOutcomeSchema.optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  count: z.number().int().min(0).max(1000).optional(),
  reasonCodes: z.array(AutomationHistoryReasonCodeSchema).max(32).optional(),
}).strict();

export type TrustRecommendation = z.infer<typeof TrustRecommendationSchema>;
export type TrustAnalyticsEvent = z.infer<typeof TrustAnalyticsEventSchema>;

export type TrustObservation = {
  ruleId: AutomationRuleType;
  outcome: AutomationHistoryOutcome;
  accepted?: boolean;
  undoUsed?: boolean;
  staleConflict?: boolean;
  rejected?: boolean;
  reasonCodes?: readonly AutomationHistoryReasonCode[];
  createdAtMs: number;
  durationMs?: number | null;
};

export type TrustRecommendationConfig = {
  lookbackMs: number;
  promotionSuccessThreshold: number;
  reductionFailureThreshold: number;
  negativeSuppressionMs: number;
  promotionEligibleRules: readonly AutomationRuleType[];
};

export const DEFAULT_TRUST_RECOMMENDATION_CONFIG: TrustRecommendationConfig = {
  lookbackMs: 30 * 24 * 60 * 60 * 1000,
  promotionSuccessThreshold: 3,
  reductionFailureThreshold: 2,
  negativeSuppressionMs: 7 * 24 * 60 * 60 * 1000,
  promotionEligibleRules: AUTOMATION_RULE_TYPE_VALUES,
};

function boundedNow(nowMs: number) {
  return Number.isFinite(nowMs) ? nowMs : Date.now();
}

function isNegative(observation: TrustObservation) {
  return observation.outcome === "FAILED"
    || observation.undoUsed === true
    || observation.staleConflict === true
    || observation.rejected === true
    || observation.reasonCodes?.some((code) => code === "UNDO_USED" || code === "USER_REJECTED" || code === "STALE" || code === "CONFLICT") === true;
}

function normalizeConfig(config?: Partial<TrustRecommendationConfig>): TrustRecommendationConfig {
  const merged = { ...DEFAULT_TRUST_RECOMMENDATION_CONFIG, ...config };
  return {
    lookbackMs: Math.max(1, Math.floor(Number(merged.lookbackMs) || DEFAULT_TRUST_RECOMMENDATION_CONFIG.lookbackMs)),
    promotionSuccessThreshold: Math.max(1, Math.floor(Number(merged.promotionSuccessThreshold) || 3)),
    reductionFailureThreshold: Math.max(1, Math.floor(Number(merged.reductionFailureThreshold) || 2)),
    negativeSuppressionMs: Math.max(0, Math.floor(Number(merged.negativeSuppressionMs) || 0)),
    promotionEligibleRules: merged.promotionEligibleRules.filter((ruleId): ruleId is AutomationRuleType => AutomationRuleTypeSchema.safeParse(ruleId).success),
  };
}

export function evaluateTrustRecommendation(input: {
  ruleId: AutomationRuleType;
  currentTrustLevel: AutomationRuleTrustLevel;
  observations: readonly TrustObservation[];
  nowMs?: number;
  config?: Partial<TrustRecommendationConfig>;
}): TrustRecommendation {
  const nowMs = boundedNow(input.nowMs ?? Date.now());
  const config = normalizeConfig(input.config);
  const observations = input.observations
    .filter((observation) => observation.ruleId === input.ruleId && Number.isFinite(observation.createdAtMs))
    .filter((observation) => observation.createdAtMs <= nowMs && nowMs - observation.createdAtMs <= config.lookbackMs)
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
  const successes = observations.filter((observation) => observation.outcome === "SUCCESS");
  const acceptedSuccesses = successes.filter((observation) => observation.accepted === true);
  const negatives = observations.filter(isNegative);
  const recentNegative = negatives.some((observation) => nowMs - observation.createdAtMs <= config.negativeSuppressionMs);
  const reasonCodes: TrustRecommendation["reasonCodes"] = [];

  if (input.currentTrustLevel === "TRUSTED" && negatives.length >= config.reductionFailureThreshold) {
    if (negatives.some((observation) => observation.outcome === "FAILED")) reasonCodes.push("FAILURE_THRESHOLD_MET");
    if (negatives.some((observation) => observation.undoUsed || observation.reasonCodes?.includes("UNDO_USED"))) reasonCodes.push("RECENT_UNDO");
    if (negatives.some((observation) => observation.staleConflict || observation.reasonCodes?.some((code) => code === "STALE" || code === "CONFLICT"))) reasonCodes.push("RECENT_STALE_CONFLICT");
    if (negatives.some((observation) => observation.rejected || observation.reasonCodes?.includes("USER_REJECTED"))) reasonCodes.push("RECENT_REJECTION");
    return TrustRecommendationSchema.parse({
      kind: "REDUCE",
      ruleId: input.ruleId,
      currentTrustLevel: input.currentTrustLevel,
      suggestedTrustLevel: "ASSISTED",
      reasonCodes,
      successCount: successes.length,
      acceptedSuccessCount: acceptedSuccesses.length,
      negativeCount: negatives.length,
      advisoryOnly: true,
      requiresUserAction: true,
    });
  }

  if (
    input.currentTrustLevel === "ASSISTED"
    && config.promotionEligibleRules.includes(input.ruleId)
    && acceptedSuccesses.length >= config.promotionSuccessThreshold
    && !recentNegative
  ) {
    reasonCodes.push("SUCCESS_THRESHOLD_MET");
    return TrustRecommendationSchema.parse({
      kind: "PROMOTE",
      ruleId: input.ruleId,
      currentTrustLevel: input.currentTrustLevel,
      suggestedTrustLevel: "TRUSTED",
      reasonCodes,
      successCount: successes.length,
      acceptedSuccessCount: acceptedSuccesses.length,
      negativeCount: negatives.length,
      advisoryOnly: true,
      requiresUserAction: true,
    });
  }

  return TrustRecommendationSchema.parse({
    kind: "NONE",
    ruleId: input.ruleId,
    currentTrustLevel: input.currentTrustLevel,
    suggestedTrustLevel: null,
    reasonCodes: [],
    successCount: successes.length,
    acceptedSuccessCount: acceptedSuccesses.length,
    negativeCount: negatives.length,
    advisoryOnly: true,
    requiresUserAction: true,
  });
}

export function buildPrivacySafeTrustAnalyticsEvent(input: {
  eventName: TrustAnalyticsEvent["eventName"];
  ruleCategory: AutomationRuleType;
  outcome?: AutomationHistoryOutcome;
  durationMs?: number | null;
  count?: number;
  reasonCodes?: readonly AutomationHistoryReasonCode[];
}) {
  return TrustAnalyticsEventSchema.parse({
    eventName: input.eventName,
    ruleCategory: input.ruleCategory,
    outcome: input.outcome,
    durationMs: input.durationMs == null ? undefined : Math.min(86_400_000, Math.max(0, Math.floor(input.durationMs))),
    count: input.count == null ? undefined : Math.min(1000, Math.max(0, Math.floor(input.count))),
    reasonCodes: input.reasonCodes?.slice(0, 32),
  });
}
