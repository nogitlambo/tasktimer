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

export function openTaskTimerOverlay(overlay: HTMLElement | null) {
  if (!overlay) return;
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
  if (overlay.id === "timeGoalCompleteOverlay") {
    stopTimeGoalConfetti(getTimeGoalConfettiStage(overlay));
  }
  overlay.style.display = "none";
  if (typeof window !== "undefined") {
    dispatchOverlayClosedEvent(window, overlay.id);
  }
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
