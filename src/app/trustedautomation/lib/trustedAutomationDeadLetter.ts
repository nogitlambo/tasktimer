import { z } from "zod";

import {
  AutomationEntityTypeSchema,
  AutomationRuleTypeSchema,
  TRUSTED_AUTOMATION_SCHEMA_VERSION,
  type AutomationEntityType,
  type AutomationRuleType,
} from "./trustedAutomationContract";

export const AutomationDeadLetterSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  id: z.string().trim().min(1).max(180),
  userId: z.string().trim().min(1).max(120),
  executionId: z.string().trim().min(1).max(180),
  ruleId: AutomationRuleTypeSchema,
  entityType: AutomationEntityTypeSchema,
  entityId: z.string().trim().min(1).max(180),
  entityVersion: z.string().trim().min(1).max(200),
  reasonCode: z.string().trim().min(1).max(80),
  auditHistoryId: z.string().trim().min(1).max(180),
  failedAt: z.string().datetime({ offset: true }),
  replayState: z.literal("BLOCKED"),
}).strict();

export type AutomationDeadLetter = z.infer<typeof AutomationDeadLetterSchema>;

export function createAutomationDeadLetter(input: {
  id: string;
  userId: string;
  executionId: string;
  ruleId: AutomationRuleType;
  entityType: AutomationEntityType;
  entityId: string;
  entityVersion: string;
  reasonCode: string;
  auditHistoryId: string;
  failedAt: string;
}) {
  return AutomationDeadLetterSchema.parse({ ...input, schemaVersion: TRUSTED_AUTOMATION_SCHEMA_VERSION, replayState: "BLOCKED" });
}

export function resolveAutomationDeadLetter(input: AutomationDeadLetter) {
  const parsed = AutomationDeadLetterSchema.parse(input);
  return {
    state: parsed.replayState,
    requiresManualReview: true as const,
    canReplayAutomatically: false as const,
    auditHistoryId: parsed.auditHistoryId,
  };
}
