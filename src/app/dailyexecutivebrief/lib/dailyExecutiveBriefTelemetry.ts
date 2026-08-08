import { trackEvent } from "@/lib/firebaseTelemetry";

export type DailyExecutiveBriefTelemetryStage = "loaded" | "empty" | "insufficient_data" | "stale" | "failed" | "refreshed" | "started" | "adjustment_dismissed";

export type DailyExecutiveBriefTelemetryInput = {
  planHealth?: unknown;
  deadlineRisk?: unknown;
  adjustmentType?: unknown;
  reused?: unknown;
  latencyMs?: unknown;
  errorCategory?: unknown;
  [key: string]: unknown;
};

const planHealthValues = ["REALISTIC", "SLIGHTLY_OVERLOADED", "SIGNIFICANTLY_OVERLOADED", "INSUFFICIENT_DATA"] as const;
const deadlineRiskValues = ["NONE", "WATCH", "CRITICAL"] as const;
const adjustmentTypes = ["MOVE", "REDUCE", "SPLIT"] as const;
const errorCategories = ["network", "unauthenticated", "deleted_account", "expired", "invalid_response", "provider_failure", "unknown"] as const;

function boundedString(value: unknown, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function bucketLatency(value: unknown) {
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) return null;
  if (latency < 300) return "under_300ms";
  if (latency < 1000) return "300ms_to_1s";
  if (latency < 3000) return "1s_to_3s";
  return "over_3s";
}

export function buildDailyExecutiveBriefTelemetryParams(stage: DailyExecutiveBriefTelemetryStage, input: DailyExecutiveBriefTelemetryInput = {}) {
  const params: Record<string, string | number> = { lifecycle_stage: stage };
  const health = boundedString(input.planHealth, 40);
  const deadline = boundedString(input.deadlineRisk, 40);
  const adjustmentType = boundedString(input.adjustmentType, 40);
  const errorCategory = boundedString(input.errorCategory, 40);
  const latencyBucket = bucketLatency(input.latencyMs);
  if ((planHealthValues as readonly string[]).includes(health)) params.plan_health = health;
  if ((deadlineRiskValues as readonly string[]).includes(deadline)) params.deadline_risk = deadline;
  if ((adjustmentTypes as readonly string[]).includes(adjustmentType)) params.adjustment_type = adjustmentType;
  if (typeof input.reused === "boolean") params.reused = input.reused ? 1 : 0;
  if (latencyBucket) params.latency_bucket = latencyBucket;
  if ((errorCategories as readonly string[]).includes(errorCategory)) params.error_category = errorCategory;
  return params;
}

export async function trackDailyExecutiveBrief(stage: DailyExecutiveBriefTelemetryStage, input: DailyExecutiveBriefTelemetryInput = {}) {
  await trackEvent("daily_executive_brief_lifecycle", buildDailyExecutiveBriefTelemetryParams(stage, input));
}
