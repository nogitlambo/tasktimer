/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AppPage } from "./types";

type RegisterWindowRuntimeEventsOptions = {
  on: (target: EventTarget | null | undefined, event: string, handler: (event: unknown) => void) => void;
  windowRef: Window;
  runtimeDestroyed: () => boolean;
  pendingPushEvent: string;
  applyAppPage: (page: AppPage, opts?: { syncUrl?: "replace" | "push" | false }) => void;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<unknown>;
  maybeHandlePendingTaskJump: () => void;
  maybeHandlePendingPushAction: () => void;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<unknown>;
  maybeRestorePendingTimeGoalFlow: (restoreContext?: { source?: "push" | "appRestore"; taskId?: string }) => void;
  flushPendingCloudWrites: () => Promise<unknown>;
};

type RegisterDashboardShellEventsOptions = {
  on: (target: EventTarget | null | undefined, event: string, handler: (event: unknown) => void) => void;
  dashboardHeatSummaryCloseBtn: EventTarget | null | undefined;
  closeDashboardHeatSummaryCard: (opts?: { restoreFocus?: boolean }) => void;
};

function appPageForPushRoute(routeRaw: unknown): AppPage | null {
  const route = String(routeRaw || "").trim().split("#")[0]?.split("?")[0]?.replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "";
  if (route === "/friends") return "friends";
  return null;
}

export function registerTaskTimerWindowRuntimeEvents(options: RegisterWindowRuntimeEventsOptions) {
  try {
    (options.windowRef as Window & { __tasktimerPendingPushReady?: boolean }).__tasktimerPendingPushReady = true;
  } catch {
    // Ignore readiness marker failures.
  }
  options.on(options.windowRef, options.pendingPushEvent as any, (event: unknown) => {
    const detail = event && typeof event === "object" && "detail" in event ? (event as { detail?: unknown }).detail : null;
    const route = detail && typeof detail === "object" && "route" in detail ? (detail as { route?: unknown }).route : "";
    const routePage = appPageForPushRoute(route);
    const shouldRefreshFriends = routePage === "friends";
    if (routePage) {
      options.applyAppPage(routePage, { syncUrl: "replace" });
    }
    if (shouldRefreshFriends) {
      void options.refreshGroupsData({ preserveStatus: true }).catch(() => {});
    }
    options.maybeHandlePendingTaskJump();
    options.maybeHandlePendingPushAction();
    void options.rehydrateFromCloudAndRender({ force: true }).then(() => {
      if (options.runtimeDestroyed()) return;
      if (shouldRefreshFriends) {
        void options.refreshGroupsData({ preserveStatus: true }).catch(() => {});
      }
      options.maybeHandlePendingTaskJump();
      options.maybeHandlePendingPushAction();
      options.maybeRestorePendingTimeGoalFlow();
    });
  });
  options.on(options.windowRef, "pagehide", () => {
    void options.flushPendingCloudWrites();
  });
  options.on(options.windowRef, "beforeunload", () => {
    void options.flushPendingCloudWrites();
  });
  options.on(options.windowRef.document, "visibilitychange", () => {
    if (options.windowRef.document.visibilityState === "hidden") {
      void options.flushPendingCloudWrites();
    }
  });
}

export function registerTaskTimerDashboardShellEvents(options: RegisterDashboardShellEventsOptions) {
  options.on(options.dashboardHeatSummaryCloseBtn, "click", () => {
    options.closeDashboardHeatSummaryCard({ restoreFocus: true });
  });
}
