import { z } from "zod";

export const dailyExecutiveBriefPlanHealthValues = [
  "REALISTIC",
  "SLIGHTLY_OVERLOADED",
  "SIGNIFICANTLY_OVERLOADED",
  "INSUFFICIENT_DATA",
] as const;

export const dailyExecutiveBriefDeadlineRiskValues = ["NONE", "WATCH", "CRITICAL"] as const;
export const dailyExecutiveBriefCapacitySourceValues = [
  "USER_SELECTED",
  "FOCUS_WINDOW",
  "SCHEDULE",
  "HISTORICAL_BASELINE",
  "PRODUCT_DEFAULT",
] as const;
export const dailyExecutiveBriefAdjustmentTypeValues = ["MOVE", "REDUCE", "SPLIT"] as const;

export const dailyExecutiveBriefReasonCodeValues = [
  "DUE_TODAY",
  "OVERDUE",
  "DUE_SOON",
  "INSUFFICIENT_REMAINING_TIME",
  "PRIORITY_BLOCKER",
  "CLUSTERED_DEADLINES",
  "UNKNOWN_DURATION",
  "NO_FOCUS_WINDOW",
  "SHORT_FOCUS_WINDOW",
  "OVER_CAPACITY",
  "FLEXIBLE_WORK_AVAILABLE",
  "TASK_NEEDS_CLARIFICATION",
] as const;

export const DailyExecutiveBriefPlanHealthSchema = z.enum(dailyExecutiveBriefPlanHealthValues);
export const DailyExecutiveBriefDeadlineRiskSchema = z.enum(dailyExecutiveBriefDeadlineRiskValues);
export const DailyExecutiveBriefCapacitySourceSchema = z.enum(dailyExecutiveBriefCapacitySourceValues);
export const DailyExecutiveBriefAdjustmentTypeSchema = z.enum(dailyExecutiveBriefAdjustmentTypeValues);
export const DailyExecutiveBriefAdjustmentStatusSchema = z.enum(["ACTIVE", "DISMISSED"] as const);
export const DailyExecutiveBriefReasonCodeSchema = z.enum(dailyExecutiveBriefReasonCodeValues);

export type DailyExecutiveBriefPlanHealth = z.infer<typeof DailyExecutiveBriefPlanHealthSchema>;
export type DailyExecutiveBriefDeadlineRisk = z.infer<typeof DailyExecutiveBriefDeadlineRiskSchema>;
export type DailyExecutiveBriefCapacitySource = z.infer<typeof DailyExecutiveBriefCapacitySourceSchema>;
export type DailyExecutiveBriefAdjustmentType = z.infer<typeof DailyExecutiveBriefAdjustmentTypeSchema>;
export type DailyExecutiveBriefAdjustmentStatus = z.infer<typeof DailyExecutiveBriefAdjustmentStatusSchema>;
export type DailyExecutiveBriefReasonCode = z.infer<typeof DailyExecutiveBriefReasonCodeSchema>;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutesSchema = z.number().int().min(1).max(1440);

export const DailyExecutiveBriefTaskSchema = z.object({
  id: z.string().trim().min(1).max(160),
  estimatedMinutes: minutesSchema.nullable().optional(),
  completedMinutes: z.number().int().min(0).max(1440).optional(),
  dueDate: dateSchema.nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  hardDeadline: z.boolean().optional(),
  flexible: z.boolean().optional(),
  pinned: z.boolean().optional(),
  inProgress: z.boolean().optional(),
  requiresClarification: z.boolean().optional(),
  blocksImportantWork: z.boolean().optional(),
  active: z.boolean().optional(),
  completed: z.boolean().optional(),
});

export type DailyExecutiveBriefTask = z.infer<typeof DailyExecutiveBriefTaskSchema>;

export const DailyExecutiveBriefAvailabilitySchema = z.object({
  userSelectedMinutes: minutesSchema.nullable().optional(),
  remainingFocusWindowMinutes: minutesSchema.nullable().optional(),
  scheduleAvailableMinutes: minutesSchema.nullable().optional(),
  historicalBaselineMinutes: minutesSchema.nullable().optional(),
  productDefaultMinutes: minutesSchema.default(60),
  focusWindowPresent: z.boolean().default(true),
});

export type DailyExecutiveBriefAvailability = z.input<typeof DailyExecutiveBriefAvailabilitySchema>;

export const DailyExecutiveBriefPlanningInputSchema = z.object({
  todayDate: dateSchema,
  tasks: z.array(DailyExecutiveBriefTaskSchema),
  availability: DailyExecutiveBriefAvailabilitySchema,
});

export type DailyExecutiveBriefPlanningInput = z.input<typeof DailyExecutiveBriefPlanningInputSchema>;

export type DailyExecutiveBriefAdjustment = {
  adjustmentId: string;
  taskId: string;
  type: DailyExecutiveBriefAdjustmentType;
  status: DailyExecutiveBriefAdjustmentStatus;
  reasonCodes: DailyExecutiveBriefReasonCode[];
  explanation: string;
  suggestedMinutes?: number;
};

export type DailyExecutiveBriefPlan = {
  version: string;
  todayDate: string;
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  realisticWorkloadRange: { minMinutes: number; maxMinutes: number };
  capacityMinutes: number;
  capacitySource: DailyExecutiveBriefCapacitySource;
  planHealth: DailyExecutiveBriefPlanHealth;
  deadlineRisk: DailyExecutiveBriefDeadlineRisk;
  reasonCodes: DailyExecutiveBriefReasonCode[];
  unknownDurationTaskCount: number;
  activeTaskCount: number;
  adjustments: DailyExecutiveBriefAdjustment[];
};

export type DailyExecutiveBriefPlanningConfig = {
  version: string;
  realisticWorkloadFactor: number;
  significantOverloadRatio: number;
  dueSoonDays: number;
  clusteredDeadlineCount: number;
  shortFocusWindowMinutes: number;
  splitThresholdMinutes: number;
  reduceThresholdMinutes: number;
  maxAdjustments: number;
};

export const DEFAULT_DAILY_EXECUTIVE_BRIEF_PLANNING_CONFIG: DailyExecutiveBriefPlanningConfig = {
  version: "daily-executive-brief-planning-v1",
  realisticWorkloadFactor: 0.75,
  significantOverloadRatio: 1.5,
  dueSoonDays: 2,
  clusteredDeadlineCount: 2,
  shortFocusWindowMinutes: 30,
  splitThresholdMinutes: 45,
  reduceThresholdMinutes: 20,
  maxAdjustments: 3,
};

function dayDistance(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function addReason(reasons: Set<DailyExecutiveBriefReasonCode>, reason: DailyExecutiveBriefReasonCode) {
  reasons.add(reason);
}

function selectCapacity(availability: z.output<typeof DailyExecutiveBriefAvailabilitySchema>) {
  const options: Array<[DailyExecutiveBriefCapacitySource, number | null | undefined]> = [
    ["USER_SELECTED", availability.userSelectedMinutes],
    ["FOCUS_WINDOW", availability.remainingFocusWindowMinutes],
    ["SCHEDULE", availability.scheduleAvailableMinutes],
    ["HISTORICAL_BASELINE", availability.historicalBaselineMinutes],
    ["PRODUCT_DEFAULT", availability.productDefaultMinutes],
  ];
  const selected = options.find(([, minutes]) => Number.isInteger(minutes) && Number(minutes) > 0);
  return selected || ["PRODUCT_DEFAULT", 60];
}

function adjustmentForTask(
  task: DailyExecutiveBriefTask,
  todayDate: string,
  config: DailyExecutiveBriefPlanningConfig,
) {
  if (task.hardDeadline || task.pinned || task.inProgress || task.completed || task.active === false) return null;
  if (task.priority === "high" || task.priority === "urgent") return null;
  if (task.estimatedMinutes == null || !task.flexible) return null;

  const taskReasons: DailyExecutiveBriefReasonCode[] = [];
  const dueDistance = task.dueDate ? dayDistance(todayDate, task.dueDate) : null;
  if (task.dueDate && dueDistance == null) return null;
  if (task.flexible) taskReasons.push("FLEXIBLE_WORK_AVAILABLE");
  if (task.requiresClarification) taskReasons.push("TASK_NEEDS_CLARIFICATION");

  if (task.estimatedMinutes >= config.splitThresholdMinutes) {
    return {
      adjustmentId: encodeURIComponent(`SPLIT:${task.id}`),
      taskId: task.id,
      type: "SPLIT" as const,
      status: "ACTIVE" as const,
      reasonCodes: taskReasons,
      explanation: "Split this flexible task into smaller steps before changing its schedule.",
    };
  }
  if (task.dueDate == null || (dueDistance ?? 0) > 0) {
    return {
      adjustmentId: encodeURIComponent(`MOVE:${task.id}`),
      taskId: task.id,
      type: "MOVE" as const,
      status: "ACTIVE" as const,
      reasonCodes: taskReasons,
      explanation: "Move this flexible task to a later available day if today remains overloaded.",
    };
  }
  if (task.estimatedMinutes >= config.reduceThresholdMinutes) {
    return {
      adjustmentId: encodeURIComponent(`REDUCE:${task.id}`),
      taskId: task.id,
      type: "REDUCE" as const,
      status: "ACTIVE" as const,
      reasonCodes: taskReasons,
      explanation: "Reduce today’s target for this flexible task and review the remainder later.",
      suggestedMinutes: Math.max(5, Math.floor(task.estimatedMinutes / 2)),
    };
  }
  return null;
}

export function calculateDailyExecutiveBriefPlan(
  input: DailyExecutiveBriefPlanningInput,
  suppliedConfig: Partial<DailyExecutiveBriefPlanningConfig> = {},
): DailyExecutiveBriefPlan {
  const config = { ...DEFAULT_DAILY_EXECUTIVE_BRIEF_PLANNING_CONFIG, ...suppliedConfig };
  const parsed = DailyExecutiveBriefPlanningInputSchema.parse(input);
  const availability = DailyExecutiveBriefAvailabilitySchema.parse(parsed.availability);
  const activeTasks = parsed.tasks.filter((task) => task.active !== false && !task.completed);
  const reasons = new Set<DailyExecutiveBriefReasonCode>();
  const knownTasks = activeTasks.filter((task) => task.estimatedMinutes != null);
  const unknownDurationTaskCount = activeTasks.length - knownTasks.length;
  const plannedMinutes = knownTasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  const completedMinutes = activeTasks.reduce((sum, task) => sum + Math.min(task.completedMinutes || 0, task.estimatedMinutes || task.completedMinutes || 0), 0);
  const remainingMinutes = Math.max(0, plannedMinutes - completedMinutes);
  const [capacitySource, selectedCapacity] = selectCapacity(availability);
  const capacityMinutes = Number(selectedCapacity);
  const realisticMax = capacityMinutes;
  const realisticMin = Math.max(1, Math.min(realisticMax, Math.round(realisticMax * config.realisticWorkloadFactor)));

  if (unknownDurationTaskCount > 0) addReason(reasons, "UNKNOWN_DURATION");
  if (!availability.focusWindowPresent) addReason(reasons, "NO_FOCUS_WINDOW");
  if (availability.remainingFocusWindowMinutes != null && availability.remainingFocusWindowMinutes < config.shortFocusWindowMinutes) {
    addReason(reasons, "SHORT_FOCUS_WINDOW");
  }

  const datedTasks = activeTasks
    .map((task) => ({ task, distance: task.dueDate ? dayDistance(parsed.todayDate, task.dueDate) : null }))
    .filter((item): item is { task: DailyExecutiveBriefTask; distance: number } => item.distance != null);
  const dueToday = datedTasks.filter(({ distance }) => distance === 0);
  const overdue = datedTasks.filter(({ distance }) => distance < 0);
  const dueSoon = datedTasks.filter(({ distance }) => distance >= 0 && distance <= config.dueSoonDays);
  if (dueToday.length) addReason(reasons, "DUE_TODAY");
  if (overdue.length) addReason(reasons, "OVERDUE");
  if (dueSoon.length && !dueToday.length) addReason(reasons, "DUE_SOON");
  if (dueSoon.length >= config.clusteredDeadlineCount) addReason(reasons, "CLUSTERED_DEADLINES");
  if (activeTasks.some((task) => task.priority === "high" || task.priority === "urgent" || task.blocksImportantWork)) addReason(reasons, "PRIORITY_BLOCKER");

  const deadlineRisk: DailyExecutiveBriefDeadlineRisk = overdue.length || dueToday.some((item) => item.task.hardDeadline || item.task.priority === "high" || item.task.priority === "urgent")
    ? "CRITICAL"
    : dueSoon.length
      ? "WATCH"
      : "NONE";
  if (remainingMinutes > capacityMinutes) addReason(reasons, "INSUFFICIENT_REMAINING_TIME");
  if (remainingMinutes > capacityMinutes) addReason(reasons, "OVER_CAPACITY");

  const planHealth: DailyExecutiveBriefPlanHealth = activeTasks.length === 0 || (unknownDurationTaskCount === activeTasks.length && plannedMinutes === 0)
    ? "INSUFFICIENT_DATA"
    : remainingMinutes > capacityMinutes * config.significantOverloadRatio
      ? "SIGNIFICANTLY_OVERLOADED"
      : remainingMinutes > capacityMinutes
        ? "SLIGHTLY_OVERLOADED"
        : "REALISTIC";

  const adjustmentCandidates = planHealth === "REALISTIC"
    ? []
    : parsed.tasks
        .map((task) => adjustmentForTask(task, parsed.todayDate, config))
        .filter((adjustment): adjustment is NonNullable<typeof adjustment> => adjustment != null)
        .slice(0, config.maxAdjustments);

  if (adjustmentCandidates.length) addReason(reasons, "FLEXIBLE_WORK_AVAILABLE");
  const orderedReasons = dailyExecutiveBriefReasonCodeValues.filter((reason) => reasons.has(reason));
  return {
    version: config.version,
    todayDate: parsed.todayDate,
    plannedMinutes,
    completedMinutes,
    remainingMinutes,
    realisticWorkloadRange: { minMinutes: realisticMin, maxMinutes: realisticMax },
    capacityMinutes,
    capacitySource,
    planHealth,
    deadlineRisk,
    reasonCodes: orderedReasons,
    unknownDurationTaskCount,
    activeTaskCount: activeTasks.length,
    adjustments: adjustmentCandidates.map((adjustment) => ({ ...adjustment, reasonCodes: [...adjustment.reasonCodes] })),
  };
}
