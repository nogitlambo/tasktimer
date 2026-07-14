import type { HistoryViewState } from "./types";
import type { TaskTimerHistoryInlineContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
import { playDeleteAlertAudio } from "./delete-alert-audio";
import { createHistoryEntrySummaryInteraction } from "./history-entry-summary-interaction";
import {
  createHistoryInlineSelectionSession,
  type HistoryInlineDeleteResolution,
  type HistoryInlineSelectionRow,
  type HistoryInlineSelectionSession,
  type HistoryInlineSelectionView,
} from "./history-inline-selection-interaction";
import { isRichNoteFileInputTarget } from "./rich-session-notes";
import { TASKTIMER_OVERLAY_CLOSED_EVENT } from "./xp-award-events";
import { clearStaleTaskTimeGoalCompletionForPeriod } from "../lib/timeGoalCompletion";

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
  const HISTORY_REVEAL_OPEN_MS = 720;
  const HISTORY_REVEAL_SPACE_OPEN_MS = 260;
  const HISTORY_REVEAL_CONTENT_OPEN_MS = HISTORY_REVEAL_OPEN_MS - HISTORY_REVEAL_SPACE_OPEN_MS;
  const HISTORY_REVEAL_CLOSE_MS = 480;
  const HISTORY_REVEAL_CONTENT_CLOSE_MS = 240;
  const HISTORY_REVEAL_SPACE_CLOSE_MS = HISTORY_REVEAL_CLOSE_MS - HISTORY_REVEAL_CONTENT_CLOSE_MS;
  const HISTORY_LAYOUT_RETRY_MAX_FRAMES = 12;
  const HISTORY_OPEN_SCROLL_CHECK_DELAYS_MS = [0, 120, 280, HISTORY_REVEAL_OPEN_MS + 32] as const;
  const HISTORY_OPEN_SCROLL_VIEWPORT_PADDING_PX = 12;
  const HISTORY_INLINE_CHART_LABEL_COLOR = "#fff";
  const { sharedTasks } = ctx;
  const historyCanvasResizeObservers = new Map<string, { observer: ResizeObserver; element: HTMLElement }>();
  const historyInlineSelectionSessions = new Map<string, HistoryInlineSelectionSession>();
  let suppressHistoryEntryNoteClosedEvent = false;

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

  function syncHistoryRevealPhaseDom(taskId: string, revealPhase: HistoryViewState["revealPhase"]) {
    if (!els.taskList) return;
    const taskEl = els.taskList.querySelector(`.task[data-task-id="${taskId}"]`) as HTMLElement | null;
    if (!taskEl) return;
    const isOpeningSpace = revealPhase === "openingSpace";
    const isOpening = revealPhase === "opening";
    const isClosing = revealPhase === "closing";
    const isClosingSpace = revealPhase === "closingSpace";
    const isOpen = revealPhase === "open";
    taskEl.classList.toggle("taskHistoryOpeningSpace", isOpeningSpace);
    taskEl.classList.toggle("taskHistoryOpening", isOpening);
    taskEl.classList.toggle("taskHistoryClosing", isClosing);
    taskEl.classList.toggle("taskHistoryClosingSpace", isClosingSpace);
    taskEl.classList.remove("taskHistoryCollapsingSpace");
    taskEl.classList.toggle("taskHistoryOpen", isOpen);
    const historyInline = taskEl.querySelector(".historyInlineMotion") as HTMLElement | null;
    historyInline?.classList.toggle("isOpeningSpace", isOpeningSpace);
    historyInline?.classList.toggle("isOpening", isOpening);
    historyInline?.classList.toggle("isClosing", isClosing);
    historyInline?.classList.toggle("isClosingSpace", isClosingSpace);
    historyInline?.classList.toggle("isOpen", isOpen);
    const revealBtn = taskEl.querySelector(".taskHistoryReveal") as HTMLElement | null;
    revealBtn?.classList.toggle("isOpeningSpace", isOpeningSpace);
    revealBtn?.classList.toggle("isOpening", isOpening);
    revealBtn?.classList.toggle("isClosing", isClosing);
    revealBtn?.classList.toggle("isClosingSpace", isClosingSpace);
    revealBtn?.classList.toggle("isOpen", isOpen);
  }

  function startHistoryCloseContentDom(taskId: string) {
    if (!els.taskList) return;
    const taskEl = els.taskList.querySelector(`.task[data-task-id="${taskId}"]`) as HTMLElement | null;
    if (!taskEl) return;
    taskEl.classList.remove("taskHistoryOpeningSpace", "taskHistoryOpening", "taskHistoryClosing", "taskHistoryClosingSpace");
    taskEl.classList.add("taskHistoryOpen");
    const historyInline = taskEl.querySelector(".historyInlineMotion") as HTMLElement | null;
    historyInline?.classList.remove("isOpeningSpace", "isOpening", "isClosingSpace", "isOpen");
    historyInline?.classList.add("isClosing");
    const revealBtn = taskEl.querySelector(".taskHistoryReveal") as HTMLElement | null;
    revealBtn?.classList.remove("isOpeningSpace", "isOpening", "isClosingSpace", "isOpen");
    revealBtn?.classList.add("isClosing");
  }

  function startHistoryCloseSpaceDom(taskId: string) {
    if (!els.taskList) return;
    const taskEl = els.taskList.querySelector(`.task[data-task-id="${taskId}"]`) as HTMLElement | null;
    if (!taskEl) return;
    taskEl.classList.remove("taskHistoryOpeningSpace", "taskHistoryOpening", "taskHistoryClosing", "taskHistoryOpen");
    taskEl.classList.add("taskHistoryCollapsingSpace");
    const historyInline = taskEl.querySelector(".historyInlineMotion") as HTMLElement | null;
    historyInline?.classList.remove("isOpeningSpace", "isOpening", "isClosing", "isOpen");
    historyInline?.classList.add("isClosingSpace");
    const revealBtn = taskEl.querySelector(".taskHistoryReveal") as HTMLElement | null;
    revealBtn?.classList.remove("isOpeningSpace", "isOpening", "isClosing", "isOpen");
    revealBtn?.classList.add("isClosingSpace");
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

  function getHistoryVisibleViewportBounds() {
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    const footer = document.querySelector("#app[aria-label='TaskLaunch App'] .appFooterNav") as HTMLElement | null;
    const footerStyle = footer ? window.getComputedStyle(footer) : null;
    const footerRect = footer?.getBoundingClientRect();
    const visibleFooter =
      !!footer &&
      footerStyle?.display !== "none" &&
      footerStyle?.visibility !== "hidden" &&
      !!footerRect &&
      footerRect.height > 0 &&
      footerRect.top < viewportHeight &&
      footerRect.bottom > 0;
    const bottom = Math.max(
      HISTORY_OPEN_SCROLL_VIEWPORT_PADDING_PX,
      (visibleFooter ? Math.min(viewportHeight, footerRect.top) : viewportHeight) - HISTORY_OPEN_SCROLL_VIEWPORT_PADDING_PX
    );
    return {
      top: HISTORY_OPEN_SCROLL_VIEWPORT_PADDING_PX,
      bottom,
    };
  }

  function scrollHistoryInlineIntoViewIfNeeded(taskId: string) {
    if (ctx.getCurrentAppPage() !== "tasks") return;
    if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
    const target = getHistoryUi(taskId)?.root;
    if (!target || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const { top, bottom } = getHistoryVisibleViewportBounds();
    if (rect.top >= top && rect.bottom <= bottom) return;

    const block: ScrollLogicalPosition = rect.height > bottom - top || rect.top < top ? "start" : "end";
    try {
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block,
        inline: "nearest",
      });
    } catch {
      target.scrollIntoView();
    }
  }

  function scheduleHistoryOpenScrollIntoView(taskId: string) {
    for (const delayMs of HISTORY_OPEN_SCROLL_CHECK_DELAYS_MS) {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          scrollHistoryInlineIntoViewIfNeeded(taskId);
        });
      }, delayMs);
    }
  }

  function renderHistoryChartAfterLayout(taskId: string) {
    window.requestAnimationFrame(() => {
      if (ctx.getCurrentAppPage() !== "tasks") return;
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
      renderHistory(taskId);
    });
  }

  function queueHistoryRevealTimer(state: HistoryViewState, delayMs: number, callback: () => void) {
    clearHistoryRevealTimer(state);
    state.revealTimer = window.setTimeout(() => {
      state.revealTimer = null;
      callback();
    }, delayMs);
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

  function getHistoryInlineSelectionSession(taskId: string) {
    const existing = historyInlineSelectionSessions.get(taskId);
    if (existing) return existing;
    const created = createHistoryInlineSelectionSession(taskId);
    historyInlineSelectionSessions.set(taskId, created);
    return created;
  }

  function resolveHistoryEntryTarget(taskId: string, historyTargetKey: string) {
    const resolution = getHistoryInlineSelectionSession(taskId).resolveEntryTarget(
      historyTargetKey,
      getHistoryForTask(taskId)
    );
    return resolution.kind === "resolved" && !resolution.entry.isLiveSession ? resolution.entry : null;
  }

  function refreshHistoryInlineSelectionView(taskId: string, state?: HistoryViewState | null) {
    const nextState = state || ensureHistoryViewState(taskId);
    return getHistoryInlineSelectionSession(taskId).refresh({
      entries: getHistoryForTask(taskId),
      mode: nextState.rangeMode === "day" ? "day" : "entries",
      nowMs: ctx.nowMs(),
      analysisEntitled: ctx.hasEntitlement("advancedHistory"),
    });
  }

  function historyInlineDisplayValue(taskId: string, row: HistoryInlineSelectionRow) {
    if (row.kind !== "day") return row.value;
    const historyTask = ctx.getTasks().find((task) => String(task.id || "") === String(taskId));
    return {
      ...row.value,
      ...(historyTask ? { color: ctx.historyEntryColorForTaskMs(historyTask as any, Math.max(0, Number(row.value.ms || 0))) } : {}),
    };
  }

  function getFinalizedHistoryByTaskId() {
    const projected = ctx.getHistoryByTaskId();
    const next: Record<string, any[]> = {};
    Object.keys(projected || {}).forEach((taskId) => {
      const arr = Array.isArray(projected?.[taskId]) ? projected[taskId] : [];
      next[taskId] = arr.filter((entry: any) => !entry?.isLiveSession);
    });
    return next;
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
      selectionClearTimer: null,
      visualSelectedRenderKey: null,
      selectionZoom: 1,
      selectionAnimRaf: null,
      slideDir: null,
    };
    historyViewByTaskId[taskId] = created;
    return created;
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

  function startHistorySelectionAnimation(taskId: string, nextRenderKey: string | null) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }
    clearHistoryBarRevealAnimation(state);
    clearHistoryLayoutRetry(state);

    const previousRenderKey = state.visualSelectedRenderKey;
    const switchingTarget = previousRenderKey !== nextRenderKey;
    const fromZoom = switchingTarget ? (nextRenderKey == null ? state.selectionZoom : 1) : state.selectionZoom;
    const toZoom = nextRenderKey == null ? 1 : 1.5;
    const durationMs = 180;
    const startAt = performance.now();

    if (nextRenderKey != null) state.visualSelectedRenderKey = nextRenderKey;

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
        if (nextRenderKey == null) state.visualSelectedRenderKey = null;
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
      refreshHistoryInlineSelectionView(taskId, next).clear("transient");
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
    refreshHistoryInlineSelectionView(taskId, state).clear("all");
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
    refreshHistoryInlineSelectionView(taskId, state).clear("all");
    state.visualSelectedRenderKey = null;
    state.selectionZoom = 1;
    if (ctx.getHistoryEntryNoteAnchorTaskId() === taskId) closeHistoryEntryNoteOverlay();
    if (ctx.getCurrentAppPage() === "tasks" && ctx.getOpenHistoryTaskIds().has(taskId)) renderHistory(taskId);
  }

  function resetAllOpenHistoryChartSelections() {
    Array.from(ctx.getOpenHistoryTaskIds()).forEach((taskId) => {
      resetHistoryChartSelectionToDefault(taskId);
    });
  }

  function closeUnpinnedOpenHistoryCharts() {
    Array.from(ctx.getOpenHistoryTaskIds()).forEach((taskId) => {
      if (ctx.getPinnedHistoryTaskIds().has(taskId)) return;
      closeHistory(taskId);
    });
  }

  function clearHistoryLockedSelections(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    refreshHistoryInlineSelectionView(taskId, state).clear("locks");
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
    return historyEntrySummaryInteraction.isOpen();
  }

  const historyEntrySummaryInteraction = createHistoryEntrySummaryInteraction({
    owner: "inline",
    elements: {
      overlay: els.historyEntryNoteOverlay as HTMLElement | null,
      title: els.historyEntryNoteTitle as HTMLElement | null,
      meta: els.historyEntryNoteMeta as HTMLElement | null,
      body: els.historyEntryNoteBody as HTMLElement | null,
      editor: els.historyEntryNoteEditor as HTMLElement | null,
      input: els.historyEntryNoteInput as HTMLElement | null,
      editBtn: els.historyEntryNoteEditBtn as HTMLButtonElement | null,
      cancelBtn: els.historyEntryNoteCancelBtn as HTMLButtonElement | null,
      saveBtn: els.historyEntryNoteSaveBtn as HTMLButtonElement | null,
      saveAndCloseBtn: els.historyEntryNoteSaveAndCloseBtn as HTMLButtonElement | null,
    },
    escapeHtml: ctx.escapeHtmlUI,
    formatDateTime: ctx.formatDateTime,
    formatTwo: ctx.formatTwo,
    getEntryNote: getHistoryEntryNote,
    getTaskById: (taskId) =>
      ctx.getTasks().find((candidate) => String(candidate?.id || "").trim() === String(taskId || "").trim()) || null,
    getEntriesForTask: getHistoryForTask,
    resolveEntryTarget: (taskId, historyTargetKey) => {
      const resolution = getHistoryInlineSelectionSession(taskId).resolveEntryTarget(
        historyTargetKey,
        getHistoryForTask(taskId)
      );
      return resolution.kind === "resolved" ? resolution.entry : null;
    },
    getRewardProgress: () => ctx.getRewardProgress(),
    openOverlay: ctx.openOverlay,
    closeOverlay: ctx.closeOverlay,
    isMobileLayout: () => window.matchMedia?.("(max-width: 640px)")?.matches ?? window.innerWidth <= 640,
  });

  function finalizeInlineHistoryEntryNoteOverlayClose(opts?: { preservePosition?: boolean }) {
    const anchorTaskId = String(ctx.getHistoryEntryNoteAnchorTaskId() || "");
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (overlay?.dataset.historyEntryOwner !== "inline" && !anchorTaskId) return false;
    const shouldResumeTransientClear = !!anchorTaskId;
    historyEntrySummaryInteraction.clearTarget();
    if (!opts?.preservePosition) clearHistoryEntryNoteOverlayPosition();
    if (shouldResumeTransientClear) {
      const state = ctx.getHistoryViewByTaskId()[anchorTaskId];
      if (state && refreshHistoryInlineSelectionView(anchorTaskId, state).selectedRenderKey) {
        scheduleHistorySelectionClear(anchorTaskId);
      }
    }
    return true;
  }

  function closeHistoryEntryNoteOverlay(opts?: { preservePosition?: boolean }) {
    finalizeInlineHistoryEntryNoteOverlayClose(opts);
    suppressHistoryEntryNoteClosedEvent = true;
    try {
      ctx.closeOverlay(els.historyEntryNoteOverlay as HTMLElement | null);
    } finally {
      suppressHistoryEntryNoteClosedEvent = false;
    }
  }

  function isHistoryChartInteractionTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest?.(".historyCanvasWrap");
  }

  function openHistoryEntryNoteOverlay(taskId: string, entries: any[]) {
    const currentEntries = getHistoryForTask(taskId);
    const selectionSession = getHistoryInlineSelectionSession(taskId);
    const summaryEntries = (Array.isArray(entries) ? entries : []).map((entry) => {
      const suppliedTargetKey = String(entry?.historyTargetKey || "");
      const resolution = suppliedTargetKey
        ? selectionSession.resolveEntryTarget(suppliedTargetKey, currentEntries)
        : selectionSession.resolveEntryCandidate(entry, currentEntries);
      if (resolution.kind !== "resolved") {
        return {
          ...entry,
          taskId,
          ts: ctx.normalizeHistoryTimestampMs(entry?.ts),
          historyTargetKey: "",
          historyMutationAllowed: false,
        };
      }
      const historyTargetKey = suppliedTargetKey || ("targetKey" in resolution ? resolution.targetKey : "");
      return {
        ...resolution.entry,
        taskId,
        ts: ctx.normalizeHistoryTimestampMs(resolution.entry.ts),
        historyTargetKey,
        historyMutationAllowed: entry?.historyMutationAllowed !== false && !resolution.entry.isLiveSession,
      };
    });
    if (!historyEntrySummaryInteraction.openSummary(taskId, summaryEntries)) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    const state = ctx.getHistoryViewByTaskId()[taskId];
    if (state?.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    ctx.setHistoryEntryNoteAnchorTaskId(taskId);
    requestAnimationFrame(() => {
      refreshHistoryEntryNoteOverlayPosition();
    });
  }

  function saveHistoryEntryOverlayNote() {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay || overlay.dataset.historyEntryOwner !== "inline" || overlay.dataset.historyEntryEditable !== "true") return;
    const drafts = historyEntrySummaryInteraction.getEditedNoteDrafts();
    const fallbackDraft = {
      taskId: String(overlay.dataset.historyEntryTaskId || "").trim(),
      historyTargetKey: String(overlay.dataset.historyEntryTargetKey || ""),
      ts: Math.floor(Number(overlay.dataset.historyEntryTs || 0)),
      ms: Math.max(0, Math.floor(Number(overlay.dataset.historyEntryMs || 0))),
      name: String(overlay.dataset.historyEntryName || "").trim(),
      note: historyEntrySummaryInteraction.getActiveInputValue().trim(),
    };
    const noteDrafts = drafts.length ? drafts : [fallbackDraft];
    const validDrafts = noteDrafts.filter(
      (draft) => draft.taskId && String(draft.historyTargetKey || "") && draft.ts > 0 && draft.name
    );
    if (!validDrafts.length) return;
    const nextHistory = { ...getFinalizedHistoryByTaskId() };
    const updatedEntries: any[] = [];
    const touchedTaskIds = new Set<string>();
    validDrafts.forEach((draft) => {
      const original = Array.isArray(nextHistory[draft.taskId]) ? nextHistory[draft.taskId] : [];
      const historyTargetKey = String(draft.historyTargetKey || "");
      const resolution = getHistoryInlineSelectionSession(draft.taskId).resolveEntryTarget(historyTargetKey, original);
      if (resolution.kind !== "resolved" || resolution.entry.isLiveSession) return;
      const nextEntry = { ...resolution.entry };
      if (draft.note) nextEntry.note = draft.note;
      else delete nextEntry.note;
      const nextTaskHistory = original.map((entry: any) => (entry === resolution.entry ? nextEntry : entry));
      nextHistory[draft.taskId] = nextTaskHistory;
      updatedEntries.push({ ...nextEntry, taskId: draft.taskId, historyTargetKey });
      touchedTaskIds.add(draft.taskId);
    });
    if (!updatedEntries.length) return;
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);
    ctx.renderDashboardWidgets();
    const reopenTaskId = validDrafts[0]?.taskId || "";
    if (reopenTaskId) openHistoryEntryNoteOverlay(reopenTaskId, updatedEntries);
    touchedTaskIds.forEach((taskId) => renderHistory(taskId));
  }

  function beginInlineHistoryEntryNoteEdit(trigger: HTMLElement | null) {
    if (!String(trigger?.getAttribute("data-history-summary-target-key") || "")) return;
    if (historyEntrySummaryInteraction.beginEdit(trigger)) refreshHistoryEntryNoteOverlayPosition();
  }

  function commitResolvedHistoryDelete(
    taskId: string,
    state: HistoryViewState,
    resolution: Extract<HistoryInlineDeleteResolution, { kind: "resolved" }>,
    opts?: { syncOverlay?: boolean }
  ) {
    const nextHistory = {
      ...getFinalizedHistoryByTaskId(),
      [taskId]: resolution.remainingFinalizedEntries,
    };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory, { allowDestructiveReplace: true });
    const task = ctx.getTasks().find((entry) => String(entry?.id || "").trim() === taskId) || null;
    const clearedCompletion = clearStaleTaskTimeGoalCompletionForPeriod(
      task,
      nextHistory,
      ctx.nowMs(),
      ctx.getWeekStarting()
    );
    if (clearedCompletion) ctx.save({ forceCloudFlush: true });
    const selectionView = refreshHistoryInlineSelectionView(taskId, state);
    if (
      state.visualSelectedRenderKey &&
      !selectionView.rows.some((row) => row.renderKey === state.visualSelectedRenderKey)
    ) {
      startHistorySelectionAnimation(taskId, null);
    }
    if (opts?.syncOverlay !== false) {
      syncHistoryEntryNoteOverlayForSelection(taskId, state);
    }

    const maxPage = Math.max(0, Math.ceil(selectionView.rows.length / historyPageSize(taskId)) - 1);
    state.page = Math.min(state.page, maxPage);
    if (clearedCompletion) ctx.render();
    renderHistory(taskId);
    ctx.renderDashboardWidgets();
    return true;
  }

  function syncHistoryEntryNoteOverlayForSelection(taskId: string, state?: HistoryViewState | null) {
    if (ctx.getHistoryEntryNoteAnchorTaskId() !== taskId) return;
    const nextState = state || ensureHistoryViewState(taskId);
    const selectedEntries = getCurrentHistorySummarySelection(taskId, nextState);
    if (!selectedEntries.length) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    openHistoryEntryNoteOverlay(taskId, selectedEntries);
  }

  function getCurrentHistorySummarySelection(taskId: string, state?: HistoryViewState | null) {
    const nextState = state || ensureHistoryViewState(taskId);
    const selectionView = refreshHistoryInlineSelectionView(taskId, nextState);
    const action = selectionView.actions.summary;
    if (!action.enabled) return [];
    const resolution = action.resolve(getHistoryForTask(taskId));
    if (resolution.kind !== "resolved") return [];
    return resolution.entries.map(({ entry, targetKey }) => ({
      ...entry,
      taskId,
      historyTargetKey: targetKey || "",
      historyMutationAllowed: !!targetKey && !entry.isLiveSession,
    }));
  }

  function getHistoryDisplayForTask(taskId: string, state: HistoryViewState) {
    return refreshHistoryInlineSelectionView(taskId, state).rows.map((row) => historyInlineDisplayValue(taskId, row));
  }

  function renderHistoryTrashRow(rows: HistoryInlineSelectionRow[], ui: HistoryUI) {
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
      const row = rows[i];
      const entry = row?.kind === "entry" ? row.value : null;
      const disabled = !row || !entry || !row.interactive || !!entry.isLiveSession;
      const targetAttr = disabled
        ? ""
        : ` data-history-entry-delete-target="${ctx.escapeHtmlUI(row.renderKey)}"`;

      buttons.push(
        `<button class="historyTrashBtn" type="button"${targetAttr} ${
          disabled ? "disabled" : ""
        } aria-label="Delete log" title="Delete log">&#128465;</button>`
      );
    }

    ui.trashRow.innerHTML = buttons.join("");
  }

  function formatHistoryAxisDuration(msRaw: number) {
    const totalSeconds = Math.max(0, Math.floor((Number(msRaw) || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      const parts = [`${hours}h`];
      if (minutes > 0) parts.push(`${minutes}m`);
      if (seconds > 0) parts.push(`${seconds}s`);
      return parts.join(" ");
    }
    if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    return `${seconds}s`;
  }

  function formatHistoryCheckpointMarkerMinutes(msRaw: number) {
    const totalMinutes = Math.max(0, Math.round((Number(msRaw) || 0) / 60000));
    return `${totalMinutes}m`;
  }

  function parseCanvasRgbColor(color: string) {
    const normalized = String(color || "").trim();
    const rgbMatch = normalized.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (rgbMatch) {
      return {
        r: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1]) || 0))),
        g: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2]) || 0))),
        b: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3]) || 0))),
      };
    }

    const hexMatch = normalized.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const raw = hexMatch[1];
      const hex = raw.length === 3 ? raw.split("").map((part) => `${part}${part}`).join("") : raw;
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }

    return { r: 0, g: 207, b: 200 };
  }

  function shadeCanvasRgbColor(color: string, amount: number) {
    const source = parseCanvasRgbColor(color);
    const mix = amount >= 0 ? 255 : 0;
    const weight = Math.max(-1, Math.min(1, amount));
    const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value + (mix - value) * Math.abs(weight))));
    return `rgb(${channel(source.r)}, ${channel(source.g)}, ${channel(source.b)})`;
  }

  function drawHistoryColumn3d(
    draw: CanvasRenderingContext2D,
    column: { x: number; y: number; w: number; h: number; color: string; depthX: number; depthY: number }
  ) {
    const { x, y, w: columnW, h: columnH, color, depthX, depthY } = column;
    const rightX = x + columnW;
    const bottomY = y + columnH;

    draw.save();
    draw.shadowColor = "rgba(0,0,0,.42)";
    draw.shadowBlur = Math.max(5, Math.min(11, depthX * 1.8));
    draw.shadowOffsetX = Math.max(2, Math.round(depthX * 0.55));
    draw.shadowOffsetY = Math.max(2, Math.round(depthY * 0.75));
    draw.fillStyle = "rgba(0,0,0,.34)";
    draw.beginPath();
    draw.moveTo(x + Math.max(1, depthX * 0.3), bottomY);
    draw.lineTo(rightX + depthX, bottomY - depthY);
    draw.lineTo(rightX + depthX + Math.max(5, depthX * 0.8), bottomY - depthY + Math.max(3, depthY * 0.55));
    draw.lineTo(x + Math.max(5, depthX * 0.9), bottomY + Math.max(3, depthY * 0.55));
    draw.closePath();
    draw.fill();
    draw.restore();

    draw.save();
    draw.fillStyle = shadeCanvasRgbColor(color, -0.42);
    draw.beginPath();
    draw.moveTo(rightX, y);
    draw.lineTo(rightX + depthX, y - depthY);
    draw.lineTo(rightX + depthX, bottomY - depthY);
    draw.lineTo(rightX, bottomY);
    draw.closePath();
    draw.fill();
    draw.restore();

    draw.save();
    const frontGradient = draw.createLinearGradient(0, y, 0, bottomY);
    frontGradient.addColorStop(0, shadeCanvasRgbColor(color, 0.32));
    frontGradient.addColorStop(0.16, shadeCanvasRgbColor(color, 0.12));
    frontGradient.addColorStop(0.72, color);
    frontGradient.addColorStop(1, shadeCanvasRgbColor(color, -0.18));
    draw.fillStyle = frontGradient;
    draw.fillRect(x, y, columnW, columnH);
    draw.fillStyle = "rgba(255,255,255,.18)";
    draw.fillRect(x + 1, y + 1, Math.max(1, Math.min(3, Math.floor(columnW * 0.14))), Math.max(1, columnH - 2));
    draw.restore();

    draw.save();
    const topGradient = draw.createLinearGradient(x, y - depthY, rightX + depthX, y);
    topGradient.addColorStop(0, shadeCanvasRgbColor(color, 0.58));
    topGradient.addColorStop(1, shadeCanvasRgbColor(color, 0.22));
    draw.fillStyle = topGradient;
    draw.beginPath();
    draw.moveTo(x, y);
    draw.lineTo(x + depthX, y - depthY);
    draw.lineTo(rightX + depthX, y - depthY);
    draw.lineTo(rightX, y);
    draw.closePath();
    draw.fill();
    draw.strokeStyle = "rgba(255,255,255,.26)";
    draw.lineWidth = 1;
    draw.beginPath();
    draw.moveTo(x + 0.5, y + 0.5);
    draw.lineTo(x + depthX, y - depthY + 0.5);
    draw.lineTo(rightX + depthX - 0.5, y - depthY + 0.5);
    draw.stroke();
    draw.restore();
  }

  function drawHistoryChart(
    entries: any[],
    ui: HistoryUI,
    taskId: string,
    selectionRows: HistoryInlineSelectionRow[],
    selectionView: HistoryInlineSelectionView
  ) {
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
    let padL = 12;
    const padR = 12;
    const padT = 14;
    const barCount = Math.max(1, entries.length);
    const slotCount = Math.max(1, historyPageSize(taskId));
    const useAngledLabels = true;
    const padB = useAngledLabels ? (veryCompactLabels ? 116 : 128) : compactLabels ? 84 : 72;

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
              label: formatHistoryCheckpointMarkerMinutes(
                Math.max(0, (+m.hours || 0) * sharedTasks.milestoneUnitSec(historyTask) * 1000)
              ),
            }))
            .filter((x, i, arr) => x.ms > 0 && arr.findIndex((y) => y.ms === x.ms) === i)
        : [];
    const timeGoalMs =
      historyTask && historyTask.timeGoalEnabled && Number(historyTask.timeGoalMinutes || 0) > 0
        ? Math.max(0, Number(historyTask.timeGoalMinutes || 0) * 60 * 1000)
        : 0;
    const underGoalPeak = timeGoalMs > 0
      ? entries.reduce(
          (best: { index: number; ms: number } | null, entry, index) => {
            const ms = Math.max(0, Math.floor(Number(entry?.ms || 0) || 0));
            if (ms <= 0 || ms >= timeGoalMs) return best;
            if (!best || ms > best.ms) return { index, ms };
            return best;
          },
          null
        )
      : null;
    const lowestLogged = entries.reduce(
      (best: { index: number; ms: number } | null, entry, index) => {
        const ms = Math.max(0, Math.floor(Number(entry?.ms || 0) || 0));
        if (ms <= 0) return best;
        if (!best || ms < best.ms) return { index, ms };
        return best;
      },
      null
    );
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
    const underGoalPeakLabel = underGoalPeak ? formatHistoryAxisDuration(underGoalPeak.ms) : "";
    const timeGoalAxisLabel = goalMarker ? formatHistoryAxisDuration(goalMarker.ms) : "";
    const lowestLoggedLabel = lowestLogged ? formatHistoryAxisDuration(lowestLogged.ms) : "";
    if (underGoalPeakLabel) {
      padL = Math.max(padL, Math.ceil(draw.measureText(underGoalPeakLabel).width) + 12);
    }
    if (timeGoalAxisLabel) {
      padL = Math.max(padL, Math.ceil(draw.measureText(timeGoalAxisLabel).width) + 12);
    }
    if (lowestLoggedLabel) {
      padL = Math.max(padL, Math.ceil(draw.measureText(lowestLoggedLabel).width) + 12);
    }
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
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
    const yAxisEntryGap = 4;
    const plotW = Math.max(140, innerW - labelGutterW - plotSidePad * 2);
    const plotLeft = padL + plotSidePad;
    const plotRight = plotLeft + plotW;
    const plotEntryLeft = plotLeft + yAxisEntryGap;
    const plotEntryW = Math.max(4, plotRight - plotEntryLeft);

    draw.strokeStyle = "rgba(255,255,255,.20)";
    draw.lineWidth = 1;
    draw.beginPath();
    draw.moveTo(plotLeft + 0.5, padT);
    draw.lineTo(plotLeft + 0.5, padT + innerH);
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
    const gap = slotCount <= 10 ? Math.max(6, Math.floor(plotEntryW * 0.02)) : Math.max(3, Math.floor(plotEntryW * 0.01));
    const barW = Math.max(4, Math.floor((plotEntryW - gap * (slotCount - 1)) / slotCount));
    const columnDepthX = Math.max(3, Math.min(10, Math.round(barW * 0.2)));
    const columnDepthY = Math.max(3, Math.min(8, Math.round(columnDepthX * 0.7)));
    const barTops: Array<{ x: number; y: number; w: number; h: number; ms: number; color: string }> = [];
    const checkpointMarkerColor = String(historyTask?.color || "rgb(0,207,200)");

    draw.textAlign = "center";

    const labelStep = 1;
    for (let idx = 0; idx < barCount; idx++) {
      const e = entries[idx];
      if (!e) continue;

      const ms = Math.max(0, e.ms || 0);
      const ratio = ms / scaleMaxMs;
      const bh = Math.max(2, Math.floor(innerH * ratio));
      const selectionRow = selectionRows[idx];
      const isLocked = selectionRow?.selection === "locked";
      const isSelected = !!selectionRow && state.visualSelectedRenderKey === selectionRow.renderKey;
      const hasSelection = state.visualSelectedRenderKey != null || selectionView.lockedCount > 0;
      const baseX = plotEntryLeft + idx * (barW + gap);
      const cx = baseX + barW / 2;
      const drawW = Math.max(2, Math.floor(barW));
      const barRevealProgress = Math.max(0, Math.min(1, state.barRevealProgress ?? 1));
      const maxColumnH = Math.max(2, innerH - columnDepthY);
      const rawAnimatedBarH = Math.floor(Math.min(bh, maxColumnH) * barRevealProgress);
      const drawH =
        ms > 0 && barRevealProgress > 0
          ? Math.max(2, Math.min(maxColumnH, rawAnimatedBarH))
          : 0;
      const x = Math.max(plotEntryLeft, Math.min(plotRight - drawW - columnDepthX, Math.floor(cx - drawW / 2)));
      const y = drawH > 0 ? Math.max(padT + columnDepthY, padT + innerH - drawH) : padT + innerH;
      const reachesTimeGoal = timeGoalMs > 0 && ms >= timeGoalMs;
      const barColor = reachesTimeGoal ? "rgb(12,245,127)" : String(e.color || "rgb(0,207,200)");
      barTops[idx] = { x, y, w: drawW, h: drawH, ms, color: barColor };

      if (drawH > 0) {
        draw.save();
        draw.globalAlpha = hasSelection ? (isSelected || isLocked ? 0.98 : 0.28) : 0.92;
        drawHistoryColumn3d(draw, {
          x,
          y,
          w: drawW,
          h: drawH,
          color: barColor,
          depthX: columnDepthX,
          depthY: columnDepthY,
        });
        draw.restore();
      }

      const slotLeft = idx === 0 ? plotEntryLeft : plotEntryLeft + idx * (barW + gap) - Math.floor(gap / 2);
      const slotRight = idx === barCount - 1 ? plotRight : plotEntryLeft + (idx + 1) * (barW + gap) - Math.floor(gap / 2);
      state.barRects[idx] = {
        x,
        y,
        w: drawW,
        h: drawH,
        renderKey: selectionRow?.renderKey || "",
        hitX: Math.max(plotEntryLeft, slotLeft),
        hitY: padT,
        hitW: Math.max(4, Math.min(plotRight, slotRight) - Math.max(plotEntryLeft, slotLeft)),
        hitH: innerH,
      };

      if (drawH > 0 && (isSelected || isLocked)) {
        draw.save();
        draw.strokeStyle = isLocked ? "rgba(255,77,77,.95)" : "rgba(255,255,255,.9)";
        draw.lineWidth = 2;
        draw.strokeRect(x + 1, y + 1, Math.max(1, drawW - 2), Math.max(1, drawH - 2));
        draw.beginPath();
        draw.moveTo(x + drawW, y + 1);
        draw.lineTo(x + drawW + columnDepthX, y - columnDepthY + 1);
        draw.lineTo(x + drawW + columnDepthX, y + drawH - columnDepthY - 1);
        draw.lineTo(x + drawW, y + drawH - 1);
        draw.stroke();
        draw.restore();
      }

      if (drawH > 0 && (isSelected || isLocked)) {
        const valueLabel = formatHistoryAxisDuration(ms);
        draw.save();
        draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
        draw.font = `11px Ligconsolata, Inconsolata, "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`;
        draw.textAlign = "center";
        draw.textBaseline = "bottom";
        draw.shadowColor = "rgba(0,0,0,.7)";
        draw.shadowBlur = 4;
        const labelX = Math.max(plotLeft + 10, Math.min(plotRight - 10, x + drawW / 2 + columnDepthX / 2));
        const labelY = Math.max(12, y - columnDepthY - 4);
        draw.fillText(valueLabel, labelX, labelY);
        draw.restore();
      }

      if (idx % labelStep === 0 || idx === barCount - 1) {
        const labelAlpha = hasSelection ? (isSelected || isLocked ? 1 : 0.28) : 1;
        draw.save();
        draw.globalAlpha = labelAlpha;
        draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
        const baseDateFont = compactLabels ? 10 : 11;
        const labelFontScale = 1;
        draw.font = `${Math.round(baseDateFont * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

        const d = new Date(e.ts || 0);
        const dd = ctx.formatTwo(d.getDate());
        const mm = ctx.formatTwo(d.getMonth() + 1);
        const hh = ctx.formatTwo(d.getHours());
        const mi = ctx.formatTwo(d.getMinutes());
        const compactDateLabel = veryCompactLabels ? `${dd}/${mm}` : compactLabels ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}:${hh}:${mi}`;

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
          draw.restore();
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((veryCompactLabels ? 18 : 22) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: tx - labelHitW / 2,
            y: ty - 10,
            w: labelHitW,
            h: labelHitH,
            renderKey: selectionRow?.renderKey || "",
          };
          draw.textAlign = "center";
          draw.textBaseline = "alphabetic";
        } else {
          const lx = x + drawW / 2;
          const expandedLabelDrop = isSelected || isLocked ? Math.round(8 * labelFontScale) : 0;
          const line1Y = padT + innerH + (compactLabels ? 18 : 22) + expandedLabelDrop;
          draw.fillText(compactDateLabel, lx, line1Y);
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((compactLabels ? 18 : 22) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: lx - labelHitW / 2,
            y: line1Y - 10,
            w: labelHitW,
            h: labelHitH,
            renderKey: selectionRow?.renderKey || "",
          };
        }
        draw.restore();
      }
    }

    const axisMarkerMinGap = 13;
    const axisMarkerYs: number[] = [];
    const getMarkerY = (ms: number) => {
      const markerRatio = Math.max(0, Math.min(1, ms / scaleMaxMs));
      return padT + innerH - Math.floor(innerH * markerRatio) + 0.5;
    };
    const hasAxisMarkerOverlap = (markerY: number) => axisMarkerYs.some((y) => Math.abs(y - markerY) < axisMarkerMinGap);
    const rememberAxisMarker = (markerY: number) => {
      axisMarkerYs.push(markerY);
    };
    chartMarkers.forEach((marker) => {
      if (marker.ms > 0) rememberAxisMarker(getMarkerY(marker.ms));
    });

    if (underGoalPeak && underGoalPeakLabel) {
      const targetBar = barTops[underGoalPeak.index];
      if (targetBar && targetBar.h > 0) {
        const markerY = getMarkerY(underGoalPeak.ms);
        const lineEndX = Math.max(plotLeft, Math.min(plotRight, targetBar.x + targetBar.w / 2));
        const axisTickStartX = Math.max(1, plotLeft - 6);
        const markerColor = targetBar.color || "rgb(0,207,200)";

        draw.save();
        draw.strokeStyle = markerColor;
        draw.fillStyle = markerColor;
        draw.lineWidth = 1;
        draw.setLineDash([3, 3]);
        draw.beginPath();
        draw.moveTo(plotLeft, markerY);
        draw.lineTo(lineEndX, markerY);
        draw.stroke();
        draw.setLineDash([]);
        draw.beginPath();
        draw.moveTo(axisTickStartX, markerY);
        draw.lineTo(plotLeft, markerY);
        draw.stroke();
        draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
        draw.font = `11px Ligconsolata, Inconsolata, "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`;
        draw.textAlign = "right";
        draw.textBaseline = "middle";
        draw.fillText(underGoalPeakLabel, axisTickStartX - 3, markerY);
        draw.fillStyle = markerColor;
        draw.beginPath();
        draw.arc(lineEndX, markerY, 2.5, 0, Math.PI * 2);
        draw.fill();
        draw.restore();
        draw.textAlign = "center";
        draw.textBaseline = "alphabetic";
        rememberAxisMarker(markerY);
      }
    }

    if (lowestLogged && lowestLoggedLabel) {
      const targetBar = barTops[lowestLogged.index];
      const markerY = getMarkerY(lowestLogged.ms);
      if (targetBar && targetBar.h > 0 && !hasAxisMarkerOverlap(markerY)) {
        const lineEndX = Math.max(plotLeft, Math.min(plotRight, targetBar.x + targetBar.w / 2));
        const axisTickStartX = Math.max(1, plotLeft - 6);
        const markerColor = targetBar.color || "rgba(255,255,255,.58)";
        draw.save();
        draw.strokeStyle = markerColor;
        draw.fillStyle = markerColor;
        draw.lineWidth = 1;
        draw.setLineDash([3, 3]);
        draw.beginPath();
        draw.moveTo(plotLeft, markerY);
        draw.lineTo(lineEndX, markerY);
        draw.stroke();
        draw.setLineDash([]);
        draw.beginPath();
        draw.moveTo(axisTickStartX, markerY);
        draw.lineTo(plotLeft, markerY);
        draw.stroke();
        draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
        draw.font = `11px Ligconsolata, Inconsolata, "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`;
        draw.textAlign = "right";
        draw.textBaseline = "middle";
        draw.fillText(lowestLoggedLabel, axisTickStartX - 3, markerY);
        draw.fillStyle = markerColor;
        draw.beginPath();
        draw.arc(lineEndX, markerY, 2.5, 0, Math.PI * 2);
        draw.fill();
        draw.restore();
        draw.textAlign = "center";
        draw.textBaseline = "alphabetic";
        rememberAxisMarker(markerY);
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

        draw.strokeStyle = goal.kind === "timeGoal" ? "rgba(50,217,107,.96)" : checkpointMarkerColor;
        draw.setLineDash(goal.kind === "timeGoal" ? [] : [1, 4]);
        draw.beginPath();
        draw.moveTo(plotLeft, markerY);
        draw.lineTo(plotRight, markerY);
        draw.stroke();

        if (goal.kind === "timeGoal" && timeGoalAxisLabel) {
          const axisTickStartX = Math.max(1, plotLeft - 6);
          draw.beginPath();
          draw.moveTo(axisTickStartX, markerY);
          draw.lineTo(plotLeft, markerY);
          draw.stroke();
          draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
          draw.font = `11px Ligconsolata, Inconsolata, "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`;
          draw.textAlign = "right";
          draw.textBaseline = "middle";
          draw.fillText(timeGoalAxisLabel, axisTickStartX - 3, markerY);
        }

        const tooClose = drawnLabelY.some((y) => Math.abs(y - markerY) < minLabelGap);
        if (tooClose) continue;
        drawnLabelY.push(markerY);

        if (goal.kind !== "timeGoal") {
          draw.fillStyle = HISTORY_INLINE_CHART_LABEL_COLOR;
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
    const selectionView = refreshHistoryInlineSelectionView(taskId, state);
    const rangeDays = state.rangeDays || 7;
    const pageSize = historyPageSize(taskId);
    const isDayMode = state.rangeMode === "day";
    const displayRows = selectionView.rows;
    const display = displayRows.map((row) => historyInlineDisplayValue(taskId, row));
    const total = display.length;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 0) state.page = 0;

    const end = Math.max(0, total - state.page * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = display.slice(start, end);
    const selectionSlice = displayRows.slice(start, end);

    if (ui.rangeText) {
      if (total === 0) ui.rangeText.textContent = "No entries yet";
      else {
        const summary = isDayMode
          ? `Showing ${slice.length} of ${total} days (${selectionView.sourceEntryCount} entries)`
          : `Showing ${slice.length} of ${total} entries (${selectionView.dayCount} ${selectionView.dayCount === 1 ? "day" : "days"})`;
        const swipeHint = total > slice.length ? " - swipe to browse" : "";
        const fallbackHint = selectionView.windowKind === "all-entries-fallback" ? ` (showing older entries outside ${HISTORY_LOOKBACK_DAYS} days)` : "";
        ui.rangeText.textContent = `${summary}${swipeHint}${fallbackHint}`;
      }
    }

    if (ui.olderBtn) ui.olderBtn.disabled = start <= 0;
    if (ui.newerBtn) ui.newerBtn.disabled = end >= total;

    const hasDeleteTarget = selectionView.actions.delete.enabled;
    const hasSummaryTarget = selectionView.actions.summary.enabled;
    if (ui.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTarget;
    if (ui.viewSummaryBtn) {
      ui.viewSummaryBtn.disabled = !hasSummaryTarget;
      ui.viewSummaryBtn.setAttribute("aria-disabled", String(!hasSummaryTarget));
      ui.viewSummaryBtn.title = hasSummaryTarget ? "View Summary" : "Select a history entry to view the summary";
    }
    if (ui.clearLocksBtn) ui.clearLocksBtn.style.display = selectionView.lockedCount > 0 ? "inline-flex" : "none";

    if (ui.canvasWrap && state.slideDir) {
      ui.canvasWrap.classList.remove("slideFromLeft", "slideFromRight");
      void ui.canvasWrap.offsetWidth;
      ui.canvasWrap.classList.add(state.slideDir === "left" ? "slideFromRight" : "slideFromLeft");
      state.slideDir = null;
    }

    const chartDrawn = drawHistoryChart(slice, ui, taskId, selectionSlice, selectionView);
    renderHistoryTrashRow(selectionSlice, ui);
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
      const canAnalyse = selectionView.actions.analyse.enabled;
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
    const selectionView = refreshHistoryInlineSelectionView(taskId, state);
    const action = selectionView.actions.analyse;
    if (!action.enabled) return;
    const resolution = action.resolve(getHistoryForTask(taskId));
    if (resolution.kind !== "resolved") return;
    const selected = resolution.entries.map(({ entry }) => entry);
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
    state.revealPhase = reducedMotion ? "open" : "openingSpace";
    state.barRevealProgress = 1;
    ctx.render();
    scheduleHistoryOpenScrollIntoView(taskId);
    if (reducedMotion) return;
    queueHistoryRevealTimer(state, HISTORY_REVEAL_SPACE_OPEN_MS, () => {
      if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
      const nextState = ctx.getHistoryViewByTaskId()[taskId];
      if (!nextState) return;
      nextState.revealPhase = "open";
      syncHistoryRevealPhaseDom(taskId, "opening");
      renderHistoryChartAfterLayout(taskId);
      queueHistoryRevealTimer(nextState, HISTORY_REVEAL_CONTENT_OPEN_MS, () => {
        if (!ctx.getOpenHistoryTaskIds().has(taskId)) return;
        const finalState = ctx.getHistoryViewByTaskId()[taskId];
        if (!finalState || finalState.revealPhase !== "open") return;
        syncHistoryRevealPhaseDom(taskId, "open");
      });
    });
  }

  function disposeHistoryTask(taskIdRaw: string) {
    const taskId = String(taskIdRaw || "");
    if (!taskId) return false;
    if (ctx.getHistoryEntryNoteAnchorTaskId() === taskId) closeHistoryEntryNoteOverlay();
    const historyViewByTaskId = ctx.getHistoryViewByTaskId();
    const state = historyViewByTaskId[taskId];
    if (state?.selectionClearTimer != null) window.clearTimeout(state.selectionClearTimer);
    if (state?.selectionAnimRaf != null) window.cancelAnimationFrame(state.selectionAnimRaf);
    clearHistoryBarRevealAnimation(state);
    clearHistoryRevealTimer(state);
    clearHistoryLayoutRetry(state);
    clearHistoryCanvasResizeObserver(taskId);
    ctx.getOpenHistoryTaskIds().delete(taskId);
    delete historyViewByTaskId[taskId];
    historyInlineSelectionSessions.delete(taskId);
    return true;
  }

  function pruneInactiveHistoryTasks(activeTaskIds: Set<string>) {
    const candidates = new Set<string>([
      ...historyInlineSelectionSessions.keys(),
      ...Object.keys(ctx.getHistoryViewByTaskId()),
      ...ctx.getOpenHistoryTaskIds(),
    ]);
    const anchoredTaskId = String(ctx.getHistoryEntryNoteAnchorTaskId() || "");
    if (anchoredTaskId) candidates.add(anchoredTaskId);
    candidates.forEach((taskId) => {
      if (!activeTaskIds.has(taskId)) disposeHistoryTask(taskId);
    });
    return true;
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
        historyInlineSelectionSessions.delete(taskId);
      } else {
        state.revealPhase = "closingSpace";
        startHistoryCloseContentDom(taskId);
        queueHistoryRevealTimer(state, HISTORY_REVEAL_CONTENT_CLOSE_MS, () => {
          const nextState = historyViewByTaskId[taskId];
          if (!nextState || nextState.revealPhase !== "closingSpace") return;
          startHistoryCloseSpaceDom(taskId);
          queueHistoryRevealTimer(nextState, HISTORY_REVEAL_SPACE_CLOSE_MS, () => {
            const finalState = historyViewByTaskId[taskId];
            if (!finalState || finalState.revealPhase !== "closingSpace") return;
            if (finalState.selectionClearTimer != null) window.clearTimeout(finalState.selectionClearTimer);
            if (finalState.selectionAnimRaf != null) window.cancelAnimationFrame(finalState.selectionAnimRaf);
            clearHistoryLayoutRetry(finalState);
            clearHistoryCanvasResizeObserver(taskId);
            delete historyViewByTaskId[taskId];
            historyInlineSelectionSessions.delete(taskId);
            ctx.render();
          });
        });
        return;
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
        historyInlineSelectionSessions.delete(k);
      });
      historyInlineSelectionSessions.clear();
    }
    ctx.render();
  }

  function registerHistoryInlineEvents() {
    ctx.on(window, TASKTIMER_OVERLAY_CLOSED_EVENT, (event: Event) => {
      if (suppressHistoryEntryNoteClosedEvent) return;
      const overlayId = String((event as CustomEvent<{ overlayId?: unknown }>).detail?.overlayId || "");
      if (overlayId !== "historyEntryNoteOverlay") return;
      finalizeInlineHistoryEntryNoteOverlayClose();
    });
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
        if (isRichNoteFileInputTarget(target)) return;
        if (target.closest?.("#historyEntryNoteOverlay")) return;
        if (isHistoryChartInteractionTarget(target)) return;
        closeHistoryEntryNoteOverlay();
      },
      { capture: true }
    );
    ctx.on(document, "click", (e: any) => {
      const xpReplayTarget = findDelegatedElement(
        e.target,
        '[data-history-summary-action="trigger-xp-award"]'
      ) as HTMLElement | null;
      if (xpReplayTarget) {
        historyEntrySummaryInteraction.triggerDevXpAward(xpReplayTarget);
        return;
      }

      const editNoteTarget = findDelegatedElement(
        e.target,
        '[data-history-summary-action="edit-note"]'
      ) as HTMLElement | null;
      if (editNoteTarget) {
        beginInlineHistoryEntryNoteEdit(editNoteTarget);
        return;
      }

      const deleteBtn = findDelegatedElement(
        e.target,
        '[data-history-summary-action="delete-session"]'
      ) as HTMLButtonElement | null;
      if (!deleteBtn) return;
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.style.display === "none") return;
      if (overlay.dataset.historyEntryEditing === "true") return;

      const taskId = String(deleteBtn.getAttribute("data-history-summary-task-id") || "").trim();
      const historyTargetKey = String(deleteBtn.getAttribute("data-history-summary-target-key") || "");
      if (!taskId || !historyTargetKey) return;

      const state = ensureHistoryViewState(taskId);
      const selectionSession = getHistoryInlineSelectionSession(taskId);
      const initialResolution = selectionSession.resolveEntryTarget(historyTargetKey, getHistoryForTask(taskId));
      if (initialResolution.kind !== "resolved" || initialResolution.entry.isLiveSession) return;
      const entry = initialResolution.entry;

      ctx.confirm("Delete Session Entry", `Delete this session entry (${ctx.formatTime(entry.ms || 0)})?`, {
        okLabel: "Delete",
        overlayClassName: "isDeleteSessionEntryConfirm",
        onOk: () => {
          const resolution = selectionSession.resolveEntryDelete(historyTargetKey, getHistoryForTask(taskId));
          if (resolution.kind !== "resolved") {
            ctx.closeConfirm();
            refreshHistoryInlineSelectionView(taskId, state);
            syncHistoryEntryNoteOverlayForSelection(taskId, state);
            ctx.showActionConfirmation("History changed. Nothing was deleted.");
            return;
          }
          commitResolvedHistoryDelete(taskId, state, resolution, { syncOverlay: false });
          ctx.closeConfirm();
          const remainingEntries = getCurrentHistorySummarySelection(taskId, state);
          if (remainingEntries.length) openHistoryEntryNoteOverlay(taskId, remainingEntries);
          else closeHistoryEntryNoteOverlay();
        },
        onCancel: () => {
          ctx.closeConfirm();
          const selectedEntries = getCurrentHistorySummarySelection(taskId, state);
          if (selectedEntries.length) {
            openHistoryEntryNoteOverlay(taskId, selectedEntries);
            return;
          }
          const currentTarget = selectionSession.resolveEntryTarget(historyTargetKey, getHistoryForTask(taskId));
          if (currentTarget.kind === "resolved") {
            openHistoryEntryNoteOverlay(taskId, [
              {
                ...currentTarget.entry,
                taskId,
                historyTargetKey,
                historyMutationAllowed: !currentTarget.entry.isLiveSession,
              },
            ]);
          } else {
            closeHistoryEntryNoteOverlay();
          }
        },
      });
      playDeleteAlertAudio();
    });
    ctx.on(
      document,
      "click",
      (e: any) => {
        const closeBtn = findDelegatedElement(e.target, "#historyEntryNoteOverlay .closePopup");
        if (!closeBtn) return;
        const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
        if (!overlay || overlay.dataset.historyEntryOwner !== "inline") return;
        if (overlay.dataset.historyEntryEditing === "true") {
          historyEntrySummaryInteraction.discardDraft();
        }
        closeHistoryEntryNoteOverlay();
      },
      { capture: true }
    );
    ctx.on(
      document,
      "click",
      (e: any) => {
        const saveAndCloseBtn = findDelegatedElement(e.target, "#historyEntryNoteSaveAndCloseBtn");
        if (!saveAndCloseBtn) return;
        const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
        if (!overlay || overlay.dataset.historyEntryOwner !== "inline") return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        saveHistoryEntryOverlayNote();
        closeHistoryEntryNoteOverlay();
      },
      { capture: true }
    );
    ctx.on(document, "input", (e: any) => {
      const input = findDelegatedElement(e.target, "#historyEntryNoteOverlay .historyEntrySummaryNoteInput.isEditing");
      if (!input) return;
      historyEntrySummaryInteraction.syncInputMirror(String((input as HTMLElement).innerHTML || ""));
    });
    ctx.on(document, "focusin", (e: any) => {
      const input = findDelegatedElement(e.target, "#historyEntryNoteOverlay .historyEntrySummaryNoteInput.isEditing");
      if (!input) return;
      historyEntrySummaryInteraction.expandActiveInlineNoteInput();
    });
    ctx.on(document, "click", (e: any) => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "inline" || overlay.dataset.historyEntryEditing !== "true") return;
      if (!(e.target as HTMLElement | null)?.closest?.("#historyEntryNoteOverlay")) return;
      if (isRichNoteFileInputTarget(e.target)) return;
      if ((e.target as HTMLElement | null)?.closest?.("#historyEntryNoteOverlay .historyEntrySummaryNoteInput")) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-history-summary-action="edit-note"]')) return;
      historyEntrySummaryInteraction.collapseActiveInlineNoteInput();
    });
    ctx.on(document, "keydown", (e: any) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if ((e.target as HTMLElement | null)?.closest?.("textarea, input, select, [contenteditable='true']")) return;
      const editNoteTarget = findDelegatedElement(
        e.target,
        '[data-history-summary-action="edit-note"]'
      ) as HTMLElement | null;
      if (!editNoteTarget) return;
      e.preventDefault();
      beginInlineHistoryEntryNoteEdit(editNoteTarget);
    });
    ctx.on(els.historyEntryNoteEditBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "inline" || overlay.dataset.historyEntryEditable !== "true") return;
      if (els.historyEntryNoteInput) els.historyEntryNoteInput.focus();
      historyEntrySummaryInteraction.syncEditorUi(true);
      refreshHistoryEntryNoteOverlayPosition();
    });
    ctx.on(els.historyEntryNoteCancelBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "inline") return;
      historyEntrySummaryInteraction.cancelEdit();
      refreshHistoryEntryNoteOverlayPosition();
    });
    ctx.on(els.historyEntryNoteSaveBtn, "click", () => {
      saveHistoryEntryOverlayNote();
    });
    ctx.on(els.historyEntryNoteSaveAndCloseBtn, "click", () => {
      saveHistoryEntryOverlayNote();
      closeHistoryEntryNoteOverlay();
    });

    ctx.on(els.taskList, "click", (ev: any) => {
      const entryDeleteBtn = findDelegatedElement(
        ev.target,
        "[data-history-entry-delete-target]"
      ) as HTMLButtonElement | null;
      if (entryDeleteBtn) {
        const taskEl = entryDeleteBtn.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        const historyTargetKey = String(entryDeleteBtn.getAttribute("data-history-entry-delete-target") || "");
        if (!taskId || !historyTargetKey) return;
        const state = ensureHistoryViewState(taskId);
        const selectionSession = getHistoryInlineSelectionSession(taskId);
        const initial = selectionSession.resolveEntryTarget(historyTargetKey, getHistoryForTask(taskId));
        if (initial.kind !== "resolved" || initial.entry.isLiveSession) return;
        ctx.confirm("Delete Log Entry", `Delete this entry (${ctx.formatTime(initial.entry.ms || 0)})?`, {
          okLabel: "Delete",
          onOk: () => {
            const resolution = selectionSession.resolveEntryDelete(historyTargetKey, getHistoryForTask(taskId));
            if (resolution.kind !== "resolved") {
              ctx.closeConfirm();
              refreshHistoryInlineSelectionView(taskId, state);
              syncHistoryEntryNoteOverlayForSelection(taskId, state);
              renderHistory(taskId);
              ctx.showActionConfirmation("History changed. Nothing was deleted.");
              return;
            }
            commitResolvedHistoryDelete(taskId, state, resolution);
            ctx.closeConfirm();
            ctx.showActionConfirmation("History entry deleted.");
          },
        });
        playDeleteAlertAudio();
        return;
      }

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
        const nextMode = mode === "day" ? "day" : "entries";
        const modeChanged = state.rangeMode !== nextMode;
        state.rangeMode = nextMode;
        saveHistoryRangeModePref(taskId, state.rangeMode);
        if (modeChanged) clearHistoryChartSelection(taskId);
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
          if (!refreshHistoryInlineSelectionView(taskId, state).actions.analyse.enabled) return;
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
      if (action !== "delete") return;
      const deleteAction = refreshHistoryInlineSelectionView(taskId, state).actions.delete;
      if (!deleteAction.enabled) return;

      ctx.confirm("Delete Log Entry", `Delete this entry (${ctx.formatTime(deleteAction.preview.totalMs)})?`, {
        okLabel: "Delete",
        onOk: () => {
          const resolution = deleteAction.resolve(getHistoryForTask(taskId));
          if (resolution.kind !== "resolved") {
            ctx.closeConfirm();
            refreshHistoryInlineSelectionView(taskId, state);
            syncHistoryEntryNoteOverlayForSelection(taskId, state);
            renderHistory(taskId);
            ctx.showActionConfirmation("History changed. Nothing was deleted.");
            return;
          }
          commitResolvedHistoryDelete(taskId, state, resolution);
          ctx.closeConfirm();
          ctx.showActionConfirmation("History entry deleted.");
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

      let hitRenderKey = "";
      for (let i = 0; i < state.barRects.length; i++) {
        const r = state.barRects[i];
        if (!r) continue;
        const hx = typeof r.hitX === "number" ? r.hitX : r.x;
        const hy = typeof r.hitY === "number" ? r.hitY : r.y;
        const hw = typeof r.hitW === "number" ? r.hitW : r.w;
        const hh = typeof r.hitH === "number" ? r.hitH : r.h;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) {
          hitRenderKey = r.renderKey;
          break;
        }
      }
      if (!hitRenderKey) {
        for (let i = 0; i < state.labelHitRects.length; i++) {
          const r = state.labelHitRects[i];
          if (!r) continue;
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            hitRenderKey = r.renderKey;
            break;
          }
        }
      }

      let selectionView = refreshHistoryInlineSelectionView(taskId, state);
      if (!hitRenderKey) {
        selectionView = selectionView.clear("all");
        if (state.selectionClearTimer != null) {
          window.clearTimeout(state.selectionClearTimer);
          state.selectionClearTimer = null;
        }
        startHistorySelectionAnimation(taskId, null);
        syncHistoryEntryNoteOverlayForSelection(taskId, state);
      } else {
        const selectionRow = selectionView.rows.find((row) => row.renderKey === hitRenderKey);
        const transition = selectionRow?.activate();
        if (transition?.kind === "changed") {
          selectionView = transition.view;
          if (transition.change === "selected") {
            startHistorySelectionAnimation(taskId, transition.animateTo);
            scheduleHistorySelectionClear(taskId);
          } else if (transition.change === "locked") {
            if (state.selectionClearTimer != null) {
              window.clearTimeout(state.selectionClearTimer);
              state.selectionClearTimer = null;
            }
            startHistorySelectionAnimation(taskId, null);
          } else {
            syncHistoryEntryNoteOverlayForSelection(taskId, state);
          }
        }
      }
      const ui = getHistoryUi(taskId);
      if (ui?.deleteBtn) ui.deleteBtn.disabled = !selectionView.actions.delete.enabled;
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
      const selectionView = refreshHistoryInlineSelectionView(taskId, state);
      const pageSize = historyPageSize(taskId);
      const maxPage = Math.max(0, Math.ceil(selectionView.rows.length / pageSize) - 1);

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
    disposeHistoryTask,
    pruneInactiveHistoryTasks,
    getHistoryForTask,
    resolveHistoryEntryTarget,
    historyPageSize,
    ensureHistoryViewState,
    startHistorySelectionAnimation,
    scheduleHistorySelectionClear,
    clearHistoryChartSelection,
    resetHistoryChartSelectionToDefault,
    resetAllOpenHistoryChartSelections,
    closeUnpinnedOpenHistoryCharts,
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
