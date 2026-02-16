export type Milestone = {
  hours: number;
  description: string;
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
