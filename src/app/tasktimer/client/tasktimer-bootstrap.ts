type BootstrapOptions = {
  hydrateUiStateFromCaches: (opts?: { skipDashboardWidgetsRender?: boolean }) => void;
  subscribeToCheckpointAlertMuteSignals: () => void;
  refreshOwnSharedSummaries: () => Promise<unknown>;
  refreshGroupsData: () => Promise<unknown>;
  reconcileOwnedSharedSummaryStates: () => void;
  render: () => void;
  currentAppPage: string;
  openHistoryTaskIds: Set<string>;
  renderHistory: (taskId: string) => void;
  initMobileBackHandling: () => void;
  initCloudRefreshSync: () => void;
  runtimeDestroyed: () => boolean;
  eventsWired: () => boolean;
  setEventsWired: (value: boolean) => void;
  wireEvents: () => void;
  onWindowPendingPush: () => void;
  maybeOpenImportFromQuery: () => void;
  syncDashboardMenuFlipUi: () => void;
  syncDashboardRefreshButtonUi: () => void;
};

type FinishBootstrapOptions = {
  runtimeDestroyed: () => boolean;
  render: () => void;
  maybeHandlePendingTaskJump: () => void;
  maybeHandlePendingPushAction: () => void;
  hasTaskList: () => boolean;
  hasHistoryManagerScreen: () => boolean;
  openHistoryManager: () => void;
  tickStarted: () => boolean;
  tickApi: () => void;
  setTickStarted: (value: boolean) => void;
};

type InitialHydrationOptions = {
  currentAppPage: string;
  finishBootstrapUi: () => void;
  setDashboardRefreshPending: (value: boolean) => void;
  currentUid: () => string | null;
  hasCachedWorkspace?: () => boolean;
  startInitialAuthHydration: (message?: string) => void;
  finishInitialAuthHydration: () => void;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<unknown>;
};

const DEFAULT_INITIAL_AUTH_HYDRATION_MESSAGE = "Loading your workspace into this session...";
const LEADERBOARD_INITIAL_AUTH_HYDRATION_MESSAGE = "Loading leaderboard standings...";

export function getInitialAuthHydrationMessage(currentAppPage: string) {
  return currentAppPage === "leaderboard" ? LEADERBOARD_INITIAL_AUTH_HYDRATION_MESSAGE : DEFAULT_INITIAL_AUTH_HYDRATION_MESSAGE;
}

export function shouldShowInitialAuthHydrationOverlay(currentAppPage: string) {
  return currentAppPage !== "leaderboard";
}

export function bootstrapTaskTimerRuntime(options: BootstrapOptions) {
  options.hydrateUiStateFromCaches();
  options.subscribeToCheckpointAlertMuteSignals();
  void options
    .refreshOwnSharedSummaries()
    .then(() => options.reconcileOwnedSharedSummaryStates())
    .then(() => {
      options.render();
      void options.refreshGroupsData().catch(() => {});
      if (options.currentAppPage === "tasks") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (options.runtimeDestroyed() || options.currentAppPage !== "tasks") return;
            for (const taskId of options.openHistoryTaskIds) {
              options.renderHistory(taskId);
            }
          });
        });
      }
    })
    .catch(() => {});
  options.initMobileBackHandling();
  options.initCloudRefreshSync();
  if (!options.eventsWired()) {
    options.wireEvents();
    options.setEventsWired(true);
  }
  options.onWindowPendingPush();
  options.maybeOpenImportFromQuery();
  options.syncDashboardMenuFlipUi();
  options.syncDashboardRefreshButtonUi();
}

export function finishTaskTimerBootstrapUi(options: FinishBootstrapOptions) {
  if (options.runtimeDestroyed()) return;
  options.render();
  options.maybeHandlePendingTaskJump();
  options.maybeHandlePendingPushAction();
  if (!options.hasTaskList() && options.hasHistoryManagerScreen()) {
    options.openHistoryManager();
  }
  if (!options.tickStarted()) {
    options.tickApi();
    options.setTickStarted(true);
  }
}

export function runInitialTaskTimerHydration(options: InitialHydrationOptions) {
  const shouldHydrateBeforeInteractiveBoot = !!options.currentUid();
  if (shouldHydrateBeforeInteractiveBoot) {
    if (options.hasCachedWorkspace?.()) {
      options.finishBootstrapUi();
      options.finishInitialAuthHydration();
      void options.rehydrateFromCloudAndRender().catch(() => {
        // Keep cached state if the initial cloud hydrate is unavailable.
      });
      return;
    }
    if (shouldShowInitialAuthHydrationOverlay(options.currentAppPage)) {
      options.startInitialAuthHydration(getInitialAuthHydrationMessage(options.currentAppPage));
    }
    void options
      .rehydrateFromCloudAndRender()
      .catch(() => {
        // Fall back to cached state if the initial cloud hydrate is unavailable.
      })
      .finally(() => {
        options.finishBootstrapUi();
        options.finishInitialAuthHydration();
      });
    return;
  }

  options.finishBootstrapUi();
  options.finishInitialAuthHydration();
  void options.rehydrateFromCloudAndRender();
}
