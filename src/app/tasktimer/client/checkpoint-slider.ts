import type { Task } from "../lib/types";

export type CheckpointSliderUnit = Extract<Task["milestoneTimeUnit"], "hour" | "minute">;

export function getCheckpointSliderMaxSeconds(timeGoalMinutes: number): number {
  const safeGoalSeconds = Math.max(0, Math.floor((Number(timeGoalMinutes) || 0) * 60));
  return Math.max(1, safeGoalSeconds - 1);
}

export function checkpointValueToSliderSeconds(value: number, unit: CheckpointSliderUnit): number {
  const safeValue = Math.max(0, Number(value) || 0);
  return unit === "minute" ? Math.round(safeValue * 60) : Math.round(safeValue * 3600);
}

export function sliderSecondsToCheckpointValue(sliderSeconds: number, unit: CheckpointSliderUnit): number {
  const safeSeconds = Math.max(0, Math.round(Number(sliderSeconds) || 0));
  return unit === "minute" ? safeSeconds / 60 : safeSeconds / 3600;
}

export function clampCheckpointSliderSeconds(sliderSeconds: number, timeGoalMinutes: number): number {
  const safeSeconds = Math.max(0, Math.round(Number(sliderSeconds) || 0));
  const maxSeconds = getCheckpointSliderMaxSeconds(timeGoalMinutes);
  return Math.min(maxSeconds, Math.max(1, safeSeconds));
}

export function clampCheckpointValueToTimeGoal(
  value: number,
  unit: CheckpointSliderUnit,
  timeGoalMinutes: number
): { sliderSeconds: number; value: number } {
  const sliderSeconds = clampCheckpointSliderSeconds(checkpointValueToSliderSeconds(value, unit), timeGoalMinutes);
  return {
    sliderSeconds,
    value: sliderSecondsToCheckpointValue(sliderSeconds, unit),
  };
}

export function formatCheckpointSliderLabel(sliderSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(Number(sliderSeconds) || 0));
  if (safeSeconds <= 0) return "0s";
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatCheckpointSliderProgress(sliderSeconds: number, timeGoalMinutes: number): string {
  const safeGoalSeconds = Math.max(1, Math.floor((Number(timeGoalMinutes) || 0) * 60));
  const safeSliderSeconds = clampCheckpointSliderSeconds(sliderSeconds, timeGoalMinutes);
  return `${Math.max(0, Math.min(100, Math.round((safeSliderSeconds / safeGoalSeconds) * 100)))}% of goal`;
}
