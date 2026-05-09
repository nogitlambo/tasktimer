import type { TaskTimerPreferencesContext } from "./context";
import type { MainMode, TaskOrderBy } from "./types";
import { TASKTIMER_PLAN_CHANGED_EVENT } from "../lib/entitlements";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeTimeOfDay,
} from "../lib/productivityPeriod";
import { createTaskTimerPreferencesService, type TaskTimerStoredPreferences } from "../lib/preferencesService";
import { normalizeStartupModule } from "../lib/startupModule";
import { syncTaskTimerPushNotificationsEnabled } from "../lib/pushNotifications";
import { bindToggleRow } from "./control-helpers";

type PreferenceEventDeps = {
  handleAppBackNavigation: () => boolean;
};

const CHECKPOINT_ALERT_SOUND_MODE_KEY = "taskticker_tasks_v1:checkpointAlertSoundMode";
const CHECKPOINT_ALERT_TOAST_MODE_KEY = "taskticker_tasks_v1:checkpointAlertToastMode";

export function createTaskTimerPreferences(ctx: TaskTimerPreferencesContext) {
  const { els } = ctx;
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

  function syncThemeAvailabilityUi() {
    const currentTheme = ctx.getThemeMode();
    const appliedTheme = currentTheme;

    els.themePurpleBtn?.classList.toggle("isOn", appliedTheme === "purple");
    els.themeCyanBtn?.classList.toggle("isOn", appliedTheme === "cyan");
    els.themeLimeBtn?.classList.toggle("isOn", appliedTheme === "lime");
    els.themePurpleBtn?.setAttribute("aria-pressed", appliedTheme === "purple" ? "true" : "false");
    els.themeCyanBtn?.setAttribute("aria-pressed", appliedTheme === "cyan" ? "true" : "false");
    els.themeLimeBtn?.setAttribute("aria-pressed", appliedTheme === "lime" ? "true" : "false");

    if (els.themePurpleBtn) {
      els.themePurpleBtn.disabled = false;
      els.themePurpleBtn.setAttribute("aria-disabled", "false");
      els.themePurpleBtn.title = "";
    }
    if (els.themeLimeBtn) {
      els.themeLimeBtn.disabled = false;
      els.themeLimeBtn.setAttribute("aria-disabled", "false");
      els.themeLimeBtn.title = "";
    }
    if (els.themeCyanBtn) {
      els.themeCyanBtn.disabled = false;
      els.themeCyanBtn.setAttribute("aria-disabled", "false");
      els.themeCyanBtn.title = "";
    }
  }

  function requireAdvancedTaskConfig(featureLabel: string) {
    if (canUseAdvancedTaskConfig()) return true;
    ctx.showUpgradePrompt(featureLabel, "pro");
    return false;
  }

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" | "lime" {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "lime") return "lime";
    return value === "purple" ? "purple" : value === "cyan" || value === "command" ? "cyan" : "lime";
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
      dynamicColorsEnabled: ctx.getDynamicColorsEnabled(),
      mobilePushAlertsEnabled: ctx.getMobilePushAlertsEnabled(),
      webPushAlertsEnabled: ctx.getWebPushAlertsEnabled(),
      checkpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled(),
      checkpointAlertToastEnabled: ctx.getCheckpointAlertToastEnabled(),
      checkpointAlertSoundMode: ctx.getCheckpointAlertSoundMode(),
      checkpointAlertToastMode: ctx.getCheckpointAlertToastMode(),
      optimalProductivityStartTime: ctx.getOptimalProductivityStartTime(),
      optimalProductivityEndTime: ctx.getOptimalProductivityEndTime(),
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

  function applyTheme(mode: "purple" | "cyan" | "lime") {
    ctx.setThemeModeState(mode);
    const body = document.body;
    body.setAttribute("data-theme", mode);
    syncThemeAvailabilityUi();
  }

  function applyTaskViewPreference() {
    ctx.setTaskViewState("tile");
    document.body.setAttribute("data-task-view", "tile");
  }

  function getTaskOrderByLabel(value: TaskOrderBy) {
    if (value === "alpha") return "A-Z";
    if (value === "schedule") return "Schedule/Time";
    return "Custom";
  }

  function syncTaskOrderByMenuUi() {
    const taskOrderBy = ctx.getTaskOrderBy();
    if (els.taskOrderByValue) els.taskOrderByValue.textContent = getTaskOrderByLabel(taskOrderBy);
    if (els.taskOrderByMenuBtn) {
      els.taskOrderByMenuBtn.setAttribute("aria-label", `Order By: ${getTaskOrderByLabel(taskOrderBy)}`);
    }
    if (els.taskOrderByMenu) {
      Array.from(els.taskOrderByMenu.querySelectorAll<HTMLElement>(".tasksModeMenuItem[data-task-order-by]")).forEach((item) => {
        const itemValue = item.dataset.taskOrderBy === "alpha" ? "alpha" : item.dataset.taskOrderBy === "schedule" ? "schedule" : "custom";
        const isOn = itemValue === taskOrderBy;
        item.classList.toggle("isOn", isOn);
        item.setAttribute("aria-pressed", isOn ? "true" : "false");
      });
    }
  }

  function applyTaskOrderByPreference(next: TaskOrderBy) {
    const taskOrderBy = next === "alpha" ? "alpha" : next === "schedule" ? "schedule" : "custom";
    ctx.setTaskOrderByState(taskOrderBy);
    syncTaskOrderByMenuUi();
  }

  function applyMenuButtonStyle(next: "parallelogram" | "square") {
    const menuButtonStyle = next === "square" ? "square" : "parallelogram";
    ctx.setMenuButtonStyleState(menuButtonStyle);
    const body = document.body;
    body.setAttribute("data-control-style", menuButtonStyle);
    if (els.menuButtonStyleSelect) {
      els.menuButtonStyleSelect.value = menuButtonStyle;
    }
    els.menuButtonStyleParallelogramBtn?.classList.toggle("isOn", menuButtonStyle === "parallelogram");
    els.menuButtonStyleSquareBtn?.classList.toggle("isOn", menuButtonStyle === "square");
    els.menuButtonStyleParallelogramBtn?.setAttribute(
      "aria-pressed",
      menuButtonStyle === "parallelogram" ? "true" : "false"
    );
    els.menuButtonStyleSquareBtn?.setAttribute("aria-pressed", menuButtonStyle === "square" ? "true" : "false");
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

  function syncTaskSettingsUi() {
    const weekStarting = ctx.getWeekStarting();
    const startupModule = ctx.getStartupModule();
    ctx.setTaskViewState("tile");
    ctx.toggleSwitchElement(els.taskAutoFocusOnLaunchToggle as HTMLElement | null, ctx.getAutoFocusOnTaskLaunchEnabled());
    ctx.toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, ctx.getDynamicColorsEnabled());
    ctx.toggleSwitchElement(els.taskMobilePushAlertsToggle as HTMLElement | null, ctx.getMobilePushAlertsEnabled());
    ctx.toggleSwitchElement(els.taskWebPushAlertsToggle as HTMLElement | null, ctx.getWebPushAlertsEnabled());
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
    els.taskCheckpointSoundModeField?.classList.toggle("isDisabled", !ctx.getCheckpointAlertSoundEnabled());
    els.taskCheckpointToastModeField?.classList.toggle("isDisabled", !ctx.getCheckpointAlertToastEnabled());
    if (els.taskWeekStartingSelect) {
      els.taskWeekStartingSelect.value = weekStarting;
    }
    if (els.taskStartupModuleSelect) {
      els.taskStartupModuleSelect.value = startupModule;
    }
    if (els.optimalProductivityStartTimeInput) {
      els.optimalProductivityStartTimeInput.value = ctx.getOptimalProductivityStartTime();
    }
    if (els.optimalProductivityEndTimeInput) {
      els.optimalProductivityEndTimeInput.value = ctx.getOptimalProductivityEndTime();
    }
    syncTaskOrderByMenuUi();
    const lockAdvancedTaskConfig = !canUseAdvancedTaskConfig();
    if (els.taskDynamicColorsToggle) {
      (els.taskDynamicColorsToggle as HTMLButtonElement).disabled = lockAdvancedTaskConfig;
      els.taskDynamicColorsToggle.setAttribute("aria-disabled", String(lockAdvancedTaskConfig));
      els.taskDynamicColorsToggle.title = lockAdvancedTaskConfig ? "Pro feature: Dynamic colors" : "";
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
      window.location.assign("/web-sign-in");
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
      window.location.assign("/web-sign-in");
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

  function setThemeMode(next: "purple" | "cyan" | "lime") {
    applyTheme(next);
    persistPreferencesToCloud();
  }

  function setMenuButtonStyle(next: "parallelogram" | "square") {
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
    saveCheckpointAlertSettings();
    saveOptimalProductivityPeriodPreference();
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
    ctx.on(els.themePurpleBtn, "click", () => {
      setThemeMode("purple");
    });
    ctx.on(els.themeCyanBtn, "click", () => {
      setThemeMode("cyan");
    });
    ctx.on(els.themeLimeBtn, "click", () => {
      setThemeMode("lime");
    });
    ctx.on(els.menuButtonStyleParallelogramBtn, "click", () => {
      setMenuButtonStyle("parallelogram");
    });
    ctx.on(els.menuButtonStyleSquareBtn, "click", () => {
      setMenuButtonStyle("square");
    });
    ctx.on(els.menuButtonStyleSelect, "change", () => {
      setMenuButtonStyle(els.menuButtonStyleSelect?.value === "parallelogram" ? "parallelogram" : "square");
    });
    ctx.on(els.preferencesLoadDefaultsBtn, "click", () => {
      applyWeekStartingPreference("mon");
      applyStartupModulePreference("dashboard");
      ctx.setAutoFocusOnTaskLaunchEnabledState(false);
      ctx.setTaskViewState("tile");
      applyTaskOrderByPreference("custom");
      ctx.setDynamicColorsEnabledState(true);
      ctx.setMobilePushAlertsEnabledState(false);
      ctx.setWebPushAlertsEnabledState(false);
      applyOptimalProductivityPeriodPreference(
        DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
        DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
      );
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
      void syncTaskTimerPushNotificationsEnabled({ mobileEnabled: false, webEnabled: false });
    });
    ctx.on(els.appearanceLoadDefaultsBtn, "click", () => {
      setThemeMode("lime");
      setMenuButtonStyle("square");
    });
    ctx.on(window, TASKTIMER_PLAN_CHANGED_EVENT, () => {
      syncThemeAvailabilityUi();
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
    ctx.on(els.taskOrderByMenu, "click", (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.(".tasksModeMenuItem[data-task-order-by]") as HTMLButtonElement | null;
      if (!button) return;
      const nextValue = button.dataset.taskOrderBy === "alpha" ? "alpha" : button.dataset.taskOrderBy === "schedule" ? "schedule" : "custom";
      applyTaskOrderByPreference(nextValue);
      ctx.clearTaskFlipStates();
      ctx.render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
      if (els.taskOrderByMenu) els.taskOrderByMenu.open = false;
    });
    ctx.on(document, "pointerdown", (event: Event) => {
      const menu = els.taskOrderByMenu;
      if (!menu?.open) return;
      const target = event.target as Node | null;
      if (target && menu.contains(target)) return;
      menu.open = false;
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
        void applyMobilePushAlertsPreference(!ctx.getMobilePushAlertsEnabled());
      },
    });
    bindToggleRow({
      on: ctx.on,
      control: els.taskWebPushAlertsToggle,
      row: els.taskWebPushAlertsToggleRow,
      ignoreSelector: "#taskWebPushAlertsToggle",
      handleToggle: () => {
        void applyWebPushAlertsPreference(!ctx.getWebPushAlertsEnabled());
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
    ctx.on(els.optimalProductivityStartTimeInput, "change", () => {
      applyOptimalProductivityPeriodPreference(
        els.optimalProductivityStartTimeInput?.value || DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
        ctx.getOptimalProductivityEndTime()
      );
      saveOptimalProductivityPeriodPreference();
      ctx.render();
    });
    ctx.on(els.optimalProductivityEndTimeInput, "change", () => {
      applyOptimalProductivityPeriodPreference(
        ctx.getOptimalProductivityStartTime(),
        els.optimalProductivityEndTimeInput?.value || DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
      );
      saveOptimalProductivityPeriodPreference();
      ctx.render();
    });
    ctx.on(els.taskSettingsSaveBtn, "click", () => {
      saveWeekStartingPreference();
      saveStartupModulePreference();
      saveAutoFocusOnTaskLaunchSetting();
      saveDynamicColorsSetting();
      saveMobilePushAlertsSetting();
      saveCheckpointAlertSettings();
      saveOptimalProductivityPeriodPreference();
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
    saveAutoFocusOnTaskLaunchSetting,
    toggleSwitchElement: ctx.toggleSwitchElement,
    isSwitchOn: ctx.isSwitchOn,
    syncTaskSettingsUi,
    loadDynamicColorsSetting,
    loadMobilePushAlertsSetting,
    saveDynamicColorsSetting,
    loadCheckpointAlertSettings,
    saveMobilePushAlertsSetting,
    saveCheckpointAlertSettings,
    applyOptimalProductivityPeriodPreference,
    loadOptimalProductivityPeriodPreference,
    saveOptimalProductivityPeriodPreference,
    setThemeMode,
    setMenuButtonStyle,
    applyMainMode,
    registerPreferenceEvents,
  };
}
