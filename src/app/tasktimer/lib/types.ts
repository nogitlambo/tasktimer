import type { CompletionDifficulty } from "./completionDifficulty";

export type Milestone = {
  hours: number;
  description: string;
  id?: string;
  createdSeq?: number;
};

export type TaskPlannedStartDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type TaskPlannedStartByDay = Partial<Record<TaskPlannedStartDay, string | null>>;

export type Task = {
  id: string;
  name: string;
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
  xpDisqualifiedUntilReset?: boolean;
  presetIntervalsEnabled?: boolean;
  presetIntervalValue?: number;
  presetIntervalLastMilestoneId?: string | null;
  presetIntervalNextSeq?: number;
  timeGoalEnabled?: boolean;
  timeGoalValue?: number;
  timeGoalUnit?: "minute" | "hour";
  timeGoalPeriod?: "day" | "week";
  timeGoalMinutes?: number;
  plannedStartDay?: TaskPlannedStartDay | null;
  plannedStartTime?: string | null;
  plannedStartByDay?: TaskPlannedStartByDay | null;
  plannedStartOpenEnded?: boolean;
  plannedStartPushRemindersEnabled?: boolean;
};

export type HistoryEntry = {
  ts: number;
  name: string;
  ms: number;
  color?: string;
  note?: string;
  xpDisqualifiedUntilReset?: boolean;
  completionDifficulty?: CompletionDifficulty;
};

export type HistoryByTaskId = Record<string, HistoryEntry[]>;

export type DeletedTaskMeta = Record<
  string,
  { name: string; color: string | null; deletedAt: number }
>;
