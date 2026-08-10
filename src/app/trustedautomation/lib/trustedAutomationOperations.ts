import { z } from "zod";

import {
  AutomationErrorCategorySchema,
  AutomationErrorCodeSchema,
  AutomationExecutionStateSchema,
  AutomationRuleTypeSchema,
  type AutomationErrorCategory,
  type AutomationErrorCode,
  type AutomationExecutionState,
  type AutomationRuleType,
} from "./trustedAutomationContract";

const integerEnv = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
};

export const TrustedAutomationOperationalConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  queueMaxItems: z.number().int().min(1).max(100_000),
  lockTtlMs: z.number().int().min(1_000).max(86_400_000),
  executionTimeoutMs: z.number().int().min(1_000).max(86_400_000),
  executionRetentionMs: z.number().int().min(60_000).max(365 * 24 * 60 * 60 * 1000),
  queueRetentionMs: z.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000),
}).strict();

export type TrustedAutomationOperationalConfig = z.infer<typeof TrustedAutomationOperationalConfigSchema>;

export const DEFAULT_TRUSTED_AUTOMATION_OPERATIONAL_CONFIG: TrustedAutomationOperationalConfig = {
  maxRetries: 3,
  queueMaxItems: 10_000,
  lockTtlMs: 5 * 60 * 1000,
  executionTimeoutMs: 2 * 60 * 1000,
  executionRetentionMs: 30 * 24 * 60 * 60 * 1000,
  queueRetentionMs: 24 * 60 * 60 * 1000,
};

export function loadTrustedAutomationOperationalConfig(env: Record<string, unknown> = process.env) {
  return TrustedAutomationOperationalConfigSchema.parse({
    maxRetries: integerEnv(env.TRUSTED_AUTOMATION_MAX_RETRIES, 3, 0, 10),
    queueMaxItems: integerEnv(env.TRUSTED_AUTOMATION_QUEUE_MAX_ITEMS, 10_000, 1, 100_000),
    lockTtlMs: integerEnv(env.TRUSTED_AUTOMATION_LOCK_TTL_MS, 5 * 60 * 1000, 1_000, 86_400_000),
    executionTimeoutMs: integerEnv(env.TRUSTED_AUTOMATION_EXECUTION_TIMEOUT_MS, 2 * 60 * 1000, 1_000, 86_400_000),
    executionRetentionMs: integerEnv(env.TRUSTED_AUTOMATION_EXECUTION_RETENTION_MS, 30 * 24 * 60 * 60 * 1000, 60_000, 365 * 24 * 60 * 60 * 1000),
    queueRetentionMs: integerEnv(env.TRUSTED_AUTOMATION_QUEUE_RETENTION_MS, 24 * 60 * 60 * 1000, 60_000, 30 * 24 * 60 * 60 * 1000),
  });
}

export function resolveTrustedAutomationOperationalConfig(overrides?: Partial<TrustedAutomationOperationalConfig>) {
  return TrustedAutomationOperationalConfigSchema.parse({ ...loadTrustedAutomationOperationalConfig(), ...overrides });
}

export const TRUSTED_AUTOMATION_METRIC_NAMES = [
  "queue_depth",
  "throughput",
  "latency",
  "execution_outcome",
  "execution_error",
  "retry_count",
  "dead_letter_count",
  "lock_contention",
  "stale_execution",
  "authorization_failure",
  "schema_incompatibility",
  "rollout_disabled",
  "user_opt_out",
] as const;

export const TrustedAutomationMetricEventSchema = z.object({
  name: z.enum(TRUSTED_AUTOMATION_METRIC_NAMES),
  value: z.number().finite().min(0).max(1_000_000),
  ruleId: AutomationRuleTypeSchema.optional(),
  state: AutomationExecutionStateSchema.optional(),
  category: AutomationErrorCategorySchema.optional(),
  code: AutomationErrorCodeSchema.optional(),
}).strict();

export type TrustedAutomationMetricEvent = z.infer<typeof TrustedAutomationMetricEventSchema>;

export function createTrustedAutomationMetricsRecorder() {
  const events: TrustedAutomationMetricEvent[] = [];
  return {
    record(event: TrustedAutomationMetricEvent) {
      events.push(TrustedAutomationMetricEventSchema.parse(event));
    },
    snapshot() {
      return events.slice();
    },
    clear() {
      events.length = 0;
    },
  };
}

export type TrustedAutomationHealthStatus = "ok" | "degraded" | "failed";

export function buildTrustedAutomationHealth(input: {
  firestore: TrustedAutomationHealthStatus;
  queue: TrustedAutomationHealthStatus;
  dependencies: TrustedAutomationHealthStatus;
}) {
  const statuses = Object.values(input);
  const status: TrustedAutomationHealthStatus = statuses.includes("failed")
    ? "failed"
    : statuses.includes("degraded")
      ? "degraded"
      : "ok";
  return { status, checks: input } as const;
}

export const TRUSTED_AUTOMATION_ALERT_CODES = [
  "QUEUE_BACKLOG",
  "HIGH_FAILURE_RATE",
  "RETRY_STORM",
  "LOCK_LEAKAGE",
  "AUTHORIZATION_SPIKE",
  "SCHEMA_INCOMPATIBILITY",
] as const;

export type TrustedAutomationAlertCode = typeof TRUSTED_AUTOMATION_ALERT_CODES[number];

export type TrustedAutomationAlertThresholds = {
  queueDepth: number;
  executionErrors: number;
  retries: number;
  lockContention: number;
  authorizationFailures: number;
  schemaIncompatibilities: number;
};

export const DEFAULT_TRUSTED_AUTOMATION_ALERT_THRESHOLDS: TrustedAutomationAlertThresholds = {
  queueDepth: 1_000,
  executionErrors: 25,
  retries: 25,
  lockContention: 25,
  authorizationFailures: 10,
  schemaIncompatibilities: 1,
};

export function buildTrustedAutomationAlerts(
  events: readonly TrustedAutomationMetricEvent[],
  thresholds: Partial<TrustedAutomationAlertThresholds> = {}
) {
  const limits = { ...DEFAULT_TRUSTED_AUTOMATION_ALERT_THRESHOLDS, ...thresholds };
  const total = (name: TrustedAutomationMetricEvent["name"]) => events.filter((event) => event.name === name).reduce((sum, event) => sum + event.value, 0);
  const alerts: Array<{ code: TrustedAutomationAlertCode; value: number; threshold: number }> = [];
  const checks: Array<[TrustedAutomationAlertCode, number, number]> = [
    ["QUEUE_BACKLOG", Math.max(0, ...events.filter((event) => event.name === "queue_depth").map((event) => event.value)), limits.queueDepth],
    ["HIGH_FAILURE_RATE", total("execution_error"), limits.executionErrors],
    ["RETRY_STORM", total("retry_count"), limits.retries],
    ["LOCK_LEAKAGE", total("lock_contention"), limits.lockContention],
    ["AUTHORIZATION_SPIKE", total("authorization_failure"), limits.authorizationFailures],
    ["SCHEMA_INCOMPATIBILITY", total("schema_incompatibility"), limits.schemaIncompatibilities],
  ];
  for (const [code, value, threshold] of checks) {
    if (value >= threshold) alerts.push({ code, value, threshold });
  }
  return alerts;
}

export type TrustedAutomationOperationalMetric = {
  name: typeof TRUSTED_AUTOMATION_METRIC_NAMES[number];
  value: number;
  ruleId?: AutomationRuleType;
  state?: AutomationExecutionState;
  category?: AutomationErrorCategory;
  code?: AutomationErrorCode;
};
