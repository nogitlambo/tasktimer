export const EXECUTIVE_PANEL_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type ExecutivePanelRefreshSchedulerOptions = {
  getCurrentAppPage: () => string;
  refreshPanels: () => void;
  setIntervalRef?: (handler: () => void, timeoutMs: number) => number;
  clearIntervalRef?: (timer: number) => void;
};

export function createExecutivePanelRefreshScheduler(
  options: ExecutivePanelRefreshSchedulerOptions,
) {
  const setIntervalRef = options.setIntervalRef ?? ((handler, timeoutMs) => window.setInterval(handler, timeoutMs));
  const clearIntervalRef = options.clearIntervalRef ?? ((timer) => window.clearInterval(timer));
  let hasLoadedThisSession = false;
  let intervalTimer: number | null = null;

  function refreshOnFirstLoad() {
    if (hasLoadedThisSession) return;
    hasLoadedThisSession = true;
    options.refreshPanels();
  }

  function startInterval() {
    if (intervalTimer != null) return;
    intervalTimer = setIntervalRef(() => {
      if (options.getCurrentAppPage() === "executive") options.refreshPanels();
    }, EXECUTIVE_PANEL_REFRESH_INTERVAL_MS);
  }

  function stopInterval() {
    if (intervalTimer == null) return;
    clearIntervalRef(intervalTimer);
    intervalTimer = null;
  }

  function syncForCurrentPage() {
    if (options.getCurrentAppPage() !== "executive") {
      stopInterval();
      return;
    }
    refreshOnFirstLoad();
    startInterval();
  }

  function handlePageChange() {
    syncForCurrentPage();
  }

  function refreshAfterPlanChange() {
    if (options.getCurrentAppPage() === "executive") options.refreshPanels();
  }

  function destroy() {
    stopInterval();
  }

  return { syncForCurrentPage, handlePageChange, refreshAfterPlanChange, destroy };
}
