import type { Task } from "./types";

type DurationUnit = "minute" | "hour";
type DurationPeriod = "day" | "week";

type TaskConfigMilestoneDraft = {
  id: string;
  createdSeq: number;
  value: string;
  description: string;
};

type TaskConfigReadoutOptions = {
  durationValue: string;
  durationUnit: DurationUnit;
  durationPeriod: DurationPeriod;
  taskType?: "recurring" | "once-off";
  noTimeGoal?: boolean;
  [key: string]: unknown;
};

type AggregateTimeGoalTotals = {
  totalDailyGoalMinutes: number;
  totalWeeklyEquivalentMinutes: number;
};

type AggregateTimeGoalValidationResult = AggregateTimeGoalTotals & {
  isWithinLimit: boolean;
  failedLimit: "day" | "week" | null;
  dailyOverflowMinutes: number;
  weeklyOverflowMinutes: number;
};

export function getAddTaskDurationMaxForPeriod(unit: DurationUnit, period: DurationPeriod): number {
  if (period === "day") {
    return unit === "minute" ? 24 * 60 : 24;
  }
  return unit === "minute" ? 7 * 24 * 60 : 7 * 24;
}

function getAggregateTimeGoalTotals(tasks: Task[]): AggregateTimeGoalTotals {
  return (Array.isArray(tasks) ? tasks : []).reduce<AggregateTimeGoalTotals>(
    (totals, task) => {
      if (task?.taskType === "once-off") return totals;
      if (!task?.timeGoalEnabled) return totals;

      const timeGoalMinutes = Math.max(0, Number(task.timeGoalMinutes) || 0);
      if (!(timeGoalMinutes > 0)) return totals;

      if (task.timeGoalPeriod === "day") {
        totals.totalDailyGoalMinutes += timeGoalMinutes;
      }
      totals.totalWeeklyEquivalentMinutes += task.timeGoalPeriod === "day" ? timeGoalMinutes * 7 : timeGoalMinutes;
      return totals;
    },
    { totalDailyGoalMinutes: 0, totalWeeklyEquivalentMinutes: 0 }
  );
}

export function validateAggregateTimeGoalTotals(tasks: Task[]): AggregateTimeGoalValidationResult {
  const totals = getAggregateTimeGoalTotals(tasks);
  const dailyOverflowMinutes = Math.max(0, totals.totalDailyGoalMinutes - 24 * 60);
  const weeklyOverflowMinutes = Math.max(0, totals.totalWeeklyEquivalentMinutes - 7 * 24 * 60);
  const failedLimit = dailyOverflowMinutes > 0 ? "day" : weeklyOverflowMinutes > 0 ? "week" : null;

  return {
    ...totals,
    isWithinLimit: !failedLimit,
    failedLimit,
    dailyOverflowMinutes,
    weeklyOverflowMinutes,
  };
}

export function isAggregateTimeGoalValidationWorsened(
  currentResult: AggregateTimeGoalValidationResult,
  nextResult: AggregateTimeGoalValidationResult
): boolean {
  if (nextResult.isWithinLimit) return false;
  if (currentResult.isWithinLimit) return true;

  return (
    nextResult.totalDailyGoalMinutes > currentResult.totalDailyGoalMinutes ||
    nextResult.totalWeeklyEquivalentMinutes > currentResult.totalWeeklyEquivalentMinutes ||
    nextResult.dailyOverflowMinutes > currentResult.dailyOverflowMinutes ||
    nextResult.weeklyOverflowMinutes > currentResult.weeklyOverflowMinutes ||
    (currentResult.failedLimit !== nextResult.failedLimit &&
      ((nextResult.failedLimit === "day" && nextResult.dailyOverflowMinutes > currentResult.dailyOverflowMinutes) ||
        (nextResult.failedLimit === "week" && nextResult.weeklyOverflowMinutes > currentResult.weeklyOverflowMinutes)))
  );
}

export function getAggregateTimeGoalValidationForReplacement(
  tasks: Task[],
  replacementTask: Task,
  replacementTaskId?: string | null
): AggregateTimeGoalValidationResult {
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const targetId = String(replacementTaskId || replacementTask?.id || "");
  const hasReplacement = normalizedTasks.some((task) => String(task?.id || "") === targetId);
  const nextTasks = hasReplacement
    ? normalizedTasks.map((task) => (String(task?.id || "") === targetId ? replacementTask : task))
    : [...normalizedTasks, replacementTask];
  return validateAggregateTimeGoalTotals(nextTasks);
}

function formatAggregateTimeGoalMinutes(minutes: number, period: DurationPeriod): string {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) return `${hours}h/${period}`;
  if (hours === 0) return `${remainingMinutes}m/${period}`;
  return `${hours}h ${remainingMinutes}m/${period}`;
}

export function formatAggregateTimeGoalValidationMessage(result: AggregateTimeGoalValidationResult): string {
  if (result.failedLimit === "day") {
    return `Allocated time goals exceed the 24-hour daily limit (${formatAggregateTimeGoalMinutes(result.totalDailyGoalMinutes, "day")} allocated).`;
  }
  if (result.failedLimit === "week") {
    return `Allocated time goals exceed the 168-hour weekly limit (${formatAggregateTimeGoalMinutes(result.totalWeeklyEquivalentMinutes, "week")} allocated).`;
  }
  return "";
}

export function normalizeTaskConfigMilestones(milestones: TaskConfigMilestoneDraft[]): TaskConfigMilestoneDraft[] {
  if (!Array.isArray(milestones) || milestones.length === 0) return [];

  return milestones
    .map((milestone, index) => ({
      id: String(milestone?.id || "").trim(),
      createdSeq:
        Number.isFinite(Number(milestone?.createdSeq)) && Number(milestone.createdSeq) > 0
          ? Math.floor(Number(milestone.createdSeq))
          : index + 1,
      value: String(milestone?.value || "").trim(),
      description: String(milestone?.description || "").trim(),
    }))
    .sort((a, b) => a.createdSeq - b.createdSeq);
}

export function formatAddTaskDurationReadout({
  durationValue,
  durationUnit,
  durationPeriod,
  taskType,
  noTimeGoal,
}: TaskConfigReadoutOptions): string {
  if (noTimeGoal) return "No time goal";

  const parsedValue = Math.max(0, Math.floor(Number(durationValue) || 0));
  if (!(parsedValue > 0)) return "Set a time goal";

  const unitLabel = parsedValue === 1 ? durationUnit : `${durationUnit}s`;
  if (taskType === "once-off") return `${parsedValue} ${unitLabel} once`;
  const periodLabel = durationPeriod === "day" ? "day" : "week";
  return `${parsedValue} ${unitLabel} per ${periodLabel}`;
}
