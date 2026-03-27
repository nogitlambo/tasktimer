import { escapeRegExp, newTaskId } from "../lib/ids";
import type { DeletedTaskMeta, Task } from "../lib/types";
import type { TaskTimerTasksContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;

  function getTaskDisplayName(task: Task | null | undefined) {
    const name = String(task?.name || "").trim();
    return name || "Unnamed task";
  }

  function findOtherRunningTaskIndex(targetIndex: number) {
    return ctx.getTasks().findIndex((task, index) => index !== targetIndex && !!task?.running);
  }

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  function renderTasksPage() {
    const taskListEl = els.taskList;
    if (!taskListEl) return;

    const tasks = ctx.getTasks();
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    taskListEl.innerHTML = "";
    const useTileColumns = ctx.getTaskView() === "tile";
    const tileColumnCount = useTileColumns ? getTileColumnCount() : 1;
    ctx.setCurrentTileColumnCount(tileColumnCount);
    if (useTileColumns) taskListEl.setAttribute("data-tile-columns", String(tileColumnCount));
    else taskListEl.removeAttribute("data-tile-columns");

    const currentMode = ctx.getCurrentMode();
    const openHistoryTaskIds = ctx.getOpenHistoryTaskIds();
    const pinnedHistoryTaskIds = ctx.getPinnedHistoryTaskIds();
    const historyViewByTaskId = ctx.getHistoryViewByTaskId();
    const modeTasks = tasks.filter((t) => ctx.taskModeOf(t) === currentMode);
    const activeTaskIds = new Set(modeTasks.map((t) => String(t.id || "")));

    ctx.syncTaskFlipStatesForVisibleTasks(activeTaskIds);
    for (const taskId of Array.from(pinnedHistoryTaskIds)) {
      if (activeTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
    }
    for (const taskId of Array.from(openHistoryTaskIds)) {
      if (!activeTaskIds.has(taskId)) {
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    tasks.forEach((t, index) => {
      if (ctx.taskModeOf(t) !== currentMode) return;
      const elapsedMs = ctx.getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;
      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
      const msSorted = hasMilestones ? ctx.sortMilestones(t.milestones) : [];
      const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
      const timeGoalSec = hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0;
      const maxSec = Math.max(maxValue * ctx.milestoneUnitSec(t), timeGoalSec, 1);
      const pct = hasMilestones || hasTimeGoal ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

      const taskEl = document.createElement("div");
      const taskId = String(t.id || "");
      const hasActiveToastForTask =
        !!ctx.activeCheckpointToastTaskId() && String(ctx.activeCheckpointToastTaskId()) === taskId;
      const suppressedCheckpointAlert = !ctx.isFocusModeFilteringAlerts() ? (ctx.getSuppressedFocusModeAlert(taskId) as any) : null;
      taskEl.className =
        "task" +
        (t.collapsed ? " collapsed" : "") +
        ((ctx.checkpointRepeatActiveTaskId() && ctx.checkpointRepeatActiveTaskId() === taskId) || hasActiveToastForTask
          ? " taskAlertPulse"
          : "");
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = taskId;
      taskEl.setAttribute("draggable", "true");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";
      let progressHTML = "";
      if (hasMilestones || hasTimeGoal) {
        let markers = "";
        const unitSuffix = ctx.milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;
        const nextPendingIndex = msSorted.findIndex((m) => elapsedSec < (+m.hours || 0) * ctx.milestoneUnitSec(t));
        const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, msSorted.length - 1);
        msSorted.forEach((m, msIdx) => {
          const val = +m.hours || 0;
          const secTarget = val * ctx.milestoneUnitSec(t);
          const left = Math.max(0, Math.min((secTarget / maxSec) * 100, 100));
          const reached = elapsedSec >= secTarget;
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${val}${unitSuffix}`;
          const desc = (m.description || "").trim();
          const edgeCls = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
          const leftPos = edgeCls === "mkEdgeL" ? 0 : edgeCls === "mkEdgeR" ? 100 : left;
          const wrapCls = edgeCls && label.length > 8 ? "mkWrap8" : "";
          const showCheckpointLabel = msIdx === labelTargetIndex;
          markers += `
            <div class="mkFlag ${cls}" style="left:${leftPos}%"></div>
            ${showCheckpointLabel ? `<div class="mkTime ${cls} ${edgeCls} ${wrapCls}" style="left:${leftPos}%">${ctx.escapeHtmlUI(label)}</div>` : ``}
            ${showCheckpointLabel && desc ? `<div class="mkDesc ${cls} ${edgeCls}" style="left:${leftPos}%">${ctx.escapeHtmlUI(desc)}</div>` : ``}`;
        });
        if (hasTimeGoal) {
          const goalLeft = Math.max(0, Math.min((timeGoalSec / maxSec) * 100, 100));
          const goalEdgeCls = goalLeft <= 1 ? "mkEdgeL" : goalLeft >= 99 ? "mkEdgeR" : "";
          const goalLeftPos = goalEdgeCls === "mkEdgeL" ? 0 : goalEdgeCls === "mkEdgeR" ? 100 : goalLeft;
          markers += `
            <div class="mkFlag mkGoal ${elapsedSec >= timeGoalSec ? "mkAch" : "mkPend"} ${goalEdgeCls}" style="left:${goalLeftPos}%"></div>`;
        }
        progressHTML = `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${pct}%;background:${ctx.getDynamicColorsEnabled() ? ctx.fillBackgroundForPct(pct) : ctx.getModeColor(ctx.taskModeOf(t))}"></div>
                ${markers}
              </div>
            </div>
          </div>`;
      }

      const showHistory = openHistoryTaskIds.has(taskId);
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const historyHTML = showHistory
        ? `
          <section class="historyInline" aria-label="History for ${ctx.escapeHtmlUI(t.name)}">
            <div class="historyTop">
              <div class="historyMeta"><div class="historyTitle historyInlineTitle">History</div></div>
              <div class="historyMeta historyTopActions">
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="analyse" title="Analysis" aria-label="Analysis">&#128269;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="manage" title="Manage" aria-label="Manage">&#9881;</button>
                <button class="historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">X</button>
                <button class="historyPinBtn ${isHistoryPinned ? "isOn" : ""}" type="button" data-history-action="pin" title="${isHistoryPinned ? "Unpin chart" : "Pin chart"}" aria-label="${isHistoryPinned ? "Unpin chart" : "Pin chart"}">&#128204;</button>
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
              <div class="historyMeta historyRangeActions"></div>
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
            ${
              suppressedCheckpointAlert
                ? '<button class="iconBtn checkpointMissedAlertBtn" data-action="showSuppressedCheckpointAlert" title="Show missed checkpoint alert" aria-label="Show missed checkpoint alert">&#9888;</button>'
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
                <button class="iconBtn historyActionBtn ${showHistory || isHistoryPinned ? "isActive" : ""} ${isHistoryPinned ? "isPinned" : ""}" data-action="history" title="${isHistoryPinned ? "History pinned" : "History"}" aria-pressed="${showHistory || isHistoryPinned ? "true" : "false"}" ${isHistoryPinned ? "disabled" : ""}><img src="/Dashboard.svg" alt="" aria-hidden="true" width="18" height="18"></button>
                <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#8942;</button>
              </div>
            </div>
            ${progressHTML}
            ${historyHTML}
            </div>
          </div>
          <div class="taskFace taskFaceBack" aria-hidden="true" inert>
            <div class="taskFaceShell taskFaceShellBack">
            <div class="taskBack">
              <div class="taskBackHead">
                <button class="iconBtn taskFlipBtn taskFlipBackBtn" type="button" data-task-flip="close" title="Back to task" aria-label="Back to task" aria-expanded="false">&#8594;</button>
                <div class="taskBackTitle">${ctx.escapeHtmlUI(t.name)}</div>
              </div>
              <div class="taskBackActions">
                <button class="taskMenuItem" data-action="duplicate" title="Duplicate" type="button">Duplicate</button>
                <button class="taskMenuItem" data-action="collapse" title="${ctx.escapeHtmlUI(collapseLabel)}" type="button">${ctx.escapeHtmlUI(collapseLabel)}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
                <button class="taskMenuItem" data-action="${ctx.isTaskSharedByOwner(taskId) ? "unshareTask" : "shareTask"}" title="${ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share"}" type="button">${ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share"}</button>
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
      ctx.confirm("Task Already Running", `${getTaskDisplayName(runningTask)} is currently running.`, {
        okLabel: "Stop running task and launch this task",
        cancelLabel: "Continue running task",
        onOk: () => {
          ctx.closeConfirm();
          stopTask(otherRunningIndex);
          startTask(i);
        },
        onCancel: () => ctx.closeConfirm(),
      });
      return;
    }
    ctx.clearTaskTimeGoalFlow(String(t.id || ""));
    ctx.flushPendingFocusSessionNoteSave(String(t.id || ""));
    ctx.awardLaunchXpForTask(t);
    t.running = true;
    t.startMs = Date.now();
    t.hasStarted = true;
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
    t.accumulatedMs = ctx.getElapsedMs(t);
    t.running = false;
    t.startMs = null;
    ctx.clearCheckpointBaseline(t.id);
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    ctx.render();
  }

  function resetTaskStateImmediate(t: Task, opts?: { logHistory?: boolean; sessionNote?: string }) {
    if (!t) return;
    const taskId = String(t.id || "");
    ctx.flushPendingFocusSessionNoteSave(taskId);
    if (!!opts?.logHistory && ctx.canLogSession(t)) {
      const ms = ctx.getTaskElapsedMs(t);
      const completedAtMs = Date.now();
      if (ms > 0) ctx.appendCompletedSessionHistory(t, completedAtMs, ms, opts?.sessionNote);
    }
    t.accumulatedMs = 0;
    t.running = false;
    t.startMs = null;
    t.hasStarted = false;
    t.xpDisqualifiedUntilReset = false;
    ctx.clearTaskTimeGoalFlow(taskId);
    ctx.resetCheckpointAlertTracking(t.id);
    ctx.setCheckpointAutoResetDirty(true);
    ctx.clearFocusSessionDraft(taskId);
    if (String(ctx.getFocusModeTaskId() || "") === taskId) {
      ctx.syncFocusSessionNotesInput(taskId);
      ctx.syncFocusSessionNotesAccordion(taskId);
    }
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
    const applyResetTaskConfirmState = () => {
      const shouldLog = !!els.confirmDeleteAll?.checked;
      ctx.setResetTaskConfirmBusy(false, shouldLog);
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isResetTaskConfirm");
      if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", shouldLog);
      ctx.syncConfirmPrimaryToggleUi();
    };
    const clearResetTaskConfirmState = () => {
      if (els.confirmDeleteAll) els.confirmDeleteAll.onchange = null;
      ctx.setResetTaskConfirmBusy(false, false);
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isResetTaskConfirm");
    };
    ctx.confirm("Reset Task", "Reset timer to zero?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      checkboxLabel: "Log this entry",
      checkboxChecked: true,
      onOk: async () => {
        const doLog = !!els.confirmDeleteAll?.checked;
        ctx.setResetTaskConfirmBusy(true, doLog);
        const sessionNote = ctx.captureResetActionSessionNote(String(t.id || ""));
        if (sessionNote) ctx.setFocusSessionDraft(String(t.id || ""), sessionNote);
        try {
          resetTaskStateImmediate(t, { logHistory: doLog, sessionNote });
          ctx.save();
          if (!doLog) void ctx.syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
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
    applyResetTaskConfirmState();
    if (els.confirmDeleteAll) els.confirmDeleteAll.onchange = applyResetTaskConfirmState;
  }

  function resetAll() {
    const tasks = ctx.getTasks();
    const eligibleTasks = tasks.filter((t) => ctx.canLogSession(t));
    ctx.confirm("Reset All", "Reset all timers?", {
      okLabel: "Reset",
      checkboxLabel: "Also delete all tasks",
      checkboxChecked: false,
      checkbox2Label: eligibleTasks.length ? "Log eligible sessions to History" : null,
      checkbox2Checked: eligibleTasks.length ? true : false,
      onOk: () => {
        const alsoDelete = !!els.confirmDeleteAll?.checked;
        const doLog = eligibleTasks.length ? !!(els as any).confirmLogChk?.checked : false;
        const affectedTaskIds = tasks.map((row) => String(row.id || "")).filter(Boolean);
        const uid = String(ctx.currentUid() || "");
        const deletedTaskCount = alsoDelete ? tasks.length : 0;
        if (doLog) {
          eligibleTasks.forEach((t) => {
            const ms = ctx.getTaskElapsedMs(t);
            if (ms > 0) ctx.appendCompletedSessionHistory(t, Date.now(), ms, ctx.captureResetActionSessionNote(String(t.id || "")));
          });
        }
        if (alsoDelete) {
          const historyByTaskId = ctx.getHistoryByTaskId();
          const deletedHistoryEntryCount = Object.values(historyByTaskId || {}).reduce(
            (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
            0
          );
          ctx.setTasks([]);
          const nextHistory = {};
          ctx.setHistoryByTaskId(nextHistory as any);
          ctx.saveHistory(nextHistory as any);
          const nextDeletedTaskMeta = {} as DeletedTaskMeta;
          ctx.setDeletedTaskMeta(nextDeletedTaskMeta);
          ctx.saveDeletedMeta(nextDeletedTaskMeta);
          ctx.save();
          if (uid && affectedTaskIds.length) {
            void Promise.all(affectedTaskIds.map((taskId) => ctx.deleteSharedTaskSummariesForTask(uid, taskId).catch(() => {})))
              .then(() => ctx.refreshOwnSharedSummaries())
              .catch(() => {});
          }
          ctx.render();
          ctx.closeConfirm();
          ctx.confirm(
            "Reset Complete",
            `${deletedTaskCount} task${deletedTaskCount === 1 ? "" : "s"} and ${deletedHistoryEntryCount} history entr${
              deletedHistoryEntryCount === 1 ? "y" : "ies"
            } deleted.`,
            { okLabel: "Close", cancelLabel: "Done", onOk: () => ctx.closeConfirm(), onCancel: () => ctx.closeConfirm() }
          );
          return;
        }
        tasks.forEach((t) => {
          t.accumulatedMs = 0;
          t.running = false;
          t.startMs = null;
          t.hasStarted = false;
          t.xpDisqualifiedUntilReset = false;
          ctx.resetCheckpointAlertTracking(t.id);
        });
        ctx.save();
        if (affectedTaskIds.length) void ctx.syncSharedTaskSummariesForTasks(affectedTaskIds).catch(() => {});
        ctx.render();
        ctx.closeConfirm();
      },
    });
  }

  function openEdit(i: number) {
    const sourceTask = ctx.getTasks()[i];
    if (!sourceTask) return;
    const t = ctx.cloneTaskForEdit(sourceTask);
    ctx.setEditIndex(i);
    ctx.setEditTaskDraft(t);
    if (els.editName) els.editName.value = t.name || "";
    ctx.setEditTimeGoalEnabled(!!t.timeGoalEnabled);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
    ctx.setEditTaskDurationUnit(t.timeGoalUnit === "minute" ? "minute" : "hour");
    ctx.setEditTaskDurationPeriod(t.timeGoalPeriod === "day" ? "day" : "week");
    ctx.syncEditTaskTimeGoalUi(t);

    const elapsedMs = ctx.getElapsedMs(t);
    const totalSec = Math.floor(elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const remAfterDays = totalSec % 86400;
    const h = Math.floor(remAfterDays / 3600);
    const m = Math.floor((remAfterDays % 3600) / 60);
    const s = remAfterDays % 60;
    if (els.editD) els.editD.value = String(d);
    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);
    [els.editD, els.editH, els.editM, els.editS].forEach((input) => {
      if (input) input.dataset.autoclearPending = "1";
    });
    setEditElapsedOverrideEnabled(!!t.xpDisqualifiedUntilReset);
    if (els.editAdvancedSection) els.editAdvancedSection.open = !!t.xpDisqualifiedUntilReset;
    ctx.syncEditCheckpointAlertUi(t);
    ctx.syncEditSaveAvailability(t);
    const current = ctx.taskModeOf(t);
    ctx.setEditMoveTargetMode(current);
    if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = ctx.getModeLabel(current);
    [els.editMoveMode1, els.editMoveMode2, els.editMoveMode3].forEach((btn) => {
      if (!btn) return;
      const moveMode = btn.getAttribute("data-move-mode") as any;
      const disabled = btn.getAttribute("data-move-mode") === current || !ctx.isModeEnabled(moveMode);
      btn.disabled = disabled;
      btn.classList.toggle("is-disabled", disabled);
    });
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    if (els.msArea && "open" in (els.msArea as any)) (els.msArea as HTMLDetailsElement).open = false;
    ctx.syncEditMilestoneSectionUi(t);
    ctx.setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour");
    ctx.renderMilestoneEditor(t);
    ctx.ensureMilestoneIdentity(t);
    if (els.editPresetIntervalInput) els.editPresetIntervalInput.value = String(Number(t.presetIntervalValue || 0) || 0);
    ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    ctx.syncEditCheckpointAlertUi(t);
    ctx.setEditDraftSnapshot(ctx.buildEditDraftSnapshot(t));
    ctx.clearEditValidationState();
    ctx.syncEditSaveAvailability(t);
    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const editIndex = ctx.getEditIndex();
    const sourceTask = editIndex != null ? ctx.getTasks()[editIndex] : null;
    const t = ctx.getEditTaskDraft();
    if (saveChanges && t && sourceTask) {
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      if (!ctx.validateEditTimeGoal()) return void ctx.showEditValidationError(t, "Enter a valid time goal or turn Time Goal off.");
      const checkpointingActiveForSave = !!t.milestonesEnabled && ctx.editTaskHasActiveTimeGoal();
      if (checkpointingActiveForSave && (!Array.isArray(t.milestones) || t.milestones.length === 0)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Add at least 1 timer checkpoint before saving.");
      }
      if (checkpointingActiveForSave && ctx.hasNonPositiveCheckpoint(t.milestones)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be greater than 0.");
      }
      if (checkpointingActiveForSave && ctx.hasCheckpointAtOrAboveTimeGoal(t.milestones, ctx.milestoneUnitSec(t), ctx.getEditTaskTimeGoalMinutes())) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be less than the time goal.");
      }
      if (checkpointingActiveForSave && t.presetIntervalsEnabled && !ctx.hasValidPresetInterval(t)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Enter a preset interval greater than 0.");
      }
      const prevElapsedMs = ctx.getElapsedMs(sourceTask);
      t.name = (els.editName?.value || "").trim() || t.name;
      if (isEditElapsedOverrideEnabled()) {
        const dd = Math.max(0, parseInt(els.editD?.value || "0", 10) || 0);
        const rawH = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
        const hh = ctx.isEditMilestoneUnitDay() ? Math.min(23, rawH) : rawH;
        const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
        const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));
        const newMs = (dd * 86400 + hh * 3600 + mm * 60 + ss) * 1000;
        t.accumulatedMs = newMs;
        t.startMs = t.running ? Date.now() : null;
        if (newMs < prevElapsedMs) ctx.resetCheckpointAlertTracking(t.id);
        else ctx.clearCheckpointBaseline(t.id);
      }
      t.xpDisqualifiedUntilReset = isEditElapsedOverrideEnabled();
      const timeGoalEnabledForSave = ctx.isEditTimeGoalEnabled();
      const checkpointingEnabledForSave = timeGoalEnabledForSave && !!t.milestonesEnabled;
      t.checkpointSoundEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
      t.presetIntervalsEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null);
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      t.timeGoalAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue";
      t.timeGoalEnabled = timeGoalEnabledForSave;
      if (!t.timeGoalEnabled) t.milestonesEnabled = false;
      t.timeGoalValue = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
      t.timeGoalUnit = ctx.getEditTaskDurationUnit();
      t.timeGoalPeriod = ctx.getEditTaskDurationPeriod();
      t.timeGoalMinutes = ctx.getEditTaskTimeGoalMinutesFor(t.timeGoalValue, t.timeGoalUnit, t.timeGoalPeriod);
      ctx.ensureMilestoneIdentity(t);
      t.milestones = ctx.sortMilestones(t.milestones);
      const moveMode = ctx.getEditMoveTargetMode() || ctx.taskModeOf(t);
      if ((moveMode === "mode1" || moveMode === "mode2" || moveMode === "mode3") && ctx.isModeEnabled(moveMode)) {
        (t as any).mode = moveMode;
      }
      Object.assign(sourceTask, ctx.cloneTaskForEdit(t));
      ctx.save();
      void ctx.syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
      ctx.render();
    }
    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    ctx.clearEditValidationState();
    closeElapsedPad(false);
    if (els.editAdvancedSection) els.editAdvancedSection.open = false;
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    ctx.setEditIndex(null);
    ctx.setEditTaskDraft(null);
    ctx.setEditDraftSnapshot("");
  }

  function isEditElapsedOverrideEnabled() {
    return !!els.editOverrideElapsedToggle?.classList.contains("on");
  }

  function setEditElapsedOverrideEnabled(enabled: boolean) {
    els.editOverrideElapsedToggle?.classList.toggle("on", enabled);
    els.editOverrideElapsedToggle?.setAttribute("aria-checked", String(enabled));
    els.editOverrideElapsedFields?.classList.toggle("isDisabled", !enabled);
  }

  function confirmEnableElapsedOverride() {
    ctx.confirm("Manual Time Override", "Manual time override will disqualify this task from earning XP until the next reset. Proceed?", {
      okLabel: "Proceed",
      cancelLabel: "Cancel",
      onOk: () => {
        setEditElapsedOverrideEnabled(true);
        const currentTask = ctx.getCurrentEditTask();
        if (currentTask) ctx.syncEditSaveAvailability(currentTask);
        ctx.closeConfirm();
      },
      onCancel: () => ctx.closeConfirm(),
    });
  }

  function normalizeEditElapsedValue(input: HTMLInputElement | null) {
    if (!input) return;
    const raw = String(input.value || "").trim();
    if (!raw) {
      input.value = "0";
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      input.value = "0";
      return;
    }
    if (input === els.editM || input === els.editS) {
      input.value = String(Math.min(59, Math.max(0, parsed)));
      return;
    }
    if (input === els.editH && ctx.isEditMilestoneUnitDay()) {
      input.value = String(Math.min(23, Math.max(0, parsed)));
      return;
    }
    input.value = String(Math.max(0, parsed));
  }

  function maybeAutoClearEditElapsedField(input: HTMLInputElement | null) {
    if (!input) return;
    if (!isEditElapsedOverrideEnabled()) return;
    if (input.dataset.autoclearPending !== "1") return;
    input.value = "";
    input.dataset.autoclearPending = "0";
  }

  function elapsedPadRangeForInput(input: HTMLInputElement | null) {
    if (input === els.editD) return { min: 0, max: Number.POSITIVE_INFINITY };
    if (input === els.editH) {
      return ctx.isEditMilestoneUnitDay() ? { min: 0, max: 23 } : { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (input === els.editM || input === els.editS) return { min: 0, max: 59 };
    return { min: 0, max: 59 };
  }

  function elapsedPadErrorTextForInput(input: HTMLInputElement | null) {
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(range.max)) return `Enter a number greater than or equal to ${range.min}`;
    return `Enter a number within the range ${range.min}-${range.max}`;
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function elapsedPadValidatedValue(raw: string, input: HTMLInputElement | null) {
    const parsed = parseInt(raw || "", 10);
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(parsed) || isNaN(parsed)) return null;
    if (parsed < range.min || parsed > range.max) return null;
    return String(parsed);
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (ctx.getElapsedPadDraft() || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    if (!els.elapsedPadOverlay) return;
    ctx.setElapsedPadTarget(null);
    ctx.setElapsedPadMilestoneRef({ task, milestone, ms, onApplied });
    const original = String(+milestone.hours || 0);
    ctx.setElapsedPadOriginal(original);
    ctx.setElapsedPadDraft(original);
    if (els.elapsedPadTitle) {
      const unit = task?.milestoneTimeUnit === "day" ? "days" : task?.milestoneTimeUnit === "minute" ? "minutes" : "hours";
      els.elapsedPadTitle.textContent = `Set Checkpoint <${unit}>`;
    }
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function closeElapsedPad(applyValue: boolean) {
    const elapsedPadTarget = ctx.getElapsedPadTarget();
    const elapsedPadMilestoneRef = ctx.getElapsedPadMilestoneRef();
    const elapsedPadDraft = ctx.getElapsedPadDraft();
    const elapsedPadOriginal = ctx.getElapsedPadOriginal();
    if (applyValue && (elapsedPadTarget || elapsedPadMilestoneRef)) {
      const valid =
        elapsedPadMilestoneRef && !elapsedPadTarget
          ? (() => {
              const parsed = parseFloat(elapsedPadDraft || "");
              if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) return null;
              return String(parsed);
            })()
          : elapsedPadValidatedValue(elapsedPadDraft, elapsedPadTarget);
      if (valid == null) {
        setElapsedPadError(
          elapsedPadMilestoneRef && !elapsedPadTarget ? "Enter a valid number" : elapsedPadErrorTextForInput(elapsedPadTarget)
        );
        return;
      }
      if (elapsedPadTarget) {
        elapsedPadTarget.value = valid;
      } else if (elapsedPadMilestoneRef) {
        const nextHours = Number(valid);
        const isEditDraftMilestone = elapsedPadMilestoneRef.task === ctx.getCurrentEditTask();
        const timeGoalMinutes = isEditDraftMilestone ? ctx.getEditTaskTimeGoalMinutes() : ctx.getAddTaskTimeGoalMinutesState();
        if (ctx.isCheckpointAtOrAboveTimeGoal(nextHours, ctx.milestoneUnitSec(elapsedPadMilestoneRef.task), timeGoalMinutes)) {
          const timeGoalText = ctx.formatCheckpointTimeGoalText(elapsedPadMilestoneRef.task, {
            timeGoalMinutes,
            forEditDraft: isEditDraftMilestone,
          });
          setElapsedPadError(`Checkpoint must be less than the time goal of ${timeGoalText}`);
          return;
        }
        elapsedPadMilestoneRef.milestone.hours = nextHours;
        elapsedPadMilestoneRef.task.milestones = elapsedPadMilestoneRef.ms;
        if (elapsedPadMilestoneRef.onApplied) elapsedPadMilestoneRef.onApplied();
        else ctx.renderMilestoneEditor(elapsedPadMilestoneRef.task);
      }
    } else if (!applyValue && elapsedPadTarget) {
      elapsedPadTarget.value = elapsedPadOriginal;
    }
    clearElapsedPadError();
    if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "none";
    const editIndex = ctx.getEditIndex();
    const tasks = ctx.getTasks();
    if (editIndex != null && tasks[editIndex]) {
      ctx.syncEditCheckpointAlertUi(tasks[editIndex]);
      ctx.syncEditSaveAvailability(tasks[editIndex]);
    }
    ctx.setElapsedPadTarget(null);
    ctx.setElapsedPadMilestoneRef(null);
    ctx.setElapsedPadDraft("");
    ctx.setElapsedPadOriginal("");
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const raw = `${ctx.getElapsedPadDraft() || ""}${digit}`;
    const next = raw.includes(".") ? raw : raw.replace(/^0+(?=\d)/, "");
    ctx.setElapsedPadDraft(next.slice(0, 6) || "0");
    renderElapsedPadDisplay();
  }

  function padAppendDot() {
    clearElapsedPadError();
    if (!ctx.getElapsedPadMilestoneRef() || ctx.getElapsedPadTarget()) return;
    const current = ctx.getElapsedPadDraft() || "0";
    if (current.includes(".")) return;
    ctx.setElapsedPadDraft(`${current}.`);
    renderElapsedPadDisplay();
  }

  function padBackspace() {
    clearElapsedPadError();
    const next = (ctx.getElapsedPadDraft() || "").slice(0, -1);
    ctx.setElapsedPadDraft(next || "0");
    renderElapsedPadDisplay();
  }

  function padClear() {
    clearElapsedPadError();
    ctx.setElapsedPadDraft("0");
    renderElapsedPadDisplay();
  }

  function nextDuplicateName(originalName: string) {
    const name = (originalName || "Task").trim();
    const root = name.replace(/\s\d+$/, "").trim();
    let maxN = 0;
    ctx.getTasks().forEach((t) => {
      const n = (t.name || "").trim();
      if (n === root) return;
      const match = n.match(new RegExp(`^${escapeRegExp(root)}\\s(\\d+)$`));
      if (!match) return;
      const value = parseInt(match[1], 10);
      if (!isNaN(value)) maxN = Math.max(maxN, value);
    });
    return `${root} ${maxN + 1}`;
  }

  function duplicateTask(i: number) {
    const tasks = ctx.getTasks();
    const t = tasks[i];
    if (!t) return;
    const newId = newTaskId();
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = newId;
    copy.name = nextDuplicateName(t.name);
    copy.running = false;
    copy.startMs = null;
    tasks.splice(i + 1, 0, copy);
    const historyByTaskId = ctx.getHistoryByTaskId();
    const sourceTaskId = String(t.id || "");
    historyByTaskId[newId] = historyByTaskId && historyByTaskId[sourceTaskId] ? JSON.parse(JSON.stringify(historyByTaskId[sourceTaskId])) : [];
    ctx.saveHistory(historyByTaskId);
    ctx.save();
    ctx.render();
  }

  function handleTaskListClick(e: any) {
    const taskEl = e.target?.closest?.(".task");
    if (!taskEl) return;
    const i = parseInt(taskEl.dataset.index, 10);
    if (!Number.isFinite(i)) return;
    const taskId = String(taskEl.dataset.taskId || "").trim();
    const flipBtn = e.target?.closest?.("[data-task-flip]") as HTMLElement | null;
    if (flipBtn && taskId) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      ctx.setTaskFlipped(taskId, flipBtn.getAttribute("data-task-flip") === "open", taskEl as HTMLElement);
      return;
    }
    const btn = e.target?.closest?.("[data-action]");
    if (!btn) {
      const inTopRow = !!e.target?.closest?.(".row");
      const inActions = !!e.target?.closest?.(".actions");
      if (inTopRow && !inActions) ctx.openFocusMode(i);
      return;
    }
    const action = btn.getAttribute("data-action");
    if (action === "start") startTask(i);
    else if (action === "stop") stopTask(i);
    else if (action === "reset") resetTask(i);
    else if (action === "delete") ctx.deleteTask(i);
    else if (action === "edit") openEdit(i);
    else if (action === "history") openHistory(i);
    else if (action === "duplicate") duplicateTask(i);
    else if (action === "editName" || action === "focus") ctx.openFocusMode(i);
    else if (action === "collapse") toggleCollapse(i);
    else if (action === "exportTask") ctx.openTaskExportModal(i);
    else if (action === "shareTask") ctx.openShareTaskModal(i);
    else if (action === "unshareTask") {
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
              if (ctx.getCurrentAppPage() === "test2") await ctx.refreshGroupsData();
              ctx.render();
            })
            .finally(() => ctx.closeConfirm());
        },
      });
    } else if (action === "muteCheckpointAlert") {
      ctx.stopCheckpointRepeatAlert();
      return;
    } else if (action === "showSuppressedCheckpointAlert") {
      const suppressedAlert = ctx.getSuppressedFocusModeAlert(taskId) as any;
      if (!suppressedAlert) return;
      ctx.enqueueCheckpointToast(suppressedAlert.title, suppressedAlert.text, {
        autoCloseMs: suppressedAlert.autoCloseMs,
        taskId: suppressedAlert.taskId,
        taskName: suppressedAlert.taskName,
        counterText: suppressedAlert.counterText,
        checkpointTimeText: suppressedAlert.checkpointTimeText,
        checkpointDescText: suppressedAlert.checkpointDescText,
        muteRepeatOnManualDismiss: suppressedAlert.muteRepeatOnManualDismiss,
      });
      ctx.clearSuppressedFocusModeAlert(taskId);
      ctx.render();
      return;
    }
    if (taskId) ctx.setTaskFlipped(taskId, false, taskEl as HTMLElement);
  }

  function handleEditNameInput() {
    const t = ctx.getCurrentEditTask();
    if (!t) return;
    ctx.syncEditTaskDurationReadout(t);
    ctx.syncEditSaveAvailability(t);
  }

  function handleElapsedPadOverlayClick(e: any) {
    if (e.target === els.elapsedPadOverlay) closeElapsedPad(false);
  }

  function handleElapsedPadKeyClick(event: any) {
    const el = event?.currentTarget as HTMLElement | null;
    if (!el) return;
    const digit = el.getAttribute("data-pad-digit");
    const action = el.getAttribute("data-pad-action");
    if (digit != null) {
      padAppendDigit(digit);
      return;
    }
    if (action === "back") {
      padBackspace();
      return;
    }
    if (action === "dot") {
      padAppendDot();
      return;
    }
    if (action === "clear") padClear();
  }

  function registerTaskEvents() {
    ctx.on(els.taskList, "click", handleTaskListClick);
    ctx.on(els.resetAllBtn, "click", (e: any) => {
      e?.preventDefault?.();
      resetAll();
    });
    ctx.on(els.cancelEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(false);
    });
    ctx.on(els.saveEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(true);
    });
    ctx.on(els.editName, "input", handleEditNameInput);
    ctx.on(els.editOverrideElapsedToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (isEditElapsedOverrideEnabled()) {
        setEditElapsedOverrideEnabled(false);
        const currentTask = ctx.getCurrentEditTask();
        if (currentTask) ctx.syncEditSaveAvailability(currentTask);
        return;
      }
      confirmEnableElapsedOverride();
    });
    [els.editD, els.editH, els.editM, els.editS].forEach((input) => {
      ctx.on(input, "focus", () => {
        maybeAutoClearEditElapsedField(input);
      });
      ctx.on(input, "input", () => {
        if (!isEditElapsedOverrideEnabled()) return;
        const currentTask = ctx.getCurrentEditTask();
        if (currentTask) ctx.syncEditSaveAvailability(currentTask);
      });
      ctx.on(input, "blur", () => {
        normalizeEditElapsedValue(input);
        const currentTask = ctx.getCurrentEditTask();
        if (currentTask) ctx.syncEditSaveAvailability(currentTask);
      });
      ctx.on(input, "click", () => {
        if (!input) return;
        ctx.setElapsedPadTarget(input);
        ctx.setElapsedPadOriginal(String(input.value || "0"));
        ctx.setElapsedPadDraft(String(input.value || "0"));
        clearElapsedPadError();
        renderElapsedPadDisplay();
        if (els.elapsedPadTitle) els.elapsedPadTitle.textContent = "Set Elapsed Time";
        if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
      });
    });
    ctx.on(els.elapsedPadOverlay, "click", handleElapsedPadOverlayClick);
    ctx.on(els.elapsedPadCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeElapsedPad(false);
    });
    ctx.on(els.elapsedPadDoneBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeElapsedPad(true);
    });
    const padKeys = Array.from(document.querySelectorAll("#elapsedPadOverlay [data-pad-digit], #elapsedPadOverlay [data-pad-action]"));
    padKeys.forEach((el) => ctx.on(el as HTMLElement, "click", handleElapsedPadKeyClick));
  }

  return {
    renderTasksPage,
    startTask,
    stopTask,
    resetTask,
    resetAll,
    resetTaskStateImmediate,
    openEdit,
    closeEdit,
    openElapsedPadForMilestone,
    closeElapsedPad,
    openHistory,
    registerTaskEvents,
  };
}
