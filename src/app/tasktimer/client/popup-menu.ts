import type { TaskTimerPopupMenuContext } from "./context";
import { findDelegatedElement, getDelegatedAction } from "./delegated-actions";
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
    ctx.on(document, "click", (event: Event) => {
      const menuAction = getDelegatedAction(event.target, "data-menu");
      if (menuAction && menuAction.element.classList.contains("menuItem")) {
        openPopup(menuAction.action);
        return;
      }

      const closeBtn = findDelegatedElement(event.target, ".closePopup");
      if (!closeBtn) return;
      const overlay = closeBtn.closest(".overlay") as HTMLElement | null;
      if (overlay?.id === "historyEntryNoteOverlay") {
        ctx.clearHistoryEntryNoteOverlayPosition();
      }
      if (overlay) ctx.closeOverlay(overlay);
    });
  }

  return {
    openPopup,
    registerPopupMenuEvents,
  };
}
