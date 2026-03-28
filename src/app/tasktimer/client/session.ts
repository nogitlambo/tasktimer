import type { Task } from "../lib/types";
import { nowMs } from "../lib/time";
import { computeFocusInsights } from "../lib/focusInsights";
import { formatFocusElapsed } from "../lib/tasks";
import type { TaskTimerSessionContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SuppressedCheckpointToast = {
  title: string;
  text: string;
  autoCloseMs: number | null;
  taskId: string;
  taskName: string | null;
  counterText: string | null;
  checkpointTimeText: string | null;
  checkpointDescText: string | null;
  muteRepeatOnManualDismiss: boolean;
};

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

export function createTaskTimerSession(ctx: TaskTimerSessionContext) {
  const { els, runtime } = ctx;
  const { sharedTasks } = ctx;

  const getSuppressedMap = () => ctx.getSuppressedFocusModeCheckpointAlertsByTaskId() as Record<string, SuppressedCheckpointToast>;
  const setSuppressedMap = (value: Record<string, SuppressedCheckpointToast>) =>
    ctx.setSuppressedFocusModeCheckpointAlertsByTaskId(value as Record<string, unknown>);
  const getDeferredQueue = () => ctx.getDeferredFocusModeTimeGoalModals();
  const getToastQueue = () => ctx.getCheckpointToastQueue() as CheckpointToast[];
  const getActiveToast = () => ctx.getActiveCheckpointToast() as CheckpointToast | null;
  const setActiveToast = (value: CheckpointToast | null) => ctx.setActiveCheckpointToast(value as unknown);

  function loadFocusSessionNotes() {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(ctx.storageKeys.FOCUS_SESSION_NOTES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return {};
      const next: Record<string, string> = {};
      Object.keys(parsed).forEach((taskId) => {
        const value = String(parsed[taskId] || "").trim();
        if (value) next[taskId] = value;
      });
      return next;
    } catch {
      return {};
    }
  }

  function persistFocusSessionNotes() {
    if (typeof window === "undefined") return;
    try {
      const notes = ctx.getFocusSessionNotesByTaskId();
      const next: Record<string, string> = {};
      Object.keys(notes || {}).forEach((taskId) => {
        const value = String(notes[taskId] || "").trim();
        if (value) next[taskId] = value;
      });
      if (Object.keys(next).length) window.localStorage.setItem(ctx.storageKeys.FOCUS_SESSION_NOTES_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(ctx.storageKeys.FOCUS_SESSION_NOTES_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function getFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    return String(ctx.getFocusSessionNotesByTaskId()[taskKey] || "");
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return;
    const notes = { ...ctx.getFocusSessionNotesByTaskId() };
    const value = String(noteRaw || "").trim();
    if (value) notes[taskKey] = value;
    else delete notes[taskKey];
    ctx.setFocusSessionNotesByTaskId(notes);
    persistFocusSessionNotes();
  }

  function clearFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return;
    const notes = { ...ctx.getFocusSessionNotesByTaskId() };
    if (!notes[taskKey]) return;
    delete notes[taskKey];
    ctx.setFocusSessionNotesByTaskId(notes);
    persistFocusSessionNotes();
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    if (!els.focusSessionNotesInput) return;
    els.focusSessionNotesInput.value = taskId ? getFocusSessionDraft(taskId) : "";
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    if (!els.focusSessionNotesSection) return;
    const noteValue = taskId ? getFocusSessionDraft(taskId) : "";
    els.focusSessionNotesSection.open = !!noteValue.trim();
  }

  function scheduleFocusSessionNoteSave(taskId: string, noteRaw: string) {
    const timer = ctx.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      ctx.setFocusSessionNoteSaveTimer(null);
    }
    ctx.setFocusSessionNoteSaveTimer(
      window.setTimeout(() => {
        setFocusSessionDraft(taskId, noteRaw);
        ctx.setFocusSessionNoteSaveTimer(null);
      }, 250)
    );
  }

  function flushPendingFocusSessionNoteSave(taskId?: string | null) {
    const pendingTaskId = String(taskId || ctx.getFocusModeTaskId() || "").trim();
    const timer = ctx.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      ctx.setFocusSessionNoteSaveTimer(null);
    }
    if (!pendingTaskId) return;
    if (String(ctx.getFocusModeTaskId() || "").trim() === pendingTaskId && els.focusSessionNotesInput) {
      setFocusSessionDraft(pendingTaskId, String(els.focusSessionNotesInput.value || ""));
    }
  }

  function getLiveFocusSessionNoteValue(taskId?: string | null) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    if (String(ctx.getFocusModeTaskId() || "").trim() !== taskKey) return "";
    return String(els.focusSessionNotesInput?.value || "").trim();
  }

  function captureSessionNoteSnapshot(taskId?: string | null) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    flushPendingFocusSessionNoteSave(taskKey);
    const liveNote = getLiveFocusSessionNoteValue(taskKey);
    if (liveNote) {
      setFocusSessionDraft(taskKey, liveNote);
      return liveNote;
    }
    return getFocusSessionDraft(taskKey);
  }

  function captureResetActionSessionNote(taskId?: string | null) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    const liveFocusNote = getLiveFocusSessionNoteValue(taskKey);
    if (liveFocusNote) {
      setFocusSessionDraft(taskKey, liveFocusNote);
      return liveFocusNote;
    }
    return captureSessionNoteSnapshot(taskKey);
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
    if (normalizedTaskId && ctx.getTimeGoalModalTaskId() === normalizedTaskId) {
      ctx.setTimeGoalModalTaskId(null);
      ctx.setTimeGoalModalFrozenElapsedMs(0);
    }
    if (
      !normalizedTaskId ||
      ctx.getTimeGoalModalTaskId() == null ||
      normalizedTaskId === String(ctx.getTimeGoalModalTaskId() || "").trim()
    ) {
      clearPendingTimeGoalFlow();
      ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    }
    if (normalizedTaskId) delete ctx.getTimeGoalReminderAtMsByTaskId()[normalizedTaskId];
  }

  function persistPendingTimeGoalFlow(task: Task, step: "main" | "saveNote" | "note", opts?: { reminder?: boolean }) {
    const taskId = String(task?.id || "").trim();
    if (!taskId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY,
        JSON.stringify({
          taskId,
          step,
          frozenElapsedMs: Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0)),
          reminder: !!opts?.reminder,
        })
      );
    } catch {
      // ignore localStorage failures
    }
  }

  function loadPendingTimeGoalFlow():
    | { taskId: string; step: "main" | "saveNote" | "note"; frozenElapsedMs: number; reminder: boolean }
    | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const taskId = String(parsed?.taskId || "").trim();
      const stepRaw = String(parsed?.step || "").trim();
      const step = stepRaw === "saveNote" || stepRaw === "note" ? stepRaw : "main";
      const frozenElapsedMs = Math.max(0, Math.floor(Number(parsed?.frozenElapsedMs || 0) || 0));
      const reminder = !!parsed?.reminder;
      if (!taskId) return null;
      return { taskId, step, frozenElapsedMs, reminder };
    } catch {
      return null;
    }
  }

  function getTaskTimeGoalAction(task: Task | null | undefined) {
    if (!task) return "continue";
    return task.timeGoalAction === "resetLog" || task.timeGoalAction === "resetNoLog" || task.timeGoalAction === "confirmModal"
      ? task.timeGoalAction
      : "continue";
  }

  function shouldKeepTimeGoalCompletionFlow(task: Task | null | undefined, elapsedMsOverride?: number | null) {
    if (!task || !task.running) return false;
    const timeGoalMinutes = Number(task.timeGoalMinutes || 0);
    if (!(task.timeGoalEnabled && timeGoalMinutes > 0)) return false;
    if (getTaskTimeGoalAction(task) !== "confirmModal") return false;
    const elapsedMs =
      elapsedMsOverride != null && Number.isFinite(Number(elapsedMsOverride))
        ? Math.max(0, Math.floor(Number(elapsedMsOverride) || 0))
        : getTaskElapsedMs(task);
    return elapsedMs >= Math.round(timeGoalMinutes * 60 * 1000);
  }

  function getTimeGoalReminderDelayMs() {
    return 60 * 60 * 1000;
  }

  function setUnitButtonActive(btn: HTMLButtonElement | null, active: boolean) {
    if (!btn) return;
    btn.classList.toggle("isOn", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function getTimeGoalCompleteDurationMinutes() {
    const value = Math.max(0, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "0") || 0));
    if (!(value > 0)) return 0;
    if (ctx.getTimeGoalCompleteDurationUnit() === "minute") {
      return ctx.getTimeGoalCompleteDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getTimeGoalCompleteDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
  }

  function syncTimeGoalCompleteDurationUnitUi() {
    const minuteOn = ctx.getTimeGoalCompleteDurationUnit() === "minute";
    setUnitButtonActive(els.timeGoalCompleteDurationUnitMinute, minuteOn);
    setUnitButtonActive(els.timeGoalCompleteDurationUnitHour, !minuteOn);
    const dayOn = ctx.getTimeGoalCompleteDurationPeriod() === "day";
    setUnitButtonActive(els.timeGoalCompleteDurationPeriodDay, dayOn);
    setUnitButtonActive(els.timeGoalCompleteDurationPeriodWeek, !dayOn);
    const value = Math.max(0, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "0") || 0));
    const unitLabel =
      ctx.getTimeGoalCompleteDurationUnit() === "minute" ? (value === 1 ? "minute" : "minutes") : value === 1 ? "hour" : "hours";
    const periodLabel = ctx.getTimeGoalCompleteDurationPeriod() === "day" ? "day" : "week";
    if (els.timeGoalCompleteDurationReadout) {
      els.timeGoalCompleteDurationReadout.textContent = `${value} ${unitLabel} per ${periodLabel}`;
    }
  }

  function setTimeGoalCompleteEditorVisible(visible: boolean) {
    if (els.timeGoalCompleteGoalEditor) {
      (els.timeGoalCompleteGoalEditor as HTMLElement).style.display = visible ? "block" : "none";
    }
  }

  function populateTimeGoalCompleteEditor(task: Task) {
    const durationValue = Math.max(1, Math.floor(Number(task.timeGoalValue || 1) || 1));
    ctx.setTimeGoalCompleteDurationUnit(task.timeGoalUnit === "minute" ? "minute" : "hour");
    ctx.setTimeGoalCompleteDurationPeriod(task.timeGoalPeriod === "week" ? "week" : "day");
    if (els.timeGoalCompleteDurationValueInput) {
      els.timeGoalCompleteDurationValueInput.value = String(durationValue);
    }
    syncTimeGoalCompleteDurationUnitUi();
  }

  function openTimeGoalCompleteModal(task: Task, elapsedMs: number, opts?: { reminder?: boolean }) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    ctx.setTimeGoalModalTaskId(taskId);
    ctx.setTimeGoalModalFrozenElapsedMs(Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)));
    delete ctx.getTimeGoalReminderAtMsByTaskId()[taskId];
    if (els.timeGoalCompleteTitle) {
      els.timeGoalCompleteTitle.textContent = `${String(task.name || "Task")} Complete`;
    }
    const elapsedLabel = sharedTasks.formatCheckpointTimeGoalText(task);
    if (els.timeGoalCompleteText) {
      els.timeGoalCompleteText.textContent = opts?.reminder
        ? `This task is still running beyond its current time goal of ${elapsedLabel}. Please choose how you want to proceed.`
        : `This task has reached its current time goal of ${elapsedLabel}. Please choose how you want to proceed.`;
    }
    if (els.timeGoalCompleteMeta) els.timeGoalCompleteMeta.textContent = "";
    populateTimeGoalCompleteEditor(task);
    setTimeGoalCompleteEditorVisible(false);
    persistPendingTimeGoalFlow(task, "main", opts);
    ctx.openOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
  }

  function openTimeGoalSaveNoteChoice(task: Task) {
    persistPendingTimeGoalFlow(task, "saveNote");
    ctx.openOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
  }

  function openTimeGoalNoteModal(task: Task) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const capturedNote = captureSessionNoteSnapshot(taskId);
    if (capturedNote) setFocusSessionDraft(taskId, capturedNote);
    if (els.timeGoalCompleteNoteTitle) {
      els.timeGoalCompleteNoteTitle.textContent = `${String(task.name || "Task")} Notes`;
    }
    if (els.timeGoalCompleteNoteText) {
      els.timeGoalCompleteNoteText.textContent = "Add a note for this saved session before the timer resets.";
    }
    if (els.timeGoalCompleteNoteInput) {
      els.timeGoalCompleteNoteInput.value = capturedNote;
    }
    persistPendingTimeGoalFlow(task, "note");
    ctx.openOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
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
        openTimeGoalCompleteModal(task, pending.frozenElapsedMs || getTaskElapsedMs(task), { reminder: pending.reminder });
      }
      if (pending.step === "saveNote") openTimeGoalSaveNoteChoice(task);
      else if (pending.step === "note") openTimeGoalNoteModal(task);
      return;
    }
    if (String(ctx.getTimeGoalModalTaskId() || "").trim()) return;
    const overdueTask = tasks.find((row) => !!row?.running && shouldKeepTimeGoalCompletionFlow(row));
    if (!overdueTask) return;
    openTimeGoalCompleteModal(overdueTask, getTaskElapsedMs(overdueTask), { reminder: true });
  }

  function syncTimeGoalModalWithTaskState() {
    const activeTaskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
    if (!activeTaskId) return;
    const task = ctx.getTasks().find((row) => String(row.id || "") === activeTaskId) || null;
    if (shouldKeepTimeGoalCompletionFlow(task, ctx.getTimeGoalModalFrozenElapsedMs())) return;
    clearTaskTimeGoalFlow(activeTaskId);
    ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  async function resolveTimeGoalCompletion(task: Task, opts: { logHistory: boolean }) {
    const taskId = String(task.id || "");
    const sessionNote = captureResetActionSessionNote(taskId);
    if (sessionNote) setFocusSessionDraft(taskId, sessionNote);
    ctx.resetTaskStateImmediate(task, { logHistory: opts.logHistory, sessionNote });
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
  }

  function resumeTaskAfterTimeGoalModal(task: Task) {
    const taskId = String(task.id || "").trim();
    if (!taskId || ctx.getTimeGoalModalTaskId() !== taskId) return;
    const frozenElapsedMs = Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0));
    task.accumulatedMs = frozenElapsedMs;
    task.startMs = nowMs();
    task.running = true;
    task.hasStarted = true;
    ctx.setTimeGoalModalTaskId(null);
    ctx.setTimeGoalModalFrozenElapsedMs(0);
  }

  function syncFocusRunButtons(task?: Task | null) {
    const running = !!task?.running;
    if (els.focusDialHint) els.focusDialHint.textContent = running ? "Tap to Stop" : "Tap to Launch";
    if (els.focusResetBtn) els.focusResetBtn.disabled = !!task?.running;
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
      }))
      .filter((entry) => entry.ts > 0 && entry.ms >= 0);
    if (task.running) entries.push({ ts: nowMs(), ms: getTaskElapsedMs(task) });
    const insights = computeFocusInsights(entries, nowMs());
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
    if (els.focusCheckpointRing) {
      (els.focusCheckpointRing as HTMLElement).innerHTML = "";
    }
    renderFocusCheckpointCompletionLog(task);
  }

  function openFocusMode(index: number) {
    const task = ctx.getTasks()[index];
    if (!task) return;
    ctx.setFocusModeTaskId(String(task.id || ""));
    setSuppressedMap({});
    ctx.setDeferredFocusModeTimeGoalModals([]);
    dismissNonFocusTaskAlertsForFocusTask(String(task.id || ""));
    ctx.setFocusModeTaskName((task.name || "").trim());
    if (els.focusTaskName) els.focusTaskName.textContent = ctx.getFocusModeTaskName() || "Task";
    ctx.setFocusCheckpointSig("");
    updateFocusDial(task);
    syncFocusSessionNotesInput(String(task.id || ""));
    syncFocusSessionNotesAccordion(String(task.id || ""));
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
  }

  function closeFocusMode() {
    const focusScreenEl = els.focusModeScreen as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    if (focusScreenEl && activeEl && focusScreenEl.contains(activeEl)) {
      if (els.footerTasksBtn && typeof els.footerTasksBtn.focus === "function") els.footerTasksBtn.focus();
      else if (els.mode1Btn && typeof els.mode1Btn.focus === "function") els.mode1Btn.focus();
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
    const timer = ctx.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      ctx.setFocusSessionNoteSaveTimer(null);
    }
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "none";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
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
    ctx.render();
    openDeferredFocusModeTimeGoalModal();
  }

  function isFocusModeFilteringAlerts() {
    return String(ctx.getFocusModeTaskId() || "").trim().length > 0;
  }

  function shouldSuppressTaskAlertsInFocusMode(taskIdRaw: string | null | undefined) {
    const activeFocusTaskId = String(ctx.getFocusModeTaskId() || "").trim();
    const taskId = String(taskIdRaw || "").trim();
    return !!activeFocusTaskId && !!taskId && taskId !== activeFocusTaskId;
  }

  function noteSuppressedFocusModeAlert(toast: SuppressedCheckpointToast) {
    const taskId = String(toast.taskId || "").trim();
    if (!taskId) return;
    setSuppressedMap({ ...getSuppressedMap(), [taskId]: { ...toast, taskId } });
  }

  function getSuppressedFocusModeAlert(taskIdRaw: string | null | undefined) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId) return null;
    return getSuppressedMap()[taskId] || null;
  }

  function clearSuppressedFocusModeAlert(taskIdRaw: string | null | undefined) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId || !getSuppressedMap()[taskId]) return;
    const next = { ...getSuppressedMap() };
    delete next[taskId];
    setSuppressedMap(next);
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
    const queue = getDeferredQueue();
    if (!queue.length) return;
    const [nextPending, ...rest] = queue;
    ctx.setDeferredFocusModeTimeGoalModals(rest);
    if (!nextPending) return;
    const task = ctx.getTasks().find((row) => String(row.id || "").trim() === nextPending.taskId);
    if (!task || !task.timeGoalEnabled || !(Number(task.timeGoalMinutes || 0) > 0)) {
      openDeferredFocusModeTimeGoalModal();
      return;
    }
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
    const onMainTaskTimerRoute = /\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path);
    if (onMainTaskTimerRoute) {
      ctx.jumpToTaskById(taskId);
      return;
    }
    ctx.savePendingTaskJump(taskId);
    ctx.navigateToAppRoute("/tasktimer");
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
    let shouldResetAtTimeGoal: null | "resetLog" | "resetNoLog" = null;
    let shouldOpenTimeGoalModal = false;
    let openTimeGoalModalAsReminder = false;
    msSorted.forEach((m) => {
      const targetSec = Math.max(0, Math.round((+m.hours || 0) * sharedTasks.milestoneUnitSec(task)));
      if (targetSec <= 0 || targetSec <= prevBaseline || targetSec > elapsedWholeSec) return;
      const key = checkpointKeyForTask(m, task);
      if (fired.has(key)) return;
      fired.add(key);
      const text = formatCheckpointAlertText(task, m);
      const checkpointIndex = Math.max(1, validMilestones.findIndex((vm) => checkpointKeyForTask(vm, task) === key) + 1);
      const checkpointTimeText = ctx.formatTime(targetSec * 1000);
      const checkpointDescText = String(m.description || "").trim();
      const suppressForFocusMode = shouldSuppressTaskAlertsInFocusMode(taskId);
      if (ctx.getCheckpointAlertToastEnabled() && task.checkpointToastEnabled && !suppressForFocusMode) {
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
      if (
        suppressForFocusMode &&
        ((ctx.getCheckpointAlertToastEnabled() && task.checkpointToastEnabled) ||
          (ctx.getCheckpointAlertSoundEnabled() && task.checkpointSoundEnabled))
      ) {
        const toastMode = task.checkpointToastMode === "manual" ? "manual" : "auto5s";
        noteSuppressedFocusModeAlert({
          title: `Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`,
          text,
          autoCloseMs: ctx.getCheckpointAlertToastEnabled() && task.checkpointToastEnabled ? (toastMode === "manual" ? null : 5000) : 5000,
          taskId,
          taskName: task.name || "",
          counterText: ctx.formatMainTaskElapsed(getElapsedMs(task)),
          checkpointTimeText,
          checkpointDescText,
          muteRepeatOnManualDismiss:
            ctx.getCheckpointAlertSoundEnabled() && !!task.checkpointSoundEnabled && (task.checkpointSoundMode || "once") === "repeat",
        });
      }
      if (ctx.getCheckpointAlertSoundEnabled() && task.checkpointSoundEnabled && !suppressForFocusMode) beepCount += 1;
    });
    const timeGoalSec = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Math.round(Number(task.timeGoalMinutes || 0) * 60) : 0;
    const taskTimeGoalAction = getTaskTimeGoalAction(task);
    if (
      timeGoalSec > 0 &&
      prevBaseline < timeGoalSec &&
      elapsedWholeSec >= timeGoalSec &&
      (taskTimeGoalAction === "resetLog" || taskTimeGoalAction === "resetNoLog")
    ) {
      shouldResetAtTimeGoal = taskTimeGoalAction;
    }
    if (
      timeGoalSec > 0 &&
      taskTimeGoalAction === "confirmModal" &&
      ctx.getTimeGoalModalTaskId() !== taskId &&
      prevBaseline < timeGoalSec &&
      elapsedWholeSec >= timeGoalSec
    ) {
      shouldOpenTimeGoalModal = true;
    }
    if (
      timeGoalSec > 0 &&
      taskTimeGoalAction === "confirmModal" &&
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
      if (shouldSuppressTaskAlertsInFocusMode(taskId)) {
        queueDeferredFocusModeTimeGoalModal(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder });
        return;
      }
      openTimeGoalCompleteModal(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder });
      baselineByTaskId[taskId] = Math.floor(getElapsedMs(task) / 1000);
      return;
    }
    if (shouldResetAtTimeGoal) {
      ctx.resetTaskStateImmediate(task, {
        logHistory: shouldResetAtTimeGoal === "resetLog",
        sessionNote: captureResetActionSessionNote(String(task.id || "")),
      });
    }
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
        processCheckpointAlertsForTask(task, elapsedMs / 1000);
        processedCheckpointTaskIds.add(String(task.id || ""));
      });
    }
    tasks.forEach((task) => {
      const taskId = String(task.id || "");
      if (!taskId || processedCheckpointTaskIds.has(taskId)) return;
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
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets({ includeAvgSession: false });
    runtime.tickRaf = window.requestAnimationFrame(() => {
      runtime.tickTimeout = window.setTimeout(tick, 200);
    });
  }

  function registerSessionEvents() {
    ctx.on(els.focusModeBackBtn, "click", closeFocusMode);
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
      scheduleFocusSessionNoteSave(String(ctx.getFocusModeTaskId() || ""), String(els.focusSessionNotesInput?.value || ""));
    });
    ctx.on(els.timeGoalCompleteUpdateGoalBtn, "click", () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (!task) return;
      populateTimeGoalCompleteEditor(task);
      setTimeGoalCompleteEditorVisible(true);
    });
    ctx.on(els.timeGoalCompleteContinueCancelBtn, "click", () => setTimeGoalCompleteEditorVisible(false));
    ctx.on(els.timeGoalCompleteDurationValueInput, "input", syncTimeGoalCompleteDurationUnitUi);
    ctx.on(els.timeGoalCompleteDurationUnitMinute, "click", () => {
      ctx.setTimeGoalCompleteDurationUnit("minute");
      syncTimeGoalCompleteDurationUnitUi();
    });
    ctx.on(els.timeGoalCompleteDurationUnitHour, "click", () => {
      ctx.setTimeGoalCompleteDurationUnit("hour");
      syncTimeGoalCompleteDurationUnitUi();
    });
    ctx.on(els.timeGoalCompleteDurationPeriodDay, "click", () => {
      ctx.setTimeGoalCompleteDurationPeriod("day");
      syncTimeGoalCompleteDurationUnitUi();
    });
    ctx.on(els.timeGoalCompleteDurationPeriodWeek, "click", () => {
      ctx.setTimeGoalCompleteDurationPeriod("week");
      syncTimeGoalCompleteDurationUnitUi();
    });
    ctx.on(els.timeGoalCompleteSaveBtn, "click", async () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (task) openTimeGoalSaveNoteChoice(task);
    });
    ctx.on(els.timeGoalCompleteDiscardBtn, "click", async () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (task) await resolveTimeGoalCompletion(task, { logHistory: false });
    });
    ctx.on(els.timeGoalCompleteSaveNoteNoBtn, "click", async () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (!task) return;
      ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      persistPendingTimeGoalFlow(task, "main");
      await resolveTimeGoalCompletion(task, { logHistory: true });
    });
    ctx.on(els.timeGoalCompleteSaveNoteYesBtn, "click", () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (task) openTimeGoalNoteModal(task);
    });
    ctx.on(els.timeGoalCompleteNoteInput, "input", () => {
      const taskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
      if (taskId) setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput?.value || ""));
    });
    ctx.on(els.timeGoalCompleteNoteDoneBtn, "click", async () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      const taskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
      if (!task || !taskId) return;
      setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput?.value || ""));
      ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
      await resolveTimeGoalCompletion(task, { logHistory: true });
    });
    ctx.on(els.timeGoalCompleteContinueConfirmBtn, "click", () => {
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(ctx.getTimeGoalModalTaskId() || ""));
      if (!task) return;
      const currentElapsedMs = Math.max(0, Math.floor(Number(ctx.getTimeGoalModalFrozenElapsedMs() || 0) || 0));
      const nextGoalMinutes = getTimeGoalCompleteDurationMinutes();
      const rawValue = Math.max(1, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "1") || 1));
      task.timeGoalEnabled = nextGoalMinutes > 0;
      task.timeGoalValue = rawValue;
      task.timeGoalUnit = ctx.getTimeGoalCompleteDurationUnit();
      task.timeGoalPeriod = ctx.getTimeGoalCompleteDurationPeriod();
      task.timeGoalMinutes = nextGoalMinutes;
      resumeTaskAfterTimeGoalModal(task);
      if (!(nextGoalMinutes > 0) || nextGoalMinutes * 60 <= Math.floor(currentElapsedMs / 1000)) {
        ctx.getTimeGoalReminderAtMsByTaskId()[String(task.id || "")] = nowMs() + getTimeGoalReminderDelayMs();
      } else {
        delete ctx.getTimeGoalReminderAtMsByTaskId()[String(task.id || "")];
      }
      ctx.getCheckpointBaselineSecByTaskId()[String(task.id || "")] = Math.floor(currentElapsedMs / 1000);
      ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      clearPendingTimeGoalFlow();
      ctx.save();
      void ctx.syncSharedTaskSummariesForTask(String(task.id || "")).catch(() => {});
      ctx.render();
      openDeferredFocusModeTimeGoalModal();
    });
    ctx.on(els.checkpointToastHost, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "closeCheckpointToast") dismissCheckpointToast({ manual: true });
      else if (action === "jumpToCheckpointTask") dismissCheckpointToastAndJumpToTask();
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
    captureResetActionSessionNote,
    clearFocusSessionDraft,
    setFocusSessionDraft,
    syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion,
    resetCheckpointAlertTracking,
    clearCheckpointBaseline,
    isFocusModeFilteringAlerts,
    getSuppressedFocusModeAlert,
    clearSuppressedFocusModeAlert,
    checkpointRepeatActiveTaskId: () => ctx.getCheckpointRepeatActiveTaskId(),
    activeCheckpointToastTaskId: () => String(getActiveToast()?.taskId || "").trim() || null,
    stopCheckpointRepeatAlert,
    enqueueCheckpointToast,
    registerSessionEvents,
    destroySessionRuntime,
  };
}
