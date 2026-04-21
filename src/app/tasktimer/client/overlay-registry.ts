import type { TaskTimerPopupMenuContext } from "./context";

export type TaskTimerOverlayRegistryEntry = {
  id: string;
  open: () => void;
};

export function createTaskTimerOverlayRegistry(ctx: TaskTimerPopupMenuContext): TaskTimerOverlayRegistryEntry[] {
  const { els } = ctx;
  return [
    {
      id: "historyManager",
      open: () => ctx.openHistoryManager(),
    },
    {
      id: "howto",
      open: () => ctx.navigateToAppRoute("/user-guide"),
    },
    {
      id: "taskSettings",
      open: () => {
        ctx.syncTaskSettingsUi();
        ctx.openOverlay(els.taskSettingsOverlay as HTMLElement | null);
      },
    },
    {
      id: "about",
      open: () => ctx.openOverlay(els.aboutOverlay as HTMLElement | null),
    },
    {
      id: "appearance",
      open: () => ctx.openOverlay(els.appearanceOverlay as HTMLElement | null),
    },
    {
      id: "contact",
      open: () => ctx.openOverlay(els.contactOverlay as HTMLElement | null),
    },
  ];
}
