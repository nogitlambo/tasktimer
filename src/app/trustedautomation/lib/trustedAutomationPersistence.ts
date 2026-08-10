import { z } from "zod";

import {
  AutomationEntityTypeSchema,
  AutomationEventEnvelopeSchema,
  AutomationExecutionSchema,
  AutomationEventTypeSchema,
  AutomationRuleSchema,
  AutomationRuleTypeSchema,
  type AutomationContractParseResult,
  type AutomationEventEnvelope,
  type AutomationExecution,
  type AutomationRule,
  parseAutomationEventEnvelope,
  parseAutomationRule,
} from "./trustedAutomationContract";

const PersistenceMetadataSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const EventPersistenceMetadataSchema = z.object({
  persistedAt: z.string().datetime({ offset: true }),
});

export const AutomationReferencedEntityMetadataSchema = z.object({
  entityType: AutomationEntityTypeSchema,
  entityId: z.string().trim().min(1).max(180),
  entityVersion: z.string().trim().min(1).max(200),
});

export const AUTOMATION_HISTORY_OUTCOME_VALUES = ["SUCCESS", "FAILED", "SKIPPED", "CANCELLED"] as const;
export const AUTOMATION_HISTORY_REASON_CODE_VALUES = [
  "SUCCESS",
  "FAILURE",
  "STALE",
  "AUTO_REFRESH",
  "USER_REQUESTED",
  "RULE_DISABLED",
  "PAUSED",
  "CONSENT_REQUIRED",
  "DEPENDENCY_UNAVAILABLE",
  "SKIPPED_STALE",
  "RETRY_EXHAUSTED",
  "CONFIRMATION_REQUIRED",
  "FEATURE_UNAVAILABLE",
  "OWNERSHIP_FAILED",
  "ENTITY_STALE",
  "CONFLICT",
  "USER_REJECTED",
  "UNDO_USED",
] as const;

export const AutomationHistoryOutcomeSchema = z.enum(AUTOMATION_HISTORY_OUTCOME_VALUES);
export const AutomationHistoryReasonCodeSchema = z.enum(AUTOMATION_HISTORY_REASON_CODE_VALUES);
export const AutomationHistorySchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1).max(180),
  userId: z.string().trim().min(1).max(120),
  executionId: z.string().trim().min(1).max(180),
  ruleId: AutomationRuleTypeSchema,
  trigger: z.string().trim().min(1).max(120),
  eventType: AutomationEventTypeSchema.optional(),
  entity: AutomationReferencedEntityMetadataSchema,
  outcome: AutomationHistoryOutcomeSchema,
  reasonCodes: z.array(AutomationHistoryReasonCodeSchema).max(AUTOMATION_HISTORY_REASON_CODE_VALUES.length),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  retentionExpiresAt: z.string().datetime({ offset: true }),
});

export const AutomationRulePersistenceEntitySchema = z.intersection(AutomationRuleSchema, PersistenceMetadataSchema);
export const AutomationExecutionRetentionMetadataSchema = PersistenceMetadataSchema.extend({
  retentionExpiresAt: z.string().datetime({ offset: true }),
});
export const AutomationExecutionPersistenceEntitySchema = z.intersection(AutomationExecutionSchema, AutomationExecutionRetentionMetadataSchema);
export const AutomationEventPersistenceEntitySchema = z.intersection(AutomationEventEnvelopeSchema, EventPersistenceMetadataSchema);

export type AutomationRulePersistenceEntity = z.infer<typeof AutomationRulePersistenceEntitySchema>;
export type AutomationExecutionPersistenceEntity = z.infer<typeof AutomationExecutionPersistenceEntitySchema>;
export type AutomationEventPersistenceEntity = z.infer<typeof AutomationEventPersistenceEntitySchema>;
export type AutomationReferencedEntityMetadata = z.infer<typeof AutomationReferencedEntityMetadataSchema>;
export type AutomationHistoryOutcome = z.infer<typeof AutomationHistoryOutcomeSchema>;
export type AutomationHistoryReasonCode = z.infer<typeof AutomationHistoryReasonCodeSchema>;
export type AutomationHistory = z.infer<typeof AutomationHistorySchema>;

export function buildAutomationRulePersistenceEntity(
  rule: AutomationRule,
  metadata: Pick<AutomationRulePersistenceEntity, "createdAt" | "updatedAt">
): AutomationRulePersistenceEntity {
  return { ...rule, ...metadata } as AutomationRulePersistenceEntity;
}

export function parseAutomationRulePersistenceEntity(value: unknown): AutomationContractParseResult<AutomationRule> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: { code: "INVALID_SCHEMA", message: "Persisted automation rule must be an object." } };
  }
  const persisted = AutomationRulePersistenceEntitySchema.safeParse(value);
  if (!persisted.success) {
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1) {
      return { success: false, error: { code: "UNSUPPORTED_VERSION", message: "Unsupported persisted rule schema versions fail closed." } };
    }
    return { success: false, error: { code: "INVALID_SCHEMA", message: "Persisted automation rule is invalid." } };
  }
  const domain = Object.fromEntries(Object.entries(persisted.data).filter(([key]) => key !== "createdAt" && key !== "updatedAt"));
  return parseAutomationRule(domain);
}

export function buildAutomationExecutionPersistenceEntity(
  execution: AutomationExecution,
  metadata: Pick<AutomationExecutionPersistenceEntity, "createdAt" | "updatedAt" | "retentionExpiresAt">
): AutomationExecutionPersistenceEntity {
  return { ...execution, ...metadata } as AutomationExecutionPersistenceEntity;
}

export function parseAutomationExecutionPersistenceEntity(value: unknown): AutomationExecution | null {
  const parsed = AutomationExecutionPersistenceEntitySchema.safeParse(value);
  if (!parsed.success) return null;
  const result = AutomationExecutionSchema.safeParse(parsed.data);
  return result.success ? result.data : null;
}

export function buildAutomationEventPersistenceEntity(
  event: AutomationEventEnvelope,
  persistedAt: AutomationEventPersistenceEntity["persistedAt"]
): AutomationEventPersistenceEntity {
  return { ...event, persistedAt } as AutomationEventPersistenceEntity;
}

export function parseAutomationEventPersistenceEntity(value: unknown): AutomationEventEnvelope | null {
  const parsed = AutomationEventPersistenceEntitySchema.safeParse(value);
  if (!parsed.success) return null;
  const domain = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key !== "persistedAt"));
  const result = parseAutomationEventEnvelope(domain);
  return result.success ? result.data : null;
}
