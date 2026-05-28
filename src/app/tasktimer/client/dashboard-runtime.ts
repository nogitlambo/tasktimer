import { localDayKey } from "../lib/history";
import { measureDashboardRender } from "../lib/dashboardPerformance";
import { buildDashboardRenderSummary } from "../lib/dashboardViewModel";
import type { DashboardRenderOptions } from "./types";
import type { AppPage } from "./types";
import type { Task, DeletedTaskMeta, HistoryByTaskId } from "../lib/types";

type DashboardWidgetRenderSummaryState = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  dynamicColorsEnabled: boolean;
  currentDayKey: string;
  nowMs: number;
};

type CreateDashboardRuntimeOptions = {
  documentRef: Document;
  nowMs: () => number;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  getDynamicColorsEnabled: () => boolean;
  getCurrentAppPage: () => AppPage;
  getDashboardMenuFlipped: () => boolean;
  getDashboardRefreshPending: () => boolean;
  setLastDashboardLiveSignature: (value: string) => void;
  getLastDashboardLiveSignature: () => string;
  isDashboardBusy: () => boolean;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderDashboardLiveWidgets: () => void;
  getDashboardShellScene: () => HTMLElement | null;
  getDashboardShellContent: () => HTMLElement | null;
};

function buildSummaryState(options: CreateDashboardRuntimeOptions): DashboardWidgetRenderSummaryState {
  return {
    tasks: options.getTasks(),
    historyByTaskId: options.getHistoryByTaskId(),
    deletedTaskMeta: options.getDeletedTaskMeta(),
    dynamicColorsEnabled: options.getDynamicColorsEnabled(),
    currentDayKey: localDayKey(options.nowMs()),
    nowMs: options.nowMs(),
  };
}

export function createTaskTimerDashboardRuntime(options: CreateDashboardRuntimeOptions) {
  function syncDashboardRefreshButtonUi() {
  }

  function syncDashboardMenuFlipUi() {
    const sceneEl = options.getDashboardShellScene();
    const frontEl = options.getDashboardShellContent();
    sceneEl?.classList.remove("isFlipped");
    if (frontEl) {
      frontEl.setAttribute("aria-hidden", "false");
      frontEl.removeAttribute("inert");
      frontEl.classList.remove("isBackfaceHidden");
    }
    syncDashboardRefreshButtonUi();
  }

  function renderDashboardWidgetsWithBusy(opts?: DashboardRenderOptions & { showBusy?: boolean; busyMessage?: string; showIndicator?: (message: string) => number; hideIndicator?: (key?: number) => void }) {
    const summary = buildDashboardRenderSummary(buildSummaryState(options));
    const shouldShowBusy = options.getCurrentAppPage() === "dashboard" && opts?.showBusy === true;
    if (!shouldShowBusy) {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        options.renderDashboardWidgets(opts);
      });
      options.setLastDashboardLiveSignature(summary.liveSignature);
      return;
    }
    const busyKey = opts?.showIndicator?.(opts.busyMessage || "Refreshing...");
    try {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        options.renderDashboardWidgets(opts);
      });
      options.setLastDashboardLiveSignature(summary.liveSignature);
    } finally {
      opts?.hideIndicator?.(busyKey);
    }
  }

  function renderDashboardLiveWidgetsWithMemo() {
    const summary = buildDashboardRenderSummary(buildSummaryState(options));
    if (summary.runningTaskCount > 0 && summary.liveSignature === options.getLastDashboardLiveSignature()) {
      measureDashboardRender("live", summary.liveSignature, true, () => undefined);
      return;
    }
    measureDashboardRender("live", summary.liveSignature, false, () => {
      options.renderDashboardLiveWidgets();
    });
    options.setLastDashboardLiveSignature(summary.liveSignature);
  }

  return {
    syncDashboardRefreshButtonUi,
    syncDashboardMenuFlipUi,
    renderDashboardWidgetsWithBusy,
    renderDashboardLiveWidgetsWithMemo,
  };
}
