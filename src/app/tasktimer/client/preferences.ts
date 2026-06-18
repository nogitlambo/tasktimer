import type { TaskTimerPreferencesContext } from "./context";
import type { MainMode, TaskOrderBy } from "./types";
import { isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { TASKTIMER_PLAN_CHANGED_EVENT } from "../lib/entitlements";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import {
  buildOptimalProductivityDaysShortList,
  buildOptimalProductivityDaysSummary,
  DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS,
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeOptimalProductivityDays,
  normalizeTimeOfDay,
} from "../lib/productivityPeriod";
import { createTaskTimerPreferencesService, type TaskTimerStoredPreferences } from "../lib/preferencesService";
import { SCHEDULE_DAY_ORDER } from "../lib/schedule-placement";
import { normalizeStartupModule } from "../lib/startupModule";
import { syncTaskTimerPushNotificationsEnabled } from "../lib/pushNotifications";
import {
  TASKTIMER_ONBOARDING_PREFERENCES_EVENT,
  type TaskTimerOnboardingPreferenceEventDetail,
  type TaskTimerOnboardingPreferencePayload,
} from "./onboarding-events";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";
import { bindToggleRow } from "./control-helpers";
import { isInteractionHapticsRuntimeAvailable } from "./interaction-haptics";
import {
  getFocusDndEnabled,
  getNativeFocusDndStatus,
  isNativeFocusDndAvailable,
  requestNativeFocusDndAccess,
  setFocusDndEnabled,
} from "../lib/nativeFocusDnd";

type PreferenceEventDeps = {
  handleAppBackNavigation: () => boolean;
};

const CHECKPOINT_ALERT_SOUND_MODE_KEY = "taskticker_tasks_v1:checkpointAlertSoundMode";
const CHECKPOINT_ALERT_TOAST_MODE_KEY = "taskticker_tasks_v1:checkpointAlertToastMode";
type TimePickerInput = HTMLInputElement & { showPicker?: () => void };

type FocusDndAccessStatus = {
  supported?: boolean;
  policyAccessGranted?: boolean;
} | null;

export async function reconcileFocusDndAccessRequestForSettings(options: {
  getStatus: () => Promise<FocusDndAccessStatus>;
  requestAccess: () => Promise<unknown>;
  waitForReturn: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  syncUi: () => Promise<void>;
  setDeniedMessage: () => void;
}) {
  const initialStatus = await options.getStatus().catch(() => null);
  if (!initialStatus?.supported || initialStatus.policyAccessGranted) {
    await options.syncUi();
    return;
  }
  const returnPromise = options.waitForReturn();
  await options.requestAccess();
  await returnPromise;
  const status = await options.getStatus().catch(() => null);
  const denied = !status?.policyAccessGranted;
  if (denied) options.setEnabled(false);
  await options.syncUi();
  if (denied) options.setDeniedMessage();
}

export function createTaskTimerPreferences(ctx: TaskTimerPreferencesContext) {
  const { els } = ctx;
  let focusDndSyncSeq = 0;
  let focusDndAccessRequestSeq = 0;
  const preferenceService = createTaskTimerPreferencesService({
    storageKeys: ctx.storageKeys,
    repository: {
      loadCachedPreferences: () => (ctx.loadCachedPreferences() || null) as TaskTimerStoredPreferences | null,
      buildDefaultPreferences: () => ctx.buildDefaultCloudPreferences() as TaskTimerStoredPreferences,
      savePreferences: (prefs) => ctx.saveCloudPreferences(prefs),
    },
    getCloudPreferencesCache: () => (ctx.getCloudPreferencesCache() || null) as TaskTimerStoredPreferences | null,
    setCloudPreferencesCache: (prefs) => {
      ctx.setCloudPreferencesCache(prefs);
    },
    currentUid: () => String(ctx.currentUid() || ""),
    syncOwnFriendshipProfile: (uid, patch) => ctx.syncOwnFriendshipProfile(uid, patch),
  });

  function canUseAdvancedTaskConfig() {
    return ctx.hasEntitlement("advancedTaskConfig");
  }

  function isDesktopSettingsViewport() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 981px)").matches;
  }

  function isMobileSettingsViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches;
  }

  function syncThemeAvailabilityUi() {
    const appliedTheme = ctx.getThemeMode();

    els.themeLimeBtn?.classList.toggle("isOn", appliedTheme === "lime");
    els.themeLimeBtn?.setAttribute("aria-pressed", appliedTheme === "lime" ? "true" : "false");

    if (els.themeLimeBtn) {
      els.themeLimeBtn.disabled = false;
      els.themeLimeBtn.setAttribute("aria-disabled", "false");
      els.themeLimeBtn.title = "";
    }
  }

  function requireAdvancedTaskConfig(featureLabel: string) {
    if (canUseAdvancedTaskConfig()) return true;
    ctx.showUpgradePrompt(featureLabel, "pro");
    return false;
  }

  function normalizeThemeMode(raw: string | null | undefined): "lime" {
    void raw;
    return "lime";
  }

  function sanitizeModeLabel(value: unknown, fallback: string) {
    return fallback;
  }

  function getModeColor(mode: MainMode) {
    return ctx.defaultModeColors[mode];
  }

  function applyModeAccent(mode: MainMode) {
    document.documentElement.style.setProperty("--mode-accent", getModeColor(mode));
    document.documentElement.style.setProperty("--mode1-accent", getModeColor("mode1"));
  }

  function syncModeLabelsUi() {
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

  function buildCloudPreferencesSnapshot(): ReturnType<typeof preferenceService.buildSnapshot> {
    return preferenceService.buildSnapshot({
      theme: ctx.getThemeMode(),
      menuButtonStyle: ctx.getMenuButtonStyle(),
      weekStarting: ctx.getWeekStarting(),
      startupModule: ctx.getStartupModule(),
      taskView: ctx.getTaskView(),
      taskOrderBy: ctx.getTaskOrderBy(),
      autoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled(),
      dashboardPreviousWeekVisible: ctx.getDashboardPreviousWeekVisible(),
      dynamicColorsEnabled: ctx.getDynamicColorsEnabled(),
      mobilePushAlertsEnabled: ctx.getMobilePushAlertsEnabled(),
      webPushAlertsEnabled: ctx.getWebPushAlertsEnabled(),
      interactionClickSoundEnabled: ctx.getInteractionClickSoundEnabled(),
      achievementSoundsEnabled: ctx.getAchievementSoundsEnabled(),
      interactionHapticsEnabled: ctx.getInteractionHapticsEnabled(),
      interactionHapticsIntensity: ctx.getInteractionHapticsIntensity(),
      checkpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled(),
      checkpointAlertToastEnabled: ctx.getCheckpointAlertToastEnabled(),
      checkpointAlertSoundMode: ctx.getCheckpointAlertSoundMode(),
      checkpointAlertToastMode: ctx.getCheckpointAlertToastMode(),
      optimalProductivityStartTime: ctx.getOptimalProductivityStartTime(),
      optimalProductivityEndTime: ctx.getOptimalProductivityEndTime(),
      optimalProductivityDays: ctx.getOptimalProductivityDays(),
      rewards: ctx.normalizeRewardProgress(ctx.getRewardProgress()) as ReturnType<typeof buildCloudPreferencesSnapshot>["rewards"],
    });
  }

  function persistPreferencesToLocalStorage(snapshot: ReturnType<typeof buildCloudPreferencesSnapshot>) {
    preferenceService.persistSnapshot(snapshot);
  }

  function persistPreferencesToCloud() {
    const snapshot = buildCloudPreferencesSnapshot();
    persistPreferencesToLocalStorage(snapshot);
  }

  function saveModeSettings() {
    syncModeLabelsUi();
  }

  function loadModeLabels() {
    syncModeLabelsUi();
  }

  function applyTheme(mode: "lime") {
    ctx.setThemeModeState(normalizeThemeMode(mode));
    const body = document.body;
    body.setAttribute("data-theme", "lime");
    syncThemeAvailabilityUi();
  }

  function applyTaskViewPreference() {
    ctx.setTaskViewState("tile");
    document.body.setAttribute("data-task-view", "tile");
  }

  function getTaskOrderByLabel(value: TaskOrderBy) {
    if (value === "alpha") return "A-Z";
    if (value === "schedule") return "Schedule/Time";
    if (value === "dateAddedAsc") return "Date Added ↑";
    if (value === "dateAddedDesc") return "Date Added ↓";
    return "Custom";
  }

  function normalizeTaskOrderByValue(raw: unknown): TaskOrderBy {
    const value = String(raw || "").trim();
    if (value === "dateAddedAsc" || value === "dateAddedDesc") return value;
    if (value === "alpha") return "alpha";
    if (value === "schedule") return "schedule";
    return "custom";
  }

  function resolveClickedTaskOrderBy(raw: unknown): TaskOrderBy {
    const value = String(raw || "").trim();
    if (value === "dateAdded") {
      const current = ctx.getTaskOrderBy();
      if (current === "dateAddedAsc") return "dateAddedDesc";
      if (current === "dateAddedDesc") return "dateAddedAsc";
      return "dateAddedAsc";
    }
    return normalizeTaskOrderByValue(value);
  }

  function getLiveTaskOrderByMenus() {
    return Array.from(document.querySelectorAll<HTMLDetailsElement>(".tasksModeMenu"));
  }

  function getLiveTaskOrderByMenuButtons() {
    return Array.from(document.querySelectorAll<HTMLElement>(".tasksModeMenuBtn"));
  }

  function getLiveTaskOrderByValues() {
    return Array.from(document.querySelectorAll<HTMLElement>(".tasksModeMenuBtn #taskOrderByValue"));
  }

  function syncTaskOrderByMenuUi() {
    const taskOrderBy = ctx.getTaskOrderBy();
    const taskOrderByLabel = getTaskOrderByLabel(taskOrderBy);
    getLiveTaskOrderByValues().forEach((valueEl) => {
      valueEl.textContent = taskOrderByLabel;
    });
    getLiveTaskOrderByMenuButtons().forEach((buttonEl) => {
      buttonEl.setAttribute("aria-label", `Order By: ${taskOrderByLabel}`);
    });
    getLiveTaskOrderByMenus().forEach((menuEl) => {
      Array.from(menuEl.querySelectorAll<HTMLElement>(".tasksModeMenuItem[data-task-order-by]")).forEach((item) => {
        const itemValue = String(item.dataset.taskOrderBy || "");
        const isOn =
          itemValue === "dateAdded"
            ? taskOrderBy === "dateAddedAsc" || taskOrderBy === "dateAddedDesc"
            : normalizeTaskOrderByValue(itemValue) === taskOrderBy;
        if (itemValue === "dateAdded") {
          item.textContent = taskOrderBy === "dateAddedDesc" ? "Date Added ↓" : taskOrderBy === "dateAddedAsc" ? "Date Added ↑" : "Date Added";
        }
        item.classList.toggle("isOn", isOn);
        item.setAttribute("aria-pressed", isOn ? "true" : "false");
      });
    });
  }

  function applyTaskOrderByPreference(next: TaskOrderBy) {
    const taskOrderBy = normalizeTaskOrderByValue(next);
    ctx.setTaskOrderByState(taskOrderBy);
    syncTaskOrderByMenuUi();
  }

  function applyMenuButtonStyle(next: "square") {
    const menuButtonStyle = "square";
    void next;
    ctx.setMenuButtonStyleState(menuButtonStyle);
  }

  function loadThemePreference() {
    applyTheme(preferenceService.loadThemeMode());
  }

  function loadMenuButtonStylePreference() {
    applyMenuButtonStyle(preferenceService.loadMenuButtonStyle());
  }

  function applyWeekStartingPreference(next: DashboardWeekStart) {
    ctx.setWeekStartingState(normalizeDashboardWeekStart(next));
    if (els.taskWeekStartingSelect) {
      els.taskWeekStartingSelect.value = ctx.getWeekStarting();
    }
  }

  function loadWeekStartingPreference() {
    applyWeekStartingPreference(preferenceService.loadWeekStarting());
  }

  function applyStartupModulePreference(next: string) {
    const startupModule = normalizeStartupModule(next);
    ctx.setStartupModuleState(startupModule);
    if (els.taskStartupModuleSelect) {
      els.taskStartupModuleSelect.value = startupModule;
    }
  }

  function loadStartupModulePreference() {
    applyStartupModulePreference(preferenceService.loadStartupModule());
  }

  function saveStartupModulePreference() {
    try {
      localStorage.setItem(ctx.storageKeys.STARTUP_MODULE_KEY, ctx.getStartupModule());
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function saveWeekStartingPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.WEEK_STARTING_KEY, ctx.getWeekStarting());
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadTaskViewPreference() {
    applyTaskViewPreference();
  }

  function saveTaskViewPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.TASK_VIEW_KEY, "tile");
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadTaskOrderByPreference() {
    applyTaskOrderByPreference(preferenceService.loadTaskOrderBy());
  }

  function saveTaskOrderByPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.TASK_ORDER_BY_KEY, ctx.getTaskOrderBy());
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadAutoFocusOnTaskLaunchSetting() {
    ctx.setAutoFocusOnTaskLaunchEnabledState(preferenceService.loadAutoFocusOnTaskLaunchEnabled());
  }

  function loadDashboardPreviousWeekSetting() {
    ctx.setDashboardPreviousWeekVisibleState(preferenceService.loadDashboardPreviousWeekVisible());
  }

  function saveAutoFocusOnTaskLaunchSetting() {
    try {
      localStorage.setItem(
        ctx.storageKeys.AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
        ctx.getAutoFocusOnTaskLaunchEnabled() ? "true" : "false"
      );
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function saveDashboardPreviousWeekSetting() {
    try {
      localStorage.setItem(
        ctx.storageKeys.DASHBOARD_PREVIOUS_WEEK_VISIBLE_KEY,
        ctx.getDashboardPreviousWeekVisible() ? "true" : "false"
      );
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function syncTaskSettingsUi() {
    const weekStarting = ctx.getWeekStarting();
    const startupModule = ctx.getStartupModule();
    ctx.setTaskViewState("tile");
    ctx.toggleSwitchElement(els.taskAutoFocusOnLaunchToggle as HTMLElement | null, ctx.getAutoFocusOnTaskLaunchEnabled());
    ctx.toggleSwitchElement(els.dashboardPreviousWeekToggle as HTMLElement | null, ctx.getDashboardPreviousWeekVisible());
    ctx.toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, ctx.getDynamicColorsEnabled());
    ctx.toggleSwitchElement(els.taskMobilePushAlertsToggle as HTMLElement | null, ctx.getMobilePushAlertsEnabled());
    ctx.toggleSwitchElement(els.taskWebPushAlertsToggle as HTMLElement | null, ctx.getWebPushAlertsEnabled());
    ctx.toggleSwitchElement(els.taskInteractionClickSoundToggle as HTMLElement | null, ctx.getInteractionClickSoundEnabled());
    ctx.toggleSwitchElement(els.taskAchievementSoundsToggle as HTMLElement | null, ctx.getAchievementSoundsEnabled());
    ctx.toggleSwitchElement(els.taskInteractionHapticsToggle as HTMLElement | null, ctx.getInteractionHapticsEnabled());
    syncInteractionHapticsIntensityUi();
    ctx.toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, ctx.getCheckpointAlertSoundEnabled());
    ctx.toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, ctx.getCheckpointAlertToastEnabled());
    if (els.taskCheckpointSoundModeSelect) {
      els.taskCheckpointSoundModeSelect.value = ctx.getCheckpointAlertSoundMode();
      els.taskCheckpointSoundModeSelect.disabled = !ctx.getCheckpointAlertSoundEnabled();
    }
    if (els.taskCheckpointToastModeSelect) {
      els.taskCheckpointToastModeSelect.value = ctx.getCheckpointAlertToastMode();
      els.taskCheckpointToastModeSelect.disabled = !ctx.getCheckpointAlertToastEnabled();
    }
    els.taskCheckpointSoundModeField?.classList.toggle("isHidden", !ctx.getCheckpointAlertSoundEnabled());
    els.taskCheckpointToastModeField?.classList.toggle("isHidden", !ctx.getCheckpointAlertToastEnabled());
    if (els.taskWeekStartingSelect) {
      els.taskWeekStartingSelect.value = weekStarting;
    }
    if (els.taskStartupModuleSelect) {
      els.taskStartupModuleSelect.value = startupModule;
    }
    void syncFocusDndSettingsUi();
    if (els.optimalProductivityStartTimeInput) {
      els.optimalProductivityStartTimeInput.value = ctx.getOptimalProductivityStartTime();
    }
    if (els.optimalProductivityEndTimeInput) {
      els.optimalProductivityEndTimeInput.value = ctx.getOptimalProductivityEndTime();
    }
    syncOptimalProductivityPeriodUi();
    syncOptimalProductivityDaysUi();
    syncTaskOrderByMenuUi();
    const lockAdvancedTaskConfig = !canUseAdvancedTaskConfig();
    if (els.taskDynamicColorsToggle) {
      (els.taskDynamicColorsToggle as HTMLButtonElement).disabled = lockAdvancedTaskConfig;
      els.taskDynamicColorsToggle.setAttribute("aria-disabled", String(lockAdvancedTaskConfig));
      els.taskDynamicColorsToggle.title = lockAdvancedTaskConfig ? "Pro feature: Dynamic colors" : "";
    }
    const lockMobilePushAlerts = isDesktopSettingsViewport();
    if (els.taskMobilePushAlertsToggle) {
      (els.taskMobilePushAlertsToggle as HTMLButtonElement).disabled = lockMobilePushAlerts;
      els.taskMobilePushAlertsToggle.setAttribute("aria-disabled", String(lockMobilePushAlerts));
      els.taskMobilePushAlertsToggle.title = lockMobilePushAlerts ? "Use the mobile app to change mobile push alerts." : "";
    }
    els.taskMobilePushAlertsToggleRow?.classList.toggle("isDisabled", lockMobilePushAlerts);
    const lockWebPushAlerts = isMobileSettingsViewport();
    if (els.taskWebPushAlertsToggle) {
      (els.taskWebPushAlertsToggle as HTMLButtonElement).disabled = lockWebPushAlerts;
      els.taskWebPushAlertsToggle.setAttribute("aria-disabled", String(lockWebPushAlerts));
      els.taskWebPushAlertsToggle.title = lockWebPushAlerts ? "Use desktop web to change web push alerts." : "";
    }
    els.taskWebPushAlertsToggleRow?.classList.toggle("isDisabled", lockWebPushAlerts);
    const showInteractionHaptics = isInteractionHapticsRuntimeAvailable();
    if (els.taskInteractionHapticsToggleRow) {
      (els.taskInteractionHapticsToggleRow as HTMLElement).hidden = !showInteractionHaptics;
    }
    if (els.taskInteractionHapticsIntensityField) {
      (els.taskInteractionHapticsIntensityField as HTMLElement).hidden =
        !showInteractionHaptics || !ctx.getInteractionHapticsEnabled();
    }
    if (els.taskInteractionHapticsToggle) {
      (els.taskInteractionHapticsToggle as HTMLButtonElement).disabled = !showInteractionHaptics;
      els.taskInteractionHapticsToggle.setAttribute("aria-disabled", String(!showInteractionHaptics));
      els.taskInteractionHapticsToggle.title = showInteractionHaptics ? "" : "Use the mobile app to change interaction haptics.";
    }
    if (els.taskCheckpointSoundToggle) {
      (els.taskCheckpointSoundToggle as HTMLButtonElement).disabled = false;
      els.taskCheckpointSoundToggle.setAttribute("aria-disabled", "false");
      els.taskCheckpointSoundToggle.title = "";
    }
    if (els.taskCheckpointToastToggle) {
      (els.taskCheckpointToastToggle as HTMLButtonElement).disabled = false;
      els.taskCheckpointToastToggle.setAttribute("aria-disabled", "false");
      els.taskCheckpointToastToggle.title = "";
    }
    const currentEditTask = ctx.getCurrentEditTask();
    if (currentEditTask) ctx.syncEditCheckpointAlertUi(currentEditTask);
  }

  function loadDynamicColorsSetting() {
    ctx.setDynamicColorsEnabledState(preferenceService.loadDynamicColorsEnabled());
  }

  function loadInteractionClickSoundSetting() {
    ctx.setInteractionClickSoundEnabledState(preferenceService.loadInteractionClickSoundEnabled());
  }

  function loadAchievementSoundsSetting() {
    ctx.setAchievementSoundsEnabledState(preferenceService.loadAchievementSoundsEnabled());
  }

  function loadInteractionHapticsSetting() {
    ctx.setInteractionHapticsEnabledState(preferenceService.loadInteractionHapticsEnabled());
    ctx.setInteractionHapticsIntensityState(preferenceService.loadInteractionHapticsIntensity());
  }

  function saveInteractionClickSoundSetting() {
    try {
      localStorage.setItem(
        ctx.storageKeys.INTERACTION_CLICK_SOUND_KEY,
        ctx.getInteractionClickSoundEnabled() ? "true" : "false"
      );
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function saveAchievementSoundsSetting() {
    try {
      localStorage.setItem(
        ctx.storageKeys.ACHIEVEMENT_SOUNDS_KEY,
        ctx.getAchievementSoundsEnabled() ? "true" : "false"
      );
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function saveInteractionHapticsSetting() {
    try {
      localStorage.setItem(
        ctx.storageKeys.INTERACTION_HAPTICS_KEY,
        ctx.getInteractionHapticsEnabled() ? "true" : "false"
      );
      localStorage.setItem(
        ctx.storageKeys.INTERACTION_HAPTICS_INTENSITY_KEY,
        normalizeInteractionHapticsIntensity(ctx.getInteractionHapticsIntensity())
      );
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function syncInteractionHapticsIntensityUi() {
    const current = ctx.getInteractionHapticsIntensity();
    const buttons = [
      els.taskInteractionHapticsIntensityMax,
      els.taskInteractionHapticsIntensityMed,
      els.taskInteractionHapticsIntensityLow,
    ];
    buttons.forEach((button) => {
      if (!button) return;
      const value = normalizeInteractionHapticsIntensity((button as HTMLElement).dataset.hapticsIntensity);
      const isOn = value === current;
      button.classList.toggle("isOn", isOn);
      button.setAttribute("aria-pressed", isOn ? "true" : "false");
    });
  }

  function getFocusDndStorageKey() {
    return ctx.storageKeys.FOCUS_DND_STORAGE_KEY;
  }

  async function syncFocusDndSettingsUi() {
    const seq = ++focusDndSyncSeq;
    const enabled = getFocusDndEnabled(getFocusDndStorageKey());
    const available = isNativeFocusDndAvailable();
    if (els.taskFocusDndSectionHead) (els.taskFocusDndSectionHead as HTMLElement).hidden = !available;
    if (els.taskFocusDndToggleRow) (els.taskFocusDndToggleRow as HTMLElement).hidden = !available;
    if (els.taskFocusDndPanel) (els.taskFocusDndPanel as HTMLElement).hidden = !available;
    ctx.toggleSwitchElement(els.taskFocusDndToggle as HTMLElement | null, enabled);
    if (!available) {
      if (els.taskFocusDndStatus) els.taskFocusDndStatus.textContent = "Focus Do Not Disturb is available only in the Android app.";
      if (els.taskFocusDndAccessBtn) els.taskFocusDndAccessBtn.disabled = true;
      return;
    }
    const status = await getNativeFocusDndStatus().catch(() => null);
    if (seq !== focusDndSyncSeq) return;
    if (els.taskFocusDndStatus) {
      els.taskFocusDndStatus.textContent = !status?.policyAccessGranted
        ? "Needs Android Do Not Disturb access before Focus Mode can silence interruptions."
        : enabled
          ? "Ready. Android will switch to Priority Only while Focus Mode is open."
          : "Ready. Turn this on to use Do Not Disturb during Focus Mode.";
    }
    if (els.taskFocusDndAccessBtn) els.taskFocusDndAccessBtn.disabled = false;
  }

  function waitForFocusDndAccessReturn(timeoutMs = 15_000) {
    if (typeof window === "undefined") return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      let timeoutId: number | null = null;
      const startedAt = Date.now();
      const minDelayMs = 750;
      const cleanup = () => {
        window.removeEventListener("focus", onReturn);
        document.removeEventListener("visibilitychange", onReturn);
        if (timeoutId != null) window.clearTimeout(timeoutId);
      };
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const onReturn = () => {
        if (Date.now() - startedAt < minDelayMs) return;
        if (document.visibilityState && document.visibilityState !== "visible") return;
        finish();
      };
      window.addEventListener("focus", onReturn, { once: false });
      document.addEventListener("visibilitychange", onReturn, { once: false });
      timeoutId = window.setTimeout(finish, timeoutMs);
    });
  }

  async function requestFocusDndAccessAndReconcile() {
    const requestSeq = ++focusDndAccessRequestSeq;
    if (requestSeq !== focusDndAccessRequestSeq) return;
    await reconcileFocusDndAccessRequestForSettings({
      getStatus: () => getNativeFocusDndStatus(),
      requestAccess: () => requestNativeFocusDndAccess(),
      waitForReturn: () => waitForFocusDndAccessReturn(),
      setEnabled: (enabled) => {
        if (requestSeq === focusDndAccessRequestSeq) setFocusDndEnabled(getFocusDndStorageKey(), enabled);
      },
      syncUi: () => (requestSeq === focusDndAccessRequestSeq ? syncFocusDndSettingsUi() : Promise.resolve()),
      setDeniedMessage: () => {
        if (requestSeq === focusDndAccessRequestSeq && els.taskFocusDndStatus) {
          els.taskFocusDndStatus.textContent = "Focus Do Not Disturb was not enabled because Android DND access was denied.";
        }
      },
    });
  }

  function applyInteractionHapticsIntensityPreference(next: InteractionHapticsIntensity) {
    ctx.setInteractionHapticsIntensityState(normalizeInteractionHapticsIntensity(next));
    syncTaskSettingsUi();
    saveInteractionHapticsSetting();
  }

  function loadMobilePushAlertsSetting() {
    ctx.setMobilePushAlertsEnabledState(preferenceService.loadMobilePushAlertsEnabled());
    ctx.setWebPushAlertsEnabledState(preferenceService.loadWebPushAlertsEnabled());
  }

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function saveMobilePushAlertsSetting() {
    persistPreferencesToCloud();
  }

  async function applyMobilePushAlertsPreference(nextEnabled: boolean) {
    if (!ctx.currentUid()) {
      window.location.assign("/login");
      return;
    }
    ctx.setMobilePushAlertsEnabledState(nextEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
    const appliedEnabled = await syncTaskTimerPushNotificationsEnabled({
      mobileEnabled: nextEnabled,
      webEnabled: ctx.getWebPushAlertsEnabled(),
    }).catch(() => ({ mobileEnabled: false, webEnabled: ctx.getWebPushAlertsEnabled() }));
    if (appliedEnabled.mobileEnabled === nextEnabled) return;
    ctx.setMobilePushAlertsEnabledState(appliedEnabled.mobileEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
  }

  async function applyWebPushAlertsPreference(nextEnabled: boolean) {
    if (!ctx.currentUid()) {
      window.location.assign("/login");
      return;
    }
    ctx.setWebPushAlertsEnabledState(nextEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
    const appliedEnabled = await syncTaskTimerPushNotificationsEnabled({
      mobileEnabled: ctx.getMobilePushAlertsEnabled(),
      webEnabled: nextEnabled,
    }).catch(() => ({ mobileEnabled: ctx.getMobilePushAlertsEnabled(), webEnabled: false }));
    if (appliedEnabled.webEnabled === nextEnabled) return;
    ctx.setWebPushAlertsEnabledState(appliedEnabled.webEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
  }

  async function applyOnboardingPreferences(payload: TaskTimerOnboardingPreferencePayload) {
    if (payload.weekStarting) {
      applyWeekStartingPreference(normalizeDashboardWeekStart(payload.weekStarting));
      saveWeekStartingPreference();
    }
    if (payload.optimalProductivityDays) {
      applyOptimalProductivityDaysPreference(payload.optimalProductivityDays);
      saveOptimalProductivityDaysPreference();
    }
    if (payload.optimalProductivityStartTime || payload.optimalProductivityEndTime) {
      applyOptimalProductivityPeriodPreference(
        payload.optimalProductivityStartTime || ctx.getOptimalProductivityStartTime(),
        payload.optimalProductivityEndTime || ctx.getOptimalProductivityEndTime()
      );
      saveOptimalProductivityPeriodPreference();
    }
    if (typeof payload.pushNotificationsEnabled === "boolean") {
      if (isNativeOrFileRuntime()) {
        await applyMobilePushAlertsPreference(payload.pushNotificationsEnabled);
      } else {
        await applyWebPushAlertsPreference(payload.pushNotificationsEnabled);
      }
    }
    syncTaskSettingsUi();
    ctx.render();
  }

  function loadCheckpointAlertSettings() {
    const prefs = preferenceService.loadCheckpointAlerts();
    ctx.setMobilePushAlertsEnabledState(preferenceService.loadMobilePushAlertsEnabled());
    ctx.setWebPushAlertsEnabledState(preferenceService.loadWebPushAlertsEnabled());
    ctx.setCheckpointAlertSoundEnabledState(prefs.checkpointAlertSoundEnabled !== false);
    ctx.setCheckpointAlertToastEnabledState(prefs.checkpointAlertToastEnabled !== false);
    ctx.setCheckpointAlertSoundModeState(prefs.checkpointAlertSoundMode === "repeat" ? "repeat" : "once");
    ctx.setCheckpointAlertToastModeState(prefs.checkpointAlertToastMode === "manual" ? "manual" : "auto5s");
  }

  function saveCheckpointAlertBehaviourSettings() {
    ctx.setCheckpointAlertSoundModeState(els.taskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once");
    ctx.setCheckpointAlertToastModeState(els.taskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s");
    try {
      localStorage.setItem(
        CHECKPOINT_ALERT_SOUND_MODE_KEY,
        ctx.getCheckpointAlertSoundMode()
      );
      localStorage.setItem(
        CHECKPOINT_ALERT_TOAST_MODE_KEY,
        ctx.getCheckpointAlertToastMode()
      );
    } catch {
      // ignore localStorage write failures
    }
  }

  function saveCheckpointAlertSettings() {
    saveCheckpointAlertBehaviourSettings();
    persistPreferencesToCloud();
  }

  function applyOptimalProductivityPeriodPreference(nextStart: string, nextEnd: string) {
    const startTime = normalizeTimeOfDay(nextStart, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME);
    const endTime = normalizeTimeOfDay(nextEnd, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME);
    ctx.setOptimalProductivityStartTimeState(startTime);
    ctx.setOptimalProductivityEndTimeState(endTime);
    if (els.optimalProductivityStartTimeInput) els.optimalProductivityStartTimeInput.value = startTime;
    if (els.optimalProductivityEndTimeInput) els.optimalProductivityEndTimeInput.value = endTime;
    syncOptimalProductivityPeriodUi();
  }

  function formatOptimalProductivityClockTimeLabel(value: unknown, fallback: string) {
    const normalized = normalizeTimeOfDay(value, fallback);
    const [hourRaw, minuteRaw] = normalized.split(":");
    const hour24 = Math.max(0, Math.min(23, Number(hourRaw || 0)));
    const hour12 = hour24 % 12 || 12;
    const meridiem = hour24 >= 12 ? "PM" : "AM";
    return `${hour12}:${String(Number(minuteRaw || 0)).padStart(2, "0")} ${meridiem}`;
  }

  function syncOptimalProductivityPeriodUi() {
    const startLabel = formatOptimalProductivityClockTimeLabel(
      ctx.getOptimalProductivityStartTime(),
      DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME
    );
    const endLabel = formatOptimalProductivityClockTimeLabel(
      ctx.getOptimalProductivityEndTime(),
      DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
    );
    if (els.optimalProductivityStartTimeValue) els.optimalProductivityStartTimeValue.textContent = startLabel;
    if (els.optimalProductivityEndTimeValue) els.optimalProductivityEndTimeValue.textContent = endLabel;
    if (els.optimalProductivityStartTimeButton) {
      els.optimalProductivityStartTimeButton.setAttribute("aria-label", `Choose optimal productivity start time, current ${startLabel}`);
    }
    if (els.optimalProductivityEndTimeButton) {
      els.optimalProductivityEndTimeButton.setAttribute("aria-label", `Choose optimal productivity end time, current ${endLabel}`);
    }
  }

  function openOptimalProductivityTimePicker(input: HTMLInputElement | null) {
    if (!input) return;
    input.focus();
    const pickerInput = input as TimePickerInput;
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fall back to a visible native field when browser picker access is blocked.
      }
    }
    input.classList.add("isFallbackVisible");
    window.setTimeout(() => input.focus(), 0);
  }

  function getOptimalProductivityDayInputs() {
    return [
      els.optimalProductivityDaySun,
      els.optimalProductivityDayMon,
      els.optimalProductivityDayTue,
      els.optimalProductivityDayWed,
      els.optimalProductivityDayThu,
      els.optimalProductivityDayFri,
      els.optimalProductivityDaySat,
    ].filter((input): input is HTMLInputElement => !!input);
  }

  function getOptimalProductivityDayDisplayOrder() {
    const weekStarting = normalizeDashboardWeekStart(ctx.getWeekStarting());
    const startIndex = SCHEDULE_DAY_ORDER.indexOf(weekStarting);
    return startIndex < 0
      ? [...SCHEDULE_DAY_ORDER]
      : SCHEDULE_DAY_ORDER.slice(startIndex).concat(SCHEDULE_DAY_ORDER.slice(0, startIndex));
  }

  function syncOptimalProductivityDaysOrderUi() {
    if (!els.optimalProductivityDaysMenu) return;
    const inputsByDay = new Map(
      getOptimalProductivityDayInputs().map((input) => [normalizeDashboardWeekStart(input.value), input] as const)
    );
    getOptimalProductivityDayDisplayOrder().forEach((day) => {
      const row = inputsByDay.get(day)?.closest(".chkRow");
      if (row) els.optimalProductivityDaysMenu?.appendChild(row);
    });
    if (els.optimalProductivityDaysAllBtn) {
      els.optimalProductivityDaysMenu.appendChild(els.optimalProductivityDaysAllBtn);
    }
  }

  function syncTaskScheduleDaysHelper(helperEl: HTMLElement | null, days: ReturnType<typeof normalizeOptimalProductivityDays>) {
    if (!helperEl) return;
    const summaryText = buildOptimalProductivityDaysShortList(days);
    const summaryEl = helperEl.querySelector<HTMLElement>("[data-optimal-productivity-days-summary]");
    if (summaryEl) {
      summaryEl.textContent = summaryText;
      return;
    }
    helperEl.textContent = `Task will be scheduled on your optimal productivity days: ${summaryText}`;
  }

  function syncOptimalProductivityDaysUi() {
    const days = normalizeOptimalProductivityDays(ctx.getOptimalProductivityDays());
    syncOptimalProductivityDaysOrderUi();
    getOptimalProductivityDayInputs().forEach((input) => {
      input.checked = days.includes(normalizeDashboardWeekStart(input.value));
    });
    if (!els.optimalProductivityDaysTrigger) {
      els.optimalProductivityDaysMenu?.removeAttribute("hidden");
    }
    if (els.optimalProductivityDaysSummary) {
      els.optimalProductivityDaysSummary.textContent = buildOptimalProductivityDaysSummary(days);
    }
    if (els.optimalProductivityDaysAllBtn) {
      const allSelected = days.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length;
      els.optimalProductivityDaysAllBtn.classList.toggle("isSelected", allSelected);
      els.optimalProductivityDaysAllBtn.setAttribute("aria-pressed", allSelected ? "true" : "false");
    }
    syncTaskScheduleDaysHelper(els.addTaskOptimalProductivityDaysHelper as HTMLElement | null, days);
    syncTaskScheduleDaysHelper(els.editTaskOptimalProductivityDaysHelper as HTMLElement | null, days);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tasktimer:optimal-productivity-days-changed"));
    }
    if (els.optimalProductivityDaysTrigger) {
      const expanded = !els.optimalProductivityDaysMenu?.hasAttribute("hidden");
      els.optimalProductivityDaysTrigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function closeOptimalProductivityDaysMenu() {
    if (!els.optimalProductivityDaysTrigger) return;
    if (els.optimalProductivityDaysMenu) els.optimalProductivityDaysMenu.setAttribute("hidden", "");
    if (els.optimalProductivityDaysTrigger) els.optimalProductivityDaysTrigger.setAttribute("aria-expanded", "false");
  }

  function openOptimalProductivityDaysMenu() {
    els.optimalProductivityDaysMenu?.removeAttribute("hidden");
    if (els.optimalProductivityDaysTrigger) els.optimalProductivityDaysTrigger.setAttribute("aria-expanded", "true");
  }

  function toggleOptimalProductivityDaysMenu() {
    if (els.optimalProductivityDaysMenu?.hasAttribute("hidden")) openOptimalProductivityDaysMenu();
    else closeOptimalProductivityDaysMenu();
  }

  function applyOptimalProductivityDaysPreference(nextDays: unknown) {
    const days = normalizeOptimalProductivityDays(nextDays);
    ctx.setOptimalProductivityDaysState(days);
    syncOptimalProductivityDaysUi();
  }

  function loadOptimalProductivityDaysPreference() {
    applyOptimalProductivityDaysPreference(preferenceService.loadOptimalProductivityDays());
  }

  function saveOptimalProductivityDaysPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY, normalizeOptimalProductivityDays(ctx.getOptimalProductivityDays()).join(","));
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadOptimalProductivityPeriodPreference() {
    const period = preferenceService.loadOptimalProductivityPeriod();
    applyOptimalProductivityPeriodPreference(period.startTime, period.endTime);
  }

  function saveOptimalProductivityPeriodPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.OPTIMAL_PRODUCTIVITY_START_TIME_KEY, ctx.getOptimalProductivityStartTime());
      localStorage.setItem(ctx.storageKeys.OPTIMAL_PRODUCTIVITY_END_TIME_KEY, ctx.getOptimalProductivityEndTime());
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function setThemeMode(next: "lime") {
    applyTheme(normalizeThemeMode(next));
    persistPreferencesToCloud();
  }

  function setMenuButtonStyle(next: "square") {
    applyMenuButtonStyle(next);
    persistPreferencesToCloud();
  }

  function persistInlineTaskSettingsImmediate() {
    saveWeekStartingPreference();
    saveStartupModulePreference();
    saveTaskViewPreference();
    saveTaskOrderByPreference();
    saveAutoFocusOnTaskLaunchSetting();
    saveDynamicColorsSetting();
    saveMobilePushAlertsSetting();
    saveAchievementSoundsSetting();
    saveCheckpointAlertSettings();
    saveInteractionHapticsSetting();
    saveOptimalProductivityPeriodPreference();
    saveOptimalProductivityDaysPreference();
    ctx.render();
  }

  function applyMainMode(mode: MainMode) {
    applyModeAccent(mode);
    document.body.setAttribute("data-main-mode", "mode1");
    els.mode1View?.classList.toggle("modeViewOn", true);
    ctx.render();
  }

  function registerPreferenceEvents(deps: PreferenceEventDeps) {
    const { handleAppBackNavigation } = deps;

    ctx.on(els.closeMenuBtn, "click", () => {
      handleAppBackNavigation();
    });
    ctx.on(els.themeLimeBtn, "click", () => {
      setThemeMode("lime");
    });
    ctx.on(window, TASKTIMER_PLAN_CHANGED_EVENT, () => {
      syncThemeAvailabilityUi();
    });
    ctx.on(window, TASKTIMER_ONBOARDING_PREFERENCES_EVENT, (event) => {
      const detail = (event as CustomEvent<TaskTimerOnboardingPreferenceEventDetail>).detail;
      void applyOnboardingPreferences(detail?.payload || {})
        .then(() => detail?.done?.({ ok: true }))
        .catch((error: unknown) => {
          const message = error instanceof Error && error.message ? error.message : "Could not save onboarding settings.";
          detail?.done?.({ ok: false, error: message });
        });
    });
    ctx.on(els.taskWeekStartingSelect, "change", () => {
      applyWeekStartingPreference(normalizeDashboardWeekStart(els.taskWeekStartingSelect?.value));
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskStartupModuleSelect, "change", () => {
      applyStartupModulePreference(els.taskStartupModuleSelect?.value || "dashboard");
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(document, "click", (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.(".tasksModeMenu .tasksModeMenuItem[data-task-order-by]") as HTMLButtonElement | null;
      if (!button) return;
      const nextValue = resolveClickedTaskOrderBy(button.dataset.taskOrderBy);
      applyTaskOrderByPreference(nextValue);
      ctx.clearTaskFlipStates();
      ctx.render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
      getLiveTaskOrderByMenus().forEach((menu) => {
        menu.open = false;
      });
    });
    ctx.on(document, "pointerdown", (event: Event) => {
      const target = event.target as Node | null;
      getLiveTaskOrderByMenus().forEach((menu) => {
        if (!menu.open) return;
        if (target && menu.contains(target)) return;
        menu.open = false;
      });
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskAutoFocusOnLaunchToggle,
      row: els.taskAutoFocusOnLaunchToggleRow,
      ignoreSelector: "#taskAutoFocusOnLaunchToggle",
      handleToggle: () => {
        ctx.setAutoFocusOnTaskLaunchEnabledState(!ctx.getAutoFocusOnTaskLaunchEnabled());
        syncTaskSettingsUi();
        persistInlineTaskSettingsImmediate();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.dashboardPreviousWeekToggle,
      row: els.dashboardPreviousWeekToggleRow,
      ignoreSelector: "#dashboardPreviousWeekToggle",
      handleToggle: () => {
        ctx.setDashboardPreviousWeekVisibleState(!ctx.getDashboardPreviousWeekVisible());
        syncTaskSettingsUi();
        saveDashboardPreviousWeekSetting();
        ctx.renderDashboardWidgets();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskFocusDndToggle,
      row: els.taskFocusDndToggleRow,
      ignoreSelector: "#taskFocusDndToggle",
      handleToggle: () => {
        const nextEnabled = !getFocusDndEnabled(getFocusDndStorageKey());
        setFocusDndEnabled(getFocusDndStorageKey(), nextEnabled);
        void syncFocusDndSettingsUi();
        if (nextEnabled) {
          void getNativeFocusDndStatus()
            .then((status) => {
              if (status.supported && !status.policyAccessGranted) return requestFocusDndAccessAndReconcile();
              return undefined;
            })
            .catch(() => {});
        } else {
          focusDndAccessRequestSeq += 1;
        }
      },
    });
    ctx.on(els.taskFocusDndAccessBtn, "click", () => {
      void requestFocusDndAccessAndReconcile()
        .catch(() => {});
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskDynamicColorsToggle,
      row: els.taskDynamicColorsToggleRow,
      ignoreSelector: "#taskDynamicColorsToggle",
      handleToggle: () => {
        if (!requireAdvancedTaskConfig("Dynamic colors")) return;
        ctx.setDynamicColorsEnabledState(!ctx.getDynamicColorsEnabled());
        syncTaskSettingsUi();
        persistInlineTaskSettingsImmediate();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskMobilePushAlertsToggle,
      row: els.taskMobilePushAlertsToggleRow,
      ignoreSelector: "#taskMobilePushAlertsToggle",
      handleToggle: () => {
        if (isDesktopSettingsViewport()) return;
        void applyMobilePushAlertsPreference(!ctx.getMobilePushAlertsEnabled());
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskWebPushAlertsToggle,
      row: els.taskWebPushAlertsToggleRow,
      ignoreSelector: "#taskWebPushAlertsToggle",
      handleToggle: () => {
        if (isMobileSettingsViewport()) return;
        void applyWebPushAlertsPreference(!ctx.getWebPushAlertsEnabled());
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskInteractionClickSoundToggle,
      row: els.taskInteractionClickSoundToggleRow,
      ignoreSelector: "#taskInteractionClickSoundToggle",
      handleToggle: () => {
        ctx.setInteractionClickSoundEnabledState(!ctx.getInteractionClickSoundEnabled());
        syncTaskSettingsUi();
        saveInteractionClickSoundSetting();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskAchievementSoundsToggle,
      row: els.taskAchievementSoundsToggleRow,
      ignoreSelector: "#taskAchievementSoundsToggle",
      handleToggle: () => {
        ctx.setAchievementSoundsEnabledState(!ctx.getAchievementSoundsEnabled());
        syncTaskSettingsUi();
        saveAchievementSoundsSetting();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskInteractionHapticsToggle,
      row: els.taskInteractionHapticsToggleRow,
      ignoreSelector: "#taskInteractionHapticsToggle",
      handleToggle: () => {
        if (!isInteractionHapticsRuntimeAvailable()) return;
        ctx.setInteractionHapticsEnabledState(!ctx.getInteractionHapticsEnabled());
        syncTaskSettingsUi();
        saveInteractionHapticsSetting();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskCheckpointSoundToggle,
      row: els.taskCheckpointSoundToggleRow,
      ignoreSelector: "#taskCheckpointSoundToggle",
      handleToggle: () => {
        const nextValue = !ctx.getCheckpointAlertSoundEnabled();
        ctx.setCheckpointAlertSoundEnabledState(nextValue);
        if (!nextValue) ctx.stopCheckpointRepeatAlert();
        syncTaskSettingsUi();
        persistInlineTaskSettingsImmediate();
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskCheckpointToastToggle,
      row: els.taskCheckpointToastToggleRow,
      ignoreSelector: "#taskCheckpointToastToggle",
      handleToggle: () => {
        ctx.setCheckpointAlertToastEnabledState(!ctx.getCheckpointAlertToastEnabled());
        syncTaskSettingsUi();
        persistInlineTaskSettingsImmediate();
      },
    });
    ctx.on(els.taskCheckpointSoundModeSelect, "change", () => {
      saveCheckpointAlertBehaviourSettings();
      persistPreferencesToCloud();
      syncTaskSettingsUi();
    });
    ctx.on(els.taskCheckpointToastModeSelect, "change", () => {
      saveCheckpointAlertBehaviourSettings();
      persistPreferencesToCloud();
      syncTaskSettingsUi();
    });
    [
      els.taskInteractionHapticsIntensityMax,
      els.taskInteractionHapticsIntensityMed,
      els.taskInteractionHapticsIntensityLow,
    ].forEach((button) => {
      ctx.on(button, "click", () => {
        if (!isInteractionHapticsRuntimeAvailable() || !ctx.getInteractionHapticsEnabled()) return;
        applyInteractionHapticsIntensityPreference(
          normalizeInteractionHapticsIntensity((button as HTMLElement | null)?.dataset.hapticsIntensity)
        );
      });
    });
    ctx.on(els.optimalProductivityStartTimeInput, "change", () => {
      els.optimalProductivityStartTimeInput?.classList.remove("isFallbackVisible");
      applyOptimalProductivityPeriodPreference(
        els.optimalProductivityStartTimeInput?.value || DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
        ctx.getOptimalProductivityEndTime()
      );
      saveOptimalProductivityPeriodPreference();
      ctx.render();
    });
    ctx.on(els.optimalProductivityEndTimeInput, "change", () => {
      els.optimalProductivityEndTimeInput?.classList.remove("isFallbackVisible");
      applyOptimalProductivityPeriodPreference(
        ctx.getOptimalProductivityStartTime(),
        els.optimalProductivityEndTimeInput?.value || DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
      );
      saveOptimalProductivityPeriodPreference();
      ctx.render();
    });
    ctx.on(els.optimalProductivityStartTimeButton, "click", () => {
      openOptimalProductivityTimePicker(els.optimalProductivityStartTimeInput);
    });
    ctx.on(els.optimalProductivityEndTimeButton, "click", () => {
      openOptimalProductivityTimePicker(els.optimalProductivityEndTimeInput);
    });
    ctx.on(window, "resize", () => {
      syncTaskSettingsUi();
    });
    ctx.on(els.optimalProductivityDaysTrigger, "click", () => {
      toggleOptimalProductivityDaysMenu();
    });
    ctx.on(document, "click", (event) => {
      const target = event.target as Node | null;
      const row = els.optimalProductivityDaysRow as HTMLElement | null;
      if (!row || !target || row.contains(target)) return;
      closeOptimalProductivityDaysMenu();
    });
    getOptimalProductivityDayInputs().forEach((input) => {
      ctx.on(input, "change", () => {
        const selectedDays = getOptimalProductivityDayInputs()
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => normalizeDashboardWeekStart(checkbox.value));
        if (!selectedDays.length) {
          input.checked = true;
          syncOptimalProductivityDaysUi();
          return;
        }
        applyOptimalProductivityDaysPreference(selectedDays);
        saveOptimalProductivityDaysPreference();
        ctx.render();
      });
    });
    ctx.on(els.optimalProductivityDaysAllBtn, "click", () => {
      applyOptimalProductivityDaysPreference(DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS);
      saveOptimalProductivityDaysPreference();
      ctx.render();
    });
    ctx.on(els.taskSettingsSaveBtn, "click", () => {
      saveWeekStartingPreference();
      saveStartupModulePreference();
      saveTaskOrderByPreference();
      saveAutoFocusOnTaskLaunchSetting();
      saveDashboardPreviousWeekSetting();
      saveDynamicColorsSetting();
      saveMobilePushAlertsSetting();
      saveInteractionClickSoundSetting();
      saveInteractionHapticsSetting();
      saveCheckpointAlertSettings();
      saveOptimalProductivityPeriodPreference();
      saveOptimalProductivityDaysPreference();
      ctx.render();
      ctx.closeOverlay(els.taskSettingsOverlay as HTMLElement | null);
    });
  }

  return {
    normalizeThemeMode,
    sanitizeModeLabel,
    getModeColor,
    applyModeAccent,
    syncModeLabelsUi,
    saveModeSettings,
    buildCloudPreferencesSnapshot,
    persistPreferencesToLocalStorage,
    persistPreferencesToCloud,
    loadModeLabels,
    applyTheme,
    applyTaskViewPreference,
    applyTaskOrderByPreference,
    applyMenuButtonStyle,
    loadThemePreference,
    loadMenuButtonStylePreference,
    applyWeekStartingPreference,
    loadWeekStartingPreference,
    saveWeekStartingPreference,
    applyStartupModulePreference,
    loadStartupModulePreference,
    saveStartupModulePreference,
    loadTaskViewPreference,
    loadTaskOrderByPreference,
    saveTaskViewPreference,
    saveTaskOrderByPreference,
    loadAutoFocusOnTaskLaunchSetting,
    loadDashboardPreviousWeekSetting,
    saveAutoFocusOnTaskLaunchSetting,
    saveDashboardPreviousWeekSetting,
    toggleSwitchElement: ctx.toggleSwitchElement,
    isSwitchOn: ctx.isSwitchOn,
    syncTaskSettingsUi,
    loadDynamicColorsSetting,
    loadInteractionClickSoundSetting,
    loadAchievementSoundsSetting,
    loadInteractionHapticsSetting,
    loadMobilePushAlertsSetting,
    saveDynamicColorsSetting,
    saveInteractionClickSoundSetting,
    saveAchievementSoundsSetting,
    saveInteractionHapticsSetting,
    loadCheckpointAlertSettings,
    saveMobilePushAlertsSetting,
    saveCheckpointAlertSettings,
    applyOptimalProductivityPeriodPreference,
    loadOptimalProductivityPeriodPreference,
    saveOptimalProductivityPeriodPreference,
    applyOptimalProductivityDaysPreference,
    applyOnboardingPreferences,
    loadOptimalProductivityDaysPreference,
    saveOptimalProductivityDaysPreference,
    setThemeMode,
    setMenuButtonStyle,
    applyMainMode,
    registerPreferenceEvents,
  };
}
