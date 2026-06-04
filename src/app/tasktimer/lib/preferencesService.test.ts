import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REWARD_PROGRESS } from "./rewards";
import { createTaskTimerPreferencesService, type TaskTimerStoredPreferences } from "./preferencesService";

const storageKeys = {
  THEME_KEY: "taskticker_tasks_v1:theme",
  MENU_BUTTON_STYLE_KEY: "taskticker_tasks_v1:menuButtonStyle",
  WEEK_STARTING_KEY: "taskticker_tasks_v1:weekStarting",
  STARTUP_MODULE_KEY: "taskticker_tasks_v1:startupModule",
  TASK_VIEW_KEY: "taskticker_tasks_v1:taskView",
  TASK_ORDER_BY_KEY: "taskticker_tasks_v1:taskOrderBy",
  AUTO_FOCUS_ON_TASK_LAUNCH_KEY: "taskticker_tasks_v1:autoFocusOnTaskLaunchEnabled",
  MOBILE_PUSH_ALERTS_KEY: "taskticker_tasks_v1:mobilePushAlertsEnabled",
  WEB_PUSH_ALERTS_KEY: "taskticker_tasks_v1:webPushAlertsEnabled",
  INTERACTION_CLICK_SOUND_KEY: "taskticker_tasks_v1:interactionClickSoundEnabled",
  ACHIEVEMENT_SOUNDS_KEY: "taskticker_tasks_v1:achievementSoundsEnabled",
  INTERACTION_HAPTICS_KEY: "taskticker_tasks_v1:interactionHapticsEnabled",
  INTERACTION_HAPTICS_INTENSITY_KEY: "taskticker_tasks_v1:interactionHapticsIntensity",
  OPTIMAL_PRODUCTIVITY_START_TIME_KEY: "taskticker_tasks_v1:optimalProductivityStartTime",
  OPTIMAL_PRODUCTIVITY_END_TIME_KEY: "taskticker_tasks_v1:optimalProductivityEndTime",
  OPTIMAL_PRODUCTIVITY_DAYS_KEY: "taskticker_tasks_v1:optimalProductivityDays",
};

function buildDefaultPreferences(): TaskTimerStoredPreferences {
  return {
    schemaVersion: 1 as const,
    theme: "lime" as const,
    menuButtonStyle: "square" as const,
    weekStarting: "mon" as const,
    startupModule: "dashboard" as const,
    taskView: "tile" as const,
    taskOrderBy: "custom" as const,
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    mobilePushAlertsEnabled: false,
    webPushAlertsEnabled: false,
    interactionClickSoundEnabled: true,
    achievementSoundsEnabled: true,
    interactionHapticsEnabled: true,
    interactionHapticsIntensity: "max" as const,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    checkpointAlertSoundMode: "once" as const,
    checkpointAlertToastMode: "auto5s" as const,
    optimalProductivityStartTime: "00:00",
    optimalProductivityEndTime: "23:59",
    optimalProductivityDays: ["sun" as const, "mon" as const, "tue" as const, "wed" as const, "thu" as const, "fri" as const, "sat" as const],
    rewards: DEFAULT_REWARD_PROGRESS,
    updatedAtMs: 1,
  };
}

function createService(overrides?: {
  cachedPreferences?: TaskTimerStoredPreferences | null;
  currentUid?: string;
}) {
  return createTaskTimerPreferencesService({
    storageKeys,
    repository: {
      loadCachedPreferences: () => overrides?.cachedPreferences ?? null,
      buildDefaultPreferences,
      savePreferences: vi.fn(),
    },
    getCloudPreferencesCache: () => null,
    setCloudPreferencesCache: vi.fn(),
    currentUid: () => overrides?.currentUid ?? "",
    syncOwnFriendshipProfile: vi.fn(),
  });
}

describe("createTaskTimerPreferencesService", () => {
  let localStorageMap: Map<string, string>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorageMap = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageMap.set(key, value);
        }),
      },
    });
  });

  it("loads mobile push alerts from local storage while cloud preferences are not cached yet", () => {
    window.localStorage.setItem(storageKeys.MOBILE_PUSH_ALERTS_KEY, "true");

    expect(createService().loadMobilePushAlertsEnabled()).toBe(true);
  });

  it("loads web push alerts from local storage while cloud preferences are not cached yet", () => {
    window.localStorage.setItem(storageKeys.WEB_PUSH_ALERTS_KEY, "true");

    expect(createService().loadWebPushAlertsEnabled()).toBe(true);
  });

  it("keeps an explicit local mobile push preference when cached preferences are stale", () => {
    window.localStorage.setItem(storageKeys.MOBILE_PUSH_ALERTS_KEY, "true");

    expect(
      createService({ cachedPreferences: { ...buildDefaultPreferences(), mobilePushAlertsEnabled: false } }).loadMobilePushAlertsEnabled()
    ).toBe(true);
  });

  it("keeps an explicit local web push preference when cached preferences are stale", () => {
    window.localStorage.setItem(storageKeys.WEB_PUSH_ALERTS_KEY, "true");

    expect(
      createService({ cachedPreferences: { ...buildDefaultPreferences(), webPushAlertsEnabled: false } }).loadWebPushAlertsEnabled()
    ).toBe(true);
  });

  it("keeps explicit local optimal productivity days when cached preferences are stale", () => {
    window.localStorage.setItem(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY, "mon,tue,wed,thu,fri");

    expect(createService({ cachedPreferences: buildDefaultPreferences() }).loadOptimalProductivityDays()).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
    ]);
  });

  it("uses cached cloud preferences instead of shared local storage for signed-in users", () => {
    window.localStorage.setItem(storageKeys.STARTUP_MODULE_KEY, "tasks");
    window.localStorage.setItem(storageKeys.TASK_ORDER_BY_KEY, "schedule");
    window.localStorage.setItem(storageKeys.MOBILE_PUSH_ALERTS_KEY, "true");
    window.localStorage.setItem(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY, "mon,tue,wed,thu,fri");

    const service = createService({
      currentUid: "uid-2",
      cachedPreferences: {
        ...buildDefaultPreferences(),
        startupModule: "dashboard",
        taskOrderBy: "alpha",
        mobilePushAlertsEnabled: false,
        optimalProductivityDays: ["sun", "sat"],
      },
    });

    expect(service.loadStartupModule()).toBe("dashboard");
    expect(service.loadTaskOrderBy()).toBe("alpha");
    expect(service.loadMobilePushAlertsEnabled()).toBe(false);
    expect(service.loadOptimalProductivityDays()).toEqual(["sun", "sat"]);
  });

  it("does not apply shared local storage as signed-in defaults before cloud preferences hydrate", () => {
    window.localStorage.setItem(storageKeys.STARTUP_MODULE_KEY, "tasks");
    window.localStorage.setItem(storageKeys.TASK_ORDER_BY_KEY, "schedule");
    window.localStorage.setItem(storageKeys.MOBILE_PUSH_ALERTS_KEY, "true");
    window.localStorage.setItem(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY, "mon,tue,wed,thu,fri");

    const service = createService({ currentUid: "uid-2" });

    expect(service.loadStartupModule()).toBe("dashboard");
    expect(service.loadTaskOrderBy()).toBe("custom");
    expect(service.loadMobilePushAlertsEnabled()).toBe(false);
    expect(service.loadOptimalProductivityDays()).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
  });

  it("defaults achievement sounds on", () => {
    expect(createService().loadAchievementSoundsEnabled()).toBe(true);
  });

  it("loads achievement sounds from local storage for signed-out users", () => {
    window.localStorage.setItem(storageKeys.ACHIEVEMENT_SOUNDS_KEY, "false");

    expect(createService().loadAchievementSoundsEnabled()).toBe(false);
  });

  it("uses cached achievement sounds instead of shared local storage for signed-in users", () => {
    window.localStorage.setItem(storageKeys.ACHIEVEMENT_SOUNDS_KEY, "true");

    expect(
      createService({
        currentUid: "uid-2",
        cachedPreferences: { ...buildDefaultPreferences(), achievementSoundsEnabled: false },
      }).loadAchievementSoundsEnabled()
    ).toBe(false);
  });

  it("persists and reloads task order by from local storage", () => {
    const savePreferences = vi.fn();
    const setCloudPreferencesCache = vi.fn();
    const service = createTaskTimerPreferencesService({
      storageKeys,
      repository: {
        loadCachedPreferences: () => null,
        buildDefaultPreferences,
        savePreferences,
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache,
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(),
    });

    const snapshot = service.buildSnapshot({
      ...buildDefaultPreferences(),
      weekStarting: "mon",
      taskOrderBy: "schedule",
    });
    service.persistSnapshot(snapshot);

    expect(localStorageMap.get(storageKeys.TASK_ORDER_BY_KEY)).toBe("schedule");
    expect(localStorageMap.get(storageKeys.ACHIEVEMENT_SOUNDS_KEY)).toBe("true");
    expect(service.loadTaskOrderBy()).toBe("schedule");
    expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({ taskOrderBy: "schedule", achievementSoundsEnabled: true }));
    expect(setCloudPreferencesCache).toHaveBeenCalledWith(expect.objectContaining({ taskOrderBy: "schedule", achievementSoundsEnabled: true }));
  });

  it("loads date added task order values from cloud and local storage", () => {
    window.localStorage.setItem(storageKeys.TASK_ORDER_BY_KEY, "dateAddedDesc");

    expect(createService().loadTaskOrderBy()).toBe("dateAddedDesc");
    expect(
      createService({
        currentUid: "uid-2",
        cachedPreferences: { ...buildDefaultPreferences(), taskOrderBy: "dateAddedAsc" },
      }).loadTaskOrderBy()
    ).toBe("dateAddedAsc");
  });

  it("persists date added task order values", () => {
    const savePreferences = vi.fn();
    const setCloudPreferencesCache = vi.fn();
    const service = createTaskTimerPreferencesService({
      storageKeys,
      repository: {
        loadCachedPreferences: () => null,
        buildDefaultPreferences,
        savePreferences,
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache,
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(),
    });

    const snapshot = service.buildSnapshot({
      ...buildDefaultPreferences(),
      weekStarting: "mon",
      taskOrderBy: "dateAddedDesc",
    });
    service.persistSnapshot(snapshot);

    expect(localStorageMap.get(storageKeys.TASK_ORDER_BY_KEY)).toBe("dateAddedDesc");
    expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({ taskOrderBy: "dateAddedDesc" }));
    expect(setCloudPreferencesCache).toHaveBeenCalledWith(expect.objectContaining({ taskOrderBy: "dateAddedDesc" }));
  });

  it("normalizes missing and legacy menu button styles to square", () => {
    window.localStorage.setItem(storageKeys.MENU_BUTTON_STYLE_KEY, "legacy-shape");

    expect(createService().loadMenuButtonStyle()).toBe("square");
    expect(
      createService({
        cachedPreferences: { ...buildDefaultPreferences(), menuButtonStyle: "legacy-shape" as never },
      }).loadMenuButtonStyle()
    ).toBe("square");
  });

  it("does not persist legacy menu button styles from preference snapshots", () => {
    const savePreferences = vi.fn();
    const setCloudPreferencesCache = vi.fn();
    const service = createTaskTimerPreferencesService({
      storageKeys,
      repository: {
        loadCachedPreferences: () => null,
        buildDefaultPreferences,
        savePreferences,
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache,
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(),
    });

    const snapshot = service.buildSnapshot({
      ...buildDefaultPreferences(),
      weekStarting: "mon",
      menuButtonStyle: "legacy-shape" as never,
    });
    service.persistSnapshot(snapshot);

    expect(snapshot.menuButtonStyle).toBe("square");
    expect(localStorageMap.get(storageKeys.MENU_BUTTON_STYLE_KEY)).toBe("square");
    expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({ menuButtonStyle: "square" }));
    expect(savePreferences).not.toHaveBeenCalledWith(expect.objectContaining({ menuButtonStyle: "legacy-shape" }));
    expect(setCloudPreferencesCache).toHaveBeenCalledWith(expect.objectContaining({ menuButtonStyle: "square" }));
  });

  it("maps legacy stored theme values to the Primary theme", () => {
    const service = createService();

    expect(service.normalizeThemeMode("legacy-theme-a")).toBe("lime");
    expect(service.normalizeThemeMode("legacy-theme-b")).toBe("lime");
    expect(service.normalizeThemeMode("command")).toBe("lime");
    expect(service.normalizeThemeMode("lime")).toBe("lime");
  });

  it("loads the Primary theme when local storage still has a legacy theme", () => {
    window.localStorage.setItem(storageKeys.THEME_KEY, "legacy-theme-a");

    expect(createService().loadThemeMode()).toBe("lime");
  });
});
