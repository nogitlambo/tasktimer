import { z } from "zod";

import { AUTOMATION_RULE_TYPE_VALUES, AutomationRuleTypeSchema, type AutomationRuleType } from "./trustedAutomationContract";

export const TRUSTED_AUTOMATION_COHORT_VALUES = ["INTERNAL", "BETA", "LIMITED", "GENERAL"] as const;
export const TrustedAutomationCohortSchema = z.enum(TRUSTED_AUTOMATION_COHORT_VALUES);

export const TrustedAutomationRuleFlagSchema = z.object({
  enabled: z.boolean(),
  cohort: TrustedAutomationCohortSchema,
}).strict();

export const TrustedAutomationRolloutPolicySchema = z.object({
  enabled: z.boolean(),
  killSwitch: z.boolean(),
  internalUids: z.array(z.string().trim().min(1).max(120)).max(10_000),
  betaUids: z.array(z.string().trim().min(1).max(120)).max(10_000),
  limitedPercent: z.number().int().min(0).max(100),
  rules: z.record(AutomationRuleTypeSchema, TrustedAutomationRuleFlagSchema),
}).strict();

export type TrustedAutomationCohort = z.infer<typeof TrustedAutomationCohortSchema>;
export type TrustedAutomationRuleFlag = z.infer<typeof TrustedAutomationRuleFlagSchema>;
export type TrustedAutomationRolloutPolicy = z.infer<typeof TrustedAutomationRolloutPolicySchema>;

export type TrustedAutomationRolloutDecision = {
  enabled: boolean;
  cohort: TrustedAutomationCohort | "NONE";
  reason: "ENABLED" | "KILL_SWITCH" | "GLOBAL_DISABLED" | "RULE_DISABLED" | "COHORT_NOT_ELIGIBLE";
};

function truthy(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function uidList(value: unknown) {
  return String(value ?? "").split(",").map((uid) => uid.trim().slice(0, 120)).filter(Boolean).slice(0, 10_000);
}

function stableBucket(uid: string) {
  let hash = 0;
  for (const character of uid) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 100;
}

function defaultRules() {
  return Object.fromEntries(AUTOMATION_RULE_TYPE_VALUES.map((ruleId) => [ruleId, { enabled: false, cohort: "INTERNAL" as const }])) as Record<AutomationRuleType, TrustedAutomationRuleFlag>;
}

export function loadTrustedAutomationRolloutPolicy(env: Record<string, unknown> = process.env) {
  const rules = defaultRules();
  const rawRules = String(env.TRUSTED_AUTOMATION_RULE_FLAGS || "").trim();
  if (rawRules) {
    try {
      const parsed = z.record(z.string(), TrustedAutomationRuleFlagSchema).safeParse(JSON.parse(rawRules));
      if (parsed.success) {
        for (const [ruleId, flag] of Object.entries(parsed.data)) {
          if (AutomationRuleTypeSchema.safeParse(ruleId).success) rules[ruleId as AutomationRuleType] = flag;
        }
      }
    } catch {
      // Invalid rollout configuration fails closed by retaining disabled defaults.
    }
  }
  return TrustedAutomationRolloutPolicySchema.parse({
    enabled: truthy(env.TRUSTED_AUTOMATION_ENABLED),
    killSwitch: truthy(env.TRUSTED_AUTOMATION_KILL_SWITCH),
    internalUids: uidList(env.TRUSTED_AUTOMATION_INTERNAL_UIDS),
    betaUids: uidList(env.TRUSTED_AUTOMATION_BETA_UIDS),
    limitedPercent: Math.min(100, Math.max(0, Math.floor(Number(env.TRUSTED_AUTOMATION_LIMITED_PERCENT) || 0))),
    rules,
  });
}

function assignedCohort(uid: string, policy: TrustedAutomationRolloutPolicy): TrustedAutomationCohort | "NONE" {
  if (policy.internalUids.includes(uid)) return "INTERNAL";
  if (policy.betaUids.includes(uid)) return "BETA";
  if (policy.limitedPercent > 0 && stableBucket(uid) < policy.limitedPercent) return "LIMITED";
  return "GENERAL";
}

function cohortIncludes(assigned: TrustedAutomationCohort | "NONE", required: TrustedAutomationCohort) {
  const eligible: Record<TrustedAutomationCohort, readonly TrustedAutomationCohort[]> = {
    INTERNAL: ["INTERNAL"],
    BETA: ["INTERNAL", "BETA"],
    LIMITED: ["INTERNAL", "BETA", "LIMITED"],
    GENERAL: ["INTERNAL", "BETA", "LIMITED", "GENERAL"],
  };
  return assigned !== "NONE" && eligible[required].includes(assigned);
}

export function evaluateTrustedAutomationRollout(input: {
  uid: string;
  ruleId: AutomationRuleType;
  policy: TrustedAutomationRolloutPolicy;
}): TrustedAutomationRolloutDecision {
  const uid = input.uid.trim();
  if (input.policy.killSwitch) return { enabled: false, cohort: "NONE", reason: "KILL_SWITCH" };
  if (!input.policy.enabled) return { enabled: false, cohort: "NONE", reason: "GLOBAL_DISABLED" };
  const flag = input.policy.rules[input.ruleId];
  if (!flag?.enabled) return { enabled: false, cohort: "NONE", reason: "RULE_DISABLED" };
  const cohort = assignedCohort(uid, input.policy);
  if (!cohortIncludes(cohort, flag.cohort)) return { enabled: false, cohort, reason: "COHORT_NOT_ELIGIBLE" };
  return { enabled: true, cohort, reason: "ENABLED" };
}

export function validateTrustedAutomationRollback(input: {
  legacyReadersSafe: boolean;
  existingExecutiveFunctionSafe: boolean;
  indexesReady: boolean;
  alertsReady: boolean;
}) {
  return {
    ready: input.legacyReadersSafe && input.existingExecutiveFunctionSafe && input.indexesReady && input.alertsReady,
    checks: input,
  } as const;
}
