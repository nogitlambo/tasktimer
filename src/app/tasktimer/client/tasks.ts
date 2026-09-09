import { buildTaskStatusMeta, type Task } from "../lib/types";
import { nowMs } from "../lib/time";
import {
  clearTaskMarkedDone,
  isTaskMarkedDone,
  markTaskDone,
  snoozeTaskForToday,
} from "../lib/taskManualCompletion";
import type { TaskTimerTasksContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import { createTaskCardActionEffects } from "./task-card-action-effects";
import {
  dispatchTaskClarificationOpenEvent,
  TASKTIMER_START_TASK_BY_ID_EVENT,
  type TaskClarificationStartTaskDetail,
} from "./task-clarification-events";
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
const TASK_PRIMARY_ACTION_HOLD_MS = 600;
const ARCHIVE_TASK_CONFIRM_TEXT =
  "Archiving a task removes it from your active tasks while preserving history. You can restore or permanently delete an archived task and associated history from History Manager. [under Settings > Data]";
const ARCHIVE_TASK_CONFIRM_TEXT_HTML =
  'Archiving a task removes it from your active tasks while preserving history. You can restore or permanently delete an archived task and associated history from <a href="/history-manager">History Manager</a>.<br><span class="confirmTextNote">[under Settings &gt; Data]</span>';

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  let resetTaskStateImmediateForManualEntry:
    | ((task: Task, opts?: { logHistory?: boolean }) => void)
    | null = null;
  let pressedTaskPrimaryActionEl: HTMLElement | null = null;
  let taskPrimaryActionHoldTimer: number | null = null;
  let taskPrimaryActionReleaseTimer: number | null = null;
  let openTaskPrimaryHoldMenuEl: HTMLElement | null = null;
  let openTaskPrimaryHoldButtonEl: HTMLButtonElement | null = null;
  let openTaskPrimaryHoldTaskId: string | null = null;
  let suppressNextTaskPrimaryClick = false;
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
      ctx.save({ forceCloudFlush: true });
      ctx.notifyTaskCompletionChanged?.(String(task.id || ""));
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

  function canUseExecutiveFunction() {
    return ctx.hasEntitlement("executiveFunction");
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
    canUseExecutiveFunction,
    getExecutiveFunctionUnavailableMessage: ctx.getExecutiveFunctionUnavailableMessage,
    canUseSocialFeatures,
    hasFriends: () => ctx.getGroupsFriendships().length > 0,
    isTaskSharedByOwner: ctx.isTaskSharedByOwner,
    getDynamicColorsEnabled: ctx.getDynamicColorsEnabled,
    getFullColorTaskCardsEnabled: ctx.getFullColorTaskCardsEnabled,
    getModeColor: ctx.getModeColor,
    fillBackgroundForPct: ctx.fillBackgroundForPct,
    escapeHtml: ctx.escapeHtmlUI,
    formatMainTaskElapsedHtml: ctx.formatMainTaskElapsedHtml,
  });

  function renderTasksPage() {
    taskListRenderer.renderTasksPage();
    restoreTaskPrimaryHoldMenuAfterRender();
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
    getCheckpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled,
    getCheckpointAlertVibrationEnabled: ctx.getCheckpointAlertVibrationEnabled,
    getCheckpointAlertSoundMode: ctx.getCheckpointAlertSoundMode,
    openFocusMode: ctx.openFocusMode,
    save: ctx.save,
    notifyTaskCompletionChanged: ctx.notifyTaskCompletionChanged,
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
    ctx.confirm(
      "Archive Task",
      ARCHIVE_TASK_CONFIRM_TEXT,
      {
        okLabel: "Archive",
        cancelLabel: "Cancel",
        overlayClassName: "isArchiveTaskConfirm",
        textHtml: ARCHIVE_TASK_CONFIRM_TEXT_HTML,
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
      }
    );
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
    canUseExecutiveFunction,
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
    openTaskClarification: (index) => {
      const task = ctx.getTasks()[index];
      if (!task || task.sharedSourceOwnerUid) return;
      dispatchTaskClarificationOpenEvent({
        taskId: String(task.id || ""),
        title: String(task.name || ""),
        taskType: task.taskType,
        dueDate: task.onceOffTargetDate,
      });
    },
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
    if (taskPrimaryActionHoldTimer) window.clearTimeout(taskPrimaryActionHoldTimer);
    if (taskPrimaryActionReleaseTimer) window.clearTimeout(taskPrimaryActionReleaseTimer);
    taskPrimaryActionHoldTimer = null;
    taskPrimaryActionReleaseTimer = null;
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

  function closeTaskPrimaryHoldMenu({ restoreFocus = false } = {}) {
    const menu = openTaskPrimaryHoldMenuEl;
    const button = openTaskPrimaryHoldButtonEl;
    if (!menu && !button && !openTaskPrimaryHoldTaskId) return;
    if (menu) {
      menu.hidden = true;
      menu.closest?.(".task")?.classList.remove("isTaskPrimaryHoldMenuOpen");
    }
    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.classList.remove(TASK_PRIMARY_ACTION_PRESS_CLASS);
      if (pressedTaskPrimaryActionEl === button) pressedTaskPrimaryActionEl = null;
    }
    if (taskPrimaryActionReleaseTimer) window.clearTimeout(taskPrimaryActionReleaseTimer);
    taskPrimaryActionReleaseTimer = null;
    openTaskPrimaryHoldMenuEl = null;
    openTaskPrimaryHoldButtonEl = null;
    openTaskPrimaryHoldTaskId = null;
    if (restoreFocus) button?.focus?.();
  }

  function restoreTaskPrimaryHoldMenuAfterRender() {
    const taskId = openTaskPrimaryHoldTaskId;
    const taskList = els.taskList as HTMLElement | null;
    if (!taskId || !taskList) return;
    const taskEl = Array.from(taskList.querySelectorAll<HTMLElement>(".task"))
      .find((candidate) => String(candidate.dataset.taskId || "").trim() === taskId) || null;
    const menu = taskEl?.querySelector<HTMLElement>(".taskPrimaryHoldMenu") || null;
    const button = taskEl?.querySelector<HTMLButtonElement>(".taskPrimaryAction") || null;
    if (!taskEl || !menu || !button) {
      closeTaskPrimaryHoldMenu();
      return;
    }
    openTaskPrimaryHoldMenuEl = menu;
    openTaskPrimaryHoldButtonEl = button;
    menu.hidden = false;
    taskEl.classList.add("isTaskPrimaryHoldMenuOpen");
    button.classList.add(TASK_PRIMARY_ACTION_PRESS_CLASS);
    button.setAttribute("aria-expanded", "true");
  }

  function openTaskPrimaryHoldMenu(target: HTMLButtonElement) {
    const taskEl = getTaskElementForTarget(target);
    const menu = taskEl?.querySelector?.(".taskPrimaryHoldMenu") as HTMLElement | null;
    if (!taskEl || !menu) return;
    closeTaskPrimaryHoldMenu();
    openTaskPrimaryHoldMenuEl = menu;
    openTaskPrimaryHoldButtonEl = target;
    openTaskPrimaryHoldTaskId = getTaskIdFromTaskElement(taskEl);
    suppressNextTaskPrimaryClick = true;
    menu.hidden = false;
    taskEl.classList.add("isTaskPrimaryHoldMenuOpen");
    target.setAttribute("aria-expanded", "true");
    const firstEnabledItem = menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    firstEnabledItem?.focus?.();
  }

  function releaseTaskPrimaryActionPress(delayMs = TASK_PRIMARY_ACTION_PRESS_MS) {
    const target = pressedTaskPrimaryActionEl;
    if (!target) return;
    if (taskPrimaryActionHoldTimer) window.clearTimeout(taskPrimaryActionHoldTimer);
    taskPrimaryActionHoldTimer = null;
    if (taskPrimaryActionReleaseTimer) window.clearTimeout(taskPrimaryActionReleaseTimer);
    taskPrimaryActionReleaseTimer = window.setTimeout(() => {
      target.classList.remove(TASK_PRIMARY_ACTION_PRESS_CLASS);
      if (pressedTaskPrimaryActionEl === target) pressedTaskPrimaryActionEl = null;
      taskPrimaryActionReleaseTimer = null;
    }, delayMs);
  }

  function pressTaskPrimaryAction(target: HTMLButtonElement) {
    if (pressedTaskPrimaryActionEl && pressedTaskPrimaryActionEl !== target) {
      pressedTaskPrimaryActionEl.classList.remove(TASK_PRIMARY_ACTION_PRESS_CLASS);
    }
    clearTaskPrimaryActionPressTimer();
    pressedTaskPrimaryActionEl = target;
    target.classList.add(TASK_PRIMARY_ACTION_PRESS_CLASS);
    taskPrimaryActionHoldTimer = window.setTimeout(() => {
      taskPrimaryActionHoldTimer = null;
      openTaskPrimaryHoldMenu(target);
    }, TASK_PRIMARY_ACTION_HOLD_MS);
  }

  function handleTaskPrimaryActionPressStart(event: any) {
    const target = getTaskPrimaryActionPressTarget(event?.target);
    if (!target) return;
    pressTaskPrimaryAction(target);
  }

  function handleTaskPrimaryActionKeyDown(event: any) {
    if (event?.key !== " " && event?.key !== "Enter") return;
    if (event?.repeat) return;
    const target = getTaskPrimaryActionPressTarget(event?.target);
    if (!target) return;
    event?.preventDefault?.();
    suppressNextTaskPrimaryClick = false;
    pressTaskPrimaryAction(target);
  }

  function handleTaskPrimaryActionPressEnd() {
    if (openTaskPrimaryHoldButtonEl && pressedTaskPrimaryActionEl === openTaskPrimaryHoldButtonEl) return;
    releaseTaskPrimaryActionPress();
  }

  function handleTaskPrimaryActionContextMenu(event: any) {
    const primaryAction = getTaskPrimaryActionPressTarget(event?.target);
    if (!primaryAction && !openTaskPrimaryHoldMenuEl) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
  }

  function handleTaskPrimaryActionKeyUp(event: any) {
    if (event?.key !== " " && event?.key !== "Enter") return;
    const target = getTaskPrimaryActionPressTarget(event?.target);
    if (!target || pressedTaskPrimaryActionEl !== target) return;
    event?.preventDefault?.();
    const holdMenuOpened = openTaskPrimaryHoldButtonEl === target;
    releaseTaskPrimaryActionPress();
    if (!holdMenuOpened) target.click?.();
  }

  function handleDocumentTaskPrimaryHoldPointerDown(event: any) {
    if (!openTaskPrimaryHoldMenuEl) return;
    const target = event?.target as Node | null;
    if (target && (openTaskPrimaryHoldMenuEl.contains(target) || openTaskPrimaryHoldButtonEl?.contains(target))) return;
    closeTaskPrimaryHoldMenu();
    suppressNextTaskPrimaryClick = false;
  }

  function handleDocumentTaskPrimaryHoldKeyDown(event: any) {
    if (event?.key !== "Escape" || !openTaskPrimaryHoldMenuEl) return;
    event?.preventDefault?.();
    suppressNextTaskPrimaryClick = false;
    closeTaskPrimaryHoldMenu({ restoreFocus: true });
  }

  function resetManuallyDoneTask(task: Task) {
    const taskId = String(task.id || "").trim();
    clearTaskMarkedDone(task);
    resetTaskStateImmediate(task, { logHistory: false });
    ctx.save({ forceCloudFlush: true });
    if (taskId) void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    ctx.render();
    ctx.showActionConfirmation("Task reset");
  }

  function markTaskAsDone(task: Task) {
    if (isTaskMarkedDone(task)) return;
    const taskId = String(task.id || "").trim();
    const elapsedMs = Math.max(0, Math.floor(Number(ctx.getTaskElapsedMs(task)) || 0));
    const sessionNote = taskId ? ctx.captureResetActionSessionNote(taskId) : "";
    if (sessionNote && taskId) ctx.setFocusSessionDraft(taskId, sessionNote);
    resetTaskStateImmediate(task, { logHistory: elapsedMs > 0, sessionNote });
    markTaskDone(task);
    ctx.save({ forceCloudFlush: true });
    if (taskId) {
      void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
      ctx.notifyTaskCompletionChanged?.(taskId);
    }
    ctx.render();
    ctx.showActionConfirmation("Task marked done");
  }

  function snoozeTask(task: Task) {
    snoozeTaskForToday(task);
    ctx.save({ forceCloudFlush: true });
    ctx.render();
    ctx.showActionConfirmation("Snoozed until tomorrow");
  }

  function handleTaskPrimaryHoldAction(action: string, taskIndex: number) {
    const task = ctx.getTasks()[taskIndex];
    if (!task) return;
    closeTaskPrimaryHoldMenu();
    suppressNextTaskPrimaryClick = false;
    if (action === "done") {
      markTaskAsDone(task);
      return;
    }
    if (action === "snooze") {
      snoozeTask(task);
      return;
    }
    if (action !== "reset") return;
    if (isTaskMarkedDone(task)) {
      resetManuallyDoneTask(task);
      return;
    }
    taskDestructiveActionEffects.resetTask(taskIndex);
  }

  function handleTaskListClick(e: any) {
    const taskEl = e.target?.closest?.(".task");
    if (!taskEl) return;
    const i = getTaskIndexFromTaskElement(taskEl);
    if (i < 0) return;
    const taskId = getTaskIdFromTaskElement(taskEl);
    const holdAction = findDelegatedElement(e.target, "[data-hold-action]");
    if (holdAction) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      handleTaskPrimaryHoldAction(String(holdAction.getAttribute("data-hold-action") || ""), i);
      return;
    }
    if (findDelegatedElement(e.target, ".taskPrimaryHoldMenu")) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }
    if (openTaskPrimaryHoldMenuEl) {
      suppressNextTaskPrimaryClick = false;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }
    const primaryAction = findDelegatedElement(e.target, ".taskPrimaryAction") as HTMLButtonElement | null;
    if (primaryAction && suppressNextTaskPrimaryClick) {
      suppressNextTaskPrimaryClick = false;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }
    if (primaryAction?.getAttribute("aria-disabled") === "true") {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }
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
    ctx.on(window, TASKTIMER_START_TASK_BY_ID_EVENT, (event: Event) => {
      const taskId = String((event as CustomEvent<TaskClarificationStartTaskDetail>).detail?.taskId || "").trim();
      if (!taskId) return;
      const taskIndex = ctx.getTasks().findIndex((task) => String(task.id || "") === taskId);
      if (taskIndex < 0) return;
      taskCardActionEffects.handleAction({ action: "start", taskIndex, taskId });
    });
    ctx.on(els.taskList, "pointerdown", handleTaskPrimaryActionPressStart);
    ctx.on(els.taskList, "pointerup", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "pointercancel", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "pointerleave", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "contextmenu", handleTaskPrimaryActionContextMenu);
    ctx.on(els.taskList, "keydown", handleTaskPrimaryActionKeyDown);
    ctx.on(els.taskList, "keyup", handleTaskPrimaryActionKeyUp);
    ctx.on(els.taskList, "focusout", handleTaskPrimaryActionPressEnd);
    ctx.on(els.taskList, "click", handleTaskListClick);
    ctx.on(document, "pointerdown", handleDocumentTaskPrimaryHoldPointerDown);
    ctx.on(document, "keydown", handleDocumentTaskPrimaryHoldKeyDown);
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
