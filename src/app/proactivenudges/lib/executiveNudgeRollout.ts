import { z } from "zod";

import { EXECUTIVE_NUDGE_TYPE_VALUES, ExecutiveNudgeTypeSchema, type ExecutiveNudgeType } from "./executiveNudgeContract";

export const EXECUTIVE_NUDGE_ROLLOUT_COHORT_VALUES = ["INTERNAL", "BETA", "GENERAL"] as const;
export const ExecutiveNudgeRolloutCohortSchema = z.enum(EXECUTIVE_NUDGE_ROLLOUT_COHORT_VALUES);

export const ExecutiveNudgeTypeFlagSchema = z.object({
  enabled: z.boolean(),
  cohort: ExecutiveNudgeRolloutCohortSchema,
}).strict();

export const ExecutiveNudgeRolloutPolicySchema = z.object({
  enabled: z.boolean(),
  killSwitch: z.boolean(),
  internalUids: z.array(z.string().trim().min(1).max(120)).max(10_000),
  betaUids: z.array(z.string().trim().min(1).max(120)).max(10_000),
  types: z.record(ExecutiveNudgeTypeSchema, ExecutiveNudgeTypeFlagSchema),
}).strict();

export type ExecutiveNudgeRolloutCohort = z.infer<typeof ExecutiveNudgeRolloutCohortSchema>;
export type ExecutiveNudgeRolloutPolicy = z.infer<typeof ExecutiveNudgeRolloutPolicySchema>;
export type ExecutiveNudgeRolloutDecision = {
  enabled: boolean;
  cohort: ExecutiveNudgeRolloutCohort | "NONE";
  reason: "ENABLED" | "KILL_SWITCH" | "GLOBAL_DISABLED" | "TYPE_DISABLED" | "COHORT_NOT_ELIGIBLE";
};

function truthy(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function uidList(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((uid) => uid.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 10_000);
}

function defaultTypes() {
  return Object.fromEntries(
    EXECUTIVE_NUDGE_TYPE_VALUES.map((type) => [type, { enabled: false, cohort: "INTERNAL" as const }]),
  ) as Record<ExecutiveNudgeType, { enabled: boolean; cohort: ExecutiveNudgeRolloutCohort }>;
}

export function loadExecutiveNudgeRolloutPolicy(env: Record<string, unknown> = process.env): ExecutiveNudgeRolloutPolicy {
  const types = defaultTypes();
  const rawFlags = String(env.PROACTIVE_EXECUTIVE_NUDGES_TYPE_FLAGS || "").trim();

  if (rawFlags) {
    try {
      const parsed = z.record(z.string(), ExecutiveNudgeTypeFlagSchema).safeParse(JSON.parse(rawFlags));
      if (parsed.success) {
        for (const [type, flag] of Object.entries(parsed.data)) {
          if (ExecutiveNudgeTypeSchema.safeParse(type).success) {
            types[type as ExecutiveNudgeType] = flag;
          }
        }
      }
    } catch {
      // Invalid configuration remains disabled by default.
    }
  }

  return ExecutiveNudgeRolloutPolicySchema.parse({
    enabled: truthy(env.PROACTIVE_EXECUTIVE_NUDGES_ENABLED),
    killSwitch: truthy(env.PROACTIVE_EXECUTIVE_NUDGES_KILL_SWITCH),
    internalUids: uidList(env.PROACTIVE_EXECUTIVE_NUDGES_INTERNAL_UIDS),
    betaUids: uidList(env.PROACTIVE_EXECUTIVE_NUDGES_BETA_UIDS),
    types,
  });
}

function assignedCohort(uid: string, policy: ExecutiveNudgeRolloutPolicy): ExecutiveNudgeRolloutCohort {
  if (policy.internalUids.includes(uid)) return "INTERNAL";
  if (policy.betaUids.includes(uid)) return "BETA";
  return "GENERAL";
}

function cohortIncludes(assigned: ExecutiveNudgeRolloutCohort, required: ExecutiveNudgeRolloutCohort) {
  const eligible: Record<ExecutiveNudgeRolloutCohort, readonly ExecutiveNudgeRolloutCohort[]> = {
    INTERNAL: ["INTERNAL"],
    BETA: ["INTERNAL", "BETA"],
    GENERAL: ["INTERNAL", "BETA", "GENERAL"],
  };
  return eligible[required].includes(assigned);
}

export function evaluateExecutiveNudgeRollout(input: {
  uid: string;
  type: ExecutiveNudgeType;
  policy: ExecutiveNudgeRolloutPolicy;
}): ExecutiveNudgeRolloutDecision {
  if (input.policy.killSwitch) return { enabled: false, cohort: "NONE", reason: "KILL_SWITCH" };
  if (!input.policy.enabled) return { enabled: false, cohort: "NONE", reason: "GLOBAL_DISABLED" };

  const flag = input.policy.types[input.type];
  if (!flag?.enabled) return { enabled: false, cohort: "NONE", reason: "TYPE_DISABLED" };

  const cohort = assignedCohort(input.uid.trim(), input.policy);
  if (!cohortIncludes(cohort, flag.cohort)) return { enabled: false, cohort, reason: "COHORT_NOT_ELIGIBLE" };
  return { enabled: true, cohort, reason: "ENABLED" };
}
