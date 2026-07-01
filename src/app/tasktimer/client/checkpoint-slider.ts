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

export function parseCheckpointDurationInput(input: string): number | null {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return null;

  const bareMinutes = Number(text);
  if (/^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(bareMinutes)) {
    return Math.round(bareMinutes * 60);
  }

  let totalSeconds = 0;
  let consumed = "";
  const tokenPattern = /(\d+(?:\.\d+)?)\s*([hms])/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    consumed += match[0];
    if (match[2] === "h") totalSeconds += value * 3600;
    if (match[2] === "m") totalSeconds += value * 60;
    if (match[2] === "s") totalSeconds += value;
  }

  if (!consumed || consumed.replace(/\s+/g, "") !== text.replace(/\s+/g, "")) return null;
  return Math.round(totalSeconds);
}

export function getNextCheckpointSliderSeconds(
  milestones: ReadonlyArray<Pick<NonNullable<Task["milestones"]>[number], "hours">> | null | undefined,
  unit: CheckpointSliderUnit,
  timeGoalMinutes: number
): number | null {
  const safeGoalSeconds = Math.max(1, Math.floor((Number(timeGoalMinutes) || 0) * 60));
  const maxSeconds = getCheckpointSliderMaxSeconds(timeGoalMinutes);
  const existingMilestones = Array.isArray(milestones) ? milestones : [];

  if (existingMilestones.length === 0) {
    return clampCheckpointSliderSeconds(Math.round(safeGoalSeconds / 2), timeGoalMinutes);
  }

  const previousMilestone = existingMilestones[existingMilestones.length - 1];
  const previousSeconds = clampCheckpointValueToTimeGoal(Number(previousMilestone?.hours) || 0, unit, timeGoalMinutes).sliderSeconds;
  if (previousSeconds >= maxSeconds) return null;

  return clampCheckpointSliderSeconds(Math.round((previousSeconds + safeGoalSeconds) / 2), timeGoalMinutes);
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
