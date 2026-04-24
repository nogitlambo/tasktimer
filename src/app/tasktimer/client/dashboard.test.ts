import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerDashboard } from "./dashboard";
import type { TaskTimerDashboardContext } from "./context";
import type { AppPage, DashboardAvgRange, DashboardTimelineDensity } from "./types";
import type { DashboardWeekStart } from "../lib/historyChart";

describe("dashboard momentum driver delegation", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        querySelector: vi.fn(() => null),
        getElementById: vi.fn(() => null),
      },
    });
  });

  function createContext() {
    const appPageDashboard = new EventTarget() as unknown as HTMLElement;
    const dashboardGrid = new EventTarget() as unknown as HTMLElement;
    const dashboardPanelMenuList = new EventTarget() as unknown as HTMLElement;
    const dashboardPanelMenuBtn = new EventTarget() as unknown as HTMLElement;
    const dashboardPanelMenuBackBtn = new EventTarget() as unknown as HTMLButtonElement;
    const dashboardEditBtn = new EventTarget() as unknown as HTMLButtonElement;
    const dashboardEditCancelBtn = new EventTarget() as unknown as HTMLButtonElement;
    const dashboardEditDoneBtn = new EventTarget() as unknown as HTMLButtonElement;
    const dashboardXpProgressHelpBtn = new EventTarget() as unknown as HTMLButtonElement;
    const dashboardHeatSummaryCloseBtn = new EventTarget() as unknown as HTMLButtonElement;
    const on = vi.fn();
    const selectDashboardMomentumDriver = vi.fn();

    const ctx = {
      els: {
        appPageDashboard,
        dashboardGrid,
        dashboardPanelMenuList,
        dashboardPanelMenuBtn,
        dashboardPanelMenuBackBtn,
        dashboardEditBtn,
        dashboardEditCancelBtn,
        dashboardEditDoneBtn,
        dashboardXpProgressHelpBtn,
        dashboardHeatSummaryCloseBtn,
        dashboardMomentumDrivers: null,
      } as TaskTimerDashboardContext["els"],
      on,
      syncDashboardRefreshButtonUi: vi.fn(),
      hasEntitlement: vi.fn(() => true),
      showUpgradePrompt: vi.fn(),
      getRewardProgress: vi.fn(() => ({}) as never),
      getTasks: vi.fn(() => []),
      getHistoryByTaskId: vi.fn(() => ({})),
      getWeekStarting: vi.fn(() => "monday" as DashboardWeekStart),
      getCurrentAppPage: vi.fn(() => "dashboard" as AppPage),
      getDashboardMenuFlipped: vi.fn(() => false),
      setDashboardMenuFlipped: vi.fn(),
      syncDashboardMenuFlipUi: vi.fn(),
      getDashboardEditMode: vi.fn(() => false),
      setDashboardEditMode: vi.fn(),
      getDashboardDragEl: vi.fn(() => null),
      setDashboardDragEl: vi.fn(),
      getDashboardOrderDraftBeforeEdit: vi.fn(() => null),
      setDashboardOrderDraftBeforeEdit: vi.fn(),
      getDashboardCardSizes: vi.fn(() => ({})),
      setDashboardCardSizes: vi.fn(),
      getDashboardCardSizesDraftBeforeEdit: vi.fn(() => null),
      setDashboardCardSizesDraftBeforeEdit: vi.fn(),
      getDashboardCardVisibility: vi.fn(() => ({})),
      setDashboardCardVisibility: vi.fn(),
      getDashboardAvgRange: vi.fn(() => "past7" as DashboardAvgRange),
      setDashboardAvgRange: vi.fn(),
      getDashboardTimelineDensity: vi.fn(() => "medium" as DashboardTimelineDensity),
      setDashboardTimelineDensity: vi.fn(),
      getCloudDashboardCache: vi.fn(() => null),
      setCloudDashboardCache: vi.fn(),
      loadCachedDashboard: vi.fn(() => null),
      saveCloudDashboard: vi.fn(),
      renderDashboardWidgets: vi.fn(),
      renderDashboardTimelineCard: vi.fn(),
      selectDashboardTimelineSuggestion: vi.fn(),
      selectDashboardMomentumDriver,
      clearDashboardMomentumDriverSelection: vi.fn(),
      hasSelectedDashboardMomentumDriver: vi.fn(() => false),
      openDashboardHeatSummaryCard: vi.fn(),
      closeDashboardHeatSummaryCard: vi.fn(),
    } as unknown as TaskTimerDashboardContext;

    return { ctx, on, appPageDashboard, dashboardGrid, selectDashboardMomentumDriver };
  }

  it("registers dashboard clicks on the page container and delegates momentum driver clicks", () => {
    const { ctx, on, appPageDashboard, dashboardGrid, selectDashboardMomentumDriver } = createContext();

    const api = createTaskTimerDashboard(ctx);
    api.registerDashboardEvents();

    const clickBinding = on.mock.calls.find((call) => call[0] === appPageDashboard && call[1] === "click" && call[3] !== true);
    expect(clickBinding).toBeTruthy();
    expect(on.mock.calls.filter((call) => call[0] === dashboardGrid && call[1] === "click")).toHaveLength(0);

    const handleDashboardGridClick = clickBinding?.[2] as ((event: {
      target: { closest: (selector: string) => { getAttribute: (name: string) => string } | null };
      preventDefault: () => void;
    }) => void);

    const preventDefault = vi.fn();
    handleDashboardGridClick({
      target: {
        closest: (selector: string) =>
          selector === "[data-dashboard-momentum-driver]"
            ? {
                getAttribute: (name: string) => (name === "data-dashboard-momentum-driver" ? "consistency" : ""),
              }
            : null,
      },
      preventDefault,
    });

    expect(selectDashboardMomentumDriver).toHaveBeenCalledWith("consistency");
    expect(preventDefault).toHaveBeenCalled();
  });
});
