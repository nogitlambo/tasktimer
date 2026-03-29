import type { TaskTimerCachedModeSettings, TaskTimerPreferencesContext } from "./context";
import type { MainMode } from "./types";

type PreferenceEventDeps = {
  handleAppBackNavigation: () => boolean;
};

export function createTaskTimerPreferences(ctx: TaskTimerPreferencesContext) {
  const { els } = ctx;

  function eventTargetClosest(target: EventTarget | null, selector: string) {
    return target instanceof Element ? target.closest(selector) : null;
  }

  type CachedModeEntry = {
    label?: unknown;
    enabled?: unknown;
  };

  function getCachedModeEntry(settings: TaskTimerCachedModeSettings, mode: MainMode) {
    if (!settings || typeof settings !== "object") return null;
    const entry = settings[mode];
    return entry && typeof entry === "object" ? (entry as CachedModeEntry) : null;
  }

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" {
    const value = String(raw || "").trim().toLowerCase();
    return value === "cyan" || value === "command" ? "cyan" : "purple";
  }

  function sanitizeModeLabel(value: unknown, fallback: string) {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return fallback;
    return raw.slice(0, 10);
  }

  function getModeLabel(mode: MainMode) {
    const modeLabels = ctx.getModeLabels();
    return modeLabels[mode] || ctx.defaultModeLabels[mode];
  }

  function getModeColor(mode: MainMode) {
    return ctx.defaultModeColors[mode];
  }

  function applyModeAccent(mode: MainMode) {
    document.documentElement.style.setProperty("--mode-accent", getModeColor(mode));
    document.documentElement.style.setProperty("--mode1-accent", getModeColor("mode1"));
    document.documentElement.style.setProperty("--mode2-accent", getModeColor("mode2"));
    document.documentElement.style.setProperty("--mode3-accent", getModeColor("mode3"));
  }

  function isModeEnabled(mode: MainMode) {
    if (mode === "mode1") return true;
    return !!ctx.getModeEnabled()[mode];
  }

  function syncModeLabelsUi() {
    const currentMode = ctx.getCurrentMode();
    const editMoveTargetMode = ctx.getEditMoveTargetMode();
    if (els.mode1Btn) els.mode1Btn.textContent = getModeLabel("mode1");
    if (els.mode2Btn) els.mode2Btn.textContent = getModeLabel("mode2");
    if (els.mode3Btn) els.mode3Btn.textContent = getModeLabel("mode3");
    if (els.modeSwitchCurrentLabel) els.modeSwitchCurrentLabel.textContent = getModeLabel(currentMode);
    if (els.mode2Btn) els.mode2Btn.disabled = !isModeEnabled("mode2");
    if (els.mode3Btn) els.mode3Btn.disabled = !isModeEnabled("mode3");
    if (els.mode1Btn) els.mode1Btn.setAttribute("aria-checked", String(currentMode === "mode1"));
    if (els.mode2Btn) els.mode2Btn.setAttribute("aria-checked", String(currentMode === "mode2"));
    if (els.mode3Btn) els.mode3Btn.setAttribute("aria-checked", String(currentMode === "mode3"));
    if (els.editMoveMode1) els.editMoveMode1.textContent = getModeLabel("mode1");
    if (els.editMoveMode2) els.editMoveMode2.textContent = getModeLabel("mode2");
    if (els.editMoveMode3) els.editMoveMode3.textContent = getModeLabel("mode3");
    if (els.categoryMode1Input) els.categoryMode1Input.value = getModeLabel("mode1");
    if (els.categoryMode2Input) els.categoryMode2Input.value = getModeLabel("mode2");
    if (els.categoryMode3Input) els.categoryMode3Input.value = getModeLabel("mode3");
    els.categoryMode2Toggle?.classList.toggle("on", isModeEnabled("mode2"));
    els.categoryMode2Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode2")));
    els.categoryMode3Toggle?.classList.toggle("on", isModeEnabled("mode3"));
    els.categoryMode3Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode3")));
    if (els.categoryMode2ToggleLabel) {
      els.categoryMode2ToggleLabel.textContent = isModeEnabled("mode2") ? "Disable Category 2" : "Enable Category 2";
    }
    if (els.categoryMode3ToggleLabel) {
      els.categoryMode3ToggleLabel.textContent = isModeEnabled("mode3") ? "Disable Category 3" : "Enable Category 3";
    }
    if (els.categoryMode2Row) (els.categoryMode2Row as HTMLElement).style.display = isModeEnabled("mode2") ? "block" : "none";
    if (els.categoryMode3Row) (els.categoryMode3Row as HTMLElement).style.display = isModeEnabled("mode3") ? "block" : "none";
    if (els.editMoveMode2) els.editMoveMode2.classList.toggle("is-disabled", !isModeEnabled("mode2"));
    if (els.editMoveMode3) els.editMoveMode3.classList.toggle("is-disabled", !isModeEnabled("mode3"));
    ctx.ensureDashboardIncludedModesValid();
    ctx.renderDashboardPanelMenu();
    if (ctx.getCurrentAppPage() === "dashboard") ctx.renderDashboardWidgets();
    if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
  }

  function buildCloudPreferencesSnapshot() {
    const base = ctx.getCloudPreferencesCache() || ctx.buildDefaultCloudPreferences();
    return {
      ...base,
      schemaVersion: 1 as const,
      theme: ctx.getThemeMode(),
      menuButtonStyle: ctx.getMenuButtonStyle(),
      defaultTaskTimerFormat: ctx.getDefaultTaskTimerFormat(),
      taskView: ctx.getTaskView(),
      autoFocusOnTaskLaunchEnabled: ctx.getAutoFocusOnTaskLaunchEnabled(),
      dynamicColorsEnabled: ctx.getDynamicColorsEnabled(),
      checkpointAlertSoundEnabled: ctx.getCheckpointAlertSoundEnabled(),
      checkpointAlertToastEnabled: ctx.getCheckpointAlertToastEnabled(),
      modeSettings: {
        mode1: { label: ctx.getModeLabels().mode1, enabled: true },
        mode2: { label: ctx.getModeLabels().mode2, enabled: !!ctx.getModeEnabled().mode2 },
        mode3: { label: ctx.getModeLabels().mode3, enabled: !!ctx.getModeEnabled().mode3 },
      },
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
      localStorage.setItem(ctx.storageKeys.MODE_SETTINGS_KEY, JSON.stringify(snapshot.modeSettings || null));
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
    persistPreferencesToCloud();
  }

  function loadModeLabels() {
    let nextModeLabels = { ...ctx.defaultModeLabels };
    let nextModeEnabled = { ...ctx.defaultModeEnabled };
    try {
      const parsed = (ctx.getCloudPreferencesCache() || ctx.loadCachedPreferences())?.modeSettings as
        | TaskTimerCachedModeSettings
        | undefined;
      if (parsed && typeof parsed === "object") {
        const mode1 = getCachedModeEntry(parsed, "mode1");
        const mode2 = getCachedModeEntry(parsed, "mode2");
        const mode3 = getCachedModeEntry(parsed, "mode3");
        nextModeLabels.mode1 = sanitizeModeLabel(mode1?.label, ctx.defaultModeLabels.mode1);
        nextModeLabels.mode2 = sanitizeModeLabel(mode2?.label, ctx.defaultModeLabels.mode2);
        nextModeLabels.mode3 = sanitizeModeLabel(mode3?.label, ctx.defaultModeLabels.mode3);
        nextModeEnabled.mode2 = !!mode2?.enabled;
        nextModeEnabled.mode3 = !!mode3?.enabled;
        ctx.setModeLabelsState(nextModeLabels);
        ctx.setModeEnabledState(nextModeEnabled);
        return;
      }
      nextModeLabels = { ...ctx.defaultModeLabels };
      nextModeEnabled = { ...ctx.defaultModeEnabled };
    } catch {
      // ignore
    }
    ctx.setModeLabelsState(nextModeLabels);
    ctx.setModeEnabledState(nextModeEnabled);
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
    const taskView = ctx.getTaskView();
    toggleSwitchElement(els.taskAutoFocusOnLaunchToggle as HTMLElement | null, ctx.getAutoFocusOnTaskLaunchEnabled());
    toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, ctx.getDynamicColorsEnabled());
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, ctx.getCheckpointAlertSoundEnabled());
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, ctx.getCheckpointAlertToastEnabled());
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    els.taskViewList?.classList.toggle("isOn", taskView === "list");
    els.taskViewTile?.classList.toggle("isOn", taskView === "tile");
    els.taskViewList?.setAttribute("aria-pressed", taskView === "list" ? "true" : "false");
    els.taskViewTile?.setAttribute("aria-pressed", taskView === "tile" ? "true" : "false");
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
    saveTaskViewPreference();
    saveAutoFocusOnTaskLaunchSetting();
    saveDynamicColorsSetting();
    saveCheckpointAlertSettings();
    ctx.render();
  }

  function applyAndPersistModeSettingsImmediate(opts?: { closeOverlay?: boolean }) {
    ctx.setModeLabelsState({
      mode1: sanitizeModeLabel(els.categoryMode1Input?.value, ctx.defaultModeLabels.mode1),
      mode2: sanitizeModeLabel(els.categoryMode2Input?.value, ctx.defaultModeLabels.mode2),
      mode3: sanitizeModeLabel(els.categoryMode3Input?.value, ctx.defaultModeLabels.mode3),
    });
    ctx.setModeEnabledState({ ...ctx.getModeEnabled(), mode1: true });
    saveModeSettings();
    syncModeLabelsUi();
    ctx.saveDashboardWidgetState({
      cardSizes: ctx.getDashboardCardSizeMapForStorage(),
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
    if (!isModeEnabled(ctx.getCurrentMode())) applyMainMode("mode1");
    else applyModeAccent(ctx.getCurrentMode());
    if (!isModeEnabled(ctx.getEditMoveTargetMode())) ctx.setEditMoveTargetModeState("mode1");
    if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(ctx.getEditMoveTargetMode());
    if (opts?.closeOverlay) ctx.closeOverlay(els.categoryManagerOverlay as HTMLElement | null);
    else ctx.render();
  }

  function applyMainMode(mode: MainMode) {
    const nextMode = isModeEnabled(mode) ? mode : "mode1";
    ctx.setCurrentModeState(nextMode);
    applyModeAccent(nextMode);
    document.body.setAttribute("data-main-mode", nextMode);
    if (els.modeSwitchCurrentLabel) els.modeSwitchCurrentLabel.textContent = getModeLabel(nextMode);
    els.mode1Btn?.classList.toggle("isOn", nextMode === "mode1");
    els.mode2Btn?.classList.toggle("isOn", nextMode === "mode2");
    els.mode3Btn?.classList.toggle("isOn", nextMode === "mode3");
    els.mode1Btn?.setAttribute("aria-checked", String(nextMode === "mode1"));
    els.mode2Btn?.setAttribute("aria-checked", String(nextMode === "mode2"));
    els.mode3Btn?.setAttribute("aria-checked", String(nextMode === "mode3"));
    if (els.modeSwitch && "open" in (els.modeSwitch as HTMLDetailsElement)) {
      (els.modeSwitch as HTMLDetailsElement).open = false;
    }
    els.mode1View?.classList.toggle("modeViewOn", true);
    els.mode2View?.classList.toggle("modeViewOn", nextMode === "mode2");
    els.mode3View?.classList.toggle("modeViewOn", nextMode === "mode3");
    ctx.render();
  }

  function deleteTasksInMode(mode: MainMode) {
    const deletedTaskIds = (ctx.getTasks() || [])
      .filter((task) => ctx.taskModeOf(task) === mode)
      .map((task) => String(task.id || ""))
      .filter(Boolean);
    ctx.setTasks((ctx.getTasks() || []).filter((task) => ctx.taskModeOf(task) !== mode));
    ctx.save({ deletedTaskIds });
    ctx.render();
  }

  function registerPreferenceEvents(deps: PreferenceEventDeps) {
    const { handleAppBackNavigation } = deps;

    ctx.on(els.mode1Btn, "click", () => applyMainMode("mode1"));
    ctx.on(els.mode2Btn, "click", () => applyMainMode("mode2"));
    ctx.on(els.mode3Btn, "click", () => applyMainMode("mode3"));
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
      ctx.setDynamicColorsEnabledState(!ctx.getDynamicColorsEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskDynamicColorsToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskDynamicColorsToggle")) return;
      ctx.setDynamicColorsEnabledState(!ctx.getDynamicColorsEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointSoundToggle, "click", () => {
      const nextValue = !ctx.getCheckpointAlertSoundEnabled();
      ctx.setCheckpointAlertSoundEnabledState(nextValue);
      if (!nextValue) ctx.stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointSoundToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskCheckpointSoundToggle")) return;
      const nextValue = !ctx.getCheckpointAlertSoundEnabled();
      ctx.setCheckpointAlertSoundEnabledState(nextValue);
      if (!nextValue) ctx.stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointToastToggle, "click", () => {
      ctx.setCheckpointAlertToastEnabledState(!ctx.getCheckpointAlertToastEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskCheckpointToastToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#taskCheckpointToastToggle")) return;
      ctx.setCheckpointAlertToastEnabledState(!ctx.getCheckpointAlertToastEnabled());
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    ctx.on(els.taskSettingsSaveBtn, "click", () => {
      saveDefaultTaskTimerFormat();
      saveAutoFocusOnTaskLaunchSetting();
      saveDynamicColorsSetting();
      saveCheckpointAlertSettings();
      ctx.render();
      ctx.closeOverlay(els.taskSettingsOverlay as HTMLElement | null);
    });

    const toggleCategoryEnabled = (mode: "mode2" | "mode3") => {
      ctx.setModeEnabledState({ ...ctx.getModeEnabled(), [mode]: !ctx.getModeEnabled()[mode] });
      syncModeLabelsUi();
      applyAndPersistModeSettingsImmediate();
    };
    ctx.on(els.categoryMode2Toggle, "click", () => toggleCategoryEnabled("mode2"));
    ctx.on(els.categoryMode3Toggle, "click", () => toggleCategoryEnabled("mode3"));
    ctx.on(els.categoryMode2ToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#categoryMode2Toggle")) return;
      toggleCategoryEnabled("mode2");
    });
    ctx.on(els.categoryMode3ToggleRow, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#categoryMode3Toggle")) return;
      toggleCategoryEnabled("mode3");
    });
    ctx.on(els.categoryMode1Input, "change", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categoryMode2Input, "change", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categoryMode3Input, "change", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categoryMode1Input, "blur", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categoryMode2Input, "blur", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categoryMode3Input, "blur", () => applyAndPersistModeSettingsImmediate());
    ctx.on(els.categorySaveBtn, "click", () => {
      applyAndPersistModeSettingsImmediate({ closeOverlay: true });
    });
    ctx.on(els.categoryResetBtn, "click", () => {
      ctx.setModeLabelsState({ ...ctx.defaultModeLabels });
      ctx.setModeEnabledState({ ...ctx.defaultModeEnabled });
      saveModeSettings();
      syncModeLabelsUi();
      applyModeAccent(ctx.getCurrentMode());
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(ctx.getEditMoveTargetMode());
    });
    const confirmDeleteCategory = (mode: MainMode) => {
      const label = getModeLabel(mode);
      const safeLabel = ctx.escapeHtmlUI(label);
      ctx.confirm("Delete Category Tasks", "", {
        okLabel: "Delete",
        textHtml: `<span class="confirmDanger">All tasks under the ${safeLabel} category will be deleted. Proceed?</span>`,
        onOk: () => {
          deleteTasksInMode(mode);
          ctx.closeConfirm();
        },
      });
    };
    ctx.on(els.categoryMode2TrashBtn, "click", () => confirmDeleteCategory("mode2"));
    ctx.on(els.categoryMode3TrashBtn, "click", () => confirmDeleteCategory("mode3"));
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
    deleteTasksInMode,
    registerPreferenceEvents,
  };
}
