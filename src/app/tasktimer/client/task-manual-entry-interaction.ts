import type { HistoryByTaskId, Task } from "../lib/types";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
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
  hoursInput: HTMLInputElement | null;
  minutesInput: HTMLInputElement | null;
  difficultyGroup: HTMLElement | null;
  noteInput: HTMLInputElement | HTMLTextAreaElement | null;
  error: HTMLElement | null;
};

type TaskManualEntryInteractionOptions = {
  elements: TaskManualEntryElements;
  getTaskById: (taskId: string) => Task | null | undefined;
  getTaskDisplayName: (task: Task | null | undefined) => string;
  nowMs?: () => number;
  setTimeoutRef?: (handler: () => void, timeout: number) => unknown;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (historyByTaskId: HistoryByTaskId) => void;
  saveHistory: (historyByTaskId: HistoryByTaskId) => void;
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
  let draft: HistoryManagerManualDraft | null = null;
  let activeTaskId: string | null = null;

  function getDraftOrDefault() {
    return draft || createDefaultHistoryManagerManualDraft(nowMs());
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
    const sentimentButtons = Array.from(
      ((elements.difficultyGroup as HTMLElement | null)?.querySelectorAll?.(
        "[data-completion-difficulty]",
      ) || []) as Iterable<Element>,
    );
    sentimentButtons.forEach((button) => {
      const selected =
        normalizeCompletionDifficulty(
          (button as HTMLElement).dataset.completionDifficulty,
        ) === normalizeCompletionDifficulty(currentDraft.completionDifficulty);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
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
    draft = createDefaultHistoryManagerManualDraft(nowMs());
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
      currentDraft: HistoryManagerManualDraft,
    ) => HistoryManagerManualDraft,
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

  function setNoteValue(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      noteValue: String(value || ""),
      errorMessage: "",
    }));
  }

  function selectDifficulty(value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      completionDifficulty: normalizeCompletionDifficulty(value) || "",
      errorMessage: "",
    }));
    sync();
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
    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: options.getTaskDisplayName(task),
      taskColor:
        typeof (task as { color?: unknown }).color === "string"
          ? String((task as { color?: unknown }).color || "")
          : null,
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
    setNoteValue,
    selectDifficulty,
    setError,
    save,
    openDateTimePicker,
    getDraft: () => draft,
    getActiveTaskId: () => activeTaskId,
  };
}
