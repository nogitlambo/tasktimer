import { describe, expect, it, vi } from "vitest";

import { bootstrapTaskTimerRuntime } from "./tasktimer-bootstrap";

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

  it("does not refresh Friends data when booting other pages", async () => {
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

    expect(refreshGroupsData).not.toHaveBeenCalled();
  });
});
