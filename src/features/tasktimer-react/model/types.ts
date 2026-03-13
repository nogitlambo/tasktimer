import {
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "@/app/tasktimer/client/state";
import type { DeletedTaskMeta, HistoryByTaskId, HistoryEntry, Task } from "@/app/tasktimer/lib/types";

export type MainMode = "mode1" | "mode2" | "mode3";

export type TaskTimerThemeMode = "dark" | "light" | "command";

export type TaskTimerTask = Task & {
  mode: MainMode;
};

export type ModeSetting = {
  label: string;
  enabled: boolean;
  color: string;
};

export type ModeSettings = Record<MainMode, ModeSetting>;

export type AddTaskDraft = {
  name: string;
  mode: MainMode;
};

export type EditTaskDraft = {
  taskId: string | null;
  name: string;
  mode: MainMode;
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
};

export type TaskTimerState = TaskTimerSnapshot & {
  status: "booting" | "ready";
  currentMode: MainMode;
  clockNowMs: number;
  addTaskDraft: AddTaskDraft;
  addTaskDialogOpen: boolean;
  editTaskDraft: EditTaskDraft;
  editTaskDialogOpen: boolean;
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
  | { type: "setAddTaskName"; name: string }
  | { type: "setAddTaskMode"; mode: MainMode }
  | { type: "submitAddTask" }
  | { type: "openEditTask"; taskId: string }
  | { type: "closeEditTask" }
  | { type: "setEditTaskName"; name: string }
  | { type: "setEditTaskMode"; mode: MainMode }
  | { type: "saveEditTask" }
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
    themeMode: "dark",
    taskView: "list",
    dynamicColorsEnabled: true,
    pinnedHistoryTaskIds: [],
  };
}

export function createInitialTaskTimerState(nowMs: number): TaskTimerState {
  const snapshot = createEmptySnapshot();
  return {
    ...snapshot,
    status: "booting",
    currentMode: "mode1",
    clockNowMs: nowMs,
    addTaskDraft: { name: "", mode: "mode1" },
    addTaskDialogOpen: false,
    editTaskDraft: { taskId: null, name: "", mode: "mode1" },
    editTaskDialogOpen: false,
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
