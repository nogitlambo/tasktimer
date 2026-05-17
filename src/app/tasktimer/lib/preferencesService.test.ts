import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REWARD_PROGRESS } from "./rewards";
import { createTaskTimerPreferencesService } from "./preferencesService";

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
  INTERACTION_HAPTICS_KEY: "taskticker_tasks_v1:interactionHapticsEnabled",
  INTERACTION_HAPTICS_INTENSITY_KEY: "taskticker_tasks_v1:interactionHapticsIntensity",
  OPTIMAL_PRODUCTIVITY_START_TIME_KEY: "taskticker_tasks_v1:optimalProductivityStartTime",
  OPTIMAL_PRODUCTIVITY_END_TIME_KEY: "taskticker_tasks_v1:optimalProductivityEndTime",
  OPTIMAL_PRODUCTIVITY_DAYS_KEY: "taskticker_tasks_v1:optimalProductivityDays",
};

function buildDefaultPreferences() {
  return {
    schemaVersion: 1 as const,
    theme: "lime" as const,
    menuButtonStyle: "square" as const,
    startupModule: "dashboard" as const,
    taskView: "tile" as const,
    taskOrderBy: "custom" as const,
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    mobilePushAlertsEnabled: false,
    webPushAlertsEnabled: false,
    interactionClickSoundEnabled: true,
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

function createService() {
  return createTaskTimerPreferencesService({
    storageKeys,
    repository: {
      loadCachedPreferences: () => null,
      buildDefaultPreferences,
      savePreferences: vi.fn(),
    },
    getCloudPreferencesCache: () => null,
    setCloudPreferencesCache: vi.fn(),
    currentUid: () => "",
    syncOwnFriendshipProfile: vi.fn(),
  });
}

describe("createTaskTimerPreferencesService", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    const localStorage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => localStorage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorage.set(key, value);
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
});
