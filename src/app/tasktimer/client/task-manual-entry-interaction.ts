import type { HistoryByTaskId, Task } from "../lib/types";
import {
  createDefaultHistoryManagerManualDraft,
  parseHistoryManagerManualDraft,
  type HistoryManagerManualDraft,
} from "./history-manager-shared";

type TaskManualEntryElements = {
  overlay: HTMLElement | null;
  title: HTMLElement | null;
  meta: HTMLElement | null;
  dateTimeInput: HTMLInputElement | null;
  dateTimeButton: HTMLButtonElement | null;
  logTimeGoalToggle: HTMLButtonElement | null;
  elapsedField: HTMLElement | null;
  hoursInput: HTMLInputElement | null;
  minutesInput: HTMLInputElement | null;
  noteInput: HTMLInputElement | HTMLTextAreaElement | null;
  error: HTMLElement | null;
};

type TaskManualEntryDraft = HistoryManagerManualDraft & {
  logTimeGoal: boolean;
  logTimeGoalAvailable: boolean;
};

type TaskManualEntryInteractionOptions = {
  elements: TaskManualEntryElements;
  getTaskById: (taskId: string) => Task | null | undefined;
  getTaskDisplayName: (task: Task | null | undefined) => string;
  historyEntryColorForTaskMs: (task: Task, elapsedMs: number) => string;
  nowMs?: () => number;
  setTimeoutRef?: (handler: () => void, timeout: number) => unknown;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (historyByTaskId: HistoryByTaskId) => void;
  saveHistory: (historyByTaskId: HistoryByTaskId) => void;
  onManualEntrySaved?: (args: {
    task: Task;
    entry: HistoryByTaskId[string][number];
    historyByTaskId: HistoryByTaskId;
  }) => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  render: () => void;
};

export function createTaskManualEntryInteraction(
  options: TaskManualEntryInteractionOptions,
) {
  const elements = options.elements;
  const nowMs = options.nowMs ?? (() => Date.now());
  const setTimeoutRef =
    options.setTimeoutRef ??
    ((handler, timeout) => window.setTimeout(handler, timeout));
  let draft: TaskManualEntryDraft | null = null;
  let activeTaskId: string | null = null;

  function getTaskGoalElapsedMs(task: Task | null | undefined) {
    const goalMinutes = Number(task?.timeGoalMinutes || 0);
    if (!(task?.timeGoalEnabled && goalMinutes > 0)) return 0;
    return Math.round(goalMinutes * 60_000);
  }

  function createDefaultTaskManualDraft(task: Task | null | undefined): TaskManualEntryDraft {
    const logTimeGoalAvailable = getTaskGoalElapsedMs(task) > 0;
    return {
      ...createDefaultHistoryManagerManualDraft(nowMs()),
      logTimeGoal: logTimeGoalAvailable,
      logTimeGoalAvailable,
    };
  }

  function getDraftOrDefault() {
    if (draft) return draft;
    const task = options.getTaskById(String(activeTaskId || "").trim()) || null;
    return createDefaultTaskManualDraft(task);
  }

  function sync() {
    const currentDraft = getDraftOrDefault();
    if (elements.dateTimeInput)
      elements.dateTimeInput.value = currentDraft.dateTimeValue || "";
    elements.dateTimeInput?.parentElement?.setAttribute(
      "data-empty",
      currentDraft.dateTimeValue ? "false" : "true",
    );
    if (elements.hoursInput)
      elements.hoursInput.value = currentDraft.hoursValue || "";
    if (elements.minutesInput)
      elements.minutesInput.value = currentDraft.minutesValue || "";
    if (elements.noteInput)
      elements.noteInput.value = currentDraft.noteValue || "";
    const logTimeGoalOn = currentDraft.logTimeGoalAvailable && currentDraft.logTimeGoal;
    if (elements.logTimeGoalToggle) {
      elements.logTimeGoalToggle.disabled = !currentDraft.logTimeGoalAvailable;
      elements.logTimeGoalToggle.setAttribute("aria-disabled", currentDraft.logTimeGoalAvailable ? "false" : "true");
      elements.logTimeGoalToggle.setAttribute("aria-checked", logTimeGoalOn ? "true" : "false");
      elements.logTimeGoalToggle.classList.toggle("on", logTimeGoalOn);
    }
    if (elements.elapsedField) {
      elements.elapsedField.hidden = logTimeGoalOn;
    }
    if (elements.error) {
      elements.error.textContent = currentDraft.errorMessage || "";
      elements.error.style.display = currentDraft.errorMessage
        ? "block"
        : "none";
    }
  }

  function close() {
    activeTaskId = null;
    draft = null;
    options.closeOverlay(elements.overlay);
    elements.overlay?.setAttribute("aria-hidden", "true");
  }

  function focusDateTimeButton() {
    try {
      elements.dateTimeButton?.focus({ preventScroll: true });
    } catch {
      elements.dateTimeButton?.focus();
    }
  }

  function open(taskId: string) {
    const normalizedTaskId = String(taskId || "").trim();
    const task = options.getTaskById(normalizedTaskId) || null;
    if (!task) return false;
    activeTaskId = normalizedTaskId;
    draft = createDefaultTaskManualDraft(task);
    if (elements.title) {
      elements.title.textContent = `Add Manual Entry for ${options.getTaskDisplayName(task)}`;
    }
    if (elements.meta) {
      elements.meta.textContent = "";
      elements.meta.hidden = true;
    }
    sync();
    options.openOverlay(elements.overlay);
    elements.overlay?.setAttribute("aria-hidden", "false");
    setTimeoutRef(focusDateTimeButton, 0);
    return true;
  }

  function updateDraft(
    updater: (
      currentDraft: TaskManualEntryDraft,
    ) => TaskManualEntryDraft,
  ) {
    draft = updater(getDraftOrDefault());
  }

  function setDateTimeValue(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      dateTimeValue: String(value || ""),
      errorMessage: "",
    }));
    sync();
  }

  function setHoursValue(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      hoursValue: String(value || ""),
      errorMessage: "",
    }));
    sync();
  }

  function setMinutesValue(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      minutesValue: String(value || ""),
      errorMessage: "",
    }));
    sync();
  }

  function setLogTimeGoalEnabled(enabled: boolean) {
    updateDraft((currentDraft) => {
      const logTimeGoal = currentDraft.logTimeGoalAvailable && enabled;
      return {
        ...currentDraft,
        logTimeGoal,
        errorMessage: "",
      };
    });
    sync();
  }

  function setNoteValue(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      noteValue: String(value || ""),
      errorMessage: "",
    }));
  }

  function setError(message: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      errorMessage: String(message || ""),
    }));
    sync();
  }

  function save() {
    const taskId = String(activeTaskId || "").trim();
    if (!taskId) return false;
    const task = options.getTaskById(taskId) || null;
    if (!task || !draft) return false;
    const goalElapsedMs = draft.logTimeGoal && draft.logTimeGoalAvailable ? getTaskGoalElapsedMs(task) : null;
    const elapsedMs =
      goalElapsedMs == null
        ? ((Number(draft.hoursValue || 0) * 60) + Number(draft.minutesValue || 0)) * 60 * 1000
        : goalElapsedMs;
    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: options.getTaskDisplayName(task),
      historyEntryColor: options.historyEntryColorForTaskMs(task, elapsedMs),
      elapsedMsOverride: goalElapsedMs,
    });
    if ("error" in parsed) {
      setError(parsed.error || "Could not save entry.");
      return false;
    }
    const historyByTaskId = options.getHistoryByTaskId();
    const nextTaskHistory = Array.isArray(historyByTaskId[taskId])
      ? historyByTaskId[taskId].slice()
      : [];
    nextTaskHistory.push(parsed.entry);
    const nextHistory = { ...historyByTaskId, [taskId]: nextTaskHistory };
    options.setHistoryByTaskId(nextHistory);
    options.saveHistory(nextHistory);
    options.onManualEntrySaved?.({ task, entry: parsed.entry, historyByTaskId: nextHistory });
    void options.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    close();
    options.render();
    return true;
  }

  function openDateTimePicker() {
    const input = elements.dateTimeInput;
    if (!input) return;
    try {
      if (
        typeof (input as HTMLInputElement & { showPicker?: () => void })
          .showPicker === "function"
      ) {
        (
          input as HTMLInputElement & { showPicker?: () => void }
        ).showPicker?.();
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

  return {
    open,
    close,
    sync,
    updateDraft,
    setDateTimeValue,
    setHoursValue,
    setMinutesValue,
    setLogTimeGoalEnabled,
    setNoteValue,
    setError,
    save,
    openDateTimePicker,
    getDraft: () => draft,
    getActiveTaskId: () => activeTaskId,
  };
}
