import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskTimerPreferencesService } from "./preferencesService";
import { createTaskTimerWorkspaceRepository } from "./workspaceRepository";

function createStorageKeys() {
  return {
    THEME_KEY: "theme",
    MENU_BUTTON_STYLE_KEY: "menu",
    WEEK_STARTING_KEY: "week",
    STARTUP_MODULE_KEY: "startupModule",
    TASK_VIEW_KEY: "view",
    AUTO_FOCUS_ON_TASK_LAUNCH_KEY: "auto",
    MOBILE_PUSH_ALERTS_KEY: "push",
    WEB_PUSH_ALERTS_KEY: "webPush",
    OPTIMAL_PRODUCTIVITY_START_TIME_KEY: "optimalStart",
    OPTIMAL_PRODUCTIVITY_END_TIME_KEY: "optimalEnd",
  };
}

function createLocalStorageStub(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe("TaskTimerPreferencesService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers cached values over local storage for theme and week start", () => {
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => ({
          ...repository.buildDefaultPreferences(),
          theme: "cyan",
          weekStarting: "sun",
        }),
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadThemeMode()).toBe("cyan");
    expect(service.loadWeekStarting()).toBe("sun");
  });

  it("defaults startup module to dashboard when nothing is stored", () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub(),
    });
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => null,
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadStartupModule()).toBe("dashboard");
  });

  it("prefers local startup module over cached preferences", () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub({
        startupModule: "friends",
      }),
    });
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => ({
          ...repository.buildDefaultPreferences(),
          startupModule: "leaderboard",
        }),
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadStartupModule()).toBe("friends");
  });

  it("defaults theme to lime when no cached or local preference exists", () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub(),
    });
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => null,
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadThemeMode()).toBe("lime");
  });

  it("loads productivity period from cached preferences and preserves overnight ranges", () => {
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => ({
          ...repository.buildDefaultPreferences(),
          optimalProductivityStartTime: "22:00",
          optimalProductivityEndTime: "02:00",
        }),
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadOptimalProductivityPeriod()).toEqual({ startTime: "22:00", endTime: "02:00" });
  });

  it("falls back to local productivity period when cache is missing", () => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageStub({
        optimalStart: "08:15",
        optimalEnd: "17:45",
      }),
    });
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository: {
        ...repository,
        loadCachedPreferences: () => null,
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadOptimalProductivityPeriod()).toEqual({ startTime: "08:15", endTime: "17:45" });
  });

  it("normalizes invalid productivity period values in snapshots", () => {
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: createStorageKeys(),
      repository,
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    const snapshot = service.buildSnapshot({
      theme: "purple",
      menuButtonStyle: "square",
      weekStarting: "mon",
      startupModule: "friends",
      taskView: "tile",
      autoFocusOnTaskLaunchEnabled: false,
      dynamicColorsEnabled: true,
      mobilePushAlertsEnabled: false,
      webPushAlertsEnabled: false,
      checkpointAlertSoundEnabled: true,
      checkpointAlertToastEnabled: true,
      optimalProductivityStartTime: "25:00",
      optimalProductivityEndTime: "99:99",
      rewards: repository.buildDefaultPreferences().rewards,
    });

    expect(snapshot.optimalProductivityStartTime).toBe("00:00");
    expect(snapshot.optimalProductivityEndTime).toBe("23:59");
    expect(snapshot.startupModule).toBe("friends");
  });
});
