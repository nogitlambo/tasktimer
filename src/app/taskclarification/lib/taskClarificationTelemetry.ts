import { trackEvent } from "@/lib/firebaseTelemetry";

export type TaskClarificationTelemetryStage =
  | "opened"
  | "proposal_ready"
  | "stale_blocked"
  | "applied"
  | "dismissed"
  | "undone"
  | "partial_undo"
  | "failed";

export type TaskClarificationTelemetryInput = {
  modelVersion?: unknown;
  promptVersion?: unknown;
  latencyMs?: unknown;
  costBucket?: unknown;
  acceptedFieldCount?: unknown;
  selectedSubtaskCount?: unknown;
  errorCategory?: unknown;
  [key: string]: unknown;
};

const errorCategories = [
  "provider_failure",
  "invalid_schema",
  "rate_limited",
  "entitlement_rejected",
  "stale_task",
  "expired_recommendation",
  "apply_conflict",
  "partial_write",
  "retry_exhausted",
  "undo_failure",
  "network_failure",
  "unknown",
] as const;

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedCount(value: unknown, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.floor(parsed))) : null;
}

function latencyBucket(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed < 1000) return "under_1_second";
  if (parsed < 3000) return "1_to_3_seconds";
  return "over_3_seconds";
}

function normalizeErrorCategory(value: unknown) {
  const candidate = boundedString(value, 80).split(/[:\s]/, 1)[0];
  return (errorCategories as readonly string[]).includes(candidate) ? candidate : candidate ? "unknown" : null;
}

export function buildTaskClarificationTelemetryParams(stage: TaskClarificationTelemetryStage, input: TaskClarificationTelemetryInput = {}) {
  const output: Record<string, string | number> = { lifecycle_stage: stage };
  const modelVersion = boundedString(input.modelVersion, 120);
  const promptVersion = boundedString(input.promptVersion, 120);
  const latency = latencyBucket(input.latencyMs);
  const costBucket = ["low", "medium", "high", "unknown"].includes(boundedString(input.costBucket, 20)) ? boundedString(input.costBucket, 20) : null;
  const acceptedFieldCount = boundedCount(input.acceptedFieldCount, 2);
  const selectedSubtaskCount = boundedCount(input.selectedSubtaskCount, 8);
  const errorCategory = normalizeErrorCategory(input.errorCategory);
  if (modelVersion) output.model_version = modelVersion;
  if (promptVersion) output.prompt_version = promptVersion;
  if (latency) output.latency_bucket = latency;
  if (costBucket) output.cost_bucket = costBucket;
  if (acceptedFieldCount !== null) output.accepted_field_count = acceptedFieldCount;
  if (selectedSubtaskCount !== null) output.selected_subtask_count = selectedSubtaskCount;
  if (errorCategory) output.error_category = errorCategory;
  return output;
}

export async function trackTaskClarificationLifecycle(stage: TaskClarificationTelemetryStage, input: TaskClarificationTelemetryInput = {}) {
  await trackEvent("task_clarification_lifecycle", buildTaskClarificationTelemetryParams(stage, input));
}
