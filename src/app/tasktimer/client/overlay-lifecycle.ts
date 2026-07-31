import { getVisibleOverlays as getVisibleOverlaysFromDocument } from "./overlay-visibility";
import { getTimeGoalConfettiStage, stopTimeGoalConfetti } from "./time-goal-confetti";
import { dispatchOverlayClosedEvent } from "./xp-award-events";

type ActiveElementDocument = {
  activeElement?: Element | null;
};

type TaskTimerOverlayLifecycleOptions = {
  documentRef: ActiveElementDocument;
  getVisibleOverlays?: () => HTMLElement[];
  closeEdit: (saveChanges: boolean) => void;
  closeElapsedPad: (applyValue: boolean) => void;
  closeConfirm: () => void;
  closeTaskExportModal: () => void;
  closeShareTaskModal: () => void;
};

export const REWARD_MODAL_CLOSE_ANIMATION_MS = 560;
export const HISTORY_ENTRY_SUMMARY_NATIVE_CLOSE_ANIMATION_MS = 420;

const rewardOverlayCloseTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const ANIMATED_REWARD_OVERLAY_IDS = new Set(["timeGoalCompleteOverlay", "dailyRewardOverlay"]);

function shouldAnimateHistoryEntrySummaryOverlayClose(overlay: HTMLElement) {
  if (String(overlay.id || "") !== "historyEntryNoteOverlay") return false;
  if (typeof document === "undefined") return false;
  return document.body?.dataset?.tasktimerNativeRuntime === "true";
}

function shouldAnimateRewardOverlayClose(overlay: HTMLElement) {
  if (!ANIMATED_REWARD_OVERLAY_IDS.has(String(overlay.id || ""))) return false;
  if (typeof window === "undefined") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function clearRewardOverlayCloseTimer(overlay: HTMLElement) {
  const timer = rewardOverlayCloseTimers.get(overlay);
  if (!timer) return;
  clearTimeout(timer);
  rewardOverlayCloseTimers.delete(overlay);
}

export function openTaskTimerOverlay(overlay: HTMLElement | null) {
  if (!overlay) return;
  clearRewardOverlayCloseTimer(overlay);
  overlay.classList?.remove("isClosing");
  overlay.setAttribute("aria-hidden", "false");
  overlay.style.display = "flex";
}

export function closeTaskTimerOverlay(overlay: HTMLElement | null, documentRef: ActiveElementDocument) {
  try {
    const activeElement = documentRef.activeElement;
    if (activeElement && "blur" in activeElement && typeof activeElement.blur === "function") {
      activeElement.blur();
    }
  } catch {
    // ignore
  }
  if (!overlay) return;
  clearRewardOverlayCloseTimer(overlay);
  const finishClose = () => {
    overlay.classList?.remove("isClosing");
    if (overlay.id === "timeGoalCompleteOverlay") {
      stopTimeGoalConfetti(getTimeGoalConfettiStage(overlay));
    }
    overlay.style.display = "none";
    if (typeof window !== "undefined") {
      dispatchOverlayClosedEvent(window, overlay.id);
    }
  };
  if (!shouldAnimateRewardOverlayClose(overlay) && !shouldAnimateHistoryEntrySummaryOverlayClose(overlay)) {
    finishClose();
    return;
  }
  overlay.classList?.add("isClosing");
  overlay.setAttribute("aria-hidden", "true");
  const closeDuration = shouldAnimateRewardOverlayClose(overlay)
    ? REWARD_MODAL_CLOSE_ANIMATION_MS
    : HISTORY_ENTRY_SUMMARY_NATIVE_CLOSE_ANIMATION_MS;
  rewardOverlayCloseTimers.set(
    overlay,
    setTimeout(() => {
      rewardOverlayCloseTimers.delete(overlay);
      finishClose();
    }, closeDuration),
  );
}

export function isTaskTimerOverlayVisible(overlay: HTMLElement | null) {
  if (!overlay) return false;
  return overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
}

export function createTaskTimerOverlayLifecycle(options: TaskTimerOverlayLifecycleOptions) {
  const getVisibleOverlays =
    options.getVisibleOverlays ?? (() => getVisibleOverlaysFromDocument(options.documentRef as Document));

  function openOverlay(overlay: HTMLElement | null) {
    openTaskTimerOverlay(overlay);
  }

  function closeOverlay(overlay: HTMLElement | null) {
    closeTaskTimerOverlay(overlay, options.documentRef);
  }

  function closeTopOverlayIfOpen() {
    const openOverlays = getVisibleOverlays();
    if (!openOverlays.length) return false;
    const top = openOverlays[openOverlays.length - 1];
    if (top.id === "editOverlay") {
      options.closeEdit(false);
      return true;
    }
    if (top.id === "elapsedPadOverlay") {
      options.closeElapsedPad(false);
      return true;
    }
    if (top.id === "confirmOverlay") {
      options.closeConfirm();
      return true;
    }
    if (top.id === "timeGoalCompleteOverlay") {
      return true;
    }
    if (top.id === "exportTaskOverlay") {
      options.closeTaskExportModal();
      return true;
    }
    if (top.id === "shareTaskModal") {
      options.closeShareTaskModal();
      return true;
    }
    closeOverlay(top);
    return true;
  }

  return {
    openOverlay,
    closeOverlay,
    isOverlayVisible: isTaskTimerOverlayVisible,
    closeTopOverlayIfOpen,
  };
}
