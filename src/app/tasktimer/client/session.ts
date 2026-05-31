import type { HistoryByTaskId, LiveTaskSession, Task } from "../lib/types";
import { nowMs } from "../lib/time";
import { computeFocusInsights } from "../lib/focusInsights";
import { applyPendingTimeGoalXpAward, awardCompletedSessionXp, hasPendingTimeGoalXp } from "../lib/rewards";
import { formatFocusElapsed } from "../lib/tasks";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import {
  isTaskTimeGoalCompletedToday,
  isTaskTimeGoalStartLockedByHistoryToday,
  markTaskTimeGoalCompleted,
} from "../lib/timeGoalCompletion";
import {
  findNextScheduledTaskAfterLocalTime,
  formatScheduleSlotTime,
  getLocalScheduleDay,
  getTaskScheduledDayEntries,
  parseScheduleTimeMinutes,
} from "../lib/schedule-placement";
import { normalizeTaskColor } from "../lib/taskColors";
import type { FocusModeTransitionOptions, TaskTimerSessionContext } from "./context";
import { getDelegatedAction } from "./delegated-actions";
import { buildTaskProgressModel } from "./task-card-view-model";
import { formatCompactCheckpointDuration } from "./checkpoint-duration-format";
import { createFocusSessionDrafts, createLocalStorageFocusSessionDraftStorage } from "./focus-session-drafts";
import { playTaskCompleteConfettiHaptic } from "./interaction-haptics";
import { formatTimeGoalAwardCountText, formatTimeGoalAwardText, startTimeGoalConfetti, startTimeGoalGoldShatter, startTimeGoalXpSplashAfterConfetti, stopTimeGoalConfetti } from "./time-goal-confetti";
import { hasBlockingTimeGoalCompleteOverlay } from "./overlay-visibility";
import {
  getFocusDndEnabled,
  getNativeFocusDndStatus,
  openNativeFocusDndAccessSettings,
  startNativeFocusDndSession,
  stopNativeFocusDndSession,
} from "../lib/nativeFocusDnd";
import { captureXpAwardRectSnapshot, dispatchOverlayClosedEvent, dispatchPendingXpAwardEvent, TASKTIMER_OVERLAY_CLOSED_EVENT } from "./xp-award-events";
import { reconcileResumePendingTasks } from "./resume-pending-reset";
import { createClickAudioPlayer } from "./click-audio-player";
import {
  getRichNoteEditorValue,
  handleRichNoteToolbarStateEvent,
  handleRichNotePaste,
  handleRichNoteToolbarClick,
  richNoteHasMeaningfulText,
  setRichNoteEditorValue,
  syncRichNoteToolbarStates,
} from "./rich-session-notes";

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

type TimeGoalAwardPreview = { fromXp: number; toXp: number; awardedXp: number };

type DeferredTimeGoalModalEntry = {
  taskId: string;
  frozenElapsedMs: number;
  reminder: boolean;
  awardPreview?: TimeGoalAwardPreview;
};

type FocusModeCloseOptions = {
  animate?: boolean;
};

const FOCUS_MODE_ZOOM_MS = 380;
const FOCUS_MODE_FADE_CLOSE_MS = 180;
const FOCUS_SESSION_NOTES_DEFAULT_HEIGHT_PX = 96;
const FOCUS_SESSION_NOTES_FALLBACK_MAX_HEIGHT_RATIO = 0.5;
const FOCUS_DIAL_FALLBACK_PROGRESS_SECONDS = 60 * 60;
const FOCUS_PROGRESS_ARC_CENTER = 50;
const FOCUS_PROGRESS_ARC_RADIUS = 41;
const FOCUS_MODE_START_AUDIO_SRC = "/focus-mode-start.mp3";
const FOCUS_MODE_EXIT_CLICK_AUDIO_SRC = "/click_close_button.mp3";
const TIME_GOAL_XP_REWARD_AUDIO_SRC = "/xp-reward.mp3";

export type TimeGoalCompleteNextTaskOption = {
  id: string;
  name: string;
  color: string;
  scheduleText: string;
};

export function getTimeGoalCompleteMetaMessage(
  nextTaskOptions: TimeGoalCompleteNextTaskOption[]
): string {
  return Array.isArray(nextTaskOptions) && nextTaskOptions.length === 0
    ? "All tasks completed for today!"
    : "";
}

export function shouldOpenFocusModeForTimeGoalNextTask(
  activeFocusTaskIdRaw: unknown,
  completedTaskIdRaw: unknown
): boolean {
  const activeFocusTaskId = String(activeFocusTaskIdRaw || "").trim();
  const completedTaskId = String(completedTaskIdRaw || "").trim();
  return !!activeFocusTaskId && !!completedTaskId && activeFocusTaskId === completedTaskId;
}

export function shouldKeepTimeGoalCompletionFlowForTask(
  task: Task | null | undefined,
  opts: {
    elapsedMs: number;
    liveSession?: LiveTaskSession | null;
    historyByTaskId?: HistoryByTaskId | null;
    nowMs?: number;
    getTaskTimeGoalAction?: (task: Task) => string;
  }
) {
  if (!task || !task.running) return false;
  if (shouldSuppressTimeGoalCompletionForTask(task, { historyByTaskId: opts.historyByTaskId, nowMs: opts.nowMs })) return false;
  const taskId = String(task.id || "").trim();
  const liveSessionTaskId = String(opts.liveSession?.taskId || "").trim();
  if (!taskId || liveSessionTaskId !== taskId) return false;
  const timeGoalMinutes = Number(task.timeGoalMinutes || 0);
  if (!(task.timeGoalEnabled && timeGoalMinutes > 0)) return false;
  if ((opts.getTaskTimeGoalAction?.(task) || "confirmModal") !== "confirmModal") return false;
  const elapsedMs = Math.max(0, Math.floor(Number(opts.elapsedMs || 0) || 0));
  return elapsedMs >= Math.round(timeGoalMinutes * 60 * 1000);
}

export function shouldSuppressTimeGoalCompletionForTask(
  task: Task | null | undefined,
  opts: { historyByTaskId?: HistoryByTaskId | null; nowMs?: number } = {}
): boolean {
  if (!isTaskTimeGoalCompletedToday(task, opts.nowMs)) return false;
  if (!opts.historyByTaskId) return true;
  return isTaskTimeGoalStartLockedByHistoryToday(task, opts.historyByTaskId, opts.nowMs);
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

export function markTaskTimeGoalCompletedForResolution(
  task: Task,
  completedAtMs: number,
  elapsedMs?: number | null,
  opts: { historyByTaskId?: HistoryByTaskId | null } = {}
): void {
  if (shouldSuppressTimeGoalCompletionForTask(task, { historyByTaskId: opts.historyByTaskId, nowMs: completedAtMs })) return;
  markTaskTimeGoalCompleted(task, completedAtMs, { reason: "goal", elapsedMs });
}

export function didElapsedReachTimeGoalFromBaseline(
  prevBaselineSecRaw: unknown,
  elapsedWholeSecRaw: unknown,
  timeGoalSecRaw: unknown
): boolean {
  const elapsedWholeSec = Math.floor(Math.max(0, Number(elapsedWholeSecRaw) || 0));
  const timeGoalSec = Math.round(Math.max(0, Number(timeGoalSecRaw) || 0));
  if (timeGoalSec <= 0 || elapsedWholeSec < timeGoalSec) return false;
  const prevBaselineSec = Number(prevBaselineSecRaw);
  return !Number.isFinite(prevBaselineSec) || prevBaselineSec < timeGoalSec;
}

export function getTimeGoalCompletionElapsedMs(task: Task | null | undefined, elapsedMsRaw: unknown): number {
  const elapsedMs = Math.max(0, Math.floor(Number(elapsedMsRaw || 0) || 0));
  const timeGoalMinutes = Number(task?.timeGoalMinutes || 0);
  if (!(task?.timeGoalEnabled && timeGoalMinutes > 0)) return elapsedMs;
  const timeGoalMs = Math.max(0, Math.round(timeGoalMinutes * 60_000));
  return timeGoalMs > 0 ? Math.min(elapsedMs, timeGoalMs) : elapsedMs;
}

export function resetFocusModeScrollPosition(focusModeScreen: HTMLElement | null | undefined): void {
  const screen = focusModeScreen || null;
  if (screen) {
    screen.scrollTop = 0;
    screen.scrollLeft = 0;
    let parent = screen.parentElement;
    while (parent) {
      parent.scrollTop = 0;
      parent.scrollLeft = 0;
      parent = parent.parentElement;
    }
  }

  const doc = screen?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (doc?.documentElement) {
    doc.documentElement.scrollTop = 0;
    doc.documentElement.scrollLeft = 0;
  }
  if (doc?.body) {
    doc.body.scrollTop = 0;
    doc.body.scrollLeft = 0;
  }

  const windowRef = doc?.defaultView ?? (typeof window !== "undefined" ? window : null);
  if (typeof windowRef?.scrollTo === "function") {
    windowRef.scrollTo(0, 0);
  }
}

function formatTimeGoalCompleteNextTaskSchedule(task: Task, nowDate = new Date()) {
  const entries = getTaskScheduledDayEntries(task);
  if (!entries.length) return "Unscheduled";
  const today = getLocalScheduleDay(nowDate);
  const entry = entries.find((row) => row.day === today) || entries[0];
  const startMinutes = parseScheduleTimeMinutes(entry?.time);
  return startMinutes == null ? "Unscheduled" : formatScheduleSlotTime(startMinutes);
}

function getTimeGoalCompleteNextTaskScheduleSortMinutes(task: Task, nowDate = new Date()) {
  const entries = getTaskScheduledDayEntries(task);
  if (!entries.length) return Number.POSITIVE_INFINITY;
  const today = getLocalScheduleDay(nowDate);
  const entry = entries.find((row) => row.day === today) || entries[0];
  const startMinutes = parseScheduleTimeMinutes(entry?.time);
  return startMinutes == null ? Number.POSITIVE_INFINITY : startMinutes;
}

export function buildTimeGoalCompleteNextTaskOptions(
  tasks: Task[],
  opts: { activeTaskId?: string | null; fallbackColor?: string; historyByTaskId?: Record<string, any[]>; nowMs?: number } = {}
): TimeGoalCompleteNextTaskOption[] {
  const activeTaskId = String(opts.activeTaskId || "").trim();
  const fallbackColor = normalizeTaskColor(opts.fallbackColor) || "#35e8ff";
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId || taskId === activeTaskId) return false;
      if (task.running) return false;
      if (!(task.timeGoalEnabled && task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0)) return false;
      return !isTaskTimeGoalStartLockedByHistoryToday(task, opts.historyByTaskId || {}, opts.nowMs);
    })
    .map((task, index) => ({
      id: String(task.id || "").trim(),
      name: String(task.name || "Task").trim() || "Task",
      color: normalizeTaskColor(task.color) || fallbackColor,
      scheduleText: formatTimeGoalCompleteNextTaskSchedule(task),
      scheduleSortMinutes: getTimeGoalCompleteNextTaskScheduleSortMinutes(task),
      sourceIndex: index,
    }))
    .sort((a, b) => a.scheduleSortMinutes - b.scheduleSortMinutes || a.sourceIndex - b.sourceIndex)
    .map((task) => ({
      id: task.id,
      name: task.name,
      color: task.color,
      scheduleText: task.scheduleText,
    }));
}

export function createTaskTimerSession(ctx: TaskTimerSessionContext) {
  const { els, runtime } = ctx;
  const { sharedTasks } = ctx;
  const getDeferredQueue = () => ctx.getDeferredFocusModeTimeGoalModals();
  const getToastQueue = () => ctx.getCheckpointToastQueue() as CheckpointToast[];
  const getActiveToast = () => ctx.getActiveCheckpointToast() as CheckpointToast | null;
  const setActiveToast = (value: CheckpointToast | null) => ctx.setActiveCheckpointToast(value as unknown);
  let timeGoalCompleteAudio: HTMLAudioElement | null = null;
  let timeGoalCompleteClickAudio: HTMLAudioElement | null = null;
  let activeFocusTransitionClone: HTMLElement | null = null;
  let activeFocusTransitionTimer: number | null = null;
  let focusTransitionSourceTaskId: string | null = null;
  let focusTransitionSourceRect: DOMRect | null = null;
  const focusModeStartPlayer = createClickAudioPlayer(FOCUS_MODE_START_AUDIO_SRC);
  const focusModeExitClickPlayer = createClickAudioPlayer(FOCUS_MODE_EXIT_CLICK_AUDIO_SRC);
  const timeGoalXpRewardPlayer = createClickAudioPlayer(TIME_GOAL_XP_REWARD_AUDIO_SRC);

  function setFocusDndSetupVisible(visible: boolean, message?: string) {
    if (els.focusDndSetup) {
      els.focusDndSetup.hidden = !visible;
    }
    if (els.focusDndSetupText && message) {
      els.focusDndSetupText.textContent = message;
    }
  }

  async function syncFocusDndSetupPrompt() {
    if (!getFocusDndEnabled(ctx.storageKeys.FOCUS_DND_STORAGE_KEY)) {
      setFocusDndSetupVisible(false);
      return;
    }
    const status = await getNativeFocusDndStatus().catch(() => null);
    if (!status?.supported) {
      setFocusDndSetupVisible(false);
      return;
    }
    setFocusDndSetupVisible(
      !status.policyAccessGranted,
      !status.policyAccessGranted
        ? "Focus Do Not Disturb needs Android DND access before it can silence interruptions."
        : "Focus Do Not Disturb is ready."
    );
  }

  function startFocusDnd() {
    const storageKey = ctx.storageKeys.FOCUS_DND_STORAGE_KEY;
    if (!getFocusDndEnabled(storageKey)) {
      setFocusDndSetupVisible(false);
      return;
    }
    void getNativeFocusDndStatus()
      .then(async (status) => {
        if (!status.supported) {
          setFocusDndSetupVisible(false);
          return;
        }
        if (!status.policyAccessGranted) {
          setFocusDndSetupVisible(true, "Focus Do Not Disturb needs Android DND access before it can silence interruptions.");
          await openNativeFocusDndAccessSettings().catch(() => {});
          return;
        }
        await startNativeFocusDndSession({ storageKey });
      })
      .then(() => syncFocusDndSetupPrompt())
      .catch(() => syncFocusDndSetupPrompt());
  }

  function stopFocusDnd() {
    void stopNativeFocusDndSession().catch(() => {});
    setFocusDndSetupVisible(false);
  }

  function getFocusSessionNotesMinHeight(input: HTMLElement) {
    const doc = input.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    const windowRef = doc?.defaultView ?? (typeof window !== "undefined" ? window : null);
    const computedMinHeight = windowRef?.getComputedStyle
      ? Number.parseFloat(windowRef.getComputedStyle(input).minHeight || "")
      : Number.NaN;
    return Number.isFinite(computedMinHeight) && computedMinHeight > 0
      ? computedMinHeight
      : FOCUS_SESSION_NOTES_DEFAULT_HEIGHT_PX;
  }

  function getFocusSessionNotesMaxHeight(input: HTMLElement, minHeight: number) {
    const doc = input.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    const windowRef = doc?.defaultView ?? (typeof window !== "undefined" ? window : null);
    const viewportHeight = Math.max(
      minHeight,
      Math.floor(Number(windowRef?.innerHeight || 0) || 0)
    );
    const fallbackMaxHeight = Math.max(
      minHeight,
      Math.floor((viewportHeight || 768) * FOCUS_SESSION_NOTES_FALLBACK_MAX_HEIGHT_RATIO)
    );
    const computedMaxHeight = windowRef?.getComputedStyle
      ? Number.parseFloat(windowRef.getComputedStyle(input).maxHeight || "")
      : Number.NaN;
    if (Number.isFinite(computedMaxHeight) && computedMaxHeight >= minHeight) {
      return Math.max(minHeight, Math.min(computedMaxHeight, fallbackMaxHeight));
    }
    return fallbackMaxHeight;
  }

  function autosizeFocusSessionNotesInput() {
    const input = els.focusSessionNotesInput as HTMLElement | null;
    if (!input) return;
    input.style.height = "auto";
    const minHeight = getFocusSessionNotesMinHeight(input);
    const maxHeight = getFocusSessionNotesMaxHeight(input, minHeight);
    const nextHeight = Math.max(minHeight, Math.ceil(Number(input.scrollHeight || 0) || 0));
    const clampedHeight = Math.min(nextHeight, maxHeight);
    input.style.height = `${clampedHeight}px`;
    input.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
  }

  const focusSessionDrafts = createFocusSessionDrafts(
    {
      getDrafts: () => ctx.getFocusSessionNotesByTaskId(),
      setDrafts: (next) => ctx.setFocusSessionNotesByTaskId(next),
      getActiveTaskId: () => ctx.getFocusModeTaskId(),
      getPendingSaveTimer: () => ctx.getFocusSessionNoteSaveTimer(),
      setPendingSaveTimer: (next) => ctx.setFocusSessionNoteSaveTimer(next),
      getInputValue: () => getRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null),
      setInputValue: (next) => {
        if (els.focusSessionNotesInput) {
          setRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null, next);
          autosizeFocusSessionNotesInput();
        }
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

  function getPreferredFocusSessionNote(taskId?: string | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return "";
    const liveNote = String(ctx.getLiveSessionsByTaskId()?.[normalizedTaskId]?.note || "").trim();
    if (liveNote) return liveNote;
    return focusSessionDrafts.getDraft(normalizedTaskId);
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      focusSessionDrafts.syncInput(null);
      autosizeFocusSessionNotesInput();
      clearFocusSessionNotesSavedStatus();
      return;
    }
    const nextValue = getPreferredFocusSessionNote(normalizedTaskId);
    if (els.focusSessionNotesInput) setRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null, nextValue);
    autosizeFocusSessionNotesInput();
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
    if (!richNoteHasMeaningfulText(getRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null))) {
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
        const currentTask = ctx.getTasks().find((row) => String(row.id || "").trim() === String(taskId || "").trim()) || null;
        if (currentTask?.running) {
          ctx.upsertLiveSession(currentTask, {
            elapsedMs: ctx.getTaskElapsedMs(currentTask),
            note: noteRaw,
            reason: "focus-note-input",
          });
        }
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

  function getTimeGoalCompleteNextTaskOptions() {
    return buildTimeGoalCompleteNextTaskOptions(ctx.getTasks(), {
      activeTaskId: getActiveTimeGoalModalTaskId(),
      historyByTaskId: ctx.getHistoryByTaskId(),
      nowMs: nowMs(),
    });
  }

  function syncTimeGoalCompleteNextTaskGrid() {
    const host = els.timeGoalCompleteNextTasks as HTMLElement | null;
    const grid = els.timeGoalCompleteNextTaskGrid as HTMLElement | null;
    if (!host || !grid) return;
    const options = getTimeGoalCompleteNextTaskOptions();
    const metaMessage = getTimeGoalCompleteMetaMessage(options);
    if (!options.length) {
      host.hidden = false;
      grid.innerHTML = `<p class="timeGoalCompleteNextTaskTitle">${ctx.escapeHtmlUI(metaMessage)}</p>`;
      return;
    }
    host.hidden = false;
    grid.innerHTML = [
      `<p class="timeGoalCompleteNextTaskTitle">Click a task below to launch immediately</p>`,
      ...options.map(
        (task) => `<button class="timeGoalCompleteNextTaskTile" type="button" data-time-goal-next-task-id="${ctx.escapeHtmlUI(
          task.id
        )}" style="--task-color:${ctx.escapeHtmlUI(task.color)}"><span class="timeGoalCompleteNextTaskName">${ctx.escapeHtmlUI(
          task.name
        )}</span><span class="timeGoalCompleteNextTaskTime">${ctx.escapeHtmlUI(task.scheduleText)}</span></button>`
      ),
    ].join("");
  }

  function startTimeGoalCompleteConfetti() {
    const started = startTimeGoalConfetti(els.timeGoalCompleteConfettiStage as HTMLElement | null);
    if (!started) return;
    playTaskCompleteConfettiHaptic({
      isEnabled: ctx.getInteractionHapticsEnabled,
      getIntensity: ctx.getInteractionHapticsIntensity,
    });
  }

  function stopTimeGoalCompleteConfetti() {
    stopTimeGoalConfetti(els.timeGoalCompleteConfettiStage as HTMLElement | null);
  }

  function isOverlayVisible(overlay: HTMLElement | null) {
    return !!overlay && overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
  }

  function isVisibleTimeGoalCompleteModalForTask(taskIdRaw?: string | null) {
    const taskId = String(taskIdRaw || "").trim();
    const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
    return !!taskId && isOverlayVisible(overlay) && String(overlay?.dataset.taskId || "").trim() === taskId;
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
      stopTimeGoalCompleteConfetti();
      ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    }
    if (
      !normalizedTaskId ||
      String((els.timeGoalCompleteOverlay as HTMLElement | null)?.dataset.taskId || "").trim() === normalizedTaskId
    ) {
      const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
      if (overlay) {
        delete overlay.dataset.taskId;
        delete overlay.dataset.awardedXp;
      }
    }
    syncTimeGoalCompleteLaunchNextButton();
    syncTimeGoalCompleteNextTaskGrid();
    if (normalizedTaskId) delete ctx.getTimeGoalReminderAtMsByTaskId()[normalizedTaskId];
  }

  function persistPendingTimeGoalFlow(task: Task, step: "main", opts?: { reminder?: boolean }) {
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
    | { taskId: string; step: "main"; frozenElapsedMs: number; reminder: boolean }
    | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ctx.storageKeys.TIME_GOAL_PENDING_FLOW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const taskId = String(parsed?.taskId || "").trim();
      const frozenElapsedMs = Math.max(0, Math.floor(Number(parsed?.frozenElapsedMs || 0) || 0));
      const reminder = !!parsed?.reminder;
      if (!taskId) return null;
      return { taskId, step: "main", frozenElapsedMs, reminder };
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
      historyByTaskId: ctx.getHistoryByTaskId(),
      nowMs: nowMs(),
      getTaskTimeGoalAction,
    });
  }

  function getTimeGoalCompletionAwardPreview(task: Task, elapsedMs: number): TimeGoalAwardPreview {
    const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    const taskId = String(task.id || "").trim();
    const pendingAward = applyPendingTimeGoalXpAward(ctx.getRewardProgress(), taskId);
    const hasPendingAward = hasPendingTimeGoalXp(ctx.getRewardProgress(), taskId);
    const elapsedAlreadyLoggedMs = hasPendingAward ? Math.max(0, Math.floor(Number(task.accumulatedMs || 0) || 0)) : 0;
    const awardElapsedMs = Math.max(0, safeElapsedMs - elapsedAlreadyLoggedMs);
    if (safeElapsedMs <= 0) {
      const currentXp = Math.max(0, Math.floor(Number(ctx.getRewardProgress().totalXp || 0) || 0));
      return { fromXp: currentXp, toXp: currentXp, awardedXp: 0 };
    }
    const award = awardCompletedSessionXp(pendingAward.next, {
      taskId: taskId || null,
      awardedAt: nowMs(),
      elapsedMs: awardElapsedMs,
      historyByTaskId: ctx.getHistoryByTaskId(),
      tasks: ctx.getTasks(),
      weekStarting: ctx.getWeekStarting(),
      optimalProductivityDays: ctx.getOptimalProductivityDays(),
      momentumEntitled: true,
    });
    return {
      fromXp: pendingAward.previous.totalXp,
      toXp: award.next.totalXp,
      awardedXp: Math.max(0, Math.floor(Number((pendingAward.amount || 0) + (award.amount || 0)) || 0)),
    };
  }

  function openTimeGoalCompleteModal(
    task: Task,
    elapsedMs: number,
    opts?: { reminder?: boolean; awardPreview?: TimeGoalAwardPreview }
  ) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    suppressCheckpointToastsForTask(taskId);
    ctx.setTimeGoalModalTaskId(taskId);
    ctx.setTimeGoalModalFrozenElapsedMs(Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)));
    if (els.timeGoalCompleteOverlay) {
      (els.timeGoalCompleteOverlay as HTMLElement).dataset.taskId = taskId;
    }
    delete ctx.getTimeGoalReminderAtMsByTaskId()[taskId];
    if (els.timeGoalCompleteTitle) {
      els.timeGoalCompleteTitle.textContent = `${String(task.name || "Task")} Complete!`;
    }
    const awardPreview = opts?.awardPreview || getTimeGoalCompletionAwardPreview(task, elapsedMs);
    const awardedXp = awardPreview.awardedXp;
    if (els.timeGoalCompleteOverlay) {
      (els.timeGoalCompleteOverlay as HTMLElement).dataset.awardedXp = String(awardedXp);
    }
    if (els.timeGoalCompleteText) {
      els.timeGoalCompleteText.textContent = awardedXp > 0 ? formatTimeGoalAwardCountText(0) : formatTimeGoalAwardText(awardedXp);
    }
    if (els.timeGoalCompleteMeta) {
      els.timeGoalCompleteMeta.textContent = "";
      els.timeGoalCompleteMeta.hidden = true;
    }
    if (els.timeGoalCompleteNoteInput) {
      setRichNoteEditorValue(els.timeGoalCompleteNoteInput as HTMLElement | null, captureSessionNoteSnapshot(taskId));
    }
    syncTimeGoalCompleteLaunchNextButton();
    persistPendingTimeGoalFlow(task, "main", opts);
    syncTimeGoalCompleteNextTaskGrid();
    ctx.openOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    if (ctx.getAchievementSoundsEnabled()) playTimeGoalCompleteAudio();
    startTimeGoalCompleteConfetti();
    startTimeGoalXpSplashAfterConfetti(els.timeGoalCompleteText as HTMLElement | null, {
      awardedXp,
      matchMediaFn: typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined,
      onStart: () => {
        if (ctx.getAchievementSoundsEnabled()) timeGoalXpRewardPlayer.play();
      },
      onIntervalCue: () => {
        if (ctx.getAchievementSoundsEnabled()) timeGoalXpRewardPlayer.play();
        startTimeGoalGoldShatter(els.timeGoalCompleteText as HTMLElement | null);
      },
    });
    if (awardedXp > 0 && typeof window !== "undefined") {
      dispatchPendingXpAwardEvent(window, {
        ...awardPreview,
        sourceModal: "timeGoalComplete",
        sourceTaskId: taskId,
        sourceOverlayId: "timeGoalCompleteOverlay",
        sourceElementKey: "timeGoalCompleteText",
        sourceRect: captureXpAwardRectSnapshot(els.timeGoalCompleteText),
      });
    }
  }

  function replayTimeGoalCompleteXpText() {
    const overlay = els.timeGoalCompleteOverlay as HTMLElement | null;
    if (!isOverlayVisible(overlay)) return;
    const awardedXp = Math.max(0, Math.floor(Number(overlay?.dataset.awardedXp || 0) || 0));
    if (awardedXp <= 0) return;
    startTimeGoalXpSplashAfterConfetti(els.timeGoalCompleteText as HTMLElement | null, {
      awardedXp,
      delayMs: 0,
      matchMediaFn: typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined,
      onStart: () => {
        if (ctx.getAchievementSoundsEnabled()) timeGoalXpRewardPlayer.play();
      },
      onIntervalCue: () => {
        if (ctx.getAchievementSoundsEnabled()) timeGoalXpRewardPlayer.play();
        startTimeGoalGoldShatter(els.timeGoalCompleteText as HTMLElement | null);
      },
    });
  }

  function maybeRestorePendingTimeGoalFlow() {
    const pending = loadPendingTimeGoalFlow();
    const tasks = ctx.getTasks();
    if (pending) {
      const task = tasks.find((row) => String(row.id || "") === pending.taskId) || null;
      if (isVisibleTimeGoalCompleteModalForTask(pending.taskId)) {
        syncTimeGoalCompleteLaunchNextButton();
        return;
      }
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
      syncTimeGoalCompleteNextTaskGrid();
      return;
    }
    const task = ctx.getTasks().find((row) => String(row.id || "") === activeTaskId) || null;
    if (
      task &&
      isTaskTimeGoalCompletedToday(task) &&
      isVisibleTimeGoalCompleteModalForTask(activeTaskId)
    ) {
      syncTimeGoalCompleteLaunchNextButton();
      syncTimeGoalCompleteNextTaskGrid();
      return;
    }
    if (shouldKeepTimeGoalCompletionFlow(task, ctx.getTimeGoalModalFrozenElapsedMs())) {
      syncTimeGoalCompleteLaunchNextButton();
      syncTimeGoalCompleteNextTaskGrid();
      return;
    }
    clearTaskTimeGoalFlow(activeTaskId);
    stopTimeGoalCompleteConfetti();
    ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  async function resolveTimeGoalCompletion(task: Task, opts: { logHistory: boolean }) {
    const taskId = String(task.id || "");
    if (shouldSuppressTimeGoalCompletionForTask(task, { historyByTaskId: ctx.getHistoryByTaskId(), nowMs: nowMs() })) {
      clearTaskTimeGoalFlow(taskId);
      stopTimeGoalCompleteConfetti();
      ctx.closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      ctx.closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
      ctx.save();
      ctx.render();
      openDeferredFocusModeTimeGoalModal();
      return true;
    }
    if (taskId && els.timeGoalCompleteNoteInput) {
      setFocusSessionDraft(taskId, getRichNoteEditorValue(els.timeGoalCompleteNoteInput as HTMLElement | null));
    }
    const sessionNote = captureResetActionSessionNote(taskId);
    if (sessionNote) setFocusSessionDraft(taskId, sessionNote);
    markTaskTimeGoalCompletedForResolution(task, nowMs(), getTaskElapsedMs(task), { historyByTaskId: ctx.getHistoryByTaskId() });
    ctx.resetTaskStateImmediate(task, { logHistory: opts.logHistory, sessionNote });
    clearTaskTimeGoalFlow(taskId);
    stopTimeGoalCompleteConfetti();
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

  function launchNextTaskFromTimeGoalCompletion(nextTaskIdRaw: unknown) {
    const nextTaskId = String(nextTaskIdRaw || "").trim();
    if (!nextTaskId) return;
    const nextIndex = ctx.getTasks().findIndex((row) => String(row.id || "") === nextTaskId);
    if (nextIndex < 0) return;
    const shouldReopenFocusMode = shouldOpenFocusModeForTimeGoalNextTask(ctx.getFocusModeTaskId(), getActiveTimeGoalModalTaskId());
    ctx.startTask(nextIndex);
    if (shouldReopenFocusMode) {
      openFocusMode(nextIndex);
    }
  }

  function notifyTimeGoalCompleteOverlayClosedForXpAward() {
    if (typeof window === "undefined") return;
    dispatchOverlayClosedEvent(window, "timeGoalCompleteOverlay");
  }

  function completeTimeGoalTask(task: Task, elapsedMs: number, opts?: { reminder?: boolean; deferModal?: boolean }) {
    const taskId = String(task?.id || "").trim();
    if (!taskId || shouldSuppressTimeGoalCompletionForTask(task, { historyByTaskId: ctx.getHistoryByTaskId(), nowMs: nowMs() })) return false;
    const safeElapsedMs = getTimeGoalCompletionElapsedMs(task, elapsedMs);
    const awardPreview = getTimeGoalCompletionAwardPreview(task, safeElapsedMs);
    if (taskId && els.timeGoalCompleteNoteInput) {
      setFocusSessionDraft(taskId, getRichNoteEditorValue(els.timeGoalCompleteNoteInput as HTMLElement | null));
    }
    const sessionNote = captureResetActionSessionNote(taskId);
    if (sessionNote) setFocusSessionDraft(taskId, sessionNote);
    markTaskTimeGoalCompletedForResolution(task, nowMs(), safeElapsedMs, { historyByTaskId: ctx.getHistoryByTaskId() });
    task.accumulatedMs = safeElapsedMs;
    task.running = false;
    task.startMs = null;
    ctx.resetTaskStateImmediate(task, { logHistory: true, sessionNote });
    ctx.save();
    ctx.render();
    suppressCheckpointToastsForTask(taskId);
    if (opts?.deferModal || shouldDeferTimeGoalModalForBlockingOverlay()) {
      queueDeferredFocusModeTimeGoalModal(task, safeElapsedMs, { reminder: !!opts?.reminder, awardPreview });
    } else {
      openTimeGoalCompleteModal(task, safeElapsedMs, { reminder: !!opts?.reminder, awardPreview });
    }
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    return true;
  }

  function syncFocusRunButtons(task?: Task | null) {
    const running = !!task?.running;
    const completed = isTaskTimeGoalStartLockedByHistoryToday(task, ctx.getHistoryByTaskId(), nowMs());
    const hintText = completed ? "Done" : running ? "Tap to Stop" : task ? "Tap to Resume" : "Tap to Launch";
    if (els.focusDialHint) els.focusDialHint.textContent = hintText;
    if (els.focusResetBtn) els.focusResetBtn.disabled = !!task?.running || completed;
    if (els.focusDial) {
      els.focusDial.classList.toggle("isRunning", running);
      els.focusDial.classList.toggle("isStopped", !!task && !running && !completed);
      els.focusDial.classList.toggle("isDone", completed);
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
      days: ctx.getOptimalProductivityDays(),
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
    return String(targetSec);
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
      byKey.set(checkpointKeyForTask(m, task), { hours: +m.hours || 0, description: "" });
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
        return `
          <div class="focusCheckpointLogItem${idx === 0 ? " isLatest" : ""}">
            <div class="focusCheckpointLogItemLine">
              <span class="focusCheckpointLogItemTime">${ctx.escapeHtmlUI(timeText)}</span>
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

    const ringWidthPx = Math.max(0, ringEl.clientWidth);
    const ringHeightPx = Math.max(0, ringEl.clientHeight);
    const dialRadiusPx = Math.max(0, Math.min(ringWidthPx, ringHeightPx) / 2);
    const markerRadiusPx = Math.max(0, dialRadiusPx * 0.815);
    const labelRadiusPx = Math.max(0, dialRadiusPx * 0.94);
    const timeGoalSec = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Number(task.timeGoalMinutes || 0) * 60 : 0;
    const maxTargetSec = Math.max(timeGoalSec, milestoneTargetsSec[milestoneTargetsSec.length - 1] || 0, 1);
    const signature = [
      String(task.id || ""),
      showCheckpoints ? "on" : "off",
      String(maxTargetSec),
      `${ringWidthPx}x${ringHeightPx}`,
      markerRadiusPx.toFixed(1),
      labelRadiusPx.toFixed(1),
      ...sortedMilestones.map((m, idx) => {
        const targetSec = milestoneTargetsSec[idx] || 0;
        const reached = elapsedSec >= targetSec;
        return `${targetSec}:${reached ? 1 : 0}`;
      }),
    ].join("|");
    if (ctx.getFocusCheckpointSig() === signature) return;
    ctx.setFocusCheckpointSig(signature);

    const checkpointMarkerColor = normalizeTaskColor(task.color) || "";
    const checkpointMarkerColorStyle = checkpointMarkerColor
      ? `--focus-checkpoint-marker-color:${ctx.escapeHtmlUI(checkpointMarkerColor)};`
      : "";
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
        const label = formatCompactCheckpointDuration(targetSec);
        return `
          <span class="focusCheckpointMark${reached ? " reached" : ""}" style="--mxpx:${mx.toFixed(1)}px;--mypx:${my.toFixed(
            1
          )}px;--ma:${angleDeg.toFixed(1)}deg;${checkpointMarkerColorStyle}" aria-hidden="true" title="${ctx.escapeHtmlUI(title)}"></span>
          <span
            class="focusCheckpointLabel isActive${lx < 0 ? " left" : ""}${reached ? " reached" : ""}"
            style="--lxpx:${lx.toFixed(1)}px;--lypx:${ly.toFixed(1)}px;"
            aria-hidden="true"
          >
            <span class="focusCheckpointLabelTitle">${ctx.escapeHtmlUI(label)}</span>
          </span>
        `;
      })
      .join("");
  }

  function buildFocusProgressArcPath(pct: number) {
    const clampedPct = Math.max(0, Math.min(pct, 100));
    if (clampedPct <= 0) return "";

    const center = FOCUS_PROGRESS_ARC_CENTER;
    const radius = FOCUS_PROGRESS_ARC_RADIUS;
    const topY = center - radius;
    if (clampedPct >= 99.999) {
      const bottomY = center + radius;
      return `M ${center} ${topY} A ${radius} ${radius} 0 1 1 ${center} ${bottomY} A ${radius} ${radius} 0 1 1 ${center} ${topY}`;
    }

    const angleDeg = clampedPct * 3.6;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const x = center + Math.cos(angleRad) * radius;
    const y = center + Math.sin(angleRad) * radius;
    const largeArcFlag = angleDeg > 180 ? 1 : 0;
    return `M ${center} ${topY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
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
    const progressTargetSec = hasTimeGoal && timeGoalSec > 0 ? timeGoalSec : FOCUS_DIAL_FALLBACK_PROGRESS_SECONDS;
    const pct = progressTargetSec > 0 ? Math.min((elapsedSec / progressTargetSec) * 100, 100) : 0;
    const hasProgress = hasTimeGoal || elapsedSec > 0;
    if (els.focusDial) {
      els.focusDial.classList.toggle("hasTimeGoal", hasTimeGoal);
      els.focusDial.classList.toggle("hasProgress", hasProgress);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress", `${pct}%`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-value", `${pct}`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-angle", `${pct * 3.6}deg`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-color", ctx.fillBackgroundForPct(pct));
      const progressPath = els.focusDial.querySelector?.<SVGPathElement>(".focusDialProgressFill") || null;
      progressPath?.setAttribute("d", buildFocusProgressArcPath(pct));
    }
    renderFocusCheckpointRing(task, elapsedSec);
    renderFocusCheckpointCompletionLog(task);
  }

  function prefersReducedFocusMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function isUsableFocusTransitionRect(rect: DOMRect | null | undefined) {
    return !!rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 4 && rect.height > 4;
  }

  function cleanupFocusTransition() {
    if (activeFocusTransitionTimer != null) {
      window.clearTimeout(activeFocusTransitionTimer);
      activeFocusTransitionTimer = null;
    }
    activeFocusTransitionClone?.remove();
    activeFocusTransitionClone = null;
    document.body.classList.remove("isFocusModeTransitioning", "isFocusModeOpening", "isFocusModeClosing");
    (els.focusModeScreen as HTMLElement | null)?.classList.remove("focusModeTransitionEntering", "focusModeTransitionClosing");
  }

  function createFocusTransitionClone(sourceEl: HTMLElement, sourceRect: DOMRect) {
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("focusModeTransitionClone");
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    clone.style.transform = "translate3d(0, 0, 0) scale(1, 1)";
    document.body.appendChild(clone);
    return clone;
  }

  function animateFocusTransitionClone(clone: HTMLElement, fromRect: DOMRect, toRect: DOMRect, onDone: () => void, fadeOut = true) {
    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;
    const scaleX = toRect.width / fromRect.width;
    const scaleY = toRect.height / fromRect.height;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clone.removeEventListener("transitionend", finish);
      onDone();
    };
    clone.addEventListener("transitionend", finish, { once: true });
    activeFocusTransitionTimer = window.setTimeout(finish, FOCUS_MODE_ZOOM_MS + 80);
    window.requestAnimationFrame(() => {
      clone.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
      clone.style.opacity = fadeOut ? "0" : "1";
    });
  }

  function getFocusTransitionTargetRect() {
    const focusScreen = els.focusModeScreen as HTMLElement | null;
    const rect = focusScreen?.getBoundingClientRect?.();
    if (isUsableFocusTransitionRect(rect)) return rect as DOMRect;
    return {
      left: 0,
      top: 0,
      right: window.innerWidth || document.documentElement.clientWidth,
      bottom: window.innerHeight || document.documentElement.clientHeight,
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  function findFocusTransitionTaskCard(taskId: string) {
    const list = els.taskList as HTMLElement | null;
    if (!list || !taskId) return null;
    const escapedTaskId = taskId.replace(/["\\]/g, "\\$&");
    return list.querySelector(`.task[data-task-id="${escapedTaskId}"]`) as HTMLElement | null;
  }

  function measureFocusCloseTargetRect(taskId: string) {
    const focusScreen = els.focusModeScreen as HTMLElement | null;
    const hadOpenClass = document.body.classList.contains("isFocusModeOpen");
    const previousDisplay = focusScreen?.style.display || "";
    if (hadOpenClass) document.body.classList.remove("isFocusModeOpen");
    if (focusScreen) focusScreen.style.display = "block";
    const card = findFocusTransitionTaskCard(taskId);
    const rect = card?.getBoundingClientRect?.();
    if (hadOpenClass) document.body.classList.add("isFocusModeOpen");
    if (focusScreen) focusScreen.style.display = previousDisplay;
    return isUsableFocusTransitionRect(rect) ? (rect as DOMRect) : null;
  }

  function runFocusOpenTransition(sourceEl: HTMLElement | null | undefined, sourceRect: DOMRect | null, taskId: string) {
    if (!sourceEl || !sourceRect || prefersReducedFocusMotion()) return;
    if (!isUsableFocusTransitionRect(sourceRect)) return;
    cleanupFocusTransition();
    focusTransitionSourceTaskId = taskId;
    focusTransitionSourceRect = sourceRect;
    const clone = createFocusTransitionClone(sourceEl, sourceRect);
    activeFocusTransitionClone = clone;
    document.body.classList.add("isFocusModeTransitioning", "isFocusModeOpening");
    (els.focusModeScreen as HTMLElement | null)?.classList.add("focusModeTransitionEntering");
    animateFocusTransitionClone(clone, sourceRect, getFocusTransitionTargetRect(), cleanupFocusTransition);
  }

  function openFocusMode(index: number, opts?: FocusModeTransitionOptions) {
    const task = ctx.getTasks()[index];
    if (!task) return;
    const taskId = String(task.id || "");
    focusModeStartPlayer.play();
    const transitionSourceEl = opts?.sourceElement || null;
    const transitionSourceRect = transitionSourceEl?.getBoundingClientRect?.() || null;
    ctx.setFocusModeTaskId(String(task.id || ""));
    ctx.setDeferredFocusModeTimeGoalModals([]);
    dismissNonFocusTaskAlertsForFocusTask(taskId);
    ctx.setFocusModeTaskName((task.name || "").trim());
    if (els.focusTaskName) els.focusTaskName.textContent = ctx.getFocusModeTaskName() || "Task";
    ctx.setFocusCheckpointSig("");
    syncFocusCheckpointToggleUi();
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("isFocusModeOpen");
    resetFocusModeScrollPosition(els.focusModeScreen as HTMLElement | null);
    updateFocusDial(task);
    const resetOpenFocusModeScrollAfterFrame = () => {
      const activeTaskId = String(ctx.getFocusModeTaskId() || "").trim();
      if (!activeTaskId || activeTaskId !== String(task.id || "").trim()) return;
      resetFocusModeScrollPosition(els.focusModeScreen as HTMLElement | null);
      updateFocusDial(task);
    };
    window.requestAnimationFrame(() => {
      resetOpenFocusModeScrollAfterFrame();
      window.requestAnimationFrame(resetOpenFocusModeScrollAfterFrame);
    });
    syncFocusSessionNotesInput(String(task.id || ""));
    syncFocusSessionNotesAccordion(String(task.id || ""));
    startFocusDnd();
    runFocusOpenTransition(transitionSourceEl, transitionSourceRect as DOMRect | null, taskId);
  }

  function finishCloseFocusMode(closingFocusTaskId: string) {
    cleanupFocusTransition();
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
    if (closingFocusTaskId === focusTransitionSourceTaskId) {
      focusTransitionSourceTaskId = null;
      focusTransitionSourceRect = null;
    }
    stopFocusDnd();
    ctx.render();
    openDeferredFocusModeTimeGoalModal();
  }

  function runFocusCloseTransition(closingFocusTaskId: string, onDone: () => void) {
    const focusScreen = els.focusModeScreen as HTMLElement | null;
    if (!focusScreen || prefersReducedFocusMotion()) {
      onDone();
      return;
    }
    const fromRect = getFocusTransitionTargetRect();
    const targetRect = measureFocusCloseTargetRect(closingFocusTaskId) || (closingFocusTaskId === focusTransitionSourceTaskId ? focusTransitionSourceRect : null);
    cleanupFocusTransition();
    document.body.classList.add("isFocusModeTransitioning", "isFocusModeClosing");
    focusScreen.classList.add("focusModeTransitionClosing");
    if (!isUsableFocusTransitionRect(targetRect)) {
      activeFocusTransitionTimer = window.setTimeout(onDone, FOCUS_MODE_FADE_CLOSE_MS);
      return;
    }
    const clone = focusScreen.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("focusModeTransitionClone", "focusModeTransitionCloneFocus");
    clone.style.left = `${fromRect.left}px`;
    clone.style.top = `${fromRect.top}px`;
    clone.style.width = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    clone.style.transform = "translate3d(0, 0, 0) scale(1, 1)";
    document.body.appendChild(clone);
    activeFocusTransitionClone = clone;
    animateFocusTransitionClone(clone, fromRect, targetRect as DOMRect, onDone, true);
  }

  function closeFocusMode(opts?: FocusModeCloseOptions) {
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
      setFocusSessionDraft(closingFocusTaskId, getRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null));
    }
    if (opts?.animate && closingFocusTaskId) {
      runFocusCloseTransition(closingFocusTaskId, () => finishCloseFocusMode(closingFocusTaskId));
      return;
    }
    finishCloseFocusMode(closingFocusTaskId);
  }

  function shouldDeferTimeGoalModalInFocusMode(taskIdRaw: string | null | undefined) {
    const activeFocusTaskId = String(ctx.getFocusModeTaskId() || "").trim();
    const taskId = String(taskIdRaw || "").trim();
    return !!activeFocusTaskId && !!taskId && taskId !== activeFocusTaskId;
  }

  function shouldDeferTimeGoalModalForBlockingOverlay() {
    if (typeof document === "undefined") return false;
    return hasBlockingTimeGoalCompleteOverlay(document);
  }

  function queueDeferredFocusModeTimeGoalModal(
    task: Task,
    elapsedMs: number,
    opts?: { reminder?: boolean; awardPreview?: TimeGoalAwardPreview }
  ) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const queue = getDeferredQueue();
    if (queue.some((entry) => entry.taskId === taskId)) return;
    ctx.setDeferredFocusModeTimeGoalModals([
      ...queue,
      {
        taskId,
        frozenElapsedMs: Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)),
        reminder: !!opts?.reminder,
        ...(opts?.awardPreview ? { awardPreview: opts.awardPreview } : {}),
      },
    ]);
  }

  function openDeferredFocusModeTimeGoalModal() {
    if (shouldDeferTimeGoalModalForBlockingOverlay()) return;
    const queuedCompleted = getDeferredQueue().find((entry) => {
      const task = ctx.getTasks().find((row) => String(row.id || "").trim() === String(entry?.taskId || "").trim()) || null;
      return isTaskTimeGoalCompletedToday(task);
    });
    if (queuedCompleted) {
      ctx.setDeferredFocusModeTimeGoalModals(getDeferredQueue().filter((entry) => entry !== queuedCompleted));
      const task = ctx.getTasks().find((row) => String(row.id || "").trim() === queuedCompleted.taskId);
      if (task) {
        openTimeGoalCompleteModal(task, queuedCompleted.frozenElapsedMs || getTaskElapsedMs(task), {
          reminder: queuedCompleted.reminder,
          awardPreview: queuedCompleted.awardPreview,
        });
      }
      return;
    }
    const { nextPending, remainingQueue } = shiftValidDeferredTimeGoalModal(getDeferredQueue(), {
      tasks: ctx.getTasks(),
      liveSessionsByTaskId: ctx.getLiveSessionsByTaskId(),
      getTaskTimeGoalAction,
    });
    ctx.setDeferredFocusModeTimeGoalModals(remainingQueue);
    if (!nextPending) return;
    const task = ctx.getTasks().find((row) => String(row.id || "").trim() === nextPending.taskId);
    if (!task) return;
    if (isTaskTimeGoalCompletedToday(task)) {
      openTimeGoalCompleteModal(task, nextPending.frozenElapsedMs || getTaskElapsedMs(task), {
        reminder: nextPending.reminder,
        awardPreview: nextPending.awardPreview,
      });
      return;
    }
    openTimeGoalCompleteModal(task, nextPending.frozenElapsedMs || getTaskElapsedMs(task), {
      reminder: nextPending.reminder,
      awardPreview: nextPending.awardPreview,
    });
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
      const audio = new Audio("/checkpoint_alert.mp3");
      audio.preload = "auto";
      ctx.setCheckpointBeepAudio(audio);
      return audio;
    } catch {
      ctx.setCheckpointBeepAudio(null);
      return null;
    }
  }

  function ensureTimeGoalCompleteAudio() {
    if (timeGoalCompleteAudio) return timeGoalCompleteAudio;
    try {
      const audio = new Audio("/task_complete.mp3");
      audio.preload = "auto";
      timeGoalCompleteAudio = audio;
      return audio;
    } catch {
      timeGoalCompleteAudio = null;
      return null;
    }
  }

  function ensureTimeGoalCompleteClickAudio() {
    if (timeGoalCompleteClickAudio) return timeGoalCompleteClickAudio;
    try {
      const audio = new Audio("/click-secondary.mp3");
      audio.preload = "auto";
      timeGoalCompleteClickAudio = audio;
      return audio;
    } catch {
      timeGoalCompleteClickAudio = null;
      return null;
    }
  }

  function playTimeGoalCompleteAudio() {
    const audio = ensureTimeGoalCompleteAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      // ignore playback restrictions
    }
  }

  function playTimeGoalCompleteClickAudio() {
    const audio = ensureTimeGoalCompleteClickAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      // ignore playback restrictions
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

  function suppressCheckpointToastsForTask(taskIdRaw: string | null | undefined) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId) return;
    const queue = getToastQueue();
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (String(queue[i]?.taskId || "").trim() === taskId) queue.splice(i, 1);
    }
    const active = getActiveToast();
    if (String(active?.taskId || "").trim() !== taskId) return;
    if (ctx.getCheckpointToastAutoCloseTimer() != null) {
      window.clearTimeout(ctx.getCheckpointToastAutoCloseTimer() as number);
      ctx.setCheckpointToastAutoCloseTimer(null);
    }
    setActiveToast(null);
    renderCheckpointToast();
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
    return ctx.formatTime(targetMs);
  }

  function processCheckpointAlertsForTask(task: Task, elapsedSecNow: number) {
    const taskId = String(task.id || "");
    if (isTaskTimeGoalCompletedToday(task)) {
      if (taskId) clearCheckpointBaseline(taskId);
      return;
    }
    if (!taskId || !task.running) {
      if (taskId) clearCheckpointBaseline(taskId);
      return;
    }
    const hasMilestones = !!task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
    const elapsedWholeSec = Math.floor(Math.max(0, elapsedSecNow));
    const timeGoalSec = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0 ? Math.round(Number(task.timeGoalMinutes || 0) * 60) : 0;
    const baselineByTaskId = ctx.getCheckpointBaselineSecByTaskId();
    const prevBaseline = baselineByTaskId[taskId];
    if (!Number.isFinite(prevBaseline)) {
      baselineByTaskId[taskId] = elapsedWholeSec;
      if (!(timeGoalSec > 0 && elapsedWholeSec >= timeGoalSec)) return;
    } else if (elapsedWholeSec <= prevBaseline) {
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
      if (ctx.getCheckpointAlertToastEnabled() && task.checkpointToastEnabled) {
        const toastMode = ctx.getCheckpointAlertToastMode();
        enqueueCheckpointToast(`Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`, text, {
          autoCloseMs: toastMode === "manual" ? null : 5000,
          taskId,
          taskName: task.name || "",
          counterText: ctx.formatMainTaskElapsed(getElapsedMs(task)),
          checkpointTimeText,
          checkpointDescText: String(m.description || "").trim() || null,
          muteRepeatOnManualDismiss:
            ctx.getCheckpointAlertSoundEnabled() && !!task.checkpointSoundEnabled && ctx.getCheckpointAlertSoundMode() === "repeat",
        });
      }
      if (ctx.getCheckpointAlertSoundEnabled() && task.checkpointSoundEnabled) beepCount += 1;
    });
    if (didElapsedReachTimeGoalFromBaseline(prevBaseline, elapsedWholeSec, timeGoalSec) && ctx.getTimeGoalModalTaskId() !== taskId) {
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
      if (ctx.getCheckpointAlertSoundMode() === "repeat") startCheckpointRepeatAlert(taskId);
      else enqueueCheckpointBeeps(beepCount);
    }
    if (shouldOpenTimeGoalModal) {
      if (shouldDeferTimeGoalModalInFocusMode(taskId)) {
        completeTimeGoalTask(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder, deferModal: true });
        return;
      }
      completeTimeGoalTask(task, getTaskElapsedMs(task), { reminder: openTimeGoalModalAsReminder });
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
    const resumePendingResetResult = reconcileResumePendingTasks(tasks, nowMs());
    if (resumePendingResetResult.changedTaskIds.length) {
      ctx.save();
      void ctx.syncSharedTaskSummariesForTasks(resumePendingResetResult.changedTaskIds).catch(() => {});
      ctx.render();
    }
    const processedCheckpointTaskIds = new Set<string>();
    const taskList = els.taskList as HTMLElement | null;
    if (taskList) {
      taskList.querySelectorAll(".task").forEach((node) => {
        const i = parseInt((node as HTMLElement).dataset.index || "0", 10);
        const task = tasks[i];
        if (!task) return;
        (node as HTMLElement).classList.toggle("taskRunning", !!task.running);
        const timeEl = node.querySelector(".time");
        const elapsedMs = getElapsedMs(task);
        if (timeEl) (timeEl as HTMLElement).innerHTML = ctx.formatMainTaskElapsedHtml(elapsedMs, !!task.running);
        updateTaskProgressFill(node, task, elapsedMs);
        const primaryActionBtn = node.querySelector('.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"]') as HTMLButtonElement | null;
        if (primaryActionBtn) {
          if (isTaskTimeGoalStartLockedByHistoryToday(task, ctx.getHistoryByTaskId(), nowMs())) {
            primaryActionBtn.className = "btn btn-done small";
            primaryActionBtn.dataset.action = "start";
            primaryActionBtn.title = "Done until tomorrow";
            primaryActionBtn.setAttribute("aria-label", "Done until tomorrow");
            primaryActionBtn.disabled = true;
            primaryActionBtn.innerHTML = '<span class="taskDoneIcon" aria-hidden="true">&#10003;</span><span>Done</span>';
          } else if (task.running) {
            primaryActionBtn.className = "btn btn-warn small";
            primaryActionBtn.dataset.action = "stop";
            primaryActionBtn.title = "Stop";
            primaryActionBtn.textContent = "Stop";
            primaryActionBtn.disabled = false;
          } else if (elapsedMs > 0) {
            primaryActionBtn.className = "btn btn-resume small";
            primaryActionBtn.dataset.action = "start";
            primaryActionBtn.title = "Resume";
            primaryActionBtn.textContent = "Resume";
            primaryActionBtn.disabled = false;
          } else {
            primaryActionBtn.className = "btn btn-accent small";
            primaryActionBtn.dataset.action = "start";
            primaryActionBtn.title = "Launch";
            primaryActionBtn.textContent = "Launch";
            primaryActionBtn.disabled = false;
          }
        }
        const resetBtn = node.querySelector('.actions > .iconBtn[data-action="reset"]') as HTMLButtonElement | null;
        if (resetBtn) {
          const completed = isTaskTimeGoalStartLockedByHistoryToday(task, ctx.getHistoryByTaskId(), nowMs());
          const hasResettableTime = elapsedMs > 0;
          const resetLabel = completed ? "Done until tomorrow" : task.running ? "Stop task to reset" : hasResettableTime ? "Reset" : "No time to reset";
          resetBtn.disabled = !!task.running || completed || !hasResettableTime;
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
    ctx.on(document, "click", (event: Event) => {
      handleRichNoteToolbarClick(event);
    });
    ctx.on(document, "focusin", (event: Event) => {
      handleRichNoteToolbarStateEvent(event);
    });
    ctx.on(document, "input", (event: Event) => {
      handleRichNoteToolbarStateEvent(event);
    });
    ctx.on(document, "keyup", (event: Event) => {
      handleRichNoteToolbarStateEvent(event);
    });
    ctx.on(document, "mouseup", (event: Event) => {
      handleRichNoteToolbarStateEvent(event);
    });
    ctx.on(document, "selectionchange", () => {
      syncRichNoteToolbarStates(document);
    });
    ctx.on(document, "paste", (event: Event) => {
      handleRichNotePaste(event as ClipboardEvent);
    });
    ctx.on(els.focusModeBackBtn, "click", () => {
      focusModeExitClickPlayer.play();
      closeFocusMode({ animate: true });
    });
    ctx.on(els.focusDndAccessBtn, "click", () => {
      void openNativeFocusDndAccessSettings()
        .then(() => syncFocusDndSetupPrompt())
        .catch(() => {});
    });
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
      if (isTaskTimeGoalStartLockedByHistoryToday(task, ctx.getHistoryByTaskId(), nowMs())) return;
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
      autosizeFocusSessionNotesInput();
      clearFocusSessionNotesSavedStatus();
      scheduleFocusSessionNoteSave(String(ctx.getFocusModeTaskId() || ""), getRichNoteEditorValue(els.focusSessionNotesInput as HTMLElement | null));
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
      playTimeGoalCompleteClickAudio();
      const task = getActiveTimeGoalModalTask();
      const shouldExitFocusMode =
        !!task && String(task.id || "").trim() === String(ctx.getFocusModeTaskId() || "").trim();
      if (task) {
        const completed = await resolveTimeGoalCompletion(task, { logHistory: true });
        if (completed && shouldExitFocusMode) closeFocusMode({ animate: true });
      }
    });
    ctx.on(els.timeGoalCompleteText, "click", () => {
      replayTimeGoalCompleteXpText();
    });
    ctx.on(els.timeGoalCompleteLaunchNextBtn, "click", async () => {
      const task = getActiveTimeGoalModalTask();
      const nextTaskId = String((els.timeGoalCompleteLaunchNextBtn as HTMLButtonElement | null)?.dataset.nextTaskId || "").trim();
      if (!task || !nextTaskId) return;
      const completed = await resolveTimeGoalCompletion(task, { logHistory: true });
      if (!completed) return;
      launchNextTaskFromTimeGoalCompletion(nextTaskId);
      notifyTimeGoalCompleteOverlayClosedForXpAward();
    });
    ctx.on(els.timeGoalCompleteNextTaskGrid, "click", async (event: Event) => {
      const tile = (event.target as HTMLElement | null)?.closest?.("[data-time-goal-next-task-id]") as HTMLElement | null;
      const nextTaskId = String(tile?.dataset.timeGoalNextTaskId || "").trim();
      if (!nextTaskId) return;
      const task = getActiveTimeGoalModalTask();
      if (!task) return;
      const completed = await resolveTimeGoalCompletion(task, { logHistory: true });
      if (!completed) return;
      launchNextTaskFromTimeGoalCompletion(nextTaskId);
      notifyTimeGoalCompleteOverlayClosedForXpAward();
    });
    ctx.on(els.timeGoalCompleteNoteInput, "input", () => {
      const taskId = String(ctx.getTimeGoalModalTaskId() || "").trim();
      if (taskId) setFocusSessionDraft(taskId, getRichNoteEditorValue(els.timeGoalCompleteNoteInput as HTMLElement | null));
    });
    if (typeof window !== "undefined") {
      ctx.on(window, "resize", () => autosizeFocusSessionNotesInput());
      ctx.on(window, TASKTIMER_OVERLAY_CLOSED_EVENT, () => {
        window.setTimeout(() => {
          openDeferredFocusModeTimeGoalModal();
        }, 0);
      });
    }
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
