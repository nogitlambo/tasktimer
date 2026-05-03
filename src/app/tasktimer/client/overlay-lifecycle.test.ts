import { describe, expect, it, vi } from "vitest";
import {
  closeTaskTimerOverlay,
  createTaskTimerOverlayLifecycle,
  isTaskTimerOverlayVisible,
  openTaskTimerOverlay,
} from "./overlay-lifecycle";

function overlayStub(id = "overlay", attrs: Record<string, string | null> = {}) {
  return {
    id,
    style: { display: "" },
    getAttribute: (name: string) => attrs[name] ?? null,
  } as HTMLElement;
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
