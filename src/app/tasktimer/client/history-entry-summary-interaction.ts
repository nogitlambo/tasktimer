import type { RewardProgressV1 } from "../lib/rewards";
import type { Task } from "../lib/types";
import {
  buildHistoryEntrySummaryPayload,
  renderHistoryEntrySummaryHtml,
} from "./history-entry-summary";

type HistoryEntrySummaryOwner = "inline" | "manager";

type HistoryEntrySummarySource = {
  taskId?: unknown;
  ts?: unknown;
  ms?: unknown;
  name?: unknown;
  note?: unknown;
  isLiveSession?: unknown;
  completionDifficulty?: unknown;
};

type HistoryEntrySummaryInteractionElements = {
  overlay: HTMLElement | null;
  title: HTMLElement | null;
  meta: HTMLElement | null;
  body: HTMLElement | null;
  editor: HTMLElement | null;
  input: HTMLTextAreaElement | null;
  editBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  saveBtn: HTMLButtonElement | null;
};

type CreateHistoryEntrySummaryInteractionOptions = {
  owner: HistoryEntrySummaryOwner;
  elements: HistoryEntrySummaryInteractionElements;
  escapeHtml: (value: unknown) => string;
  formatDateTime: (value: number) => string;
  formatTwo: (value: number) => string;
  getEntryNote: (entry: HistoryEntrySummarySource) => string;
  getTaskById: (taskId: string) => Task | null;
  getEntriesForTask: (taskId: string) => HistoryEntrySummarySource[];
  getRewardProgress: () => RewardProgressV1 | null | undefined;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  isMobileLayout: () => boolean;
};

function normalizeTimestamp(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

function normalizeElapsedMs(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeName(raw: unknown) {
  return String(raw || "").trim();
}

function findEntryByIdentity(
  entries: HistoryEntrySummarySource[],
  identity: { ts: number; ms: number; name: string }
) {
  return entries.find(
    (entry) =>
      normalizeTimestamp(entry?.ts) === identity.ts &&
      normalizeElapsedMs(entry?.ms) === identity.ms &&
      normalizeName(entry?.name) === identity.name
  ) || null;
}

export function createHistoryEntrySummaryInteraction(options: CreateHistoryEntrySummaryInteractionOptions) {
  const { elements } = options;

  function getCloseButton() {
    return elements.overlay?.querySelector(".closePopup") as HTMLButtonElement | null;
  }

  function syncPlaceholders() {
    const overlay = elements.overlay;
    if (!overlay) return;
    const isMobile = options.isMobileLayout();
    overlay.querySelectorAll<HTMLTextAreaElement>("[data-history-summary-note-input]").forEach((input) => {
      const desktopText = String(input.dataset.emptyNotePlaceholderDesktop || "Click to add note");
      const mobileText = String(input.dataset.emptyNotePlaceholderMobile || "Tap to add note");
      input.placeholder = isMobile ? mobileText : desktopText;
    });
  }

  function getActiveInput() {
    const overlay = elements.overlay;
    if (!overlay) return null;
    return overlay.querySelector(".historyEntrySummaryNoteInput.isEditing") as HTMLTextAreaElement | null;
  }

  function getActiveInputValue() {
    return String(getActiveInput()?.value ?? elements.input?.value ?? "");
  }

  function syncCloseLabel() {
    const overlay = elements.overlay;
    const closeBtn = getCloseButton();
    if (!overlay || !closeBtn) return;
    const isSaveAndClose = overlay.dataset.historyEntryEditing === "true" && !!getActiveInputValue().trim();
    closeBtn.textContent = isSaveAndClose ? "Save & Close" : "Close";
    closeBtn.classList.toggle("isSaveAndClose", isSaveAndClose);
  }

  function syncEditorUi(editing: boolean) {
    const overlay = elements.overlay;
    if (!overlay) return;
    const editable = overlay.dataset.historyEntryEditable === "true";
    const currentNote = String(overlay.dataset.historyEntryNote || "");
    const closeBtn = getCloseButton();

    if (options.owner === "manager" && editing && !getActiveInput()) {
      if (elements.editor) elements.editor.style.display = "grid";
      if (elements.cancelBtn) elements.cancelBtn.style.display = "";
      if (elements.saveBtn) elements.saveBtn.style.display = "";
      if (elements.editBtn) elements.editBtn.style.display = "none";
      if (closeBtn) closeBtn.style.display = "none";
    } else {
      if (elements.editor) elements.editor.style.display = "none";
      if (elements.editBtn) {
        elements.editBtn.textContent = currentNote ? "Edit Note" : "Add Note";
        elements.editBtn.style.display = editable && !editing ? "" : "none";
      }
      if (elements.cancelBtn) elements.cancelBtn.style.display = "none";
      if (elements.saveBtn) elements.saveBtn.style.display = "none";
      if (closeBtn) closeBtn.style.display = "";
    }

    overlay.dataset.historyEntryEditing = editing ? "true" : "false";
    syncCloseLabel();
  }

  function setTarget(taskId: string, entries: HistoryEntrySummarySource[]) {
    const overlay = elements.overlay;
    if (!overlay) return;
    const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : null;
    const ts = normalizeTimestamp(entry?.ts);
    const ms = normalizeElapsedMs(entry?.ms);
    const name = normalizeName(entry?.name);
    const note = entry ? options.getEntryNote(entry) : "";
    const editable = !!taskId && !!entry && ts > 0 && !!name;

    overlay.dataset.historyEntryOwner = options.owner;
    overlay.dataset.historyEntryTaskId = String(taskId || "");
    overlay.dataset.historyEntryEditable = editable ? "true" : "false";
    overlay.dataset.historyEntryTs = editable ? String(ts) : "";
    overlay.dataset.historyEntryMs = editable ? String(ms) : "";
    overlay.dataset.historyEntryName = editable ? name : "";
    overlay.dataset.historyEntryNote = editable ? note : "";
    overlay.dataset.historyEntryEditing = "false";
    if (elements.input) elements.input.value = editable ? note : "";
    syncEditorUi(false);
  }

  function openSummary(taskId: string, entries: HistoryEntrySummarySource[]) {
    const payload = buildHistoryEntrySummaryPayload({
      taskId,
      task: options.getTaskById(taskId),
      rewardProgress: options.getRewardProgress(),
      entries,
      formatDateTime: options.formatDateTime,
      formatTwo: options.formatTwo,
      getEntryNote: options.getEntryNote,
    });
    if (!payload) return false;
    if (elements.title) elements.title.textContent = payload.titleText;
    if (elements.meta) {
      elements.meta.textContent = payload.metaText;
      elements.meta.style.display = payload.metaText ? "" : "none";
    }
    if (elements.body) {
      elements.body.innerHTML = renderHistoryEntrySummaryHtml(payload, options.escapeHtml);
      syncPlaceholders();
    }
    setTarget(taskId, entries);
    options.openOverlay(elements.overlay);
    return true;
  }

  function clearTarget() {
    const overlay = elements.overlay;
    if (overlay) {
      overlay.dataset.historyEntryOwner = "";
      overlay.dataset.historyEntryTaskId = "";
      overlay.dataset.historyEntryEditable = "false";
      overlay.dataset.historyEntryTs = "";
      overlay.dataset.historyEntryMs = "";
      overlay.dataset.historyEntryName = "";
      overlay.dataset.historyEntryNote = "";
      overlay.dataset.historyEntryEditing = "false";
    }
    if (elements.input) elements.input.value = "";
    syncEditorUi(false);
  }

  function isOpen() {
    return !!elements.overlay && elements.overlay.style.display !== "none";
  }

  function beginEdit(trigger: HTMLElement | null) {
    const overlay = elements.overlay;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return false;
    if (!trigger || overlay.dataset.historyEntryEditing === "true") return false;

    const taskId = String(trigger.getAttribute("data-history-summary-task-id") || "").trim();
    const ts = normalizeTimestamp(trigger.getAttribute("data-history-summary-ts"));
    const ms = normalizeElapsedMs(trigger.getAttribute("data-history-summary-ms"));
    const name = normalizeName(trigger.getAttribute("data-history-summary-name"));
    if (!taskId || ts <= 0 || !name) return false;

    const entry = findEntryByIdentity(options.getEntriesForTask(taskId), { ts, ms, name });
    if (!entry || entry.isLiveSession) return false;

    const note = options.getEntryNote(entry);
    overlay.dataset.historyEntryTaskId = taskId;
    overlay.dataset.historyEntryEditable = "true";
    overlay.dataset.historyEntryTs = String(ts);
    overlay.dataset.historyEntryMs = String(ms);
    overlay.dataset.historyEntryName = name;
    overlay.dataset.historyEntryNote = note;
    if (elements.input) elements.input.value = note;

    const input = trigger.querySelector("[data-history-summary-note-input]") as HTMLTextAreaElement | null;
    if (input) {
      input.readOnly = false;
      input.classList.add("isEditing");
      input.value = note;
    }
    syncEditorUi(true);
    (input || elements.input)?.focus();
    return true;
  }

  function cancelEdit() {
    const overlay = elements.overlay;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return;
    if (elements.input) elements.input.value = String(overlay.dataset.historyEntryNote || "");
    const activeInput = getActiveInput();
    if (activeInput) {
      activeInput.value = String(overlay.dataset.historyEntryNote || "");
      activeInput.readOnly = true;
      activeInput.classList.remove("isEditing");
    }
    syncEditorUi(false);
  }

  function syncInputMirror(value: string) {
    if (elements.input) elements.input.value = String(value || "");
    syncCloseLabel();
  }

  return {
    openSummary,
    clearTarget,
    isOpen,
    beginEdit,
    cancelEdit,
    getActiveInputValue,
    syncInputMirror,
    syncCloseLabel,
    syncEditorUi,
  };
}
