import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerRuntime } from "./runtime";
import { createTaskTimerMutableStore } from "./mutable-store";
import { createTaskTimerCloudSync } from "./cloud-sync";

const mocks = vi.hoisted(() => ({
  hydrateStorageFromCloud: vi.fn(() => Promise.resolve()),
  subscribeCloudTaskCollection: vi.fn(() => () => {}),
  subscribeCloudTaskLiveSessions: vi.fn(() => () => {}),
  onAuthStateChanged: vi.fn(),
  getFirebaseAuthClient: vi.fn(() => ({ currentUser: { uid: "user-1" } })),
}));

vi.mock("../lib/storage", () => ({
  hasPendingTaskOrHistorySync: vi.fn(() => false),
  hydrateStorageFromCloud: mocks.hydrateStorageFromCloud,
  subscribeCloudTaskCollection: mocks.subscribeCloudTaskCollection,
  subscribeCloudTaskLiveSessions: mocks.subscribeCloudTaskLiveSessions,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => mocks.getFirebaseAuthClient(),
}));

describe("cloud-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    const bodyAttributes = new Map<string, string>();
    const body = {
      setAttribute: (name: string, value: string) => {
        bodyAttributes.set(name, value);
      },
      getAttribute: (name: string) => bodyAttributes.get(name) ?? null,
      removeAttribute: (name: string) => {
        bodyAttributes.delete(name);
      },
    };
    body.setAttribute("data-app-page", "dashboard");

    const documentTarget = new EventTarget() as Document & EventTarget & {
      body: typeof body;
      activeElement: unknown;
      visibilityState: "visible";
      getElementById: (id: string) => null;
    };
    Object.assign(documentTarget, {
      body,
      activeElement: body,
      visibilityState: "visible",
      getElementById: () => null,
    });

    const windowTarget = new EventTarget() as Window & EventTarget;
    Object.assign(windowTarget, {
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id),
    });

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: documentTarget,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: windowTarget,
    });
  });

  it("rehydrates immediately when auth changes to a signed-in user on dashboard", async () => {
    let authCallback: ((user: { uid?: string } | null) => void) | null = null;
    mocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      authCallback = callback as (user: { uid?: string } | null) => void;
      return () => {};
    });

    const runtime = createTaskTimerRuntime();
    const cloudRefreshState = createTaskTimerMutableStore({
      cloudRefreshInFlight: null as Promise<void> | null,
      lastCloudRefreshAtMs: 0,
      pendingDeferredCloudRefresh: false,
      deferredCloudRefreshTimer: null as number | null,
      lastUiInteractionAtMs: 0,
    });
    const setDashboardRefreshPending = vi.fn();
    const renderDashboardWidgets = vi.fn();

    const api = createTaskTimerCloudSync({
      runtime,
      on: runtime.on,
      nowMs: () => 1000,
      getCapAppPlugin: () => null,
      cloudRefreshInFlight: cloudRefreshState.accessor("cloudRefreshInFlight"),
      lastCloudRefreshAtMs: cloudRefreshState.accessor("lastCloudRefreshAtMs"),
      pendingDeferredCloudRefresh: cloudRefreshState.accessor("pendingDeferredCloudRefresh"),
      deferredCloudRefreshTimer: cloudRefreshState.accessor("deferredCloudRefreshTimer"),
      lastUiInteractionAtMs: cloudRefreshState.accessor("lastUiInteractionAtMs"),
      hydrateUiStateFromCaches: vi.fn(),
      syncTimeGoalModalWithTaskState: vi.fn(),
      render: vi.fn(),
      renderDashboardWidgets,
      maybeHandlePendingTaskJump: vi.fn(),
      maybeHandlePendingPushAction: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
      currentUid: () => "user-1",
      getTasks: () => [{ id: "task-1" }] as Array<{ id: string }>,
      showDashboardBusyIndicator: vi.fn(() => 1),
      hideDashboardBusyIndicator: vi.fn(),
      setDashboardRefreshPending,
    });

    api.initCloudRefreshSync();
    expect(authCallback).toBeTypeOf("function");

    const callback = authCallback as unknown as (user: { uid?: string } | null) => void;
    callback({ uid: "user-2" });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.hydrateStorageFromCloud).toHaveBeenCalledWith({ force: true });
    expect(renderDashboardWidgets).toHaveBeenCalled();
    expect(setDashboardRefreshPending).toHaveBeenCalledWith(false);
    expect(mocks.subscribeCloudTaskLiveSessions).toHaveBeenCalledWith("user-1", ["task-1"], expect.any(Function));
  });

  it("marks dashboard refresh pending for passive dashboard refreshes", () => {
    const runtime = createTaskTimerRuntime();
    const cloudRefreshState = createTaskTimerMutableStore({
      cloudRefreshInFlight: null as Promise<void> | null,
      lastCloudRefreshAtMs: 0,
      pendingDeferredCloudRefresh: false,
      deferredCloudRefreshTimer: null as number | null,
      lastUiInteractionAtMs: 0,
    });
    const setDashboardRefreshPending = vi.fn();

    const api = createTaskTimerCloudSync({
      runtime,
      on: runtime.on,
      nowMs: () => 1000,
      getCapAppPlugin: () => null,
      cloudRefreshInFlight: cloudRefreshState.accessor("cloudRefreshInFlight"),
      lastCloudRefreshAtMs: cloudRefreshState.accessor("lastCloudRefreshAtMs"),
      pendingDeferredCloudRefresh: cloudRefreshState.accessor("pendingDeferredCloudRefresh"),
      deferredCloudRefreshTimer: cloudRefreshState.accessor("deferredCloudRefreshTimer"),
      lastUiInteractionAtMs: cloudRefreshState.accessor("lastUiInteractionAtMs"),
      hydrateUiStateFromCaches: vi.fn(),
      syncTimeGoalModalWithTaskState: vi.fn(),
      render: vi.fn(),
      renderDashboardWidgets: vi.fn(),
      maybeHandlePendingTaskJump: vi.fn(),
      maybeHandlePendingPushAction: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
      currentUid: () => "user-1",
      getTasks: () => [],
      setDashboardRefreshPending,
    });

    api.refreshCloudStateIfStale(0);

    expect(setDashboardRefreshPending).toHaveBeenCalledWith(true);
    expect(mocks.hydrateStorageFromCloud).not.toHaveBeenCalled();
  });

  it("clears dashboard busy state when a manual dashboard refresh times out", async () => {
    vi.useFakeTimers();
    Object.assign(window, {
      setTimeout,
      clearTimeout,
    });
    mocks.hydrateStorageFromCloud.mockImplementation(() => new Promise(() => {}));

    const runtime = createTaskTimerRuntime();
    const cloudRefreshState = createTaskTimerMutableStore({
      cloudRefreshInFlight: null as Promise<void> | null,
      lastCloudRefreshAtMs: 0,
      pendingDeferredCloudRefresh: false,
      deferredCloudRefreshTimer: null as number | null,
      lastUiInteractionAtMs: 0,
    });
    const showDashboardBusyIndicator = vi.fn(() => 7);
    const hideDashboardBusyIndicator = vi.fn();
    const setDashboardRefreshPending = vi.fn();

    const api = createTaskTimerCloudSync({
      runtime,
      on: runtime.on,
      nowMs: () => 1000,
      getCapAppPlugin: () => null,
      cloudRefreshInFlight: cloudRefreshState.accessor("cloudRefreshInFlight"),
      lastCloudRefreshAtMs: cloudRefreshState.accessor("lastCloudRefreshAtMs"),
      pendingDeferredCloudRefresh: cloudRefreshState.accessor("pendingDeferredCloudRefresh"),
      deferredCloudRefreshTimer: cloudRefreshState.accessor("deferredCloudRefreshTimer"),
      lastUiInteractionAtMs: cloudRefreshState.accessor("lastUiInteractionAtMs"),
      hydrateUiStateFromCaches: vi.fn(),
      syncTimeGoalModalWithTaskState: vi.fn(),
      render: vi.fn(),
      renderDashboardWidgets: vi.fn(),
      maybeHandlePendingTaskJump: vi.fn(),
      maybeHandlePendingPushAction: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
      currentUid: () => "user-1",
      getTasks: () => [],
      showDashboardBusyIndicator,
      hideDashboardBusyIndicator,
      setDashboardRefreshPending,
    });

    void api.rehydrateFromCloudAndRender({ force: true });
    await vi.advanceTimersByTimeAsync(15000);
    await Promise.resolve();

    expect(showDashboardBusyIndicator).toHaveBeenCalledWith("Refreshing...");
    expect(hideDashboardBusyIndicator).toHaveBeenCalledWith(7);
    expect(setDashboardRefreshPending).toHaveBeenCalledWith(true);
    expect(cloudRefreshState.get("cloudRefreshInFlight")).toBeNull();
  });
});
