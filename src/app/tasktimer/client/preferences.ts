import type { TaskTimerPreferencesContext } from "./context";
import type { MainMode } from "./types";
import { normalizeDashboardWeekStart } from "../lib/historyChart";

type PreferenceEventDeps = {
  handleAppBackNavigation: () => boolean;
};

export function createTaskTimerPreferences(ctx: TaskTimerPreferencesContext) {
  const { els } = ctx;

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

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" {
    const value = String(raw || "").trim().toLowerCase();
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

  function buildCloudPreferencesSnapshot() {
    const base = ctx.getCloudPreferencesCache() || ctx.buildDefaultCloudPreferences();
    return {
      ...base,
      schemaVersion: 1 as const,
      theme: ctx.getThemeMode(),
      menuButtonStyle: ctx.getMenuButtonStyle(),
      defaultTaskTimerFormat: ctx.getDefaultTaskTimerFormat(),
      weekStarting: ctx.getWeekStarting(),
      taskView: ctx.getTaskView(),
      autoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled(),
      dynamicColorsEnabled: ctx.getDynamicColorsEnabled(),
      checkpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled(),
      checkpointAlertToastEnabled: ctx.getCheckpointAlertToastEnabled(),
      rewards: ctx.normalizeRewardProgress(ctx.getRewardProgress()),
      updatedAtMs: Date.now(),
    };
  }

  function persistPreferencesToLocalStorage(snapshot: ReturnType<typeof buildCloudPreferencesSnapshot>) {
    try {
      localStorage.setItem(ctx.storageKeys.THEME_KEY, String(snapshot.theme || "purple"));
      localStorage.setItem(ctx.storageKeys.MENU_BUTTON_STYLE_KEY, String(snapshot.menuButtonStyle || "square"));
      localStorage.setItem(ctx.storageKeys.TASK_VIEW_KEY, String(snapshot.taskView || "list"));
      localStorage.setItem(
        ctx.storageKeys.AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
        snapshot.autoFocusOnTaskLaunchEnabled ? "true" : "false"
      );
      localStorage.setItem(
        ctx.storageKeys.DEFAULT_TASK_TIMER_FORMAT_KEY,
        String(snapshot.defaultTaskTimerFormat || "hour")
      );
      localStorage.setItem(ctx.storageKeys.WEEK_STARTING_KEY, String(snapshot.weekStarting || "mon"));
      localStorage.removeItem(ctx.storageKeys.MODE_SETTINGS_KEY);
    } catch {
      // ignore localStorage write failures
    }
  }

  function persistPreferencesToCloud() {
    const snapshot = buildCloudPreferencesSnapshot();
    persistPreferencesToLocalStorage(snapshot);
    ctx.setCloudPreferencesCache(snapshot);
    ctx.saveCloudPreferences(snapshot);
    const uid = ctx.currentUid();
    if (!uid) return;
    const rewards = ctx.normalizeRewardProgress(ctx.getRewardProgress()) as { currentRankId?: string | null };
    void ctx.syncOwnFriendshipProfile(uid, {
      currentRankId: rewards.currentRankId,
    }).catch(() => {
      // Keep local/cloud preference persistence even if friendship profile sync fails.
    });
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

  function applyTheme(mode: "purple" | "cyan") {
    ctx.setThemeModeState(mode);
    const body = document.body;
    body.setAttribute("data-theme", mode);
    els.themePurpleBtn?.classList.toggle("isOn", mode === "purple");
    els.themeCyanBtn?.classList.toggle("isOn", mode === "cyan");
    els.themePurpleBtn?.setAttribute("aria-pressed", mode === "purple" ? "true" : "false");
    els.themeCyanBtn?.setAttribute("aria-pressed", mode === "cyan" ? "true" : "false");
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
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(ctx.storageKeys.THEME_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    const cloudRaw = String((ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.theme || "").trim().toLowerCase();
    const raw = cloudRaw || localRaw;
    const mode = normalizeThemeMode(raw);
    applyTheme(mode);
    try {
      localStorage.setItem(ctx.storageKeys.THEME_KEY, mode);
    } catch {
      // ignore localStorage write failures
    }
  }

  function loadMenuButtonStylePreference() {
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(ctx.storageKeys.MENU_BUTTON_STYLE_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    const cloudRaw = String((ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.menuButtonStyle || "")
      .trim()
      .toLowerCase();
    const raw = cloudRaw || localRaw;
    const next: "parallelogram" | "square" = raw === "square" ? "square" : "parallelogram";
    applyMenuButtonStyle(next);
    try {
      localStorage.setItem(ctx.storageKeys.MENU_BUTTON_STYLE_KEY, next);
    } catch {
      // ignore localStorage write failures
    }
  }

  function loadDefaultTaskTimerFormat() {
    const raw = (ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.defaultTaskTimerFormat;
    const next: "day" | "hour" | "minute" = raw === "day" || raw === "minute" ? raw : "hour";
    ctx.setDefaultTaskTimerFormatState(next);
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
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(ctx.storageKeys.WEEK_STARTING_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    const cloudRaw = String((ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.weekStarting || "")
      .trim()
      .toLowerCase();
    applyWeekStartingPreference(normalizeDashboardWeekStart(cloudRaw || localRaw));
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
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(ctx.storageKeys.TASK_VIEW_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    if (localRaw === "tile" || localRaw === "list") {
      applyTaskViewPreference(localRaw);
      return;
    }
    const cloudRaw = String((ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.taskView || "")
      .trim()
      .toLowerCase();
    if (cloudRaw === "tile" || cloudRaw === "list") {
      applyTaskViewPreference(cloudRaw);
      return;
    }
    applyTaskViewPreference("tile");
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
    const cloudValue = (ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.autoFocusOnTaskLaunchEnabled;
    if (typeof cloudValue === "boolean") {
      ctx.setAutoFocusOnTaskLaunchEnabledState(cloudValue);
      return;
    }
    try {
      const raw = String(localStorage.getItem(ctx.storageKeys.AUTO_FOCUS_ON_TASK_LAUNCH_KEY) || "").trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "off") {
        ctx.setAutoFocusOnTaskLaunchEnabledState(false);
        return;
      }
      if (raw === "true" || raw === "1" || raw === "on") {
        ctx.setAutoFocusOnTaskLaunchEnabledState(true);
        return;
      }
    } catch {
      // ignore localStorage read failures
    }
    ctx.setAutoFocusOnTaskLaunchEnabledState(false);
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
    ctx.setDynamicColorsEnabledState((ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.dynamicColorsEnabled !== false);
  }

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function loadCheckpointAlertSettings() {
    const prefs = ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences();
    ctx.setCheckpointAlertSoundEnabledState(prefs?.checkpointAlertSoundEnabled !== false);
    ctx.setCheckpointAlertToastEnabledState(prefs?.checkpointAlertToastEnabled !== false);
  }

  function saveCheckpointAlertSettings() {
    persistPreferencesToCloud();
  }

  function setThemeMode(next: "purple" | "cyan") {
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
