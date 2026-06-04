import { describe, expect, it } from "vitest";
import {
  createTaskTimerDashboard,
  isDashboardCardSizeOptionAllowed,
  sanitizeDashboardCardSize,
  shouldIgnoreDashboardPointerDragStartTarget,
  shouldOpenDashboardLockedUpgradePrompt,
  shouldUsePointerDashboardDrag,
} from "./dashboard";

function makeClosestTarget(matches: string[] = []) {
  return {
    closest: (selector: string) => (matches.includes(selector) ? { selector } : null),
  };
}

class DashboardElementStub {
  hidden = false;
  parentElement: DashboardElementStub | null = null;
  children: DashboardElementStub[] = [];
  dataset: Record<string, string> = {};
  private attrs = new Map<string, string>();
  private classes = new Set<string>();
  style: Record<string, string | ((name: string) => void)> = {
    removeProperty: (name: string) => {
      delete this.style[name];
    },
  };

  constructor(public readonly id = "") {}

  get classList() {
    return {
      remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    };
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  appendChild(child: DashboardElementStub) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string) {
    void selector;
    return null;
  }

  querySelectorAll(selector: string) {
    if (selector === ".dashboardCard[data-dashboard-id]") {
      const out: DashboardElementStub[] = [];
      const visit = (node: DashboardElementStub) => {
        node.children.forEach((child) => {
          if (child.getAttribute("data-dashboard-id")) out.push(child);
          visit(child);
        });
      };
      visit(this);
      return out;
    }
    return [];
  }
}

function makeDashboardContext() {
  const grid = new DashboardElementStub("dashboardGrid");
  const supportGrid = new DashboardElementStub("dashboardSupportGrid");
  const cardsById = new Map<string, DashboardElementStub>();
  const appendCard = (cardId: string, parent: DashboardElementStub) => {
    const card = new DashboardElementStub(cardId);
    card.setAttribute("data-dashboard-id", cardId);
    card.setAttribute("data-dashboard-size", "half");
    card.setAttribute("draggable", "true");
    card.dataset.dashboardCol = "7";
    card.dataset.dashboardRow = "4";
    card.style["grid-column"] = "7 / span 6";
    card.style["grid-row"] = "4";
    card.style["grid-row-start"] = "4";
    parent.appendChild(card);
    cardsById.set(cardId, card);
  };

  appendCard("activity-overview", grid);
  const activityOverview = cardsById.get("activity-overview")!;
  grid.appendChild(supportGrid);
  appendCard("tasks-completed", activityOverview);
  appendCard("momentum", grid);
  appendCard("heatmap", grid);

  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: (selector: string) => {
        if (selector === "#appPageDashboard .dashboardGrid") return grid;
        if (selector === "#appPageDashboard .dashboardSupportGrid") return supportGrid;
        const match = selector.match(/\[data-dashboard-id="([^"]+)"\]/);
        if (match) return cardsById.get(match[1]) ?? null;
        return null;
      },
    },
  });

  const dashboard = createTaskTimerDashboard({
    els: { dashboardGrid: grid, appPageDashboard: grid } as never,
    getCloudDashboardCache: () => null,
    loadCachedDashboard: () => null,
    setCloudDashboardCache: () => {},
    saveCloudDashboard: () => {},
    getDashboardCardVisibility: () => ({ momentum: false, heatmap: false }),
    setDashboardCardVisibility: () => {},
    getDashboardCardSizes: () => ({ momentum: "half" }),
    setDashboardCardSizes: () => {},
    getDashboardCardPlacements: () => ({ momentum: { col: 7, row: 4 } }),
    setDashboardCardPlacements: () => {},
    syncDashboardRefreshButtonUi: () => {},
    syncDashboardMenuFlipUi: () => {},
    setDashboardEditMode: () => {},
    setDashboardDragEl: () => {},
    renderDashboardWidgets: () => {},
    on: () => {},
    hasEntitlement: () => true,
    navigateToAppRoute: () => {},
    jumpToTaskById: () => {},
    openDashboardHeatSummaryCard: () => {},
    renderDashboardHeatTaskList: () => {},
    openDashboardHeatTaskSummary: () => {},
    selectDashboardMomentumDriver: () => {},
    hasSelectedDashboardMomentumDriver: () => false,
    clearDashboardMomentumDriverSelection: () => {},
    closeDashboardHeatSummaryCard: () => {},
  } as never);

  return {
    cardsById,
    dashboard,
    grid,
    restore: () => {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    },
    supportGrid,
  };
}

describe("dashboard drag interaction guards", () => {
  it("disables pointer dashboard drag after the integrated panel redesign", () => {
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: true })).toBe(false);
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: undefined })).toBe(false);
    expect(shouldUsePointerDashboardDrag({ button: 2, isPrimary: true })).toBe(false);
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: false })).toBe(false);
  });

  it("ignores all dashboard drag start targets", () => {
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget([".dashboardSizeControl"]))).toBe(true);
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget(["input, select, textarea"]))).toBe(true);
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget())).toBe(true);
    expect(shouldIgnoreDashboardPointerDragStartTarget(null)).toBe(true);
  });

  it("suppresses dashboard locked-card upgrade prompts because dashboard panels are unlocked", () => {
    expect(shouldOpenDashboardLockedUpgradePrompt(false)).toBe(false);
    expect(shouldOpenDashboardLockedUpgradePrompt(true)).toBe(false);
  });

  it("retires dashboard card size options", () => {
    expect(sanitizeDashboardCardSize("quarter", "activity-overview")).toBeNull();
    expect(sanitizeDashboardCardSize("half", "activity-overview")).toBeNull();
    expect(isDashboardCardSizeOptionAllowed("quarter", "activity-overview")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("half", "activity-overview")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("full", "activity-overview")).toBe(false);
    expect(sanitizeDashboardCardSize("quarter", "heatmap")).toBeNull();
    expect(sanitizeDashboardCardSize("quarter", "tasks-completed")).toBeNull();
    expect(sanitizeDashboardCardSize("eighth", "tasks-completed")).toBeNull();
    expect(isDashboardCardSizeOptionAllowed("quarter", "heatmap")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("quarter", "tasks-completed")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("half", "tasks-completed")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("full", "tasks-completed")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("half", "heatmap")).toBe(false);
  });

  it("normalizes support panels without moving Task Overview out of Activity Overview", () => {
    const harness = makeDashboardContext();

    try {
      harness.dashboard.applyDashboardOrder(["heatmap", "momentum"]);
      harness.dashboard.applyDashboardCardVisibility();

      ["momentum", "heatmap"].forEach((cardId) => {
        const card = harness.cardsById.get(cardId);
        expect(card?.parentElement).toBe(harness.supportGrid);
        expect(card?.hidden).toBe(false);
        expect(card?.getAttribute("aria-hidden")).toBe("false");
        expect(card?.getAttribute("data-dashboard-size")).toBeNull();
        expect(card?.getAttribute("draggable")).toBeNull();
        expect(card?.dataset.dashboardCol).toBeUndefined();
        expect(card?.dataset.dashboardRow).toBeUndefined();
        expect(card?.style["grid-column"]).toBeUndefined();
        expect(card?.style["grid-row"]).toBeUndefined();
        expect(card?.style["grid-row-start"]).toBeUndefined();
      });
      const taskOverview = harness.cardsById.get("tasks-completed");
      expect(taskOverview?.parentElement).toBe(harness.cardsById.get("activity-overview"));
      expect(taskOverview?.hidden).toBe(false);
      expect(taskOverview?.getAttribute("aria-hidden")).toBe("false");
      expect(taskOverview?.getAttribute("data-dashboard-size")).toBeNull();
      expect(taskOverview?.getAttribute("draggable")).toBeNull();
      expect(taskOverview?.dataset.dashboardCol).toBeUndefined();
      expect(taskOverview?.dataset.dashboardRow).toBeUndefined();
      expect(taskOverview?.style["grid-column"]).toBeUndefined();
      expect(taskOverview?.style["grid-row"]).toBeUndefined();
      expect(taskOverview?.style["grid-row-start"]).toBeUndefined();
      expect(harness.cardsById.get("activity-overview")?.parentElement).toBe(harness.grid);
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard heatmap click handling", () => {
  function makeAttributeTarget(selector: string, attrs: Record<string, string>) {
    return {
      closest: (candidate: string) =>
        candidate === selector
          ? {
              getAttribute: (name: string) => attrs[name] ?? null,
            }
          : null,
    };
  }

  it("opens the task-level heatmap summary from task rows", () => {
    const harness = makeDashboardContext();
    const calls: Array<{ dayKey: string; taskId: string }> = [];
    const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
    const originalWindow = (globalThis as { window?: unknown }).window;

    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {},
      });

      const dashboardWithTaskSummary = createTaskTimerDashboard({
        els: { dashboardGrid: harness.grid, appPageDashboard: harness.grid } as never,
        getCloudDashboardCache: () => null,
        loadCachedDashboard: () => null,
        setCloudDashboardCache: () => {},
        saveCloudDashboard: () => {},
        getDashboardCardVisibility: () => ({ momentum: false, heatmap: false }),
        setDashboardCardVisibility: () => {},
        getDashboardCardSizes: () => ({ momentum: "half" }),
        setDashboardCardSizes: () => {},
        getDashboardCardPlacements: () => ({ momentum: { col: 7, row: 4 } }),
        setDashboardCardPlacements: () => {},
        syncDashboardRefreshButtonUi: () => {},
        syncDashboardMenuFlipUi: () => {},
        setDashboardEditMode: () => {},
        setDashboardDragEl: () => {},
        renderDashboardWidgets: () => {},
        on: (_target: unknown, type: string, handler: (event: unknown) => void) => {
          if (_target === harness.grid && type === "click") {
            handler({
              target: makeAttributeTarget("[data-heat-summary-mode='task'][data-heat-task-id][data-heat-date]", {
                "data-heat-date": "2026-06-05",
                "data-heat-task-id": "focus",
              }),
              preventDefault: () => calls.push({ dayKey: "prevented", taskId: "default" }),
            });
          }
        },
        hasEntitlement: () => true,
        navigateToAppRoute: () => {},
        jumpToTaskById: () => {},
        openDashboardHeatSummaryCard: () => {},
        renderDashboardHeatTaskList: () => {},
        openDashboardHeatTaskSummary: (dayKey: string, taskId: string) => {
          calls.push({ dayKey, taskId });
          return true;
        },
        selectDashboardMomentumDriver: () => {},
        hasSelectedDashboardMomentumDriver: () => false,
        clearDashboardMomentumDriverSelection: () => {},
        closeDashboardHeatSummaryCard: () => {},
      } as never);

      dashboardWithTaskSummary.registerDashboardEvents();

      expect(calls).toEqual([
        { dayKey: "2026-06-05", taskId: "focus" },
        { dayKey: "prevented", taskId: "default" },
      ]);
    } finally {
      if (hadWindow) {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
      harness.restore();
    }
  });
});
