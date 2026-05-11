import { buildTaskStatusMeta, type Task } from "../lib/types";
import { nowMs } from "../lib/time";
import type { TaskTimerTasksContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import { createTaskCardActionEffects } from "./task-card-action-effects";
import { createTaskDestructiveActionEffects } from "./task-destructive-action-effects";
import { createTaskListRenderer } from "./task-list-renderer";
import { createTaskManualEntryInteraction } from "./task-manual-entry-interaction";
import { createTaskTimerLifecycle, createTaskTimerLifecycleCommands } from "./task-timer-lifecycle";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  const taskManualEntry = createTaskManualEntryInteraction({
    elements: {
      overlay: els.taskManualEntryOverlay,
      title: els.taskManualEntryTitle as HTMLElement | null,
      meta: els.taskManualEntryMeta as HTMLElement | null,
      dateTimeInput: els.taskManualDateTimeInput,
      dateTimeButton: els.taskManualDateTimeBtn,
      hoursInput: els.taskManualHoursInput,
      minutesInput: els.taskManualMinutesInput,
      difficultyGroup: els.taskManualEntryDifficultyGroup as HTMLElement | null,
      noteInput: els.taskManualNoteInput,
      error: els.taskManualEntryError as HTMLElement | null,
    },
    getTaskById: (taskId) => ctx.getTasks().find((entry) => String(entry?.id || "").trim() === taskId) || null,
    getTaskDisplayName,
    openOverlay: (overlay) => {
      if (overlay) overlay.style.display = "flex";
    },
    closeOverlay: (overlay) => {
      if (overlay) overlay.style.display = "none";
    },
    getHistoryByTaskId: ctx.getHistoryByTaskId,
    setHistoryByTaskId: ctx.setHistoryByTaskId,
    saveHistory: ctx.saveHistory,
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

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1500px)").matches) return 4;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  const taskListRenderer = createTaskListRenderer({
    taskListEl: els.taskList,
    documentRef: document,
    getTasks: ctx.getTasks,
    getTaskView: ctx.getTaskView,
    getTaskOrderBy: ctx.getTaskOrderBy,
    getTileColumnCount,
    setCurrentTileColumnCount: ctx.setCurrentTileColumnCount,
    getOpenHistoryTaskIds: ctx.getOpenHistoryTaskIds,
    getPinnedHistoryTaskIds: ctx.getPinnedHistoryTaskIds,
    getHistoryViewByTaskId: ctx.getHistoryViewByTaskId,
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
    activeCheckpointToastTaskId: ctx.activeCheckpointToastTaskId,
    canUseAdvancedHistory,
    canUseSocialFeatures,
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
    finalizeLiveSession: ctx.finalizeLiveSession,
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
    getAutoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled,
    openFocusMode: ctx.openFocusMode,
    save: ctx.save,
    render: ctx.render,
    renderDashboardWidgets: ctx.renderDashboardWidgets,
    syncSharedTaskSummariesForTask: ctx.syncSharedTaskSummariesForTask,
  });

  const taskTimerLifecycle = createTaskTimerLifecycle({
    getTasks: ctx.getTasks,
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
    resetTask: taskDestructiveActionEffects.resetTask,
    archiveTask,
    deleteTask: ctx.deleteTask,
    openEdit: ctx.openEdit,
    openHistory,
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

  function handleTaskListClick(e: any) {
    const emptyAddBtn = findDelegatedElement(e.target, ".taskListEmptyAddBtn");
    if (emptyAddBtn) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      els.openAddTaskBtn?.click();
      return;
    }

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
      if (inTopRow && !inActions) ctx.openFocusMode(i);
      return;
    }
    const { action, element } = delegatedAction;
    taskCardActionEffects.handleAction({
      action,
      taskIndex: i,
      taskId,
      sourceElement: element as HTMLElement,
    });
    if (taskId) ctx.setTaskFlipped(taskId, false, taskEl as HTMLElement);
  }

  function registerTaskEvents() {
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
    ctx.on(els.taskManualHoursInput, "input", () => {
      const value = String(els.taskManualHoursInput?.value || "");
      taskManualEntry.setHoursValue(value);
    });
    ctx.on(els.taskManualMinutesInput, "input", () => {
      const value = String(els.taskManualMinutesInput?.value || "");
      taskManualEntry.setMinutesValue(value);
    });
    ctx.on(els.taskManualNoteInput, "input", () => {
      const value = String(els.taskManualNoteInput?.value || "");
      taskManualEntry.setNoteValue(value);
    });
    ctx.on(els.taskManualEntryDifficultyGroup, "click", (ev: any) => {
      const btn = ev.target?.closest?.("[data-completion-difficulty]");
      if (!btn) return;
      const value = String(btn.getAttribute("data-completion-difficulty") || "");
      taskManualEntry.selectDifficulty(value);
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
