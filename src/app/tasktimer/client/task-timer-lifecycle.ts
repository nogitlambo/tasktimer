import type { CompletionDifficulty } from "../lib/completionDifficulty";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import type { Task } from "../lib/types";

type ConfirmOptions = {
  okLabel: string;
  cancelLabel?: string;
  onOk: () => void;
  onCancel?: () => void;
};

type ResetTaskStateOptions = {
  logHistory?: boolean;
  sessionNote?: string;
  completionDifficulty?: unknown;
};

type TaskTimerLifecycleOptions = {
  getTasks: () => Task[];
  getTaskDisplayName: (task: Task | null | undefined) => string;
  confirm: (title: string, text: string, opts: ConfirmOptions) => void;
  closeConfirm: () => void;
  addTaskAlreadyRunningConfirmClass: () => void;
  removeTaskAlreadyRunningConfirmClass: () => void;
  clearTaskTimeGoalFlow: (taskId: string) => void;
  flushPendingFocusSessionNoteSave: (taskId: string) => void;
  openRewardSessionSegment: (task: Task, startMs: number) => void;
  closeRewardSessionSegment: (task: Task, endMs: number) => void;
  clearRewardSessionTracker: (taskId: string) => void;
  upsertLiveSession: (task: Task, opts: { elapsedMs: number }) => void;
  finalizeLiveSession: (
    task: Task,
    opts: { elapsedMs: number; note?: string; completionDifficulty?: CompletionDifficulty }
  ) => void;
  getElapsedMs: (task: Task) => number;
  getTaskElapsedMs: (task: Task) => number;
  clearCheckpointBaseline: (taskId: string) => void;
  resetCheckpointAlertTracking: (taskId: string) => void;
  setCheckpointAutoResetDirty: (dirty: boolean) => void;
  clearFocusSessionDraft: (taskId: string) => void;
  getFocusModeTaskId: () => string | null;
  syncFocusSessionNotesInput: (taskId: string) => void;
  syncFocusSessionNotesAccordion: (taskId: string) => void;
  getCurrentAppPage: () => string;
  getAutoFocusOnTaskLaunchEnabled: () => boolean;
  openFocusMode: (index: number) => void;
  save: () => void;
  render: () => void;
  renderDashboardWidgets: () => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<unknown>;
  nowMs: () => number;
};

export function createTaskTimerLifecycle(options: TaskTimerLifecycleOptions) {
  function findOtherRunningTaskIndex(targetIndex: number) {
    return options.getTasks().findIndex((task, index) => index !== targetIndex && !!task?.running);
  }

  function startTask(index: number) {
    const task = options.getTasks()[index];
    if (!task || task.running) return;
    const otherRunningIndex = findOtherRunningTaskIndex(index);
    if (otherRunningIndex >= 0) {
      const runningTask = options.getTasks()[otherRunningIndex];
      options.addTaskAlreadyRunningConfirmClass();
      options.confirm(
        "Task Already Running",
        `${options.getTaskDisplayName(runningTask)} is currently running. Do you want to stop this timer and launch ${options.getTaskDisplayName(task)}?`,
        {
          okLabel: "Yes",
          cancelLabel: "Cancel",
          onOk: () => {
            options.removeTaskAlreadyRunningConfirmClass();
            options.closeConfirm();
            stopTask(otherRunningIndex);
            startTask(index);
          },
          onCancel: () => {
            options.removeTaskAlreadyRunningConfirmClass();
            options.closeConfirm();
          },
        }
      );
      return;
    }

    const taskId = String(task.id || "");
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    const startMs = options.nowMs();
    task.running = true;
    task.startMs = startMs;
    task.hasStarted = true;
    options.openRewardSessionSegment(task, startMs);
    options.upsertLiveSession(task, { elapsedMs: 0 });
    options.clearCheckpointBaseline(task.id);
    options.save();
    void options.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    options.render();
    if (options.getAutoFocusOnTaskLaunchEnabled() && String(options.getFocusModeTaskId() || "") !== taskId) {
      options.openFocusMode(index);
    }
  }

  function stopTask(index: number) {
    const task = options.getTasks()[index];
    if (!task || !task.running) return;
    const taskId = String(task.id || "");
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    options.closeRewardSessionSegment(task, options.nowMs());
    task.accumulatedMs = options.getElapsedMs(task);
    options.finalizeLiveSession(task, { elapsedMs: task.accumulatedMs });
    task.running = false;
    task.startMs = null;
    options.clearCheckpointBaseline(task.id);
    options.save();
    void options.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    options.render();
    if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
  }

  function resetTaskStateImmediate(task: Task, opts?: ResetTaskStateOptions) {
    if (!task) return;
    const taskId = String(task.id || "");
    options.flushPendingFocusSessionNoteSave(taskId);
    const elapsedMs = options.getTaskElapsedMs(task);
    try {
      options.finalizeLiveSession(task, {
        elapsedMs,
        note: opts?.sessionNote,
        completionDifficulty: normalizeCompletionDifficulty(opts?.completionDifficulty),
      });
    } finally {
      task.accumulatedMs = 0;
      task.running = false;
      task.startMs = null;
      task.hasStarted = false;
    }
    options.clearTaskTimeGoalFlow(taskId);
    options.clearRewardSessionTracker(taskId);
    options.resetCheckpointAlertTracking(task.id);
    options.setCheckpointAutoResetDirty(true);
    options.clearFocusSessionDraft(taskId);
    if (String(options.getFocusModeTaskId() || "") === taskId) {
      options.syncFocusSessionNotesInput(taskId);
      options.syncFocusSessionNotesAccordion(taskId);
    }
    if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
  }

  return {
    startTask,
    stopTask,
    resetTaskStateImmediate,
  };
}
