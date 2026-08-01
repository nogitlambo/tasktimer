import { describe, expect, it, vi } from "vitest";
import {
  closeTaskTimerOverlay,
  createTaskTimerOverlayLifecycle,
  HISTORY_ENTRY_SUMMARY_NATIVE_CLOSE_ANIMATION_MS,
  isTaskTimerOverlayVisible,
  openTaskTimerOverlay,
  REWARD_MODAL_CLOSE_ANIMATION_MS,
} from "./overlay-lifecycle";
import { hasBlockingTimeGoalCompleteOverlay, isBlockingTimeGoalCompleteOverlay } from "./overlay-visibility";

function overlayStub(id = "overlay", attrs: Record<string, string | null> = {}) {
  const classes = new Set<string>();
  return {
    id,
    style: { display: "" },
    classList: {
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
      contains: (className: string) => classes.has(className),
    },
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute: (name: string, value: string) => {
      attrs[name] = value;
    },
  } as unknown as HTMLElement;
}

function confettiStageStub() {
  const classes = new Set<string>(["isPlaying"]);
  return {
    dataset: { confettiState: "playing" },
    classList: {
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
      contains: (className: string) => classes.has(className),
    },
  } as unknown as HTMLElement;
}

function createLifecycle(visibleOverlays: HTMLElement[] = []) {
  return createTaskTimerOverlayLifecycle({
    documentRef: { activeElement: null },
    getVisibleOverlays: () => visibleOverlays,
    closeEdit: vi.fn(),
    closeElapsedPad: vi.fn(),
    closeConfirm: vi.fn(),
    closeTaskExportModal: vi.fn(),
    closeShareTaskModal: vi.fn(),
  });
}

describe("overlay lifecycle", () => {
  it("opens overlays with the existing flex display behavior", () => {
    const overlay = overlayStub();

    openTaskTimerOverlay(overlay);

    expect(overlay.style.display).toBe("flex");
  });

  it("closes overlays after defensively blurring the active element", () => {
    const overlay = overlayStub();
    overlay.style.display = "flex";
    const blur = vi.fn();

    closeTaskTimerOverlay(overlay, { activeElement: { blur } as unknown as Element });

    expect(blur).toHaveBeenCalledTimes(1);
    expect(overlay.style.display).toBe("none");
  });

  it("stops time goal confetti when closing the task complete overlay", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), matchMedia: () => ({ matches: false }) });
    const stage = confettiStageStub();
    const classes = new Set<string>();
    const attrs: Record<string, string | null> = {};
    const overlay = {
      id: "timeGoalCompleteOverlay",
      style: { display: "flex" },
      classList: {
        add: (className: string) => classes.add(className),
        remove: (className: string) => classes.delete(className),
        contains: (className: string) => classes.has(className),
      },
      setAttribute: (name: string, value: string) => {
        attrs[name] = value;
      },
      querySelector: (selector: string) => (selector === "#timeGoalCompleteConfettiStage" ? stage : null),
    } as unknown as HTMLElement;

    closeTaskTimerOverlay(overlay, { activeElement: null });

    expect(classes.has("isClosing")).toBe(true);
    expect(attrs["aria-hidden"]).toBe("true");
    expect(overlay.style.display).toBe("flex");
    vi.advanceTimersByTime(REWARD_MODAL_CLOSE_ANIMATION_MS);

    expect(stage.classList.contains("isPlaying")).toBe(false);
    expect(stage.dataset.confettiState).toBe("stopped");
    expect(overlay.style.display).toBe("none");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("cancels a pending reward close animation when reopening", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), matchMedia: () => ({ matches: false }) });
    const overlay = overlayStub("dailyRewardOverlay");
    overlay.style.display = "flex";

    closeTaskTimerOverlay(overlay, { activeElement: null });
    expect(overlay.classList.contains("isClosing")).toBe(true);

    openTaskTimerOverlay(overlay);
    vi.advanceTimersByTime(REWARD_MODAL_CLOSE_ANIMATION_MS);

    expect(overlay.classList.contains("isClosing")).toBe(false);
    expect(overlay.style.display).toBe("flex");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("animates native session summary sheet close before hiding the overlay", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), matchMedia: () => ({ matches: false }) });
    const originalDocument = globalThis.document;
    const overlay = overlayStub("historyEntryNoteOverlay");
    overlay.style.display = "flex";
    vi.stubGlobal("document", {
      ...(originalDocument ?? {}),
      body: {
        dataset: {
          tasktimerNativeRuntime: "true",
        },
      },
    });

    closeTaskTimerOverlay(overlay, { activeElement: null });

    expect(overlay.classList.contains("isClosing")).toBe(true);
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.style.display).toBe("flex");

    vi.advanceTimersByTime(HISTORY_ENTRY_SUMMARY_NATIVE_CLOSE_ANIMATION_MS);

    expect(overlay.classList.contains("isClosing")).toBe(false);
    expect(overlay.style.display).toBe("none");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the existing visibility rules", () => {
    const visible = overlayStub();
    const hiddenByDisplay = overlayStub();
    const hiddenByAria = overlayStub("overlay", { "aria-hidden": "true" });
    hiddenByDisplay.style.display = "none";

    expect(isTaskTimerOverlayVisible(visible)).toBe(true);
    expect(isTaskTimerOverlayVisible(hiddenByDisplay)).toBe(false);
    expect(isTaskTimerOverlayVisible(hiddenByAria)).toBe(false);
    expect(isTaskTimerOverlayVisible(null)).toBe(false);
  });

  it("detects visible overlays that should block task complete modals", () => {
    const rankPromotionOverlay = overlayStub("rankPromotionOverlay");
    const hiddenOverlay = overlayStub("addTaskOverlay");
    const taskCompleteOverlay = overlayStub("timeGoalCompleteOverlay");
    hiddenOverlay.style.display = "none";
    rankPromotionOverlay.style.display = "flex";
    taskCompleteOverlay.style.display = "flex";
    const documentRef = {
      querySelectorAll: (selector: string) =>
        selector === ".overlay" ? [hiddenOverlay, taskCompleteOverlay, rankPromotionOverlay] : [],
    } as unknown as Document;

    expect(isBlockingTimeGoalCompleteOverlay(taskCompleteOverlay)).toBe(false);
    expect(isBlockingTimeGoalCompleteOverlay(hiddenOverlay)).toBe(false);
    expect(isBlockingTimeGoalCompleteOverlay(rankPromotionOverlay)).toBe(true);
    expect(hasBlockingTimeGoalCompleteOverlay(documentRef)).toBe(true);
  });

  it("does not block task complete modals on time-goal overlay family members", () => {
    const completeOverlay = overlayStub("timeGoalCompleteOverlay");
    const noteOverlay = overlayStub("timeGoalCompleteNoteOverlay");
    const saveNoteOverlay = overlayStub("timeGoalCompleteSaveNoteOverlay");
    completeOverlay.style.display = "flex";
    noteOverlay.style.display = "flex";
    saveNoteOverlay.style.display = "flex";
    const documentRef = {
      querySelectorAll: (selector: string) =>
        selector === ".overlay" ? [completeOverlay, noteOverlay, saveNoteOverlay] : [],
    } as unknown as Document;

    expect(hasBlockingTimeGoalCompleteOverlay(documentRef)).toBe(false);
  });

  it("returns false when no top overlay is open", () => {
    const lifecycle = createLifecycle();

    expect(lifecycle.closeTopOverlayIfOpen()).toBe(false);
  });

  it("routes special top overlays to their injected close handlers", () => {
    const editOverlay = overlayStub("editOverlay");
    const elapsedOverlay = overlayStub("elapsedPadOverlay");
    const confirmOverlay = overlayStub("confirmOverlay");
    const exportOverlay = overlayStub("exportTaskOverlay");
    const shareOverlay = overlayStub("shareTaskModal");
    const closeEdit = vi.fn();
    const closeElapsedPad = vi.fn();
    const closeConfirm = vi.fn();
    const closeTaskExportModal = vi.fn();
    const closeShareTaskModal = vi.fn();
    const lifecycle = createTaskTimerOverlayLifecycle({
      documentRef: { activeElement: null },
      getVisibleOverlays: vi
        .fn()
        .mockReturnValueOnce([editOverlay])
        .mockReturnValueOnce([elapsedOverlay])
        .mockReturnValueOnce([confirmOverlay])
        .mockReturnValueOnce([exportOverlay])
        .mockReturnValueOnce([shareOverlay]),
      closeEdit,
      closeElapsedPad,
      closeConfirm,
      closeTaskExportModal,
      closeShareTaskModal,
    });

    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(closeEdit).toHaveBeenCalledWith(false);
    expect(closeElapsedPad).toHaveBeenCalledWith(false);
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeTaskExportModal).toHaveBeenCalledTimes(1);
    expect(closeShareTaskModal).toHaveBeenCalledTimes(1);
  });

  it("leaves time goal completion open while reporting that back was handled", () => {
    const overlay = overlayStub("timeGoalCompleteOverlay");
    overlay.style.display = "flex";
    const closeConfirm = vi.fn();
    const lifecycle = createTaskTimerOverlayLifecycle({
      documentRef: { activeElement: null },
      getVisibleOverlays: () => [overlay],
      closeEdit: vi.fn(),
      closeElapsedPad: vi.fn(),
      closeConfirm,
      closeTaskExportModal: vi.fn(),
      closeShareTaskModal: vi.fn(),
    });

    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(overlay.style.display).toBe("flex");
    expect(closeConfirm).not.toHaveBeenCalled();
  });

  it("falls back to generic close for unknown top overlays", () => {
    const overlay = overlayStub("customOverlay");
    overlay.style.display = "flex";
    const blur = vi.fn();
    const lifecycle = createTaskTimerOverlayLifecycle({
      documentRef: { activeElement: { blur } as unknown as Element },
      getVisibleOverlays: () => [overlay],
      closeEdit: vi.fn(),
      closeElapsedPad: vi.fn(),
      closeConfirm: vi.fn(),
      closeTaskExportModal: vi.fn(),
      closeShareTaskModal: vi.fn(),
    });

    expect(lifecycle.closeTopOverlayIfOpen()).toBe(true);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(overlay.style.display).toBe("none");
  });
});
