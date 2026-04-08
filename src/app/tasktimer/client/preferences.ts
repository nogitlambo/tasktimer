import type { TaskTimerPreferencesContext } from "./context";
import type { MainMode } from "./types";
import { TASKTIMER_PLAN_CHANGED_EVENT } from "../lib/entitlements";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import { createTaskTimerPreferencesService, type TaskTimerStoredPreferences } from "../lib/preferencesService";
import { syncTaskTimerPushNotificationsEnabled } from "../lib/pushNotifications";
import { createTaskTimerWorkspaceRepository } from "../lib/workspaceRepository";

type PreferenceEventDeps = {
  handleAppBackNavigation: () => boolean;
};

export function createTaskTimerPreferences(ctx: TaskTimerPreferencesContext) {
  const { els } = ctx;
  const repository = createTaskTimerWorkspaceRepository();
  const preferenceService = createTaskTimerPreferencesService({
    storageKeys: ctx.storageKeys,
    repository,
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

  function canUsePremiumThemes() {
    return ctx.getCurrentPlan() === "pro";
  }

  function syncThemeAvailabilityUi() {
    const premiumThemesLocked = !canUsePremiumThemes();
    const currentTheme = ctx.getThemeMode();
    const lockedThemeSelected = premiumThemesLocked && (currentTheme === "purple" || currentTheme === "lime");

    if (lockedThemeSelected) {
      ctx.setThemeModeState("cyan");
      document.body.setAttribute("data-theme", "cyan");
    }

    const appliedTheme = lockedThemeSelected ? "cyan" : currentTheme;
    const lockTitle = premiumThemesLocked ? "Pro feature: Purple and Lime themes" : "";

    if (els.themeSelect) {
      els.themeSelect.value = appliedTheme;
      if (premiumThemesLocked && els.themeSelect.value !== "cyan") {
        els.themeSelect.value = "cyan";
      }
      els.themeSelect.title = lockTitle;
      const purpleOption = els.themeSelect.querySelector('option[value="purple"]') as HTMLOptionElement | null;
      const limeOption = els.themeSelect.querySelector('option[value="lime"]') as HTMLOptionElement | null;
      const cyanOption = els.themeSelect.querySelector('option[value="cyan"]') as HTMLOptionElement | null;
      if (purpleOption) purpleOption.disabled = premiumThemesLocked;
      if (limeOption) limeOption.disabled = premiumThemesLocked;
      if (cyanOption) cyanOption.disabled = false;
    }

    els.themePurpleBtn?.classList.toggle("isOn", appliedTheme === "purple");
    els.themeCyanBtn?.classList.toggle("isOn", appliedTheme === "cyan");
    els.themeLimeBtn?.classList.toggle("isOn", appliedTheme === "lime");
    els.themePurpleBtn?.setAttribute("aria-pressed", appliedTheme === "purple" ? "true" : "false");
    els.themeCyanBtn?.setAttribute("aria-pressed", appliedTheme === "cyan" ? "true" : "false");
    els.themeLimeBtn?.setAttribute("aria-pressed", appliedTheme === "lime" ? "true" : "false");

    if (els.themePurpleBtn) {
      els.themePurpleBtn.disabled = premiumThemesLocked;
      els.themePurpleBtn.setAttribute("aria-disabled", String(premiumThemesLocked));
      els.themePurpleBtn.title = lockTitle;
    }
    if (els.themeLimeBtn) {
      els.themeLimeBtn.disabled = premiumThemesLocked;
      els.themeLimeBtn.setAttribute("aria-disabled", String(premiumThemesLocked));
      els.themeLimeBtn.title = lockTitle;
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

  function eventTargetClosest(target: EventTarget | null, selector: string) {
    return target instanceof Element ? target.closest(selector) : null;
  }

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" | "lime" {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "lime") return "lime";
    return value === "cyan" || value === "command" ? "cyan" : "purple";
  }

  function sanitizeModeLabel(value: unknown, fallback: string) {
    return fallback;
  }

  function getModeLabel(mode: MainMode) {
    return ctx.defaultModeLabels[mode] || ctx.defaultModeLabels.mode1;
  }

  function getModeColor(mode: MainMode) {
    return ctx.defaultModeColors[mode];
  }

  function applyModeAccent(mode: MainMode) {
    const nextMode = mode === "mode2" || mode === "mode3" ? "mode1" : mode;
    document.documentElement.style.setProperty("--mode-accent", getModeColor(nextMode));
    document.documentElement.style.setProperty("--mode1-accent", getModeColor("mode1"));
    document.documentElement.style.setProperty("--mode2-accent", getModeColor("mode2"));
    document.documentElement.style.setProperty("--mode3-accent", getModeColor("mode3"));
  }

  function isModeEnabled(mode: MainMode) {
    return mode === "mode1";
  }

  function syncModeLabelsUi() {
    ctx.setModeLabelsState({ ...ctx.defaultModeLabels });
    ctx.setModeEnabledState({ mode1: true, mode2: false, mode3: false });
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
  }

  function buildCloudPreferencesSnapshot(): ReturnType<typeof preferenceService.buildSnapshot> {
    return preferenceService.buildSnapshot({
      theme: ctx.getThemeMode(),
      menuButtonStyle: ctx.getMenuButtonStyle(),
      defaultTaskTimerFormat: ctx.getDefaultTaskTimerFormat(),
      weekStarting: ctx.getWeekStarting(),
      taskView: ctx.getTaskView(),
      autoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled(),
      dynamicColorsEnabled: ctx.getDynamicColorsEnabled(),
      mobilePushAlertsEnabled: ctx.getMobilePushAlertsEnabled(),
      checkpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled(),
      checkpointAlertToastEnabled: ctx.getCheckpointAlertToastEnabled(),
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
    ctx.setModeLabelsState({ ...ctx.defaultModeLabels });
    ctx.setModeEnabledState({ mode1: true, mode2: false, mode3: false });
    try {
      localStorage.removeItem(ctx.storageKeys.MODE_SETTINGS_KEY);
    } catch {
      // ignore
    }
  }

  function applyTheme(mode: "purple" | "cyan" | "lime") {
    ctx.setThemeModeState(mode);
    const body = document.body;
    body.setAttribute("data-theme", mode);
    syncThemeAvailabilityUi();
  }

  function applyTaskViewPreference(next: "list" | "tile") {
    const taskView = next === "tile" ? "tile" : "list";
    ctx.setTaskViewState(taskView);
    document.body.setAttribute("data-task-view", taskView);
    els.taskViewList?.classList.toggle("isOn", taskView === "list");
    els.taskViewTile?.classList.toggle("isOn", taskView === "tile");
    els.taskViewList?.setAttribute("aria-pressed", taskView === "list" ? "true" : "false");
    els.taskViewTile?.setAttribute("aria-pressed", taskView === "tile" ? "true" : "false");
  }

  function applyMenuButtonStyle(next: "parallelogram" | "square") {
    const menuButtonStyle = next === "square" ? "square" : "parallelogram";
    ctx.setMenuButtonStyleState(menuButtonStyle);
    const body = document.body;
    body.setAttribute("data-control-style", menuButtonStyle);
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

  function loadDefaultTaskTimerFormat() {
    ctx.setDefaultTaskTimerFormatState(preferenceService.loadDefaultTaskTimerFormat());
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

  function saveWeekStartingPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.WEEK_STARTING_KEY, ctx.getWeekStarting());
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadTaskViewPreference() {
    applyTaskViewPreference(preferenceService.loadTaskView());
  }

  function saveDefaultTaskTimerFormat() {
    persistPreferencesToCloud();
  }

  function saveTaskViewPreference() {
    try {
      localStorage.setItem(ctx.storageKeys.TASK_VIEW_KEY, ctx.getTaskView());
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

  function toggleSwitchElement(el: HTMLElement | null | undefined, enabled: boolean) {
    el?.classList.toggle("on", enabled);
    el?.setAttribute("aria-checked", String(enabled));
  }

  function isSwitchOn(el: HTMLElement | null | undefined) {
    return !!el?.classList.contains("on");
  }

  function syncTaskSettingsUi() {
    const defaultTaskTimerFormat = ctx.getDefaultTaskTimerFormat();
    const weekStarting = ctx.getWeekStarting();
    const taskView = ctx.getTaskView();
    toggleSwitchElement(els.taskAutoFocusOnLaunchToggle as HTMLElement | null, ctx.getAutoFocusOnTaskLaunchEnabled());
    toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, ctx.getDynamicColorsEnabled());
    toggleSwitchElement(els.taskMobilePushAlertsToggle as HTMLElement | null, ctx.getMobilePushAlertsEnabled());
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, ctx.getCheckpointAlertSoundEnabled());
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, ctx.getCheckpointAlertToastEnabled());
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    if (els.taskWeekStartingSelect) {
      els.taskWeekStartingSelect.value = weekStarting;
    }
    els.taskViewList?.classList.toggle("isOn", taskView === "list");
    els.taskViewTile?.classList.toggle("isOn", taskView === "tile");
    els.taskViewList?.setAttribute("aria-pressed", taskView === "list" ? "true" : "false");
    els.taskViewTile?.setAttribute("aria-pressed", taskView === "tile" ? "true" : "false");
    const lockAdvancedTaskConfig = !canUseAdvancedTaskConfig();
    if (els.taskDynamicColorsToggle) {
      (els.taskDynamicColorsToggle as HTMLButtonElement).disabled = lockAdvancedTaskConfig;
      els.taskDynamicColorsToggle.setAttribute("aria-disabled", String(lockAdvancedTaskConfig));
      els.taskDynamicColorsToggle.title = lockAdvancedTaskConfig ? "Pro feature: Dynamic colors" : "";
    }
    if (els.taskCheckpointSoundToggle) {
      (els.taskCheckpointSoundToggle as HTMLButtonElement).disabled = lockAdvancedTaskConfig;
      els.taskCheckpointSoundToggle.setAttribute("aria-disabled", String(lockAdvancedTaskConfig));
      els.taskCheckpointSoundToggle.title = lockAdvancedTaskConfig ? "Pro feature: Checkpoint alerts" : "";
    }
    if (els.taskCheckpointToastToggle) {
      (els.taskCheckpointToastToggle as HTMLButtonElement).disabled = lockAdvancedTaskConfig;
      els.taskCheckpointToastToggle.setAttribute("aria-disabled", String(lockAdvancedTaskConfig));
      els.taskCheckpointToastToggle.title = lockAdvancedTaskConfig ? "Pro feature: Checkpoint alerts" : "";
    }
    const currentEditTask = ctx.getCurrentEditTask();
    if (currentEditTask) ctx.syncEditCheckpointAlertUi(currentEditTask);
  }

  function loadDynamicColorsSetting() {
    ctx.setDynamicColorsEnabledState(preferenceService.loadDynamicColorsEnabled());
  }

  function loadMobilePushAlertsSetting() {
    ctx.setMobilePushAlertsEnabledState(preferenceService.loadMobilePushAlertsEnabled());
  }

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function saveMobilePushAlertsSetting() {
    persistPreferencesToCloud();
  }

  async function applyMobilePushAlertsPreference(nextEnabled: boolean) {
    ctx.setMobilePushAlertsEnabledState(nextEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
    const appliedEnabled = await syncTaskTimerPushNotificationsEnabled(nextEnabled).catch(() => false);
    if (appliedEnabled === nextEnabled) return;
    ctx.setMobilePushAlertsEnabledState(appliedEnabled);
    syncTaskSettingsUi();
    saveMobilePushAlertsSetting();
  }

  function loadCheckpointAlertSettings() {
    const prefs = preferenceService.loadCheckpointAlerts();
    ctx.setMobilePushAlertsEnabledState(preferenceService.loadMobilePushAlertsEnabled());
    ctx.setCheckpointAlertSoundEnabledState(prefs.checkpointAlertSoundEnabled !== false);
    ctx.setCheckpointAlertToastEnabledState(prefs.checkpointAlertToastEnabled !== false);
  }

  function saveCheckpointAlertSettings() {
    persistPreferencesToCloud();
  }

  function setThemeMode(next: "purple" | "cyan" | "lime") {
    if ((next === "purple" || next === "lime") && !canUsePremiumThemes()) {
      ctx.showUpgradePrompt(`${next === "purple" ? "Purple" : "Lime"} theme`, "pro");
      syncThemeAvailabilityUi();
      return;
    }
    applyTheme(next);
    persistPreferencesToCloud();
  }

  function setMenuButtonStyle(next: "parallelogram" | "square") {
    applyMenuButtonStyle(next);
    persistPreferencesToCloud();
  }

  function persistInlineTaskSettingsImmediate() {
    saveDefaultTaskTimerFormat();
    saveWeekStartingPreference();
    saveTaskViewPreference();
    saveAutoFocusOnTaskLaunchSetting();
    saveDynamicColorsSetting();
    saveMobilePushAlertsSetting();
    saveCheckpointAlertSettings();
    ctx.render();
  }

  function applyMainMode(mode: MainMode) {
    const nextMode = mode === "mode2" || mode === "mode3" ? "mode1" : mode;
    ctx.setCurrentModeState(nextMode);
    ctx.setEditMoveTargetModeState("mode1");
    applyModeAccent(nextMode);
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
    ctx.on(els.themeSelect, "change", () => {
      const next = String(els.themeSelect?.value || "cyan").trim().toLowerCase();
      setThemeMode(next === "lime" ? "lime" : next === "cyan" ? "cyan" : "purple");
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
    ctx.on(els.preferencesLoadDefaultsBtn, "click", () => {
      ctx.setDefaultTaskTimerFormatState("hour");
      applyWeekStartingPreference("mon");
      ctx.setAutoFocusOnTaskLaunchEnabledState(false);
      ctx.setTaskViewState("tile");
      ctx.setDynamicColorsEnabledState(true);
      ctx.setMobilePushAlertsEnabledState(false);
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
      void syncTaskTimerPushNotificationsEnabled(false);
    });
    ctx.on(els.appearanceLoadDefaultsBtn, "click", () => {
      setThemeMode(canUsePremiumThemes() ? "purple" : "cyan");
      setMenuButtonStyle("square");
    });
    ctx.on(window, TASKTIMER_PLAN_CHANGED_EVENT, () => {
      syncThemeAvailabilityUi();
    });
    ctx.on(els.taskDefaultFormatDay, "click", () => {
      ctx.setDefaultTaskTimerFormatState("day");
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskDefaultFormatHour, "click", () => {
      ctx.setDefaultTaskTimerFormatState("hour");
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskDefaultFormatMinute, "click", () => {
      ctx.setDefaultTaskTimerFormatState("minute");
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskWeekStartingSelect, "change", () => {
      applyWeekStartingPreference(normalizeDashboardWeekStart(els.taskWeekStartingSelect?.value));
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskViewList, "click", () => {
      applyTaskViewPreference("list");
      ctx.clearTaskFlipStates();
      ctx.render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskViewTile, "click", () => {
      applyTaskViewPreference("tile");
      ctx.clearTaskFlipStates();
      ctx.render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskAutoFocusOnLaunchToggle, "click", () => {
      ctx.setAutoFocusOnTaskLaunchEnabledState(!ctx.getAutoFocusOnTaskLaunchEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskAutoFocusOnLaunchToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskAutoFocusOnLaunchToggle")) return;
      ctx.setAutoFocusOnTaskLaunchEnabledState(!ctx.getAutoFocusOnTaskLaunchEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskDynamicColorsToggle, "click", () => {
      if (!requireAdvancedTaskConfig("Dynamic colors")) return;
      ctx.setDynamicColorsEnabledState(!ctx.getDynamicColorsEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskDynamicColorsToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskDynamicColorsToggle")) return;
      if (!requireAdvancedTaskConfig("Dynamic colors")) return;
      ctx.setDynamicColorsEnabledState(!ctx.getDynamicColorsEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskMobilePushAlertsToggle, "click", () => {
      void applyMobilePushAlertsPreference(!ctx.getMobilePushAlertsEnabled());
    });
    ctx.on(els.taskMobilePushAlertsToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskMobilePushAlertsToggle")) return;
      void applyMobilePushAlertsPreference(!ctx.getMobilePushAlertsEnabled());
    });
    ctx.on(els.taskCheckpointSoundToggle, "click", () => {
      if (!requireAdvancedTaskConfig("Checkpoint alert settings")) return;
      const nextValue = !ctx.getCheckpointAlertSoundEnabled();
      ctx.setCheckpointAlertSoundEnabledState(nextValue);
      if (!nextValue) ctx.stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointSoundToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskCheckpointSoundToggle")) return;
      if (!requireAdvancedTaskConfig("Checkpoint alert settings")) return;
      const nextValue = !ctx.getCheckpointAlertSoundEnabled();
      ctx.setCheckpointAlertSoundEnabledState(nextValue);
      if (!nextValue) ctx.stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointToastToggle, "click", () => {
      if (!requireAdvancedTaskConfig("Checkpoint alert settings")) return;
      ctx.setCheckpointAlertToastEnabledState(!ctx.getCheckpointAlertToastEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointToastToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskCheckpointToastToggle")) return;
      if (!requireAdvancedTaskConfig("Checkpoint alert settings")) return;
      ctx.setCheckpointAlertToastEnabledState(!ctx.getCheckpointAlertToastEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskSettingsSaveBtn, "click", () => {
      saveDefaultTaskTimerFormat();
      saveWeekStartingPreference();
      saveAutoFocusOnTaskLaunchSetting();
      saveDynamicColorsSetting();
      saveMobilePushAlertsSetting();
      saveCheckpointAlertSettings();
      ctx.render();
      ctx.closeOverlay(els.taskSettingsOverlay as HTMLElement | null);
    });
  }

  return {
    normalizeThemeMode,
    sanitizeModeLabel,
    getModeLabel,
    getModeColor,
    applyModeAccent,
    isModeEnabled,
    syncModeLabelsUi,
    saveModeSettings,
    buildCloudPreferencesSnapshot,
    persistPreferencesToLocalStorage,
    persistPreferencesToCloud,
    loadModeLabels,
    applyTheme,
    applyTaskViewPreference,
    applyMenuButtonStyle,
    loadThemePreference,
    loadMenuButtonStylePreference,
    loadDefaultTaskTimerFormat,
    applyWeekStartingPreference,
    loadWeekStartingPreference,
    saveWeekStartingPreference,
    loadTaskViewPreference,
    saveDefaultTaskTimerFormat,
    saveTaskViewPreference,
    loadAutoFocusOnTaskLaunchSetting,
    saveAutoFocusOnTaskLaunchSetting,
    toggleSwitchElement,
    isSwitchOn,
    syncTaskSettingsUi,
    loadDynamicColorsSetting,
    loadMobilePushAlertsSetting,
    saveDynamicColorsSetting,
    loadCheckpointAlertSettings,
    saveMobilePushAlertsSetting,
    saveCheckpointAlertSettings,
    setThemeMode,
    setMenuButtonStyle,
    applyMainMode,
    registerPreferenceEvents,
  };
}
