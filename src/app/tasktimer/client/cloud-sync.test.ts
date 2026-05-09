import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerCloudSync } from "./cloud-sync";

type StateAccessor<T> = {
  get: () => T;
  set: (value: T) => void;
};

function createStateAccessor<T>(initial: T): StateAccessor<T> {
  let current = initial;
  return {
    get: () => current,
    set: (value: T) => {
      current = value;
    },
  };
}

type OverlayStub = {
  dataset: Record<string, string>;
  style: { display: string };
  getAttribute: (name: string) => string | null;
};

function createDocumentStub() {
  const bodyAttributes = new Map<string, string>();
  const overlay: OverlayStub = {
    dataset: {},
    style: { display: "none" },
    getAttribute: (name: string) => (name === "aria-hidden" ? "true" : null),
  };
  return {
    body: {
      setAttribute: (name: string, value: string) => {
        bodyAttributes.set(name, value);
      },
      getAttribute: (name: string) => bodyAttributes.get(name) ?? null,
    },
    activeElement: null,
    visibilityState: "visible",
    getElementById: (id: string) => (id === "timeGoalCompleteOverlay" ? overlay : null),
  };
}

function createHarness(overrides?: {
  hasPendingTaskOrHistorySync?: boolean;
  lastCloudRefreshAtMs?: number;
}) {
  const cloudRefreshInFlight = createStateAccessor<Promise<void> | null>(null);
  const lastCloudRefreshAtMs = createStateAccessor<number>(overrides?.lastCloudRefreshAtMs ?? 0);
  const pendingDeferredCloudRefresh = createStateAccessor(false);
  const deferredCloudRefreshTimer = createStateAccessor<number | null>(null);
  const lastUiInteractionAtMs = createStateAccessor(0);
  const hydrateFromCloud = vi.fn(async () => {});
  const on = vi.fn();
  const nowMs = vi.fn(() => 10_000);
  const workspaceRepository = {
    hasPendingTaskOrHistorySync: vi.fn(() => overrides?.hasPendingTaskOrHistorySync === true),
    hydrateFromCloud,
    subscribeTaskCollection: vi.fn(() => () => {}),
    subscribeTaskLiveSessions: vi.fn(() => () => {}),
  };

  const documentStub = createDocumentStub();
  vi.stubGlobal("document", documentStub);
  documentStub.body.setAttribute("data-app-page", "tasks");

  const api = createTaskTimerCloudSync({
    workspaceRepository,
    runtime: {
      destroyed: false,
      removeCloudTaskCollectionListener: null,
      removeCapAppStateListener: null,
      removeAuthStateListener: null,
    },
    on,
    nowMs,
    getCapAppPlugin: () => null,
    cloudRefreshInFlight,
    lastCloudRefreshAtMs,
    pendingDeferredCloudRefresh,
    deferredCloudRefreshTimer,
    lastUiInteractionAtMs,
    hydrateUiStateFromCaches: vi.fn(),
    syncTimeGoalModalWithTaskState: vi.fn(),
    render: vi.fn(),
    renderDashboardWidgets: vi.fn(),
    maybeHandlePendingTaskJump: vi.fn(),
    maybeHandlePendingPushAction: vi.fn(),
    maybeRestorePendingTimeGoalFlow: vi.fn(),
    currentUid: () => "user-1",
    getTasks: () => [],
    setDashboardRefreshPending: vi.fn(),
  });

  return {
    api,
    workspaceRepository,
    hydrateFromCloud,
    pendingDeferredCloudRefresh,
    deferredCloudRefreshTimer,
    cloudRefreshInFlight,
  };
}

describe("task timer cloud sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", createDocumentStub());
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
  });

  it("defers resume refreshes while local task or history sync is pending", () => {
    const harness = createHarness({ hasPendingTaskOrHistorySync: true });

    harness.api.refreshCloudStateIfStale(0);

    expect(harness.hydrateFromCloud).not.toHaveBeenCalled();
    expect(harness.pendingDeferredCloudRefresh.get()).toBe(true);
    expect(harness.deferredCloudRefreshTimer.get()).not.toBeNull();
    expect(harness.cloudRefreshInFlight.get()).toBeNull();
  });

  it("refreshes from cloud immediately when no local sync is pending", async () => {
    const harness = createHarness({ hasPendingTaskOrHistorySync: false });

    harness.api.refreshCloudStateIfStale(0);
    await harness.cloudRefreshInFlight.get();

    expect(harness.hydrateFromCloud).toHaveBeenCalledWith({ force: true });
  });
});
