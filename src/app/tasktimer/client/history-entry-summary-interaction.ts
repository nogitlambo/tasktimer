import type { RewardProgressV1 } from "../lib/rewards";
import type { Task } from "../lib/types";
import {
  buildHistoryEntrySummaryPayload,
  renderHistoryEntrySummaryHtml,
} from "./history-entry-summary";
import {
  getRichNoteEditorValue,
  richNoteHasMeaningfulText,
  setRichNoteEditorValue,
} from "./rich-session-notes";
import { captureXpAwardRectSnapshot, dispatchPendingXpAwardEvent } from "./xp-award-events";

type HistoryEntrySummaryOwner = "inline" | "manager";
const CAN_TRIGGER_DEV_XP_REPLAY = process.env.NODE_ENV !== "production";

type HistoryEntrySummarySource = {
  taskId?: unknown;
  ts?: unknown;
  ms?: unknown;
  name?: unknown;
  note?: unknown;
  isLiveSession?: unknown;
  completionDifficulty?: unknown;
};

export type HistoryEntrySummaryNoteDraft = {
  taskId: string;
  ts: number;
  ms: number;
  name: string;
  note: string;
};

type HistoryEntrySummaryInteractionElements = {
  overlay: HTMLElement | null;
  title: HTMLElement | null;
  meta: HTMLElement | null;
  body: HTMLElement | null;
  editor: HTMLElement | null;
  input: HTMLElement | null;
  editBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAndCloseBtn: HTMLButtonElement | null;
};

type RichNoteEditorElement = HTMLElement & {
  placeholder?: string;
  contentEditable?: string;
  readOnly?: boolean;
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

function getXpReplaySourceElement(trigger: HTMLElement) {
  const field = typeof trigger.closest === "function" ? trigger.closest(".historyEntrySummaryField") : null;
  return (field?.querySelector("[data-history-summary-xp-source]") as HTMLElement | null) || trigger;
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
  const INLINE_NOTE_COMPACT_HEIGHT_PX = 22;

  function getCloseButton() {
    return elements.overlay?.querySelector(".closePopup") as HTMLButtonElement | null;
  }

  function resetInlineNoteAutosize(input: HTMLElement | null) {
    if (!input) return;
    input.style.height = "";
    input.style.overflowY = "";
  }

  function getInlineNoteMaxHeight(input: HTMLElement) {
    const overlay = elements.overlay;
    if (!overlay) return Number.POSITIVE_INFINITY;
    const modal = overlay.querySelector(".modal") as HTMLElement | null;
    const body = elements.body;
    if (!modal || !body || typeof input.getBoundingClientRect !== "function") return Number.POSITIVE_INFINITY;

    const inputRect = input.getBoundingClientRect();
    const modalRect = typeof modal.getBoundingClientRect === "function" ? modal.getBoundingClientRect() : null;
    const bodyRect = typeof body.getBoundingClientRect === "function" ? body.getBoundingClientRect() : null;
    if (!modalRect || !bodyRect) return Number.POSITIVE_INFINITY;

    const modalStyle = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(modal)
      : null;
    const bodyStyle = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(body)
      : null;
    const modalPaddingBottom = Number.parseFloat(modalStyle?.paddingBottom || "0") || 0;
    const bodyPaddingBottom = Number.parseFloat(bodyStyle?.paddingBottom || "0") || 0;
    const modalBottomLimit = modalRect.bottom - modalPaddingBottom;
    const bodyBottomLimit = bodyRect.bottom - bodyPaddingBottom;
    const availableHeight = Math.max(
      INLINE_NOTE_COMPACT_HEIGHT_PX,
      Math.floor(Math.min(modalBottomLimit, bodyBottomLimit) - inputRect.top)
    );
    return availableHeight > 0 ? availableHeight : INLINE_NOTE_COMPACT_HEIGHT_PX;
  }

  function autosizeInlineNoteInput(input: HTMLElement | null) {
    if (!input || !input.classList.contains("isEditing")) return;
    input.classList.remove("isCollapsed");
    input.style.height = "auto";
    const maxHeight = getInlineNoteMaxHeight(input);
    const nextHeight = Math.max(INLINE_NOTE_COMPACT_HEIGHT_PX, Math.ceil(input.scrollHeight || 0));
    const clampedHeight = Math.min(nextHeight, maxHeight);
    input.style.height = `${clampedHeight}px`;
    input.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
  }

  function syncPlaceholders() {
    const overlay = elements.overlay;
    if (!overlay) return;
    const isMobile = options.isMobileLayout();
    overlay.querySelectorAll<HTMLElement>("[data-history-summary-note-input]").forEach((input) => {
      const desktopText = String(input.dataset.emptyNotePlaceholderDesktop || "Click to add note");
      const mobileText = String(input.dataset.emptyNotePlaceholderMobile || "Tap to add note");
      const placeholderText = isMobile ? mobileText : desktopText;
      input.dataset.placeholder = placeholderText;
      (input as RichNoteEditorElement).placeholder = placeholderText;
      input.setAttribute?.("data-placeholder", placeholderText);
    });
  }

  function getActiveInput() {
    const overlay = elements.overlay;
    if (!overlay) return null;
    return (overlay.querySelector(".historyEntrySummaryNoteInput.isActiveEditing")
      || overlay.querySelector(".historyEntrySummaryNoteInput.isEditing")) as HTMLElement | null;
  }

  function getEditedInputs() {
    const overlay = elements.overlay;
    if (!overlay) return [];
    const editedInputs = Array.from(overlay.querySelectorAll<HTMLElement>(".historyEntrySummaryNoteInput.isEditing"));
    if (editedInputs.length) return editedInputs;
    const activeInput = getActiveInput();
    return activeInput?.classList.contains("isEditing") ? [activeInput] : [];
  }

  function getActiveInputValue() {
    return getRichNoteEditorValue(getActiveInput() || elements.input);
  }

  function readDraftIdentity(input: HTMLElement) {
    const source = input.closest?.('[data-history-summary-action="edit-note"]') as HTMLElement | null;
    const taskId = String(input.dataset.historySummaryTaskId || source?.getAttribute("data-history-summary-task-id") || "").trim();
    const ts = normalizeTimestamp(input.dataset.historySummaryTs || source?.getAttribute("data-history-summary-ts"));
    const ms = normalizeElapsedMs(input.dataset.historySummaryMs || source?.getAttribute("data-history-summary-ms"));
    const name = normalizeName(input.dataset.historySummaryName || source?.getAttribute("data-history-summary-name"));
    if (!taskId || ts <= 0 || !name) return null;
    return { taskId, ts, ms, name };
  }

  function getEditedNoteDrafts(): HistoryEntrySummaryNoteDraft[] {
    return getEditedInputs()
      .map((input) => {
        const identity = readDraftIdentity(input);
        if (!identity) return null;
        return {
          ...identity,
          note: getRichNoteEditorValue(input).trim(),
        };
      })
      .filter((draft): draft is HistoryEntrySummaryNoteDraft => !!draft);
  }

  function collapseActiveInlineNoteInput() {
    const input = getActiveInput();
    if (!input) return false;
    input.classList.add("isCollapsed");
    input.classList.remove("isActiveEditing");
    input.style.height = `${INLINE_NOTE_COMPACT_HEIGHT_PX}px`;
    input.style.overflowY = "hidden";
    return true;
  }

  function expandActiveInlineNoteInput() {
    const input = getActiveInput();
    if (!input) return false;
    autosizeInlineNoteInput(input);
    return true;
  }

  function syncCloseLabel() {
    const overlay = elements.overlay;
    const saveAndCloseBtn = elements.saveAndCloseBtn;
    if (!overlay || !saveAndCloseBtn) return;
    const shouldShowSaveAndClose = overlay.dataset.historyEntryOwner === "inline"
      && overlay.dataset.historyEntryEditing === "true"
      && getEditedNoteDrafts().some((draft) => richNoteHasMeaningfulText(draft.note));
    saveAndCloseBtn.style.display = shouldShowSaveAndClose ? "" : "none";
  }

  function syncEditorUi(editing: boolean) {
    const overlay = elements.overlay;
    if (!overlay) return;
    const editable = overlay.dataset.historyEntryEditable === "true";
    const currentNote = String(overlay.dataset.historyEntryNote || "");
    const closeBtn = getCloseButton();
    const saveAndCloseBtn = elements.saveAndCloseBtn;

    if (options.owner === "manager" && editing && !getActiveInput()) {
      if (elements.editor) elements.editor.style.display = "grid";
      if (elements.cancelBtn) elements.cancelBtn.style.display = "";
      if (elements.saveBtn) elements.saveBtn.style.display = "";
      if (saveAndCloseBtn) saveAndCloseBtn.style.display = "none";
      if (elements.editBtn) elements.editBtn.style.display = "none";
    } else {
      if (elements.editor) elements.editor.style.display = "none";
      if (elements.editBtn) {
        elements.editBtn.textContent = currentNote ? "Edit Note" : "Add Note";
        elements.editBtn.style.display = editable && !editing ? "" : "none";
      }
      if (elements.cancelBtn) elements.cancelBtn.style.display = "none";
      if (elements.saveBtn) elements.saveBtn.style.display = "none";
      if (saveAndCloseBtn) saveAndCloseBtn.style.display = "none";
    }

    if (closeBtn) closeBtn.style.display = "";

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
    if (elements.input) setRichNoteEditorValue(elements.input, editable ? note : "");
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
    if (elements.input) setRichNoteEditorValue(elements.input, "");
    syncEditorUi(false);
  }

  function isOpen() {
    return !!elements.overlay && elements.overlay.style.display !== "none";
  }

  function beginEdit(trigger: HTMLElement | null) {
    const overlay = elements.overlay;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return false;
    if (!trigger) return false;

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
    if (elements.input) setRichNoteEditorValue(elements.input, note);

    const input = trigger.querySelector("[data-history-summary-note-input]") as HTMLElement | null;
    const activeInput = getActiveInput();
    if (activeInput && activeInput !== input) collapseActiveInlineNoteInput();
    if (input) {
      if (!input.classList.contains("isEditing")) {
        setRichNoteEditorValue(input, note);
      }
      input.setAttribute?.("contenteditable", "true");
      (input as RichNoteEditorElement).contentEditable = "true";
      (input as RichNoteEditorElement).readOnly = false;
      input.classList.add("isEditing");
      input.classList.add("isActiveEditing");
      input.classList.remove("isCollapsed");
      input.dataset.historySummaryTaskId = taskId;
      input.dataset.historySummaryTs = String(ts);
      input.dataset.historySummaryMs = String(ms);
      input.dataset.historySummaryName = name;
      input.dataset.historySummarySavedNote = note;
      autosizeInlineNoteInput(input);
    }
    syncEditorUi(true);
    (input || elements.input)?.focus();
    return true;
  }

  function cancelEdit() {
    const overlay = elements.overlay;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return;
    if (elements.input) setRichNoteEditorValue(elements.input, String(overlay.dataset.historyEntryNote || ""));
    getEditedInputs().forEach((input) => {
      setRichNoteEditorValue(input, String(input.dataset.historySummarySavedNote || ""));
      input.setAttribute?.("contenteditable", "false");
      (input as RichNoteEditorElement).contentEditable = "false";
      (input as RichNoteEditorElement).readOnly = true;
      input.classList.remove("isEditing");
      input.classList.remove("isActiveEditing");
      input.classList.remove("isCollapsed");
      delete input.dataset.historySummaryTaskId;
      delete input.dataset.historySummaryTs;
      delete input.dataset.historySummaryMs;
      delete input.dataset.historySummaryName;
      delete input.dataset.historySummarySavedNote;
      resetInlineNoteAutosize(input);
    });
    syncEditorUi(false);
  }

  function discardDraft() {
    const overlay = elements.overlay;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return;
    if (overlay.dataset.historyEntryEditing !== "true") return;
    cancelEdit();
  }

  function syncInputMirror(value: string) {
    const nextValue = String(value || "");
    if (elements.input) setRichNoteEditorValue(elements.input, nextValue);
    autosizeInlineNoteInput(getActiveInput());
    syncCloseLabel();
  }

  function triggerDevXpAward(trigger: HTMLElement | null) {
    const overlay = elements.overlay;
    if (!CAN_TRIGGER_DEV_XP_REPLAY || typeof window === "undefined") return false;
    if (!overlay || overlay.dataset.historyEntryOwner !== options.owner) return false;
    if (overlay.dataset.historyEntryEditing === "true") return false;
    if (!trigger) return false;

    const awardedXp = Math.max(0, Math.floor(Number(trigger.getAttribute("data-history-summary-xp") || 0)));
    if (!(awardedXp > 0)) return false;

    const rewardProgress = options.getRewardProgress();
    const currentTotalXp = Math.max(0, Math.floor(Number(rewardProgress?.totalXp || 0)));
    const taskId = String(trigger.getAttribute("data-history-summary-task-id") || overlay.dataset.historyEntryTaskId || "").trim();
    const sourceElement = getXpReplaySourceElement(trigger);

    dispatchPendingXpAwardEvent(window, {
      fromXp: Math.max(0, currentTotalXp - awardedXp),
      toXp: currentTotalXp,
      awardedXp,
      sourceModal: "historyEntrySummaryTest",
      sourceTaskId: taskId || null,
      sourceOverlayId: "historyEntryNoteOverlay",
      sourceElementKey: sourceElement === trigger ? "historyEntrySummaryXpReplayFallback" : "historyEntrySummaryXpValue",
      sourceRect: captureXpAwardRectSnapshot(sourceElement),
    });
    options.closeOverlay(overlay);
    return true;
  }

  return {
    openSummary,
    clearTarget,
    isOpen,
    beginEdit,
    cancelEdit,
    discardDraft,
    getActiveInputValue,
    getEditedNoteDrafts,
    collapseActiveInlineNoteInput,
    expandActiveInlineNoteInput,
    syncInputMirror,
    syncCloseLabel,
    syncEditorUi,
    triggerDevXpAward,
  };
}
