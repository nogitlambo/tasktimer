import {
  SCHEDULE_REPAIR_DEFAULT_CAPACITY_RANGE,
  SCHEDULE_REPAIR_PLAN_VERSION,
  SCHEDULE_REPAIR_REASON_CODE_VALUES,
  SCHEDULE_REPAIR_SCHEMA_VERSION,
  SCHEDULE_REPAIR_TRIGGER_VALUES,
  ScheduleRepairCapacitySchema,
  ScheduleRepairEvaluationResultSchema,
  ScheduleRepairRangeSchema,
  type ScheduleRepairCapacity,
  type ScheduleRepairEvaluationResult,
  type ScheduleRepairRange,
  type ScheduleRepairTrigger,
} from "./scheduleRepairContract";

type ScheduleRepairPlanHealth = "REALISTIC" | "SLIGHTLY_OVERLOADED" | "SIGNIFICANTLY_OVERLOADED" | "INSUFFICIENT_DATA";

export type ScheduleRepairCapacityInput = Partial<ScheduleRepairCapacity> & {
  remainingRange?: ScheduleRepairRange | null;
};

export type ScheduleRepairTriggerHints = {
  taskOverranEstimate?: boolean;
  focusWindowMissed?: boolean;
  newUrgentTask?: boolean;
  multipleTasksSkipped?: boolean;
  deadlineAtRisk?: boolean;
  manualRefresh?: boolean;
};

export type ScheduleRepairEvaluationInput = {
  localDate: string;
  activeTaskCount: number;
  knownDurationTaskCount: number;
  remainingPlannedMinutes: number;
  adaptiveCapacity?: ScheduleRepairCapacityInput | null;
  dailyBriefFallbackRange?: ScheduleRepairRange | null;
  currentAvailableMinutes?: number | null;
  previousAvailableMinutes?: number | null;
  previousCapacityMax?: number | null;
  triggerHints?: ScheduleRepairTriggerHints;
  significantOverloadRatio?: number;
};

const triggerOrder = new Map(SCHEDULE_REPAIR_TRIGGER_VALUES.map((trigger, index) => [trigger, index]));
const reasonOrder = new Map(SCHEDULE_REPAIR_REASON_CODE_VALUES.map((reason, index) => [reason, index]));

function safeMinutes(value: unknown, fallback = 0) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : fallback;
}

function validRange(value: unknown): ScheduleRepairRange | null {
  const parsed = ScheduleRepairRangeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sortUnique<T extends string>(values: T[], order: Map<T, number>) {
  return Array.from(new Set(values)).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

export function resolveScheduleRepairCapacity(input: {
  adaptiveCapacity?: ScheduleRepairCapacityInput | null;
  dailyBriefFallbackRange?: ScheduleRepairRange | null;
}): ScheduleRepairCapacity {
  const adaptiveRange = validRange(input.adaptiveCapacity?.remainingRange);
  if (adaptiveRange) {
    return ScheduleRepairCapacitySchema.parse({
      remainingRange: adaptiveRange,
      state: input.adaptiveCapacity?.state || "INSUFFICIENT_DATA",
      confidence: input.adaptiveCapacity?.confidence || "LOW",
      primarySource: input.adaptiveCapacity?.primarySource || "DEFAULT",
      manualOverride: input.adaptiveCapacity?.manualOverride ?? null,
      source: "ADAPTIVE_CAPACITY",
    });
  }
  const fallbackRange = validRange(input.dailyBriefFallbackRange) || SCHEDULE_REPAIR_DEFAULT_CAPACITY_RANGE;
  return ScheduleRepairCapacitySchema.parse({
    remainingRange: fallbackRange,
    state: "INSUFFICIENT_DATA",
    confidence: "LOW",
    primarySource: "DEFAULT",
    manualOverride: null,
    source: input.dailyBriefFallbackRange ? "DAILY_EXECUTIVE_BRIEF_FALLBACK" : "PRODUCT_DEFAULT",
  });
}

export function deriveScheduleRepairPlanHealth(input: {
  activeTaskCount: number;
  knownDurationTaskCount: number;
  remainingPlannedMinutes: number;
  capacityMax: number;
  significantOverloadRatio?: number;
}): ScheduleRepairPlanHealth {
  if (safeMinutes(input.activeTaskCount) === 0 || safeMinutes(input.knownDurationTaskCount) === 0) return "INSUFFICIENT_DATA";
  const remaining = safeMinutes(input.remainingPlannedMinutes);
  const capacity = Math.max(1, safeMinutes(input.capacityMax, 60));
  const ratio = Number.isFinite(Number(input.significantOverloadRatio)) && Number(input.significantOverloadRatio) > 1
    ? Number(input.significantOverloadRatio)
    : 1.5;
  if (remaining > capacity * ratio) return "SIGNIFICANTLY_OVERLOADED";
  if (remaining > capacity) return "SLIGHTLY_OVERLOADED";
  return "REALISTIC";
}

function triggerCodesFor(input: ScheduleRepairEvaluationInput, planHealth: ScheduleRepairPlanHealth, capacity: ScheduleRepairCapacity) {
  const hints = input.triggerHints || {};
  const triggers: ScheduleRepairTrigger[] = [];
  if (planHealth === "SLIGHTLY_OVERLOADED") triggers.push("PLAN_OVERLOADED");
  if (planHealth === "SIGNIFICANTLY_OVERLOADED") triggers.push("PLAN_OVERLOADED", "PLAN_SIGNIFICANTLY_OVERLOADED");
  const currentAvailable = input.currentAvailableMinutes == null ? null : safeMinutes(input.currentAvailableMinutes);
  const previousAvailable = input.previousAvailableMinutes == null ? null : safeMinutes(input.previousAvailableMinutes);
  if (currentAvailable != null && previousAvailable != null && currentAvailable < previousAvailable) triggers.push("AVAILABLE_TIME_REDUCED");
  if (capacity.state === "REDUCED" || capacity.state === "LIGHT" || (input.previousCapacityMax != null && capacity.remainingRange.max < safeMinutes(input.previousCapacityMax))) {
    triggers.push("CAPACITY_REDUCED");
  }
  if (hints.taskOverranEstimate) triggers.push("TASK_OVERRAN_ESTIMATE");
  if (hints.focusWindowMissed) triggers.push("FOCUS_WINDOW_MISSED");
  if (hints.newUrgentTask) triggers.push("NEW_URGENT_TASK");
  if (hints.multipleTasksSkipped) triggers.push("MULTIPLE_TASKS_SKIPPED");
  if (hints.deadlineAtRisk) triggers.push("DEADLINE_AT_RISK");
  if (hints.manualRefresh) triggers.push("MANUAL_REFRESH");
  return sortUnique(triggers, triggerOrder);
}

function reasonCodesFor(planHealth: ScheduleRepairPlanHealth, input: ScheduleRepairEvaluationInput, capacity: ScheduleRepairCapacity) {
  const reasons: Array<(typeof SCHEDULE_REPAIR_REASON_CODE_VALUES)[number]> = [];
  if (planHealth === "SLIGHTLY_OVERLOADED") reasons.push("TODAY_OVERLOADED");
  if (planHealth === "SIGNIFICANTLY_OVERLOADED") reasons.push("TODAY_SIGNIFICANTLY_OVERLOADED");
  if (capacity.state === "REDUCED" || capacity.state === "LIGHT") reasons.push("CAPACITY_REDUCED");
  const currentAvailable = input.currentAvailableMinutes == null ? null : safeMinutes(input.currentAvailableMinutes);
  const previousAvailable = input.previousAvailableMinutes == null ? null : safeMinutes(input.previousAvailableMinutes);
  if (currentAvailable != null && previousAvailable != null && currentAvailable < previousAvailable) reasons.push("AVAILABLE_TIME_REDUCED");
  if (capacity.remainingRange.max <= 30) reasons.push("LIMITED_REMAINING_CAPACITY");
  return sortUnique(reasons, reasonOrder);
}

export function evaluateScheduleRepair(input: ScheduleRepairEvaluationInput): ScheduleRepairEvaluationResult {
  const capacity = resolveScheduleRepairCapacity(input);
  const planHealthBefore = deriveScheduleRepairPlanHealth({
    activeTaskCount: input.activeTaskCount,
    knownDurationTaskCount: input.knownDurationTaskCount,
    remainingPlannedMinutes: input.remainingPlannedMinutes,
    capacityMax: capacity.remainingRange.max,
    significantOverloadRatio: input.significantOverloadRatio,
  });
  const triggerCodes = triggerCodesFor(input, planHealthBefore, capacity);
  const reasonCodes = reasonCodesFor(planHealthBefore, input, capacity);
  const outcome = planHealthBefore === "INSUFFICIENT_DATA"
    ? "INSUFFICIENT_DATA"
    : planHealthBefore === "REALISTIC"
      ? "NO_REPAIR_NEEDED"
      : "REPAIR_REQUIRED";
  return ScheduleRepairEvaluationResultSchema.parse({
    schemaVersion: SCHEDULE_REPAIR_SCHEMA_VERSION,
    planVersion: SCHEDULE_REPAIR_PLAN_VERSION,
    localDate: input.localDate,
    outcome,
    planHealthBefore,
    remainingPlannedMinutesBefore: safeMinutes(input.remainingPlannedMinutes),
    remainingCapacity: capacity,
    triggerCodes,
    reasonCodes,
  });
}

export function createNoSafeScheduleRepairResult(result: ScheduleRepairEvaluationResult): ScheduleRepairEvaluationResult {
  return ScheduleRepairEvaluationResultSchema.parse({
    ...result,
    outcome: "NO_SAFE_SOLUTION",
    reasonCodes: sortUnique([...result.reasonCodes, "NO_SAFE_MOVE_AVAILABLE"], reasonOrder),
  });
}
