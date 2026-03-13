import { rememberRecentCustomTaskName } from "@/app/tasktimer/lib/addTaskNames";
import type { HistoryByTaskId, HistoryEntry } from "@/app/tasktimer/lib/types";
import {
  appendMilestoneDraft,
  applyEditDraftToTask,
  buildTaskFromAddDraft,
  createDefaultAddTaskDraft,
  createEditTaskDraft,
  normalizeAddTaskDraft,
  normalizeEditTaskDraft,
  removeMilestoneDraft,
  updateMilestoneDraft,
  validateAddTaskDraft,
  validateAddTaskStep,
  validateEditTaskDraft,
} from "./taskConfig";
import {
  createHistoryEntryKey,
  fillBackgroundForPct,
  getElapsedMs,
  getHistoryEntriesForTask,
  getModeColor,
  isModeEnabled,
} from "./selectors";
import {
  createInitialTaskTimerState,
  normalizeHistoryByTaskId,
  normalizeTask,
  type ConfirmDialogIntent,
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

function buildEnableElapsedOverrideConfirm(): ConfirmDialogIntent {
  return {
    kind: "enableElapsedOverride",
    title: "Manual Time Override",
    text: "Manual time override will disqualify this task from earning XP until the next reset. Proceed?",
    okLabel: "Proceed",
  };
}

function resetAddTaskState(state: TaskTimerState): Pick<TaskTimerState, "addTaskDraft" | "addTaskWizardStep" | "addTaskValidation"> {
  return {
    addTaskDraft: createDefaultAddTaskDraft(state.currentMode, state.defaultTaskTimerFormat),
    addTaskWizardStep: 1,
    addTaskValidation: null,
  };
}

function resetEditTaskState(state: TaskTimerState): Pick<TaskTimerState, "editTaskDraft" | "editValidation"> {
  return {
    editTaskDraft: createEditTaskDraft(
      normalizeTask({
        id: "",
        name: "",
        order: 0,
        accumulatedMs: 0,
        running: false,
        startMs: null,
        collapsed: false,
        milestonesEnabled: false,
        milestoneTimeUnit: state.defaultTaskTimerFormat,
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
        mode: state.currentMode,
      } as TaskTimerTask),
      state.clockNowMs
    ),
    editValidation: null,
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
        addTaskDraft: createDefaultAddTaskDraft(currentMode, action.snapshot.defaultTaskTimerFormat),
        addTaskWizardStep: 1,
        addTaskValidation: null,
        editTaskDraft: resetEditTaskState({
          ...state,
          ...action.snapshot,
          currentMode,
          clockNowMs: action.nowMs,
        }).editTaskDraft,
        editValidation: null,
        openHistoryTaskIds: action.snapshot.pinnedHistoryTaskIds.slice(),
      };
    }
    case "tick":
      return { ...state, clockNowMs: action.nowMs };
    case "setMode":
      return {
        ...state,
        currentMode: isModeEnabled(state, action.mode) ? action.mode : "mode1",
        addTaskDraft: normalizeAddTaskDraft({ ...state.addTaskDraft, mode: action.mode }),
      };
    case "openAddTask":
      return {
        ...state,
        addTaskDialogOpen: true,
        ...resetAddTaskState(state),
      };
    case "closeAddTask":
      return {
        ...state,
        addTaskDialogOpen: false,
        ...resetAddTaskState(state),
      };
    case "setAddTaskWizardStep":
      return {
        ...state,
        addTaskWizardStep: action.step,
        addTaskValidation: null,
      };
    case "advanceAddTaskWizard": {
      const validation = validateAddTaskStep(state.addTaskDraft, state.addTaskWizardStep);
      if (validation) return { ...state, addTaskValidation: validation };
      if (state.addTaskWizardStep >= 3) return state;
      return {
        ...state,
        addTaskWizardStep: (state.addTaskWizardStep + 1) as 1 | 2 | 3,
        addTaskValidation: null,
      };
    }
    case "retreatAddTaskWizard":
      return {
        ...state,
        addTaskWizardStep: Math.max(1, state.addTaskWizardStep - 1) as 1 | 2 | 3,
        addTaskValidation: null,
      };
    case "patchAddTaskDraft":
      return {
        ...state,
        addTaskDraft: normalizeAddTaskDraft({ ...state.addTaskDraft, ...action.patch }),
        addTaskValidation: null,
      };
    case "addAddTaskMilestone":
      return {
        ...state,
        addTaskDraft: appendMilestoneDraft(state.addTaskDraft),
        addTaskValidation: null,
      };
    case "updateAddTaskMilestone":
      return {
        ...state,
        addTaskDraft: updateMilestoneDraft(state.addTaskDraft, action.milestoneId, action.patch),
        addTaskValidation: null,
      };
    case "removeAddTaskMilestone":
      return {
        ...state,
        addTaskDraft: removeMilestoneDraft(state.addTaskDraft, action.milestoneId),
        addTaskValidation: null,
      };
    case "clearAddTaskValidation":
      return { ...state, addTaskValidation: null };
    case "submitAddTask": {
      const draft = normalizeAddTaskDraft(state.addTaskDraft);
      const validation = validateAddTaskDraft(draft);
      if (validation) {
        return {
          ...state,
          addTaskWizardStep: validation.fields?.name ? 1 : validation.fields?.duration ? 2 : 3,
          addTaskValidation: validation,
        };
      }
      const nextTask = buildTaskFromAddDraft(draft, state.tasks, createTaskId);
      return {
        ...state,
        tasks: state.tasks.concat(nextTask),
        recentCustomTaskNames: rememberRecentCustomTaskName(draft.name, state.recentCustomTaskNames),
        addTaskDialogOpen: false,
        ...resetAddTaskState(state),
      };
    }
    case "openEditTask": {
      const task = state.tasks.find((row) => row.id === action.taskId);
      if (!task) return state;
      return {
        ...state,
        editTaskDialogOpen: true,
        editTaskDraft: createEditTaskDraft(task, state.clockNowMs),
        editValidation: null,
      };
    }
    case "closeEditTask":
      return {
        ...state,
        editTaskDialogOpen: false,
        ...resetEditTaskState(state),
      };
    case "patchEditTaskDraft":
      return {
        ...state,
        editTaskDraft: normalizeEditTaskDraft({ ...state.editTaskDraft, ...action.patch }),
        editValidation: null,
      };
    case "addEditTaskMilestone":
      return {
        ...state,
        editTaskDraft: appendMilestoneDraft(state.editTaskDraft),
        editValidation: null,
      };
    case "updateEditTaskMilestone":
      return {
        ...state,
        editTaskDraft: updateMilestoneDraft(state.editTaskDraft, action.milestoneId, action.patch),
        editValidation: null,
      };
    case "removeEditTaskMilestone":
      return {
        ...state,
        editTaskDraft: removeMilestoneDraft(state.editTaskDraft, action.milestoneId),
        editValidation: null,
      };
    case "requestEnableEditElapsedOverride":
      return {
        ...state,
        confirmDialog: buildEnableElapsedOverrideConfirm(),
      };
    case "clearEditValidation":
      return { ...state, editValidation: null };
    case "saveEditTask": {
      const taskId = state.editTaskDraft.taskId;
      if (!taskId) return state;
      const task = state.tasks.find((row) => row.id === taskId);
      if (!task) return state;
      const validation = validateEditTaskDraft(state.editTaskDraft);
      if (validation) {
        return {
          ...state,
          editValidation: validation,
        };
      }
      const nextTask = applyEditDraftToTask(task, state.editTaskDraft, action.nowMs);
      return {
        ...state,
        tasks: upsertTask(state.tasks, nextTask),
        editTaskDialogOpen: false,
        ...resetEditTaskState(state),
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
      duplicate.order = state.tasks.reduce((maxOrder, row) => Math.max(maxOrder, Number(row.order || 0)), 0) + 1;
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

      if (confirmDialog.kind === "enableElapsedOverride") {
        return {
          ...state,
          editTaskDraft: normalizeEditTaskDraft({ ...state.editTaskDraft, overrideElapsedEnabled: true }),
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
