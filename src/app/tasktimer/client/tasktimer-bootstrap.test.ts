import { describe, expect, it, vi } from "vitest";

import { bootstrapTaskTimerRuntime, runInitialTaskTimerHydration } from "./tasktimer-bootstrap";

function createBootstrapOptions(overrides: Partial<Parameters<typeof bootstrapTaskTimerRuntime>[0]> = {}) {
  return {
    hydrateUiStateFromCaches: vi.fn(),
    subscribeToCheckpointAlertMuteSignals: vi.fn(),
    refreshOwnSharedSummaries: vi.fn(async () => undefined),
    refreshGroupsData: vi.fn(async () => undefined),
    reconcileOwnedSharedSummaryStates: vi.fn(),
    render: vi.fn(),
    currentAppPage: "tasks",
    openHistoryTaskIds: new Set<string>(),
    renderHistory: vi.fn(),
    initMobileBackHandling: vi.fn(),
    initCloudRefreshSync: vi.fn(),
    runtimeDestroyed: vi.fn(() => false),
    eventsWired: vi.fn(() => false),
    setEventsWired: vi.fn(),
    wireEvents: vi.fn(),
    onWindowPendingPush: vi.fn(),
    maybeOpenImportFromQuery: vi.fn(),
    syncDashboardMenuFlipUi: vi.fn(),
    syncDashboardRefreshButtonUi: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof bootstrapTaskTimerRuntime>[0];
}

describe("bootstrapTaskTimerRuntime", () => {
  it("refreshes Friends data when booting directly on the Friends page", async () => {
    const refreshOwnSharedSummaries = vi.fn(async () => undefined);
    const refreshGroupsData = vi.fn(async () => undefined);
    const options = createBootstrapOptions({
      currentAppPage: "friends",
      refreshOwnSharedSummaries,
      refreshGroupsData,
    });

    bootstrapTaskTimerRuntime(options);
    await refreshOwnSharedSummaries.mock.results[0].value;
    await Promise.resolve();

    expect(refreshGroupsData).toHaveBeenCalledTimes(1);
  });

  it("refreshes Friends data when booting other pages so nav request badges have state", async () => {
    const refreshOwnSharedSummaries = vi.fn(async () => undefined);
    const refreshGroupsData = vi.fn(async () => undefined);
    const options = createBootstrapOptions({
      currentAppPage: "dashboard",
      refreshOwnSharedSummaries,
      refreshGroupsData,
    });

    bootstrapTaskTimerRuntime(options);
    await refreshOwnSharedSummaries.mock.results[0].value;
    await Promise.resolve();

    expect(refreshGroupsData).toHaveBeenCalledTimes(1);
  });
});

function createInitialHydrationOptions(overrides: Partial<Parameters<typeof runInitialTaskTimerHydration>[0]> = {}) {
  return {
    currentAppPage: "dashboard",
    finishBootstrapUi: vi.fn(),
    setDashboardRefreshPending: vi.fn(),
    currentUid: vi.fn(() => "uid-1"),
    startInitialAuthHydration: vi.fn(),
    finishInitialAuthHydration: vi.fn(),
    rehydrateFromCloudAndRender: vi.fn(async () => undefined),
    ...overrides,
  } satisfies Parameters<typeof runInitialTaskTimerHydration>[0];
}

describe("runInitialTaskTimerHydration", () => {
  it("renders cached signed-in workspace before refreshing cloud state", async () => {
    const options = createInitialHydrationOptions({
      hasCachedWorkspace: vi.fn(() => true),
    });

    runInitialTaskTimerHydration(options);
    await Promise.resolve();

    expect(options.startInitialAuthHydration).not.toHaveBeenCalled();
    expect(options.finishBootstrapUi).toHaveBeenCalledTimes(1);
    expect(options.finishInitialAuthHydration).toHaveBeenCalledTimes(1);
    expect(options.rehydrateFromCloudAndRender).toHaveBeenCalledTimes(1);
  });

  it("keeps the initial loading overlay when no signed-in cache is available", async () => {
    const options = createInitialHydrationOptions({
      hasCachedWorkspace: vi.fn(() => false),
    });

    runInitialTaskTimerHydration(options);
    await Promise.resolve();
    await Promise.resolve();

    expect(options.startInitialAuthHydration).toHaveBeenCalledWith("Loading your workspace into this session...");
    expect(options.finishBootstrapUi).toHaveBeenCalledTimes(1);
    expect(options.finishInitialAuthHydration).toHaveBeenCalledTimes(1);
  });
});
