import { sortMilestones } from "@/app/tasktimer/lib/milestones";
import { formatDateTime, formatTime } from "@/app/tasktimer/lib/time";
import type { HistoryEntry } from "@/app/tasktimer/lib/types";
import type { MainMode, TaskTimerState, TaskTimerTask } from "./types";

export type ProgressMarkerViewModel = {
  id: string;
  leftPct: number;
  label: string;
  description: string;
  reached: boolean;
};

export function taskModeOf(task: TaskTimerTask): MainMode {
  return task.mode;
}

export function getModeLabel(state: TaskTimerState, mode: MainMode): string {
  return state.modeSettings[mode]?.label || mode;
}

export function isModeEnabled(state: TaskTimerState, mode: MainMode): boolean {
  if (mode === "mode1") return true;
  return !!state.modeSettings[mode]?.enabled;
}

export function getModeColor(state: TaskTimerState, mode: MainMode): string {
  return state.modeSettings[mode]?.color || "#00CFC8";
}

export function getElapsedMs(task: TaskTimerTask, nowMs: number): number {
  if (task.running && task.startMs) return Math.max(0, task.accumulatedMs + (nowMs - task.startMs));
  return Math.max(0, task.accumulatedMs || 0);
}

export function selectVisibleTasks(state: TaskTimerState): TaskTimerTask[] {
  return state.tasks
    .filter((task) => task.mode === state.currentMode)
    .filter((task) => isModeEnabled(state, task.mode))
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

export function createHistoryEntryKey(entry: HistoryEntry): string {
  return `${Number(entry.ts || 0)}|${Number(entry.ms || 0)}|${String(entry.name || "")}`;
}

export function getHistoryEntriesForTask(state: TaskTimerState, taskId: string): HistoryEntry[] {
  return (Array.isArray(state.historyByTaskId[taskId]) ? state.historyByTaskId[taskId] : [])
    .slice()
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

export function getSelectedHistoryEntries(state: TaskTimerState, taskId: string): HistoryEntry[] {
  const selectedKeys = new Set(state.historySelectionByTaskId[taskId] || []);
  return getHistoryEntriesForTask(state, taskId).filter((entry) => selectedKeys.has(createHistoryEntryKey(entry)));
}

export function milestoneUnitSuffix(task: TaskTimerTask): string {
  if (task.milestoneTimeUnit === "day") return "d";
  if (task.milestoneTimeUnit === "minute") return "m";
  return "h";
}

export function milestoneUnitSeconds(task: TaskTimerTask): number {
  if (task.milestoneTimeUnit === "day") return 86400;
  if (task.milestoneTimeUnit === "minute") return 60;
  return 3600;
}

export function getProgressViewModel(task: TaskTimerTask, nowMs: number) {
  if (!task.milestonesEnabled || !task.milestones.length) {
    return { percent: 0, markers: [] as ProgressMarkerViewModel[] };
  }

  const sorted = sortMilestones(task.milestones.slice());
  const maxValue = Math.max(...sorted.map((row) => Number(row.hours || 0)), 0);
  if (maxValue <= 0) return { percent: 0, markers: [] as ProgressMarkerViewModel[] };

  const elapsedSeconds = getElapsedMs(task, nowMs) / 1000;
  const secondsPerUnit = milestoneUnitSeconds(task);
  const milestoneMaxSeconds = maxValue * secondsPerUnit;
  const timeGoalSeconds =
    task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Number(task.timeGoalMinutes || 0) * 60 : 0;
  const maxSeconds = Math.max(milestoneMaxSeconds, timeGoalSeconds, 1);
  const percent = Math.max(0, Math.min(100, (elapsedSeconds / maxSeconds) * 100));
  const suffix = milestoneUnitSuffix(task);
  const markers = sorted.map((row, index) => {
    const hours = Number(row.hours || 0);
    const markerSeconds = hours * secondsPerUnit;
    const markerId = String(row.id || `${task.id}-${index}`);
    return {
      id: markerId,
      leftPct: Math.max(0, Math.min(100, (markerSeconds / maxSeconds) * 100)),
      label: `${hours}${suffix}`,
      description: String(row.description || "").trim(),
      reached: elapsedSeconds >= markerSeconds,
    };
  });
  return { percent, markers };
}

export function formatElapsedParts(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

export function formatHistoryElapsed(ms: number): string {
  return formatTime(ms);
}

export function formatHistoryTimestamp(ts: number): string {
  return formatDateTime(ts);
}

export function fillBackgroundForPct(pct: number): string {
  if (pct >= 100) return "linear-gradient(90deg, #00cfc8, #7bffde)";
  if (pct >= 75) return "linear-gradient(90deg, #3A86FF, #67b3ff)";
  if (pct >= 40) return "linear-gradient(90deg, #d447d2, #f06ee0)";
  return "linear-gradient(90deg, #00CFC8, #36e8ff)";
}
