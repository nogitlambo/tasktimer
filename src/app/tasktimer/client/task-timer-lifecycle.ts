import type { CompletionDifficulty } from "../lib/completionDifficulty";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import { localDayKey } from "../lib/history";
import type { DashboardWeekStart } from "../lib/historyChart";
import {
  isTaskTimeGoalCompletedForPeriod,
  isTaskTimeGoalStartLockedForPeriod,
  getTaskTimeGoalCompletionResolution,
  markTaskTimeGoalCompleted,
} from "../lib/timeGoalCompletion";
import type { HistoryByTaskId, Task } from "../lib/types";
import { getTelemetryPlanTier, trackEvent } from "@/lib/firebaseTelemetry";
import { clearNativeRunningTimerNotification, showNativeRunningTimerNotification } from "../lib/nativeTimerNotification";

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
  completedAtMs?: number;
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
  upsertLiveSession: (task: Task, opts: { elapsedMs: number; resumedFromMs?: number; forceCloudFlush?: boolean; reason?: string }) => void;
  clearLiveSession: (taskId: string, opts?: { forceCloudFlush?: boolean; reason?: string }) => void;
  finalizeLiveSession: (
    task: Task,
    opts: { elapsedMs: number; completedAtMs?: number; note?: string; completionDifficulty?: CompletionDifficulty; deferTimeGoalXp?: boolean; preserveFocusSessionDraft?: boolean }
  ) => void;
  applyPendingTimeGoalXpForTask: (taskId: string | null | undefined) => unknown;
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
  getWeekStarting?: () => DashboardWeekStart;
  getAutoFocusOnTaskLaunchEnabled: () => boolean;
  openFocusMode: (index: number) => void;
  save: (opts?: { forceCloudFlush?: boolean }) => void;
  render: () => void;
  renderDashboardWidgets: () => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<unknown>;
};

type TaskTimerLifecycleOptions = {
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getWeekStarting?: () => DashboardWeekStart;
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
    const previousElapsedMs = Math.max(0, Math.floor(Number(task.accumulatedMs || 0) || 0));
    const hadElapsedBeforeStart = previousElapsedMs > 0;
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    task.running = true;
    task.startMs = startMs;
    task.hasStarted = true;
    task.resumePendingSinceDayKey = null;
    options.openRewardSessionSegment(task, startMs);
    options.upsertLiveSession(task, { elapsedMs: 0, resumedFromMs: previousElapsedMs, forceCloudFlush: true, reason: "start" });
    void showNativeRunningTimerNotification({
      taskId,
      taskName: String(task.name || "Task"),
      startedAtMs: startMs,
      elapsedBeforeStartMs: previousElapsedMs,
    }).catch(() => {});
    options.clearCheckpointBaseline(task.id);
    persistTaskTimerCommand(taskId);
    void trackEvent("task_started", {
      source_page: options.getCurrentAppPage(),
      has_time_goal: !!task.timeGoalEnabled && (Number(task.timeGoalMinutes) || 0) > 0,
      task_has_elapsed: hadElapsedBeforeStart,
      plan_tier: getTelemetryPlanTier(),
    });
    if (options.getAutoFocusOnTaskLaunchEnabled() && String(options.getFocusModeTaskId() || "") !== taskId) {
      options.openFocusMode(index);
    }
  }

  function stopTaskTimer(task: Task, stopMs: number) {
    const taskId = String(task.id || "");
    options.clearTaskTimeGoalFlow(taskId);
    options.flushPendingFocusSessionNoteSave(taskId);
    const observedElapsedMs = options.getElapsedMs(task);
    const weekStarting = options.getWeekStarting?.() || "mon";
    const completionResolution = !isTaskTimeGoalCompletedForPeriod(task, stopMs, weekStarting)
      ? getTaskTimeGoalCompletionResolution(task, stopMs, observedElapsedMs)
      : null;
    options.closeRewardSessionSegment(task, completionResolution?.completedAtMs ?? stopMs);
    task.accumulatedMs = completionResolution?.elapsedMs ?? observedElapsedMs;
    const shouldCompleteGoalOnStop =
      completionResolution != null;
    if (shouldCompleteGoalOnStop) {
      markTaskTimeGoalCompleted(task, completionResolution.completedAtMs, {
        reason: "goal",
        elapsedMs: completionResolution.elapsedMs,
        weekStarting,
      });
    }
    const shouldDeferTimeGoalXp =
      !!task.timeGoalEnabled &&
      Number(task.timeGoalMinutes || 0) > 0 &&
      !shouldCompleteGoalOnStop &&
      !isTaskTimeGoalCompletedForPeriod(task, stopMs, weekStarting);
    options.finalizeLiveSession(task, {
      elapsedMs: task.accumulatedMs,
      completedAtMs: completionResolution?.completedAtMs,
      deferTimeGoalXp: shouldDeferTimeGoalXp,
      preserveFocusSessionDraft: String(options.getFocusModeTaskId() || "") === taskId,
    });
    task.running = false;
    task.startMs = null;
    task.resumePendingSinceDayKey = task.accumulatedMs > 0 ? localDayKey(stopMs) : null;
    void clearNativeRunningTimerNotification(taskId).catch(() => {});
    options.clearCheckpointBaseline(task.id);
    persistTaskTimerCommand(taskId);
    const completedToday = isTaskTimeGoalCompletedForPeriod(task, stopMs, weekStarting);
    const telemetryParams = {
      source_page: options.getCurrentAppPage(),
      has_time_goal: !!task.timeGoalEnabled && (Number(task.timeGoalMinutes) || 0) > 0,
      task_has_elapsed: task.accumulatedMs > 0,
      plan_tier: getTelemetryPlanTier(),
    } as const;
    void trackEvent("task_stopped", telemetryParams);
    if (completedToday) {
      void trackEvent("task_completed", telemetryParams);
    }
    if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
  }

  function resetTaskStateImmediate(task: Task, opts?: ResetTaskStateOptions) {
    if (!task) return;
    const taskId = String(task.id || "");
    options.flushPendingFocusSessionNoteSave(taskId);
    const elapsedMs = options.getTaskElapsedMs(task);
    const shouldFinalizeHistory = opts?.logHistory !== false && !task.resumePendingSinceDayKey;
    let finalizeError: unknown = null;
    try {
      options.applyPendingTimeGoalXpForTask(taskId);
      if (shouldFinalizeHistory) {
        options.finalizeLiveSession(task, {
          elapsedMs,
          completedAtMs: opts?.completedAtMs,
          note: opts?.sessionNote,
          completionDifficulty: normalizeCompletionDifficulty(opts?.completionDifficulty),
        });
      }
    } catch (error) {
      finalizeError = error;
    } finally {
      task.accumulatedMs = 0;
      task.running = false;
      task.startMs = null;
      task.hasStarted = false;
      task.resumePendingSinceDayKey = null;
    }
    options.clearLiveSession(taskId, { forceCloudFlush: true, reason: "reset" });
    void clearNativeRunningTimerNotification(taskId).catch(() => {});
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
    if (
      isTaskTimeGoalStartLockedForPeriod(
        task,
        options.nowMs(),
        options.getWeekStarting?.() || "mon"
      )
    ) {
      return;
    }
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
