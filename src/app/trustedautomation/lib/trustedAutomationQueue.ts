import { z } from "zod";

import {
  AutomationEntityTypeSchema,
  AutomationPrioritySchema,
  AutomationRuleTypeSchema,
  TRUSTED_AUTOMATION_SCHEMA_VERSION,
  type AutomationErrorCategory,
  type AutomationExecutionState,
  type AutomationPriority,
} from "./trustedAutomationContract";

export const AUTOMATION_QUEUE_COLLECTION = "automationQueues";
export const AUTOMATION_LOCK_COLLECTION = "automationLocks";
export const AUTOMATION_QUEUE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const AUTOMATION_LOCK_TTL_MS = 5 * 60 * 1000;
export const AUTOMATION_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

const idSchema = z.string().trim().min(1).max(180);
const versionSchema = z.string().trim().min(1).max(200);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const AutomationQueueItemSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  id: idSchema,
  userId: z.string().trim().min(1).max(120),
  ruleId: AutomationRuleTypeSchema,
  entityId: idSchema,
  entityType: AutomationEntityTypeSchema,
  entityVersion: versionSchema,
  priority: AutomationPrioritySchema,
  idempotencyKey: z.string().trim().min(1).max(240),
  queuedAt: isoDateTimeSchema,
  sequence: z.number().int().nonnegative(),
  expiresAt: isoDateTimeSchema,
}).strict();

export const AutomationLockSchema = z.object({
  schemaVersion: z.literal(TRUSTED_AUTOMATION_SCHEMA_VERSION),
  id: idSchema,
  userId: z.string().trim().min(1).max(120),
  entityType: AutomationEntityTypeSchema,
  entityId: idSchema,
  ownerExecutionId: idSchema,
  acquiredAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

export type AutomationQueueItem = z.infer<typeof AutomationQueueItemSchema>;
export type AutomationLock = z.infer<typeof AutomationLockSchema>;

const priorityRank: Record<AutomationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function orderAutomationQueue(items: readonly AutomationQueueItem[]) {
  return [...items].sort((left, right) => {
    const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const sequenceDifference = left.sequence - right.sequence;
    if (sequenceDifference !== 0) return sequenceDifference;
    return left.id.localeCompare(right.id);
  });
}

export function deduplicateAutomationQueue(items: readonly AutomationQueueItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.idempotencyKey)) return false;
    seen.add(item.idempotencyKey);
    return true;
  });
}

export type AutomationLockDecision =
  | { kind: "ACQUIRED"; lock: AutomationLock }
  | { kind: "ALREADY_HELD"; lock: AutomationLock }
  | { kind: "CONFLICT"; lock: AutomationLock };

export function acquireAutomationLock(existing: AutomationLock | null, requested: AutomationLock, nowMs: number): AutomationLockDecision {
  if (!existing || Date.parse(existing.expiresAt) <= nowMs) return { kind: "ACQUIRED", lock: requested };
  if (existing.ownerExecutionId === requested.ownerExecutionId) return { kind: "ALREADY_HELD", lock: existing };
  return { kind: "CONFLICT", lock: existing };
}

export function releaseAutomationLock(existing: AutomationLock | null, ownerExecutionId: string) {
  if (!existing) return { kind: "ALREADY_RELEASED" as const };
  if (existing.ownerExecutionId !== ownerExecutionId) return { kind: "NOT_OWNER" as const, lock: existing };
  return { kind: "RELEASED" as const };
}

export function evaluateAutomationRetry(input: {
  failureCategory: AutomationErrorCategory;
  retryCount: number;
  policy: { maxRetries: number; retryableCategories: readonly AutomationErrorCategory[]; backoffMs: number };
}) {
  const retryable = input.policy.retryableCategories.includes(input.failureCategory);
  if (!retryable || input.retryCount >= input.policy.maxRetries) {
    return { retry: false as const, nextRetryCount: input.retryCount, delayMs: 0, nextState: "FAILED" as const };
  }
  const delayMs = Math.min(
    Math.max(0, input.policy.backoffMs) * 2 ** input.retryCount,
    AUTOMATION_MAX_RETRY_DELAY_MS
  );
  return { retry: true as const, nextRetryCount: input.retryCount + 1, delayMs, nextState: "QUEUED" as const };
}

export type AutomationQueueOutcomeReason = "PAUSED" | "CANCELLED" | "STALE_WORK" | "LOCK_CONFLICT";

export function resolveAutomationQueueOutcome(input: {
  paused?: boolean;
  cancelled?: boolean;
  stale?: boolean;
  lockConflict?: boolean;
}): { state: Extract<AutomationExecutionState, "SKIPPED" | "CANCELLED">; reason: AutomationQueueOutcomeReason } {
  if (input.paused) return { state: "CANCELLED", reason: "PAUSED" };
  if (input.cancelled) return { state: "CANCELLED", reason: "CANCELLED" };
  if (input.stale) return { state: "SKIPPED", reason: "STALE_WORK" };
  return { state: "SKIPPED", reason: "LOCK_CONFLICT" };
}

export function parseAutomationQueueItem(value: unknown) {
  const parsed = AutomationQueueItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAutomationLock(value: unknown) {
  const parsed = AutomationLockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
