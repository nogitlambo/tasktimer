import { trackEvent } from "@/lib/firebaseTelemetry";

export type RecoveryTelemetryStage = "offered" | "opened" | "dismissed" | "action_selected" | "actions_applied" | "partially_applied" | "completed" | "expired" | "stale" | "failed" | "restart_started" | "clarification_opened";
export type RecoveryTelemetryInput = {
  triggerCodes?: unknown;
  backlogCount?: unknown;
  overdueCount?: unknown;
  urgentCount?: unknown;
  flexibleCount?: unknown;
  actionCount?: unknown;
  selectedCount?: unknown;
  appliedCount?: unknown;
  staleCount?: unknown;
  capacityMax?: unknown;
  errorCategory?: unknown;
  [key: string]: unknown;
};

const triggerCodes = new Set(["INACTIVE_MULTIPLE_DAYS", "BACKLOG_THRESHOLD_EXCEEDED", "OVERDUE_TASK_THRESHOLD_EXCEEDED", "MULTIPLE_MISSED_SCHEDULED_DAYS", "REPEATED_PLAN_OVERLOAD", "REPEATED_REPAIR_DISMISSAL", "CAPACITY_BACKLOG_MISMATCH", "USER_REQUESTED_RECOVERY"]);
const errorCategories = new Set(["network", "unauthenticated", "invalid_response", "conflict", "expired", "unknown"]);

function bucket(value: unknown, bounds: number[], labels: string[]) {
  const number = Math.floor(Number(value));
  if (!Number.isInteger(number) || number < 0) return null;
  const index = bounds.findIndex((bound) => number <= bound);
  return labels[index < 0 ? labels.length - 1 : index] || null;
}

function count(value: unknown) {
  const number = Math.floor(Number(value));
  return Number.isInteger(number) && number >= 0 && number <= 1000 ? number : null;
}

export function buildRecoveryTelemetryParams(stage: RecoveryTelemetryStage, input: RecoveryTelemetryInput = {}) {
  const params: Record<string, string | number> = { lifecycle_stage: stage };
  const safeTriggers = Array.isArray(input.triggerCodes) ? input.triggerCodes.filter((value) => triggerCodes.has(String(value))).slice(0, 8) : [];
  const errorCategory = String(input.errorCategory || "").trim();
  if (safeTriggers.length) params.trigger_codes = safeTriggers.join(",");
  if (errorCategories.has(errorCategory)) params.error_category = errorCategory;
  const buckets = [
    ["backlog_count_bucket", bucket(input.backlogCount, [0, 3, 8, 15], ["none", "1_to_3", "4_to_8", "9_to_15", "16_plus"])],
    ["overdue_count_bucket", bucket(input.overdueCount, [0, 3, 8], ["none", "1_to_3", "4_to_8", "9_plus"])],
    ["urgent_count_bucket", bucket(input.urgentCount, [0, 3, 8], ["none", "1_to_3", "4_to_8", "9_plus"])],
    ["flexible_count_bucket", bucket(input.flexibleCount, [0, 3, 8], ["none", "1_to_3", "4_to_8", "9_plus"])],
    ["capacity_max_bucket", bucket(input.capacityMax, [0, 30, 60, 120], ["zero", "1_to_30", "31_to_60", "61_to_120", "over_120"])],
  ] as const;
  for (const [key, value] of buckets) if (value) params[key] = value;
  for (const [key, value] of [["action_count", input.actionCount], ["selected_count", input.selectedCount], ["applied_count", input.appliedCount], ["stale_count", input.staleCount]] as const) {
    const safeCount = count(value);
    if (safeCount != null) params[key] = safeCount;
  }
  return params;
}

export async function trackRecovery(stage: RecoveryTelemetryStage, input: RecoveryTelemetryInput = {}) {
  await trackEvent("recovery_mode_lifecycle", buildRecoveryTelemetryParams(stage, input));
}
