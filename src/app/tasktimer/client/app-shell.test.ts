import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppPage } from "./types";

function createLocationStub(pathname: string, search = "") {
  const body = {
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
  vi.stubGlobal("document", {
    body,
    querySelectorAll: () => [],
  });
  vi.stubGlobal("window", {
    location: {
      pathname,
      search,
      protocol: "https:",
    },
    history: {
      pushState: vi.fn(),
      replaceState: vi.fn(),
    },
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    },
    setTimeout: (cb: () => void) => {
      cb();
      return 0;
    },
    clearTimeout: vi.fn(),
    Capacitor: {
      isNativePlatform: () => true,
    },
  });
}

function createElementStub() {
  return {
    classList: {
      toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  };
}

function createShellContext(initialAppPage: AppPage = "dashboard", opts?: { withPages?: boolean }) {
  let currentAppPage = initialAppPage;
  const els = opts?.withPages
    ? {
        appPageTasks: createElementStub(),
        appPageDashboard: createElementStub(),
        appPageFriends: createElementStub(),
        appPageLeaderboard: createElementStub(),
        appPageHistory: createElementStub(),
      }
    : {};
  return {
    els,
    runtime: { destroyed: false },
    on: vi.fn(),
    initialAppPage,
    navStackKey: "navStack",
    navStackMax: 50,
    nativeBackDebounceMs: 200,
    getCurrentAppPage: () => currentAppPage,
    setCurrentAppPage: vi.fn((page: AppPage) => {
      currentAppPage = page;
    }),
    getDashboardMenuFlipped: () => false,
    setDashboardMenuFlipped: vi.fn(),
    syncDashboardMenuFlipUi: vi.fn(),
    getSuppressNavStackPush: () => false,
    setSuppressNavStackPush: vi.fn(),
    getNavStackMemory: () => [],
    setNavStackMemory: vi.fn(),
    getLastNativeBackHandledAtMs: () => 0,
    setLastNativeBackHandledAtMs: vi.fn(),
    resetAllOpenHistoryChartSelections: vi.fn(),
    clearTaskFlipStates: vi.fn(),
    renderFriendsFooterAlertBadge: vi.fn(),
    closeTaskExportModal: vi.fn(),
    closeShareTaskModal: vi.fn(),
    closeFriendProfileModal: vi.fn(),
    closeFriendRequestModal: vi.fn(),
    requestScheduleEntryScroll: vi.fn(),
    render: vi.fn(),
    renderHistory: vi.fn(),
    renderDashboardWidgets: vi.fn(),
    renderGroupsPage: vi.fn(),
    refreshGroupsData: vi.fn(async () => undefined),
    getOpenHistoryTaskIds: () => [],
    closeTopOverlayIfOpen: () => false,
    closeMobileDetailPanelIfOpen: () => false,
    showExitAppConfirm: vi.fn(),
    hasEntitlement: () => true,
  } as never;
}

async function loadAppShell(startupPage: AppPage) {
  vi.resetModules();
  vi.doMock("../lib/startupModule", () => ({
    readStartupAppPagePreference: () => startupPage,
  }));
  return import("./app-shell");
}

describe("TaskTimer app shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("../lib/startupModule");
  });

  it("uses the saved startup module for the first native main-route resolution", async () => {
    createLocationStub("/tasklaunch/index.html");
    const { createTaskTimerAppShell } = await loadAppShell("tasks");
    const shell = createTaskTimerAppShell(createShellContext("dashboard"));

    expect(shell.getInitialAppPageFromLocation("dashboard")).toBe("tasks");
    expect(shell.getInitialAppPageFromLocation("dashboard")).toBe("tasks");
  });

  it("keeps explicit page query routing ahead of the startup module", async () => {
    createLocationStub("/tasklaunch/index.html", "?page=schedule");
    const { createTaskTimerAppShell } = await loadAppShell("leaderboard");
    const shell = createTaskTimerAppShell(createShellContext("tasks"));

    expect(shell.getInitialAppPageFromLocation("tasks")).toBe("schedule");
  });

  it("keeps explicit history-manager routing ahead of the startup module in native runtime", async () => {
    createLocationStub("/history-manager/index.html");
    const { createTaskTimerAppShell } = await loadAppShell("dashboard");
    const shell = createTaskTimerAppShell(createShellContext("tasks"));

    expect(shell.getInitialAppPageFromLocation("tasks")).toBe("history");
  });

  it("keeps user-selected module ahead of delayed startup module resolution", async () => {
    createLocationStub("/tasklaunch/index.html");
    const { createTaskTimerAppShell } = await loadAppShell("dashboard");
    const shell = createTaskTimerAppShell(createShellContext("tasks", { withPages: true }));

    shell.applyAppPage("friends", { pushNavStack: true, syncUrl: "push" });

    expect(shell.getInitialAppPageFromLocation("tasks")).toBe("friends");
  });
});
