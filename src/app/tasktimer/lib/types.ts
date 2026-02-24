export type Milestone = {
  hours: number;
  description: string;
  id?: string;
  createdSeq?: number;
};

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
  checkpointToastMode?: "auto3s" | "manual";
  finalCheckpointAction?: "continue" | "resetLog" | "resetNoLog";
  presetIntervalsEnabled?: boolean;
  presetIntervalValue?: number;
  presetIntervalLastMilestoneId?: string | null;
  presetIntervalNextSeq?: number;
};

export type HistoryEntry = {
  ts: number;
  name: string;
  ms: number;
  color?: string;
};

export type HistoryByTaskId = Record<string, HistoryEntry[]>;

export type DeletedTaskMeta = Record<
  string,
  { name: string; color: string | null; deletedAt: number }
>;
