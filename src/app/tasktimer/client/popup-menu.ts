import type { TaskTimerPopupMenuContext } from "./context";

export function createTaskTimerPopupMenu(ctx: TaskTimerPopupMenuContext) {
  const { els } = ctx;

  function openPopup(whichRaw: string) {
    const which = String(whichRaw || "").trim();
    if (!which) return;
    if (which === "historyManager") {
      ctx.openHistoryManager();
      return;
    }
    if (which === "howto") {
      ctx.navigateToAppRoute("/tasklaunch/user-guide");
      return;
    }
    if (which === "categoryManager") {
      ctx.syncModeLabelsUi();
    }
    if (which === "taskSettings") {
      ctx.syncTaskSettingsUi();
    }

    const overlayMap: Record<string, HTMLElement | null> = {
      about: els.aboutOverlay as HTMLElement | null,
      howto: els.howtoOverlay as HTMLElement | null,
      appearance: els.appearanceOverlay as HTMLElement | null,
      taskSettings: els.taskSettingsOverlay as HTMLElement | null,
      categoryManager: els.categoryManagerOverlay as HTMLElement | null,
      contact: els.contactOverlay as HTMLElement | null,
    };

    const overlay = overlayMap[which];
    if (overlay) ctx.openOverlay(overlay);
  }

  function registerPopupMenuEvents() {
    document.querySelectorAll(".menuItem").forEach((btn) => {
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
