import { describe, expect, it, vi } from "vitest";

import {
  bootstrapTaskTimerRuntime,
  finishTaskTimerBootstrapUi,
  runInitialTaskTimerHydration,
} from "./tasktimer-bootstrap";

describe("tasktimer-bootstrap", () => {
  it("wires events only once during runtime bootstrap", () => {
    const wireEvents = vi.fn();
    const setEventsWired = vi.fn();

    bootstrapTaskTimerRuntime({
      hydrateUiStateFromCaches: vi.fn(),
      subscribeToCheckpointAlertMuteSignals: vi.fn(),
      refreshOwnSharedSummaries: () => Promise.resolve(),
      reconcileOwnedSharedSummaryStates: vi.fn(),
      render: vi.fn(),
      currentAppPage: "dashboard",
      openHistoryTaskIds: new Set<string>(),
      renderHistory: vi.fn(),
      initMobileBackHandling: vi.fn(),
      initCloudRefreshSync: vi.fn(),
      runtimeDestroyed: () => false,
      eventsWired: () => false,
      setEventsWired,
      wireEvents,
      onWindowPendingPush: vi.fn(),
      onWindowArchieNavigate: vi.fn(),
      maybeOpenImportFromQuery: vi.fn(),
      syncDashboardMenuFlipUi: vi.fn(),
      syncDashboardRefreshButtonUi: vi.fn(),
    });

    expect(wireEvents).toHaveBeenCalledTimes(1);
    expect(setEventsWired).toHaveBeenCalledWith(true);
  });

  it("finishes bootstrap ui by rendering and starting the tick once", () => {
    const render = vi.fn();
    const maybeHandlePendingTaskJump = vi.fn();
    const maybeHandlePendingPushAction = vi.fn();
    const tickApi = vi.fn();
    const setTickStarted = vi.fn();

    finishTaskTimerBootstrapUi({
      runtimeDestroyed: () => false,
      render,
      maybeHandlePendingTaskJump,
      maybeHandlePendingPushAction,
      hasTaskList: () => true,
      hasHistoryManagerScreen: () => false,
      openHistoryManager: vi.fn(),
      tickStarted: () => false,
      tickApi,
      setTickStarted,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(maybeHandlePendingTaskJump).toHaveBeenCalledTimes(1);
    expect(maybeHandlePendingPushAction).toHaveBeenCalledTimes(1);
    expect(tickApi).toHaveBeenCalledTimes(1);
    expect(setTickStarted).toHaveBeenCalledWith(true);
  });

  it("runs initial hydration immediately for dashboard and marks refresh pending", () => {
    const finishBootstrapUi = vi.fn();
    const setDashboardRefreshPending = vi.fn();
    const startInitialAuthHydration = vi.fn();
    const finishInitialAuthHydration = vi.fn();
    const rehydrateFromCloudAndRender = vi.fn(() => Promise.resolve());

    runInitialTaskTimerHydration({
      currentAppPage: "dashboard",
      finishBootstrapUi,
      setDashboardRefreshPending,
      startInitialAuthHydration,
      finishInitialAuthHydration,
      currentUid: () => "",
      rehydrateFromCloudAndRender,
    });

    expect(finishBootstrapUi).toHaveBeenCalledTimes(1);
    expect(setDashboardRefreshPending).not.toHaveBeenCalled();
    expect(rehydrateFromCloudAndRender).toHaveBeenCalledTimes(1);
  });

  it("hydrates authenticated dashboard before finishing bootstrap and clears the auth loading gate", async () => {
    const finishBootstrapUi = vi.fn();
    const setDashboardRefreshPending = vi.fn();
    const startInitialAuthHydration = vi.fn();
    const finishInitialAuthHydration = vi.fn();
    const rehydrateFromCloudAndRender = vi.fn(() => Promise.resolve());

    runInitialTaskTimerHydration({
      currentAppPage: "dashboard",
      finishBootstrapUi,
      setDashboardRefreshPending,
      startInitialAuthHydration,
      finishInitialAuthHydration,
      currentUid: () => "user-1",
      rehydrateFromCloudAndRender,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(startInitialAuthHydration).toHaveBeenCalledTimes(1);
    expect(rehydrateFromCloudAndRender).toHaveBeenCalledTimes(1);
    expect(finishBootstrapUi).toHaveBeenCalledTimes(1);
    expect(finishInitialAuthHydration).toHaveBeenCalledTimes(1);
    expect(setDashboardRefreshPending).not.toHaveBeenCalled();
  });
});
