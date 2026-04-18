import type { UserPreferencesV1 } from "./cloudStore";
import type { RewardProgressV1 } from "./rewards";
import type { TaskTimerWorkspaceRepository } from "./workspaceRepository";
import { normalizeDashboardWeekStart } from "./historyChart";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeOptimalProductivityPeriod,
  normalizeTimeOfDay,
  type OptimalProductivityPeriod,
} from "./productivityPeriod";

export type TaskTimerPreferenceStorageKeys = {
  THEME_KEY: string;
  MENU_BUTTON_STYLE_KEY: string;
  WEEK_STARTING_KEY: string;
  TASK_VIEW_KEY: string;
  AUTO_FOCUS_ON_TASK_LAUNCH_KEY: string;
  MOBILE_PUSH_ALERTS_KEY: string;
  WEB_PUSH_ALERTS_KEY: string;
  OPTIMAL_PRODUCTIVITY_START_TIME_KEY: string;
  OPTIMAL_PRODUCTIVITY_END_TIME_KEY: string;
  MODE_SETTINGS_KEY: string;
};

type PreferencesStateSnapshot = {
  theme: "purple" | "cyan" | "lime";
  menuButtonStyle: "parallelogram" | "square";
  weekStarting: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  taskView: "list" | "tile";
  autoFocusOnTaskLaunchEnabled: boolean;
  dynamicColorsEnabled: boolean;
  mobilePushAlertsEnabled: boolean;
  webPushAlertsEnabled: boolean;
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  optimalProductivityStartTime: string;
  optimalProductivityEndTime: string;
  rewards: RewardProgressV1;
};

type StoredPreferences = UserPreferencesV1 & {
  weekStarting?: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
};

export type TaskTimerStoredPreferences = StoredPreferences;

type PreferencesServiceOptions = {
  storageKeys: TaskTimerPreferenceStorageKeys;
  repository: TaskTimerWorkspaceRepository;
  getCloudPreferencesCache: () => StoredPreferences | null;
  setCloudPreferencesCache: (prefs: StoredPreferences) => void;
  currentUid: () => string;
  syncOwnFriendshipProfile: (uid: string, patch: { currentRankId?: string | null }) => Promise<unknown>;
};

function safeReadLocalStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore localStorage write failures
  }
}

function safeRemoveLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore localStorage write failures
  }
}

export function createTaskTimerPreferencesService(options: PreferencesServiceOptions) {
  const { storageKeys, repository } = options;

  function getStoredOrCachedPreferences() {
    return (options.getCloudPreferencesCache() ||
      repository.loadCachedPreferences() ||
      (repository.buildDefaultPreferences() as StoredPreferences)) as StoredPreferences;
  }

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" | "lime" {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "lime") return "lime";
    return value === "purple" ? "purple" : value === "cyan" || value === "command" ? "cyan" : "lime";
  }

  function buildSnapshot(state: PreferencesStateSnapshot): StoredPreferences {
    const base = getStoredOrCachedPreferences();
    return {
      ...base,
      schemaVersion: 1,
      theme: state.theme,
      menuButtonStyle: state.menuButtonStyle,
      weekStarting: state.weekStarting,
      taskView: state.taskView,
      autoFocusOnTaskLaunchEnabled: state.autoFocusOnTaskLaunchEnabled,
      dynamicColorsEnabled: state.dynamicColorsEnabled,
      mobilePushAlertsEnabled: state.mobilePushAlertsEnabled,
      webPushAlertsEnabled: state.webPushAlertsEnabled,
      checkpointAlertSoundEnabled: state.checkpointAlertSoundEnabled,
      checkpointAlertToastEnabled: state.checkpointAlertToastEnabled,
      optimalProductivityStartTime: normalizeTimeOfDay(
        state.optimalProductivityStartTime,
        DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME
      ),
      optimalProductivityEndTime: normalizeTimeOfDay(state.optimalProductivityEndTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME),
      rewards: state.rewards,
      updatedAtMs: Date.now(),
    };
  }

  function persistSnapshot(snapshot: StoredPreferences): void {
    safeWriteLocalStorage(storageKeys.THEME_KEY, String(snapshot.theme || "lime"));
    safeWriteLocalStorage(storageKeys.MENU_BUTTON_STYLE_KEY, String(snapshot.menuButtonStyle || "square"));
    safeWriteLocalStorage(storageKeys.TASK_VIEW_KEY, String(snapshot.taskView || "list"));
    safeWriteLocalStorage(
      storageKeys.AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      snapshot.autoFocusOnTaskLaunchEnabled ? "true" : "false",
    );
    safeWriteLocalStorage(
      storageKeys.MOBILE_PUSH_ALERTS_KEY,
      snapshot.mobilePushAlertsEnabled ? "true" : "false",
    );
    safeWriteLocalStorage(
      storageKeys.WEB_PUSH_ALERTS_KEY,
      snapshot.webPushAlertsEnabled ? "true" : "false",
    );
    safeWriteLocalStorage(storageKeys.WEEK_STARTING_KEY, String(snapshot.weekStarting || "mon"));
    safeWriteLocalStorage(
      storageKeys.OPTIMAL_PRODUCTIVITY_START_TIME_KEY,
      normalizeTimeOfDay(snapshot.optimalProductivityStartTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME)
    );
    safeWriteLocalStorage(
      storageKeys.OPTIMAL_PRODUCTIVITY_END_TIME_KEY,
      normalizeTimeOfDay(snapshot.optimalProductivityEndTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME)
    );
    safeRemoveLocalStorage(storageKeys.MODE_SETTINGS_KEY);

    options.setCloudPreferencesCache(snapshot);
    repository.savePreferences(snapshot);

    const uid = options.currentUid();
    if (!uid) return;
    void options
      .syncOwnFriendshipProfile(uid, { currentRankId: snapshot.rewards?.currentRankId || null })
      .catch(() => {});
  }

  function loadThemeMode(): "purple" | "cyan" | "lime" {
    const cached = getStoredOrCachedPreferences();
    return normalizeThemeMode(cached.theme || safeReadLocalStorage(storageKeys.THEME_KEY));
  }

  function loadMenuButtonStyle(): "parallelogram" | "square" {
    const cached = getStoredOrCachedPreferences();
    const raw = String(cached.menuButtonStyle || safeReadLocalStorage(storageKeys.MENU_BUTTON_STYLE_KEY)).trim().toLowerCase();
    return raw === "square" ? "square" : "parallelogram";
  }

  function loadWeekStarting(): "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" {
    const cached = String(getStoredOrCachedPreferences().weekStarting || safeReadLocalStorage(storageKeys.WEEK_STARTING_KEY))
      .trim()
      .toLowerCase();
    return normalizeDashboardWeekStart(cached);
  }

  function loadTaskView(): "list" | "tile" {
    const localRaw = safeReadLocalStorage(storageKeys.TASK_VIEW_KEY).toLowerCase();
    if (localRaw === "tile" || localRaw === "list") return localRaw;
    const cloudRaw = String(getStoredOrCachedPreferences().taskView || "").trim().toLowerCase();
    return cloudRaw === "tile" ? "tile" : "list";
  }

  function loadAutoFocusOnTaskLaunchEnabled(): boolean {
    const cloudValue = getStoredOrCachedPreferences().autoFocusOnTaskLaunchEnabled;
    if (typeof cloudValue === "boolean") return cloudValue;
    const raw = safeReadLocalStorage(storageKeys.AUTO_FOCUS_ON_TASK_LAUNCH_KEY).toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
    if (raw === "true" || raw === "1" || raw === "on") return true;
    return false;
  }

  function loadDynamicColorsEnabled(): boolean {
    return getStoredOrCachedPreferences().dynamicColorsEnabled !== false;
  }

  function loadMobilePushAlertsEnabled(): boolean {
    const cloudValue = getStoredOrCachedPreferences().mobilePushAlertsEnabled;
    if (typeof cloudValue === "boolean") return cloudValue;
    const raw = safeReadLocalStorage(storageKeys.MOBILE_PUSH_ALERTS_KEY).toLowerCase();
    if (raw === "true" || raw === "1" || raw === "on") return true;
    if (raw === "false" || raw === "0" || raw === "off") return false;
    return false;
  }

  function loadWebPushAlertsEnabled(): boolean {
    const prefs = getStoredOrCachedPreferences();
    if (typeof prefs.webPushAlertsEnabled === "boolean") return prefs.webPushAlertsEnabled;
    const raw = safeReadLocalStorage(storageKeys.WEB_PUSH_ALERTS_KEY).toLowerCase();
    if (raw === "true" || raw === "1" || raw === "on") return true;
    if (raw === "false" || raw === "0" || raw === "off") return false;
    return loadMobilePushAlertsEnabled();
  }

  function loadCheckpointAlerts(): Pick<StoredPreferences, "checkpointAlertSoundEnabled" | "checkpointAlertToastEnabled"> {
    const prefs = getStoredOrCachedPreferences();
    return {
      checkpointAlertSoundEnabled: prefs.checkpointAlertSoundEnabled !== false,
      checkpointAlertToastEnabled: prefs.checkpointAlertToastEnabled !== false,
    };
  }

  function loadOptimalProductivityPeriod(): OptimalProductivityPeriod {
    const cached = options.getCloudPreferencesCache() || repository.loadCachedPreferences();
    const startTime =
      cached?.optimalProductivityStartTime ||
      safeReadLocalStorage(storageKeys.OPTIMAL_PRODUCTIVITY_START_TIME_KEY) ||
      DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME;
    const endTime =
      cached?.optimalProductivityEndTime ||
      safeReadLocalStorage(storageKeys.OPTIMAL_PRODUCTIVITY_END_TIME_KEY) ||
      DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME;
    return normalizeOptimalProductivityPeriod({
      optimalProductivityStartTime: startTime,
      optimalProductivityEndTime: endTime,
    });
  }

  return {
    buildSnapshot,
    persistSnapshot,
    loadThemeMode,
    loadMenuButtonStyle,
    loadWeekStarting,
    loadTaskView,
    loadAutoFocusOnTaskLaunchEnabled,
    loadDynamicColorsEnabled,
    loadMobilePushAlertsEnabled,
    loadWebPushAlertsEnabled,
    loadCheckpointAlerts,
    loadOptimalProductivityPeriod,
    normalizeThemeMode,
  };
}
