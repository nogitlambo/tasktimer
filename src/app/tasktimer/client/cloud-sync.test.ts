import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerCloudSync } from "./cloud-sync";
import type { TaskTimerWorkspaceSnapshot } from "../lib/workspaceRepository";
import type { TaskTimerRuntime } from "./runtime";

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
  hasPendingTaskOrLiveSessionSync?: boolean;
  lastCloudRefreshAtMs?: number;
}) {
  const cloudRefreshInFlight = createStateAccessor<Promise<void> | null>(null);
  const lastCloudRefreshAtMs = createStateAccessor<number>(overrides?.lastCloudRefreshAtMs ?? 0);
  const pendingDeferredCloudRefresh = createStateAccessor(false);
  const deferredCloudRefreshTimer = createStateAccessor<number | null>(null);
  const lastUiInteractionAtMs = createStateAccessor(0);
  const hydrateFromCloud = vi.fn(
    async (): Promise<TaskTimerWorkspaceSnapshot> => ({
      tasks: [],
      historyByTaskId: {},
      cleanedHistoryByTaskId: {},
      historyWasCleaned: false,
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    })
  );
  const hydrateTimerStateFromCloud = vi.fn(async () => ({
    tasks: [],
    liveSessionsByTaskId: {},
  }));
  const on = vi.fn();
  const nowMs = vi.fn(() => 10_000);
  const workspaceRepository = {
    hasPendingTaskOrHistorySync: vi.fn(() => overrides?.hasPendingTaskOrHistorySync === true),
    hasPendingTaskOrLiveSessionSync: vi.fn(() => overrides?.hasPendingTaskOrLiveSessionSync === true),
    hydrateFromCloud,
    hydrateTimerStateFromCloud,
    subscribeTaskCollection: vi.fn(() => () => {}),
    subscribeTaskLiveSessions: vi.fn(() => () => {}),
    resetVolatileStateForAuthChange: vi.fn(),
  };

  const documentStub = createDocumentStub();
  vi.stubGlobal("document", documentStub);
  documentStub.body.setAttribute("data-app-page", "tasks");

  const api = createTaskTimerCloudSync({
    workspaceRepository,
    runtime: {
      destroyed: false,
      removeCloudTaskCollectionListener: null,
      removeCloudTaskLiveSessionsListener: null,
      removeCapAppStateListener: null,
      removeAuthStateListener: null,
    } as unknown as TaskTimerRuntime,
    on,
    nowMs,
    getCapAppPlugin: () => null,
    cloudRefreshInFlight,
    lastCloudRefreshAtMs,
    pendingDeferredCloudRefresh,
    deferredCloudRefreshTimer,
    lastUiInteractionAtMs,
    hydrateUiStateFromCaches: vi.fn(),
    hydrateTimerStateFromCaches: vi.fn(),
    syncTimeGoalModalWithTaskState: vi.fn(),
    render: vi.fn(),
    renderDashboardWidgets: vi.fn(),
    maybeHandlePendingTaskJump: vi.fn(),
    maybeHandlePendingPushAction: vi.fn(),
    maybeRestorePendingTimeGoalFlow: vi.fn(),
    currentUid: () => "user-1",
    getTasks: () => [{ id: "task-1" } as never],
    setDashboardRefreshPending: vi.fn(),
  });

  return {
    api,
    workspaceRepository,
    hydrateFromCloud,
    hydrateTimerStateFromCloud,
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
      location: { protocol: "https:" },
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

  it("subscribes live-session docs for lightweight timer-state refresh sync", () => {
    const harness = createHarness({ hasPendingTaskOrHistorySync: false });

    harness.api.initCloudRefreshSync();

    expect(harness.workspaceRepository.subscribeTaskCollection).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(harness.workspaceRepository.subscribeTaskLiveSessions).toHaveBeenCalledWith("user-1", ["task-1"], expect.any(Function));
  });

  it("coalesces task collection changes through focused timer-state hydration", async () => {
    const harness = createHarness({ hasPendingTaskOrLiveSessionSync: false });

    harness.api.initCloudRefreshSync();
    const listener = (harness.workspaceRepository.subscribeTaskCollection as unknown as {
      mock: { calls: Array<[string, () => void]> };
    }).mock.calls[0]?.[1];
    listener?.();
    listener?.();

    expect(harness.hydrateTimerStateFromCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    expect(harness.hydrateTimerStateFromCloud).toHaveBeenCalledTimes(1);
    expect(harness.hydrateTimerStateFromCloud).toHaveBeenCalledWith({ force: true });
    expect(harness.hydrateFromCloud).not.toHaveBeenCalled();
  });

  it("defers focused timer-state hydration while local timer writes are pending", async () => {
    const harness = createHarness({ hasPendingTaskOrLiveSessionSync: true });

    harness.api.initCloudRefreshSync();
    const listener = (harness.workspaceRepository.subscribeTaskCollection as unknown as {
      mock: { calls: Array<[string, () => void]> };
    }).mock.calls[0]?.[1];
    listener?.();
    await vi.advanceTimersByTimeAsync(300);

    expect(harness.hydrateTimerStateFromCloud).not.toHaveBeenCalled();
    expect(harness.hydrateFromCloud).not.toHaveBeenCalled();
  });
});
