import type { CompletionDifficulty } from "./completionDifficulty";

export type Milestone = {
  hours: number;
  description: string;
  id?: string;
  createdSeq?: number;
  alertsEnabled?: boolean;
};

export type TaskPlannedStartDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type TaskPlannedStartByDay = Partial<Record<TaskPlannedStartDay, string | null>>;

export type Task = {
  id: string;
  name: string;
  taskType?: "recurring" | "once-off";
  onceOffDay?: TaskPlannedStartDay | null;
  onceOffTargetDate?: string | null;
  order: number;
  accumulatedMs: number;
  running: boolean;
  startMs: number | null;
  collapsed: boolean;
  milestonesEnabled: boolean;
  milestoneTimeUnit?: "day" | "hour" | "minute";
  milestones: Milestone[];
  hasStarted: boolean;
  color?: string | null;
  checkpointSoundEnabled?: boolean;
  checkpointSoundMode?: "once" | "repeat";
  checkpointToastEnabled?: boolean;
  checkpointToastMode?: "auto5s" | "auto3s" | "manual";
  timeGoalAction?: "continue" | "resetLog" | "resetNoLog" | "confirmModal";
  finalCheckpointAction?: "continue" | "resetLog" | "resetNoLog" | "confirmModal";
  presetIntervalsEnabled?: boolean;
  presetIntervalValue?: number;
  presetIntervalLastMilestoneId?: string | null;
  presetIntervalNextSeq?: number;
  timeGoalEnabled?: boolean;
  timeGoalValue?: number;
  timeGoalUnit?: "minute" | "hour";
  timeGoalPeriod?: "day" | "week";
  timeGoalMinutes?: number;
  timeGoalCompletedDayKey?: string | null;
  timeGoalCompletedAtMs?: number | null;
  plannedStartDay?: TaskPlannedStartDay | null;
  plannedStartTime?: string | null;
  plannedStartByDay?: TaskPlannedStartByDay | null;
  plannedStartOpenEnded?: boolean;
  plannedStartPushRemindersEnabled?: boolean;
};

export type TaskStatusState = "archived" | "deleted";

export type HistoryEntry = {
  ts: number;
  name: string;
  ms: number;
  color?: string;
  note?: string;
  completionDifficulty?: CompletionDifficulty;
  sessionId?: string;
};

export type HistoryByTaskId = Record<string, HistoryEntry[]>;

export type LiveTaskSession = {
  sessionId: string;
  taskId: string;
  name: string;
  startedAtMs: number;
  elapsedMs: number;
  note?: string;
  color?: string;
  status: "running";
  updatedAtMs: number;
};

export type LiveSessionsByTaskId = Record<string, LiveTaskSession>;

export type ProjectedHistoryEntry = HistoryEntry & {
  isLiveSession?: boolean;
  liveSessionId?: string;
  liveSessionStatus?: "running";
};

export type ProjectedHistoryByTaskId = Record<string, ProjectedHistoryEntry[]>;

export type TaskStatusMeta = {
  name: string;
  color: string | null;
  deletedAt: number;
  state?: TaskStatusState;
  taskSnapshot?: Task | null;
};

export type DeletedTaskMeta = Record<string, TaskStatusMeta>;

export function normalizeTaskStatusState(value: unknown): TaskStatusState {
  return value === "archived" ? "archived" : "deleted";
}

export function cloneTaskSnapshot(task: Task | null | undefined): Task | null {
  if (!task) return null;
  try {
    return JSON.parse(JSON.stringify(task)) as Task;
  } catch {
    return { ...task, milestones: Array.isArray(task.milestones) ? task.milestones.map((milestone) => ({ ...milestone })) : [] };
  }
}

export function buildTaskStatusMeta(task: Task, state: TaskStatusState, deletedAt: number): TaskStatusMeta {
  return {
    name: String(task.name || "").trim() || "Task",
    color: task.color || null,
    deletedAt: Math.max(0, Math.floor(Number(deletedAt) || 0)),
    state,
    taskSnapshot: cloneTaskSnapshot(task),
  };
}
