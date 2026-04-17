import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { hasPendingTaskOrHistorySync, hydrateStorageFromCloud, subscribeCloudTaskCollection } from "../lib/storage";
import type { TaskTimerRuntime } from "./runtime";
import type { TaskTimerStateAccessor } from "./root-state";

import type { DashboardRenderOptions } from "./types";
import { isOverlayVisible } from "./overlay-visibility";

type CreateTaskTimerCloudSyncOptions = {
  runtime: TaskTimerRuntime;
  on: (target: EventTarget | null | undefined, type: string, handler: EventListenerOrEventListenerObject) => void;
  nowMs: () => number;
  getCapAppPlugin: () => {
    addListener?: (
      eventName: string,
      listener: (state: { isActive?: boolean } | null) => void
    ) => CapListenerHandle | Promise<CapListenerHandle>;
  } | null;
  cloudRefreshInFlight: TaskTimerStateAccessor<Promise<void> | null>;
  lastCloudRefreshAtMs: TaskTimerStateAccessor<number>;
  pendingDeferredCloudRefresh: TaskTimerStateAccessor<boolean>;
  deferredCloudRefreshTimer: TaskTimerStateAccessor<number | null>;
  lastUiInteractionAtMs: TaskTimerStateAccessor<number>;
  hydrateUiStateFromCaches: (opts?: { skipDashboardWidgetsRender?: boolean }) => void;
  syncTimeGoalModalWithTaskState: () => void;
  render: () => void;
  renderDashboardWidgets?: (opts?: DashboardRenderOptions) => void;
  maybeHandlePendingTaskJump: () => void;
  maybeHandlePendingPushAction?: () => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  currentUid: () => string;
  isInitialAuthHydrating?: () => boolean;
  showDashboardBusyIndicator?: (message?: string) => number;
  hideDashboardBusyIndicator?: (key?: number) => void;
  setDashboardRefreshPending?: (pending: boolean) => void;
};

type CapListenerHandle = {
  remove?: () => void | Promise<void>;
};

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof value === "object" && "then" in value && typeof value.then === "function";
}

function hasRemoveHandle(value: unknown): value is CapListenerHandle {
  return !!value && typeof value === "object" && "remove" in value;
}

export function createTaskTimerCloudSync(options: CreateTaskTimerCloudSyncOptions) {
  let lastObservedAuthUid = String(options.currentUid() || "").trim();

  function isDashboardPageActive() {
    return typeof document !== "undefined" && document.body?.getAttribute("data-app-page") === "dashboard";
  }

  function hasActiveFormInteraction() {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return false;
    return active.matches('input, textarea, select, [contenteditable="true"]');
  }

  function noteUiInteraction() {
    options.lastUiInteractionAtMs.set(options.nowMs());
  }

  function hasRecentUiInteraction(windowMs = 1200) {
    return options.nowMs() - options.lastUiInteractionAtMs.get() < windowMs;
  }

  function hasActiveTimeGoalCompletionFlow() {
    const taskId = String((document.getElementById("timeGoalCompleteOverlay") as HTMLElement | null)?.dataset.taskId || "").trim();
    if (taskId) return true;
    return (
      isOverlayVisible(document.getElementById("timeGoalCompleteOverlay") as HTMLElement | null) ||
      isOverlayVisible(document.getElementById("timeGoalCompleteSaveNoteOverlay") as HTMLElement | null) ||
      isOverlayVisible(document.getElementById("timeGoalCompleteNoteOverlay") as HTMLElement | null)
    );
  }

  function rehydrateFromCloudAndRender(opts?: { force?: boolean }) {
    if (options.runtime.destroyed) return Promise.resolve();
    const currentInFlight = options.cloudRefreshInFlight.get();
    if (currentInFlight) return currentInFlight;
    const activeDashboardPage = isDashboardPageActive();
    const initialAuthHydrating = options.isInitialAuthHydrating?.() === true;
    options.setDashboardRefreshPending?.(false);
    const dashboardBusyKey = activeDashboardPage && !initialAuthHydrating
      ? options.showDashboardBusyIndicator?.("Refreshing...")
      : undefined;
    const nextInFlight = hydrateStorageFromCloud(opts)
      .then(() => {
        if (options.runtime.destroyed) return;
        options.hydrateUiStateFromCaches({ skipDashboardWidgetsRender: activeDashboardPage });
        options.syncTimeGoalModalWithTaskState();
        if (!activeDashboardPage) {
          options.render();
        }
        if (activeDashboardPage) {
          options.renderDashboardWidgets?.();
        }
        options.maybeHandlePendingTaskJump();
        options.maybeHandlePendingPushAction?.();
        options.maybeRestorePendingTimeGoalFlow();
        options.lastCloudRefreshAtMs.set(options.nowMs());
      })
      .catch(() => {
        // Keep current in-memory state when cloud refresh is unavailable.
      })
      .finally(() => {
        if (typeof dashboardBusyKey === "number") {
          options.hideDashboardBusyIndicator?.(dashboardBusyKey);
        }
        options.cloudRefreshInFlight.set(null);
      });
    options.cloudRefreshInFlight.set(nextInFlight);
    return nextInFlight;
  }

  function scheduleDeferredCloudRefresh(minIntervalMs = 0) {
    options.pendingDeferredCloudRefresh.set(true);
    if (options.deferredCloudRefreshTimer.get() != null || options.runtime.destroyed) return;
    const timer = window.setTimeout(() => {
      options.deferredCloudRefreshTimer.set(null);
      if (options.runtime.destroyed || !options.pendingDeferredCloudRefresh.get()) return;
      if (!hasActiveTimeGoalCompletionFlow() && (hasActiveFormInteraction() || hasRecentUiInteraction())) {
        scheduleDeferredCloudRefresh(minIntervalMs);
        return;
      }
      options.pendingDeferredCloudRefresh.set(false);
      refreshCloudStateIfStale(minIntervalMs);
    }, 500);
    options.deferredCloudRefreshTimer.set(timer);
  }

  function refreshCloudStateIfStale(minIntervalMs = 3000) {
    const currentMs = options.nowMs();
    if (currentMs - options.lastCloudRefreshAtMs.get() < minIntervalMs) return;
    if (isDashboardPageActive() && options.isInitialAuthHydrating?.() !== true) {
      options.setDashboardRefreshPending?.(true);
      return;
    }
    if (!hasActiveTimeGoalCompletionFlow() && (hasActiveFormInteraction() || hasRecentUiInteraction())) {
      scheduleDeferredCloudRefresh(minIntervalMs);
      return;
    }
    options.pendingDeferredCloudRefresh.set(false);
    void rehydrateFromCloudAndRender({ force: true });
  }

  function syncCloudTaskCollectionListener() {
    if (options.runtime.removeCloudTaskCollectionListener) {
      try {
        options.runtime.removeCloudTaskCollectionListener();
      } catch {
        // ignore
      }
      options.runtime.removeCloudTaskCollectionListener = null;
    }
    const uid = options.currentUid();
    if (!uid) return;
    options.runtime.removeCloudTaskCollectionListener = subscribeCloudTaskCollection(uid, () => {
      if (hasPendingTaskOrHistorySync()) {
        scheduleDeferredCloudRefresh(5000);
        return;
      }
      refreshCloudStateIfStale(1500);
    });
  }

  function initCloudRefreshSync() {
    options.on(document, "pointerdown", noteUiInteraction);
    options.on(document, "focusin", noteUiInteraction);
    options.on(document, "input", noteUiInteraction);
    options.on(document, "change", noteUiInteraction);
    options.on(window, "focus", () => {
      refreshCloudStateIfStale(0);
      options.maybeRestorePendingTimeGoalFlow();
    });
    options.on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshCloudStateIfStale(0);
        options.maybeRestorePendingTimeGoalFlow();
      }
    });

    try {
      const capApp = options.getCapAppPlugin();
      if (capApp?.addListener) {
        const maybePromise = capApp.addListener("appStateChange", (state: { isActive?: boolean } | null) => {
          if (state?.isActive) {
            refreshCloudStateIfStale(0);
            options.maybeRestorePendingTimeGoalFlow();
          }
        });
        if (isPromiseLike<CapListenerHandle>(maybePromise)) {
          maybePromise
            .then((handle) => {
              if (handle?.remove) options.runtime.removeCapAppStateListener = () => void handle.remove?.();
            })
            .catch(() => {});
        } else if (hasRemoveHandle(maybePromise)) {
          options.runtime.removeCapAppStateListener = () => void maybePromise.remove?.();
        }
      }
    } catch {
      // ignore native app-state listener failures
    }

    const auth = getFirebaseAuthClient();
    if (auth) {
      options.runtime.removeAuthStateListener = onAuthStateChanged(auth, (user) => {
        const nextUid = String(user?.uid || "").trim();
        const signedInTransition = !!nextUid && nextUid !== lastObservedAuthUid;
        lastObservedAuthUid = nextUid;
        syncCloudTaskCollectionListener();
        if (signedInTransition) {
          void rehydrateFromCloudAndRender({ force: true });
          return;
        }
        refreshCloudStateIfStale(0);
      });
    }
    syncCloudTaskCollectionListener();
  }

  return {
    rehydrateFromCloudAndRender,
    scheduleDeferredCloudRefresh,
    refreshCloudStateIfStale,
    syncCloudTaskCollectionListener,
    initCloudRefreshSync,
  };
}
