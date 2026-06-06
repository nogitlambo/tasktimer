import { formatScheduleSlotTime, parseScheduleTimeMinutes, type ScheduleDay } from "./schedule-placement";
import type { Task } from "./types";
import { normalizeOptimalProductivityDays } from "./productivityPeriod";

type DurationUnit = "minute" | "hour";
type DurationPeriod = "day" | "week";

type TaskConfigMilestoneDraft = {
  id: string;
  createdSeq: number;
  value: string;
  description: string;
  alertsEnabled?: boolean;
};

type TaskConfigReadoutOptions = {
  durationValue: string;
  durationUnit: DurationUnit;
  durationPeriod: DurationPeriod;
  taskType?: "recurring" | "once-off";
  noTimeGoal?: boolean;
  [key: string]: unknown;
};

type TaskScheduleSummaryOptions = {
  taskType: "recurring" | "once-off";
  durationValue: string | number;
  durationUnit: DurationUnit;
  durationPeriod: DurationPeriod;
  plannedStartTime: string;
  productivityDays: readonly unknown[];
  onceOffDay?: ScheduleDay | string | null;
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
      alertsEnabled: milestone?.alertsEnabled !== false,
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
  if (noTimeGoal) return "";

  const parsedValue = Math.max(0, Math.floor(Number(durationValue) || 0));
  if (!(parsedValue > 0)) return "";

  const unitLabel = parsedValue === 1 ? durationUnit : `${durationUnit}s`;
  if (taskType === "once-off") return `${parsedValue} ${unitLabel} once`;
  const periodLabel = durationPeriod === "day" ? "day" : "week";
  return `${parsedValue} ${unitLabel} per ${periodLabel}`;
}

function formatScheduleSummaryDuration(minutes: number): string {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (totalMinutes > 0 && totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
}

function formatScheduleSummaryDurationRange(minMinutes: number, maxMinutes: number): string {
  const min = Math.max(0, Math.round(Number(minMinutes) || 0));
  const max = Math.max(0, Math.round(Number(maxMinutes) || 0));
  if (min === max) {
    if (min > 0 && min % 60 === 0) return `${min / 60} hour`;
    return `${min} minute`;
  }
  const bothWholeHours = min > 0 && max > 0 && min % 60 === 0 && max % 60 === 0;
  if (bothWholeHours) {
    return `${min / 60}-${max / 60} hour`;
  }
  return `${min}-${max} minute`;
}

function getTaskScheduleSummaryGoalMinutes(value: string | number, unit: DurationUnit): number {
  const parsedValue = Math.max(0, Math.floor(Number(value) || 0));
  if (!(parsedValue > 0)) return 0;
  return unit === "minute" ? parsedValue : parsedValue * 60;
}

function formatScheduleSummaryDay(day: string | null | undefined): string {
  const labels: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return labels[String(day || "").trim().toLowerCase()] || "Monday";
}

export function formatTaskScheduleSummary({
  taskType,
  durationValue,
  durationUnit,
  durationPeriod,
  plannedStartTime,
  productivityDays,
  onceOffDay,
}: TaskScheduleSummaryOptions): string {
  const goalMinutes = getTaskScheduleSummaryGoalMinutes(durationValue, durationUnit);
  const startMinutes = parseScheduleTimeMinutes(plannedStartTime);
  if (!(goalMinutes > 0) || startMinutes == null) return "";

  const startText = formatScheduleSlotTime(startMinutes);
  if (taskType === "once-off") {
    return `Task will be added as a ${formatScheduleSummaryDuration(goalMinutes)} scheduled block at ${startText} on ${formatScheduleSummaryDay(
      onceOffDay
    )}.`;
  }

  const days = normalizeOptimalProductivityDays(productivityDays);
  const dayCount = days.length;
  const dayLabel = dayCount === 1 ? "productivity day" : "productivity days";
  if (durationPeriod === "week") {
    const baseMinutes = Math.floor(goalMinutes / dayCount);
    const remainder = goalMinutes % dayCount;
    const minMinutes = baseMinutes;
    const maxMinutes = baseMinutes + (remainder > 0 ? 1 : 0);
    return `Task will be split into ${formatScheduleSummaryDurationRange(
      minMinutes,
      maxMinutes
    )} daily scheduled blocks at ${startText} on your ${dayCount} ${dayLabel}.`;
  }

  return `Task will be added as ${formatScheduleSummaryDuration(
    goalMinutes
  )} daily scheduled blocks at ${startText} on your ${dayCount} ${dayLabel}.`;
}
