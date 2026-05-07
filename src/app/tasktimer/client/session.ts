import type { LiveTaskSession, Task } from "../lib/types";
import { nowMs } from "../lib/time";
import { computeFocusInsights } from "../lib/focusInsights";
import { awardCompletedSessionXp } from "../lib/rewards";
import { formatFocusElapsed } from "../lib/tasks";
import { normalizeCompletionDifficulty, type CompletionDifficulty } from "../lib/completionDifficulty";
import { findNextScheduledTaskAfterLocalTime } from "../lib/schedule-placement";
import type { TaskTimerSessionContext } from "./context";
import { getDelegatedAction } from "./delegated-actions";
import { buildTaskProgressModel } from "./task-card-view-model";
import { createFocusSessionDrafts, createLocalStorageFocusSessionDraftStorage } from "./focus-session-drafts";

/* eslint-disable @typescript-eslint/no-explicit-any */

type CheckpointToast = {
  id: string;
  title: string;
  text: string;
  checkpointTimeText: string | null;
  checkpointDescText: string | null;
  taskName: string | null;
  counterText: string | null;
  autoCloseMs: number | null;
  autoCloseAtMs: number | null;
  taskId: string | null;
  muteRepeatOnManualDismiss: boolean;
};

type DeferredTimeGoalModalEntry = { taskId: string; frozenElapsedMs: number; reminder: boolean };

export function shouldKeepTimeGoalCompletionFlowForTask(
  task: Task | null | undefined,
  opts: {
    elapsedMs: number;
    liveSession?: LiveTaskSession | null;
    getTaskTimeGoalAction?: (task: Task) => string;
  }
) {
  if (!task || !task.running) return false;
  const taskId = String(task.id || "").trim();
  const liveSessionTaskId = String(opts.liveSession?.taskId || "").trim();
  if (!taskId || liveSessionTaskId !== taskId) return false;
  const timeGoalMinutes = Number(task.timeGoalMinutes || 0);
  if (!(task.timeGoalEnabled && timeGoalMinutes > 0)) return false;
  if ((opts.getTaskTimeGoalAction?.(task) || "confirmModal") !== "confirmModal") return false;
  const elapsedMs = Math.max(0, Math.floor(Number(opts.elapsedMs || 0) || 0));
  return elapsedMs >= Math.round(timeGoalMinutes * 60 * 1000);
}

export function shiftValidDeferredTimeGoalModal(
  queue: DeferredTimeGoalModalEntry[],
  opts: {
    tasks: Task[];
    liveSessionsByTaskId: Record<string, LiveTaskSession | undefined | null>;
    getTaskTimeGoalAction?: (task: Task) => string;
  }
): { nextPending: DeferredTimeGoalModalEntry | null; remainingQueue: DeferredTimeGoalModalEntry[] } {
  const pendingQueue = Array.isArray(queue) ? queue : [];
  for (let index = 0; index < pendingQueue.length; index += 1) {
    const pending = pendingQueue[index];
    const taskId = String(pending?.taskId || "").trim();
    const task = opts.tasks.find((row) => String(row.id || "").trim() === taskId) || null;
    const liveSession = taskId ? opts.liveSessionsByTaskId[taskId] || null : null;
    if (
      shouldKeepTimeGoalCompletionFlowForTask(task, {
        elapsedMs: Math.max(0, Math.floor(Number(pending?.frozenElapsedMs || 0) || 0)),
        liveSession,
        getTaskTimeGoalAction: opts.getTaskTimeGoalAction,
      })
    ) {
      return {
        nextPending: pending,
        remainingQueue: pendingQueue.slice(index + 1),
      };
    }
  }
  return { nextPending: null, remainingQueue: [] };
}

export function createTaskTimerSession(ctx: TaskTimerSessionContext) {
  const { els, runtime } = ctx;
  const { sharedTasks } = ctx;
  const getDeferredQueue = () => ctx.getDeferredFocusModeTimeGoalModals();
  const getToastQueue = () => ctx.getCheckpointToastQueue() as CheckpointToast[];
  const getActiveToast = () => ctx.getActiveCheckpointToast() as CheckpointToast | null;
  const setActiveToast = (value: CheckpointToast | null) => ctx.setActiveCheckpointToast(value as unknown);

  const focusSessionDrafts = createFocusSessionDrafts(
    {
      getDrafts: () => ctx.getFocusSessionNotesByTaskId(),
      setDrafts: (next) => ctx.setFocusSessionNotesByTaskId(next),
      getActiveTaskId: () => ctx.getFocusModeTaskId(),
      getPendingSaveTimer: () => ctx.getFocusSessionNoteSaveTimer(),
      setPendingSaveTimer: (next) => ctx.setFocusSessionNoteSaveTimer(next),
      getInputValue: () => String(els.focusSessionNotesInput?.value || ""),
      setInputValue: (next) => {
        if (els.focusSessionNotesInput) els.focusSessionNotesInput.value = next;
      },
      setSectionOpen: (open) => {
        if (els.focusSessionNotesSection) {
          els.focusSessionNotesSection.setAttribute("data-notes-visible", String(open));
        }
      },
    },
    createLocalStorageFocusSessionDraftStorage(ctx.storageKeys.FOCUS_SESSION_NOTES_KEY)
  );

  function loadFocusSessionNotes() {
    return focusSessionDrafts.load();
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    focusSessionDrafts.setDraft(taskId, noteRaw);
  }

  function clearFocusSessionDraft(taskId: string) {
    focusSessionDrafts.clearDraft(taskId);
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    focusSessionDrafts.syncInput(taskId);
    clearFocusSessionNotesSavedStatus();
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    focusSessionDrafts.syncAccordion(taskId);
  }

  function clearFocusSessionNotesSavedStatus() {
    if (!els.focusSessionNotesSavedText) return;
    els.focusSessionNotesSavedText.textContent = "";
    (els.focusSessionNotesSavedText as HTMLElement).style.display = "none";
  }

  function showFocusSessionNotesSavedStatus() {
    if (!els.focusSessionNotesSavedText) return;
    els.focusSessionNotesSavedText.textContent = "Session note automatically saved to this session.";
    (els.focusSessionNotesSavedText as HTMLElement).style.display = "block";
  }

  function maybeShowFocusSessionNotesSavedStatus(taskId?: string | null) {
    const activeTaskId = String(ctx.getFocusModeTaskId() || "").trim();
    const targetTaskId = String(taskId || activeTaskId).trim();
    if (!activeTaskId || !targetTaskId || activeTaskId !== targetTaskId) return;
    if (!String(els.focusSessionNotesInput?.value || "").trim()) {
      clearFocusSessionNotesSavedStatus();
      return;
    }
    flushPendingFocusSessionNoteSave(targetTaskId);
    showFocusSessionNotesSavedStatus();
  }

  function scheduleFocusSessionNoteSave(taskId: string, noteRaw: string) {
    const timer = ctx.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      ctx.setFocusSessionNoteSaveTimer(null);
    }
    ctx.setFocusSessionNoteSaveTimer(
      window.setTimeout(() => {
        focusSessionDrafts.setDraft(taskId, noteRaw);
        ctx.setFocusSessionNoteSaveTimer(null);
      }, 250)
    );
  }

  function flushPendingFocusSessionNoteSave(taskId?: string | null) {
    focusSessionDrafts.flushPendingSave(taskId);
  }

  function captureSessionNoteSnapshot(taskId?: string | null) {
    return focusSessionDrafts.captureSnapshot(taskId);
  }

  function captureResetActionSessionNote(taskId?: string | null) {
    return focusSessionDrafts.captureResetActionSnapshot(taskId);
  }

  function getElapsedMs(task: Task) {
    if (String(ctx.getTimeGoalModalTaskId() || "") === String(task?.id || "")) {
      return Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0));
    }
    if (task.running && task.startMs) return (task.accumulatedMs || 0) + (nowMs() - task.startMs);
    return task.accumulatedMs || 0;
  }

  function getTaskElapsedMs(task: Task) {
    if (String(ctx.getTimeGoalModalTaskId() || "") === String(task?.id || "")) {
      return Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0));
    }
    const runMs = task.running && typeof task.startMs === "number" ? Math.max(0, nowMs() - task.startMs) : 0;
    return Math.max(0, (task.accumulatedMs || 0) + runMs);
  }

  function getActiveTimeGoalModalTaskId() {
    const stateTaskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
    if (stateTaskId) return stateTaskId;
    return String((els.timeGoalCompleteOverlay as HTMLElement | null)?.dataset.taskId || "").trim();
  }

  function getActiveTimeGoalModalTask() {
    const taskId = getActiveTimeGoalModalTaskId();
    if (!taskId) return null;
    return ctx.getTasks().find((row) => String(row.id || "").trim() === taskId) || null;
  }

  function getNextScheduledTaskAfterNow(excludeTaskIdRaw?: string | null, nowDate = new Date()) {
    return findNextScheduledTaskAfterLocalTime(ctx.getTasks(), { excludeTaskId: excludeTaskIdRaw, nowDate });
  }

  function syncTimeGoalCompleteLaunchNextButton() {
    const button = els.timeGoalCompleteLaunchNextBtn as HTMLButtonElement | null;
    if (!button) return;
    const activeTaskId = getActiveTimeGoalModalTaskId();
    const next = getNextScheduledTaskAfterNow(activeTaskId);
    if (!next) {
      button.hidden = true;
      button.disabled = true;
      delete button.dataset.nextTaskId;
      button.textContent = "Launch Next Task";
      return;
    }
    button.hidden = false;
    button.disabled = false;
    button.dataset.nextTaskId = String(next.task.id || "");
    button.textContent = `Launch ${String(next.task.name || "Task")}`;
  }

  function getSelectedTimeGoalCompletionDifficulty(): CompletionDifficulty | undefined {
    const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
    return normalizeCompletionDifficulty(overlay?.dataset.completionDifficulty);
  }

  function setTimeGoalCompletionValidation(message?: string) {
    const validationEl = els.timeGoalCompleteValidation as HTMLElement | null;
    if (!validationEl) return;
    const nextMessage = String(message || "").trim();
    validationEl.textContent = nextMessage;
    validationEl.hidden = !nextMessage;
  }

  function syncTimeGoalCompletionDifficultyUi(valueRaw?: unknown) {
    const value = normalizeCompletionDifficulty(valueRaw);
    const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
    if (overlay) {
      if (value) overlay.dataset.completionDifficulty = String(value);
      else delete overlay.dataset.completionDifficulty;
    }
    const buttons = Array.from(
      ((els.timeGoalCompleteDifficultyGroup as HTMLElement | null)?.querySelectorAll?.("[data-completion-difficulty]") || []) as Iterable<Element>
    );
    buttons.forEach((button) => {
      const selected = normalizeCompletionDifficulty((button as HTMLElement).dataset.completionDifficulty) === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
    if (value) setTimeGoalCompletionValidation("");
  }

  function clearPendingTimeGoalFlow() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function clearTaskTimeGoalFlow(taskId?: string | null) {
    const normalizedTaskId = String(taskId || "").trim();
    const activeModalTaskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
    if (normalizedTaskId && activeModalTaskId === normalizedTaskId) {
      ctx.setTimeGoalModalTaskId(null);
      ctx.setTimeGoalModalFrozenElapsedMs(0);
    }
    if (
      !normalizedTaskId ||
      !activeModalTaskId ||
      normalizedTaskId === activeModalTaskId
    ) {
      clearPendingTimeGoalFlow();
      ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    }
    if (
      !normalizedTaskId ||
      String((els.timeGoalCompleteOverlay as HTMLElement | null)?.dataset.taskId || "").trim() === normalizedTaskId
    ) {
      const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
      if (overlay) delete overlay.dataset.taskId;
    }
    setTimeGoalCompletionValidation("");
    syncTimeGoalCompletionDifficultyUi();
    syncTimeGoalCompleteLaunchNextButton();
    if (normalizedTaskId) delete ctx.getTimeGoalReminderAtMsByTaskId()[normalizedTaskId];
  }

  function persistPendingTimeGoalFlow(task: Task, step: "main", opts?: { reminder?: boolean; completionDifficulty?: CompletionDifficulty }) {
    const taskId = String(task?.id || "").trim();
    if (!taskId || typeof window === "undefined") return;
    const completionDifficulty = normalizeCompletionDifficulty(opts?.completionDifficulty) || getSelectedTimeGoalCompletionDifficulty();
    try {
      window.localStorage.setItem(
        ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY,
        JSON.stringify({
          taskId,
          step,
          frozenElapsedMs: Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0)),
          reminder: !!opts?.reminder,
          ...(completionDifficulty ? { completionDifficulty } : {}),
        })
      );
    } catch {
      // ignore localStorage failures
    }
  }

  function loadPendingTimeGoalFlow():
    | { taskId: string; step: "main"; frozenElapsedMs: number; reminder: boolean; completionDifficulty?: CompletionDifficulty }
    | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const taskId = String(parsed?.taskId || "").trim();
      const frozenElapsedMs = Math.max(0, Math.floor(Number(parsed?.frozenElapsedMs || 0) || 0));
      const reminder = !!parsed?.reminder;
      const completionDifficulty = normalizeCompletionDifficulty(parsed?.completionDifficulty);
      if (!taskId) return null;
      return { taskId, step: "main", frozenElapsedMs, reminder, completionDifficulty };
    } catch {
      return null;
    }
  }

  function getTaskTimeGoalAction(task: Task | null | undefined) {
    void task;
    return "confirmModal";
  }

  function shouldKeepTimeGoalCompletionFlow(task: Task | null | undefined, elapsedMsOverride?: number | null) {
    if (!task) return false;
    const taskId = String(task.id || "").trim();
    const elapsedMs =
      elapsedMsOverride != null && Number.isFinite(Number(elapsedMsOverride))
        ? Math.max(0, Math.floor(Number(elapsedMsOverride) || 0))
        : getTaskElapsedMs(task);
    return shouldKeepTimeGoalCompletionFlowForTask(task, {
      elapsedMs,
      liveSession: taskId ? ctx.getLiveSessionsByTaskId()[taskId] || null : null,
      getTaskTimeGoalAction,
    });
  }

  function getTimeGoalCompletionAwardXp(task: Task, elapsedMs: number) {
    const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    if (safeElapsedMs <= 0) return 0;
    const award = awardCompletedSessionXp(ctx.getRewardProgress(), {
      taskId: String(task.id || "").trim() || null,
      awardedAt: nowMs(),
      elapsedMs: safeElapsedMs,
      historyByTaskId: ctx.getHistoryByTaskId(),
      tasks: ctx.getTasks(),
      weekStarting: ctx.getWeekStarting(),
      momentumEntitled: ctx.hasEntitlement("advancedInsights"),
    });
    return Math.max(0, Math.floor(Number(award.amount || 0) || 0));
  }

  function openTimeGoalCompleteModal(task: Task, elapsedMs: number, opts?: { reminder?: boolean; completionDifficulty?: CompletionDifficulty }) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    ctx.setTimeGoalModalTaskId(taskId);
    ctx.setTimeGoalModalFrozenElapsedMs(Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)));
    if (els.timeGoalCompleteOverlay) {
      (els.timeGoalCompleteOverlay as HTMLElement).dataset.taskId = taskId;
    }
    delete ctx.getTimeGoalReminderAtMsByTaskId()[taskId];
    if (els.timeGoalCompleteTitle) {
      els.timeGoalCompleteTitle.textContent = `${String(task.name || "Task")} Complete!`;
    }
    const awardedXp = getTimeGoalCompletionAwardXp(task, elapsedMs);
    if (els.timeGoalCompleteText) {
      els.timeGoalCompleteText.textContent = `You've been awarded ${awardedXp} XP`;
    }
    if (els.timeGoalCompleteMeta) els.timeGoalCompleteMeta.textContent = "";
    setTimeGoalCompletionValidation("");
    if (els.timeGoalCompleteNoteInput) {
      els.timeGoalCompleteNoteInput.value = captureSessionNoteSnapshot(taskId);
    }
    syncTimeGoalCompletionDifficultyUi(opts?.completionDifficulty);
    syncTimeGoalCompleteLaunchNextButton();
    persistPendingTimeGoalFlow(task, "main", opts);
    ctx.openOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
  }

  function maybeRestorePendingTimeGoalFlow() {
    const pending = loadPendingTimeGoalFlow();
    const tasks = ctx.getTasks();
    if (pending) {
      const task = tasks.find((row) => String(row.id || "") === pending.taskId) || null;
      if (!shouldKeepTimeGoalCompletionFlow(task, pending.frozenElapsedMs)) {
        clearPendingTimeGoalFlow();
        if (pending.taskId) clearTaskTimeGoalFlow(pending.taskId);
        return;
      }
      if (!task) return;
      if (
        String(ctx.getTimeGoalModalTaskId() || "") !== pending.taskId ||
        !(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) > 0)
      ) {
        openTimeGoalCompleteModal(task, pending.frozenElapsedMs || getTaskElapsedMs(task), {
          reminder: pending.reminder,
          completionDifficulty: pending.completionDifficulty,
        });
      }
      return;
    }
    if (String(ctx.getTimeGoalModalTaskId() || "").trim()) return;
    const overdueTask = tasks.find((row) => !!row?.running && shouldKeepTimeGoalCompletionFlow(row));
    if (!overdueTask) return;
    openTimeGoalCompleteModal(overdueTask, getTaskElapsedMs(overdueTask), { reminder: true });
  }

  function syncTimeGoalModalWithTaskState() {
    const activeTaskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
    if (!activeTaskId) {
      syncTimeGoalCompleteLaunchNextButton();
      return;
    }
    const task = ctx.getTasks().find((row) => String(row.id || "") === activeTaskId) || null;
    if (shouldKeepTimeGoalCompletionFlow(task, ctx.getTimeGoalModalFrozenElapsedMs())) {
      syncTimeGoalCompleteLaunchNextButton();
      return;
    }
    clearTaskTimeGoalFlow(activeTaskId);
    ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  async function resolveTimeGoalCompletion(task: Task, opts: { logHistory: boolean }) {
    const taskId = String(task.id || "");
    const completionDifficulty = getSelectedTimeGoalCompletionDifficulty();
    if (opts.logHistory && !completionDifficulty) {
      setTimeGoalCompletionValidation("Select a sentiment before closing this session.");
      ctx.openOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      return false;
    }
    if (taskId && els.timeGoalCompleteNoteInput) {
      setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput.value || ""));
    }
    const sessionNote = captureResetActionSessionNote(taskId);
    if (sessionNote) setFocusSessionDraft(taskId, sessionNote);
    ctx.resetTaskStateImmediate(task, { logHistory: opts.logHistory, sessionNote, completionDifficulty });
    clearTaskTimeGoalFlow(taskId);
    ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    ctx.save();
    if (!opts.logHistory) {
      void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    }
    ctx.render();
    openDeferredFocusModeTimeGoalModal();
    return true;
  }

  function syncFocusRunButtons(task?: Task | null) {
    const running = !!task?.running;
    const hintText = running ? "Tap to Stop" : task ? "Tap to Resume" : "Tap to Launch";
    if (els.focusDialHint) els.focusDialHint.textContent = hintText;
    if (els.focusResetBtn) els.focusResetBtn.disabled = !!task?.running;
    if (els.focusDial) {
      els.focusDial.classList.toggle("isRunning", running);
      els.focusDial.classList.toggle("isStopped", !!task && !running);
      els.focusDial.setAttribute("aria-pressed", running ? "true" : "false");
      els.focusDial.setAttribute("aria-label", `Focus dial. ${hintText.toLowerCase()} timer`);
    }
  }

  function syncFocusCheckpointToggleUi() {
    if (!els.focusCheckpointToggle) return;
    const on = !!ctx.getFocusShowCheckpoints();
    els.focusCheckpointToggle.classList.toggle("on", on);
    els.focusCheckpointToggle.setAttribute("aria-checked", on ? "true" : "false");
  }

  function formatSignedDelta(msRaw: number) {
    if (!Number.isFinite(msRaw)) return "--";
    const sign = msRaw > 0 ? "+" : msRaw < 0 ? "-" : "";
    const absoluteMs = Math.abs(Math.round(msRaw));
    const totalMinutes = Math.floor(absoluteMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${sign}${hours}h ${minutes}m`;
    return `${sign}${minutes}m`;
  }

  function setFocusInsightDeltaValue(el: HTMLElement | null, ms: number) {
    if (!el) return;
    if (!Number.isFinite(ms)) {
      el.textContent = "--";
      el.classList.remove("is-positive", "is-negative");
      return;
    }
    el.textContent = formatSignedDelta(ms);
    el.classList.toggle("is-positive", ms > 0);
    el.classList.toggle("is-negative", ms < 0);
  }

  function updateFocusInsights(task: Task) {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return;
    const history = Array.isArray(ctx.getHistoryByTaskId()?.[taskId]) ? ctx.getHistoryByTaskId()[taskId] : [];
    const entries = history
      .map((entry: any) => ({
        ts: ctx.normalizeHistoryTimestampMs(entry?.ts),
        ms: Math.max(0, Number(entry?.ms || 0) || 0),
        completionDifficulty: normalizeCompletionDifficulty(entry?.completionDifficulty),
      }))
      .filter((entry) => entry.ts > 0 && entry.ms >= 0);
    if (task.running) entries.push({ ts: nowMs(), ms: getTaskElapsedMs(task), completionDifficulty: undefined });
    const insights = computeFocusInsights(entries, nowMs(), {
      startTime: ctx.getOptimalProductivityStartTime(),
      endTime: ctx.getOptimalProductivityEndTime(),
    });
    if (els.focusInsightBest) {
      els.focusInsightBest.textContent = insights.bestMs > 0 ? ctx.formatTime(insights.bestMs) : "--";
    }
    if (els.focusInsightWeekday) {
      if (insights.weekdayName) {
        els.focusInsightWeekday.textContent = `${insights.weekdayName} (${insights.weekdaySessionCount})`;
        els.focusInsightWeekday.classList.remove("is-empty");
      } else {
        els.focusInsightWeekday.textContent = "No logged sessions yet";
        els.focusInsightWeekday.classList.add("is-empty");
      }
    }
    setFocusInsightDeltaValue(els.focusInsightTodayDelta as HTMLElement | null, insights.todayDeltaMs);
    setFocusInsightDeltaValue(els.focusInsightWeekDelta as HTMLElement | null, insights.weekDeltaMs);
    if (els.focusInsightDifficulty) {
      if (insights.completionDifficultyLabel) {
        els.focusInsightDifficulty.textContent = insights.completionDifficultyLabel;
        els.focusInsightDifficulty.classList.remove("is-empty");
      } else {
        els.focusInsightDifficulty.textContent = "No challenge ratings yet";
        els.focusInsightDifficulty.classList.add("is-empty");
      }
    }
    if (els.focusInsightProductivityPeriod) {
      els.focusInsightProductivityPeriod.textContent =
        insights.productivityPeriodMs > 0 ? ctx.formatTime(insights.productivityPeriodMs) : "--";
      els.focusInsightProductivityPeriod.classList.toggle("is-empty", insights.productivityPeriodMs <= 0);
    }
  }

  function checkpointKeyForTask(m: { hours: number; description: string }, task: Task) {
    const unitSeconds = sharedTasks.milestoneUnitSec(task);
    const targetSec = Math.max(0, Math.round((+m.hours || 0) * unitSeconds));
    const label = String(m.description || "").trim();
    return `${targetSec}|${label}`;
  }

  function resetCheckpointAlertTracking(taskId: string | null | undefined, opts?: { clearBaseline?: boolean }) {
    const id = String(taskId || "");
    if (!id) return;
    delete ctx.getCheckpointFiredKeysByTaskId()[id];
    if (opts?.clearBaseline !== false) delete ctx.getCheckpointBaselineSecByTaskId()[id];
  }

  function clearCheckpointBaseline(taskId: string | null | undefined) {
    const id = String(taskId || "");
    if (!id) return;
    delete ctx.getCheckpointBaselineSecByTaskId()[id];
  }

  function getCheckpointFiredSet(taskId: string) {
    const map = ctx.getCheckpointFiredKeysByTaskId();
    if (!map[taskId]) map[taskId] = new Set<string>();
    return map[taskId];
  }

  function renderFocusCheckpointCompletionLog(task: Task | null) {
    const listEl = els.focusCheckpointLogList as HTMLElement | null;
    const emptyEl = els.focusCheckpointLogEmpty as HTMLElement | null;
    if (!listEl || !emptyEl) return;
    if (!task || !task.milestonesEnabled || !Array.isArray(task.milestones) || task.milestones.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    const taskId = String(task.id || "");
    if (!taskId) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    const fired = getCheckpointFiredSet(taskId);
    const allMilestones = ctx.sortMilestones((task.milestones || []).slice()).filter((m) => (+m.hours || 0) > 0);
    const byKey = new Map<string, { hours: number; description: string }>();
    allMilestones.forEach((m) => {
      byKey.set(checkpointKeyForTask(m, task), { hours: +m.hours || 0, description: String(m.description || "") });
    });
    const completedRows = Array.from(fired)
      .map((key) => ({ key, item: byKey.get(key) }))
      .filter((row): row is { key: string; item: { hours: number; description: string } } => !!row.item)
      .reverse();
    if (!completedRows.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    listEl.innerHTML = completedRows
      .map((row, idx) => {
        const timeText = `${row.item.hours}${sharedTasks.milestoneUnitSuffix(task)}`;
        const desc = String(row.item.description || "").trim();
        return `
          <div class="focusCheckpointLogItem${idx === 0 ? " isLatest" : ""}">
            <div class="focusCheckpointLogItemLine">
              <span class="focusCheckpointLogItemTime">${ctx.escapeHtmlUI(timeText)}</span>${desc ? `<span class="focusCheckpointLogItemSep"> - </span><span class="focusCheckpointLogItemDesc">${ctx.escapeHtmlUI(desc)}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
    emptyEl.style.display = "none";
  }

  function renderFocusCheckpointRing(task: Task, elapsedSec: number) {
    const ringEl = els.focusCheckpointRing as HTMLElement | null;
    if (!ringEl) return;
    const showCheckpoints = !!ctx.getFocusShowCheckpoints();
    const hasMilestones = !!task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
    if (!showCheckpoints || !hasMilestones) {
      ringEl.innerHTML = "";
      ctx.setFocusCheckpointSig("");
      return;
    }
    const sortedMilestones = ctx.sortMilestones((task.milestones || []).slice()).filter((m) => (+m.hours || 0) > 0);
    if (!sortedMilestones.length) {
      ringEl.innerHTML = "";
      ctx.setFocusCheckpointSig("");
      return;
    }

    const milestoneUnitSec = sharedTasks.milestoneUnitSec(task);
    const milestoneTargetsSec = sortedMilestones
      .map((m) => Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec)))
      .filter((value) => value > 0);
    if (!milestoneTargetsSec.length) {
      ringEl.innerHTML = "";
      ctx.setFocusCheckpointSig("");
      return;
    }

    const timeGoalSec = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Number(task.timeGoalMinutes || 0) * 60 : 0;
    const maxTargetSec = Math.max(timeGoalSec, milestoneTargetsSec[milestoneTargetsSec.length - 1] || 0, 1);
    const signature = [
      String(task.id || ""),
      showCheckpoints ? "on" : "off",
      String(maxTargetSec),
      ...sortedMilestones.map((m, idx) => {
        const targetSec = milestoneTargetsSec[idx] || 0;
        const reached = elapsedSec >= targetSec;
        return `${targetSec}:${reached ? 1 : 0}:${String(m.description || "").trim()}`;
      }),
    ].join("|");
    if (ctx.getFocusCheckpointSig() === signature) return;
    ctx.setFocusCheckpointSig(signature);

    const ringWidthPx = Math.max(0, ringEl.clientWidth);
    const ringHeightPx = Math.max(0, ringEl.clientHeight);
    const dialRadiusPx = Math.max(0, Math.min(ringWidthPx, ringHeightPx) / 2);
    const markerRadiusPx = Math.max(0, dialRadiusPx - 4);
    const labelRadiusPx = Math.max(0, dialRadiusPx + Math.max(18, Math.round(dialRadiusPx * 0.12)));
    ringEl.innerHTML = sortedMilestones
      .map((m, idx) => {
        const targetSec = milestoneTargetsSec[idx] || 0;
        const ratio = Math.max(0, Math.min(1, targetSec / maxTargetSec));
        const angleDeg = -90 + ratio * 360;
        const angleRad = (angleDeg * Math.PI) / 180;
        const mx = Math.cos(angleRad) * markerRadiusPx;
        const my = Math.sin(angleRad) * markerRadiusPx;
        const lx = Math.cos(angleRad) * labelRadiusPx;
        const ly = Math.sin(angleRad) * labelRadiusPx;
        const reached = elapsedSec >= targetSec;
        const title = formatCheckpointAlertText(task, m);
        const description = String(m.description || "").trim();
        const labelText = description || title;
        return `
          <span class="focusCheckpointMark${reached ? " reached" : ""}" style="--mxpx:${mx.toFixed(1)}px;--mypx:${my.toFixed(
            1
          )}px;" aria-hidden="true" title="${ctx.escapeHtmlUI(title)}"></span>
          <span
            class="focusCheckpointLabel isActive${lx < 0 ? " left" : ""}${reached ? " reached" : ""}"
            style="--lxpx:${lx.toFixed(1)}px;--lypx:${ly.toFixed(1)}px;"
            aria-hidden="true"
          >
            <span class="focusCheckpointLabelTitle">${ctx.escapeHtmlUI(labelText)}</span>
          </span>
        `;
      })
      .join("");
  }

  function updateFocusDial(task: Task) {
    const elapsedMs = getElapsedMs(task);
    const elapsedSec = elapsedMs / 1000;
    if (els.focusTaskName) els.focusTaskName.textContent = (task.name || "").trim() || ctx.getFocusModeTaskName() || "Task";
    const formatted = formatFocusElapsed(elapsedMs);
    if (els.focusTimerDays) {
      els.focusTimerDays.textContent = formatted.daysText;
      (els.focusTimerDays as HTMLElement).style.display = formatted.showDays ? "block" : "none";
    }
    if (els.focusTimerClock) els.focusTimerClock.textContent = formatted.clockText;
    syncFocusRunButtons(task);
    updateFocusInsights(task);
    const hasTimeGoal = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0;
    const timeGoalSec = hasTimeGoal ? Number(task.timeGoalMinutes || 0) * 60 : 0;
    const pct = hasTimeGoal && timeGoalSec > 0 ? Math.min((elapsedSec / timeGoalSec) * 100, 100) : 0;
    if (els.focusDial) {
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress", `${pct}%`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-color", ctx.fillBackgroundForPct(pct));
    }
    renderFocusCheckpointRing(task, elapsedSec);
    renderFocusCheckpointCompletionLog(task);
  }

  function openFocusMode(index: number) {
    const task = ctx.getTasks()[index];
    if (!task) return;
    ctx.setFocusModeTaskId(String(task.id || ""));
    ctx.setDeferredFocusModeTimeGoalModals([]);
    dismissNonFocusTaskAlertsForFocusTask(String(task.id || ""));
    ctx.setFocusModeTaskName((task.name || "").trim());
    if (els.focusTaskName) els.focusTaskName.textContent = ctx.getFocusModeTaskName() || "Task";
    ctx.setFocusCheckpointSig("");
    syncFocusCheckpointToggleUi();
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("isFocusModeOpen");
    updateFocusDial(task);
    window.requestAnimationFrame(() => {
      const activeTaskId = String(ctx.getFocusModeTaskId() || "").trim();
      if (!activeTaskId || activeTaskId !== String(task.id || "").trim()) return;
      updateFocusDial(task);
    });
    syncFocusSessionNotesInput(String(task.id || ""));
    syncFocusSessionNotesAccordion(String(task.id || ""));
  }

  function closeFocusMode() {
    const focusScreenEl = els.focusModeScreen as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    if (focusScreenEl && activeEl && focusScreenEl.contains(activeEl)) {
      if (els.footerTasksBtn && typeof els.footerTasksBtn.focus === "function") els.footerTasksBtn.focus();
      else if (els.openAddTaskBtn && typeof els.openAddTaskBtn.focus === "function") els.openAddTaskBtn.focus();
      else if (typeof activeEl.blur === "function") activeEl.blur();
    }
    const closingFocusTaskId = String(ctx.getFocusModeTaskId() || "").trim();
    flushPendingFocusSessionNoteSave(closingFocusTaskId);
    if (closingFocusTaskId && els.focusSessionNotesInput) {
      setFocusSessionDraft(closingFocusTaskId, String(els.focusSessionNotesInput.value || ""));
    }
    ctx.setFocusModeTaskId(null);
    ctx.setFocusModeTaskName("");
    ctx.setFocusShowCheckpoints(true);
    syncFocusCheckpointToggleUi();
    const timer = ctx.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      ctx.setFocusSessionNoteSaveTimer(null);
    }
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "none";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("isFocusModeOpen");
    if (els.focusTaskName) els.focusTaskName.textContent = "Task";
    if (els.focusTimerDays) els.focusTimerDays.textContent = "00d";
    if (els.focusTimerClock) els.focusTimerClock.textContent = "00:00:00";
    if (els.focusDialHint) els.focusDialHint.textContent = "Tap to Launch";
    syncFocusSessionNotesInput(null);
    syncFocusSessionNotesAccordion(null);
    renderFocusCheckpointCompletionLog(null);
    setFocusInsightDeltaValue(els.focusInsightTodayDelta as HTMLElement | null, Number.NaN);
    setFocusInsightDeltaValue(els.focusInsightWeekDelta as HTMLElement | null, Number.NaN);
    if (els.focusInsightBest) els.focusInsightBest.textContent = "--";
    if (els.focusInsightWeekday) {
      els.focusInsightWeekday.textContent = "No logged sessions yet";
      els.focusInsightWeekday.classList.add("is-empty");
    }
    if (els.focusInsightProductivityPeriod) {
      els.focusInsightProductivityPeriod.textContent = "--";
      els.focusInsightProductivityPeriod.classList.add("is-empty");
    }
    ctx.render();
    openDeferredFocusModeTimeGoalModal();
  }

  function shouldDeferTimeGoalModalInFocusMode(taskIdRaw: string | null | undefined) {
    const activeFocusTaskId = String(ctx.getFocusModeTaskId() || "").trim();
    const taskId = String(taskIdRaw || "").trim();
    return !!activeFocusTaskId && !!taskId && taskId !== activeFocusTaskId;
  }

  function queueDeferredFocusModeTimeGoalModal(task: Task, elapsedMs: number, opts?: { reminder?: boolean }) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const queue = getDeferredQueue();
    if (queue.some((entry) => entry.taskId === taskId)) return;
    ctx.setDeferredFocusModeTimeGoalModals([
      ...queue,
      { taskId, frozenElapsedMs: Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)), reminder: !!opts?.reminder },
    ]);
  }

  function openDeferredFocusModeTimeGoalModal() {
    const { nextPending, remainingQueue } = shiftValidDeferredTimeGoalModal(getDeferredQueue(), {
      tasks: ctx.getTasks(),
      liveSessionsByTaskId: ctx.getLiveSessionsByTaskId(),
      getTaskTimeGoalAction,
    });
    ctx.setDeferredFocusModeTimeGoalModals(remainingQueue);
    if (!nextPending) return;
    const task = ctx.getTasks().find((row) => String(row.id || "").trim() === nextPending.taskId);
    if (!task) return;
    openTimeGoalCompleteModal(task, nextPending.frozenElapsedMs || getTaskElapsedMs(task), { reminder: nextPending.reminder });
  }

  function dismissNonFocusTaskAlertsForFocusTask(focusTaskIdRaw: string | null | undefined) {
    const focusTaskId = String(focusTaskIdRaw || "").trim();
    if (!focusTaskId) return;
    getToastQueue().length = 0;
    if (ctx.getCheckpointRepeatActiveTaskId() && String(ctx.getCheckpointRepeatActiveTaskId() || "").trim() !== focusTaskId) {
      stopCheckpointRepeatAlert();
    }
    if (getActiveToast() && String(getActiveToast()?.taskId || "").trim() !== focusTaskId) {
      dismissCheckpointToast({ manual: false });
    }
  }

  function ensureCheckpointBeepAudio() {
    const existing = ctx.getCheckpointBeepAudio();
    if (existing) return existing;
    try {
      const audio = new Audio("/checkpoint-beep.wav");
      audio.preload = "auto";
      ctx.setCheckpointBeepAudio(audio);
      return audio;
    } catch {
      ctx.setCheckpointBeepAudio(null);
      return null;
    }
  }

  function playCheckpointBeep() {
    const audio = ensureCheckpointBeepAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      // ignore playback restrictions
    }
  }

  function stopCheckpointRepeatAlert() {
    ctx.setCheckpointRepeatStopAtMs(0);
    ctx.setCheckpointRepeatActiveTaskId(null);
    if (ctx.getCheckpointRepeatCycleTimer() != null) {
      window.clearTimeout(ctx.getCheckpointRepeatCycleTimer() as number);
      ctx.setCheckpointRepeatCycleTimer(null);
    }
    if (ctx.getCheckpointBeepQueueTimer() != null) {
      window.clearTimeout(ctx.getCheckpointBeepQueueTimer() as number);
      ctx.setCheckpointBeepQueueTimer(null);
    }
    ctx.setCheckpointBeepQueueCount(0);
    if (ctx.getCheckpointBeepAudio()) {
      try {
        ctx.getCheckpointBeepAudio()?.pause();
        if (ctx.getCheckpointBeepAudio()) ctx.getCheckpointBeepAudio()!.currentTime = 0;
      } catch {
        // ignore
      }
    }
    if (!runtime.destroyed) ctx.render();
  }

  function flushCheckpointBeepQueue() {
    if (ctx.getCheckpointBeepQueueCount() <= 0) {
      ctx.setCheckpointBeepQueueCount(0);
      ctx.setCheckpointBeepQueueTimer(null);
      return;
    }
    playCheckpointBeep();
    ctx.setCheckpointBeepQueueCount(ctx.getCheckpointBeepQueueCount() - 1);
    if (ctx.getCheckpointBeepQueueCount() > 0) ctx.setCheckpointBeepQueueTimer(window.setTimeout(flushCheckpointBeepQueue, 150));
    else ctx.setCheckpointBeepQueueTimer(null);
  }

  function enqueueCheckpointBeeps(count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    ctx.setCheckpointBeepQueueCount(ctx.getCheckpointBeepQueueCount() + Math.floor(count));
    if (ctx.getCheckpointBeepQueueTimer() == null) flushCheckpointBeepQueue();
  }

  function scheduleCheckpointRepeatCycle() {
    if (ctx.getCheckpointRepeatStopAtMs() <= 0 || Date.now() >= ctx.getCheckpointRepeatStopAtMs()) {
      stopCheckpointRepeatAlert();
      return;
    }
    enqueueCheckpointBeeps(1);
    ctx.setCheckpointRepeatCycleTimer(window.setTimeout(scheduleCheckpointRepeatCycle, 2000));
  }

  function startCheckpointRepeatAlert(taskId: string) {
    ctx.setCheckpointRepeatActiveTaskId(taskId);
    ctx.setCheckpointRepeatStopAtMs(Date.now() + 60_000);
    if (!runtime.destroyed) ctx.render();
    if (ctx.getCheckpointRepeatCycleTimer() != null) return;
    scheduleCheckpointRepeatCycle();
  }

  function renderCheckpointToast() {
    const host = els.checkpointToastHost as HTMLElement | null;
    const active = getActiveToast();
    if (!host) return;
    host.classList.toggle("isActive", !!active);
    if (!active) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `
      <div class="checkpointToast" data-toast-id="${ctx.escapeHtmlUI(active.id)}" role="status">
        ${active.taskName ? `<p class="checkpointToastTaskName">${ctx.escapeHtmlUI(active.taskName)}</p>` : ""}
        <p class="checkpointToastTitle">${ctx.escapeHtmlUI(String(active.title || "CHECKPOINT REACHED!").toUpperCase())}</p>
        <div class="checkpointToastSummary">
          <p class="checkpointToastText">${ctx.escapeHtmlUI(String(active.checkpointTimeText || active.text || ""))}</p>
          ${active.checkpointDescText ? `<p class="checkpointToastDesc">${ctx.escapeHtmlUI(active.checkpointDescText)}</p>` : ""}
        </div>
        <div class="checkpointToastActions">
          <button class="btn btn-ghost small checkpointToastClose" type="button" data-action="closeCheckpointToast">Dismiss</button>
          <button class="btn btn-ghost small checkpointToastJump" type="button" data-action="jumpToCheckpointTask">Dismiss and Jump to Task</button>
        </div>
      </div>
    `;
  }

  function showNextCheckpointToast() {
    const queue = getToastQueue();
    if (getActiveToast() || queue.length === 0) return;
    const next = queue.shift() || null;
    setActiveToast(
      next
        ? { ...next, autoCloseAtMs: (next.autoCloseMs || 0) > 0 ? Date.now() + (next.autoCloseMs as number) : null }
        : null
    );
    renderCheckpointToast();
    if (!runtime.destroyed) ctx.render();
    if (ctx.getCheckpointToastAutoCloseTimer() != null) {
      window.clearTimeout(ctx.getCheckpointToastAutoCloseTimer() as number);
    }
    const active = getActiveToast();
    if ((active?.autoCloseMs || 0) > 0) {
      ctx.setCheckpointToastAutoCloseTimer(
        window.setTimeout(() => {
          dismissCheckpointToast({ manual: false });
        }, active!.autoCloseMs as number)
      );
    } else {
      ctx.setCheckpointToastAutoCloseTimer(null);
    }
  }

  function dismissCheckpointToast(opts?: { manual?: boolean }) {
    const manual = !!opts?.manual;
    const active = getActiveToast();
    if (
      manual &&
      active?.muteRepeatOnManualDismiss &&
      active.taskId &&
      ctx.getCheckpointRepeatActiveTaskId() &&
      String(active.taskId) === String(ctx.getCheckpointRepeatActiveTaskId())
    ) {
      ctx.broadcastCheckpointAlertMute(String(active.taskId));
      stopCheckpointRepeatAlert();
    }
    if (ctx.getCheckpointToastAutoCloseTimer() != null) {
      window.clearTimeout(ctx.getCheckpointToastAutoCloseTimer() as number);
      ctx.setCheckpointToastAutoCloseTimer(null);
    }
    setActiveToast(null);
    renderCheckpointToast();
    if (!runtime.destroyed) ctx.render();
    if (getToastQueue().length) window.setTimeout(showNextCheckpointToast, 50);
  }

  function dismissCheckpointToastAndJumpToTask() {
    const taskId = String(getActiveToast()?.taskId || "").trim();
    dismissCheckpointToast({ manual: true });
    if (!taskId) return;
    const path = ctx.normalizedPathname();
    const onMainTaskTimerRoute = /\/tasklaunch$/.test(path) || /\/tasklaunch\/index\.html$/i.test(path);
    if (onMainTaskTimerRoute) {
      ctx.jumpToTaskById(taskId);
      return;
    }
    ctx.savePendingTaskJump(taskId);
    ctx.navigateToAppRoute("/tasklaunch");
  }

  function enqueueCheckpointToast(title: string, text: string, opts?: Omit<CheckpointToast, "id" | "title" | "text" | "autoCloseAtMs">) {
    const queue = getToastQueue();
    queue.length = 0;
    if (ctx.getCheckpointToastAutoCloseTimer() != null) {
      window.clearTimeout(ctx.getCheckpointToastAutoCloseTimer() as number);
      ctx.setCheckpointToastAutoCloseTimer(null);
    }
    setActiveToast(null);
    queue.push({
      id: `${Date.now()}-${Math.random()}`,
      title,
      text,
      checkpointTimeText: opts?.checkpointTimeText ?? null,
      checkpointDescText: opts?.checkpointDescText ?? null,
      taskName: opts?.taskName ?? null,
      counterText: opts?.counterText ?? null,
      autoCloseMs: opts?.autoCloseMs ?? 5000,
      autoCloseAtMs: null,
      taskId: opts?.taskId ?? null,
      muteRepeatOnManualDismiss: !!opts?.muteRepeatOnManualDismiss,
    });
    showNextCheckpointToast();
  }

  function formatCheckpointAlertText(task: Task, milestone: { hours: number; description: string }) {
    const targetMs = Math.max(0, (+milestone.hours || 0) * sharedTasks.milestoneUnitSec(task) * 1000);
    const label = String(milestone.description || "").trim();
    return label ? `${ctx.formatTime(targetMs)} - ${label}` : ctx.formatTime(targetMs);
  }

  function processCheckpointAlertsForTask(task: Task, elapsedSecNow: number) {
    const taskId = String(task.id || "");
    if (!taskId || !task.running) {
      if (taskId) clearCheckpointBaseline(taskId);
      return;
    }
    const hasMilestones = !!task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
    const elapsedWholeSec = Math.floor(Math.max(0, elapsedSecNow));
    const baselineByTaskId = ctx.getCheckpointBaselineSecByTaskId();
    const prevBaseline = baselineByTaskId[taskId];
    if (!Number.isFinite(prevBaseline) || elapsedWholeSec <= prevBaseline) {
      baselineByTaskId[taskId] = elapsedWholeSec;
      return;
    }
    const fired = getCheckpointFiredSet(taskId);
    const msSorted = hasMilestones ? ctx.sortMilestones((task.milestones || []).slice()) : [];
    const validMilestones = msSorted.filter((m) => Math.max(0, Math.round((+m.hours || 0) * sharedTasks.milestoneUnitSec(task))) > 0);
    const totalCheckpoints = validMilestones.length;
    let beepCount = 0;
    let shouldOpenTimeGoalModal = false;
    let openTimeGoalModalAsReminder = false;
    msSorted.forEach((m) => {
      const targetSec = Math.max(0, Math.round((+m.hours || 0) * sharedTasks.milestoneUnitSec(task)));
      if (targetSec <= 0 || targetSec <= prevBaseline || targetSec > elapsedWholeSec) return;
      if (m.alertsEnabled === false) return;
      const key = checkpointKeyForTask(m, task);
      if (fired.has(key)) return;
      fired.add(key);
      const text = formatCheckpointAlertText(task, m);
      const checkpointIndex = Math.max(1, validMilestones.findIndex((vm) => checkpointKeyForTask(vm, task) === key) + 1);
      const checkpointTimeText = ctx.formatTime(targetSec * 1000);
      const checkpointDescText = String(m.description || "").trim();
      if (ctx.getCheckpointAlertToastEnabled() && task.checkpointToastEnabled) {
        const toastMode = task.checkpointToastMode === "manual" ? "manual" : "auto5s";
        enqueueCheckpointToast(`Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`, text, {
          autoCloseMs: toastMode === "manual" ? null : 5000,
          taskId,
          taskName: task.name || "",
          counterText: ctx.formatMainTaskElapsed(getElapsedMs(task)),
          checkpointTimeText,
          checkpointDescText,
          muteRepeatOnManualDismiss:
            ctx.getCheckpointAlertSoundEnabled() && !!task.checkpointSoundEnabled && (task.checkpointSoundMode || "once") === "repeat",
        });
      }
      if (ctx.getCheckpointAlertSoundEnabled() && task.checkpointSoundEnabled) beepCount += 1;
    });
    const timeGoalSec = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Math.round(Number(task.timeGoalMinutes || 0) * 60) : 0;
    if (
      timeGoalSec > 0 &&
      prevBaseline < timeGoalSec &&
      elapsedWholeSec >= timeGoalSec &&
      ctx.getTimeGoalModalTaskId() !== taskId
    ) {
      shouldOpenTimeGoalModal = true;
    }
    if (
      timeGoalSec > 0 &&
      ctx.getTimeGoalModalTaskId() !== taskId &&
      !shouldOpenTimeGoalModal &&
      Number(ctx.getTimeGoalReminderAtMsByTaskId()[taskId] || 0) > 0 &&
      nowMs() >= Number(ctx.getTimeGoalReminderAtMsByTaskId()[taskId] || 0) &&
      elapsedWholeSec >= timeGoalSec
    ) {
      shouldOpenTimeGoalModal = true;
      openTimeGoalModalAsReminder = true;
    }
    baselineByTaskId[taskId] = elapsedWholeSec;
    if (beepCount > 0) {
      if ((task.checkpointSoundMode || "once") === "repeat") startCheckpointRepeatAlert(taskId);
      else enqueueCheckpointBeeps(beepCount);
    }
    if (shouldOpenTimeGoalModal) {
      if (shouldDeferTimeGoalModalInFocusMode(taskId)) {
        queueDeferredFocusModeTimeGoalModal(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder });
        return;
      }
      openTimeGoalCompleteModal(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder });
      baselineByTaskId[taskId] = Math.floor(getElapsedMs(task) / 1000);
      return;
    }
  }

  function updateTaskProgressFill(node: Element, task: Task, elapsedMs: number) {
    const fill = node.querySelector(".progressFill") as HTMLElement | null;
    if (!fill) return;
    const hasMilestones = !!task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
    const hasTimeGoal = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0;
    if (!hasMilestones && !hasTimeGoal) return;
    const progressModel = buildTaskProgressModel({
      milestones: hasMilestones ? ctx.sortMilestones(task.milestones) : [],
      elapsedSec: Math.max(0, elapsedMs) / 1000,
      milestoneUnitSec: sharedTasks.milestoneUnitSec(task),
      timeGoalSec: hasTimeGoal ? Number(task.timeGoalMinutes || 0) * 60 : 0,
    });
    if (!progressModel) return;
    fill.style.width = `${progressModel.pct}%`;
    fill.style.background = ctx.getDynamicColorsEnabled() ? ctx.fillBackgroundForPct(progressModel.pct) : ctx.getModeColor("mode1");
  }

  function tick() {
    if (runtime.destroyed) return;
    const tasks = ctx.getTasks();
    const processedCheckpointTaskIds = new Set<string>();
    const taskList = els.taskList as HTMLElement | null;
    if (taskList) {
      taskList.querySelectorAll(".task").forEach((node) => {
        const i = parseInt((node as HTMLElement).dataset.index || "0", 10);
        const task = tasks[i];
        if (!task) return;
        const timeEl = node.querySelector(".time");
        const elapsedMs = getElapsedMs(task);
        if (timeEl) (timeEl as HTMLElement).innerHTML = ctx.formatMainTaskElapsedHtml(elapsedMs, !!task.running);
        updateTaskProgressFill(node, task, elapsedMs);
        const primaryActionBtn = node.querySelector('.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"]') as HTMLButtonElement | null;
        if (primaryActionBtn) {
          if (task.running) {
            primaryActionBtn.className = "btn btn-warn small";
            primaryActionBtn.dataset.action = "stop";
            primaryActionBtn.title = "Stop";
            primaryActionBtn.textContent = "Stop";
          } else if (elapsedMs > 0) {
            primaryActionBtn.className = "btn btn-resume small";
            primaryActionBtn.dataset.action = "start";
            primaryActionBtn.title = "Resume";
            primaryActionBtn.textContent = "Resume";
          } else {
            primaryActionBtn.className = "btn btn-accent small";
            primaryActionBtn.dataset.action = "start";
            primaryActionBtn.title = "Launch";
            primaryActionBtn.textContent = "Launch";
          }
        }
        const resetBtn = node.querySelector('.actions > .iconBtn[data-action="reset"]') as HTMLButtonElement | null;
        if (resetBtn) {
          const resetLabel = task.running ? "Stop task to reset" : "Reset";
          resetBtn.disabled = !!task.running;
          resetBtn.title = resetLabel;
          resetBtn.setAttribute("aria-label", resetLabel);
        }
        if (task.running) {
          ctx.syncRewardSessionTrackerForTask(task, nowMs());
          ctx.syncLiveSessionForTask(task, nowMs());
        }
        processCheckpointAlertsForTask(task, elapsedMs / 1000);
        processedCheckpointTaskIds.add(String(task.id || ""));
      });
    }
    tasks.forEach((task) => {
      const taskId = String(task.id || "");
      if (!taskId || processedCheckpointTaskIds.has(taskId)) return;
      if (task.running) {
        ctx.syncRewardSessionTrackerForTask(task, nowMs());
        ctx.syncLiveSessionForTask(task, nowMs());
      }
      processCheckpointAlertsForTask(task, getElapsedMs(task) / 1000);
    });
    if (ctx.getCheckpointAutoResetDirty()) {
      ctx.setCheckpointAutoResetDirty(false);
      ctx.save();
      ctx.render();
    }
    if (ctx.getFocusModeTaskId()) {
      const focusTask = tasks.find((row) => String(row.id || "") === String(ctx.getFocusModeTaskId()));
      if (focusTask) updateFocusDial(focusTask);
      else if (els.focusTaskName && ctx.getFocusModeTaskName()) els.focusTaskName.textContent = ctx.getFocusModeTaskName();
    }
    if (getActiveToast()) renderCheckpointToast();
    // Live dashboard updates should be limited to time-sensitive widgets while a task is running.
    if (ctx.getCurrentAppPage() === "dashboard" && tasks.some((task) => !!task.running)) {
      ctx.renderDashboardLiveWidgets();
    }
    runtime.tickRaf = window.requestAnimationFrame(() => {
      runtime.tickTimeout = window.setTimeout(tick, 200);
    });
  }

  function registerSessionEvents() {
    ctx.on(els.focusModeBackBtn, "click", closeFocusMode);
    ctx.on(els.focusCheckpointToggle, "click", () => {
      const nextValue = !ctx.getFocusShowCheckpoints();
      ctx.setFocusShowCheckpoints(nextValue);
      if (els.focusCheckpointToggle) {
        els.focusCheckpointToggle.classList.toggle("on", nextValue);
        els.focusCheckpointToggle.setAttribute("aria-checked", nextValue ? "true" : "false");
      }
      const taskId = String(ctx.getFocusModeTaskId() || "").trim();
      const task = taskId ? ctx.getTasks().find((row) => String(row.id || "").trim() === taskId) || null : null;
      if (task) updateFocusDial(task);
      else if (els.focusCheckpointRing) {
        (els.focusCheckpointRing as HTMLElement).innerHTML = "";
        ctx.setFocusCheckpointSig("");
      }
    });
    ctx.on(els.focusDial, "click", () => {
      const taskId = String(ctx.getFocusModeTaskId() || "").trim();
      if (!taskId) return;
      const idx = ctx.getTasks().findIndex((row) => String(row.id || "") === taskId);
      if (idx < 0) return;
      const task = ctx.getTasks()[idx];
      if (!task) return;
      if (task.running) ctx.stopTask(idx);
      else ctx.startTask(idx);
    });
    ctx.on(els.focusResetBtn, "click", () => {
      const taskId = String(ctx.getFocusModeTaskId() || "").trim();
      if (!taskId) return;
      const idx = ctx.getTasks().findIndex((row) => String(row.id || "") === taskId);
      if (idx >= 0) ctx.resetTask(idx);
    });
    ctx.on(els.focusSessionNotesInput, "input", () => {
      if (!ctx.getFocusModeTaskId()) return;
      clearFocusSessionNotesSavedStatus();
      scheduleFocusSessionNoteSave(String(ctx.getFocusModeTaskId() || ""), String(els.focusSessionNotesInput?.value || ""));
    });
    ctx.on(els.focusSessionNotesSection, "focusout", (event: Event) => {
      const container = els.focusSessionNotesSection as HTMLElement | null;
      const nextTarget = (event as FocusEvent).relatedTarget as Node | null;
      window.setTimeout(() => {
        if (!container) return;
        const activeElement = document.activeElement;
        if (nextTarget && container.contains(nextTarget)) return;
        if (activeElement && container.contains(activeElement)) return;
        maybeShowFocusSessionNotesSavedStatus(ctx.getFocusModeTaskId());
      }, 0);
    });
    ctx.on(els.timeGoalCompleteCloseBtn, "click", async () => {
      const task = getActiveTimeGoalModalTask();
      if (task) await resolveTimeGoalCompletion(task, { logHistory: true });
    });
    ctx.on(els.timeGoalCompleteLaunchNextBtn, "click", async () => {
      const task = getActiveTimeGoalModalTask();
      const nextTaskId = String((els.timeGoalCompleteLaunchNextBtn as HTMLButtonElement | null)?.dataset.nextTaskId || "").trim();
      if (!task || !nextTaskId) return;
      const completed = await resolveTimeGoalCompletion(task, { logHistory: true });
      if (!completed) return;
      const nextIndex = ctx.getTasks().findIndex((row) => String(row.id || "") === nextTaskId);
      if (nextIndex >= 0) ctx.startTask(nextIndex);
    });
    ctx.on(els.timeGoalCompleteDifficultyGroup, "click", (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest?.("[data-completion-difficulty]") as HTMLElement | null;
      if (!button) return;
      const value = normalizeCompletionDifficulty(button.dataset.completionDifficulty);
      if (!value) return;
      syncTimeGoalCompletionDifficultyUi(value);
      const task = getActiveTimeGoalModalTask();
      if (task) persistPendingTimeGoalFlow(task, "main", { completionDifficulty: value });
    });
    ctx.on(els.timeGoalCompleteNoteInput, "input", () => {
      const taskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
      if (taskId) setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput?.value || ""));
    });
    ctx.on(els.checkpointToastHost, "click", (e: any) => {
      const delegatedAction = getDelegatedAction(e.target, "data-action");
      if (!delegatedAction) return;
      const actionHandlers: Record<string, () => void> = {
        closeCheckpointToast: () => dismissCheckpointToast({ manual: true }),
        jumpToCheckpointTask: () => dismissCheckpointToastAndJumpToTask(),
      };
      actionHandlers[delegatedAction.action]?.();
    });
  }

  function destroySessionRuntime() {
    if (ctx.getFocusSessionNoteSaveTimer() != null) window.clearTimeout(ctx.getFocusSessionNoteSaveTimer() as number);
    if (ctx.getCheckpointToastAutoCloseTimer() != null) window.clearTimeout(ctx.getCheckpointToastAutoCloseTimer() as number);
    if (ctx.getCheckpointRepeatCycleTimer() != null) window.clearTimeout(ctx.getCheckpointRepeatCycleTimer() as number);
    if (ctx.getCheckpointBeepQueueTimer() != null) window.clearTimeout(ctx.getCheckpointBeepQueueTimer() as number);
    stopCheckpointRepeatAlert();
    setActiveToast(null);
    getToastQueue().length = 0;
    ctx.setFocusSessionNoteSaveTimer(null);
    ctx.setCheckpointToastAutoCloseTimer(null);
    ctx.setCheckpointRepeatCycleTimer(null);
    ctx.setCheckpointBeepQueueTimer(null);
  }

  return {
    loadFocusSessionNotes,
    tick,
    getElapsedMs,
    getTaskElapsedMs,
    clearTaskTimeGoalFlow,
    openFocusMode,
    closeFocusMode,
    syncTimeGoalModalWithTaskState,
    maybeRestorePendingTimeGoalFlow,
    flushPendingFocusSessionNoteSave,
    captureSessionNoteSnapshot,
    captureResetActionSessionNote,
    clearFocusSessionDraft,
    setFocusSessionDraft,
    syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion,
    resetCheckpointAlertTracking,
    clearCheckpointBaseline,
    checkpointRepeatActiveTaskId: () => ctx.getCheckpointRepeatActiveTaskId(),
    activeCheckpointToastTaskId: () => String(getActiveToast()?.taskId || "").trim() || null,
    stopCheckpointRepeatAlert,
    enqueueCheckpointToast,
    registerSessionEvents,
    destroySessionRuntime,
  };
}
