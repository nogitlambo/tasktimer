import { trackEvent } from "@/lib/firebaseTelemetry";

export type DailyCapacityTelemetryStage =
  | "generated" | "viewed" | "refreshed" | "override_opened" | "override_set"
  | "override_cleared" | "source_changed" | "insufficient_history" | "failed";

export type DailyCapacityTelemetryInput = {
  state?: unknown; confidence?: unknown; primarySource?: unknown; sourceSignals?: unknown;
  overrideType?: unknown; errorCategory?: unknown; latencyMs?: unknown; sampleSize?: unknown;
  remainingMin?: unknown; remainingMax?: unknown;
};

const states = ["REDUCED", "LIGHT", "STANDARD", "STRONG", "USER_DEFINED", "INSUFFICIENT_DATA"] as const;
const confidences = ["LOW", "MEDIUM", "HIGH"] as const;
const sources = ["USER_CUSTOM", "USER_STATE", "WEEKDAY_HISTORY", "ROLLING_HISTORY", "DEFAULT"] as const;
const reasons = ["USER_OVERRIDE", "CUSTOM_MINUTES", "FOCUS_WINDOW_REMAINING", "SCHEDULE_AVAILABILITY", "WEEKDAY_HISTORY", "ROLLING_HISTORY", "TODAY_COMPLETED_WORK", "DEFAULT_BASELINE", "AVAILABLE_TIME_CAP", "INSUFFICIENT_HISTORY", "HIGH_VARIANCE"] as const;
const overrideTypes = ["STATE", "MINUTES"] as const;
const errorCategories = ["network", "unauthenticated", "invalid_response", "unknown"] as const;

function safeBucket(value: unknown, bounds: readonly number[], labels: readonly string[]) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  const index = bounds.findIndex((bound) => numberValue <= bound);
  return labels[index === -1 ? labels.length - 1 : index];
}

function latencyBucket(value: unknown) { return safeBucket(value, [300, 1000, 3000], ["under_300ms", "300ms_to_1s", "1s_to_3s", "over_3s"]); }
function sampleSizeBucket(value: unknown) { return safeBucket(value, [0, 3, 6, 13, 27], ["none", "1_to_3", "4_to_6", "7_to_13", "14_to_27", "28_plus"]); }
function remainingCapacityBucket(value: unknown) { return safeBucket(value, [0, 30, 60, 120], ["zero", "1_to_30", "31_to_60", "61_to_120", "over_120"]); }

export function buildDailyCapacityTelemetryParams(stage: DailyCapacityTelemetryStage, input: DailyCapacityTelemetryInput = {}) {
  const params: Record<string, string | number> = { lifecycle_stage: stage };
  const state = String(input.state || "").trim();
  const confidence = String(input.confidence || "").trim();
  const primarySource = String(input.primarySource || "").trim();
  const overrideType = String(input.overrideType || "").trim();
  const errorCategory = String(input.errorCategory || "").trim();
  if ((states as readonly string[]).includes(state)) params.capacity_state = state;
  if ((confidences as readonly string[]).includes(confidence)) params.confidence = confidence;
  if ((sources as readonly string[]).includes(primarySource)) params.primary_source = primarySource;
  if ((overrideTypes as readonly string[]).includes(overrideType)) params.override_type = overrideType;
  if ((errorCategories as readonly string[]).includes(errorCategory)) params.error_category = errorCategory;
  const signals = Array.isArray(input.sourceSignals)
    ? input.sourceSignals.filter((value): value is string => (reasons as readonly string[]).includes(String(value))).slice(0, 5)
    : [];
  if (signals.length) params.reason_codes = signals.join(",");
  const buckets = [
    ["latency_bucket", latencyBucket(input.latencyMs)],
    ["sample_size_bucket", sampleSizeBucket(input.sampleSize)],
    ["remaining_min_bucket", remainingCapacityBucket(input.remainingMin)],
    ["remaining_max_bucket", remainingCapacityBucket(input.remainingMax)],
  ] as const;
  for (const [key, value] of buckets) if (value) params[key] = value;
  return params;
}

export async function trackDailyCapacity(stage: DailyCapacityTelemetryStage, input: DailyCapacityTelemetryInput = {}) {
  await trackEvent("daily_capacity_lifecycle", buildDailyCapacityTelemetryParams(stage, input));
}
