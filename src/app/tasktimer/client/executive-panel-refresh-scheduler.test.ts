import { describe, expect, it, vi } from "vitest";

import {
  createExecutivePanelRefreshScheduler,
  EXECUTIVE_PANEL_REFRESH_INTERVAL_MS,
} from "./executive-panel-refresh-scheduler";

describe("Executive panel refresh scheduler", () => {
  it("loads once per app session and does not reload when Executive is revisited", () => {
    let page = "tasks";
    const refreshPanels = vi.fn();
    const setIntervalRef = vi.fn(() => 1);
    const scheduler = createExecutivePanelRefreshScheduler({
      getCurrentAppPage: () => page,
      refreshPanels,
      setIntervalRef,
      clearIntervalRef: vi.fn(),
    });

    scheduler.syncForCurrentPage();
    page = "executive";
    scheduler.handlePageChange();
    page = "tasks";
    scheduler.handlePageChange();
    page = "executive";
    scheduler.handlePageChange();

    expect(refreshPanels).toHaveBeenCalledTimes(1);
    expect(setIntervalRef).toHaveBeenCalledWith(expect.any(Function), EXECUTIVE_PANEL_REFRESH_INTERVAL_MS);
    expect(setIntervalRef).toHaveBeenCalledTimes(2);
  });

  it("refreshes every fifteen minutes only while Executive is visible and clears the interval", () => {
    let page = "executive";
    const refreshPanels = vi.fn();
    let intervalHandler: (() => void) | undefined;
    const clearIntervalRef = vi.fn();
    const scheduler = createExecutivePanelRefreshScheduler({
      getCurrentAppPage: () => page,
      refreshPanels,
      setIntervalRef: (handler) => {
        intervalHandler = handler;
        return 42;
      },
      clearIntervalRef,
    });

    scheduler.syncForCurrentPage();
    intervalHandler?.();
    page = "tasks";
    intervalHandler?.();
    scheduler.handlePageChange();
    scheduler.destroy();

    expect(refreshPanels).toHaveBeenCalledTimes(2);
    expect(clearIntervalRef).toHaveBeenCalledWith(42);
  });

  it("refreshes immediately after an explicit plan change only on Executive", () => {
    let page = "tasks";
    const refreshPanels = vi.fn();
    const scheduler = createExecutivePanelRefreshScheduler({
      getCurrentAppPage: () => page,
      refreshPanels,
      setIntervalRef: vi.fn(() => 1),
      clearIntervalRef: vi.fn(),
    });

    scheduler.refreshAfterPlanChange();
    page = "executive";
    scheduler.refreshAfterPlanChange();

    expect(refreshPanels).toHaveBeenCalledTimes(1);
  });
});
