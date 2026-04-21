/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task } from "../lib/types";
import type { AppPage } from "./types";
import type { TaskTimerElements } from "./elements";

type CreateTaskTimerRuntimeActionsOptions = {
  els: Pick<TaskTimerElements, "taskList" | "focusModeScreen">;
  getTasks: () => Task[];
  getFocusModeTaskId: () => string | null;
  applyAppPage: (page: AppPage, opts?: { syncUrl?: "replace" | "push" | false }) => void;
  persistenceApi: () =>
    | {
        load: () => void;
        savePendingTaskJump: (taskId: string | null) => void;
        maybeHandlePendingTaskJump: () => void;
        save: (opts?: { deletedTaskIds?: string[] }) => void;
      }
    | null;
  sessionApi: () =>
    | {
        closeFocusMode: () => void;
        setFocusSessionDraft: (taskId: string, noteRaw: string) => void;
        clearFocusSessionDraft: (taskId: string) => void;
        syncFocusSessionNotesInput: (taskId: string | null) => void;
        syncFocusSessionNotesAccordion: (taskId: string | null) => void;
        captureSessionNoteSnapshot: (taskId?: string | null) => string;
      }
    | null;
  historyInlineApi: () =>
    | {
        getHistoryEntryNote: (entry: any) => string;
        clearHistoryEntryNoteOverlayPosition: () => void;
      }
    | null;
};

export function createTaskTimerRuntimeActions(options: CreateTaskTimerRuntimeActionsOptions) {
  function load() {
    options.persistenceApi()?.load();
  }

  function savePendingTaskJump(taskId: string | null) {
    options.persistenceApi()?.savePendingTaskJump(taskId);
  }

  function jumpToTaskById(taskId: string) {
    const targetId = String(taskId || "").trim();
    if (!targetId) return;
    const task = options.getTasks().find((entry) => String(entry.id || "") === targetId);
    if (!task) return;
    const focusModeScreen = options.els.focusModeScreen as HTMLElement | null;
    if (
      options.getFocusModeTaskId() ||
      (focusModeScreen?.style.display !== "none" && focusModeScreen?.getAttribute("aria-hidden") !== "true")
    ) {
      options.sessionApi()?.closeFocusMode();
    }
    options.applyAppPage("tasks", { syncUrl: "push" });
    window.setTimeout(() => {
      const list = options.els.taskList;
      if (!list) return;
      const sel = `.task[data-task-id="${targetId.replace(/"/g, '\\"')}"]`;
      const el = list.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollIntoView();
      }
      el.classList.add("taskJumpFlash");
      window.setTimeout(() => el.classList.remove("taskJumpFlash"), 1400);
    }, 70);
  }

  function maybeHandlePendingTaskJump() {
    options.persistenceApi()?.maybeHandlePendingTaskJump();
  }

  function save(opts?: { deletedTaskIds?: string[] }) {
    options.persistenceApi()?.save(opts);
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    options.sessionApi()?.setFocusSessionDraft(taskId, noteRaw);
  }

  function clearFocusSessionDraft(taskId: string) {
    options.sessionApi()?.clearFocusSessionDraft(taskId);
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    options.sessionApi()?.syncFocusSessionNotesInput(taskId);
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    options.sessionApi()?.syncFocusSessionNotesAccordion(taskId);
  }

  function captureSessionNoteSnapshot(taskId?: string | null) {
    return options.sessionApi()?.captureSessionNoteSnapshot(taskId) ?? "";
  }

  function getHistoryEntryNote(entry: any) {
    return options.historyInlineApi()?.getHistoryEntryNote(entry) || "";
  }

  function clearHistoryEntryNoteOverlayPosition() {
    options.historyInlineApi()?.clearHistoryEntryNoteOverlayPosition();
  }

  return {
    load,
    savePendingTaskJump,
    jumpToTaskById,
    maybeHandlePendingTaskJump,
    save,
    setFocusSessionDraft,
    clearFocusSessionDraft,
    syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion,
    captureSessionNoteSnapshot,
    getHistoryEntryNote,
    clearHistoryEntryNoteOverlayPosition,
  };
}
