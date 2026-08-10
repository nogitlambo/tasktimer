import { z } from "zod";

import {
  AUTOMATION_RULE_TYPE_VALUES,
  AutomationRuleTrustLevelSchema,
  AutomationRuleTypeSchema,
  TRUSTED_AUTOMATION_SCHEMA_VERSION,
  type AutomationRuleType,
  type AutomationRuleTrustLevel,
} from "./trustedAutomationContract";

export const AUTOMATION_SETTINGS_DOCUMENT_ID = "settings";
export const AUTOMATION_SETTINGS_COLLECTION = "automationSettings";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const AutomationRulePolicySchema = z.object({
  ruleId: AutomationRuleTypeSchema,
  enabled: z.boolean(),
  trustLevel: AutomationRuleTrustLevelSchema,
});

export const AutomationSettingsSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  userId: z.string().trim().min(1).max(120),
  automationEnabled: z.boolean(),
  consentGranted: z.boolean(),
  pauseAll: z.boolean(),
  rules: z.array(AutomationRulePolicySchema).length(AUTOMATION_RULE_TYPE_VALUES.length),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).superRefine((settings, context) => {
  const ids = settings.rules.map((rule) => rule.ruleId);
  if (new Set(ids).size !== ids.length || AUTOMATION_RULE_TYPE_VALUES.some((ruleId) => !ids.includes(ruleId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rules"], message: "Automation settings must contain each supported rule exactly once." });
  }
});

export const AutomationSettingsPatchSchema = z.object({
  automationEnabled: z.boolean().optional(),
  consentGranted: z.boolean().optional(),
  pauseAll: z.boolean().optional(),
  rules: z.array(AutomationRulePolicySchema).max(AUTOMATION_RULE_TYPE_VALUES.length).optional(),
}).strict();

export type AutomationRulePolicy = z.infer<typeof AutomationRulePolicySchema>;
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>;
export type AutomationSettingsPatch = z.infer<typeof AutomationSettingsPatchSchema>;

export type AutomationPolicyReason =
  | "AUTOMATION_DISABLED"
  | "CONSENT_REQUIRED"
  | "PAUSED"
  | "UNSUPPORTED_RULE"
  | "RULE_DISABLED";

export type AutomationPolicyEvaluation = {
  allowed: boolean;
  reason?: AutomationPolicyReason;
  trustLevel: AutomationRuleTrustLevel | null;
  requiresConfirmation: boolean;
};

function isoAt(nowMs: number) {
  return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
}

function defaultRule(ruleId: AutomationRuleType): AutomationRulePolicy {
  return { ruleId, enabled: false, trustLevel: "ASSISTED" };
}

export function createDefaultAutomationSettings(userId: string, nowMs = Date.now()): AutomationSettings {
  const timestamp = isoAt(nowMs);
  return AutomationSettingsSchema.parse({
    schemaVersion: TRUSTED_AUTOMATION_SCHEMA_VERSION,
    userId: userId.trim(),
    automationEnabled: false,
    consentGranted: false,
    pauseAll: false,
    rules: AUTOMATION_RULE_TYPE_VALUES.map(defaultRule),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function applyAutomationSettingsPatch(
  current: AutomationSettings,
  input: unknown,
  nowMs = Date.now()
): AutomationSettings {
  const patch = AutomationSettingsPatchSchema.parse(input);
  const nextConsent = patch.consentGranted ?? current.consentGranted;
  const nextRules = current.rules.map((currentRule) => {
    const update = patch.rules?.find((rule) => rule.ruleId === currentRule.ruleId);
    return update ? { ...currentRule, ...update } : currentRule;
  });

  const requestsTrustedRule = patch.rules?.some((rule) => rule.enabled && rule.trustLevel === "TRUSTED") ?? false;
  if (!nextConsent && requestsTrustedRule) {
    throw Object.assign(new Error("Consent is required before enabling trusted automation rules."), { code: "automation/consent-required" });
  }

  return AutomationSettingsSchema.parse({
    ...current,
    ...patch,
    consentGranted: nextConsent,
    rules: nextRules,
    updatedAt: isoAt(nowMs),
  });
}

export function evaluateAutomationPolicy(
  settings: AutomationSettings,
  input: { ruleId: AutomationRuleType }
): AutomationPolicyEvaluation {
  const parsedRuleId = AutomationRuleTypeSchema.safeParse(input.ruleId);
  if (!parsedRuleId.success) {
    return { allowed: false, reason: "UNSUPPORTED_RULE", trustLevel: null, requiresConfirmation: false };
  }
  if (!settings.automationEnabled) {
    return { allowed: false, reason: "AUTOMATION_DISABLED", trustLevel: null, requiresConfirmation: false };
  }
  if (!settings.consentGranted) {
    return { allowed: false, reason: "CONSENT_REQUIRED", trustLevel: null, requiresConfirmation: false };
  }
  if (settings.pauseAll) {
    return { allowed: false, reason: "PAUSED", trustLevel: null, requiresConfirmation: false };
  }

  const rule = settings.rules.find((candidate) => candidate.ruleId === parsedRuleId.data);
  if (!rule) {
    return { allowed: false, reason: "UNSUPPORTED_RULE", trustLevel: null, requiresConfirmation: false };
  }
  if (!rule.enabled) {
    return { allowed: false, reason: "RULE_DISABLED", trustLevel: rule.trustLevel, requiresConfirmation: false };
  }
  return {
    allowed: true,
    trustLevel: rule.trustLevel,
    requiresConfirmation: rule.trustLevel === "ASSISTED",
  };
}
