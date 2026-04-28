import type { DeletedTaskMeta, Task } from "../lib/types";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import { getTaskScheduledDayEntries } from "../lib/schedule-placement";
import { createDefaultHistoryManagerManualDraft, parseHistoryManagerManualDraft, type HistoryManagerManualDraft } from "./history-manager-shared";
import type { TaskTimerTasksContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import { buildTaskProgressModel, renderTaskProgressHtml } from "./task-card-view-model";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  let taskManualEntryDraft: HistoryManagerManualDraft | null = null;
  let activeTaskManualEntryTaskId: string | null = null;

  function syncTaskManualEntryOverlay() {
    const draft = taskManualEntryDraft || createDefaultHistoryManagerManualDraft(Date.now());
    if (els.taskManualDateTimeInput) els.taskManualDateTimeInput.value = draft.dateTimeValue || "";
    els.taskManualDateTimeInput?.parentElement?.setAttribute("data-empty", draft.dateTimeValue ? "false" : "true");
    if (els.taskManualHoursInput) els.taskManualHoursInput.value = draft.hoursValue || "";
    if (els.taskManualMinutesInput) els.taskManualMinutesInput.value = draft.minutesValue || "";
    if (els.taskManualNoteInput) els.taskManualNoteInput.value = draft.noteValue || "";
    const sentimentButtons = Array.from(
      ((els.taskManualEntryDifficultyGroup as HTMLElement | null)?.querySelectorAll?.("[data-completion-difficulty]") || []) as Iterable<Element>
    );
    sentimentButtons.forEach((button) => {
      const selected =
        normalizeCompletionDifficulty((button as HTMLElement).dataset.completionDifficulty) ===
        normalizeCompletionDifficulty(draft.completionDifficulty);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
    if (els.taskManualEntryError) {
      els.taskManualEntryError.textContent = draft.errorMessage || "";
      (els.taskManualEntryError as HTMLElement).style.display = draft.errorMessage ? "block" : "none";
    }
  }

  function closeTaskManualEntryOverlay() {
    activeTaskManualEntryTaskId = null;
    taskManualEntryDraft = null;
    if (els.taskManualEntryOverlay) {
      els.taskManualEntryOverlay.style.display = "none";
      els.taskManualEntryOverlay.setAttribute("aria-hidden", "true");
    }
  }

  function openTaskManualEntryDateTimePicker() {
    const input = els.taskManualDateTimeInput;
    if (!input) return;
    try {
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
        (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      } else {
        input.focus();
        input.click();
      }
    } catch {
      try {
        input.focus();
        input.click();
      } catch {
        input.focus();
      }
    }
  }

  function openTaskManualEntryOverlay(taskId: string) {
    const normalizedTaskId = String(taskId || "").trim();
    const task = ctx.getTasks().find((entry) => String(entry?.id || "").trim() === normalizedTaskId) || null;
    if (!task) return;
    activeTaskManualEntryTaskId = normalizedTaskId;
    taskManualEntryDraft = createDefaultHistoryManagerManualDraft(Date.now());
    if (els.taskManualEntryTitle) {
      els.taskManualEntryTitle.textContent = `Add Manual Entry for ${getTaskDisplayName(task)}`;
    }
    if (els.taskManualEntryMeta) {
      els.taskManualEntryMeta.textContent = "";
      (els.taskManualEntryMeta as HTMLElement).hidden = true;
    }
    syncTaskManualEntryOverlay();
    if (els.taskManualEntryOverlay) {
      els.taskManualEntryOverlay.style.display = "flex";
      els.taskManualEntryOverlay.setAttribute("aria-hidden", "false");
    }
    window.setTimeout(() => {
      try {
        els.taskManualDateTimeBtn?.focus({ preventScroll: true });
      } catch {
        els.taskManualDateTimeBtn?.focus();
      }
    }, 0);
  }

  function updateTaskManualEntryDraft(updater: (draft: HistoryManagerManualDraft) => HistoryManagerManualDraft) {
    const currentDraft = taskManualEntryDraft || createDefaultHistoryManagerManualDraft(Date.now());
    taskManualEntryDraft = updater(currentDraft);
  }

  function saveTaskManualEntryDraft() {
    const taskId = String(activeTaskManualEntryTaskId || "").trim();
    if (!taskId) return;
    const task = ctx.getTasks().find((entry) => String(entry?.id || "").trim() === taskId) || null;
    if (!task) return;
    const draft = taskManualEntryDraft;
    if (!draft) return;
    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: getTaskDisplayName(task),
      taskColor: typeof (task as { color?: unknown }).color === "string" ? String((task as { color?: unknown }).color || "") : null,
    });
    if ("error" in parsed) {
      updateTaskManualEntryDraft((currentDraft) => ({ ...currentDraft, errorMessage: parsed.error || "Could not save entry." }));
      syncTaskManualEntryOverlay();
      return;
    }
    const historyByTaskId = ctx.getHistoryByTaskId();
    const nextTaskHistory = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId].slice() : [];
    nextTaskHistory.push(parsed.entry);
    const nextHistory = { ...historyByTaskId, [taskId]: nextTaskHistory };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    closeTaskManualEntryOverlay();
    ctx.render();
  }

  function getTaskDisplayName(task: Task | null | undefined) {
    const name = String(task?.name || "").trim();
    return name || "Unnamed task";
  }

  function findOtherRunningTaskIndex(targetIndex: number) {
    return ctx.getTasks().findIndex((task, index) => index !== targetIndex && !!task?.running);
  }

  function canUseAdvancedHistory() {
    return ctx.hasEntitlement("advancedHistory");
  }

  function canUseSocialFeatures() {
    return ctx.hasEntitlement("socialFeatures");
  }

  function normalizeTaskNameForSort(task: Task | null | undefined) {
    return String(task?.name || "").trim().toLocaleLowerCase();
  }

  function getTaskScheduleSortMinutes(task: Task | null | undefined) {
    if (!task) return null;
    const entries = getTaskScheduledDayEntries(task);
    if (!entries.length) return null;
    const minuteValues = entries
      .map((entry) => {
        const match = String(entry.time || "").match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1] || 0);
        const minutes = Number(match[2] || 0);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        return hours * 60 + minutes;
      })
      .filter((value): value is number => value != null);
    if (!minuteValues.length) return null;
    return Math.min(...minuteValues);
  }

  function compareTasksByCustomOrder(a: Task, b: Task) {
    return (a.order || 0) - (b.order || 0);
  }

  function compareTasksByAlpha(a: Task, b: Task) {
    const nameCompare = normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
    if (nameCompare !== 0) return nameCompare;
    return compareTasksByCustomOrder(a, b);
  }

  function compareTasksBySchedule(a: Task, b: Task) {
    const aMinutes = getTaskScheduleSortMinutes(a);
    const bMinutes = getTaskScheduleSortMinutes(b);
    if (aMinutes == null && bMinutes != null) return 1;
    if (aMinutes != null && bMinutes == null) return -1;
    if (aMinutes != null && bMinutes != null && aMinutes !== bMinutes) return aMinutes - bMinutes;
    const nameCompare = normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
    if (nameCompare !== 0) return nameCompare;
    return compareTasksByCustomOrder(a, b);
  }

  function buildDisplayedTasks(tasks: Task[]) {
    const nextTasks = tasks.slice();
    const taskOrderBy = ctx.getTaskOrderBy();
    if (taskOrderBy === "alpha") return nextTasks.sort(compareTasksByAlpha);
    if (taskOrderBy === "schedule") return nextTasks.sort(compareTasksBySchedule);
    return nextTasks.sort(compareTasksByCustomOrder);
  }

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1500px)").matches) return 4;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  function renderTasksPage() {
    const taskListEl = els.taskList;
    if (!taskListEl) return;

    const tasks = ctx.getTasks();
    const displayedTasks = buildDisplayedTasks(tasks);
    const sourceIndexByTaskId = new Map(tasks.map((task, index) => [String(task.id || ""), index] as const));
    taskListEl.innerHTML = "";
    const useTileColumns = ctx.getTaskView() === "tile";
    const tileColumnCount = useTileColumns ? getTileColumnCount() : 1;
    ctx.setCurrentTileColumnCount(tileColumnCount);
    if (useTileColumns) taskListEl.setAttribute("data-tile-columns", String(tileColumnCount));
    else taskListEl.removeAttribute("data-tile-columns");

    const openHistoryTaskIds = ctx.getOpenHistoryTaskIds();
    const pinnedHistoryTaskIds = ctx.getPinnedHistoryTaskIds();
    const historyViewByTaskId = ctx.getHistoryViewByTaskId();
    const activeTaskIds = new Set(tasks.map((t) => String(t.id || "")));

    ctx.syncTaskFlipStatesForVisibleTasks(activeTaskIds);
    for (const taskId of Array.from(pinnedHistoryTaskIds)) {
      if (activeTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
    }
    for (const taskId of Array.from(openHistoryTaskIds)) {
      if (!activeTaskIds.has(taskId)) {
        const staleHistoryState = historyViewByTaskId[taskId];
        if (staleHistoryState?.revealTimer != null) window.clearTimeout(staleHistoryState.revealTimer);
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    if (!displayedTasks.length) {
      taskListEl.innerHTML = `
        <section class="taskListEmptyState" aria-label="No tasks">
          <div class="taskListEmptyContent">
            <p class="taskListEmptyMessage">No Tasks found</p>
            <button class="btn btn-accent taskListEmptyAddBtn" type="button" data-action="openAddTask">
              + Add New Task
            </button>
          </div>
        </section>
      `;
      ctx.save();
      if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
      ctx.syncTimeGoalModalWithTaskState();
      ctx.maybeRestorePendingTimeGoalFlow();
      return;
    }

    displayedTasks.forEach((t) => {
      const elapsedMs = ctx.getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;
      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
      const msSorted = hasMilestones ? ctx.sortMilestones(t.milestones) : [];
      const timeGoalSec = hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0;

      const taskEl = document.createElement("div");
      const taskId = String(t.id || "");
      const hasActiveToastForTask =
        !!ctx.activeCheckpointToastTaskId() && String(ctx.activeCheckpointToastTaskId()) === taskId;
      taskEl.className =
        "task" +
        (t.collapsed ? " collapsed" : "") +
        ((ctx.checkpointRepeatActiveTaskId() && ctx.checkpointRepeatActiveTaskId() === taskId) || hasActiveToastForTask
          ? " taskAlertPulse"
          : "");
      (taskEl as any).dataset.index = String(sourceIndexByTaskId.get(taskId) ?? -1);
      (taskEl as any).dataset.taskId = taskId;
      taskEl.setAttribute("draggable", ctx.getTaskOrderBy() === "custom" ? "true" : "false");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";
      const progressModel = buildTaskProgressModel({
        milestones: msSorted,
        elapsedSec,
        milestoneUnitSec: sharedTasks.milestoneUnitSec(t),
        unitSuffix: sharedTasks.milestoneUnitSuffix(t),
        timeGoalSec,
      });
      const progressHTML = renderTaskProgressHtml(progressModel, {
        fillColor: ctx.getDynamicColorsEnabled()
          ? ctx.fillBackgroundForPct(progressModel?.pct || 0)
          : ctx.getModeColor("mode1"),
        escapeHtml: ctx.escapeHtmlUI,
      });

      const historyState = historyViewByTaskId[taskId];
      const historyRevealPhase = historyState?.revealPhase || (openHistoryTaskIds.has(taskId) ? "open" : null);
      const showHistory = openHistoryTaskIds.has(taskId) || historyRevealPhase === "closing";
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const historyHTML = showHistory
        ? `
          <section class="historyInline historyInlineMotion${historyRevealPhase === "opening" ? " isOpening" : ""}${historyRevealPhase === "closing" ? " isClosing" : ""}${historyRevealPhase === "open" ? " isOpen" : ""}" aria-label="History for ${ctx.escapeHtmlUI(t.name)}">
              <div class="historyTop">
                <div class="historyMeta"><div class="historyTitle historyInlineTitle">History</div></div>
                <div class="historyMeta historyTopActions">
                  <span class="historyTopDivider" aria-hidden="true"></span>
                  <button class="btn btn-ghost small historyViewSummaryBtn" type="button" data-history-action="viewSummary" title="View Summary" aria-label="View Summary">View Summary</button>
                  <button class="btn btn-ghost small historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">Clear</button>
                  <button class="historyPinBtn ${isHistoryPinned ? "isOn" : ""}" type="button" data-history-action="pin" title="${canUseAdvancedHistory() ? isHistoryPinned ? "Unpin chart" : "Pin chart" : "Pro feature: Pin chart"}" aria-label="${canUseAdvancedHistory() ? isHistoryPinned ? "Unpin chart" : "Pin chart" : "Pro feature: Pin chart"}" ${canUseAdvancedHistory() ? "" : 'data-plan-locked="advancedHistory"'}>&#128204;</button>
                </div>
              </div>
            <div class="historyCanvasWrap"><canvas class="historyChartInline"></canvas></div>
            <div class="historyTrashRow"></div>
            <div class="historyRangeRow">
              <div class="historyRangeInfo">
                <div class="historyMeta historyRangeText">&nbsp;</div>
                <div class="historyRangeToggleRow" aria-label="History range">
                  <button class="switch historyRangeToggle" type="button" role="switch" aria-checked="false" data-history-range-toggle="true"></button>
                  <button class="historyRangeModePill isOn" type="button" data-history-range-mode="entries" aria-pressed="true">Entries</button>
                  <button class="historyRangeModePill" type="button" data-history-range-mode="day" aria-pressed="false">Day</button>
                </div>
              </div>
              <div class="historyMeta historyRangeActions">
                <button class="btn btn-ghost small historyCloseBtn" type="button" data-history-action="close" aria-label="Close history chart">
                  Close
                </button>
              </div>
            </div>
          </section>
        `
        : "";

      taskEl.innerHTML = `
        <div class="taskFlipScene">
          <div class="taskFace taskFaceFront">
            <div class="taskFaceShell taskFaceShellFront">
            ${
              ctx.checkpointRepeatActiveTaskId() && ctx.checkpointRepeatActiveTaskId() === taskId
                ? '<button class="iconBtn checkpointMuteBtn" data-action="muteCheckpointAlert" title="Mute checkpoint alert" aria-label="Mute checkpoint alert">&#128276;</button>'
                : ""
            }
            <div class="row">
              <div class="taskHeadMain"><div class="name" data-action="editName" title="Open focus mode">${ctx.escapeHtmlUI(t.name)}</div></div>
              <div class="time" data-action="focus" title="Open focus mode">${ctx.formatMainTaskElapsedHtml(elapsedMs, !!t.running)}</div>
              <div class="actions">
                ${
                  t.running
                    ? '<button class="btn btn-warn small" data-action="stop" title="Stop">Stop</button>'
                    : elapsedMs > 0
                      ? '<button class="btn btn-resume small" data-action="start" title="Resume">Resume</button>'
                      : '<button class="btn btn-accent small" data-action="start" title="Launch">Launch</button>'
                }
                <button class="iconBtn" data-action="reset" title="${t.running ? "Stop task to reset" : "Reset"}" aria-label="${t.running ? "Stop task to reset" : "Reset"}" ${t.running ? "disabled" : ""}>&#10227;</button>
                <button class="iconBtn" data-action="edit" title="Edit">&#9998;</button>
                <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#9776;</button>
              </div>
            </div>
            ${progressHTML}
            <button class="taskHistoryReveal ${showHistory ? "isOpen" : ""}" type="button" data-action="history" title="${showHistory ? "Hide history chart" : "Show history chart"}" aria-label="${showHistory ? "Hide history chart" : "Show history chart"}" aria-pressed="${showHistory ? "true" : "false"}" ${isHistoryPinned ? "disabled" : ""}>
              <span class="taskHistoryRevealIcon" aria-hidden="true">&#8964;</span>
            </button>
            ${historyHTML}
            </div>
          </div>
          <div class="taskFace taskFaceBack" aria-hidden="true" inert>
            <div class="taskFaceShell taskFaceShellBack">
            <div class="taskBack">
              <div class="taskBackHead">
                <div class="taskBackTitle">${ctx.escapeHtmlUI(t.name)}</div>
                <button class="iconBtn taskFlipBtn taskFlipBackBtn" type="button" data-task-flip="close" title="Back to task" aria-label="Back to task" aria-expanded="false">&#8594;</button>
              </div>
              <div class="taskBackActions">
                <button class="taskMenuItem" data-action="manualEntry" title="${canUseAdvancedHistory() ? "Add Manual Entry" : "Pro feature: Manual history entry"}" type="button" ${canUseAdvancedHistory() ? "" : 'data-plan-locked="advancedHistory"'}>${canUseAdvancedHistory() ? "Add Manual Entry" : "Add Manual Entry (Pro)"}</button>
                <button class="taskMenuItem" data-action="collapse" title="${ctx.escapeHtmlUI(collapseLabel)}" type="button">${ctx.escapeHtmlUI(collapseLabel)}</button>
                <button class="taskMenuItem" data-action="${ctx.isTaskSharedByOwner(taskId) ? "unshareTask" : "shareTask"}" title="${canUseSocialFeatures() ? ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share" : "Pro feature: Sharing"}" type="button" ${canUseSocialFeatures() ? "" : 'data-plan-locked="socialFeatures"'}>${canUseSocialFeatures() ? ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share" : "Share (Pro)"}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
                <button class="taskMenuItem taskMenuItemDelete" data-action="delete" title="Delete" type="button">Delete</button>
              </div>
            </div>
            </div>
          </div>
        </div>
      `;
      ctx.applyTaskFlipDomState(taskId, taskEl);
      taskListEl.appendChild(taskEl);
    });

    ctx.save();
    for (const taskId of openHistoryTaskIds) ctx.renderHistory(taskId);
    if (openHistoryTaskIds.size) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (ctx.getCurrentAppPage() !== "tasks") return;
          for (const taskId of ctx.getOpenHistoryTaskIds()) ctx.renderHistory(taskId);
        });
      });
    }
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
    ctx.syncTimeGoalModalWithTaskState();
    ctx.maybeRestorePendingTimeGoalFlow();
  }

  function startTask(i: number) {
    const t = ctx.getTasks()[i];
    if (!t || t.running) return;
    const otherRunningIndex = findOtherRunningTaskIndex(i);
    if (otherRunningIndex >= 0) {
      const runningTask = ctx.getTasks()[otherRunningIndex];
      const clearTaskAlreadyRunningConfirmState = () => {
        if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isTaskAlreadyRunningConfirm");
      };
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isTaskAlreadyRunningConfirm");
      ctx.confirm(
        "Task Already Running",
        `${getTaskDisplayName(runningTask)} is currently running. Do you want to stop this timer and launch ${getTaskDisplayName(t)}?`,
        {
          okLabel: "Yes",
          cancelLabel: "Cancel",
          onOk: () => {
            clearTaskAlreadyRunningConfirmState();
            ctx.closeConfirm();
            stopTask(otherRunningIndex);
            startTask(i);
          },
          onCancel: () => {
            clearTaskAlreadyRunningConfirmState();
            ctx.closeConfirm();
          },
        }
      );
      return;
    }
    ctx.clearTaskTimeGoalFlow(String(t.id || ""));
    ctx.flushPendingFocusSessionNoteSave(String(t.id || ""));
    t.running = true;
    t.startMs = Date.now();
    t.hasStarted = true;
    ctx.openRewardSessionSegment(t, t.startMs);
    ctx.upsertLiveSession(t, { elapsedMs: 0 });
    ctx.clearCheckpointBaseline(t.id);
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    ctx.render();
    if (ctx.getAutoFocusOnTaskLaunchEnabled() && String(ctx.getFocusModeTaskId() || "") !== String(t.id || "")) {
      ctx.openFocusMode(i);
    }
  }

  function stopTask(i: number) {
    const t = ctx.getTasks()[i];
    if (!t || !t.running) return;
    ctx.clearTaskTimeGoalFlow(String(t.id || ""));
    ctx.flushPendingFocusSessionNoteSave(String(t.id || ""));
    ctx.closeRewardSessionSegment(t, Date.now());
    t.accumulatedMs = ctx.getElapsedMs(t);
    ctx.finalizeLiveSession(t, { elapsedMs: t.accumulatedMs });
    t.running = false;
    t.startMs = null;
    ctx.clearCheckpointBaseline(t.id);
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    ctx.render();
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

  function resetTaskStateImmediate(t: Task, opts?: { logHistory?: boolean; sessionNote?: string; completionDifficulty?: unknown }) {
    if (!t) return;
    const taskId = String(t.id || "");
    ctx.flushPendingFocusSessionNoteSave(taskId);
    ctx.finalizeLiveSession(t, {
      elapsedMs: ctx.getTaskElapsedMs(t),
      note: opts?.sessionNote,
      completionDifficulty: normalizeCompletionDifficulty(opts?.completionDifficulty),
    });
    t.accumulatedMs = 0;
    t.running = false;
    t.startMs = null;
    t.hasStarted = false;
    ctx.clearTaskTimeGoalFlow(taskId);
    ctx.clearRewardSessionTracker(taskId);
    ctx.resetCheckpointAlertTracking(t.id);
    ctx.setCheckpointAutoResetDirty(true);
    ctx.clearFocusSessionDraft(taskId);
    if (String(ctx.getFocusModeTaskId() || "") === taskId) {
      ctx.syncFocusSessionNotesInput(taskId);
      ctx.syncFocusSessionNotesAccordion(taskId);
    }
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

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

  function resetTask(i: number) {
    const t = ctx.getTasks()[i];
    if (!t || t.running) return;
    const shouldExitFocusModeAfterReset = String(ctx.getFocusModeTaskId() || "").trim() === String(t.id || "").trim();
    const clearResetTaskConfirmState = () => {
      ctx.setResetTaskConfirmBusy(false, false);
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isResetTaskConfirm");
    };
    ctx.confirm("Reset Task", "Reset timer to zero?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      onOk: async () => {
        ctx.setResetTaskConfirmBusy(true, false);
        const sessionNote = ctx.captureResetActionSessionNote(String(t.id || ""));
        if (sessionNote) ctx.setFocusSessionDraft(String(t.id || ""), sessionNote);
        try {
          resetTaskStateImmediate(t, { logHistory: true, sessionNote });
          ctx.save();
          ctx.closeConfirm();
          if (shouldExitFocusModeAfterReset) ctx.closeFocusMode();
          else ctx.render();
        } finally {
          clearResetTaskConfirmState();
        }
      },
      onCancel: () => {
        clearResetTaskConfirmState();
        ctx.closeConfirm();
      },
    });
    ctx.setResetTaskConfirmBusy(false, false);
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isResetTaskConfirm");
  }

  function resetAll() {
    const tasks = ctx.getTasks();
    const renderAfterReset = () => {
      ctx.render();
      ctx.renderDashboardWidgets();
    };
    ctx.confirm(
      "Delete Data",
      "This will permanently delete all task history and tasks (if selected below) from your account.",
      {
        okLabel: "Delete",
        checkboxLabel: "Also Delete All Tasks",
        checkboxChecked: false,
        dangerInputLabel: "",
        dangerInputMatch: "DELETE",
        dangerInputPlaceholder: "Enter 'DELETE' to proceed.",
        onOk: () => {
          const alsoDelete = !!els.confirmDeleteAll?.checked;
          const affectedTaskIds = tasks.map((row) => String(row.id || "")).filter(Boolean);
          const uid = String(ctx.currentUid() || "");
          const historyByTaskId = ctx.getHistoryByTaskId();
          const deletedHistoryEntryCount = Object.values(historyByTaskId || {}).reduce(
            (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
            0
          );
          const deletedTaskCount = alsoDelete ? tasks.length : 0;
          const nextHistory = {} as any;
          const nextDeletedTaskMeta = {} as DeletedTaskMeta;
          ctx.setHistoryByTaskId(nextHistory);
          ctx.saveHistory(nextHistory);
          ctx.setDeletedTaskMeta(nextDeletedTaskMeta);
          ctx.saveDeletedMeta(nextDeletedTaskMeta);
          if (alsoDelete) {
            ctx.setTasks([]);
            ctx.save({ deletedTaskIds: affectedTaskIds });
            if (uid && affectedTaskIds.length) {
              void Promise.all(affectedTaskIds.map((taskId) => ctx.deleteSharedTaskSummariesForTask(uid, taskId).catch(() => {})))
                .then(() => ctx.refreshOwnSharedSummaries())
                .catch(() => {});
            }
            renderAfterReset();
            ctx.closeConfirm();
            ctx.confirm(
              "Delete Complete",
              `${deletedTaskCount} task${deletedTaskCount === 1 ? "" : "s"} and ${deletedHistoryEntryCount} history entr${
                deletedHistoryEntryCount === 1 ? "y" : "ies"
              } deleted.`,
              { okLabel: "Close", cancelLabel: "Done", onOk: () => ctx.closeConfirm(), onCancel: () => ctx.closeConfirm() }
            );
            return;
          }
          ctx.save();
          if (affectedTaskIds.length) void ctx.syncSharedTaskSummariesForTasks(affectedTaskIds).catch(() => {});
          renderAfterReset();
          ctx.closeConfirm();
          ctx.confirm(
            "Delete Complete",
            `${deletedHistoryEntryCount} history entr${deletedHistoryEntryCount === 1 ? "y" : "ies"} deleted.`,
            { okLabel: "Close", cancelLabel: "Done", onOk: () => ctx.closeConfirm(), onCancel: () => ctx.closeConfirm() }
          );
        },
      }
    );
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isResetAllDeleteConfirm");
  }

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
    if ((action === "shareTask" || action === "unshareTask") && !canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing and friends", "pro");
      return;
    }
    if (action === "manualEntry" && !canUseAdvancedHistory()) {
      ctx.showUpgradePrompt("Manual history entry", "pro");
      return;
    }
    const actionHandlers: Record<string, () => void> = {
      start: () => startTask(i),
      stop: () => stopTask(i),
      reset: () => resetTask(i),
      delete: () => ctx.deleteTask(i),
      edit: () => ctx.openEdit(i, element as HTMLElement),
      history: () => openHistory(i),
      editName: () => ctx.openFocusMode(i),
      focus: () => ctx.openFocusMode(i),
      collapse: () => toggleCollapse(i),
      exportTask: () => ctx.openTaskExportModal(i),
      manualEntry: () => {
        if (!taskId) return;
        window.setTimeout(() => {
          openTaskManualEntryOverlay(taskId);
        }, 0);
      },
      shareTask: () => ctx.openShareTaskModal(i),
      unshareTask: () => {
        const t = ctx.getTasks()[i];
        if (!t) return;
        ctx.confirm("Unshare Task", "Unshare this task from all friends?", {
          okLabel: "Unshare",
          cancelLabel: "Cancel",
          onOk: () => {
            const uid = ctx.currentUid();
            if (!uid) {
              ctx.closeConfirm();
              return;
            }
            void ctx
              .deleteSharedTaskSummariesForTask(uid, String(t.id || ""))
              .then(async () => {
                await ctx.refreshOwnSharedSummaries();
                if (ctx.getCurrentAppPage() === "friends") await ctx.refreshGroupsData();
                ctx.render();
              })
              .finally(() => ctx.closeConfirm());
          },
        });
      },
      muteCheckpointAlert: () => {
        if (taskId) ctx.broadcastCheckpointAlertMute(taskId);
        ctx.stopCheckpointRepeatAlert();
      },
    };
    actionHandlers[action]?.();
    if (taskId) ctx.setTaskFlipped(taskId, false, taskEl as HTMLElement);
  }

  function registerTaskEvents() {
    ctx.on(els.taskList, "click", handleTaskListClick);
    ctx.on(els.resetAllBtn, "click", (e: any) => {
      e?.preventDefault?.();
      resetAll();
    });
    ctx.on(els.taskManualEntryOverlay, "click", (ev: any) => {
      if (ev.target !== els.taskManualEntryOverlay) return;
      closeTaskManualEntryOverlay();
    });
    ctx.on(els.taskManualEntryCancelBtn, "click", () => {
      closeTaskManualEntryOverlay();
    });
    ctx.on(els.taskManualEntrySaveBtn, "click", () => {
      saveTaskManualEntryDraft();
    });
    ctx.on(els.taskManualDateTimeBtn, "click", () => {
      openTaskManualEntryDateTimePicker();
    });
    ctx.on(els.taskManualDateTimeInput, "change", () => {
      const value = String(els.taskManualDateTimeInput?.value || "");
      updateTaskManualEntryDraft((draft) => ({ ...draft, dateTimeValue: value, errorMessage: "" }));
      syncTaskManualEntryOverlay();
    });
    ctx.on(els.taskManualHoursInput, "input", () => {
      const value = String(els.taskManualHoursInput?.value || "");
      updateTaskManualEntryDraft((draft) => ({ ...draft, hoursValue: value, errorMessage: "" }));
      syncTaskManualEntryOverlay();
    });
    ctx.on(els.taskManualMinutesInput, "input", () => {
      const value = String(els.taskManualMinutesInput?.value || "");
      updateTaskManualEntryDraft((draft) => ({ ...draft, minutesValue: value, errorMessage: "" }));
      syncTaskManualEntryOverlay();
    });
    ctx.on(els.taskManualNoteInput, "input", () => {
      const value = String(els.taskManualNoteInput?.value || "");
      updateTaskManualEntryDraft((draft) => ({ ...draft, noteValue: value, errorMessage: "" }));
    });
    ctx.on(els.taskManualEntryDifficultyGroup, "click", (ev: any) => {
      const btn = ev.target?.closest?.("[data-completion-difficulty]");
      if (!btn) return;
      const value = String(btn.getAttribute("data-completion-difficulty") || "");
      updateTaskManualEntryDraft((draft) => ({
        ...draft,
        completionDifficulty: normalizeCompletionDifficulty(value) || "",
        errorMessage: "",
      }));
      syncTaskManualEntryOverlay();
    });
  }

  return {
    renderTasksPage,
    startTask,
    stopTask,
    resetTask,
    resetAll,
    resetTaskStateImmediate,
    openHistory,
    registerTaskEvents,
  };
}
