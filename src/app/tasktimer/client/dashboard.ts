import type { TaskTimerDashboardContext } from "./context";
import type { DashboardRenderOptions } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DashboardClosestTarget = {
  closest?: (selector: string) => unknown;
} | null;

const DASHBOARD_PANEL_REGISTRY = [
  { panelId: "activity-overview", label: "Activity Overview" },
  { panelId: "tasks-completed", label: "Task Overview" },
  { panelId: "momentum", label: "Momentum" },
  { panelId: "heatmap", label: "Focus Heatmap" },
] as const;

const DASHBOARD_SUPPORT_PANEL_IDS = [
  "momentum",
  "tasks-completed",
  "heatmap",
] as const;

const DASHBOARD_ACTIVITY_LONG_PRESS_MS = 520;
const DASHBOARD_ACTIVITY_LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function sanitizeDashboardCardSize(value: unknown, cardId?: string | null) {
  void value;
  void cardId;
  return null;
}

export function isDashboardCardSizeOptionAllowed(size: string, cardId: string) {
  void size;
  void cardId;
  return false;
}

export function shouldUsePointerDashboardDrag(event: { button?: number; isPrimary?: boolean | null }) {
  void event;
  return false;
}

export function shouldIgnoreDashboardPointerDragStartTarget(target: DashboardClosestTarget) {
  void target;
  return true;
}

export function shouldOpenDashboardLockedUpgradePrompt(editMode: boolean) {
  void editMode;
  return false;
}

export function createTaskTimerDashboard(ctx: TaskTimerDashboardContext) {
  const { els } = ctx;
  let activityLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activityLongPressDayKey = "";
  let activityLongPressStartX = 0;
  let activityLongPressStartY = 0;

  function getDashboardGridEl() {
    return (document.querySelector("#appPageDashboard .dashboardGrid") as HTMLElement | null) || els.dashboardGrid || null;
  }

  function getDashboardSupportGridEl() {
    return document.querySelector("#appPageDashboard .dashboardSupportGrid") as HTMLElement | null;
  }

  function getCloudDashboardRecord() {
    const cached = ctx.getCloudDashboardCache();
    if (cached && typeof cached === "object") return cached as { order?: unknown; widgets?: unknown };
    const loaded = ctx.loadCachedDashboard();
    return loaded && typeof loaded === "object" ? (loaded as { order?: unknown; widgets?: unknown }) : null;
  }

  function ensureDashboardIncludedModesValid() {}

  function collectDashboardPanelMeta() {
    const out = [] as Array<{ panel: HTMLElement; panelId: string; label: string }>;
    DASHBOARD_PANEL_REGISTRY.forEach(({ panelId, label }) => {
      const panel = document.querySelector(
        `#appPageDashboard [data-dashboard-id="${panelId}"]`
      ) as HTMLElement | null;
      if (!panel) return;
      const customLabel = String(panel.getAttribute("data-dashboard-label") || "").trim();
      const titleEl = panel.querySelector(".dashboardCardTitle") as HTMLElement | null;
      const title = String(titleEl?.textContent || "").trim();
      const ariaLabel = String(panel.getAttribute("aria-label") || "").trim();
      out.push({
        panel,
        panelId,
        label: customLabel || title || ariaLabel || label,
      });
    });
    return out;
  }

  function saveDashboardWidgetState(partialWidgets: Record<string, unknown>) {
    const dashboard = getCloudDashboardRecord();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const widgets = {
      ...existingWidgets,
      ...partialWidgets,
    };
    delete widgets.cardPlacements;
    delete widgets.cardSizes;
    delete widgets.cardVisibility;
    const snapshots =
      dashboard && typeof (dashboard as { activityGoalSnapshotsByDay?: unknown }).activityGoalSnapshotsByDay === "object"
        ? ((dashboard as { activityGoalSnapshotsByDay?: Record<string, number> }).activityGoalSnapshotsByDay || {})
        : {};
    const nextDashboard = { order: [] as string[], widgets, activityGoalSnapshotsByDay: snapshots };
    ctx.setCloudDashboardCache(nextDashboard);
    ctx.saveCloudDashboard(nextDashboard);
  }

  function resetDashboardCardLayoutAttributes(card: HTMLElement) {
    card.removeAttribute("data-dashboard-size");
    delete card.dataset.dashboardCol;
    delete card.dataset.dashboardRow;
    card.style.removeProperty("grid-column");
    card.style.removeProperty("grid-column-start");
    card.style.removeProperty("grid-column-end");
    card.style.removeProperty("grid-row");
    card.style.removeProperty("grid-row-start");
    card.style.removeProperty("grid-row-end");
    card.classList.remove("isDragging", "isDashboardTopLocked", "isSizeMenuOpen");
    card.removeAttribute("draggable");
    card.querySelector(".dashboardSizeControl")?.remove();
  }

  function restoreDashboardSupportGridOwnership() {
    const supportGrid = getDashboardSupportGridEl();
    if (!supportGrid) return;
    DASHBOARD_SUPPORT_PANEL_IDS.forEach((panelId) => {
      const panel = document.querySelector(
        `#appPageDashboard [data-dashboard-id="${panelId}"]`
      ) as HTMLElement | null;
      if (!panel) return;
      supportGrid.appendChild(panel);
    });
  }

  function applyDashboardCardVisibility() {
    restoreDashboardSupportGridOwnership();
    collectDashboardPanelMeta().forEach(({ panel }) => {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
    });
    ctx.setDashboardCardVisibility({});
    ctx.syncDashboardRefreshButtonUi();
  }

  function loadDashboardWidgetState() {
    ctx.setDashboardCardSizes({});
    ctx.setDashboardCardPlacements({});
    ctx.setDashboardCardVisibility({});
    ensureDashboardIncludedModesValid();
  }

  function applyDashboardCardSizes() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    restoreDashboardSupportGridOwnership();
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      resetDashboardCardLayoutAttributes(el as HTMLElement);
    });
  }

  function applyDashboardOrderFromStorage() {
    applyDashboardCardSizes();
  }

  function applyDashboardOrder(order: string[] | null | undefined) {
    void order;
    applyDashboardCardSizes();
  }

  function applyDashboardEditMode() {
    ctx.setDashboardEditMode(false);
    ctx.setDashboardDragEl(null);
    applyDashboardCardSizes();
    ctx.syncDashboardMenuFlipUi();
  }

  function renderDashboardWidgets(opts?: DashboardRenderOptions) {
    ctx.renderDashboardWidgets(opts);
  }

  function getDashboardActivityDayTarget(target: EventTarget | null) {
    return ((target as HTMLElement | null)?.closest?.("[data-dashboard-activity-day]") || null) as HTMLElement | null;
  }

  function openDashboardActivityTarget(target: EventTarget | null) {
    const activityDayTarget = getDashboardActivityDayTarget(target);
    const dayKey = String(activityDayTarget?.getAttribute("data-dashboard-activity-day") || "").trim();
    return dayKey ? ctx.openDashboardActivityDaySummary(dayKey) : false;
  }

  function clearDashboardActivityLongPress() {
    if (activityLongPressTimer != null) {
      clearTimeout(activityLongPressTimer);
      activityLongPressTimer = null;
    }
    activityLongPressDayKey = "";
    activityLongPressStartX = 0;
    activityLongPressStartY = 0;
  }

  function beginDashboardActivityLongPress(target: EventTarget | null, clientX: number, clientY: number) {
    const activityDayTarget = getDashboardActivityDayTarget(target);
    const dayKey = String(activityDayTarget?.getAttribute("data-dashboard-activity-day") || "").trim();
    clearDashboardActivityLongPress();
    if (!dayKey) return;
    activityLongPressDayKey = dayKey;
    activityLongPressStartX = clientX;
    activityLongPressStartY = clientY;
    activityLongPressTimer = setTimeout(() => {
      const targetDayKey = activityLongPressDayKey;
      clearDashboardActivityLongPress();
      if (targetDayKey) ctx.openDashboardActivityDaySummary(targetDayKey);
    }, DASHBOARD_ACTIVITY_LONG_PRESS_MS);
  }

  function moveDashboardActivityLongPress(clientX: number, clientY: number, target?: EventTarget | null) {
    if (activityLongPressTimer == null) return;
    const dx = clientX - activityLongPressStartX;
    const dy = clientY - activityLongPressStartY;
    const movedTooFar = Math.hypot(dx, dy) > DASHBOARD_ACTIVITY_LONG_PRESS_MOVE_TOLERANCE_PX;
    const currentTarget = target == null ? null : getDashboardActivityDayTarget(target);
    const currentDayKey = String(currentTarget?.getAttribute("data-dashboard-activity-day") || "");
    if (movedTooFar || (target != null && !currentTarget) || (currentDayKey && currentDayKey !== activityLongPressDayKey)) {
      clearDashboardActivityLongPress();
    }
  }

  function handleDashboardGridClick(e: any) {
    const activityPageBtn = e.target?.closest?.("[data-dashboard-activity-page]") as HTMLButtonElement | null;
    if (activityPageBtn) {
      const direction = String(activityPageBtn.getAttribute("data-dashboard-activity-page") || "").trim();
      if (!activityPageBtn.disabled) ctx.pageDashboardActivityOverview(direction);
      e.preventDefault();
      return;
    }
    const heatDayBtn = e.target?.closest?.(".dashboardHeatDayCell.isInteractive[data-heat-date]") as HTMLElement | null;
    if (heatDayBtn) {
      const dayKey = String(heatDayBtn.getAttribute("data-heat-date") || "").trim();
      const dateLabel = String(heatDayBtn.getAttribute("data-heat-date-label") || "").trim();
      if (dayKey) ctx.openDashboardHeatSummaryCard(dayKey, dateLabel);
      e.preventDefault();
      return;
    }
    const heatSummaryTaskBtn = e.target?.closest?.("[data-heat-summary-mode='task'][data-heat-task-id][data-heat-date]") as HTMLElement | null;
    if (heatSummaryTaskBtn) {
      const taskId = String(heatSummaryTaskBtn.getAttribute("data-heat-task-id") || "").trim();
      const dayKey = String(heatSummaryTaskBtn.getAttribute("data-heat-date") || "").trim();
      if (taskId && dayKey) ctx.openDashboardHeatTaskSummary(dayKey, taskId);
      e.preventDefault();
      return;
    }
    const momentumDriverBtn = e.target?.closest?.("[data-dashboard-momentum-driver]") as HTMLElement | null;
    if (momentumDriverBtn) {
      const driverKey = String(momentumDriverBtn.getAttribute("data-dashboard-momentum-driver") || "").trim();
      ctx.selectDashboardMomentumDriver(driverKey);
      e.preventDefault();
      return;
    }
    const momentumDriversArea = els.dashboardMomentumDrivers as HTMLElement | null;
    const clickedInsideMomentumDrivers = !!momentumDriversArea?.contains(e.target as Node | null);
    if (ctx.hasSelectedDashboardMomentumDriver() && !clickedInsideMomentumDrivers) {
      ctx.clearDashboardMomentumDriverSelection();
    }
  }

  function handleDashboardActivityDoubleClick(e: any) {
    if (!openDashboardActivityTarget(e.target)) return;
    e.preventDefault?.();
  }

  function handleDashboardActivityKeydown(e: any) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!openDashboardActivityTarget(e.target)) return;
    e.preventDefault?.();
  }

  function registerDashboardEvents() {
    const dashboardInteractionRoot = els.appPageDashboard || els.dashboardGrid;
    ctx.on(dashboardInteractionRoot, "click", handleDashboardGridClick);
    ctx.on(dashboardInteractionRoot, "dblclick", handleDashboardActivityDoubleClick);
    ctx.on(dashboardInteractionRoot, "keydown", handleDashboardActivityKeydown);
    ctx.on(
      dashboardInteractionRoot,
      "touchstart",
      (e: any) => {
        if (!e.touches || e.touches.length !== 1) return;
        const touch = e.touches[0];
        beginDashboardActivityLongPress(e.target, touch.clientX, touch.clientY);
      },
      { passive: true }
    );
    ctx.on(
      dashboardInteractionRoot,
      "touchmove",
      (e: any) => {
        const touch = e.touches && e.touches[0] ? e.touches[0] : null;
        if (!touch) {
          clearDashboardActivityLongPress();
          return;
        }
        moveDashboardActivityLongPress(touch.clientX, touch.clientY, e.target);
      },
      { passive: true }
    );
    ctx.on(dashboardInteractionRoot, "touchend", clearDashboardActivityLongPress, { passive: true });
    ctx.on(dashboardInteractionRoot, "touchcancel", clearDashboardActivityLongPress, { passive: true });
    ctx.on(dashboardInteractionRoot, "pointerleave", clearDashboardActivityLongPress);
    ctx.on(window as any, "scroll", clearDashboardActivityLongPress, { passive: true, capture: true });
    ctx.on(window as any, "resize", () => {
      clearDashboardActivityLongPress();
      applyDashboardCardSizes();
      ctx.renderDashboardWidgets();
    });
    ctx.on(els.dashboardHeatSummaryCloseBtn, "click", () => {
      ctx.closeDashboardHeatSummaryCard({ restoreFocus: true });
    });
  }

  return {
    renderDashboardWidgets,
    saveDashboardWidgetState,
    getDashboardCardSizeMapForStorage: () => ({}),
    ensureDashboardIncludedModesValid,
    loadDashboardWidgetState,
    applyDashboardCardVisibility,
    applyDashboardCardSizes,
    applyDashboardOrderFromStorage,
    applyDashboardEditMode,
    registerDashboardEvents,
    applyDashboardOrder,
  };
}
