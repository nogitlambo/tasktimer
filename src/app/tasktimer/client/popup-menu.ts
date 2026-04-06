import type { TaskTimerPopupMenuContext } from "./context";
import { createTaskTimerOverlayController } from "./overlay-controller";
import { createTaskTimerOverlayRegistry } from "./overlay-registry";

export function createTaskTimerPopupMenu(ctx: TaskTimerPopupMenuContext) {
  const overlayController = createTaskTimerOverlayController(createTaskTimerOverlayRegistry(ctx));

  function openPopup(whichRaw: string) {
    const which = String(whichRaw || "").trim();
    if (!which) return;
    if (!overlayController.has(which)) return;
    overlayController.open(which);
  }

  function registerPopupMenuEvents() {
    document.querySelectorAll(".menuItem[data-menu]").forEach((btn) => {
      ctx.on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    document.querySelectorAll(".closePopup").forEach((btn) => {
      ctx.on(btn, "click", () => {
        const overlay = (btn as HTMLElement).closest(".overlay") as HTMLElement | null;
        if (overlay?.id === "historyEntryNoteOverlay") {
          ctx.clearHistoryEntryNoteOverlayPosition();
        }
        if (overlay) ctx.closeOverlay(overlay);
      });
    });
  }

  return {
    openPopup,
    registerPopupMenuEvents,
  };
}
