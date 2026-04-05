import type { TaskTimerPreferencesContext } from "./context";
import type { MainMode } from "./types";
import { normalizeDashboardWeekStart } from "../lib/historyChart";
import { createTaskTimerPreferencesService, type TaskTimerStoredPreferences } from "../lib/preferencesService";
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
    els.themePurpleBtn?.classList.toggle("isOn", mode === "purple");
    els.themeCyanBtn?.classList.toggle("isOn", mode === "cyan");
    els.themeLimeBtn?.classList.toggle("isOn", mode === "lime");
    els.themePurpleBtn?.setAttribute("aria-pressed", mode === "purple" ? "true" : "false");
    els.themeCyanBtn?.setAttribute("aria-pressed", mode === "cyan" ? "true" : "false");
    els.themeLimeBtn?.setAttribute("aria-pressed", mode === "lime" ? "true" : "false");
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

  function applyWeekStartingPreference(next: "mon" | "sun") {
    ctx.setWeekStartingState(normalizeDashboardWeekStart(next));
    const isMonday = ctx.getWeekStarting() === "mon";
    els.taskWeekStartingMon?.classList.toggle("isOn", isMonday);
    els.taskWeekStartingSun?.classList.toggle("isOn", !isMonday);
    els.taskWeekStartingMon?.setAttribute("aria-pressed", isMonday ? "true" : "false");
    els.taskWeekStartingSun?.setAttribute("aria-pressed", !isMonday ? "true" : "false");
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
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, ctx.getCheckpointAlertSoundEnabled());
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, ctx.getCheckpointAlertToastEnabled());
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    els.taskWeekStartingMon?.classList.toggle("isOn", weekStarting === "mon");
    els.taskWeekStartingSun?.classList.toggle("isOn", weekStarting === "sun");
    els.taskWeekStartingMon?.setAttribute("aria-pressed", weekStarting === "mon" ? "true" : "false");
    els.taskWeekStartingSun?.setAttribute("aria-pressed", weekStarting === "sun" ? "true" : "false");
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

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function loadCheckpointAlertSettings() {
    const prefs = preferenceService.loadCheckpointAlerts();
    ctx.setCheckpointAlertSoundEnabledState(prefs.checkpointAlertSoundEnabled !== false);
    ctx.setCheckpointAlertToastEnabledState(prefs.checkpointAlertToastEnabled !== false);
  }

  function saveCheckpointAlertSettings() {
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
    saveDefaultTaskTimerFormat();
    saveWeekStartingPreference();
    saveTaskViewPreference();
    saveAutoFocusOnTaskLaunchSetting();
    saveDynamicColorsSetting();
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
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.appearanceLoadDefaultsBtn, "click", () => {
      setThemeMode("purple");
      setMenuButtonStyle("square");
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
    ctx.on(els.taskWeekStartingMon, "click", () => {
      applyWeekStartingPreference("mon");
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskWeekStartingSun, "click", () => {
      applyWeekStartingPreference("sun");
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
    saveDynamicColorsSetting,
    loadCheckpointAlertSettings,
    saveCheckpointAlertSettings,
    setThemeMode,
    setMenuButtonStyle,
    applyMainMode,
    registerPreferenceEvents,
  };
}
