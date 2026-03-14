import {
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "@/app/tasktimer/client/state";
import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "@/app/tasktimer/lib/types";

export type MainMode = "mode1" | "mode2" | "mode3";

export type TaskTimerThemeMode = "purple" | "cyan";

export type TaskTimerTask = Task & {
  mode: MainMode;
};

export type ModeSetting = {
  label: string;
  enabled: boolean;
  color: string;
};

export type ModeSettings = Record<MainMode, ModeSetting>;

export type TaskConfigMilestoneDraft = {
  id: string;
  createdSeq: number;
  value: string;
  description: string;
};

export type TaskConfigDraftBase = {
  mode: MainMode;
  milestonesEnabled: boolean;
  milestoneTimeUnit: "day" | "hour" | "minute";
  milestones: TaskConfigMilestoneDraft[];
  checkpointSoundEnabled: boolean;
  checkpointSoundMode: "once" | "repeat";
  checkpointToastEnabled: boolean;
  checkpointToastMode: "auto5s" | "manual";
  presetIntervalsEnabled: boolean;
  presetIntervalValue: string;
  finalCheckpointAction: "continue" | "resetLog" | "resetNoLog";
};

export type AddTaskDraft = TaskConfigDraftBase & {
  name: string;
  durationValue: string;
  durationUnit: "minute" | "hour";
  durationPeriod: "day" | "week";
  noTimeGoal: boolean;
};

export type EditTaskDraft = TaskConfigDraftBase & {
  taskId: string | null;
  name: string;
  overrideElapsedEnabled: boolean;
  elapsedDays: string;
  elapsedHours: string;
  elapsedMinutes: string;
  elapsedSeconds: string;
};

export type TaskConfigValidation = {
  message: string;
  fields?: {
    name?: boolean;
    duration?: boolean;
    checkpoints?: boolean;
    checkpointRows?: boolean;
    presetInterval?: boolean;
  };
} | null;

export type TaskTimerInfoDialogKey = "checkpoint" | "presetIntervals" | null;

export type RecentTaskNames = string[];

export type TaskTimerDefaults = {
  defaultTaskTimerFormat: "day" | "hour" | "minute";
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  recentCustomTaskNames: RecentTaskNames;
};

export type ConfirmDialogIntent =
  | {
      kind: "deleteTask";
      taskId: string;
      title: string;
      text: string;
      okLabel: string;
      checkboxLabel: string;
      checkboxChecked: boolean;
    }
  | {
      kind: "resetTask";
      taskId: string;
      title: string;
      text: string;
      okLabel: string;
      checkboxLabel: string;
      checkboxChecked: boolean;
    }
  | {
      kind: "deleteHistoryEntries";
      taskId: string;
      entryKeys: string[];
      title: string;
      text: string;
      okLabel: string;
    }
  | {
      kind: "enableElapsedOverride";
      title: string;
      text: string;
      okLabel: string;
    };

export type TaskTimerSnapshot = {
  tasks: TaskTimerTask[];
  historyByTaskId: HistoryByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  modeSettings: ModeSettings;
  themeMode: TaskTimerThemeMode;
  taskView: "list" | "tile";
  dynamicColorsEnabled: boolean;
  pinnedHistoryTaskIds: string[];
} & TaskTimerDefaults;

export type TaskTimerState = TaskTimerSnapshot & {
  status: "booting" | "ready";
  currentMode: MainMode;
  clockNowMs: number;
  addTaskDraft: AddTaskDraft;
  addTaskDialogOpen: boolean;
  addTaskWizardStep: 1 | 2 | 3;
  addTaskValidation: TaskConfigValidation;
  editTaskDraft: EditTaskDraft;
  editTaskDialogOpen: boolean;
  editValidation: TaskConfigValidation;
  openHistoryTaskIds: string[];
  historySelectionByTaskId: Record<string, string[]>;
  confirmDialog: ConfirmDialogIntent | null;
  historyAnalysisTaskId: string | null;
};

export type TaskTimerAction =
  | { type: "hydrate"; snapshot: TaskTimerSnapshot; nowMs: number }
  | { type: "tick"; nowMs: number }
  | { type: "setMode"; mode: MainMode }
  | { type: "openAddTask" }
  | { type: "closeAddTask" }
  | { type: "setAddTaskWizardStep"; step: 1 | 2 | 3 }
  | { type: "advanceAddTaskWizard" }
  | { type: "retreatAddTaskWizard" }
  | { type: "patchAddTaskDraft"; patch: Partial<AddTaskDraft> }
  | { type: "addAddTaskMilestone" }
  | { type: "updateAddTaskMilestone"; milestoneId: string; patch: Partial<Pick<TaskConfigMilestoneDraft, "value" | "description">> }
  | { type: "removeAddTaskMilestone"; milestoneId: string }
  | { type: "clearAddTaskValidation" }
  | { type: "submitAddTask" }
  | { type: "openEditTask"; taskId: string }
  | { type: "closeEditTask" }
  | { type: "patchEditTaskDraft"; patch: Partial<EditTaskDraft> }
  | { type: "addEditTaskMilestone" }
  | { type: "updateEditTaskMilestone"; milestoneId: string; patch: Partial<Pick<TaskConfigMilestoneDraft, "value" | "description">> }
  | { type: "removeEditTaskMilestone"; milestoneId: string }
  | { type: "requestEnableEditElapsedOverride" }
  | { type: "clearEditValidation" }
  | { type: "saveEditTask"; nowMs: number }
  | { type: "toggleCollapse"; taskId: string }
  | { type: "startTask"; taskId: string; nowMs: number }
  | { type: "stopTask"; taskId: string; nowMs: number }
  | { type: "duplicateTask"; taskId: string }
  | { type: "requestDeleteTask"; taskId: string }
  | { type: "requestResetTask"; taskId: string }
  | { type: "toggleHistory"; taskId: string }
  | { type: "togglePinnedHistory"; taskId: string }
  | { type: "toggleHistorySelection"; taskId: string; entryKey: string }
  | { type: "clearHistorySelection"; taskId: string }
  | { type: "requestDeleteHistorySelection"; taskId: string }
  | { type: "openHistoryAnalysis"; taskId: string }
  | { type: "closeHistoryAnalysis" }
  | { type: "closeConfirmDialog" }
  | { type: "confirmDialog"; checkboxChecked?: boolean };

export function createDefaultModeSettings(): ModeSettings {
  return {
    mode1: {
      label: DEFAULT_MODE_LABELS.mode1,
      enabled: DEFAULT_MODE_ENABLED.mode1,
      color: DEFAULT_MODE_COLORS.mode1,
    },
    mode2: {
      label: DEFAULT_MODE_LABELS.mode2,
      enabled: DEFAULT_MODE_ENABLED.mode2,
      color: DEFAULT_MODE_COLORS.mode2,
    },
    mode3: {
      label: DEFAULT_MODE_LABELS.mode3,
      enabled: DEFAULT_MODE_ENABLED.mode3,
      color: DEFAULT_MODE_COLORS.mode3,
    },
  };
}

export function createEmptySnapshot(): TaskTimerSnapshot {
  return {
    tasks: [],
    historyByTaskId: {},
    deletedTaskMeta: {},
    modeSettings: createDefaultModeSettings(),
    themeMode: "purple",
    taskView: "list",
    dynamicColorsEnabled: true,
    pinnedHistoryTaskIds: [],
    defaultTaskTimerFormat: "hour",
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    recentCustomTaskNames: [],
  };
}

export function createInitialTaskTimerState(nowMs: number): TaskTimerState {
  const snapshot = createEmptySnapshot();
  return {
    ...snapshot,
    status: "booting",
    currentMode: "mode1",
    clockNowMs: nowMs,
    addTaskDraft: {
      name: "",
      mode: "mode1",
      durationValue: "5",
      durationUnit: "hour",
      durationPeriod: "week",
      noTimeGoal: false,
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: false,
      checkpointToastMode: "auto5s",
      presetIntervalsEnabled: false,
      presetIntervalValue: "0",
      finalCheckpointAction: "continue",
    },
    addTaskDialogOpen: false,
    addTaskWizardStep: 1,
    addTaskValidation: null,
    editTaskDraft: {
      taskId: null,
      name: "",
      mode: "mode1",
      overrideElapsedEnabled: false,
      elapsedDays: "0",
      elapsedHours: "0",
      elapsedMinutes: "0",
      elapsedSeconds: "0",
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: false,
      checkpointToastMode: "auto5s",
      presetIntervalsEnabled: false,
      presetIntervalValue: "0",
      finalCheckpointAction: "continue",
    },
    editTaskDialogOpen: false,
    editValidation: null,
    openHistoryTaskIds: [],
    historySelectionByTaskId: {},
    confirmDialog: null,
    historyAnalysisTaskId: null,
  };
}

function sanitizeMode(modeRaw: unknown): MainMode {
  const mode = String(modeRaw || "");
  if (mode === "mode2" || mode === "mode3") return mode;
  return "mode1";
}

export function normalizeTask(task: Task): TaskTimerTask {
  return {
    ...task,
    mode: sanitizeMode((task as Task & { mode?: unknown }).mode),
    milestoneTimeUnit:
      task.milestoneTimeUnit === "day" || task.milestoneTimeUnit === "minute" ? task.milestoneTimeUnit : "hour",
    milestones: Array.isArray(task.milestones) ? task.milestones : [],
    checkpointSoundEnabled: !!task.checkpointSoundEnabled,
    checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!task.checkpointToastEnabled,
    checkpointToastMode: task.checkpointToastMode === "manual" ? "manual" : "auto5s",
    finalCheckpointAction:
      task.finalCheckpointAction === "resetLog" || task.finalCheckpointAction === "resetNoLog"
        ? task.finalCheckpointAction
        : "continue",
    presetIntervalsEnabled: !!task.presetIntervalsEnabled,
    presetIntervalValue: Number.isFinite(Number(task.presetIntervalValue)) ? Number(task.presetIntervalValue) : 0,
    presetIntervalLastMilestoneId:
      task.presetIntervalLastMilestoneId == null ? null : String(task.presetIntervalLastMilestoneId),
    presetIntervalNextSeq: Number.isFinite(Number(task.presetIntervalNextSeq))
      ? Math.max(1, Number(task.presetIntervalNextSeq))
      : 1,
  };
}

export function normalizeHistoryByTaskId(historyByTaskId: HistoryByTaskId): HistoryByTaskId {
  const next: HistoryByTaskId = {};
  Object.keys(historyByTaskId || {}).forEach((taskId) => {
    next[taskId] = (Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [])
      .map((entry) => normalizeHistoryEntry(entry))
      .filter((entry): entry is HistoryEntry => !!entry);
  });
  return next;
}

export function normalizeHistoryEntry(entry: HistoryEntry | null | undefined): HistoryEntry | null {
  if (!entry) return null;
  const next: HistoryEntry = {
    ts: Number.isFinite(Number(entry.ts)) ? Math.floor(Number(entry.ts)) : 0,
    name: String(entry.name || ""),
    ms: Number.isFinite(Number(entry.ms)) ? Math.max(0, Math.floor(Number(entry.ms))) : 0,
  };
  if (typeof entry.color === "string" && entry.color.trim()) next.color = entry.color.trim();
  if (typeof entry.note === "string" && entry.note.trim()) next.note = entry.note.trim();
  return next;
}
