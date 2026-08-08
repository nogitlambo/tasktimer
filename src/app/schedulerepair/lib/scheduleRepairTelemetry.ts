import { trackEvent } from "@/lib/firebaseTelemetry";

export type ScheduleRepairTelemetryStage = "viewed" | "refreshed" | "dismissed" | "applied" | "undone" | "clarification_opened" | "failed";

export type ScheduleRepairTelemetryInput = {
  actionCount?: unknown;
  selectedCount?: unknown;
  appliedCount?: unknown;
  staleCount?: unknown;
  planHealth?: unknown;
  outcome?: unknown;
  errorCategory?: unknown;
};

const planHealthValues = ["REALISTIC", "SLIGHTLY_OVERLOADED", "SIGNIFICANTLY_OVERLOADED", "INSUFFICIENT_DATA"] as const;
const outcomeValues = ["INSUFFICIENT_DATA", "NO_REPAIR_NEEDED", "REPAIR_REQUIRED", "NO_SAFE_SOLUTION"] as const;
const errorCategories = ["network", "unauthenticated", "invalid_response", "conflict", "unknown"] as const;

function safeCount(value: unknown) {
  const count = Math.floor(Number(value));
  return Number.isInteger(count) && count >= 0 && count <= 20 ? count : null;
}

export function buildScheduleRepairTelemetryParams(stage: ScheduleRepairTelemetryStage, input: ScheduleRepairTelemetryInput = {}) {
  const params: Record<string, string | number> = { lifecycle_stage: stage };
  const planHealth = String(input.planHealth || "").trim();
  const outcome = String(input.outcome || "").trim();
  const errorCategory = String(input.errorCategory || "").trim();
  if ((planHealthValues as readonly string[]).includes(planHealth)) params.plan_health = planHealth;
  if ((outcomeValues as readonly string[]).includes(outcome)) params.outcome = outcome;
  if ((errorCategories as readonly string[]).includes(errorCategory)) params.error_category = errorCategory;
  for (const [key, value] of [["action_count", input.actionCount], ["selected_count", input.selectedCount], ["applied_count", input.appliedCount], ["stale_count", input.staleCount]] as const) {
    const count = safeCount(value);
    if (count != null) params[key] = count;
  }
  return params;
}

export async function trackScheduleRepair(stage: ScheduleRepairTelemetryStage, input: ScheduleRepairTelemetryInput = {}) {
  await trackEvent("schedule_repair_lifecycle", buildScheduleRepairTelemetryParams(stage, input));
}
