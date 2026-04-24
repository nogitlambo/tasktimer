import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppPage } from "./types";

function createLocationStub(pathname: string, search = "") {
  vi.stubGlobal("window", {
    location: {
      pathname,
      search,
      protocol: "https:",
    },
    Capacitor: {
      isNativePlatform: () => true,
    },
  });
}

function createShellContext(initialAppPage: AppPage = "dashboard") {
  return {
    els: {},
    runtime: { destroyed: false },
    on: vi.fn(),
    initialAppPage,
    navStackKey: "navStack",
    navStackMax: 50,
    nativeBackDebounceMs: 200,
    getCurrentAppPage: () => initialAppPage,
    setCurrentAppPage: vi.fn(),
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
    createLocationStub("/dashboard/index.html");
    const { createTaskTimerAppShell } = await loadAppShell("tasks");
    const shell = createTaskTimerAppShell(createShellContext("dashboard"));

    expect(shell.getInitialAppPageFromLocation("dashboard")).toBe("tasks");
    expect(shell.getInitialAppPageFromLocation("dashboard")).toBe("dashboard");
  });

  it("keeps explicit page query routing ahead of the startup module", async () => {
    createLocationStub("/tasklaunch/index.html", "?page=schedule");
    const { createTaskTimerAppShell } = await loadAppShell("leaderboard");
    const shell = createTaskTimerAppShell(createShellContext("tasks"));

    expect(shell.getInitialAppPageFromLocation("tasks")).toBe("schedule");
  });
});
