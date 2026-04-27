import type { HistoryViewState } from "./types";
import type { TaskTimerHistoryInlineContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import {
  buildHistoryEntrySummaryPayload,
  renderHistoryEntrySummaryHtml,
} from "./history-entry-summary";
import { createHistorySpectrumFill } from "./history-chart-fill";

/* eslint-disable @typescript-eslint/no-explicit-any */

type HistoryUI = {
  root: HTMLElement;
  canvasWrap: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  viewSummaryBtn: HTMLButtonElement | null;
  clearLocksBtn: HTMLButtonElement | null;
  rangeText: HTMLElement | null;
  olderBtn: HTMLButtonElement | null;
  newerBtn: HTMLButtonElement | null;
  trashRow: HTMLElement | null;
  deleteBtn: HTMLButtonElement | null;
};

export function createTaskTimerHistoryInline(ctx: TaskTimerHistoryInlineContext) {
  const { els } = ctx;
  const HISTORY_LOOKBACK_DAYS = 30;
  const HISTORY_REVEAL_OPEN_MS = 220;
  const HISTORY_REVEAL_CLOSE_MS = 170;
  const HISTORY_BAR_REVEAL_MS = 280;
  const HISTORY_LAYOUT_RETRY_MAX_FRAMES = 12;
  const HISTORY_OPEN_SETTLE_REPAINT_DELAYS_MS = [0, 32, 96, 180] as const;
  const { sharedTasks } = ctx;
  const historyCanvasResizeObservers = new Map<string, { observer: ResizeObserver; element: HTMLElement }>();

  function prefersReducedMotion() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearHistoryRevealTimer(state: HistoryViewState | undefined) {
    if (!state || state.revealTimer == null) return;
    window.clearTimeout(state.revealTimer);
    state.revealTimer = null;
  }

  function clearHistoryBarRevealAnimation(state: HistoryViewState | undefined) {
    if (!state || state.barRevealAnimRaf == null) return;
    window.cancelAnimationFrame(state.barRevealAnimRaf);
    state.barRevealAnimRaf = null;
  }

  function clearHistoryLayoutRetry(state: HistoryViewState | undefined) {
    if (!state || state.layoutRetryRaf == null) return;
    window.cancelAnimationFrame(state.layoutRetryRaf);
    state.layoutRetryRaf = null;
  }

  function clearHistoryCanvasResizeObserver(taskId: string) {
    const existing = historyCanvasResizeObservers.get(taskId);
    if (!existing) return;
    existing.observer.disconnect();
    historyCanvasResizeObservers.delete(taskId);
  }

  function syncHistoryCanvasResizeObserver(taskId: string, wrap: HTMLElement | null) {
    if (!taskId || !wrap || typeof ResizeObserver === "undefined") return;
    const existing = historyCanvasResizeObservers.get(taskId);
    if (existing?.element === wrap) return;
    if (existing) {
      existing.observer.disconnect();
      historyCanvasResizeObservers.delete(taskId);
    }
    const observer = new ResizeObserver(() => {
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
      renderHistory(taskId);
    });
    observer.observe(wrap);
    historyCanvasResizeObservers.set(taskId, { observer, element: wrap });
  }

  function queueHistoryLayoutRetry(taskId: string, state: HistoryViewState, attemptsRemaining = HISTORY_LAYOUT_RETRY_MAX_FRAMES) {
    if (state.layoutRetryRaf != null) return;
    state.layoutRetryRaf = window.requestAnimationFrame(() => {
      state.layoutRetryRaf = null;
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
      const nextState = ctx.getHistoryViewByTaskId()[taskId];
      if (!nextState) return;
      const chartDrawn = renderHistory(taskId);
      if (!chartDrawn && attemptsRemaining > 1) {
        queueHistoryLayoutRetry(taskId, nextState, attemptsRemaining - 1);
      }
    });
  }

  function scheduleHistoryOpenSettledRenders(taskId: string) {
    for (const delayMs of HISTORY_OPEN_SETTLE_REPAINT_DELAYS_MS) {
      window.setTimeout(() => {
        if (ctx.getCurrentAppPage() !== "tasks") return;
        if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
        renderHistory(taskId);
      }, delayMs);
    }
  }

  function renderAllOpenHistoryChartsAfterLayout(delayMs = 0) {
    const run = () => {
      if (ctx.getCurrentAppPage() !== "tasks") return;
      window.requestAnimationFrame(() => {
        for (const openTaskId of ctx.getOpenHistoryTaskIds()) {
          renderHistory(openTaskId);
        }
      });
    };
    if (delayMs > 0) {
      window.setTimeout(run, delayMs);
      return;
    }
    run();
  }

  function queueHistoryRevealTimer(state: HistoryViewState, delayMs: number, callback: () => void) {
    clearHistoryRevealTimer(state);
    state.revealTimer = window.setTimeout(() => {
      state.revealTimer = null;
      callback();
    }, delayMs);
  }

  function historyLocalDateKey(tsRaw: unknown) {
    const ts = ctx.normalizeHistoryTimestampMs(tsRaw);
    if (ts <= 0) return "";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function getHistoryEntryNote(entry: any) {
    const note = String(entry?.note || "").trim();
    return note || "";
  }

  function historyTsMs(entry: any) {
    return ctx.normalizeHistoryTimestampMs(entry?.ts);
  }

  function getHistoryForTask(taskId: string) {
    const historyByTaskId = ctx.getHistoryByTaskId();
    const arr = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    return arr.slice().sort((a: any, b: any) => historyTsMs(a) - historyTsMs(b));
  }

  function getFinalizedHistoryByTaskId() {
    const projected = ctx.getHistoryByTaskId();
    const next: Record<string, unknown[]> = {};
    Object.keys(projected || {}).forEach((taskId) => {
      const arr = Array.isArray(projected?.[taskId]) ? projected[taskId] : [];
      next[taskId] = arr.filter((entry: any) => !entry?.isLiveSession);
    });
    return next;
  }

  function getHistoryWindowForTask(taskId: string) {
    const allRaw = getHistoryForTask(taskId);
    if (!allRaw.length) return { allRaw, windowed: allRaw, usesFallbackWindow: false };
    const cutoffMs = ctx.nowMs() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const windowed = allRaw.filter((entry: any) => historyTsMs(entry) >= cutoffMs);
    if (windowed.length) return { allRaw, windowed, usesFallbackWindow: false };
    return { allRaw, windowed: allRaw, usesFallbackWindow: true };
  }

  function formatHistoryChartElapsedLabel(ms: number) {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const parts: string[] = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`, `${seconds}s`);

    return parts.join(" ");
  }

  function historyPageSize(taskId?: string) {
    if (!taskId) return 7;
    const state = ctx.getHistoryViewByTaskId()[taskId];
    return state?.rangeDays || 7;
  }

  function ensureHistoryViewState(taskId: string): HistoryViewState {
    const historyViewByTaskId = ctx.getHistoryViewByTaskId();
    const existing = historyViewByTaskId[taskId];
    if (existing) return existing;
    const historyRangeDaysByTaskId = ctx.getHistoryRangeDaysByTaskId();
    const historyRangeModeByTaskId = ctx.getHistoryRangeModeByTaskId();
    const savedRangeDays = historyRangeDaysByTaskId[taskId] === 14 ? 14 : 7;
    const savedRangeMode = historyRangeModeByTaskId[taskId] === "day" ? "day" : "entries";
    const created: HistoryViewState = {
      page: 0,
      rangeDays: savedRangeDays,
      rangeMode: savedRangeMode,
      revealPhase: "open",
      revealTimer: null,
      barRevealProgress: 1,
      barRevealAnimRaf: null,
      layoutRetryRaf: null,
      editMode: false,
      barRects: [],
      labelHitRects: [],
      lockedAbsIndexes: new Set<number>(),
      selectedAbsIndex: null,
      selectedRelIndex: null,
      selectionClearTimer: null,
      visualSelectedAbsIndex: null,
      selectionZoom: 1,
      selectionAnimRaf: null,
      slideDir: null,
    };
    historyViewByTaskId[taskId] = created;
    return created;
  }

  function startHistoryBarRevealAnimation(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    clearHistoryBarRevealAnimation(state);
    if (prefersReducedMotion()) {
      state.barRevealProgress = 1;
      return;
    }

    state.barRevealProgress = 0;
    const startAt = performance.now();

    const tick = (now: number) => {
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) {
        state.barRevealAnimRaf = null;
        return;
      }
      const nextState = ctx.getHistoryViewByTaskId()[taskId];
      if (!nextState) return;
      const t = Math.max(0, Math.min(1, (now - startAt) / HISTORY_BAR_REVEAL_MS));
      nextState.barRevealProgress = 1 - Math.pow(1 - t, 3);
      renderHistory(taskId);
      if (t < 1) {
        nextState.barRevealAnimRaf = window.requestAnimationFrame(tick);
      } else {
        nextState.barRevealAnimRaf = null;
        nextState.barRevealProgress = 1;
        renderHistory(taskId);
      }
    };

    state.barRevealAnimRaf = window.requestAnimationFrame(tick);
  }

  function saveHistoryRangePref(taskId: string, rangeDays: 7 | 14) {
    if (!taskId) return;
    ctx.getHistoryRangeDaysByTaskId()[taskId] = rangeDays;
    ctx.persistTaskUiToCloud();
  }

  function saveHistoryRangeModePref(taskId: string, rangeMode: "entries" | "day") {
    if (!taskId) return;
    ctx.getHistoryRangeModeByTaskId()[taskId] = rangeMode;
    ctx.persistTaskUiToCloud();
  }

  function startHistorySelectionAnimation(taskId: string, nextAbsIndex: number | null) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }
    clearHistoryBarRevealAnimation(state);
    clearHistoryLayoutRetry(state);

    const prevAbsIndex = state.visualSelectedAbsIndex;
    const switchingTarget = prevAbsIndex !== nextAbsIndex;
    const fromZoom = switchingTarget ? (nextAbsIndex == null ? state.selectionZoom : 1) : state.selectionZoom;
    const toZoom = nextAbsIndex == null ? 1 : 1.5;
    const durationMs = 180;
    const startAt = performance.now();

    if (nextAbsIndex != null) state.visualSelectedAbsIndex = nextAbsIndex;

    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - startAt) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      state.selectionZoom = fromZoom + (toZoom - fromZoom) * eased;
      renderHistory(taskId);
      if (t < 1) {
        state.selectionAnimRaf = window.requestAnimationFrame(tick);
      } else {
        state.selectionAnimRaf = null;
        state.selectionZoom = toZoom;
        if (nextAbsIndex == null) state.visualSelectedAbsIndex = null;
        renderHistory(taskId);
      }
    };

    state.selectionAnimRaf = window.requestAnimationFrame(tick);
  }

  function scheduleHistorySelectionClear(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectionClearTimer = window.setTimeout(() => {
      const next = ctx.getHistoryViewByTaskId()[taskId];
      if (!next) return;
      next.selectedAbsIndex = null;
      next.selectedRelIndex = null;
      next.selectionClearTimer = null;
      startHistorySelectionAnimation(taskId, null);
    }, 3000);
  }

  function clearHistoryChartSelection(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectedRelIndex = null;
    state.selectedAbsIndex = null;
    state.lockedAbsIndexes.clear();
    syncHistoryEntryNoteOverlayForSelection(taskId, state);
    startHistorySelectionAnimation(taskId, null);
  }

  function resetHistoryChartSelectionToDefault(taskId: string) {
    if (!taskId) return;
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }
    state.selectedRelIndex = null;
    state.selectedAbsIndex = null;
    state.lockedAbsIndexes.clear();
    state.visualSelectedAbsIndex = null;
    state.selectionZoom = 1;
    if (ctx.getHistoryEntryNoteAnchorTaskId() === taskId) closeHistoryEntryNoteOverlay();
    if (ctx.getCurrentAppPage() === "tasks" && ctx.getOpenHistoryTaskIds().has(taskId)) renderHistory(taskId);
  }

  function resetAllOpenHistoryChartSelections() {
    Array.from(ctx.getOpenHistoryTaskIds()).forEach((taskId) => {
      resetHistoryChartSelectionToDefault(taskId);
    });
  }

  function clearHistoryLockedSelections(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    state.lockedAbsIndexes.clear();
    syncHistoryEntryNoteOverlayForSelection(taskId, state);
  }

  async function copyTextToClipboard(textRaw: string) {
    const text = String(textRaw || "");
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback.
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }

  function getHistoryUi(taskId: string): HistoryUI | null {
    if (!els.taskList) return null;
    const root = els.taskList.querySelector(`.task[data-task-id="${taskId}"] .historyInline`) as HTMLElement | null;
    if (!root) return null;
    return {
      root,
      canvasWrap: root.querySelector(".historyCanvasWrap"),
      canvas: root.querySelector(".historyChartInline"),
      viewSummaryBtn: root.querySelector('[data-history-action="viewSummary"]'),
      clearLocksBtn: root.querySelector('[data-history-action="clearLocks"]'),
      rangeText: root.querySelector(".historyRangeText"),
      olderBtn: root.querySelector('[data-history-action="older"]'),
      newerBtn: root.querySelector('[data-history-action="newer"]'),
      trashRow: root.querySelector(".historyTrashRow"),
      deleteBtn: root.querySelector('[data-history-action="delete"]'),
    };
  }

  function getHistoryChartTarget(evTarget: EventTarget | null) {
    const target = evTarget as HTMLElement | null;
    const wrap = target?.closest?.(".historyCanvasWrap") as HTMLElement | null;
    if (!wrap) return null;
    const canvas = (wrap.querySelector(".historyChartInline") as HTMLCanvasElement | null) || null;
    const taskEl = wrap.closest(".task") as HTMLElement | null;
    const taskId = taskEl?.getAttribute?.("data-task-id") || "";
    if (!canvas || !taskId) return null;
    return { wrap, canvas, taskId, taskEl };
  }

  function positionHistoryEntryNoteOverlay(taskId: string) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    const modal = overlay?.querySelector(".modal") as HTMLElement | null;
    const ui = getHistoryUi(taskId);
    const chartWrap = (ui?.canvasWrap as HTMLElement | null) || (els.historyCanvasWrap as HTMLElement | null);
    if (!overlay || !modal || !chartWrap) {
      if (overlay) {
        overlay.style.removeProperty("--history-note-left");
        overlay.style.removeProperty("--history-note-top");
      }
      return;
    }

    const gap = 10;
    const viewportPad = 14;
    const chartRect = chartWrap.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const modalWidth = Math.max(Math.ceil(modalRect.width || modal.offsetWidth || 0), 280);
    const modalHeight = Math.max(Math.ceil(modalRect.height || modal.offsetHeight || 0), 120);

    let left = chartRect.left;
    const maxLeft = Math.max(viewportPad, viewportWidth - modalWidth - viewportPad);
    if (left > maxLeft) left = maxLeft;
    if (left < viewportPad) left = viewportPad;

    let top = chartRect.bottom + gap;
    const maxTop = Math.max(viewportPad, viewportHeight - modalHeight - viewportPad);
    if (top > maxTop) top = maxTop;
    if (top < viewportPad) top = viewportPad;

    overlay.style.setProperty("--history-note-left", `${Math.round(left)}px`);
    overlay.style.setProperty("--history-note-top", `${Math.round(top)}px`);
  }

  function refreshHistoryEntryNoteOverlayPosition() {
    const taskId = String(ctx.getHistoryEntryNoteAnchorTaskId() || "").trim();
    if (!taskId) return;
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay || overlay.style.display === "none") return;
    positionHistoryEntryNoteOverlay(taskId);
  }

  function clearHistoryEntryNoteOverlayPosition() {
    ctx.setHistoryEntryNoteAnchorTaskId("");
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay) return;
    overlay.style.removeProperty("--history-note-left");
    overlay.style.removeProperty("--history-note-top");
  }

  function isHistoryEntryNoteOverlayOpen() {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    return !!overlay && overlay.style.display !== "none";
  }

  function syncHistoryEntryNoteEditorUi(editing: boolean) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay) return;
    const editable = overlay.dataset.historyEntryEditable === "true";
    const currentNote = String(overlay.dataset.historyEntryNote || "");
    if (els.historyEntryNoteEditor) {
      (els.historyEntryNoteEditor as HTMLElement).style.display = editable && editing ? "grid" : "none";
    }
    if (els.historyEntryNoteEditBtn) {
      els.historyEntryNoteEditBtn.textContent = currentNote ? "Edit Note" : "Add Note";
      els.historyEntryNoteEditBtn.style.display = editable && !editing ? "" : "none";
    }
    if (els.historyEntryNoteCancelBtn) {
      els.historyEntryNoteCancelBtn.style.display = editable && editing ? "" : "none";
    }
    if (els.historyEntryNoteSaveBtn) {
      els.historyEntryNoteSaveBtn.style.display = editable && editing ? "" : "none";
    }
    const closeBtn = overlay.querySelector(".closePopup") as HTMLButtonElement | null;
    if (closeBtn) closeBtn.style.display = editing ? "none" : "";
    overlay.dataset.historyEntryEditing = editing ? "true" : "false";
  }

  function setHistoryEntryOverlayTarget(taskId: string, entries: any[]) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay) return;
    overlay.dataset.historyEntryOwner = "inline";
    overlay.dataset.historyEntryTaskId = String(taskId || "");
    const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : null;
    const ts = Number.isFinite(Number(entry?.ts)) ? Math.floor(Number(entry.ts)) : 0;
    const ms = Number.isFinite(Number(entry?.ms)) ? Math.max(0, Math.floor(Number(entry.ms))) : 0;
    const name = String(entry?.name || "").trim();
    const note = entry ? ctx.getHistoryEntryNote(entry) : "";
    const editable = !!taskId && !!entry && ts > 0 && !!name;
    overlay.dataset.historyEntryEditable = editable ? "true" : "false";
    overlay.dataset.historyEntryTs = editable ? String(ts) : "";
    overlay.dataset.historyEntryMs = editable ? String(ms) : "";
    overlay.dataset.historyEntryName = editable ? name : "";
    overlay.dataset.historyEntryNote = editable ? note : "";
    if (els.historyEntryNoteInput) els.historyEntryNoteInput.value = editable ? note : "";
    syncHistoryEntryNoteEditorUi(false);
  }

  function closeHistoryEntryNoteOverlay(opts?: { preservePosition?: boolean }) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
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
    if (els.historyEntryNoteInput) els.historyEntryNoteInput.value = "";
    syncHistoryEntryNoteEditorUi(false);
    if (!opts?.preservePosition) clearHistoryEntryNoteOverlayPosition();
    ctx.closeOverlay(els.historyEntryNoteOverlay as HTMLElement | null);
  }

  function isHistoryChartInteractionTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest?.(".historyCanvasWrap");
  }

  function openHistoryEntryNoteOverlay(taskId: string, entries: any[]) {
    const task = ctx.getTasks().find((candidate) => String(candidate?.id || "").trim() === String(taskId || "").trim()) || null;
    const payload = buildHistoryEntrySummaryPayload({
      taskId,
      task,
      rewardProgress: ctx.getRewardProgress(),
      entries,
      formatDateTime: ctx.formatDateTime,
      formatTwo: ctx.formatTwo,
      getEntryNote: getHistoryEntryNote,
    });
    if (!payload) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    if (els.historyEntryNoteTitle) els.historyEntryNoteTitle.textContent = payload.titleText;
    if (els.historyEntryNoteMeta) {
      els.historyEntryNoteMeta.textContent = payload.metaText;
      (els.historyEntryNoteMeta as HTMLElement).style.display = payload.metaText ? "" : "none";
    }
    if (els.historyEntryNoteBody) {
      els.historyEntryNoteBody.innerHTML = renderHistoryEntrySummaryHtml(payload, ctx.escapeHtmlUI);
    }
    setHistoryEntryOverlayTarget(taskId, entries);
    ctx.setHistoryEntryNoteAnchorTaskId(taskId);
    ctx.openOverlay(els.historyEntryNoteOverlay as HTMLElement | null);
    requestAnimationFrame(() => {
      refreshHistoryEntryNoteOverlayPosition();
    });
  }

  function saveHistoryEntryOverlayNote() {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay || overlay.dataset.historyEntryOwner !== "inline" || overlay.dataset.historyEntryEditable !== "true") return;
    const taskId = String(overlay.dataset.historyEntryTaskId || "").trim();
    const ts = Math.floor(Number(overlay.dataset.historyEntryTs || 0));
    const ms = Math.max(0, Math.floor(Number(overlay.dataset.historyEntryMs || 0)));
    const name = String(overlay.dataset.historyEntryName || "").trim();
    if (!taskId || ts <= 0 || !name) return;
    const historyByTaskId = ctx.getHistoryByTaskId() || {};
    const original = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
    const pos = original.findIndex(
      (entry: any) => Number(entry?.ts) === ts && Number(entry?.ms) === ms && String(entry?.name || "").trim() === name
    );
    if (pos < 0) return;
    const nextEntry = { ...original[pos] };
    const note = String(els.historyEntryNoteInput?.value || "").trim();
    if (note) nextEntry.note = note;
    else delete nextEntry.note;
    const nextTaskHistory = original.slice();
    nextTaskHistory[pos] = nextEntry;
    const nextHistory = { ...historyByTaskId, [taskId]: nextTaskHistory };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);
    ctx.renderDashboardWidgets();
    openHistoryEntryNoteOverlay(taskId, [nextEntry]);
    renderHistory(taskId);
  }

  function findHistoryEntryIndexByIdentity(entries: any[], identity: { ts: number; ms: number; name: string }) {
    return findTaskTimerHistoryEntryIndexByIdentity(entries, identity);
  }

  function deleteHistoryEntryByAbsIndex(taskId: string, state: HistoryViewState, deleteAbsIndex: number) {
    const allEntries = getHistoryForTask(taskId);
    if (deleteAbsIndex < 0 || deleteAbsIndex >= allEntries.length) return false;
    if ((allEntries[deleteAbsIndex] as any)?.isLiveSession) return false;

    allEntries.splice(deleteAbsIndex, 1);
    const nextHistory = {
      ...getFinalizedHistoryByTaskId(),
      [taskId]: allEntries.filter((entry: any) => !entry?.isLiveSession) as any,
    };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);

    if (state.selectedAbsIndex === deleteAbsIndex) {
      state.selectedAbsIndex = null;
      state.selectedRelIndex = null;
      startHistorySelectionAnimation(taskId, null);
    } else if (state.selectedAbsIndex != null && state.selectedAbsIndex > deleteAbsIndex) {
      state.selectedAbsIndex -= 1;
    }
    if (state.lockedAbsIndexes.size > 0) {
      const nextLocked = new Set<number>();
      state.lockedAbsIndexes.forEach((idx) => {
        if (idx === deleteAbsIndex) return;
        nextLocked.add(idx > deleteAbsIndex ? idx - 1 : idx);
      });
      state.lockedAbsIndexes = nextLocked;
    }
    syncHistoryEntryNoteOverlayForSelection(taskId, state);

    const maxPage = Math.max(0, Math.ceil(allEntries.length / historyPageSize(taskId)) - 1);
    state.page = Math.min(state.page, maxPage);
    renderHistory(taskId);
    ctx.renderDashboardWidgets();
    return true;
  }

  function syncHistoryEntryNoteOverlayForSelection(taskId: string, state?: HistoryViewState | null) {
    if (ctx.getHistoryEntryNoteAnchorTaskId() !== taskId) return;
    const nextState = state || ensureHistoryViewState(taskId);
    const lockedIndexes = Array.from(nextState.lockedAbsIndexes.values()).sort((a, b) => a - b);
    if (!lockedIndexes.length) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    const selectedEntries = getHistorySummaryEntries(taskId, nextState, lockedIndexes[0], nextState.lockedAbsIndexes);
    if (!selectedEntries.length) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    openHistoryEntryNoteOverlay(taskId, selectedEntries);
  }

  function getCurrentHistorySummarySelection(taskId: string, state?: HistoryViewState | null) {
    const nextState = state || ensureHistoryViewState(taskId);
    const lockedIndexes = Array.from(nextState.lockedAbsIndexes.values()).sort((a, b) => a - b);
    const targetAbsIndex = lockedIndexes[0] ?? nextState.selectedAbsIndex ?? null;
    if (targetAbsIndex == null) return [];
    return getHistorySummaryEntries(taskId, nextState, targetAbsIndex, nextState.lockedAbsIndexes);
  }

  function getHistoryDisplayForTask(taskId: string, state: HistoryViewState) {
    const { windowed: all } = getHistoryWindowForTask(taskId);
    if (state.rangeMode !== "day") return all;

    const groupedByDay: Array<any> = [];
    const historyTask = ctx.getTasks().find((task) => String(task.id || "") === String(taskId));
    all.forEach((e: any) => {
      const ts = historyTsMs(e);
      const ms = Math.max(0, +e.ms || 0);
      const key = historyLocalDateKey(ts);
      const last = groupedByDay[groupedByDay.length - 1];
      if (last && last.dayKey === key) {
        last.ms += ms;
        last.count += 1;
        if (ts >= last.ts) last.ts = ts;
      } else {
        groupedByDay.push({
          dayKey: key,
          ts,
          ms,
          count: 1,
          color: historyTask ? ctx.sessionColorForTaskMs(historyTask as any, ms) : e.color,
        });
      }
    });
    return groupedByDay;
  }

  function getHistorySummaryEntries(
    taskId: string,
    state: HistoryViewState,
    primaryAbsIndex: number,
    lockedAbsIndexes?: Set<number> | null
  ) {
    const display = getHistoryDisplayForTask(taskId, state);
    const selectedIndexes = lockedAbsIndexes?.size
      ? Array.from(lockedAbsIndexes.values()).sort((a, b) => a - b)
      : [primaryAbsIndex];
    if (state.rangeMode === "day") {
      const dayKeys = new Set(
        selectedIndexes.map((absIndex) => historyLocalDateKey(display[absIndex]?.ts)).filter((key) => !!key)
      );
      if (!dayKeys.size) {
        const singleDisplayEntry = display[primaryAbsIndex];
        return singleDisplayEntry ? [singleDisplayEntry] : [];
      }
      return getHistoryForTask(taskId)
        .filter((entry: any) => dayKeys.has(historyLocalDateKey(entry?.ts)))
        .sort((a: any, b: any) => historyTsMs(b) - historyTsMs(a));
    }

    return selectedIndexes
      .map((absIndex) => display[absIndex])
      .filter((entry) => !!entry);
  }

  function renderHistoryTrashRow(slice: any[], absStartIndex: number, ui: HistoryUI) {
    if (!ui.trashRow) return;
    const taskId = ui.root.closest(".task")?.getAttribute("data-task-id") || "";
    const state = ensureHistoryViewState(taskId);

    if (!state.editMode) {
      ui.trashRow.style.display = "none";
      ui.trashRow.innerHTML = "";
      return;
    }

    ui.trashRow.style.display = "flex";

    const pageSize = historyPageSize(taskId);
    const buttons: string[] = [];

    for (let i = 0; i < pageSize; i++) {
      const e = slice[i];
      const absIndex = absStartIndex + i;
      const disabled = !e;

      buttons.push(
        `<button class="historyTrashBtn" type="button" data-abs="${absIndex}" ${
          disabled ? "disabled" : ""
        } aria-label="Delete log" title="Delete log">&#128465;</button>`
      );
    }

    ui.trashRow.innerHTML = buttons.join("");
  }

  function drawHistoryChart(entries: any[], absStartIndex: number, ui: HistoryUI, taskId: string) {
    const canvas = ui.canvas;
    const wrap = ui.canvasWrap;
    if (!canvas || !wrap) return false;
    syncHistoryCanvasResizeObserver(taskId, wrap);
    const state = ensureHistoryViewState(taskId);
    wrap.style.touchAction = "pan-y";
    canvas.style.touchAction = "pan-y";

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(rect.width || wrap.clientWidth || canvas.clientWidth || 0);
    const h = Math.floor(rect.height || wrap.clientHeight || canvas.clientHeight || 0);
    if (w <= 0 || h <= 0) {
      queueHistoryLayoutRetry(taskId, state);
      return false;
    }
    clearHistoryLayoutRetry(state);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const draw = canvas.getContext("2d");
    if (!draw) return;

    draw.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw.clearRect(0, 0, w, h);

    const compactLabels = w <= 560;
    const veryCompactLabels = w <= 420;
    const padL = 12;
    const padR = 12;
    const padT = 14;
    const barCount = Math.max(1, entries.length);
    const slotCount = Math.max(1, historyPageSize(taskId));
    const useAngledLabels = true;
    const padB = useAngledLabels ? (veryCompactLabels ? 116 : 128) : compactLabels ? 84 : 72;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const maxEntryMs = Math.max(...entries.map((e) => e.ms || 0), 1);
    const historyTask = ctx.getTasks().find((task) => String(task.id || "") === taskId) || null;
    const milestoneMs =
      historyTask && historyTask.milestonesEnabled && Array.isArray(historyTask.milestones)
        ? ctx
            .sortMilestones(historyTask.milestones)
            .map((m) => ({
              kind: "checkpoint" as const,
              value: +m.hours || 0,
              ms: Math.max(0, (+m.hours || 0) * sharedTasks.milestoneUnitSec(historyTask) * 1000),
              label: `${+m.hours || 0}${sharedTasks.milestoneUnitSuffix(historyTask || undefined)}`,
            }))
            .filter((x, i, arr) => x.ms > 0 && arr.findIndex((y) => y.ms === x.ms) === i)
        : [];
    const timeGoalMs =
      historyTask && historyTask.timeGoalEnabled && Number(historyTask.timeGoalMinutes || 0) > 0
        ? Math.max(0, Number(historyTask.timeGoalMinutes || 0) * 60 * 1000)
        : 0;
    const goalMarker =
      historyTask && timeGoalMs > 0
        ? {
            kind: "timeGoal" as const,
            value: Number(historyTask.timeGoalValue || 0),
            ms: timeGoalMs,
            label: `Goal ${sharedTasks.formatCheckpointTimeGoalText(historyTask)}`,
          }
        : null;
    const chartMarkers = goalMarker ? [...milestoneMs, goalMarker] : milestoneMs;
    const visibleMarkerLabels = chartMarkers.filter((marker) => marker.kind !== "timeGoal");
    const markerLabelFontPx = veryCompactLabels ? 9 : 10;
    draw.font = `${markerLabelFontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const markerLabelPadR = visibleMarkerLabels.length
      ? Math.min(
          Math.floor(innerW * 0.42),
          Math.max(
            18,
            ...visibleMarkerLabels.map((marker) => Math.ceil(draw.measureText(String(marker.label || "")).width) + 10)
          )
        )
      : 10;
    const labelGutterW = markerLabelPadR;
    const plotSidePad = useAngledLabels ? (veryCompactLabels ? 10 : 14) : 6;
    const plotW = Math.max(140, innerW - labelGutterW - plotSidePad * 2);
    const plotLeft = padL + plotSidePad;
    const plotRight = plotLeft + plotW;

    draw.strokeStyle = "rgba(255,255,255,.20)";
    draw.lineWidth = 1;
    draw.beginPath();
    draw.moveTo(plotLeft, padT + innerH + 0.5);
    draw.lineTo(plotRight, padT + innerH + 0.5);
    draw.stroke();

    state.barRects = [];
    state.labelHitRects = [];

    if (!entries || !entries.length) {
      draw.fillStyle = "rgba(255,255,255,.55)";
      draw.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      draw.textAlign = "center";
      draw.fillText("No entries to display", padL + innerW / 2, padT + innerH / 2);
      return true;
    }

    const maxGoalMs = chartMarkers.length ? Math.max(...chartMarkers.map((m) => m.ms || 0), 0) : 0;
    const scaleMaxMs = Math.max(maxEntryMs, maxGoalMs, 1);
    const gap = slotCount <= 10 ? Math.max(6, Math.floor(plotW * 0.02)) : Math.max(3, Math.floor(plotW * 0.01));
    const barW = Math.max(4, Math.floor((plotW - gap * (slotCount - 1)) / slotCount));

    draw.textAlign = "center";

    const labelStep = 1;
    for (let idx = 0; idx < barCount; idx++) {
      const e = entries[idx];
      if (!e) continue;

      const ms = Math.max(0, e.ms || 0);
      const ratio = ms / scaleMaxMs;
      const bh = Math.max(2, Math.floor(innerH * ratio));
      const visualRelIndex =
        state.visualSelectedAbsIndex != null ? state.visualSelectedAbsIndex - (absStartIndex || 0) : null;
      const absIndex = (absStartIndex || 0) + idx;
      const isLocked = state.lockedAbsIndexes.has(absIndex);
      const isSelected = visualRelIndex === idx;
      const hasSelection = visualRelIndex != null || state.lockedAbsIndexes.size > 0;
      const baseX = plotLeft + idx * (barW + gap);
      const cx = baseX + barW / 2;
      const drawW = Math.max(2, Math.floor(barW));
      const barRevealProgress = Math.max(0, Math.min(1, state.barRevealProgress ?? 1));
      const rawAnimatedBarH = Math.floor(bh * barRevealProgress);
      const drawH =
        ms > 0 && barRevealProgress > 0
          ? Math.max(2, Math.min(innerH, rawAnimatedBarH))
          : 0;
      const x = Math.max(plotLeft, Math.min(plotRight - drawW, Math.floor(cx - drawW / 2)));
      const y = drawH > 0 ? Math.max(padT, padT + innerH - drawH) : padT + innerH;
      const barBottomY = padT + innerH;
      const goalY =
        timeGoalMs > 0
          ? Math.max(padT, Math.min(barBottomY - 1, barBottomY - Math.floor(innerH * Math.min(1, timeGoalMs / scaleMaxMs))))
          : y;

      if (drawH > 0) {
        draw.save();
        draw.globalAlpha = hasSelection ? (isSelected || isLocked ? 0.98 : 0.28) : 0.92;
        draw.fillStyle = createHistorySpectrumFill(draw, goalY, barBottomY);
        draw.fillRect(x, y, drawW, drawH);
        draw.restore();
      }

      const slotLeft = idx === 0 ? plotLeft : plotLeft + idx * (barW + gap) - Math.floor(gap / 2);
      const slotRight = idx === barCount - 1 ? plotRight : plotLeft + (idx + 1) * (barW + gap) - Math.floor(gap / 2);
      state.barRects[idx] = {
        x,
        y,
        w: drawW,
        h: drawH,
        absIndex: (absStartIndex || 0) + idx,
        hitX: Math.max(plotLeft, slotLeft),
        hitY: padT,
        hitW: Math.max(4, Math.min(plotRight, slotRight) - Math.max(plotLeft, slotLeft)),
        hitH: innerH,
      };

      if (drawH > 0 && (isSelected || isLocked)) {
        draw.save();
        draw.strokeStyle = isLocked ? "rgba(255,77,77,.95)" : "rgba(255,255,255,.9)";
        draw.lineWidth = 2;
        draw.strokeRect(x + 1, y + 1, Math.max(1, drawW - 2), Math.max(1, drawH - 2));
        draw.restore();
      }

      if (idx % labelStep === 0 || idx === barCount - 1) {
        const labelAlpha = hasSelection ? (isSelected || isLocked ? 1 : 0.28) : 1;
        draw.save();
        draw.globalAlpha = labelAlpha;
        draw.fillStyle = "rgba(255,255,255,.65)";
        const baseDateFont = compactLabels ? 10 : 11;
        const labelFontScale = isSelected ? 1 + ((state.selectionZoom || 1.5) - 1) : isLocked ? 1.5 : 1;
        draw.font = `${Math.round(baseDateFont * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

        const d = new Date(e.ts || 0);
        const dd = ctx.formatTwo(d.getDate());
        const mm = ctx.formatTwo(d.getMonth() + 1);
        const hh = ctx.formatTwo(d.getHours());
        const mi = ctx.formatTwo(d.getMinutes());
        const compactDateLabel = veryCompactLabels ? `${dd}/${mm}` : compactLabels ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}:${hh}:${mi}`;
        const compactElapsedLabel = formatHistoryChartElapsedLabel(ms);

        if (useAngledLabels) {
          const expandedLabelDrop = isSelected || isLocked ? Math.round(10 * labelFontScale) : 0;
          const tx = x + drawW / 2;
          const ty = padT + innerH + (compactLabels ? 20 : 24) + expandedLabelDrop;
          const lineStartX = x + drawW / 2;
          const lineStartY = padT + innerH + 2;
          const lineEndX = tx;
          const lineEndY = ty - 4;
          draw.save();
          draw.strokeStyle = "rgba(255,255,255,.72)";
          draw.lineWidth = 1;
          draw.beginPath();
          draw.moveTo(lineStartX, lineStartY);
          draw.lineTo(lineEndX, lineEndY);
          draw.stroke();
          draw.restore();
          const angle = (-45 * Math.PI) / 180;
          draw.save();
          draw.translate(tx, ty);
          draw.rotate(angle);
          draw.textAlign = "right";
          draw.textBaseline = "middle";
          draw.font = `${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          draw.fillText(compactDateLabel, 0, 0);
          draw.fillStyle = "rgb(0,207,200)";
          draw.font = `700 ${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          draw.fillText(compactElapsedLabel, 0, Math.round(12 * labelFontScale));
          draw.restore();
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((veryCompactLabels ? 30 : 34) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: tx - labelHitW / 2,
            y: ty - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
          draw.textAlign = "center";
          draw.textBaseline = "alphabetic";
        } else {
          const lx = x + drawW / 2;
          const expandedLabelDrop = isSelected || isLocked ? Math.round(8 * labelFontScale) : 0;
          const line1Y = padT + innerH + (compactLabels ? 18 : 22) + expandedLabelDrop;
          const line2Y = padT + innerH + (compactLabels ? 34 : 39) + expandedLabelDrop;
          draw.fillText(compactDateLabel, lx, line1Y);
          draw.fillStyle = "rgb(0,207,200)";
          draw.font = `700 ${Math.round((compactLabels ? 10 : 12) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          draw.fillText(compactElapsedLabel, lx, line2Y);
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((compactLabels ? 28 : 32) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: lx - labelHitW / 2,
            y: line1Y - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
        }
        draw.restore();
      }
    }

    if (chartMarkers.length) {
      draw.save();
      draw.lineWidth = 1;

      const sortedGoals = chartMarkers.slice().sort((a, b) => b.ms - a.ms);
      const drawnLabelY: number[] = [];
      const minLabelGap = 11;

      for (const goal of sortedGoals) {
        const markerRatio = Math.max(0, Math.min(1, goal.ms / scaleMaxMs));
        const markerY = padT + innerH - Math.floor(innerH * markerRatio) + 0.5;

        draw.strokeStyle = goal.kind === "timeGoal" ? "rgba(0,207,200,.92)" : "rgba(255,255,255,.5)";
        if (goal.kind === "timeGoal") {
          draw.setLineDash([6, 4]);
        } else {
          draw.setLineDash([]);
        }
        draw.beginPath();
        draw.moveTo(plotLeft, markerY);
        draw.lineTo(plotRight, markerY);
        draw.stroke();

        const tooClose = drawnLabelY.some((y) => Math.abs(y - markerY) < minLabelGap);
        if (tooClose) continue;
        drawnLabelY.push(markerY);

        if (goal.kind !== "timeGoal") {
          draw.fillStyle = "rgba(255,255,255,.92)";
          draw.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
          draw.textAlign = "right";
          draw.textBaseline = "middle";
          draw.fillText(goal.label, plotRight + markerLabelPadR - 4, markerY);
        }
      }
      draw.setLineDash([]);
      draw.restore();
      draw.textAlign = "center";
      draw.textBaseline = "alphabetic";
    }

    return true;
  }

  function renderHistory(taskId: string) {
    if (!taskId) return false;
    const ui = getHistoryUi(taskId);
    if (!ui) return false;
    const state = ensureHistoryViewState(taskId);

    const { windowed: all, usesFallbackWindow } = getHistoryWindowForTask(taskId);
    const rangeDays = state.rangeDays || 7;
    const distinctDayCount = new Set(all.map((e: any) => historyLocalDateKey(e?.ts))).size;
    const pageSize = historyPageSize(taskId);
    const isDayMode = state.rangeMode === "day";
    const display = getHistoryDisplayForTask(taskId, state);
    const total = display.length;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 0) state.page = 0;

    const end = Math.max(0, total - state.page * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = display.slice(start, end);

    if (ui.rangeText) {
      if (total === 0) ui.rangeText.textContent = "No entries yet";
      else {
        const summary = isDayMode
          ? `Showing ${slice.length} of ${total} days (${all.length} entries)`
          : `Showing ${slice.length} of ${total} entries (${distinctDayCount} ${distinctDayCount === 1 ? "day" : "days"})`;
        const swipeHint = total > slice.length ? " - swipe to browse" : "";
        const fallbackHint = usesFallbackWindow ? ` (showing older entries outside ${HISTORY_LOOKBACK_DAYS} days)` : "";
        ui.rangeText.textContent = `${summary}${swipeHint}${fallbackHint}`;
      }
    }

    if (ui.olderBtn) ui.olderBtn.disabled = start <= 0;
    if (ui.newerBtn) ui.newerBtn.disabled = end >= total;

    if (state.selectedAbsIndex != null) {
      const rel = state.selectedAbsIndex - start;
      if (rel >= 0 && rel < slice.length) state.selectedRelIndex = rel;
      else {
        state.selectedAbsIndex = null;
        state.selectedRelIndex = null;
      }
    } else {
      state.selectedRelIndex = null;
    }
    const hasDeleteTarget = !isDayMode && (state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0);
    const hasSummaryTarget = !isDayMode && (state.selectedAbsIndex != null || state.lockedAbsIndexes.size > 0);
    if (ui.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTarget;
    if (ui.viewSummaryBtn) {
      ui.viewSummaryBtn.disabled = !hasSummaryTarget;
      ui.viewSummaryBtn.setAttribute("aria-disabled", String(!hasSummaryTarget));
      ui.viewSummaryBtn.title = hasSummaryTarget ? "View Summary" : "Select a history entry to view the summary";
    }
    if (ui.clearLocksBtn) ui.clearLocksBtn.style.display = state.lockedAbsIndexes.size > 0 ? "inline-flex" : "none";

    if (ui.canvasWrap && state.slideDir) {
      ui.canvasWrap.classList.remove("slideFromLeft", "slideFromRight");
      void ui.canvasWrap.offsetWidth;
      ui.canvasWrap.classList.add(state.slideDir === "left" ? "slideFromRight" : "slideFromLeft");
      state.slideDir = null;
    }

    const chartDrawn = drawHistoryChart(slice, start, ui, taskId);
    renderHistoryTrashRow(slice, start, ui);
    if (!chartDrawn) return false;

    const rangeToggle = ui.root.querySelector(".historyRangeToggle") as HTMLElement | null;
    if (rangeToggle) {
      const is14 = rangeDays === 14;
      rangeToggle.classList.toggle("on", is14);
      rangeToggle.setAttribute("aria-checked", String(is14));
    }
    const rangeModeEntries = ui.root.querySelector('[data-history-range-mode="entries"]') as HTMLElement | null;
    const rangeModeDay = ui.root.querySelector('[data-history-range-mode="day"]') as HTMLElement | null;
    const isEntriesMode = state.rangeMode !== "day";
    if (rangeModeEntries) {
      rangeModeEntries.classList.toggle("isOn", isEntriesMode);
      rangeModeEntries.setAttribute("aria-pressed", String(isEntriesMode));
    }
    if (rangeModeDay) {
      rangeModeDay.classList.toggle("isOn", !isEntriesMode);
      rangeModeDay.setAttribute("aria-pressed", String(!isEntriesMode));
    }
    const analyseBtn = ui.root.querySelector('[data-history-action="analyse"]') as HTMLButtonElement | null;
    if (analyseBtn) {
      const hasHistoryEntitlement = ctx.hasEntitlement("advancedHistory");
      const canAnalyse = hasHistoryEntitlement && state.lockedAbsIndexes.size >= 2;
      analyseBtn.classList.toggle("isDisabled", !canAnalyse);
      analyseBtn.disabled = !hasHistoryEntitlement;
      analyseBtn.setAttribute("aria-disabled", String(!canAnalyse));
      analyseBtn.title = !hasHistoryEntitlement ? "Pro feature: Analysis" : canAnalyse ? "Analysis" : "Lock at least 2 columns to analyse";
    }
    const manageBtn = ui.root.querySelector('[data-history-action="manage"]') as HTMLButtonElement | null;
    if (manageBtn) {
      manageBtn.disabled = false;
      manageBtn.setAttribute("aria-disabled", "false");
      manageBtn.title = "Manage";
    }
    const pinBtn = ui.root.querySelector('[data-history-action="pin"]') as HTMLButtonElement | null;
    if (pinBtn) {
      const hasHistoryEntitlement = ctx.hasEntitlement("advancedHistory");
      pinBtn.disabled = !hasHistoryEntitlement;
      pinBtn.setAttribute("aria-disabled", String(!hasHistoryEntitlement));
      pinBtn.title = hasHistoryEntitlement ? pinBtn.title : "Pro feature: Pin chart";
    }
    return true;
  }

  function openHistoryAnalysisModal(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.lockedAbsIndexes.size < 2) return;
    const display = getHistoryDisplayForTask(taskId, state);
    if (!display.length) return;
    const selected = Array.from(state.lockedAbsIndexes.values()).sort((a, b) => a - b).map((idx) => display[idx]).filter(Boolean);
    if (selected.length < 2) return;

    const totalMs = selected.reduce((sum, e: any) => sum + Math.max(0, +e.ms || 0), 0);
    const avgMs = Math.floor(totalMs / selected.length);
    const minMs = Math.min(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const maxMs = Math.max(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const firstTs = Math.min(...selected.map((e: any) => +e.ts || 0));
    const lastTs = Math.max(...selected.map((e: any) => +e.ts || 0));
    const task = ctx.getTasks().find((t) => String(t.id || "") === String(taskId));
    const taskName = (task?.name || "Task").trim() || "Task";
    const modeLabel = state.rangeMode === "day" ? "Day" : "Entries";

    if (els.historyAnalysisTitle) els.historyAnalysisTitle.textContent = `History Analysis - ${taskName}`;
    if (els.historyAnalysisSummary) {
      els.historyAnalysisSummary.innerHTML = `
        <p style="margin:0 0 8px">Selected columns: <b>${selected.length}</b> (${modeLabel} view)</p>
        <p style="margin:0 0 8px">Total time: <b>${ctx.formatTime(totalMs)}</b></p>
        <p style="margin:0 0 8px">Average: <b>${ctx.formatTime(avgMs)}</b></p>
        <p style="margin:0 0 8px">Min / Max: <b>${ctx.formatTime(minMs)}</b> / <b>${ctx.formatTime(maxMs)}</b></p>
        <p style="margin:0">Range: <b>${ctx.formatDateTime(firstTs)}</b> to <b>${ctx.formatDateTime(lastTs)}</b></p>
      `;
    }
    ctx.openOverlay(els.historyAnalysisOverlay as HTMLElement | null);
  }

  function openHistory(i: number) {
    const t = ctx.getTasks()[i];
    if (!t) return;
    const taskId = String(t.id || "");
    if (ctx.getOpenHistoryTaskIds().has(taskId)) {
      closeHistory(taskId);
      return;
    }
    const state = ensureHistoryViewState(taskId);
    clearHistoryRevealTimer(state);
    clearHistoryBarRevealAnimation(state);
    clearHistoryLayoutRetry(state);
    ctx.getOpenHistoryTaskIds().add(taskId);
    const reducedMotion = prefersReducedMotion();
    state.revealPhase = reducedMotion ? "open" : "opening";
    state.barRevealProgress = reducedMotion ? 1 : 0;
    ctx.render();
    renderAllOpenHistoryChartsAfterLayout();
    renderAllOpenHistoryChartsAfterLayout(32);
    scheduleHistoryOpenSettledRenders(taskId);
    if (reducedMotion) return;
    startHistoryBarRevealAnimation(taskId);
    queueHistoryRevealTimer(state, HISTORY_REVEAL_OPEN_MS, () => {
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
      const nextState = ctx.getHistoryViewByTaskId()[taskId];
      if (!nextState) return;
      nextState.revealPhase = "open";
      ctx.render();
      renderAllOpenHistoryChartsAfterLayout();
      renderAllOpenHistoryChartsAfterLayout(32);
      scheduleHistoryOpenSettledRenders(taskId);
    });
  }

  function closeHistory(taskId?: string) {
    if (!taskId || ctx.getHistoryEntryNoteAnchorTaskId() === taskId) closeHistoryEntryNoteOverlay();
    const reducedMotion = prefersReducedMotion();
    if (taskId) {
      const historyViewByTaskId = ctx.getHistoryViewByTaskId();
      const state = historyViewByTaskId[taskId];
      if (state?.selectionClearTimer != null) window.clearTimeout(state.selectionClearTimer);
      if (state?.selectionAnimRaf != null) window.cancelAnimationFrame(state.selectionAnimRaf);
      clearHistoryBarRevealAnimation(state);
      ctx.getOpenHistoryTaskIds().delete(taskId);
      if (!state || reducedMotion) {
        clearHistoryRevealTimer(state);
        clearHistoryLayoutRetry(state);
        clearHistoryCanvasResizeObserver(taskId);
        delete historyViewByTaskId[taskId];
      } else {
        state.revealPhase = "closing";
        queueHistoryRevealTimer(state, HISTORY_REVEAL_CLOSE_MS, () => {
          const nextState = historyViewByTaskId[taskId];
          if (!nextState || nextState.revealPhase !== "closing") return;
          if (nextState.selectionClearTimer != null) window.clearTimeout(nextState.selectionClearTimer);
          if (nextState.selectionAnimRaf != null) window.cancelAnimationFrame(nextState.selectionAnimRaf);
          clearHistoryLayoutRetry(nextState);
          clearHistoryCanvasResizeObserver(taskId);
          delete historyViewByTaskId[taskId];
          ctx.render();
        });
      }
    } else {
      ctx.getOpenHistoryTaskIds().clear();
      const historyViewByTaskId = ctx.getHistoryViewByTaskId();
      Object.keys(historyViewByTaskId).forEach((k) => {
        const state = historyViewByTaskId[k];
        if (state?.selectionClearTimer != null) window.clearTimeout(state.selectionClearTimer);
        if (state?.selectionAnimRaf != null) window.cancelAnimationFrame(state.selectionAnimRaf);
        clearHistoryBarRevealAnimation(state);
        clearHistoryRevealTimer(state);
        clearHistoryLayoutRetry(state);
        clearHistoryCanvasResizeObserver(k);
        delete historyViewByTaskId[k];
      });
    }
    ctx.render();
  }

  function registerHistoryInlineEvents() {
    ctx.on(window, "resize", () => {
      refreshHistoryEntryNoteOverlayPosition();
    });
    ctx.on(
      window,
      "scroll",
      () => {
        refreshHistoryEntryNoteOverlayPosition();
      },
      { passive: true, capture: true }
    );
    ctx.on(
      document,
      "click",
      (e: any) => {
        if (!isHistoryEntryNoteOverlayOpen()) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest?.("#historyEntryNoteOverlay")) return;
        if (isHistoryChartInteractionTarget(target)) return;
        closeHistoryEntryNoteOverlay();
      },
      { capture: true }
    );
    ctx.on(document, "click", (e: any) => {
      const copyBtn = findDelegatedElement(e.target, "[data-history-note-copy]") as HTMLButtonElement | null;
      if (!copyBtn) return;
      const text = String(copyBtn.getAttribute("data-history-note-copy") || "");
      void copyTextToClipboard(text).then((ok) => {
        const prev = copyBtn.textContent || "Copy";
        copyBtn.textContent = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          copyBtn.textContent = prev === "Copied" || prev === "Copy failed" ? "Copy" : prev;
        }, 1200);
      });
    });
    ctx.on(document, "click", (e: any) => {
      const deleteBtn = findDelegatedElement(
        e.target,
        '[data-history-summary-action="delete-session"]'
      ) as HTMLButtonElement | null;
      if (!deleteBtn) return;
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.style.display === "none") return;
      if (overlay.dataset.historyEntryEditing === "true") return;

      const taskId = String(deleteBtn.getAttribute("data-history-summary-task-id") || "").trim();
      const ts = Math.floor(Number(deleteBtn.getAttribute("data-history-summary-ts") || 0));
      const ms = Math.max(0, Math.floor(Number(deleteBtn.getAttribute("data-history-summary-ms") || 0)));
      const name = String(deleteBtn.getAttribute("data-history-summary-name") || "").trim();
      if (!taskId || ts <= 0 || !name) return;

      const state = ensureHistoryViewState(taskId);
      const deleteAbsIndex = findHistoryEntryIndexByIdentity(getHistoryForTask(taskId), { ts, ms, name });
      if (deleteAbsIndex < 0) return;
      const entry = getHistoryForTask(taskId)[deleteAbsIndex] as any;
      if (!entry || entry?.isLiveSession) return;

      ctx.confirm("Delete Session Entry", `Delete this session entry (${ctx.formatTime(entry.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          deleteHistoryEntryByAbsIndex(taskId, state, deleteAbsIndex);
          ctx.closeConfirm();
        },
      });
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isDeleteTaskConfirm");
    });
    ctx.on(els.historyEntryNoteEditBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "inline" || overlay.dataset.historyEntryEditable !== "true") return;
      if (els.historyEntryNoteInput) els.historyEntryNoteInput.focus();
      syncHistoryEntryNoteEditorUi(true);
      refreshHistoryEntryNoteOverlayPosition();
    });
    ctx.on(els.historyEntryNoteCancelBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "inline") return;
      if (els.historyEntryNoteInput) els.historyEntryNoteInput.value = String(overlay.dataset.historyEntryNote || "");
      syncHistoryEntryNoteEditorUi(false);
      refreshHistoryEntryNoteOverlayPosition();
    });
    ctx.on(els.historyEntryNoteSaveBtn, "click", () => {
      saveHistoryEntryOverlayNote();
    });

    ctx.on(els.taskList, "click", (ev: any) => {
      const rangeToggle = findDelegatedElement(ev.target, "[data-history-range-toggle]");
      if (rangeToggle) {
        const taskEl = rangeToggle.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        state.rangeDays = state.rangeDays === 14 ? 7 : 14;
        saveHistoryRangePref(taskId, state.rangeDays);
        state.page = 0;
        renderHistory(taskId);
        return;
      }
      const rangeModeBtn = findDelegatedElement(ev.target, "[data-history-range-mode]");
      if (rangeModeBtn) {
        const taskEl = rangeModeBtn.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        const mode = rangeModeBtn.getAttribute("data-history-range-mode");
        state.rangeMode = mode === "day" ? "day" : "entries";
        saveHistoryRangeModePref(taskId, state.rangeMode);
        renderHistory(taskId);
        return;
      }

      const delegatedAction = getDelegatedAction(ev.target, "data-history-action");
      if (!delegatedAction) return;
      const { element: btn, action } = delegatedAction;
      const taskEl = btn.closest?.(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      const actionHandlers: Record<string, () => void> = {
        pin: () => {
          if (!ctx.hasEntitlement("advancedHistory")) {
            ctx.showUpgradePrompt("Pinned history charts", "pro");
            return;
          }
          const nextPinned = new Set(ctx.getPinnedHistoryTaskIds());
          if (nextPinned.has(taskId)) nextPinned.delete(taskId);
          else nextPinned.add(taskId);
          ctx.setPinnedHistoryTaskIds(nextPinned);
          ctx.savePinnedHistoryTaskIds();
          if (nextPinned.has(taskId)) ctx.getOpenHistoryTaskIds().add(taskId);
          ctx.render();
        },
        close: () => {
          resetHistoryChartSelectionToDefault(taskId);
          closeHistory(taskId);
        },
        edit: () => {
          state.editMode = !state.editMode;
          renderHistory(taskId);
        },
        older: () => {
          state.slideDir = "left";
          state.page += 1;
          renderHistory(taskId);
        },
        newer: () => {
          state.slideDir = "right";
          state.page = Math.max(0, state.page - 1);
          renderHistory(taskId);
        },
        manage: () => {
          ctx.navigateToAppRoute(`/history-manager?taskId=${encodeURIComponent(taskId)}&returnTo=tasks`);
        },
        analyse: () => {
          if (!ctx.hasEntitlement("advancedHistory")) {
            ctx.showUpgradePrompt("Inline history analysis", "pro");
            return;
          }
          if (state.lockedAbsIndexes.size < 2) return;
          openHistoryAnalysisModal(taskId);
        },
        viewSummary: () => {
          const selectedEntries = getCurrentHistorySummarySelection(taskId, state);
          if (!selectedEntries.length) return;
          openHistoryEntryNoteOverlay(taskId, selectedEntries);
        },
        clearLocks: () => {
          clearHistoryLockedSelections(taskId);
          renderHistory(taskId);
        },
      };
      if (action !== "delete") {
        actionHandlers[action]?.();
        if (Object.prototype.hasOwnProperty.call(actionHandlers, action)) return;
      }
      const lockedList = Array.from(state.lockedAbsIndexes.values());
      const deleteAbsIndex = state.selectedAbsIndex != null ? state.selectedAbsIndex : lockedList[lockedList.length - 1] ?? null;
      if (action !== "delete" || deleteAbsIndex == null) return;

      const all = getHistoryForTask(taskId);
      const e = all[deleteAbsIndex] as any;
      if (!e) return;

      ctx.confirm("Delete Log Entry", `Delete this entry (${ctx.formatTime(e.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          deleteHistoryEntryByAbsIndex(taskId, state, deleteAbsIndex);
          ctx.closeConfirm();
        },
      });
    });

    let swipeSuppressClickTaskId = "";
    ctx.on(els.taskList, "click", (ev: any) => {
      const chartTarget = getHistoryChartTarget(ev.target);
      if (!chartTarget) return;
      const { taskId, wrap } = chartTarget;
      if (swipeSuppressClickTaskId && swipeSuppressClickTaskId === taskId) {
        swipeSuppressClickTaskId = "";
        ev.preventDefault?.();
        ev.stopPropagation?.();
        return;
      }
      const state = ensureHistoryViewState(taskId);
      const rect = wrap.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let hit: any = null;
      for (let i = 0; i < state.barRects.length; i++) {
        const r = state.barRects[i];
        if (!r) continue;
        const hx = typeof r.hitX === "number" ? r.hitX : r.x;
        const hy = typeof r.hitY === "number" ? r.hitY : r.y;
        const hw = typeof r.hitW === "number" ? r.hitW : r.w;
        const hh = typeof r.hitH === "number" ? r.hitH : r.h;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) {
          hit = { rel: i, abs: r.absIndex };
          break;
        }
      }
      if (!hit) {
        for (let i = 0; i < state.labelHitRects.length; i++) {
          const r = state.labelHitRects[i];
          if (!r) continue;
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            hit = { rel: i, abs: r.absIndex };
            break;
          }
        }
      }

      if (hit) {
        const isSameTransient = state.selectedAbsIndex != null && state.selectedAbsIndex === hit.abs;
        const isSameLocked = state.lockedAbsIndexes.has(hit.abs);
        if (isSameLocked) {
          state.lockedAbsIndexes.delete(hit.abs);
          syncHistoryEntryNoteOverlayForSelection(taskId, state);
          const ui = getHistoryUi(taskId);
          const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
          if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
        } else if (isSameTransient) {
          state.lockedAbsIndexes.add(hit.abs);
          if (state.selectionClearTimer != null) {
            window.clearTimeout(state.selectionClearTimer);
            state.selectionClearTimer = null;
          }
          state.selectedRelIndex = null;
          state.selectedAbsIndex = null;
          startHistorySelectionAnimation(taskId, null);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
        } else {
          state.selectedRelIndex = hit.rel;
          state.selectedAbsIndex = hit.abs;
          startHistorySelectionAnimation(taskId, hit.abs);
          scheduleHistorySelectionClear(taskId);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
        }
      } else {
        clearHistoryChartSelection(taskId);
        const ui = getHistoryUi(taskId);
        const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
        if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
      }
      renderHistory(taskId);
    });

    let swipeStartX: number | null = null;
    let swipeStartY: number | null = null;
    let swipeLastX: number | null = null;
    let swipeLastY: number | null = null;
    let swipeWrap: HTMLElement | null = null;
    let swipeTaskId = "";
    let swipeGestureActive = false;
    let swipeConsumed = false;
    const swipeThresholdPx = 24;
    const swipeVerticalTolerancePx = 96;
    const clearHistorySwipeState = () => {
      swipeStartX = null;
      swipeStartY = null;
      swipeLastX = null;
      swipeLastY = null;
      swipeWrap = null;
      swipeTaskId = "";
      swipeGestureActive = false;
      swipeConsumed = false;
    };

    const beginHistorySwipe = (wrap: HTMLElement | null, startX: number, startY: number) => {
      if (!wrap) return;
      swipeWrap = wrap;
      swipeTaskId = wrap.closest(".task")?.getAttribute("data-task-id") || "";
      swipeStartX = startX;
      swipeStartY = startY;
      swipeLastX = startX;
      swipeLastY = startY;
      swipeGestureActive = true;
      swipeConsumed = false;
    };

    const applyHistorySwipe = (taskId: string, dx: number) => {
      if (!taskId) return false;
      const state = ensureHistoryViewState(taskId);
      const display = getHistoryDisplayForTask(taskId, state);
      const pageSize = historyPageSize(taskId);
      const maxPage = Math.max(0, Math.ceil(display.length / pageSize) - 1);

      if (dx > 0) {
        if (state.page >= maxPage) return false;
        state.slideDir = "left";
        state.page += 1;
      } else {
        if (state.page <= 0) return false;
        state.slideDir = "right";
        state.page = Math.max(0, state.page - 1);
      }

      swipeSuppressClickTaskId = taskId;
      renderHistory(taskId);
      return true;
    };

    const updateHistorySwipe = (nextX: number, nextY: number, ev?: { preventDefault?: () => void } | null) => {
      if (!swipeGestureActive || swipeStartX === null || swipeStartY === null) return;
      swipeLastX = nextX;
      swipeLastY = nextY;
      if (swipeConsumed) return;
      const dx = nextX - swipeStartX;
      const dy = nextY - swipeStartY;
      if (Math.abs(dx) < swipeThresholdPx) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dy) > swipeVerticalTolerancePx) return;

      swipeConsumed = true;
      const taskId = swipeTaskId || swipeWrap?.closest(".task")?.getAttribute("data-task-id") || "";
      if (taskId) {
        swipeSuppressClickTaskId = taskId;
      }
      ev?.preventDefault?.();
      if (applyHistorySwipe(taskId, dx)) return;
    };

    const runHistorySwipe = (endX?: number | null, endY?: number | null) => {
      if (!swipeWrap || !swipeGestureActive) {
        clearHistorySwipeState();
        return;
      }
      const startX = swipeStartX;
      const startY = swipeStartY;
      const resolvedEndX = typeof endX === "number" ? endX : swipeLastX;
      const resolvedEndY = typeof endY === "number" ? endY : swipeLastY;
      const currentWrap = swipeWrap;
      const taskId = swipeTaskId || currentWrap.closest(".task")?.getAttribute("data-task-id") || "";
      clearHistorySwipeState();
      if (startX === null || startY === null || resolvedEndX == null || resolvedEndY == null) return;
      if (!taskId) return;

      const dx = resolvedEndX - startX;
      const dy = resolvedEndY - startY;
      const isHorizontalSwipe =
        Math.abs(dx) >= swipeThresholdPx && Math.abs(dx) > Math.abs(dy) && Math.abs(dy) <= swipeVerticalTolerancePx;
      if (!isHorizontalSwipe) return;
      swipeSuppressClickTaskId = taskId;
      applyHistorySwipe(taskId, dx);
    };

    ctx.on(els.taskList, "mousedown", (e: any) => {
      const wrap = e.target?.closest?.(".historyCanvasWrap") || null;
      if (!wrap) return;
      if (e.button !== 0) return;
      beginHistorySwipe(wrap, e.clientX, e.clientY);
    });
    ctx.on(window, "mousemove", (e: any) => {
      if (!swipeGestureActive) return;
      updateHistorySwipe(e.clientX, e.clientY, e);
    });
    ctx.on(window, "mouseup", (e: any) => {
      if (!swipeGestureActive) return;
      runHistorySwipe(e.clientX, e.clientY);
    });

    ctx.on(
      els.taskList,
      "touchstart",
      (e: any) => {
        const wrap = e.target?.closest?.(".historyCanvasWrap") || null;
        if (!wrap) return;
        if (!e.touches || !e.touches.length) return;
        beginHistorySwipe(wrap, e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    ctx.on(
      window,
      "touchmove",
      (e: any) => {
        if (!swipeGestureActive) return;
        const t = e.touches && e.touches[0] ? e.touches[0] : null;
        if (!t) return;
        updateHistorySwipe(t.clientX, t.clientY, e);
      },
      { passive: false }
    );
    ctx.on(
      window,
      "touchend",
      (e: any) => {
        if (!swipeGestureActive) return;
        const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
        if (!t) {
          clearHistorySwipeState();
          return;
        }
        runHistorySwipe(t.clientX, t.clientY);
      },
      { passive: true }
    );
    ctx.on(window, "touchcancel", () => {
      clearHistorySwipeState();
    });

    ctx.on(window, "resize", () => {
      for (const taskId of ctx.getOpenHistoryTaskIds()) {
        renderHistory(taskId);
      }
      if (ctx.getCurrentAppPage() === "dashboard") {
        ctx.renderDashboardWidgets();
      }
    });
  }

  return {
    registerHistoryInlineEvents,
    getHistoryEntryNote,
    saveHistoryRangePref,
    saveHistoryRangeModePref,
    openHistory,
    closeHistory,
    getHistoryForTask,
    historyPageSize,
    ensureHistoryViewState,
    startHistorySelectionAnimation,
    scheduleHistorySelectionClear,
    clearHistoryChartSelection,
    resetHistoryChartSelectionToDefault,
    resetAllOpenHistoryChartSelections,
    clearHistoryLockedSelections,
    getHistoryUi,
    renderHistory,
    getHistoryDisplayForTask,
    openHistoryAnalysisModal,
    openHistoryEntryNoteOverlay,
    syncHistoryEntryNoteOverlayForSelection,
    isHistoryEntryNoteOverlayOpen,
    isHistoryChartInteractionTarget,
    closeHistoryEntryNoteOverlay,
    copyTextToClipboard,
    clearHistoryEntryNoteOverlayPosition,
    refreshHistoryEntryNoteOverlayPosition,
  };
}

export function findTaskTimerHistoryEntryIndexByIdentity(entries: any[], identity: { ts: number; ms: number; name: string }) {
  return entries.findIndex(
    (entry: any) =>
      Number(entry?.ts) === identity.ts &&
      Number(entry?.ms) === identity.ms &&
      String(entry?.name || "").trim() === identity.name
  );
}
