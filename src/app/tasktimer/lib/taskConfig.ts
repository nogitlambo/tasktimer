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
  noTimeGoal?: boolean;
  [key: string]: unknown;
};

export function getAddTaskDurationMaxForPeriod(unit: DurationUnit, period: DurationPeriod): number {
  if (period === "day") {
    return unit === "minute" ? 24 * 60 : 24;
  }
  return unit === "minute" ? 7 * 24 * 60 : 7 * 24;
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
  noTimeGoal,
}: TaskConfigReadoutOptions): string {
  if (noTimeGoal) return "No time goal";

  const parsedValue = Math.max(0, Math.floor(Number(durationValue) || 0));
  if (!(parsedValue > 0)) return "Set a time goal";

  const unitLabel = parsedValue === 1 ? durationUnit : `${durationUnit}s`;
  const periodLabel = durationPeriod === "day" ? "day" : "week";
  return `${parsedValue} ${unitLabel} per ${periodLabel}`;
}
