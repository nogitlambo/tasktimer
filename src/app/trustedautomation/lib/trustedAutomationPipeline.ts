import {
  AutomationErrorCategorySchema,
  AutomationErrorCodeSchema,
  AutomationErrorSchema,
  AutomationEventTypeSchema,
  AutomationExecutionSchema,
  parseAutomationRule,
  type AutomationExecution,
  type AutomationRule,
} from "./trustedAutomationContract";
import { evaluateAutomationPolicy, type AutomationSettings } from "./trustedAutomationPolicy";
import {
  acquireAutomationLock,
  type AutomationLock,
} from "./trustedAutomationQueue";
import { AutomationHistorySchema, type AutomationHistory } from "./trustedAutomationPersistence";
import { safeAutomationFailureMessage } from "./trustedAutomationSecurity";
import { resolveTrustedAutomationOperationalConfig, type TrustedAutomationMetricEvent, type TrustedAutomationOperationalConfig } from "./trustedAutomationOperations";
import { evaluateTrustedAutomationRollout, loadTrustedAutomationRolloutPolicy, type TrustedAutomationRolloutPolicy } from "./trustedAutomationRollout";

type PipelineEntity = {
  userId: string;
  entityType: AutomationRule["trigger"]["entityType"];
  entityId: string;
  version: string;
  available: boolean;
};

export type AutomationPipelineInput = {
  authenticatedUserId: string | null;
  settings: AutomationSettings;
  rule: AutomationRule;
  entity: PipelineEntity;
  entityVersion: string;
  idempotencyKey: string;
  executionId: string;
  nowMs: number;
  existingExecution?: AutomationExecution | null;
  existingLock?: AutomationLock | null;
  confirmationGranted?: boolean;
  conflict?: boolean;
  execute: () => Promise<void>;
  onExecution: (execution: AutomationExecution) => Promise<void> | void;
  onAudit: (history: AutomationHistory) => Promise<void> | void;
  onLockAcquired: (lock: AutomationLock) => Promise<void> | void;
  onLockReleased: (lock: AutomationLock) => Promise<void> | void;
  revalidateEntityVersion?: () => Promise<string>;
  operationalConfig?: Partial<TrustedAutomationOperationalConfig>;
  onMetric?: (event: TrustedAutomationMetricEvent) => void;
  rolloutPolicy?: TrustedAutomationRolloutPolicy;
};

export type AutomationPipelineResult =
  | { kind: "SUCCEEDED"; execution: AutomationExecution }
  | { kind: "FAILED"; execution: AutomationExecution }
  | { kind: "REPLAYED"; execution: AutomationExecution }
  | { kind: "SKIPPED"; reason: string };

function isoAt(nowMs: number) {
  return new Date(nowMs).toISOString();
}

function errorField(error: unknown, field: "category" | "code") {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
  return typeof value === "string" ? value : "";
}

function safeError(error: unknown) {
  const category = AutomationErrorCategorySchema.safeParse(errorField(error, "category"));
  const code = AutomationErrorCodeSchema.safeParse(errorField(error, "code"));
  return AutomationErrorSchema.parse({
    category: category.success ? category.data : "UNKNOWN",
    code: code.success ? code.data : "UNKNOWN",
    message: safeAutomationFailureMessage(category.success ? category.data : "UNKNOWN", code.success ? code.data : "UNKNOWN"),
  });
}

function historyFor(input: AutomationPipelineInput, execution: AutomationExecution, outcome: AutomationHistory["outcome"], reasonCodes: AutomationHistory["reasonCodes"], durationMs: number | null) {
  return AutomationHistorySchema.parse({
    schemaVersion: 1,
    id: `${execution.id}:history`,
    userId: input.authenticatedUserId,
    executionId: execution.id,
    ruleId: input.rule.type,
    trigger: input.rule.trigger.eventType || input.rule.trigger.type,
    eventType: AutomationEventTypeSchema.safeParse(input.rule.trigger.eventType).success ? input.rule.trigger.eventType : undefined,
    entity: {
      entityType: input.entity.entityType,
      entityId: input.entity.entityId,
      entityVersion: input.entity.version,
    },
    outcome,
    reasonCodes,
    durationMs,
    createdAt: isoAt(input.nowMs),
    retentionExpiresAt: new Date(input.nowMs + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

function runningExecution(input: AutomationPipelineInput): AutomationExecution {
  return AutomationExecutionSchema.parse({
    schemaVersion: 1,
    id: input.executionId,
    ruleId: input.rule.id,
    entityId: input.entity.entityId,
    entityType: input.entity.entityType,
    entityVersion: input.entityVersion,
    state: "RUNNING",
    idempotencyKey: input.idempotencyKey,
    retryCount: 0,
    createdAt: isoAt(input.nowMs),
    startedAt: isoAt(input.nowMs),
  });
}

export async function runTrustedAutomation(input: AutomationPipelineInput): Promise<AutomationPipelineResult> {
  const operationalConfig = resolveTrustedAutomationOperationalConfig(input.operationalConfig);
  const rolloutPolicy = input.rolloutPolicy || loadTrustedAutomationRolloutPolicy();
  const metric = (event: TrustedAutomationMetricEvent) => input.onMetric?.(event);
  const parsedRule = parseAutomationRule(input.rule);
  if (!parsedRule.success) {
    metric({ name: "schema_incompatibility", value: 1 });
    return { kind: "SKIPPED", reason: parsedRule.error.code };
  }
  if (!input.authenticatedUserId) {
    metric({ name: "authorization_failure", value: 1 });
    return { kind: "SKIPPED", reason: "AUTHENTICATION_REQUIRED" };
  }
  if (input.entity.userId !== input.authenticatedUserId || input.settings.userId !== input.authenticatedUserId) {
    metric({ name: "authorization_failure", value: 1, ruleId: parsedRule.data.type });
    return { kind: "SKIPPED", reason: "OWNERSHIP_FAILED" };
  }
  if (input.entity.entityType !== parsedRule.data.trigger.entityType) return { kind: "SKIPPED", reason: "ENTITY_TYPE_MISMATCH" };
  if (input.entityVersion !== input.entity.version) {
    metric({ name: "stale_execution", value: 1, ruleId: parsedRule.data.type });
    return { kind: "SKIPPED", reason: "ENTITY_STALE" };
  }
  if (!input.entity.available) return { kind: "SKIPPED", reason: "FEATURE_UNAVAILABLE" };

  const rollout = evaluateTrustedAutomationRollout({ uid: input.authenticatedUserId, ruleId: parsedRule.data.type, policy: rolloutPolicy });
  if (!rollout.enabled) {
    metric({ name: "rollout_disabled", value: 1, ruleId: parsedRule.data.type });
    return { kind: "SKIPPED", reason: `ROLLOUT_${rollout.reason}` };
  }

  const policy = evaluateAutomationPolicy(input.settings, { ruleId: parsedRule.data.type });
  if (!policy.allowed) return { kind: "SKIPPED", reason: policy.reason || "POLICY_REJECTED" };
  if (policy.requiresConfirmation && input.confirmationGranted !== true) {
    return { kind: "SKIPPED", reason: "CONFIRMATION_REQUIRED" };
  }
  if (input.existingExecution) {
    if (input.existingExecution.idempotencyKey === input.idempotencyKey) {
      metric({ name: "execution_outcome", value: 1, state: input.existingExecution.state, ruleId: parsedRule.data.type });
      return { kind: "REPLAYED", execution: input.existingExecution };
    }
    metric({ name: "execution_error", value: 1, code: "IDEMPOTENCY_CONFLICT", ruleId: parsedRule.data.type });
    return { kind: "SKIPPED", reason: "IDEMPOTENCY_CONFLICT" };
  }
  if (input.conflict) return { kind: "SKIPPED", reason: "CONFLICT" };

  if (input.revalidateEntityVersion) {
    let currentVersion: string;
    try {
      currentVersion = await input.revalidateEntityVersion();
    } catch {
      return { kind: "SKIPPED", reason: "ENTITY_UNAVAILABLE" };
    }
    if (currentVersion !== input.entityVersion) {
      metric({ name: "stale_execution", value: 1, ruleId: parsedRule.data.type });
      return { kind: "SKIPPED", reason: "ENTITY_STALE" };
    }
  }

  const nowIso = isoAt(input.nowMs);
  const requestedLock: AutomationLock = {
    schemaVersion: 1,
    id: `${input.entity.entityType}:${input.entity.entityId}`,
    userId: input.authenticatedUserId,
    entityType: input.entity.entityType,
    entityId: input.entity.entityId,
    ownerExecutionId: input.executionId,
    acquiredAt: nowIso,
    expiresAt: new Date(input.nowMs + operationalConfig.lockTtlMs).toISOString(),
  };
  const lockDecision = acquireAutomationLock(input.existingLock || null, requestedLock, input.nowMs);
  if (lockDecision.kind === "CONFLICT") {
    metric({ name: "lock_contention", value: 1, ruleId: parsedRule.data.type });
    return { kind: "SKIPPED", reason: "LOCK_CONFLICT" };
  }
  if (lockDecision.kind === "ACQUIRED") await input.onLockAcquired(lockDecision.lock);

  const running = runningExecution(input);
  try {
    await input.onExecution(running);
    await executeWithTimeout(input.execute, operationalConfig.executionTimeoutMs);
    const succeeded = AutomationExecutionSchema.parse({ ...running, state: "SUCCEEDED", finishedAt: isoAt(input.nowMs) });
    await input.onExecution(succeeded);
    await input.onAudit(historyFor(input, succeeded, "SUCCESS", ["SUCCESS"], 0));
    metric({ name: "execution_outcome", value: 1, state: "SUCCEEDED", ruleId: parsedRule.data.type });
    return { kind: "SUCCEEDED", execution: succeeded };
  } catch (error) {
    const safe = safeError(error);
    const failed = AutomationExecutionSchema.parse({ ...running, state: "FAILED", finishedAt: isoAt(input.nowMs), error: safe });
    await input.onExecution(failed);
    await input.onAudit(historyFor(input, failed, "FAILED", ["FAILURE"], 0));
    metric({ name: "execution_outcome", value: 1, state: "FAILED", ruleId: parsedRule.data.type });
    metric({ name: "execution_error", value: 1, category: safe.category, code: safe.code, ruleId: parsedRule.data.type });
    return { kind: "FAILED", execution: failed };
  } finally {
    if (lockDecision.kind === "ACQUIRED") await input.onLockReleased(lockDecision.lock);
  }
}

async function executeWithTimeout(execute: () => Promise<void>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      execute(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Automation execution timed out."), { category: "TIMEOUT", code: "TIMEOUT" })), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
