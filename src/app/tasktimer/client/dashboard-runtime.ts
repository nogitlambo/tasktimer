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
  onboardingPreviewActive: boolean;
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
  getIsOnboardingDashboardPreview: () => boolean;
  getCurrentAppPage: () => AppPage;
  getDashboardMenuFlipped: () => boolean;
  getDashboardRefreshPending: () => boolean;
  setLastDashboardLiveSignature: (value: string) => void;
  getLastDashboardLiveSignature: () => string;
  isDashboardBusy: () => boolean;
  renderDashboardWidgets: (opts?: { includeAvgSession?: boolean }) => void;
  renderDashboardLiveWidgets: () => void;
  getDashboardRefreshBtn: () => HTMLButtonElement | null;
  getDashboardShellScene: () => HTMLElement | null;
  getDashboardShellContent: () => HTMLElement | null;
  getDashboardShellBack: () => HTMLElement | null;
  getDashboardPanelMenuBtn: () => HTMLButtonElement | null;
  getDashboardPanelMenuBackBtn: () => HTMLButtonElement | null;
};

function buildSummaryState(options: CreateDashboardRuntimeOptions): DashboardWidgetRenderSummaryState {
  return {
    tasks: options.getTasks(),
    historyByTaskId: options.getHistoryByTaskId(),
    deletedTaskMeta: options.getDeletedTaskMeta(),
    dynamicColorsEnabled: options.getDynamicColorsEnabled(),
    onboardingPreviewActive: options.getIsOnboardingDashboardPreview(),
    currentDayKey: localDayKey(options.nowMs()),
    nowMs: options.nowMs(),
  };
}

export function createTaskTimerDashboardRuntime(options: CreateDashboardRuntimeOptions) {
  function syncDashboardRefreshButtonUi() {
    const buttonEl = options.getDashboardRefreshBtn();
    if (!buttonEl) return;
    const isBusy = options.isDashboardBusy();
    const hasVisiblePanels = Array.from(
      options.documentRef.querySelectorAll(
        '#appPageDashboard .dashboardHeroPanel[data-dashboard-panel-id], #appPageDashboard .dashboardCard[data-dashboard-id]'
      )
    ).some((node) => !(node as HTMLElement).hidden);
    const dashboardMenuFlipped = options.getDashboardMenuFlipped();
    const dashboardRefreshPending = options.getDashboardRefreshPending();
    const isDisabled = isBusy || !hasVisiblePanels || dashboardMenuFlipped;
    buttonEl.disabled = isDisabled;
    buttonEl.classList.toggle("isPending", dashboardRefreshPending && !isBusy);
    buttonEl.classList.toggle("isBusy", isBusy);
    buttonEl.setAttribute(
      "aria-label",
      isBusy
        ? "Refreshing dashboard"
        : dashboardMenuFlipped
          ? "Refresh unavailable while dashboard settings are open"
          : !hasVisiblePanels
            ? "Refresh unavailable while all dashboard panels are hidden"
            : dashboardRefreshPending
              ? "Refresh dashboard, new data available"
              : "Refresh dashboard"
    );
    buttonEl.setAttribute(
      "title",
      isBusy
        ? "Refreshing dashboard"
        : dashboardMenuFlipped
          ? "Refresh unavailable"
          : !hasVisiblePanels
            ? "Refresh unavailable"
            : dashboardRefreshPending
              ? "Refresh available"
              : "Refresh dashboard"
    );
  }

  function syncDashboardMenuFlipUi() {
    const flipped = options.getDashboardMenuFlipped();
    const sceneEl = options.getDashboardShellScene();
    const frontEl = options.getDashboardShellContent();
    const backEl = options.getDashboardShellBack();
    const menuBtn = options.getDashboardPanelMenuBtn();
    const backBtn = options.getDashboardPanelMenuBackBtn();
    const editActionsEl = menuBtn?.closest(".dashboardEditActions") as HTMLElement | null;
    sceneEl?.classList.toggle("isFlipped", flipped);
    if (frontEl) {
      frontEl.setAttribute("aria-hidden", flipped ? "true" : "false");
      if (flipped) frontEl.setAttribute("inert", "");
      else frontEl.removeAttribute("inert");
      frontEl.classList.toggle("isBackfaceHidden", flipped);
    }
    if (backEl) {
      backEl.setAttribute("aria-hidden", flipped ? "false" : "true");
      if (!flipped) backEl.setAttribute("inert", "");
      else backEl.removeAttribute("inert");
    }
    if (menuBtn) menuBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
    if (backBtn) backBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
    if (editActionsEl) editActionsEl.classList.toggle("isMenuFlipped", flipped);
    syncDashboardRefreshButtonUi();
  }

  function renderDashboardWidgetsWithBusy(opts?: DashboardRenderOptions & { showBusy?: boolean; busyMessage?: string; showIndicator?: (message: string) => number; hideIndicator?: (key?: number) => void }) {
    const summary = buildDashboardRenderSummary(buildSummaryState(options));
    const renderOpts = opts ? { includeAvgSession: opts.includeAvgSession } : undefined;
    const shouldShowBusy = options.getCurrentAppPage() === "dashboard" && opts?.showBusy === true;
    if (!shouldShowBusy) {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        options.renderDashboardWidgets(renderOpts);
      });
      options.setLastDashboardLiveSignature(summary.liveSignature);
      return;
    }
    const busyKey = opts?.showIndicator?.(opts.busyMessage || "Refreshing...");
    try {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        options.renderDashboardWidgets(renderOpts);
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
