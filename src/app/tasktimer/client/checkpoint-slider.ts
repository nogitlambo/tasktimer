import type { Task } from "../lib/types";

export type CheckpointSliderUnit = Extract<Task["milestoneTimeUnit"], "hour" | "minute">;

export function getCheckpointSliderMaxMinutes(timeGoalMinutes: number): number {
  const safeMinutes = Math.max(0, Math.floor(Number(timeGoalMinutes) || 0));
  return Math.max(1, safeMinutes - 1);
}

export function checkpointValueToSliderMinutes(value: number, unit: CheckpointSliderUnit): number {
  const safeValue = Math.max(0, Number(value) || 0);
  return unit === "minute" ? Math.round(safeValue) : Math.round(safeValue * 60);
}

export function sliderMinutesToCheckpointValue(sliderMinutes: number, unit: CheckpointSliderUnit): number {
  const safeMinutes = Math.max(0, Math.round(Number(sliderMinutes) || 0));
  return unit === "minute" ? safeMinutes : safeMinutes / 60;
}

export function clampCheckpointSliderMinutes(sliderMinutes: number, timeGoalMinutes: number): number {
  const safeMinutes = Math.max(0, Math.round(Number(sliderMinutes) || 0));
  const maxMinutes = getCheckpointSliderMaxMinutes(timeGoalMinutes);
  return Math.min(maxMinutes, Math.max(1, safeMinutes));
}

export function clampCheckpointValueToTimeGoal(
  value: number,
  unit: CheckpointSliderUnit,
  timeGoalMinutes: number
): { sliderMinutes: number; value: number } {
  const sliderMinutes = clampCheckpointSliderMinutes(checkpointValueToSliderMinutes(value, unit), timeGoalMinutes);
  return {
    sliderMinutes,
    value: sliderMinutesToCheckpointValue(sliderMinutes, unit),
  };
}

export function formatCheckpointSliderLabel(sliderMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(Number(sliderMinutes) || 0));
  if (safeMinutes <= 0) return "0m";
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function formatCheckpointSliderProgress(sliderMinutes: number, timeGoalMinutes: number): string {
  const safeGoal = Math.max(1, Math.floor(Number(timeGoalMinutes) || 0));
  const safeSliderMinutes = clampCheckpointSliderMinutes(sliderMinutes, safeGoal);
  return `${Math.max(0, Math.min(100, Math.round((safeSliderMinutes / safeGoal) * 100)))}% of goal`;
}
