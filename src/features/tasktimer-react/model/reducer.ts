import type { HistoryByTaskId, HistoryEntry } from "@/app/tasktimer/lib/types";
import {
  createHistoryEntryKey,
  fillBackgroundForPct,
  getElapsedMs,
  getHistoryEntriesForTask,
  getModeColor,
  isModeEnabled,
  taskModeOf,
} from "./selectors";
import {
  createInitialTaskTimerState,
  normalizeHistoryByTaskId,
  normalizeTask,
  type ConfirmDialogIntent,
  type MainMode,
  type TaskTimerAction,
  type TaskTimerState,
  type TaskTimerTask,
} from "./types";

function createTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneTask(task: TaskTimerTask): TaskTimerTask {
  return normalizeTask(JSON.parse(JSON.stringify(task)) as TaskTimerTask);
}

function nextTaskOrder(tasks: TaskTimerTask[]): number {
  return tasks.reduce((maxOrder, task) => Math.max(maxOrder, Number(task.order || 0)), 0) + 1;
}

function createTask(name: string, mode: MainMode, tasks: TaskTimerTask[]): TaskTimerTask {
  return normalizeTask({
    id: createTaskId(),
    name,
    order: nextTaskOrder(tasks),
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    checkpointSoundEnabled: false,
    checkpointSoundMode: "once",
    checkpointToastEnabled: false,
    checkpointToastMode: "auto5s",
    finalCheckpointAction: "continue",
    presetIntervalsEnabled: false,
    presetIntervalValue: 0,
    presetIntervalLastMilestoneId: null,
    presetIntervalNextSeq: 1,
    mode,
  } as TaskTimerTask);
}

function nextDuplicateName(name: string, tasks: TaskTimerTask[]): string {
  const trimmed = String(name || "").trim() || "Task";
  const directCopy = `${trimmed} Copy`;
  const existing = new Set(tasks.map((task) => String(task.name || "").trim()));
  if (!existing.has(directCopy)) return directCopy;
  let index = 2;
  while (existing.has(`${trimmed} Copy ${index}`)) index += 1;
  return `${trimmed} Copy ${index}`;
}

function upsertTask(tasks: TaskTimerTask[], nextTask: TaskTimerTask): TaskTimerTask[] {
  return tasks.map((task) => (task.id === nextTask.id ? nextTask : task));
}

function removeHistoryKeys(rows: HistoryEntry[], keys: Set<string>): HistoryEntry[] {
  return rows.filter((entry) => !keys.has(createHistoryEntryKey(entry)));
}

function appendCompletedHistoryEntry(
  state: TaskTimerState,
  task: TaskTimerTask,
  nowMs: number,
  historyByTaskId: HistoryByTaskId
): HistoryByTaskId {
  const elapsedMs = getElapsedMs(task, nowMs);
  if (!task.hasStarted || elapsedMs <= 0) return historyByTaskId;

  const progressColor = fillBackgroundForPct(100);
  const entry: HistoryEntry = {
    ts: nowMs,
    name: task.name,
    ms: elapsedMs,
    color: task.color || (state.dynamicColorsEnabled ? progressColor : getModeColor(state, task.mode)),
  };
  const nextRows = getHistoryEntriesForTask({ ...state, historyByTaskId }, task.id).slice();
  nextRows.unshift(entry);
  return {
    ...historyByTaskId,
    [task.id]: nextRows.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)),
  };
}

function buildDeleteTaskConfirm(task: TaskTimerTask): ConfirmDialogIntent {
  return {
    kind: "deleteTask",
    taskId: task.id,
    title: "Delete Task",
    text: `Delete "${task.name}"?`,
    okLabel: "Delete",
    checkboxLabel: "Delete history logs",
    checkboxChecked: true,
  };
}

function buildResetTaskConfirm(task: TaskTimerTask): ConfirmDialogIntent {
  return {
    kind: "resetTask",
    taskId: task.id,
    title: "Reset Task",
    text: `Reset "${task.name}" back to zero?`,
    okLabel: "Reset",
    checkboxLabel: "Log eligible session to History",
    checkboxChecked: true,
  };
}

function buildDeleteHistoryConfirm(taskId: string, entryKeys: string[]): ConfirmDialogIntent {
  return {
    kind: "deleteHistoryEntries",
    taskId,
    entryKeys,
    title: "Delete History",
    text: `Delete ${entryKeys.length} selected histor${entryKeys.length === 1 ? "y entry" : "y entries"}?`,
    okLabel: "Delete",
  };
}

export function reduceTaskTimerState(state: TaskTimerState, action: TaskTimerAction): TaskTimerState {
  switch (action.type) {
    case "hydrate": {
      const currentMode = isModeEnabled({ ...state, modeSettings: action.snapshot.modeSettings }, state.currentMode)
        ? state.currentMode
        : "mode1";
      const normalizedTasks = action.snapshot.tasks.map((task) => normalizeTask(task));
      return {
        ...state,
        ...action.snapshot,
        tasks: normalizedTasks,
        historyByTaskId: normalizeHistoryByTaskId(action.snapshot.historyByTaskId),
        deletedTaskMeta: { ...(action.snapshot.deletedTaskMeta || {}) },
        currentMode,
        clockNowMs: action.nowMs,
        status: "ready",
        addTaskDraft: { name: "", mode: currentMode },
        editTaskDraft: { taskId: null, name: "", mode: currentMode },
        openHistoryTaskIds: action.snapshot.pinnedHistoryTaskIds.slice(),
      };
    }
    case "tick":
      return { ...state, clockNowMs: action.nowMs };
    case "setMode":
      return {
        ...state,
        currentMode: isModeEnabled(state, action.mode) ? action.mode : "mode1",
        addTaskDraft: { ...state.addTaskDraft, mode: action.mode },
      };
    case "openAddTask":
      return { ...state, addTaskDialogOpen: true, addTaskDraft: { ...state.addTaskDraft, mode: state.currentMode } };
    case "closeAddTask":
      return { ...state, addTaskDialogOpen: false, addTaskDraft: { name: "", mode: state.currentMode } };
    case "setAddTaskName":
      return { ...state, addTaskDraft: { ...state.addTaskDraft, name: action.name } };
    case "setAddTaskMode":
      return { ...state, addTaskDraft: { ...state.addTaskDraft, mode: action.mode } };
    case "submitAddTask": {
      const name = state.addTaskDraft.name.trim();
      if (!name) return state;
      const nextTask = createTask(name, state.addTaskDraft.mode, state.tasks);
      return {
        ...state,
        tasks: state.tasks.concat(nextTask),
        addTaskDialogOpen: false,
        addTaskDraft: { name: "", mode: state.currentMode },
      };
    }
    case "openEditTask": {
      const task = state.tasks.find((row) => row.id === action.taskId);
      if (!task) return state;
      return {
        ...state,
        editTaskDialogOpen: true,
        editTaskDraft: { taskId: task.id, name: task.name, mode: taskModeOf(task) },
      };
    }
    case "closeEditTask":
      return {
        ...state,
        editTaskDialogOpen: false,
        editTaskDraft: { taskId: null, name: "", mode: state.currentMode },
      };
    case "setEditTaskName":
      return { ...state, editTaskDraft: { ...state.editTaskDraft, name: action.name } };
    case "setEditTaskMode":
      return { ...state, editTaskDraft: { ...state.editTaskDraft, mode: action.mode } };
    case "saveEditTask": {
      const taskId = state.editTaskDraft.taskId;
      if (!taskId) return state;
      const name = state.editTaskDraft.name.trim();
      if (!name) return state;
      const task = state.tasks.find((row) => row.id === taskId);
      if (!task) return state;
      const nextTask = normalizeTask({ ...task, name, mode: state.editTaskDraft.mode } as TaskTimerTask);
      return {
        ...state,
        tasks: upsertTask(state.tasks, nextTask),
        editTaskDialogOpen: false,
        editTaskDraft: { taskId: null, name: "", mode: state.currentMode },
      };
    }
    case "toggleCollapse":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? normalizeTask({ ...task, collapsed: !task.collapsed } as TaskTimerTask) : task
        ),
      };
    case "startTask":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId && !task.running
            ? normalizeTask({ ...task, running: true, startMs: action.nowMs, hasStarted: true } as TaskTimerTask)
            : task
        ),
      };
    case "stopTask":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId && task.running
            ? normalizeTask({
                ...task,
                accumulatedMs: getElapsedMs(task, action.nowMs),
                running: false,
                startMs: null,
              } as TaskTimerTask)
            : task
        ),
      };
    case "duplicateTask": {
      const task = state.tasks.find((row) => row.id === action.taskId);
      if (!task) return state;
      const duplicate = cloneTask(task);
      duplicate.id = createTaskId();
      duplicate.name = nextDuplicateName(task.name, state.tasks);
      duplicate.running = false;
      duplicate.startMs = null;
      duplicate.order = nextTaskOrder(state.tasks);
      const historyCopy = (state.historyByTaskId[task.id] || []).map((entry) => ({ ...entry }));
      return {
        ...state,
        tasks: state.tasks.concat(duplicate),
        historyByTaskId: { ...state.historyByTaskId, [duplicate.id]: historyCopy },
      };
    }
    case "requestDeleteTask": {
      const task = state.tasks.find((row) => row.id === action.taskId);
      if (!task) return state;
      return { ...state, confirmDialog: buildDeleteTaskConfirm(task) };
    }
    case "requestResetTask": {
      const task = state.tasks.find((row) => row.id === action.taskId);
      if (!task) return state;
      return { ...state, confirmDialog: buildResetTaskConfirm(task) };
    }
    case "toggleHistory": {
      const isOpen = state.openHistoryTaskIds.includes(action.taskId);
      const nextOpenHistoryTaskIds = isOpen
        ? state.openHistoryTaskIds.filter((taskId) => taskId !== action.taskId)
        : state.openHistoryTaskIds.concat(action.taskId);
      return { ...state, openHistoryTaskIds: nextOpenHistoryTaskIds };
    }
    case "togglePinnedHistory": {
      const isPinned = state.pinnedHistoryTaskIds.includes(action.taskId);
      const pinnedHistoryTaskIds = isPinned
        ? state.pinnedHistoryTaskIds.filter((taskId) => taskId !== action.taskId)
        : state.pinnedHistoryTaskIds.concat(action.taskId);
      const openHistoryTaskIds = pinnedHistoryTaskIds.includes(action.taskId)
        ? Array.from(new Set(state.openHistoryTaskIds.concat(action.taskId)))
        : state.openHistoryTaskIds.filter((taskId) => taskId !== action.taskId);
      return { ...state, pinnedHistoryTaskIds, openHistoryTaskIds };
    }
    case "toggleHistorySelection": {
      const current = new Set(state.historySelectionByTaskId[action.taskId] || []);
      if (current.has(action.entryKey)) current.delete(action.entryKey);
      else current.add(action.entryKey);
      return {
        ...state,
        historySelectionByTaskId: {
          ...state.historySelectionByTaskId,
          [action.taskId]: Array.from(current),
        },
      };
    }
    case "clearHistorySelection":
      return {
        ...state,
        historySelectionByTaskId: {
          ...state.historySelectionByTaskId,
          [action.taskId]: [],
        },
      };
    case "requestDeleteHistorySelection": {
      const entryKeys = (state.historySelectionByTaskId[action.taskId] || []).slice();
      if (!entryKeys.length) return state;
      return { ...state, confirmDialog: buildDeleteHistoryConfirm(action.taskId, entryKeys) };
    }
    case "openHistoryAnalysis": {
      const selected = state.historySelectionByTaskId[action.taskId] || [];
      if (selected.length < 2) return state;
      return { ...state, historyAnalysisTaskId: action.taskId };
    }
    case "closeHistoryAnalysis":
      return { ...state, historyAnalysisTaskId: null };
    case "closeConfirmDialog":
      return { ...state, confirmDialog: null };
    case "confirmDialog": {
      const confirmDialog = state.confirmDialog;
      if (!confirmDialog) return state;

      if (confirmDialog.kind === "deleteTask") {
        const task = state.tasks.find((row) => row.id === confirmDialog.taskId);
        if (!task) return { ...state, confirmDialog: null };
        const deleteHistory = action.checkboxChecked ?? confirmDialog.checkboxChecked;
        const tasks = state.tasks.filter((row) => row.id !== task.id);
        const historyByTaskId = { ...state.historyByTaskId };
        const deletedTaskMeta = { ...state.deletedTaskMeta };
        if (deleteHistory) {
          delete historyByTaskId[task.id];
          delete deletedTaskMeta[task.id];
        } else {
          deletedTaskMeta[task.id] = {
            name: task.name,
            color: task.color || null,
            deletedAt: state.clockNowMs,
          };
        }
        return {
          ...state,
          tasks,
          historyByTaskId,
          deletedTaskMeta,
          openHistoryTaskIds: state.openHistoryTaskIds.filter((taskId) => taskId !== task.id),
          pinnedHistoryTaskIds: state.pinnedHistoryTaskIds.filter((taskId) => taskId !== task.id),
          historySelectionByTaskId: Object.fromEntries(
            Object.entries(state.historySelectionByTaskId).filter(([taskId]) => taskId !== task.id)
          ),
          confirmDialog: null,
        };
      }

      if (confirmDialog.kind === "resetTask") {
        const task = state.tasks.find((row) => row.id === confirmDialog.taskId);
        if (!task) return { ...state, confirmDialog: null };
        const logHistory = action.checkboxChecked ?? confirmDialog.checkboxChecked;
        const historyByTaskId = logHistory
          ? appendCompletedHistoryEntry(state, task, state.clockNowMs, { ...state.historyByTaskId })
          : state.historyByTaskId;
        const nextTask = normalizeTask({
          ...task,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          hasStarted: false,
          xpDisqualifiedUntilReset: false,
        } as TaskTimerTask);
        return {
          ...state,
          tasks: upsertTask(state.tasks, nextTask),
          historyByTaskId,
          confirmDialog: null,
        };
      }

      if (confirmDialog.kind === "deleteHistoryEntries") {
        const rows = getHistoryEntriesForTask(state, confirmDialog.taskId);
        const entryKeys = new Set(confirmDialog.entryKeys);
        return {
          ...state,
          historyByTaskId: {
            ...state.historyByTaskId,
            [confirmDialog.taskId]: removeHistoryKeys(rows, entryKeys),
          },
          historySelectionByTaskId: {
            ...state.historySelectionByTaskId,
            [confirmDialog.taskId]: [],
          },
          confirmDialog: null,
        };
      }
      return state;
    }
    default:
      return state;
  }
}

export function createReducerInitialState(nowMs: number): TaskTimerState {
  return createInitialTaskTimerState(nowMs);
}
