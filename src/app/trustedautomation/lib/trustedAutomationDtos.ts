import { z } from "zod";

import { AutomationExecutionStateSchema } from "./trustedAutomationContract";

export const ExecuteAutomationRequestSchema = z.object({
  ruleId: z.string().trim().min(1).max(180),
  entityId: z.string().trim().min(1).max(180),
  entityVersion: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
}).strict();

export const ExecuteAutomationResponseSchema = z.object({
  executionId: z.string().trim().min(1).max(180),
  state: AutomationExecutionStateSchema,
}).strict();

export const RetryAutomationRequestSchema = z.object({
  executionId: z.string().trim().min(1).max(180),
  idempotencyKey: z.string().uuid(),
}).strict();

export const AutomationHistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().max(180).optional(),
  outcome: z.enum(["SUCCESS", "FAILED", "SKIPPED", "CANCELLED"]).optional(),
}).strict();

export type ExecuteAutomationRequestDTO = z.infer<typeof ExecuteAutomationRequestSchema>;
export type ExecuteAutomationResponseDTO = z.infer<typeof ExecuteAutomationResponseSchema>;
export type RetryAutomationRequestDTO = z.infer<typeof RetryAutomationRequestSchema>;
export type AutomationHistoryQueryDTO = z.infer<typeof AutomationHistoryQuerySchema>;
