import { buildTaskStatusMeta, type Task } from "../lib/types";
import { nowMs } from "../lib/time";
import type { TaskTimerTasksContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import { createTaskCardActionEffects } from "./task-card-action-effects";
import { createTaskDestructiveActionEffects } from "./task-destructive-action-effects";
import { createTaskListRenderer } from "./task-list-renderer";
import { createTaskManualEntryInteraction } from "./task-manual-entry-interaction";
import { completeManualEntryDailyGoalIfReached } from "./manual-entry-time-goal";
import { getRichNoteEditorValue } from "./rich-session-notes";
import { getTaskTimerTileColumnCount } from "./task-tile-columns";
import { createTaskTimerLifecycle, createTaskTimerLifecycleCommands } from "./task-timer-lifecycle";
import {
  getNextCheckpointFastForwardTargetMs,
  getPreviousCheckpointRewindTargetMs,
  markCheckpointFiredKeysThroughTarget,
  pruneCheckpointFiredKeysAfterTarget,
  updateLatestSameDayHistoryElapsed,
} from "./checkpoint-rewind";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TASK_PRIMARY_ACTION_PRESS_CLASS = "isTaskPrimaryActionPressed";
const TASK_PRIMARY_ACTION_PRESS_MS = 140;

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  let resetTaskStateImmediateForManualEntry:
    | ((task: Task, opts?: { logHistory?: boolean }) => void)
    | null = null;
  let pressedTaskPrimaryActionEl: HTMLElement | null = null;
  let taskPrimaryActionPressTimer: number | null = null;
  const taskManualEntry = createTaskManualEntryInteraction({
    elements: {
      overlay: els.taskManualEntryOverlay,
      title: els.taskManualEntryTitle as HTMLElement | null,
      meta: els.taskManualEntryMeta as HTMLElement | null,
      dateTimeInput: els.taskManualDateTimeInput,
      dateTimeButton: els.taskManualDateTimeBtn,
      logTimeGoalToggle: els.taskManualLogTimeGoalToggle,
      elapsedField: els.taskManualElapsedField,
      hoursInput: els.taskManualHoursInput,
      minutesInput: els.taskManualMinutesInput,
      noteInput: els.taskManualNoteInput,
      error: els.taskManualEntryError as HTMLElement | null,
    },
    getTaskById: (taskId) => ctx.getTasks().find((entry) => String(entry?.id || "").trim() === taskId) || null,
    getTaskDisplayName,
    historyEntryColorForTaskMs: ctx.historyEntryColorForTaskMs,
    openOverlay: (overlay) => {
      if (overlay) overlay.style.display = "flex";
    },
    closeOverlay: (overlay) => {
      if (overlay) overlay.style.display = "none";
    },
    getHistoryByTaskId: ctx.getHistoryByTaskId,
    setHistoryByTaskId: ctx.setHistoryByTaskId,
    saveHistory: ctx.saveHistory,
    onManualEntrySaved: ({ task, entry, historyByTaskId }) => {
      const completed = completeManualEntryDailyGoalIfReached({
        task,
        historyByTaskId,
        manualEntryTs: Number(entry.ts || 0),
        nowMs: nowMs(),
        weekStarting: ctx.getWeekStarting(),
      });
      if (!completed.completed) return;
      if (task.running) {
        resetTaskStateImmediateForManualEntry?.(task, { logHistory: true });
        completeManualEntryDailyGoalIfReached({
          task,
          historyByTaskId: ctx.getHistoryByTaskId(),
          manualEntryTs: Number(entry.ts || 0),
          nowMs: nowMs(),
          weekStarting: ctx.getWeekStarting(),
        });
      }
      ctx.save();
    },
    syncSharedTaskSummariesForTask: ctx.syncSharedTaskSummariesForTask,
    render: ctx.render,
  });

  function getTaskDisplayName(task: Task | null | undefined) {
    const name = String(task?.name || "").trim();
    return name || "Unnamed task";
  }

  function canUseAdvancedHistory() {
    return ctx.hasEntitlement("advancedHistory");
  }

  function canUseSocialFeatures() {
    return ctx.hasEntitlement("socialFeatures");
  }

  const taskListRenderer = createTaskListRenderer({
    taskListEl: els.taskList,
    documentRef: document,
    getTasks: ctx.getTasks,
    getHistoryByTaskId: ctx.getHistoryByTaskId,
    getWeekStarting: ctx.getWeekStarting,
    getTaskView: ctx.getTaskView,
    getTaskOrderBy: ctx.getTaskOrderBy,
    getTileColumnCount: () => getTaskTimerTileColumnCount(typeof window === "undefined" ? null : window),
    setCurrentTileColumnCount: ctx.setCurrentTileColumnCount,
    getOpenHistoryTaskIds: ctx.getOpenHistoryTaskIds,
    getPinnedHistoryTaskIds: ctx.getPinnedHistoryTaskIds,
    getHistoryViewByTaskId: ctx.getHistoryViewByTaskId,
    pruneInactiveHistoryTasks: ctx.pruneInactiveHistoryTasks,
    syncTaskFlipStatesForVisibleTasks: ctx.syncTaskFlipStatesForVisibleTasks,
    applyTaskFlipDomState: ctx.applyTaskFlipDomState,
    renderHistory: ctx.renderHistory,
    getCurrentAppPage: ctx.getCurrentAppPage,
    renderDashboardWidgets: () => ctx.renderDashboardWidgets(),
    syncTimeGoalModalWithTaskState: ctx.syncTimeGoalModalWithTaskState,
    maybeRestorePendingTimeGoalFlow: ctx.maybeRestorePendingTimeGoalFlow,
    clearTimeoutRef: (timer) => window.clearTimeout(timer),
    requestAnimationFrameRef: (handler) => window.requestAnimationFrame(handler),
    getElapsedMs: ctx.getElapsedMs,
    sortMilestones: ctx.sortMilestones,
    milestoneUnitSec: sharedTasks.milestoneUnitSec,
    milestoneUnitSuffix: sharedTasks.milestoneUnitSuffix,
    checkpointRepeatActiveTaskId: ctx.checkpointRepeatActiveTaskId,
    isCheckpointFlashActive: ctx.isCheckpointFlashActive,
    canUseAdvancedHistory,
    canUseSocialFeatures,
    hasFriends: () => ctx.getGroupsFriendships().length > 0,
    isTaskSharedByOwner: ctx.isTaskSharedByOwner,
    getDynamicColorsEnabled: ctx.getDynamicColorsEnabled,
    getModeColor: ctx.getModeColor,
    fillBackgroundForPct: ctx.fillBackgroundForPct,
    escapeHtml: ctx.escapeHtmlUI,
    formatMainTaskElapsedHtml: ctx.formatMainTaskElapsedHtml,
  });

  function renderTasksPage() {
    taskListRenderer.renderTasksPage();
  }

  const taskTimerLifecycleCommands = createTaskTimerLifecycleCommands({
    clearTaskTimeGoalFlow: ctx.clearTaskTimeGoalFlow,
    flushPendingFocusSessionNoteSave: ctx.flushPendingFocusSessionNoteSave,
    openRewardSessionSegment: ctx.openRewardSessionSegment,
    closeRewardSessionSegment: ctx.closeRewardSessionSegment,
    clearRewardSessionTracker: ctx.clearRewardSessionTracker,
    upsertLiveSession: ctx.upsertLiveSession,
    clearLiveSession: ctx.clearLiveSession,
    finalizeLiveSession: ctx.finalizeLiveSession,
    applyPendingTimeGoalXpForTask: ctx.applyPendingTimeGoalXpForTask,
    getElapsedMs: ctx.getElapsedMs,
    getTaskElapsedMs: ctx.getTaskElapsedMs,
    clearCheckpointBaseline: ctx.clearCheckpointBaseline,
    resetCheckpointAlertTracking: ctx.resetCheckpointAlertTracking,
    setCheckpointAutoResetDirty: ctx.setCheckpointAutoResetDirty,
    clearFocusSessionDraft: ctx.clearFocusSessionDraft,
    getFocusModeTaskId: ctx.getFocusModeTaskId,
    syncFocusSessionNotesInput: ctx.syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion: ctx.syncFocusSessionNotesAccordion,
    getCurrentAppPage: ctx.getCurrentAppPage,
    getWeekStarting: ctx.getWeekStarting,
    getAutoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled,
    openFocusMode: ctx.openFocusMode,
    save: ctx.save,
    render: ctx.render,
    renderDashboardWidgets: ctx.renderDashboardWidgets,
    syncSharedTaskSummariesForTask: ctx.syncSharedTaskSummariesForTask,
  });

  const taskTimerLifecycle = createTaskTimerLifecycle({
    getTasks: ctx.getTasks,
    getHistoryByTaskId: ctx.getHistoryByTaskId,
    getWeekStarting: ctx.getWeekStarting,
    getTaskDisplayName,
    confirm: ctx.confirm,
    closeConfirm: ctx.closeConfirm,
    addTaskAlreadyRunningConfirmClass: () => {
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isTaskAlreadyRunningConfirm");
    },
    removeTaskAlreadyRunningConfirmClass: () => {
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isTaskAlreadyRunningConfirm");
    },
    commands: taskTimerLifecycleCommands,
    nowMs: () => Date.now(),
  });
  const { startTask, stopTask, resetTaskStateImmediate } = taskTimerLifecycle;
  resetTaskStateImmediateForManualEntry = resetTaskStateImmediate;


  function toggleCollapse(i: number) {
    const t = ctx.getTasks()[i];
    if (!t) return;
    t.collapsed = !t.collapsed;
    ctx.save();
    ctx.render();
  }

  function openHistory(i: number) {
    ctx.openHistoryInline(i);
  }

  function archiveTask(index: number) {
    const tasks = ctx.getTasks();
    const task = tasks[index];
    if (!task || task.running) return;
    const taskId = String(task.id || "").trim();
    const shouldCloseFocusMode = String(ctx.getFocusModeTaskId() || "").trim() === taskId;
    ctx.confirm("Archive Task", `Archive "${getTaskDisplayName(task)}"?`, {
      okLabel: "Archive",
      cancelLabel: "Cancel",
      overlayClassName: "isArchiveTaskConfirm",
      onOk: () => {
        const nextTasks = tasks.filter((_, taskIndex) => taskIndex !== index);
        const nextDeletedTaskMeta = {
          ...(ctx.getDeletedTaskMeta() || {}),
          [taskId]: buildTaskStatusMeta(task, "archived", nowMs()),
        };
        ctx.setTasks(nextTasks);
        ctx.setDeletedTaskMeta(nextDeletedTaskMeta);
        ctx.saveDeletedMeta(nextDeletedTaskMeta);
        ctx.save({ deletedTaskIds: taskId ? [taskId] : [] });
        void ctx.deleteSharedTaskSummariesForTask(String(ctx.getCurrentUid() || ""), taskId).catch(() => {});
        void ctx.refreshOwnSharedSummaries().catch(() => {});
        if (shouldCloseFocusMode) ctx.closeFocusMode();
        renderTasksPage();
        ctx.render();
        ctx.closeConfirm();
        ctx.showActionConfirmation("Task archived.");
      },
      onCancel: () => ctx.closeConfirm(),
    });
  }

  const taskDestructiveActionEffects = createTaskDestructiveActionEffects({
    getTasks: ctx.getTasks,
    setTasks: ctx.setTasks,
    getHistoryByTaskId: () => ctx.getHistoryByTaskId() as Record<string, unknown[]>,
    getRewardProgress: ctx.getRewardProgress,
    getWeekStarting: ctx.getWeekStarting,
    getTaskElapsedMs: ctx.getTaskElapsedMs,
    setHistoryByTaskId: (history) => ctx.setHistoryByTaskId(history as any),
    setDeletedTaskMeta: ctx.setDeletedTaskMeta,
    currentUid: ctx.currentUid,
    getFocusModeTaskId: ctx.getFocusModeTaskId,
    confirm: ctx.confirm,
    closeConfirm: ctx.closeConfirm,
    getConfirmDeleteAllChecked: () => !!els.confirmDeleteAll?.checked,
    addConfirmOverlayClass: (className) => {
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add(className);
    },
    removeConfirmOverlayClass: (className) => {
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove(className);
    },
    setResetTaskConfirmBusy: ctx.setResetTaskConfirmBusy,
    captureResetActionSessionNote: ctx.captureResetActionSessionNote,
    setFocusSessionDraft: ctx.setFocusSessionDraft,
    resetTaskStateImmediate,
    save: ctx.save,
    saveHistory: (history, opts) => ctx.saveHistory(history as any, opts),
    saveDeletedMeta: ctx.saveDeletedMeta,
    render: ctx.render,
    renderDashboardWidgets: ctx.renderDashboardWidgets,
    closeFocusMode: ctx.closeFocusMode,
    navigateToAppRoute: ctx.navigateToAppRoute,
    deleteSharedTaskSummariesForTask: ctx.deleteSharedTaskSummariesForTask,
    refreshOwnSharedSummaries: ctx.refreshOwnSharedSummaries,
    syncSharedTaskSummariesForTasks: ctx.syncSharedTaskSummariesForTasks,
  });

  const taskCardActionEffects = createTaskCardActionEffects({
    getTasks: ctx.getTasks,
    canUseAdvancedHistory,
    canUseSocialFeatures,
    showUpgradePrompt: ctx.showUpgradePrompt,
    startTask,
    stopTask,
    rewindCheckpoint,
    fastForwardCheckpoint,
    resetTask: taskDestructiveActionEffects.resetTask,
    resetCompletedTaskImmediate: taskDestructiveActionEffects.resetCompletedTaskImmediate,
    archiveTask,
    deleteTask: ctx.deleteTask,
    openEdit: ctx.openEdit,
    openHistory,
    getPinnedHistoryTaskIds: ctx.getPinnedHistoryTaskIds,
    openFocusMode: ctx.openFocusMode,
    toggleCollapse,
    openTaskExportModal: ctx.openTaskExportModal,
    openManualEntry: (taskId) => taskManualEntry.open(taskId),
    openShareTaskModal: ctx.openShareTaskModal,
    confirm: ctx.confirm,
    currentUid: ctx.currentUid,
    closeConfirm: ctx.closeConfirm,
    deleteSharedTaskSummariesForTask: ctx.deleteSharedTaskSummariesForTask,
    refreshOwnSharedSummaries: ctx.refreshOwnSharedSummaries,
    getCurrentAppPage: ctx.getCurrentAppPage,
    refreshGroupsData: () => ctx.refreshGroupsData(),
    render: ctx.render,
    broadcastCheckpointAlertMute: ctx.broadcastCheckpointAlertMute,
    stopCheckpointRepeatAlert: ctx.stopCheckpointRepeatAlert,
    setTimeoutRef: (handler, timeout) => window.setTimeout(handler, timeout),
  });

  function clearTaskPrimaryActionPressTimer() {
    if (!taskPrimaryActionPressTimer) return;
    window.clearTimeout(taskPrimaryActionPressTimer);
    taskPrimaryActionPressTimer = null;
  }

  function getTaskElementForTarget(target: HTMLElement | null | undefined) {
    return target?.closest?.(".task") as HTMLElement | null;
  }

  function getTaskIndexFromTaskElement(taskEl: HTMLElement | null) {
    const index = Number.parseInt(String(taskEl?.dataset?.index || ""), 10);
    return Number.isFinite(index) ? index : -1;
  }

  function getTaskIdFromTaskElement(taskEl: HTMLElement | null) {
    return String(taskEl?.dataset?.taskId || "").trim();
  }

  function getPreviousCheckpointRewindTargetForIndex(index: number) {
    const task = ctx.getTasks()[index];
    if (!task || task.running) return null;
    return getPreviousCheckpointRewindTargetMs(
      task,
      ctx.getElapsedMs(task),
      ctx.sortMilestones,
      sharedTasks.milestoneUnitSec
    );
  }

  function getNextCheckpointFastForwardTargetForIndex(index: number) {
    const task = ctx.getTasks()[index];
    if (!task || task.running) return null;
    return getNextCheckpointFastForwardTargetMs(
      task,
      ctx.getElapsedMs(task),
      ctx.sortMilestones,
      sharedTasks.milestoneUnitSec
    );
  }

  function updateLatestSameDayHistoryForCheckpointRewind(task: Task, targetMs: number) {
    const nextHistory = updateLatestSameDayHistoryElapsed(ctx.getHistoryByTaskId(), task, targetMs);
    if (!nextHistory) return;
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory, { allowDestructiveReplace: true });
  }

  function rewindCheckpoint(index: number) {
    const task = ctx.getTasks()[index];
    if (!task || task.running) return;
    const taskId = String(task.id || "").trim();
    const targetMs = getPreviousCheckpointRewindTargetForIndex(index);
    if (!taskId || targetMs == null) {
      ctx.render();
      return;
    }
    task.accumulatedMs = targetMs;
    task.elapsed = targetMs;
    task.startMs = null;
    task.running = false;
    task.hasStarted = true;
    pruneCheckpointFiredKeysAfterTarget(
      task,
      targetMs,
      ctx.getCheckpointFiredKeysByTaskId(),
      ctx.sortMilestones,
      sharedTasks.milestoneUnitSec
    );
    ctx.getCheckpointBaselineSecByTaskId()[taskId] = Math.floor(targetMs / 1000);
    updateLatestSameDayHistoryForCheckpointRewind(task, targetMs);
    ctx.save({ forceCloudFlush: true });
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    ctx.render();
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

  function fastForwardCheckpoint(index: number) {
    const task = ctx.getTasks()[index];
    if (!task || task.running) return;
    const taskId = String(task.id || "").trim();
    const targetMs = getNextCheckpointFastForwardTargetForIndex(index);
    if (!taskId || targetMs == null) {
      ctx.render();
      return;
    }
    task.accumulatedMs = targetMs;
    task.elapsed = targetMs;
    task.startMs = null;
    task.running = false;
    task.hasStarted = true;
    markCheckpointFiredKeysThroughTarget(
      task,
      targetMs,
      ctx.getCheckpointFiredKeysByTaskId(),
      ctx.sortMilestones,
      sharedTasks.milestoneUnitSec
    );
    ctx.getCheckpointBaselineSecByTaskId()[taskId] = Math.floor(targetMs / 1000);
    updateLatestSameDayHistoryForCheckpointRewind(task, targetMs);
    ctx.save({ forceCloudFlush: true });
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    ctx.render();
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

  function getTaskPrimaryActionPressTarget(eventTarget: EventTarget | null | undefined) {
    const target = findDelegatedElement(eventTarget || null, ".taskPrimaryAction") as HTMLButtonElement | null;
    if (!target || target.disabled) return null;
    return target;
  }

  function releaseTaskPrimaryActionPress(delayMs = TASK_PRIMARY_ACTION_PRESS_MS) {
    const target = pressedTaskPrimaryActionEl;
    if (!target) return;
    clearTaskPrimaryActionPressTimer();
    taskPrimaryActionPressTimer = window.setTimeout(() => {
      target.classList.remove(TASK_PRIMARY_ACTION_PRESS_CLASS);
      if (pressedTaskPrimaryActionEl === target) pressedTaskPrimaryActionEl = null;
      taskPrimaryActionPressTimer = null;
    }, delayMs);
  }

  function pressTaskPrimaryAction(target: HTMLElement) {
    if (pressedTaskPrimaryActionEl && pressedTaskPrimaryActionEl !== target) {
      pressedTaskPrimaryActionEl.classList.remove(TASK_PRIMARY_ACTION_PRESS_CLASS);
    }
    clearTaskPrimaryActionPressTimer();
    pressedTaskPrimaryActionEl = target;
    target.classList.add(TASK_PRIMARY_ACTION_PRESS_CLASS);
  }

  function handleTaskPrimaryActionPressStart(event: any) {
    const target = getTaskPrimaryActionPressTarget(event?.target);
    if (!target) return;
    pressTaskPrimaryAction(target);
  }

  function handleTaskPrimaryActionKeyDown(event: any) {
    if (event?.key !== " " && event?.key !== "Enter") return;
    if (event?.repeat) return;
    handleTaskPrimaryActionPressStart(event);
  }

  function handleTaskPrimaryActionPressEnd() {
    releaseTaskPrimaryActionPress();
  }

  function handleTaskListClick(e: any) {
    const taskEl = e.target?.closest?.(".task");
    if (!taskEl) return;
    const i = parseInt(taskEl.dataset.index, 10);
    if (!Number.isFinite(i)) return;
    const taskId = String(taskEl.dataset.taskId || "").trim();
    const flipBtn = findDelegatedElement(e.target, "[data-task-flip]");
    if (flipBtn && taskId) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      ctx.setTaskFlipped(taskId, flipBtn.getAttribute("data-task-flip") === "open", taskEl as HTMLElement);
      return;
    }
    const delegatedAction = getDelegatedAction(e.target, "data-action");
    if (!delegatedAction) {
      const inTopRow = !!findDelegatedElement(e.target, ".row");
      const inActions = !!findDelegatedElement(e.target, ".actions");
      if (inTopRow && !inActions) ctx.openFocusMode(i, { sourceElement: taskEl as HTMLElement });
      return;
    }
    const { action, element } = delegatedAction;
    taskCardActionEffects.handleAction({
      action,
      taskIndex: i,
      taskId,
      sourceElement: element as HTMLElement,
    });
  }

  function registerTaskEvents() {
    ctx.on(els.taskList, "pointerdown", handleTaskPrimaryActionPressStart);
    ctx.on(els.taskList, "pointerup", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "pointercancel", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "pointerleave", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "keydown", handleTaskPrimaryActionKeyDown);
    ctx.on(els.taskList, "keyup", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "focusout", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "click", handleTaskListClick);
    ctx.on(els.resetAllBtn, "click", (e: any) => {
      e?.preventDefault?.();
      taskDestructiveActionEffects.resetAll();
    });
    ctx.on(els.taskManualEntryOverlay, "click", (ev: any) => {
      if (ev.target !== els.taskManualEntryOverlay) return;
      taskManualEntry.close();
    });
    ctx.on(els.taskManualEntryCancelBtn, "click", () => {
      taskManualEntry.close();
    });
    ctx.on(els.taskManualEntrySaveBtn, "click", () => {
      taskManualEntry.save();
    });
    ctx.on(els.taskManualDateTimeBtn, "click", () => {
      taskManualEntry.openDateTimePicker();
    });
    ctx.on(els.taskManualDateTimeInput, "change", () => {
      const value = String(els.taskManualDateTimeInput?.value || "");
      taskManualEntry.setDateTimeValue(value);
    });
    ctx.on(els.taskManualLogTimeGoalToggle, "click", () => {
      const enabled = els.taskManualLogTimeGoalToggle?.getAttribute("aria-checked") !== "true";
      taskManualEntry.setLogTimeGoalEnabled(enabled);
    });
    ctx.on(els.taskManualHoursInput, "input", () => {
      const value = String(els.taskManualHoursInput?.value || "");
      taskManualEntry.setHoursValue(value);
    });
    ctx.on(els.taskManualMinutesInput, "input", () => {
      const value = String(els.taskManualMinutesInput?.value || "");
      taskManualEntry.setMinutesValue(value);
    });
    ctx.on(els.taskManualNoteInput, "input", () => {
      const value = getRichNoteEditorValue(els.taskManualNoteInput as HTMLElement | null);
      taskManualEntry.setNoteValue(value);
    });
  }

  return {
    renderTasksPage,
    startTask,
    stopTask,
    resetTask: taskDestructiveActionEffects.resetTask,
    resetAll: taskDestructiveActionEffects.resetAll,
    resetTaskStateImmediate,
    openHistory,
    registerTaskEvents,
  };
}
