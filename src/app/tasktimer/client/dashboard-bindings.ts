import type { TaskTimerDashboardBusyState } from "./dashboard-busy";
import { createTaskTimerDashboardBusy } from "./dashboard-busy";
import type { TaskTimerMutableStore } from "./mutable-store";
import type { DashboardRenderOptions } from "./types";

type CreateTaskTimerDashboardBindingsOptions = {
  setDashboardRefreshPendingValue: (value: boolean) => void;
  dashboardBusyState: TaskTimerMutableStore<TaskTimerDashboardBusyState>;
  dashboardRuntime: {
    syncDashboardRefreshButtonUi: () => void;
    syncDashboardMenuFlipUi: () => void;
    renderDashboardWidgetsWithBusy: (opts?: DashboardRenderOptions & {
      showBusy?: boolean;
      busyMessage?: string;
      showIndicator?: (message: string) => number;
      hideIndicator?: (key?: number) => void;
    }) => void;
    renderDashboardLiveWidgetsWithMemo: () => void;
  };
  nowMs: () => number;
  minVisibleMs: number;
  getOverlayEl: () => HTMLElement | null;
  getTextEl: () => HTMLElement | null;
  getShellContentEl: () => HTMLElement | null;
};

export function createTaskTimerDashboardBindings(options: CreateTaskTimerDashboardBindingsOptions) {
  let syncDashboardRefreshButtonUi = () => {};

  const dashboardBusyApi = createTaskTimerDashboardBusy({
    state: options.dashboardBusyState,
    nowMs: options.nowMs,
    minVisibleMs: options.minVisibleMs,
    getBusyTargets: () => [],
    getOverlayEl: options.getOverlayEl,
    getTextEl: options.getTextEl,
    getShellContentEl: options.getShellContentEl,
    syncDashboardRefreshButtonUi: () => syncDashboardRefreshButtonUi(),
  });

  syncDashboardRefreshButtonUi = options.dashboardRuntime.syncDashboardRefreshButtonUi;

  function setDashboardRefreshPending(nextPending: boolean) {
    options.setDashboardRefreshPendingValue(!!nextPending);
    syncDashboardRefreshButtonUi();
  }

  function showDashboardBusyIndicator(message = "Refreshing...") {
    return dashboardBusyApi.showIndicator(message);
  }

  function hideDashboardBusyIndicator(key?: number) {
    dashboardBusyApi.hideIndicator(key);
  }

  return {
    dashboardBusyApi,
    setDashboardRefreshPending,
    showDashboardBusyIndicator,
    hideDashboardBusyIndicator,
    syncDashboardRefreshButtonUi,
    syncDashboardMenuFlipUi: options.dashboardRuntime.syncDashboardMenuFlipUi,
    renderDashboardWidgetsWithBusy: (opts?: DashboardRenderOptions) =>
      options.dashboardRuntime.renderDashboardWidgetsWithBusy({
        ...opts,
        showIndicator: showDashboardBusyIndicator,
        hideIndicator: hideDashboardBusyIndicator,
      }),
    renderDashboardLiveWidgetsWithMemo: options.dashboardRuntime.renderDashboardLiveWidgetsWithMemo,
  };
}
