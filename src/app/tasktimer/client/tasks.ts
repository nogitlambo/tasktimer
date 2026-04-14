import { escapeRegExp, newTaskId } from "../lib/ids";
import type { DeletedTaskMeta, Task } from "../lib/types";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import type { TaskTimerTasksContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTasks(ctx: TaskTimerTasksContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;

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
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    tasks.forEach((t, index) => {
      const elapsedMs = ctx.getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;
      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
      const msSorted = hasMilestones ? ctx.sortMilestones(t.milestones) : [];
      const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
      const timeGoalSec = hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0;
      const maxSec = Math.max(maxValue * sharedTasks.milestoneUnitSec(t), timeGoalSec, 1);
      const pct = hasMilestones || hasTimeGoal ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

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
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = taskId;
      taskEl.setAttribute("draggable", "true");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";
      let progressHTML = "";
      if (hasMilestones || hasTimeGoal) {
        let markers = "";
        const unitSuffix = sharedTasks.milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;
        const nextPendingIndex = msSorted.findIndex((m) => elapsedSec < (+m.hours || 0) * sharedTasks.milestoneUnitSec(t));
        const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, msSorted.length - 1);
        msSorted.forEach((m, msIdx) => {
          const val = +m.hours || 0;
          const secTarget = val * sharedTasks.milestoneUnitSec(t);
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
                <div class="progressFill" style="width:${pct}%;background:${ctx.getDynamicColorsEnabled() ? ctx.fillBackgroundForPct(pct) : ctx.getModeColor("mode1")}"></div>
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
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="analyse" title="${canUseAdvancedHistory() ? "Analysis" : "Pro feature: Analysis"}" aria-label="${canUseAdvancedHistory() ? "Analysis" : "Pro feature: Analysis"}" ${canUseAdvancedHistory() ? "" : 'data-plan-locked="advancedHistory"'}>&#128269;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="manage" title="${canUseAdvancedHistory() ? "Manage" : "Pro feature: History Manager"}" aria-label="${canUseAdvancedHistory() ? "Manage" : "Pro feature: History Manager"}" ${canUseAdvancedHistory() ? "" : 'data-plan-locked="advancedHistory"'}>&#9881;</button>
                <button class="historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">X</button>
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
                <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#8942;</button>
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
                <button class="iconBtn taskFlipBtn taskFlipBackBtn" type="button" data-task-flip="close" title="Back to task" aria-label="Back to task" aria-expanded="false">&#8594;</button>
                <div class="taskBackTitle">${ctx.escapeHtmlUI(t.name)}</div>
              </div>
              <div class="taskBackActions">
                <button class="taskMenuItem" data-action="duplicate" title="Duplicate" type="button">Duplicate</button>
                <button class="taskMenuItem" data-action="collapse" title="${ctx.escapeHtmlUI(collapseLabel)}" type="button">${ctx.escapeHtmlUI(collapseLabel)}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
                <button class="taskMenuItem" data-action="${ctx.isTaskSharedByOwner(taskId) ? "unshareTask" : "shareTask"}" title="${canUseSocialFeatures() ? ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share" : "Pro feature: Sharing"}" type="button" ${canUseSocialFeatures() ? "" : 'data-plan-locked="socialFeatures"'}>${canUseSocialFeatures() ? ctx.isTaskSharedByOwner(taskId) ? "Unshare" : "Share" : "Share (Pro)"}</button>
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
    t.running = false;
    t.startMs = null;
    ctx.clearCheckpointBaseline(t.id);
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    ctx.render();
  }

  function resetTaskStateImmediate(t: Task, opts?: { logHistory?: boolean; sessionNote?: string; completionDifficulty?: unknown }) {
    if (!t) return;
    const taskId = String(t.id || "");
    ctx.flushPendingFocusSessionNoteSave(taskId);
    if (!!opts?.logHistory && ctx.canLogSession(t)) {
      const ms = ctx.getTaskElapsedMs(t);
      const completedAtMs = Date.now();
      if (ms > 0) ctx.appendCompletedSessionHistory(t, completedAtMs, ms, opts?.sessionNote, normalizeCompletionDifficulty(opts?.completionDifficulty));
    }
    t.accumulatedMs = 0;
    t.running = false;
    t.startMs = null;
    t.hasStarted = false;
    t.xpDisqualifiedUntilReset = false;
    ctx.clearTaskTimeGoalFlow(taskId);
    ctx.clearRewardSessionTracker(taskId);
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
            ctx.save();
            if (uid && affectedTaskIds.length) {
              void Promise.all(affectedTaskIds.map((taskId) => ctx.deleteSharedTaskSummariesForTask(uid, taskId).catch(() => {})))
                .then(() => ctx.refreshOwnSharedSummaries())
                .catch(() => {});
            }
            ctx.render();
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
          ctx.render();
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
    if ((action === "shareTask" || action === "unshareTask") && !canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing and friends", "pro");
      return;
    }
    if (action === "start") startTask(i);
    else if (action === "stop") stopTask(i);
    else if (action === "reset") resetTask(i);
    else if (action === "delete") ctx.deleteTask(i);
    else if (action === "edit") ctx.openEdit(i);
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
      if (taskId) ctx.broadcastCheckpointAlertMute(taskId);
      ctx.stopCheckpointRepeatAlert();
      return;
    }
    if (taskId) ctx.setTaskFlipped(taskId, false, taskEl as HTMLElement);
  }

  function registerTaskEvents() {
    ctx.on(els.taskList, "click", handleTaskListClick);
    ctx.on(els.resetAllBtn, "click", (e: any) => {
      e?.preventDefault?.();
      resetAll();
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
