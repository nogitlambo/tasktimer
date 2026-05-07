import type { CompletionDifficulty } from "../lib/completionDifficulty";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import { isTaskTimeGoalCompletedToday } from "../lib/timeGoalCompletion";
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

type TaskTimerLifecycleCommands = {
  startTaskTimer: (task: Task, index: number, startMs: number) => void;
  stopTaskTimer: (task: Task, stopMs: number) => void;
  resetTaskStateImmediate: (task: Task, opts?: ResetTaskStateOptions) => void;
};

type TaskTimerLifecycleCommandAdapters = {
  clearTaskTimeGoalFlow: (taskId: string) => void;
  flushPendingFocusSessionNoteSave: (taskId: string) => void;
  openRewardSessionSegment: (task: Task, startMs: number) => void;
  closeRewardSessionSegment: (task: Task, endMs: number) => void;
  clearRewardSessionTracker: (taskId: string) => void;
  upsertLiveSession: (task: Task, opts: { elapsedMs: number; forceCloudFlush?: boolean; reason?: string }) => void;
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
  save: (opts?: { forceCloudFlush?: boolean }) => void;
  render: () => void;
  renderDashboardWidgets: () => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<unknown>;
};

type TaskTimerLifecycleOptions = {
  getTasks: () => Task[];
  getTaskDisplayName: (task: Task | null | undefined) => string;
  confirm: (title: string, text: string, opts: ConfirmOptions) => void;
  closeConfirm: () => void;
  addTaskAlreadyRunningConfirmClass: () => void;
  removeTaskAlreadyRunningConfirmClass: () => void;
  commands: TaskTimerLifecycleCommands;
  nowMs: () => number;
};

export function createTaskTimerLifecycleCommands(options: TaskTimerLifecycleCommandAdapters): TaskTimerLifecycleCommands {
  function persistTaskTimerCommand(taskId: string) {
    options.save({ forceCloudFlush: true });
    void options.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    options.render();
  }

  function startTaskTimer(task: Task, index: number, startMs: number) {
    const taskId = String(task.id || "");
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    task.running = true;
    task.startMs = startMs;
    task.hasStarted = true;
    options.openRewardSessionSegment(task, startMs);
    options.upsertLiveSession(task, { elapsedMs: 0, forceCloudFlush: true, reason: "start" });
    options.clearCheckpointBaseline(task.id);
    persistTaskTimerCommand(taskId);
    if (options.getAutoFocusOnTaskLaunchEnabled() && String(options.getFocusModeTaskId() || "") !== taskId) {
      options.openFocusMode(index);
    }
  }

  function stopTaskTimer(task: Task, stopMs: number) {
    const taskId = String(task.id || "");
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    options.closeRewardSessionSegment(task, stopMs);
    task.accumulatedMs = options.getElapsedMs(task);
    options.finalizeLiveSession(task, { elapsedMs: task.accumulatedMs });
    task.running = false;
    task.startMs = null;
    options.clearCheckpointBaseline(task.id);
    persistTaskTimerCommand(taskId);
    if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
  }

  function resetTaskStateImmediate(task: Task, opts?: ResetTaskStateOptions) {
    if (!task) return;
    const taskId = String(task.id || "");
    options.flushPendingFocusSessionNoteSave(taskId);
    const elapsedMs = options.getTaskElapsedMs(task);
    let finalizeError: unknown = null;
    try {
      options.finalizeLiveSession(task, {
        elapsedMs,
        note: opts?.sessionNote,
        completionDifficulty: normalizeCompletionDifficulty(opts?.completionDifficulty),
      });
    } catch (error) {
      finalizeError = error;
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
    if (finalizeError) {
      // Keep local completion/reset durable even if history persistence rejects.
      console.error("Failed to finalize task session", finalizeError);
    }
  }

  return {
    startTaskTimer,
    stopTaskTimer,
    resetTaskStateImmediate,
  };
}

export function createTaskTimerLifecycle(options: TaskTimerLifecycleOptions) {
  function findOtherRunningTaskIndex(targetIndex: number) {
    return options.getTasks().findIndex((task, index) => index !== targetIndex && !!task?.running);
  }

  function startTask(index: number) {
    const task = options.getTasks()[index];
    if (!task || task.running) return;
    if (isTaskTimeGoalCompletedToday(task, options.nowMs())) return;
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

    options.commands.startTaskTimer(task, index, options.nowMs());
  }

  function stopTask(index: number) {
    const task = options.getTasks()[index];
    if (!task || !task.running) return;
    options.commands.stopTaskTimer(task, options.nowMs());
  }

  function resetTaskStateImmediate(task: Task, opts?: ResetTaskStateOptions) {
    options.commands.resetTaskStateImmediate(task, opts);
  }

  return {
    startTask,
    stopTask,
    resetTaskStateImmediate,
  };
}
