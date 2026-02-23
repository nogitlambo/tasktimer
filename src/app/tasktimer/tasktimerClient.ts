/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId, escapeRegExp, newTaskId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import {
  ADD_TASK_PRESET_NAMES,
  filterTaskNameOptions,
  parseRecentCustomTaskNames,
  rememberRecentCustomTaskName,
} from "./lib/addTaskNames";
import { computeFocusInsights } from "./lib/focusInsights";
import {
  STORAGE_KEY,
  HISTORY_KEY,
  DELETED_META_KEY,
  loadTasks,
  saveTasks,
  loadHistory,
  saveHistory,
  loadDeletedMeta,
  saveDeletedMeta,
  cleanupHistory,
} from "./lib/storage";

export type TaskTimerClientHandle = {
  destroy: () => void;
};

export function initTaskTimerClient(): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }

  const listeners: Array<{
    el: EventTarget;
    type: string;
    fn: EventListenerOrEventListenerObject;
    opts?: boolean | AddEventListenerOptions;
  }> = [];

  const on = (
    el: EventTarget | null | undefined,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions
  ) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    listeners.push({ el, type, fn, opts });
  };

  let destroyed = false;
  let tickTimeout: number | null = null;
  let tickRaf: number | null = null;

  const destroy = () => {
    destroyed = true;

    if (tickTimeout != null) window.clearTimeout(tickTimeout);
    if (tickRaf != null) window.cancelAnimationFrame(tickRaf);
    if (checkpointToastAutoCloseTimer != null) window.clearTimeout(checkpointToastAutoCloseTimer);
    if (checkpointBeepQueueTimer != null) window.clearTimeout(checkpointBeepQueueTimer);

    for (const l of listeners) {
      try {
        l.el.removeEventListener(l.type, l.fn, l.opts as any);
      } catch {
        // ignore
      }
    }
  };

  let deletedTaskMeta: DeletedTaskMeta = {};
  let tasks: Task[] = [];
  type MainMode = "mode1" | "mode2" | "mode3";
  const DEFAULT_MODE_LABELS: Record<MainMode, string> = {
    mode1: "Mode 1",
    mode2: "Mode 2",
    mode3: "Mode 3",
  };
  const DEFAULT_MODE_ENABLED: Record<MainMode, boolean> = {
    mode1: true,
    mode2: true,
    mode3: true,
  };
  const DEFAULT_MODE_COLORS: Record<MainMode, string> = {
    mode1: "#00CFC8",
    mode2: "#00CFC8",
    mode3: "#00CFC8",
  };
  const MODE_SETTINGS_KEY = `${STORAGE_KEY}:modeSettings`;
  const MODE_LABELS_KEY = `${STORAGE_KEY}:modeLabels`; // legacy
  let currentMode: MainMode = "mode1";
  let modeLabels: Record<MainMode, string> = { ...DEFAULT_MODE_LABELS };
  let modeEnabled: Record<MainMode, boolean> = { ...DEFAULT_MODE_ENABLED };
  let modeColors: Record<MainMode, string> = { ...DEFAULT_MODE_COLORS };
  let editIndex: number | null = null;
  let focusCheckpointSig = "";
  let focusModeTaskName = "";
  let focusShowCheckpoints = true;
  let suppressAddTaskNameFocusOpen = false;

  let confirmAction: null | (() => void) = null;
  let confirmActionAlt: null | (() => void) = null;
  const THEME_KEY = `${STORAGE_KEY}:theme`;
  const ADD_TASK_CUSTOM_KEY = `${STORAGE_KEY}:customTaskNames`;
  const PINNED_HISTORY_KEY = `${STORAGE_KEY}:pinnedHistoryTaskIds`;
  const DEFAULT_TASK_TIMER_FORMAT_KEY = `${STORAGE_KEY}:defaultTaskTimerFormat`;
  const DYNAMIC_COLORS_KEY = `${STORAGE_KEY}:dynamicColorsEnabled`;
  const CHECKPOINT_ALERT_SOUND_KEY = `${STORAGE_KEY}:checkpointAlertSoundEnabled`;
  const CHECKPOINT_ALERT_TOAST_KEY = `${STORAGE_KEY}:checkpointAlertToastEnabled`;
  const HISTORY_RANGE_KEY = `${STORAGE_KEY}:historyRangeDaysByTaskId`;
  const HISTORY_RANGE_MODE_KEY = `${STORAGE_KEY}:historyRangeModeByTaskId`;
  const DASHBOARD_ORDER_KEY = `${STORAGE_KEY}:dashboardOrder`;
  let themeMode: "light" | "dark" = "dark";
  let addTaskCustomNames: string[] = [];
  let defaultTaskTimerFormat: "day" | "hour" | "minute" = "hour";
  let dynamicColorsEnabled = true;
  let checkpointAlertSoundEnabled = true;
  let checkpointAlertToastEnabled = true;

  let historyByTaskId: HistoryByTaskId = {};
  let historyRangeDaysByTaskId: Record<string, 7 | 14> = {};
  let historyRangeModeByTaskId: Record<string, "entries" | "day"> = {};
  let focusModeTaskId: string | null = null;
  const openHistoryTaskIds = new Set<string>();
  let pinnedHistoryTaskIds = new Set<string>();
  let hmExpandedTaskGroups = new Set<string>();
  let hmExpandedDateGroups = new Set<string>();
  let hmSortKey: "ts" | "ms" = "ts";
  let hmSortDir: "asc" | "desc" = "desc";
  let hmBulkEditMode = false;
  let hmBulkSelectedRows = new Set<string>();
  let hmRowsByTask: Record<string, string[]> = {};
  let hmRowsByTaskDate: Record<string, string[]> = {};
  type HistoryViewState = {
    page: number;
    rangeDays: 7 | 14;
    rangeMode: "entries" | "day";
    editMode: boolean;
    barRects: Array<any>;
    labelHitRects: Array<any>;
    lockedAbsIndexes: Set<number>;
    selectedAbsIndex: number | null;
    selectedRelIndex: number | null;
    selectionClearTimer: number | null;
    visualSelectedAbsIndex: number | null;
    selectionZoom: number;
    selectionAnimRaf: number | null;
    slideDir: "left" | "right" | null;
  };
  const historyViewByTaskId: Record<string, HistoryViewState> = {};
  let addTaskMilestonesEnabled = false;
  let addTaskMilestoneTimeUnit: "day" | "hour" | "minute" = "hour";
  let addTaskMilestones: Task["milestones"] = [];
  let elapsedPadTarget: HTMLInputElement | null = null;
  let elapsedPadMilestoneRef: {
    task: Task;
    milestone: { hours: number; description: string };
    ms: Task["milestones"];
    onApplied?: () => void;
  } | null = null;
  let elapsedPadDraft = "";
  let elapsedPadOriginal = "";
  let editMoveTargetMode: MainMode = "mode1";
  let dashboardEditMode = false;
  let dashboardDragEl: HTMLElement | null = null;
  let dashboardOrderDraftBeforeEdit: string[] | null = null;
  const checkpointToastQueue: Array<{ id: string; title: string; text: string }> = [];
  let activeCheckpointToast: { id: string; title: string; text: string } | null = null;
  let checkpointToastAutoCloseTimer: number | null = null;
  let checkpointBeepAudio: HTMLAudioElement | null = null;
  let checkpointBeepQueueCount = 0;
  let checkpointBeepQueueTimer: number | null = null;
  const checkpointFiredKeysByTaskId: Record<string, Set<string>> = {};
  const checkpointBaselineSecByTaskId: Record<string, number> = {};

  const els = {
    taskList: document.getElementById("taskList"),
    openAddTaskBtn: document.getElementById("openAddTaskBtn"),
    addTaskOverlay: document.getElementById("addTaskOverlay"),
    addTaskForm: document.getElementById("addTaskForm"),
    addTaskName: document.getElementById("addTaskName") as HTMLInputElement | null,
    addTaskNameCombo: document.getElementById("addTaskNameCombo"),
    addTaskNameToggle: document.getElementById("addTaskNameToggle"),
    addTaskNameMenu: document.getElementById("addTaskNameMenu"),
    addTaskNameCustomTitle: document.getElementById("addTaskNameCustomTitle"),
    addTaskNameCustomList: document.getElementById("addTaskNameCustomList"),
    addTaskNameDivider: document.getElementById("addTaskNameDivider"),
    addTaskNamePresetTitle: document.getElementById("addTaskNamePresetTitle"),
    addTaskNamePresetList: document.getElementById("addTaskNamePresetList"),
    addTaskError: document.getElementById("addTaskError"),
    addTaskMsToggle: document.getElementById("addTaskMsToggle"),
    addTaskMsUnitRow: document.getElementById("addTaskMsUnitRow"),
    addTaskMsUnitDay: document.getElementById("addTaskMsUnitDay"),
    addTaskMsUnitHour: document.getElementById("addTaskMsUnitHour"),
    addTaskMsUnitMinute: document.getElementById("addTaskMsUnitMinute"),
    addTaskAddMsBtn: document.getElementById("addTaskAddMsBtn") as HTMLButtonElement | null,
    addTaskMsArea: document.getElementById("addTaskMsArea"),
    addTaskMsList: document.getElementById("addTaskMsList"),
    addTaskCancelBtn: document.getElementById("addTaskCancelBtn"),
    resetAllBtn: document.getElementById("resetAllBtn"),
    mode1Btn: document.getElementById("mode1Btn") as HTMLButtonElement | null,
    mode2Btn: document.getElementById("mode2Btn") as HTMLButtonElement | null,
    mode3Btn: document.getElementById("mode3Btn") as HTMLButtonElement | null,
    modeSwitch: document.getElementById("modeSwitch"),
    mode1View: document.getElementById("mode1View"),
    mode2View: document.getElementById("mode2View"),
    mode3View: document.getElementById("mode3View"),
    appPageTasks: document.getElementById("appPageTasks"),
    appPageDashboard: document.getElementById("appPageDashboard"),
    appPageTest1: document.getElementById("appPageTest1"),
    appPageTest2: document.getElementById("appPageTest2"),
    footerTasksBtn: document.getElementById("footerTasksBtn") as HTMLButtonElement | null,
    footerDashboardBtn: document.getElementById("footerDashboardBtn") as HTMLButtonElement | null,
    footerTest1Btn: document.getElementById("footerTest1Btn") as HTMLButtonElement | null,
    footerTest2Btn: document.getElementById("footerTest2Btn") as HTMLButtonElement | null,
    footerSettingsBtn: document.getElementById("footerSettingsBtn") as HTMLButtonElement | null,
    dashboardEditBtn: document.getElementById("dashboardEditBtn") as HTMLButtonElement | null,
    dashboardEditCancelBtn: document.getElementById("dashboardEditCancelBtn") as HTMLButtonElement | null,
    dashboardEditDoneBtn: document.getElementById("dashboardEditDoneBtn") as HTMLButtonElement | null,
    dashboardGrid: document.querySelector(".dashboardGrid") as HTMLElement | null,

    menuIcon: document.getElementById("menuIcon"),
    menuOverlay: document.getElementById("menuOverlay"),
    historyManagerScreen: document.getElementById("historyManagerScreen"),
    historyManagerBtn: document.getElementById("historyManagerBtn"),
    historyManagerBulkBtn: document.getElementById("historyManagerBulkBtn") as HTMLButtonElement | null,
    historyManagerBulkDeleteBtn: document.getElementById("historyManagerBulkDeleteBtn") as HTMLButtonElement | null,
    historyManagerBackBtn: document.getElementById("historyManagerBackBtn"),
    focusModeScreen: document.getElementById("focusModeScreen"),
    focusModeBackBtn: document.getElementById("focusModeBackBtn"),
    focusDial: document.getElementById("focusDial"),
    focusCheckpointRing: document.getElementById("focusCheckpointRing"),
    focusCheckpointToggle: document.getElementById("focusCheckpointToggle"),
    focusTaskName: document.getElementById("focusTaskName"),
    focusTimerDays: document.getElementById("focusTimerDays"),
    focusTimerClock: document.getElementById("focusTimerClock"),
    focusStartBtn: document.getElementById("focusStartBtn") as HTMLButtonElement | null,
    focusStopBtn: document.getElementById("focusStopBtn") as HTMLButtonElement | null,
    focusInsightBest: document.getElementById("focusInsightBest"),
    focusInsightWeekday: document.getElementById("focusInsightWeekday"),
    focusInsightTodayDelta: document.getElementById("focusInsightTodayDelta"),
    focusInsightWeekDelta: document.getElementById("focusInsightWeekDelta"),
    hmList: document.getElementById("hmList"),
    closeMenuBtn: document.getElementById("closeMenuBtn"),

    aboutOverlay: document.getElementById("aboutOverlay"),
    howtoOverlay: document.getElementById("howtoOverlay"),
    appearanceOverlay: document.getElementById("appearanceOverlay"),
    taskSettingsOverlay: document.getElementById("taskSettingsOverlay"),
    taskDefaultFormatDay: document.getElementById("taskDefaultFormatDay"),
    taskDefaultFormatHour: document.getElementById("taskDefaultFormatHour"),
    taskDefaultFormatMinute: document.getElementById("taskDefaultFormatMinute"),
    taskDynamicColorsToggleRow: document.getElementById("taskDynamicColorsToggleRow"),
    taskDynamicColorsToggle: document.getElementById("taskDynamicColorsToggle"),
    taskCheckpointSoundToggleRow: document.getElementById("taskCheckpointSoundToggleRow"),
    taskCheckpointSoundToggle: document.getElementById("taskCheckpointSoundToggle"),
    taskCheckpointToastToggleRow: document.getElementById("taskCheckpointToastToggleRow"),
    taskCheckpointToastToggle: document.getElementById("taskCheckpointToastToggle"),
    taskSettingsSaveBtn: document.getElementById("taskSettingsSaveBtn"),
    categoryManagerOverlay: document.getElementById("categoryManagerOverlay"),
    categoryMode1Input: document.getElementById("categoryMode1Input") as HTMLInputElement | null,
    categoryMode2Input: document.getElementById("categoryMode2Input") as HTMLInputElement | null,
    categoryMode3Input: document.getElementById("categoryMode3Input") as HTMLInputElement | null,
    categoryMode1Color: document.getElementById("categoryMode1Color") as HTMLInputElement | null,
    categoryMode2Color: document.getElementById("categoryMode2Color") as HTMLInputElement | null,
    categoryMode3Color: document.getElementById("categoryMode3Color") as HTMLInputElement | null,
    categoryMode1ColorHex: document.getElementById("categoryMode1ColorHex") as HTMLInputElement | null,
    categoryMode2ColorHex: document.getElementById("categoryMode2ColorHex") as HTMLInputElement | null,
    categoryMode3ColorHex: document.getElementById("categoryMode3ColorHex") as HTMLInputElement | null,
    categoryMode2Toggle: document.getElementById("categoryMode2Toggle"),
    categoryMode3Toggle: document.getElementById("categoryMode3Toggle"),
    categoryMode2ToggleLabel: document.getElementById("categoryMode2ToggleLabel"),
    categoryMode3ToggleLabel: document.getElementById("categoryMode3ToggleLabel"),
    categoryMode2Row: document.getElementById("categoryMode2Row"),
    categoryMode3Row: document.getElementById("categoryMode3Row"),
    categoryMode2TrashBtn: document.getElementById("categoryMode2TrashBtn"),
    categoryMode3TrashBtn: document.getElementById("categoryMode3TrashBtn"),
    categorySaveBtn: document.getElementById("categorySaveBtn"),
    categoryResetBtn: document.getElementById("categoryResetBtn"),
    themeToggleRow: document.getElementById("themeToggleRow"),
    themeToggle: document.getElementById("themeToggle"),
    contactOverlay: document.getElementById("contactOverlay"),

    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile") as HTMLInputElement | null,

    editOverlay: document.getElementById("editOverlay"),
    editName: document.getElementById("editName") as HTMLInputElement | null,
    editMoveMenu: document.getElementById("editMoveMenu") as HTMLDetailsElement | null,
    editMoveCurrentLabel: document.getElementById("editMoveCurrentLabel"),
    editMoveMode1: document.getElementById("editMoveMode1") as HTMLButtonElement | null,
    editMoveMode2: document.getElementById("editMoveMode2") as HTMLButtonElement | null,
    editMoveMode3: document.getElementById("editMoveMode3") as HTMLButtonElement | null,
    editOverrideElapsedToggle: document.getElementById("editOverrideElapsedToggle"),
    editOverrideElapsedFields: document.getElementById("editOverrideElapsedFields"),
    editCheckpointSoundToggleRow: document.getElementById("editCheckpointSoundToggleRow"),
    editCheckpointSoundToggle: document.getElementById("editCheckpointSoundToggle"),
    editCheckpointToastToggleRow: document.getElementById("editCheckpointToastToggleRow"),
    editCheckpointToastToggle: document.getElementById("editCheckpointToastToggle"),
    editCheckpointAlertsNote: document.getElementById("editCheckpointAlertsNote"),
    editD: document.getElementById("editD") as HTMLInputElement | null,
    editH: document.getElementById("editH") as HTMLInputElement | null,
    editM: document.getElementById("editM") as HTMLInputElement | null,
    editS: document.getElementById("editS") as HTMLInputElement | null,
    msToggle: document.getElementById("msToggle"),
    msArea: document.getElementById("msArea"),
    msUnitRow: document.getElementById("msUnitRow"),
    msUnitDay: document.getElementById("msUnitDay"),
    msUnitHour: document.getElementById("msUnitHour"),
    msUnitMinute: document.getElementById("msUnitMinute"),
    msList: document.getElementById("msList"),
    addMsBtn: document.getElementById("addMsBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    saveEditBtn: document.getElementById("saveEditBtn"),
    elapsedPadOverlay: document.getElementById("elapsedPadOverlay"),
    elapsedPadTitle: document.getElementById("elapsedPadTitle"),
    elapsedPadDisplay: document.getElementById("elapsedPadDisplay"),
    elapsedPadError: document.getElementById("elapsedPadError"),
    elapsedPadCancelBtn: document.getElementById("elapsedPadCancelBtn"),
    elapsedPadDoneBtn: document.getElementById("elapsedPadDoneBtn"),

    confirmOverlay: document.getElementById("confirmOverlay"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmText: document.getElementById("confirmText"),
    confirmChkRow: document.getElementById("confirmChkRow"),
    confirmDeleteAll: document.getElementById("confirmDeleteAll") as HTMLInputElement | null,
    confirmChkNote: document.getElementById("confirmChkNote"),
    confirmCancelBtn: document.getElementById("confirmCancelBtn"),
    confirmOkBtn: document.getElementById("confirmOkBtn"),
    confirmAltBtn: document.getElementById("confirmAltBtn"),
    confirmChkLabel: document.getElementById("confirmChkLabel"),

    confirmChkRow2: document.getElementById("confirmChkRow2"),
    confirmChkLabel2: document.getElementById("confirmChkLabel2"),
    confirmLogChk: document.getElementById("confirmLogChk") as HTMLInputElement | null,
    historyAnalysisOverlay: document.getElementById("historyAnalysisOverlay"),
    historyAnalysisTitle: document.getElementById("historyAnalysisTitle"),
    historyAnalysisSummary: document.getElementById("historyAnalysisSummary"),

    historyScreen: document.getElementById("historyScreen"),
    historyBackBtn: document.getElementById("historyBackBtn"),
    historyTitle: document.getElementById("historyTitle"),
    historyOlderBtn: document.getElementById("historyOlderBtn") as HTMLButtonElement | null,
    historyNewerBtn: document.getElementById("historyNewerBtn") as HTMLButtonElement | null,
    historyRangeText: document.getElementById("historyRangeText"),
    historyCanvas: document.getElementById("historyChart") as HTMLCanvasElement | null,
    historyCanvasWrap: document.getElementById("historyCanvasWrap"),
    historyEditBtn: document.getElementById("historyEditBtn"),
    historyDeleteBtn: document.getElementById("historyDeleteBtn") as HTMLButtonElement | null,
    historyTrashRow: document.getElementById("historyTrashRow"),
    checkpointToastHost: document.getElementById("checkpointToastHost"),
  };

  function taskTimerRootPath() {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return `${taskTimerMatch[1] || ""}/tasktimer`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide)$/, "");
    return pageStyleRoot || normalized || "/tasktimer";
  }

  function appRoute(path: string) {
    if (!path.startsWith("/tasktimer")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasktimer/, "");
    const resolved = `${taskTimerRootPath()}${suffix}${trailing}`;

    // In exported/mobile builds (e.g. Android WebView), folder URLs like `/tasktimer/settings/`
    // can fall back to the app root. Target the actual exported file path instead.
    const currentPath = window.location.pathname || "";
    const isCapacitorRuntime = !!(window as any).Capacitor;
    const usesExportedHtmlPaths =
      window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isCapacitorRuntime;
    if (!usesExportedHtmlPaths) return resolved;

    const resolvedHashIndex = resolved.indexOf("#");
    const resolvedQueryIndex = resolved.indexOf("?");
    const resolvedCutIndex =
      resolvedQueryIndex === -1
        ? resolvedHashIndex
        : resolvedHashIndex === -1
          ? resolvedQueryIndex
          : Math.min(resolvedQueryIndex, resolvedHashIndex);
    const resolvedPathOnly = resolvedCutIndex >= 0 ? resolved.slice(0, resolvedCutIndex) : resolved;
    const resolvedTrailing = resolvedCutIndex >= 0 ? resolved.slice(resolvedCutIndex) : "";
    if (/\/index\.html$/i.test(resolvedPathOnly)) return resolved;
    const noTrailingSlash = resolvedPathOnly.replace(/\/+$/, "");
    return `${noTrailingSlash}/index.html${resolvedTrailing}`;
  }

  function getInitialAppPageFromQuery(): "tasks" | "dashboard" | "test1" | "test2" {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const page = String(params.get("page") || "").toLowerCase();
      if (page === "dashboard") return "dashboard";
      if (page === "test1") return "test1";
      if (page === "test2") return "test2";
    } catch {
      // ignore
    }
    return "tasks";
  }

  function maybeOpenImportFromQuery() {
    let shouldOpenImport = false;
    let nextSearch = "";
    try {
      const params = new URLSearchParams(window.location.search);
      shouldOpenImport = params.get("import") === "1";
      if (!shouldOpenImport) return;
      params.delete("import");
      nextSearch = params.toString();
    } catch {
      return;
    }

    if (!els.importBtn) return;

    window.setTimeout(() => {
      els.importBtn?.click();
    }, 0);

    try {
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch {
      // ignore URL cleanup failures
    }
  }

  function makeTask(name: string, order?: number): Task {
    const t: Task = {
      id: cryptoRandomId(),
      name,
      order: order || 1,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      hasStarted: false,
      checkpointSoundEnabled: false,
      checkpointToastEnabled: false,
    };
    (t as any).mode = currentMode;
    return t;
  }

  function defaultTasks(): Task[] {
    const prevMode = currentMode;
    currentMode = "mode1";
    const out = [makeTask("Exercise", 1), makeTask("Study", 2), makeTask("Meditation", 3)];
    currentMode = prevMode;
    return out;
  }

  function taskModeOf(t: Task): "mode1" | "mode2" | "mode3" {
    const m = String((t as any)?.mode || "mode1");
    if (m === "mode2" || m === "mode3") return m;
    return "mode1";
  }

  function load() {
    const loaded = loadTasks();
    if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
      tasks = defaultTasks();
      saveTasks(tasks);
      return;
    }
    tasks = loaded;
    tasks.forEach((t) => {
      if (!(t as any).mode) (t as any).mode = "mode1";
      if (t.milestoneTimeUnit !== "day" && t.milestoneTimeUnit !== "hour" && t.milestoneTimeUnit !== "minute") {
        t.milestoneTimeUnit = "hour";
      }
      t.checkpointSoundEnabled = !!t.checkpointSoundEnabled;
      t.checkpointToastEnabled = !!t.checkpointToastEnabled;
    });
  }

  function save() {
    saveTasks(tasks);
  }

  function loadHistoryIntoMemory() {
    historyByTaskId = loadHistory();
    historyByTaskId = cleanupHistory(historyByTaskId);
    saveHistory(historyByTaskId);
  }

  function loadHistoryRangePrefs() {
    historyRangeDaysByTaskId = {};
    historyRangeModeByTaskId = {};
    try {
      const raw = localStorage.getItem(HISTORY_RANGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.keys(parsed).forEach((taskId) => {
        const value = (parsed as any)[taskId];
        historyRangeDaysByTaskId[taskId] = value === 14 ? 14 : 7;
      });
    } catch {
      // ignore
    }
    try {
      const rawMode = localStorage.getItem(HISTORY_RANGE_MODE_KEY);
      if (!rawMode) return;
      const parsedMode = JSON.parse(rawMode);
      if (!parsedMode || typeof parsedMode !== "object") return;
      Object.keys(parsedMode).forEach((taskId) => {
        const value = (parsedMode as any)[taskId];
        historyRangeModeByTaskId[taskId] = value === "day" ? "day" : "entries";
      });
    } catch {
      // ignore
    }
  }

  function saveHistoryRangePref(taskId: string, rangeDays: 7 | 14) {
    if (!taskId) return;
    historyRangeDaysByTaskId[taskId] = rangeDays;
    try {
      localStorage.setItem(HISTORY_RANGE_KEY, JSON.stringify(historyRangeDaysByTaskId));
    } catch {
      // ignore
    }
  }

  function saveHistoryRangeModePref(taskId: string, rangeMode: "entries" | "day") {
    if (!taskId) return;
    historyRangeModeByTaskId[taskId] = rangeMode;
    try {
      localStorage.setItem(HISTORY_RANGE_MODE_KEY, JSON.stringify(historyRangeModeByTaskId));
    } catch {
      // ignore
    }
  }

  function applyDashboardOrderFromStorage() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    try {
      const raw = localStorage.getItem(DASHBOARD_ORDER_KEY);
      if (!raw) return;
      const order = JSON.parse(raw);
      if (!Array.isArray(order) || !order.length) return;
      const byId = new Map<string, HTMLElement>();
      Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
        const card = el as HTMLElement;
        const id = card.getAttribute("data-dashboard-id");
        if (id) byId.set(id, card);
      });
      order.forEach((id: any) => {
        const card = byId.get(String(id || ""));
        if (card) grid.appendChild(card);
      });
    } catch {
      // ignore
    }
  }

  function saveDashboardOrder() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const order = getCurrentDashboardOrder();
    try {
      localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(order));
    } catch {
      // ignore
    }
  }

  function getCurrentDashboardOrder() {
    const grid = els.dashboardGrid;
    if (!grid) return [] as string[];
    return Array.from(grid.querySelectorAll(".dashboardCard"))
      .map((el) => (el as HTMLElement).getAttribute("data-dashboard-id") || "")
      .filter(Boolean);
  }

  function applyDashboardOrder(order: string[] | null | undefined) {
    const grid = els.dashboardGrid;
    if (!grid || !Array.isArray(order) || !order.length) return;
    const byId = new Map<string, HTMLElement>();
    Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
      const card = el as HTMLElement;
      const id = card.getAttribute("data-dashboard-id");
      if (id) byId.set(id, card);
    });
    order.forEach((id) => {
      const card = byId.get(String(id || ""));
      if (card) grid.appendChild(card);
    });
  }

  function beginDashboardEditMode() {
    if (dashboardEditMode) return;
    dashboardOrderDraftBeforeEdit = getCurrentDashboardOrder();
    dashboardEditMode = true;
    applyDashboardEditMode();
  }

  function cancelDashboardEditMode() {
    if (!dashboardEditMode) return;
    if (dashboardOrderDraftBeforeEdit && dashboardOrderDraftBeforeEdit.length) {
      applyDashboardOrder(dashboardOrderDraftBeforeEdit);
    }
    dashboardEditMode = false;
    dashboardOrderDraftBeforeEdit = null;
    applyDashboardEditMode();
  }

  function commitDashboardEditMode() {
    if (!dashboardEditMode) return;
    saveDashboardOrder();
    dashboardEditMode = false;
    dashboardOrderDraftBeforeEdit = null;
    applyDashboardEditMode();
  }

  function applyDashboardEditMode() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    grid.classList.toggle("isEditMode", dashboardEditMode);
    Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
      (el as HTMLElement).setAttribute("draggable", dashboardEditMode ? "true" : "false");
    });
    if (els.dashboardEditBtn) {
      els.dashboardEditBtn.classList.toggle("isOn", dashboardEditMode);
      (els.dashboardEditBtn as HTMLElement).style.display = dashboardEditMode ? "none" : "inline-flex";
    }
    if (els.dashboardEditCancelBtn) (els.dashboardEditCancelBtn as HTMLElement).style.display = dashboardEditMode ? "inline-flex" : "none";
    if (els.dashboardEditDoneBtn) (els.dashboardEditDoneBtn as HTMLElement).style.display = dashboardEditMode ? "inline-flex" : "none";
  }

  function safeJsonParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function sanitizeModeLabel(value: unknown, fallback: string) {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return fallback;
    return raw.slice(0, 10);
  }
  function sanitizeModeColor(value: unknown, fallback: string) {
    let raw = String(value ?? "").trim().toUpperCase();
    if (!raw) return fallback;
    if (raw.startsWith("#")) raw = raw.slice(1);
    if (/^[0-9A-F]{3}$/.test(raw)) {
      raw = raw
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    return /^[0-9A-F]{6}$/.test(raw) ? `#${raw}` : fallback;
  }

  function getModeLabel(mode: MainMode) {
    return modeLabels[mode] || DEFAULT_MODE_LABELS[mode];
  }
  function getModeColor(mode: MainMode) {
    return modeColors[mode] || DEFAULT_MODE_COLORS[mode];
  }
  function applyModeAccent(mode: MainMode) {
    document.documentElement.style.setProperty("--mode-accent", getModeColor(mode));
    document.documentElement.style.setProperty("--mode1-accent", getModeColor("mode1"));
    document.documentElement.style.setProperty("--mode2-accent", getModeColor("mode2"));
    document.documentElement.style.setProperty("--mode3-accent", getModeColor("mode3"));
  }

  function isModeEnabled(mode: MainMode) {
    if (mode === "mode1") return true;
    return !!modeEnabled[mode];
  }

  function syncModeLabelsUi() {
    if (els.mode1Btn) els.mode1Btn.textContent = getModeLabel("mode1");
    if (els.mode2Btn) els.mode2Btn.textContent = getModeLabel("mode2");
    if (els.mode3Btn) els.mode3Btn.textContent = getModeLabel("mode3");
    if (els.mode2Btn) els.mode2Btn.disabled = !isModeEnabled("mode2");
    if (els.mode3Btn) els.mode3Btn.disabled = !isModeEnabled("mode3");
    if (els.editMoveMode1) els.editMoveMode1.textContent = getModeLabel("mode1");
    if (els.editMoveMode2) els.editMoveMode2.textContent = getModeLabel("mode2");
    if (els.editMoveMode3) els.editMoveMode3.textContent = getModeLabel("mode3");
    if (els.categoryMode1Input) els.categoryMode1Input.value = getModeLabel("mode1");
    if (els.categoryMode2Input) els.categoryMode2Input.value = getModeLabel("mode2");
    if (els.categoryMode3Input) els.categoryMode3Input.value = getModeLabel("mode3");
    if (els.categoryMode1Color) els.categoryMode1Color.value = getModeColor("mode1");
    if (els.categoryMode2Color) els.categoryMode2Color.value = getModeColor("mode2");
    if (els.categoryMode3Color) els.categoryMode3Color.value = getModeColor("mode3");
    if (els.categoryMode1ColorHex) els.categoryMode1ColorHex.value = getModeColor("mode1");
    if (els.categoryMode2ColorHex) els.categoryMode2ColorHex.value = getModeColor("mode2");
    if (els.categoryMode3ColorHex) els.categoryMode3ColorHex.value = getModeColor("mode3");
    els.categoryMode2Toggle?.classList.toggle("on", isModeEnabled("mode2"));
    els.categoryMode2Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode2")));
    els.categoryMode3Toggle?.classList.toggle("on", isModeEnabled("mode3"));
    els.categoryMode3Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode3")));
    if (els.categoryMode2ToggleLabel) {
      els.categoryMode2ToggleLabel.textContent = isModeEnabled("mode2") ? "Disable Mode 2" : "Enable Mode 2";
    }
    if (els.categoryMode3ToggleLabel) {
      els.categoryMode3ToggleLabel.textContent = isModeEnabled("mode3") ? "Disable Mode 3" : "Enable Mode 3";
    }
    if (els.categoryMode2Row) (els.categoryMode2Row as HTMLElement).style.display = isModeEnabled("mode2") ? "block" : "none";
    if (els.categoryMode3Row) (els.categoryMode3Row as HTMLElement).style.display = isModeEnabled("mode3") ? "block" : "none";
    if (els.editMoveMode2) els.editMoveMode2.classList.toggle("is-disabled", !isModeEnabled("mode2"));
    if (els.editMoveMode3) els.editMoveMode3.classList.toggle("is-disabled", !isModeEnabled("mode3"));
  }

  function saveModeSettings() {
    try {
      localStorage.setItem(
        MODE_SETTINGS_KEY,
        JSON.stringify({
          mode1: { label: modeLabels.mode1, enabled: true },
          mode2: { label: modeLabels.mode2, enabled: !!modeEnabled.mode2, color: modeColors.mode2 },
          mode3: { label: modeLabels.mode3, enabled: !!modeEnabled.mode3, color: modeColors.mode3 },
          mode1Color: modeColors.mode1,
        })
      );
    } catch {
      // ignore
    }
  }

  function loadModeLabels() {
    modeLabels = { ...DEFAULT_MODE_LABELS };
    modeEnabled = { ...DEFAULT_MODE_ENABLED };
    modeColors = { ...DEFAULT_MODE_COLORS };
    try {
      const rawSettings = localStorage.getItem(MODE_SETTINGS_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed && typeof parsed === "object") {
          modeLabels.mode1 = sanitizeModeLabel((parsed as any).mode1?.label, DEFAULT_MODE_LABELS.mode1);
          modeLabels.mode2 = sanitizeModeLabel((parsed as any).mode2?.label, DEFAULT_MODE_LABELS.mode2);
          modeLabels.mode3 = sanitizeModeLabel((parsed as any).mode3?.label, DEFAULT_MODE_LABELS.mode3);
          modeEnabled.mode2 = !!(parsed as any).mode2?.enabled;
          modeEnabled.mode3 = !!(parsed as any).mode3?.enabled;
          modeColors.mode1 = sanitizeModeColor((parsed as any).mode1?.color ?? (parsed as any).mode1Color, DEFAULT_MODE_COLORS.mode1);
          modeColors.mode2 = sanitizeModeColor((parsed as any).mode2?.color, DEFAULT_MODE_COLORS.mode2);
          modeColors.mode3 = sanitizeModeColor((parsed as any).mode3?.color, DEFAULT_MODE_COLORS.mode3);
          return;
        }
      }
      const raw = localStorage.getItem(MODE_LABELS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      modeLabels.mode1 = sanitizeModeLabel((parsed as any).mode1, DEFAULT_MODE_LABELS.mode1);
      modeLabels.mode2 = sanitizeModeLabel((parsed as any).mode2, DEFAULT_MODE_LABELS.mode2);
      modeLabels.mode3 = sanitizeModeLabel((parsed as any).mode3, DEFAULT_MODE_LABELS.mode3);
      modeColors = { ...DEFAULT_MODE_COLORS };
    } catch {
      // ignore
    }
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function makeBackupPayload() {
    return {
      schema: "taskticka_backup_v1",
      exportedAt: new Date().toISOString(),
      tasks: tasks || [],
      history: historyByTaskId || {},
    };
  }

  function exportBackup() {
    const d = new Date();
    const y = d.getFullYear();
    const mo = formatTwo(d.getMonth() + 1);
    const da = formatTwo(d.getDate());
    const hh = formatTwo(d.getHours());
    const mi = formatTwo(d.getMinutes());
    const ss = formatTwo(d.getSeconds());
    const filename = `taskticka-backup-${y}${mo}${da}-${hh}${mi}${ss}.json`;
    const payload = makeBackupPayload();
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
    closeOverlay(els.menuOverlay as HTMLElement | null);
  }

  function normalizeImportedTask(t: any): Task {
    const out = makeTask(String(t.name || "Task"), 1);
    out.id = String(t.id || cryptoRandomId());
    out.order = Number.isFinite(+t.order) ? +t.order : 1;
    out.accumulatedMs = Number.isFinite(+t.accumulatedMs) ? Math.max(0, +t.accumulatedMs) : 0;
    out.running = false;
    out.startMs = null;
    out.collapsed = !!t.collapsed;
    out.milestonesEnabled = !!t.milestonesEnabled;
    out.milestoneTimeUnit = t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour";
    out.milestones = Array.isArray(t.milestones)
      ? t.milestones.map((m: any) => ({
          hours: Number.isFinite(+m.hours) ? +m.hours : 0,
          description: String(m.description || ""),
        }))
      : [];
    out.milestones = sortMilestones(out.milestones);
    out.hasStarted = !!t.hasStarted;
    out.checkpointSoundEnabled = !!t.checkpointSoundEnabled;
    out.checkpointToastEnabled = !!t.checkpointToastEnabled;
    return out;
  }

  function mergeBackup(payload: any, opts?: { overwrite?: boolean }) {
    if (!payload || typeof payload !== "object") return { ok: false, msg: "Invalid backup file." };
    const overwrite = !!opts?.overwrite;

    const importedTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const importedHistory = payload.history && typeof payload.history === "object" ? payload.history : {};

    const existingMaxOrder = overwrite ? 0 : tasks.reduce((mx, t) => Math.max(mx, +t.order || 0), 0) || 0;
    const existingIds = new Set(overwrite ? [] : tasks.map((t) => String(t.id)));
    const idMap: Record<string, string> = {};

    const orderedImport = importedTasks.slice().sort((a: any, b: any) => (+a.order || 0) - (+b.order || 0));

    let added = 0;
    const nextTasks: Task[] = overwrite ? [] : tasks.slice();

    orderedImport.forEach((rawTask: any, idx: number) => {
      if (!rawTask || typeof rawTask !== "object") return;
      const nt = normalizeImportedTask(rawTask);

      const oldId = String(nt.id || cryptoRandomId());
      let newId = oldId;
      if (existingIds.has(newId)) newId = cryptoRandomId();

      idMap[oldId] = newId;
      nt.id = newId;
      nt.order = existingMaxOrder + idx + 1;

      existingIds.add(newId);
      nextTasks.push(nt);
      added += 1;
    });

    const nextHistory: HistoryByTaskId = overwrite ? {} : { ...(historyByTaskId || {}) };

    Object.keys(importedHistory).forEach((oldId) => {
      const arr = (importedHistory as any)[oldId];
      if (!Array.isArray(arr) || arr.length === 0) return;

      const destId = idMap[String(oldId)] || String(oldId);
      if (!Array.isArray(nextHistory[destId])) nextHistory[destId] = [];

      arr.forEach((e: any) => {
        if (!e || typeof e !== "object") return;
        const ts = Number.isFinite(+e.ts) ? +e.ts : null;
        const ms = Number.isFinite(+e.ms) ? Math.max(0, +e.ms) : null;
        if (!ts || !ms) return;
        nextHistory[destId].push({
          name: String(e.name || ""),
          ms,
          ts,
          color: e.color ? String(e.color) : undefined,
        });
      });
    });

    tasks = nextTasks;
    historyByTaskId = nextHistory;
    save();
    saveHistory(historyByTaskId);
    historyByTaskId = cleanupHistory(historyByTaskId);
    saveHistory(historyByTaskId);
    render();

    return { ok: true, msg: `Imported ${added} task(s).` };
  }

  function importBackupFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const payload = safeJsonParse(text);
      const importedTasks = payload && Array.isArray(payload.tasks) ? payload.tasks : [];
      const hasExistingTasks = Array.isArray(tasks) && tasks.length > 0;
      const hasIncomingTasks = importedTasks.length > 0;

      const runImport = (overwrite: boolean) => {
        const res = mergeBackup(payload, { overwrite });
        if (!res.ok) alert(res.msg || "Import failed.");
        else alert(res.msg || "Import complete.");
      };

      if (hasExistingTasks && hasIncomingTasks) {
        confirm(
          "Import Backup",
          "Existing tasks were found. Do you want to add imported tasks to existing tasks, or overwrite existing data?",
          {
            okLabel: "Add",
            altLabel: "Overwrite",
            cancelLabel: "Cancel",
            onOk: () => {
              runImport(false);
              closeConfirm();
            },
            onAlt: () => {
              runImport(true);
              closeConfirm();
            },
            onCancel: () => closeConfirm(),
          }
        );
        return;
      }

      runImport(false);
    };
    reader.onerror = () => alert("Could not read the file.");
    reader.readAsText(file);
  }

  function getElapsedMs(t: Task) {
    if (t.running && t.startMs) return (t.accumulatedMs || 0) + (nowMs() - t.startMs);
    return t.accumulatedMs || 0;
  }

  function getTaskElapsedMs(t: Task) {
    const runMs = t.running && typeof t.startMs === "number" ? Math.max(0, nowMs() - t.startMs) : 0;
    return Math.max(0, (t.accumulatedMs || 0) + runMs);
  }

  function canLogSession(t: Task) {
    if (!t.hasStarted) return false;
    return getTaskElapsedMs(t) > 0;
  }

  function escapeHtmlUI(str: any) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function appendHistory(taskId: string, entry: any) {
    if (!taskId) return;
    if (!Array.isArray(historyByTaskId[taskId])) historyByTaskId[taskId] = [];
    historyByTaskId[taskId].push(entry);
    saveHistory(historyByTaskId);
  }

  function backfillHistoryColorsFromSessionLogic() {
    if (!historyByTaskId || typeof historyByTaskId !== "object") return;
    let changed = false;

    Object.keys(historyByTaskId).forEach((taskId) => {
      const entries = historyByTaskId[taskId];
      if (!Array.isArray(entries) || entries.length === 0) return;
      const task = (tasks || []).find((t) => String(t.id || "") === String(taskId));
      if (!task) return;

      entries.forEach((entry: any) => {
        if (!entry) return;
        const ms = Number.isFinite(+entry.ms) ? Math.max(0, +entry.ms) : 0;
        const nextColor = sessionColorForTaskMs(task, ms);
        if (entry.color !== nextColor) {
          entry.color = nextColor;
          changed = true;
        }
      });
    });

    if (changed) saveHistory(historyByTaskId);
  }


  function openOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    overlay.style.display = "flex";
  }

  function closeOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    try {
      if (document.activeElement && (document.activeElement as any).blur) (document.activeElement as any).blur();
    } catch {
      // ignore
    }
    overlay.style.display = "none";
  }

  function confirm(title: string, text: string, opts: any) {
    confirmAction = opts?.onOk || null;
    confirmActionAlt = opts?.onAlt || null;

    const okLabel = opts?.okLabel || "OK";
    const altLabel = opts?.altLabel || null;

    if (els.confirmOkBtn) {
      els.confirmOkBtn.textContent = okLabel;
      (els.confirmOkBtn as HTMLElement).style.display = "inline-flex";
      els.confirmOkBtn.classList.remove("btn-warn");
      els.confirmOkBtn.classList.add("btn-accent");
      if (String(okLabel).toLowerCase() === "delete") {
        els.confirmOkBtn.classList.remove("btn-accent");
        els.confirmOkBtn.classList.add("btn-warn");
      }
    }

    if (els.confirmAltBtn) {
      if (altLabel) {
        els.confirmAltBtn.textContent = altLabel;
        (els.confirmAltBtn as HTMLElement).style.display = "inline-flex";
      } else {
        (els.confirmAltBtn as HTMLElement).style.display = "none";
        els.confirmAltBtn.textContent = "";
      }
    }

    const showChk = !!opts?.checkboxLabel;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).style.display = showChk ? "flex" : "none";
    if (showChk && els.confirmChkLabel) els.confirmChkLabel.textContent = opts.checkboxLabel;
    if (els.confirmDeleteAll) els.confirmDeleteAll.checked = showChk ? !!opts.checkboxChecked : false;
    const disableChk = showChk ? !!opts?.checkboxDisabled : false;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = disableChk;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-disabled", disableChk);
    const showChkNote = showChk && !!opts?.checkboxNote;
    if (els.confirmChkNote) {
      (els.confirmChkNote as HTMLElement).style.display = showChkNote ? "block" : "none";
      (els.confirmChkNote as HTMLElement).textContent = showChkNote ? String(opts.checkboxNote || "") : "";
    }

    const showChk2 = !!opts?.checkbox2Label;
    if (els.confirmChkRow2) (els.confirmChkRow2 as HTMLElement).style.display = showChk2 ? "flex" : "none";
    if (showChk2 && els.confirmChkLabel2) els.confirmChkLabel2.textContent = opts.checkbox2Label;
    if (els.confirmLogChk) els.confirmLogChk.checked = showChk2 ? !!opts.checkbox2Checked : false;

    if (els.confirmTitle) els.confirmTitle.textContent = title || "Confirm";
    if (els.confirmText) {
      if (opts?.textHtml) els.confirmText.innerHTML = String(opts.textHtml || "");
      else els.confirmText.textContent = text || "";
    }

    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "flex";
  }

  function closeConfirm() {
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "none";
    confirmAction = null;
    confirmActionAlt = null;
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLElement).style.display = "none";
    if (els.confirmOkBtn) {
      els.confirmOkBtn.classList.remove("btn-warn");
      els.confirmOkBtn.classList.add("btn-accent");
    }
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = false;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.remove("is-disabled");
    if (els.confirmChkNote) {
      (els.confirmChkNote as HTMLElement).style.display = "none";
      (els.confirmChkNote as HTMLElement).textContent = "";
    }
  }

  function milestoneUnitSec(t: Task | null | undefined): number {
    if (!t) return 3600;
    if (t.milestoneTimeUnit === "day") return 86400;
    if (t.milestoneTimeUnit === "minute") return 60;
    return 3600;
  }

  function milestoneUnitSuffix(t: Task | null | undefined): string {
    if (!t) return "h";
    if (t.milestoneTimeUnit === "day") return "d";
    if (t.milestoneTimeUnit === "minute") return "m";
    return "h";
  }

  function setMilestoneUnitUi(unit: "day" | "hour" | "minute") {
    els.msUnitDay?.classList.toggle("isOn", unit === "day");
    els.msUnitHour?.classList.toggle("isOn", unit === "hour");
    els.msUnitMinute?.classList.toggle("isOn", unit === "minute");
  }

  function setAddTaskMilestoneUnitUi(unit: "day" | "hour" | "minute") {
    els.addTaskMsUnitDay?.classList.toggle("isOn", unit === "day");
    els.addTaskMsUnitHour?.classList.toggle("isOn", unit === "hour");
    els.addTaskMsUnitMinute?.classList.toggle("isOn", unit === "minute");
  }

  function isEditMilestoneUnitDay(): boolean {
    if (editIndex == null) return false;
    const t = tasks[editIndex];
    return !!t && t.milestoneTimeUnit === "day";
  }

  function renderMilestoneEditor(t: Task) {
    if (!els.msList) return;
    els.msList.innerHTML = "";

    const ms = (t.milestones || []).slice();

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as any).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill msSkewField">${escapeHtmlUI(String(+m.hours || 0))}${milestoneUnitSuffix(t)}</div>
        <input class="msSkewInput" type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">&times;</button>
      `;

      const pill = row.querySelector(".pill");
      on(pill, "click", () => {
        openElapsedPadForMilestone(t, m as { hours: number; description: string }, ms);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      on(desc, "input", (e: any) => {
        m.description = e?.target?.value || "";
        t.milestones = ms;
      });

      const rm = row.querySelector('[data-action="rmMs"]');
      on(rm, "click", () => {
        ms.splice(idx, 1);
        t.milestones = ms;
        renderMilestoneEditor(t);
      });

      els.msList!.appendChild(row);
    });

    t.milestones = ms;
  }

  function renderAddTaskMilestoneEditor() {
    if (!els.addTaskMsList) return;
    els.addTaskMsList.innerHTML = "";

    const ms = (addTaskMilestones || []).slice();
    const tempTask = { milestoneTimeUnit: addTaskMilestoneTimeUnit, milestones: ms } as Task;

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as any).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill">${escapeHtmlUI(String(+m.hours || 0))}${milestoneUnitSuffix(tempTask)}</div>
        <input type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">x</button>
      `;

      const pill = row.querySelector(".pill");
      on(pill, "click", () => {
        openElapsedPadForMilestone(tempTask, m as { hours: number; description: string }, ms, renderAddTaskMilestoneEditor);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      on(desc, "input", (e: any) => {
        m.description = e?.target?.value || "";
        addTaskMilestones = ms;
      });

      const rm = row.querySelector('[data-action="rmMs"]');
      on(rm, "click", () => {
        ms.splice(idx, 1);
        addTaskMilestones = ms;
        renderAddTaskMilestoneEditor();
      });

      els.addTaskMsList!.appendChild(row);
    });

    addTaskMilestones = ms;
  }

  function render() {
    if (!els.taskList) return;

    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    els.taskList.innerHTML = "";
    const modeTasks = tasks.filter((t) => taskModeOf(t) === currentMode);
    const activeTaskIds = new Set(modeTasks.map((t) => String(t.id || "")));
    for (const taskId of Array.from(pinnedHistoryTaskIds)) {
      if (activeTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
    }
    for (const taskId of Array.from(openHistoryTaskIds)) {
      if (!activeTaskIds.has(taskId)) {
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    tasks.forEach((t, index) => {
      if (taskModeOf(t) !== currentMode) return;
      const elapsedMs = getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;

      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
      const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
      const maxSec = Math.max(maxValue * milestoneUnitSec(t), 1);
      const pct = hasMilestones ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

      const taskEl = document.createElement("div");
      taskEl.className = "task" + (t.collapsed ? " collapsed" : "");
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = String(t.id || "");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";

      let progressHTML = "";
      if (hasMilestones) {
        let markers = "";
        const unitSuffix = milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;

        msSorted.forEach((m) => {
          const val = +m.hours || 0;
          const left = Math.min((val / (maxValue || 1)) * 100, 100);
          const reached = elapsedSec >= val * milestoneUnitSec(t);
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${val}${unitSuffix}`;
          const desc = (m.description || "").trim();
          const edgeCls = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
          const leftPos = edgeCls === "mkEdgeL" ? 0 : edgeCls === "mkEdgeR" ? 100 : left;
          const wrapCls = edgeCls && label.length > 8 ? "mkWrap8" : "";
          markers += `
            <div class="mkFlag ${cls}" style="left:${leftPos}%"></div>
            <div class="mkTime ${cls} ${edgeCls} ${wrapCls}" style="left:${leftPos}%">${escapeHtmlUI(label)}</div>
            ${desc ? `<div class="mkDesc ${cls} ${edgeCls}" style="left:${leftPos}%">${escapeHtmlUI(desc)}</div>` : ``}`;
        });

        progressHTML = `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${pct}%;background:${
                  dynamicColorsEnabled ? fillBackgroundForPct(pct) : getModeColor(taskModeOf(t))
                }"></div>
                ${markers}
              </div>
            </div>
          </div>`;
      }

      const taskId = String(t.id || "");
      const showHistory = openHistoryTaskIds.has(taskId);
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const historyHTML = showHistory
        ? `
          <section class="historyInline" aria-label="History for ${escapeHtmlUI(t.name)}">
            <div class="historyTop">
              <div class="historyMeta">
                <div class="historyTitle historyInlineTitle">History</div>
              </div>
              <div class="historyMeta historyTopActions">
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="export" title="Export" aria-label="Export">&#11123;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="analyse" title="Analysis" aria-label="Analysis">&#128269;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="manage" title="Manage" aria-label="Manage">&#9881;</button>
                <button class="historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">X</button>
                <button class="historyPinBtn ${isHistoryPinned ? "isOn" : ""}" type="button" data-history-action="pin" title="${
                    isHistoryPinned ? "Unpin chart" : "Pin chart"
                  }" aria-label="${isHistoryPinned ? "Unpin chart" : "Pin chart"}">&#128204;</button>
              </div>
            </div>
            <div class="historyCanvasWrap">
              <canvas class="historyChartInline"></canvas>
            </div>
            <div class="historyTrashRow"></div>
            <div class="historyRangeRow">
              <div class="historyRangeInfo">
                <div class="historyMeta historyRangeText">&nbsp;</div>
                <div class="historyRangeToggleRow" aria-label="History range">
                  <button class="switch historyRangeToggle" type="button" role="switch" aria-checked="false" data-history-range-toggle="true"></button>
                  <button class="historyRangeModePill isOn" type="button" data-history-range-mode="entries" aria-pressed="true">Entries</button>
                  <button class="historyRangeModePill" type="button" data-history-range-mode="day" aria-pressed="false">Day</button>
                </div>
              </div>
              <div class="historyMeta historyRangeActions">
              </div>
            </div>
          </section>
        `
        : "";

      taskEl.innerHTML = `
        <div class="row">
          <div class="name" data-action="editName" title="Tap to edit">${escapeHtmlUI(t.name)}</div>
          <div class="time">${formatMainTaskElapsedHtml(elapsedMs, !!t.running)}</div>
          <div class="actions">
            ${
              t.running
                ? '<button class="btn btn-warn small" data-action="stop" title="Stop">Stop</button>'
                : '<button class="btn btn-accent small" data-action="start" title="Start">Start</button>'
            }
            <button class="iconBtn" data-action="reset" title="Reset">&#10227;</button>
            <button class="iconBtn" data-action="edit" title="Edit">&#9998;</button>
            <button class="iconBtn historyActionBtn ${showHistory || isHistoryPinned ? "isActive" : ""} ${
              isHistoryPinned ? "isPinned" : ""
            }" data-action="history" title="${
              isHistoryPinned ? "History pinned" : "History"
            }" aria-pressed="${showHistory || isHistoryPinned ? "true" : "false"}" ${
              isHistoryPinned ? "disabled" : ""
            }>&#128202;</button>
            <details class="taskMenu">
              <summary class="iconBtn taskMenuBtn" title="More actions" aria-label="More actions">&#8942;</summary>
              <div class="taskMenuList">
                <button class="taskMenuItem" data-action="duplicate" title="Duplicate" type="button">Duplicate</button>
                <button class="taskMenuItem" data-action="collapse" title="${escapeHtmlUI(collapseLabel)}" type="button">${escapeHtmlUI(collapseLabel)}</button>
                <button class="taskMenuItem taskMenuItemDelete" data-action="delete" title="Delete" type="button">Delete</button>
              </div>
            </details>
          </div>
        </div>
        ${progressHTML}
        ${historyHTML}
      `;

      els.taskList!.appendChild(taskEl);
    });

    save();
    for (const taskId of openHistoryTaskIds) {
      renderHistory(taskId);
    }
  }

  function startTask(i: number) {
    const t = tasks[i];
    if (!t || t.running) return;
    t.running = true;
    t.startMs = nowMs();
    t.hasStarted = true;
    clearCheckpointBaseline(t.id);
    save();
    render();
  }

  function stopTask(i: number) {
    const t = tasks[i];
    if (!t || !t.running) return;
    t.accumulatedMs = getElapsedMs(t);
    t.running = false;
    t.startMs = null;
    clearCheckpointBaseline(t.id);
    save();
    render();
  }

  function syncFocusRunButtons(t?: Task | null) {
    const startBtn = els.focusStartBtn;
    const stopBtn = els.focusStopBtn;
    const dial = els.focusDial as HTMLElement | null;
    if (!startBtn || !stopBtn) return;
    if (!t) {
      startBtn.style.display = "inline-flex";
      stopBtn.style.display = "none";
      if (dial) {
        dial.classList.remove("isRunning", "isStopped");
      }
      return;
    }
    const isRunning = !!t.running;
    startBtn.style.display = isRunning ? "none" : "inline-flex";
    stopBtn.style.display = isRunning ? "inline-flex" : "none";
    if (dial) {
      dial.classList.toggle("isRunning", isRunning);
      dial.classList.toggle("isStopped", !isRunning);
    }
  }

  function formatSignedDelta(ms: number): string {
    if (!Number.isFinite(ms)) return "--";
    const sign = ms > 0 ? "+" : ms < 0 ? "-" : "";
    return `${sign}${formatTime(Math.abs(ms))}`;
  }

  function updateFocusInsights(t: Task) {
    const taskId = String(t.id || "");
    const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    const insights = computeFocusInsights(entries as Array<{ ts: number; ms: number }>, nowMs());
    if (els.focusInsightBest) els.focusInsightBest.textContent = insights.bestMs > 0 ? formatTime(insights.bestMs) : "--";

    if (els.focusInsightWeekday) {
      if (!insights.hasWeekdayEnoughDays || !insights.weekdayName) {
        els.focusInsightWeekday.textContent = "Need at least 14 logged days";
        els.focusInsightWeekday.classList.add("is-empty");
      } else {
        els.focusInsightWeekday.textContent = `${insights.weekdayName} (${formatTime(insights.weekdayTotalMs)})`;
        els.focusInsightWeekday.classList.remove("is-empty");
      }
    }
    if (els.focusInsightTodayDelta) els.focusInsightTodayDelta.textContent = formatSignedDelta(insights.todayDeltaMs);
    if (els.focusInsightWeekDelta) els.focusInsightWeekDelta.textContent = formatSignedDelta(insights.weekDeltaMs);
  }

  function toggleCollapse(i: number) {
    const t = tasks[i];
    if (!t) return;
    t.collapsed = !t.collapsed;
    save();
    render();
  }

  function openHistory(i: number) {
    const t = tasks[i];
    if (!t) return;
    const taskId = String(t.id || "");
    if (openHistoryTaskIds.has(taskId)) {
      closeHistory(taskId);
      return;
    }
    openHistoryTaskIds.add(taskId);
    ensureHistoryViewState(taskId);
    render();
  }

  function closeHistory(taskId?: string) {
    if (taskId) {
      const state = historyViewByTaskId[taskId];
      if (state?.selectionClearTimer != null) {
        window.clearTimeout(state.selectionClearTimer);
      }
      if (state?.selectionAnimRaf != null) {
        window.cancelAnimationFrame(state.selectionAnimRaf);
      }
      openHistoryTaskIds.delete(taskId);
      delete historyViewByTaskId[taskId];
    } else {
      openHistoryTaskIds.clear();
      Object.keys(historyViewByTaskId).forEach((k) => {
        const state = historyViewByTaskId[k];
        if (state?.selectionClearTimer != null) window.clearTimeout(state.selectionClearTimer);
        if (state?.selectionAnimRaf != null) window.cancelAnimationFrame(state.selectionAnimRaf);
        delete historyViewByTaskId[k];
      });
    }
    render();
  }

  function getHistoryForTask(taskId: string) {
    const arr = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    return arr.slice().sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0));
  }

  function historyPageSize(taskId?: string) {
    if (!taskId) return 7;
    const state = historyViewByTaskId[taskId];
    return state?.rangeDays || 7;
  }

  function ensureHistoryViewState(taskId: string): HistoryViewState {
    const existing = historyViewByTaskId[taskId];
    if (existing) return existing;
    const savedRangeDays = historyRangeDaysByTaskId[taskId] === 14 ? 14 : 7;
    const savedRangeMode = historyRangeModeByTaskId[taskId] === "day" ? "day" : "entries";
    const created: HistoryViewState = {
      page: 0,
      rangeDays: savedRangeDays,
      rangeMode: savedRangeMode,
      editMode: false,
      barRects: [],
      labelHitRects: [],
      lockedAbsIndexes: new Set<number>(),
      selectedAbsIndex: null,
      selectedRelIndex: null,
      selectionClearTimer: null,
      visualSelectedAbsIndex: null,
      selectionZoom: 1,
      selectionAnimRaf: null,
      slideDir: null,
    };
    historyViewByTaskId[taskId] = created;
    return created;
  }

  function startHistorySelectionAnimation(taskId: string, nextAbsIndex: number | null) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }

    const prevAbsIndex = state.visualSelectedAbsIndex;
    const switchingTarget = prevAbsIndex !== nextAbsIndex;
    const fromZoom = switchingTarget ? (nextAbsIndex == null ? state.selectionZoom : 1) : state.selectionZoom;
    const toZoom = nextAbsIndex == null ? 1 : 1.5;
    const durationMs = 180;
    const startAt = performance.now();

    if (nextAbsIndex != null) state.visualSelectedAbsIndex = nextAbsIndex;

    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - startAt) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      state.selectionZoom = fromZoom + (toZoom - fromZoom) * eased;
      renderHistory(taskId);
      if (t < 1) {
        state.selectionAnimRaf = window.requestAnimationFrame(tick);
      } else {
        state.selectionAnimRaf = null;
        state.selectionZoom = toZoom;
        if (nextAbsIndex == null) state.visualSelectedAbsIndex = null;
        renderHistory(taskId);
      }
    };

    state.selectionAnimRaf = window.requestAnimationFrame(tick);
  }

  function scheduleHistorySelectionClear(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectionClearTimer = window.setTimeout(() => {
      const next = historyViewByTaskId[taskId];
      if (!next) return;
      next.selectedAbsIndex = null;
      next.selectedRelIndex = null;
      next.selectionClearTimer = null;
      startHistorySelectionAnimation(taskId, null);
    }, 3000);
  }

  function clearHistoryChartSelection(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectedRelIndex = null;
    state.selectedAbsIndex = null;
    state.lockedAbsIndexes.clear();
    startHistorySelectionAnimation(taskId, null);
  }

  function clearHistoryLockedSelections(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    state.lockedAbsIndexes.clear();
  }

  type HistoryUI = {
    root: HTMLElement;
    canvasWrap: HTMLElement | null;
    canvas: HTMLCanvasElement | null;
    clearLocksBtn: HTMLButtonElement | null;
    rangeText: HTMLElement | null;
    olderBtn: HTMLButtonElement | null;
    newerBtn: HTMLButtonElement | null;
    trashRow: HTMLElement | null;
    deleteBtn: HTMLButtonElement | null;
  };

  function getHistoryUi(taskId: string): HistoryUI | null {
    if (!els.taskList) return null;
    const root = els.taskList.querySelector(`.task[data-task-id="${taskId}"] .historyInline`) as HTMLElement | null;
    if (!root) return null;
    return {
      root,
      canvasWrap: root.querySelector(".historyCanvasWrap"),
      canvas: root.querySelector(".historyChartInline"),
      clearLocksBtn: root.querySelector('[data-history-action="clearLocks"]'),
      rangeText: root.querySelector(".historyRangeText"),
      olderBtn: root.querySelector('[data-history-action="older"]'),
      newerBtn: root.querySelector('[data-history-action="newer"]'),
      trashRow: root.querySelector(".historyTrashRow"),
      deleteBtn: root.querySelector('[data-history-action="delete"]'),
    };
  }

  function renderHistoryTrashRow(slice: any[], absStartIndex: number, ui: HistoryUI) {
    if (!ui.trashRow) return;
    const taskId = ui.root.closest(".task")?.getAttribute("data-task-id") || "";
    const state = ensureHistoryViewState(taskId);

    if (!state.editMode) {
      ui.trashRow.style.display = "none";
      ui.trashRow.innerHTML = "";
      return;
    }

    ui.trashRow.style.display = "flex";

    const pageSize = historyPageSize(taskId);
    const buttons: string[] = [];

    for (let i = 0; i < pageSize; i++) {
      const e = slice[i];
      const absIndex = absStartIndex + i;
      const disabled = !e;

      buttons.push(
        `<button class="historyTrashBtn" type="button" data-abs="${absIndex}" ${
          disabled ? "disabled" : ""
        } aria-label="Delete log" title="Delete log">&#128465;</button>`
      );
    }

    ui.trashRow.innerHTML = buttons.join("");
  }

  function drawHistoryChart(entries: any[], absStartIndex: number, ui: HistoryUI, taskId: string) {
    const canvas = ui.canvas;
    const wrap = ui.canvasWrap;
    if (!canvas || !wrap) return;
    const state = ensureHistoryViewState(taskId);

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const compactLabels = w <= 560;
    const veryCompactLabels = w <= 420;
    const padL = 12;
    const markerLabelPadR = 10;
    const padR = 12;
    const padT = 14;
    const barCount = Math.max(1, entries.length);
    // Keep consistent label styling between 7-entry and 14-entry views.
    const useAngledLabels = true;
    const padB = useAngledLabels ? (veryCompactLabels ? 110 : 122) : compactLabels ? 84 : 72;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const labelGutterW = markerLabelPadR;
    const plotSidePad = useAngledLabels ? (veryCompactLabels ? 10 : 14) : 6;
    const plotW = Math.max(140, innerW - labelGutterW - plotSidePad * 2);
    const plotLeft = padL + plotSidePad;
    const plotRight = plotLeft + plotW;

    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, padT + innerH + 0.5);
    ctx.lineTo(plotRight, padT + innerH + 0.5);
    ctx.stroke();

    state.barRects = [];
    state.labelHitRects = [];

    if (!entries || !entries.length) {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No entries to display", padL + innerW / 2, padT + innerH / 2);
      return;
    }

    const maxEntryMs = Math.max(...entries.map((e) => e.ms || 0), 1);
    const historyTask = tasks.find((task) => String(task.id || "") === taskId) || null;
    const milestoneMs =
      historyTask && historyTask.milestonesEnabled && Array.isArray(historyTask.milestones)
        ? sortMilestones(historyTask.milestones)
            .map((m) => ({ value: +m.hours || 0, ms: Math.max(0, (+m.hours || 0) * milestoneUnitSec(historyTask) * 1000) }))
            .filter((x, i, arr) => x.ms > 0 && arr.findIndex((y) => y.ms === x.ms) === i)
        : [];
    const maxGoalMs = milestoneMs.length ? Math.max(...milestoneMs.map((m) => m.ms || 0), 0) : 0;
    const scaleMaxMs = Math.max(maxEntryMs, maxGoalMs, 1);
    const gap = barCount <= 10 ? Math.max(6, Math.floor(plotW * 0.02)) : Math.max(3, Math.floor(plotW * 0.01));
    const barW = Math.max(4, Math.floor((plotW - gap * (barCount - 1)) / barCount));

    ctx.textAlign = "center";

    const labelStep = useAngledLabels ? 1 : veryCompactLabels ? 2 : barCount <= 10 ? 1 : Math.ceil(barCount / 10);
    for (let idx = 0; idx < barCount; idx++) {
      const e = entries[idx];
      if (!e) continue;

      const ms = Math.max(0, e.ms || 0);
      const ratio = ms / scaleMaxMs;
      const bh = Math.max(2, Math.floor(innerH * ratio));
      const visualRelIndex =
        state.visualSelectedAbsIndex != null ? state.visualSelectedAbsIndex - (absStartIndex || 0) : null;
      const absIndex = (absStartIndex || 0) + idx;
      const isLocked = state.lockedAbsIndexes.has(absIndex);
      const isSelected = visualRelIndex === idx;
      const hasSelection = visualRelIndex != null || state.lockedAbsIndexes.size > 0;
      const baseX = plotLeft + idx * (barW + gap);
      const cx = baseX + barW / 2;
      // Keep bar size static; selection/lock state is indicated by accent borders and label zoom.
      const drawW = Math.max(2, Math.floor(barW));
      const drawH = Math.max(2, Math.min(innerH, Math.floor(bh)));
      const x = Math.max(plotLeft, Math.min(plotRight - drawW, Math.floor(cx - drawW / 2)));
      const y = Math.max(padT, padT + innerH - drawH);

      ctx.save();
      ctx.globalAlpha = hasSelection ? (isSelected || isLocked ? 0.98 : 0.28) : 0.92;
      const historyStaticColor = (() => {
        const t = (tasks || []).find((task) => String(task.id || "") === String(taskId));
        return t ? getModeColor(taskModeOf(t)) : "rgb(0,207,200)";
      })();
      ctx.fillStyle = dynamicColorsEnabled ? e.color || "rgb(0,207,200)" : historyStaticColor;
      ctx.fillRect(x, y, drawW, drawH);
      ctx.restore();

      const slotLeft = idx === 0 ? plotLeft : plotLeft + idx * (barW + gap) - Math.floor(gap / 2);
      const slotRight = idx === barCount - 1 ? plotRight : plotLeft + (idx + 1) * (barW + gap) - Math.floor(gap / 2);
      state.barRects[idx] = {
        x,
        y,
        w: drawW,
        h: drawH,
        absIndex: (absStartIndex || 0) + idx,
        hitX: Math.max(plotLeft, slotLeft),
        hitY: padT,
        hitW: Math.max(4, Math.min(plotRight, slotRight) - Math.max(plotLeft, slotLeft)),
        hitH: innerH,
      };

      if (isSelected || isLocked) {
        ctx.save();
        ctx.strokeStyle = isLocked ? "rgba(255,77,77,.95)" : "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, Math.max(1, drawW - 2), Math.max(1, drawH - 2));
        ctx.restore();
      }

      if (idx % labelStep === 0 || idx === barCount - 1) {
        const labelAlpha = hasSelection ? (isSelected || isLocked ? 1 : 0.28) : 1;
        ctx.save();
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = "rgba(255,255,255,.65)";
        const baseDateFont = compactLabels ? 10 : 11;
        const labelFontScale = isSelected ? 1 + ((state.selectionZoom || 1.5) - 1) : isLocked ? 1.5 : 1;
        ctx.font = `${Math.round(baseDateFont * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

        const d = new Date(e.ts || 0);
        const dd = formatTwo(d.getDate());
        const mm = formatTwo(d.getMonth() + 1);
        const hh = formatTwo(d.getHours());
        const mi = formatTwo(d.getMinutes());
        const compactDateLabel = veryCompactLabels ? `${dd}/${mm}` : compactLabels ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}:${hh}:${mi}`;
        const rawElapsedLabel = formatTime(ms);
        const compactElapsedLabel =
          veryCompactLabels && rawElapsedLabel.includes(":")
            ? rawElapsedLabel.split(":").slice(-2).join(":")
            : rawElapsedLabel;

        if (useAngledLabels) {
          const expandedLabelDrop = isSelected || isLocked ? Math.round(10 * labelFontScale) : 0;
          const tx = x + drawW / 2;
          const ty = padT + innerH + (compactLabels ? 20 : 24) + expandedLabelDrop;
          const lineStartX = x + drawW / 2;
          const lineStartY = padT + innerH + 2;
          const lineEndX = tx;
          const lineEndY = ty - 4;
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,.72)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineStartX, lineStartY);
          ctx.lineTo(lineEndX, lineEndY);
          ctx.stroke();
          ctx.restore();
          const angle = (-45 * Math.PI) / 180;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(angle);
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.font = `${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactDateLabel, 0, 0);
          ctx.fillStyle = "rgb(0,207,200)";
          ctx.font = `700 ${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactElapsedLabel, 0, Math.round(12 * labelFontScale));
          ctx.restore();
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((veryCompactLabels ? 30 : 34) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: tx - labelHitW / 2,
            y: ty - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
        } else {
          const lx = x + drawW / 2;
          const expandedLabelDrop = isSelected || isLocked ? Math.round(8 * labelFontScale) : 0;
          const line1Y = padT + innerH + (compactLabels ? 18 : 22) + expandedLabelDrop;
          const line2Y = padT + innerH + (compactLabels ? 34 : 39) + expandedLabelDrop;
          ctx.fillText(compactDateLabel, lx, line1Y);
          ctx.fillStyle = "rgb(0,207,200)";
          ctx.font = `700 ${Math.round((compactLabels ? 10 : 12) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactElapsedLabel, lx, line2Y);
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((compactLabels ? 28 : 32) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: lx - labelHitW / 2,
            y: line1Y - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
        }
        ctx.restore();
      }
    }

    if (milestoneMs.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.lineWidth = 1;

      const sortedGoals = milestoneMs.slice().sort((a, b) => b.ms - a.ms);
      const drawnLabelY: number[] = [];
      const minLabelGap = 11;

      for (const goal of sortedGoals) {
        const markerRatio = Math.max(0, Math.min(1, goal.ms / scaleMaxMs));
        const markerY = padT + innerH - Math.floor(innerH * markerRatio) + 0.5;

        ctx.beginPath();
        ctx.moveTo(plotLeft, markerY);
        ctx.lineTo(plotRight, markerY);
        ctx.stroke();

        const tooClose = drawnLabelY.some((y) => Math.abs(y - markerY) < minLabelGap);
        if (tooClose) continue;
        drawnLabelY.push(markerY);

        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${goal.value}${milestoneUnitSuffix(historyTask || undefined)}`, padL + innerW - 4, markerY);
      }
      ctx.restore();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
    }
  }

  function renderHistory(taskId: string) {
    if (!taskId) return;
    const ui = getHistoryUi(taskId);
    if (!ui) return;
    const state = ensureHistoryViewState(taskId);

    const allRaw = getHistoryForTask(taskId);
    const rangeDays = state.rangeDays || 7;
    const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
    const all = allRaw.filter((e: any) => (+e.ts || 0) >= cutoffMs);
    const localDateKey = (ts: number) => {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };
    const distinctDayCount = new Set(all.map((e: any) => localDateKey(+e.ts || 0))).size;
    const pageSize = historyPageSize(taskId);
    const isDayMode = state.rangeMode === "day";
    const groupedByDay: Array<any> = [];
    if (isDayMode) {
      const historyTask = tasks.find((task) => String(task.id || "") === String(taskId));
      all.forEach((e: any) => {
        const ts = +e.ts || 0;
        const ms = Math.max(0, +e.ms || 0);
        const key = localDateKey(ts);
        const last = groupedByDay[groupedByDay.length - 1];
        if (last && last.dayKey === key) {
          last.ms += ms;
          last.count += 1;
          if (ts >= last.ts) last.ts = ts;
        } else {
          groupedByDay.push({
            dayKey: key,
            ts,
            ms,
            count: 1,
            color: historyTask ? sessionColorForTaskMs(historyTask as any, ms) : e.color,
          });
        }
      });
    }
    const display = isDayMode ? groupedByDay : all;
    const total = display.length;

    const end = Math.max(0, total - state.page * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = display.slice(start, end);

    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (state.page > maxPage) state.page = maxPage;

    if (ui.rangeText) {
      if (total === 0) ui.rangeText.textContent = "No entries yet";
      else if (isDayMode) ui.rangeText.textContent = `Showing ${slice.length} of ${total} days (${all.length} entries)`;
      else
        ui.rangeText.textContent = `Showing ${slice.length} of ${total} entries (${distinctDayCount} ${
          distinctDayCount === 1 ? "day" : "days"
        })`;
    }

    if (ui.olderBtn) ui.olderBtn.disabled = start <= 0;
    if (ui.newerBtn) ui.newerBtn.disabled = end >= total;

    if (state.selectedAbsIndex != null) {
      const rel = state.selectedAbsIndex - start;
      if (rel >= 0 && rel < slice.length) state.selectedRelIndex = rel;
      else {
        state.selectedAbsIndex = null;
        state.selectedRelIndex = null;
      }
    } else {
      state.selectedRelIndex = null;
    }
    const hasDeleteTarget = !isDayMode && (state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0);
    if (ui.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTarget;
    if (ui.clearLocksBtn) ui.clearLocksBtn.style.display = state.lockedAbsIndexes.size > 0 ? "inline-flex" : "none";

    if (ui.canvasWrap && state.slideDir) {
      ui.canvasWrap.classList.remove("slideFromLeft", "slideFromRight");
      void ui.canvasWrap.offsetWidth;
      ui.canvasWrap.classList.add(state.slideDir === "left" ? "slideFromRight" : "slideFromLeft");
      state.slideDir = null;
    }

    drawHistoryChart(slice, start, ui, taskId);
    renderHistoryTrashRow(slice, start, ui);
    const rangeToggle = ui.root.querySelector(".historyRangeToggle") as HTMLElement | null;
    if (rangeToggle) {
      const is14 = rangeDays === 14;
      rangeToggle.classList.toggle("on", is14);
      rangeToggle.setAttribute("aria-checked", String(is14));
    }
    const rangeModeEntries = ui.root.querySelector('[data-history-range-mode="entries"]') as HTMLElement | null;
    const rangeModeDay = ui.root.querySelector('[data-history-range-mode="day"]') as HTMLElement | null;
    const isEntriesMode = state.rangeMode !== "day";
    if (rangeModeEntries) {
      rangeModeEntries.classList.toggle("isOn", isEntriesMode);
      rangeModeEntries.setAttribute("aria-pressed", String(isEntriesMode));
    }
    if (rangeModeDay) {
      rangeModeDay.classList.toggle("isOn", !isEntriesMode);
      rangeModeDay.setAttribute("aria-pressed", String(!isEntriesMode));
    }
    const analyseBtn = ui.root.querySelector('[data-history-action="analyse"]') as HTMLButtonElement | null;
    if (analyseBtn) {
      const canAnalyse = state.lockedAbsIndexes.size >= 2;
      analyseBtn.classList.toggle("isDisabled", !canAnalyse);
      analyseBtn.setAttribute("aria-disabled", String(!canAnalyse));
      analyseBtn.title = canAnalyse ? "Analysis" : "Lock at least 2 columns to analyse";
    }
  }

  function getHistoryDisplayForTask(taskId: string, state: HistoryViewState) {
    const allRaw = getHistoryForTask(taskId);
    const rangeDays = state.rangeDays || 7;
    const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
    const all = allRaw.filter((e: any) => (+e.ts || 0) >= cutoffMs);
    if (state.rangeMode !== "day") return all;

    const groupedByDay: Array<any> = [];
    const historyTask = tasks.find((task) => String(task.id || "") === String(taskId));
    const localDateKey = (ts: number) => {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };
    all.forEach((e: any) => {
      const ts = +e.ts || 0;
      const ms = Math.max(0, +e.ms || 0);
      const key = localDateKey(ts);
      const last = groupedByDay[groupedByDay.length - 1];
      if (last && last.dayKey === key) {
        last.ms += ms;
        last.count += 1;
        if (ts >= last.ts) last.ts = ts;
      } else {
        groupedByDay.push({
          dayKey: key,
          ts,
          ms,
          count: 1,
          color: historyTask ? sessionColorForTaskMs(historyTask as any, ms) : e.color,
        });
      }
    });
    return groupedByDay;
  }

  function openHistoryAnalysisModal(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.lockedAbsIndexes.size < 2) return;
    const display = getHistoryDisplayForTask(taskId, state);
    if (!display.length) return;
    const selected = Array.from(state.lockedAbsIndexes.values())
      .sort((a, b) => a - b)
      .map((idx) => display[idx])
      .filter(Boolean);
    if (selected.length < 2) return;

    const totalMs = selected.reduce((sum, e: any) => sum + Math.max(0, +e.ms || 0), 0);
    const avgMs = Math.floor(totalMs / selected.length);
    const minMs = Math.min(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const maxMs = Math.max(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const firstTs = Math.min(...selected.map((e: any) => +e.ts || 0));
    const lastTs = Math.max(...selected.map((e: any) => +e.ts || 0));
    const task = tasks.find((t) => String(t.id || "") === String(taskId));
    const taskName = (task?.name || "Task").trim() || "Task";
    const modeLabel = state.rangeMode === "day" ? "Day" : "Entries";

    if (els.historyAnalysisTitle) {
      els.historyAnalysisTitle.textContent = `History Analysis - ${taskName}`;
    }
    if (els.historyAnalysisSummary) {
      els.historyAnalysisSummary.innerHTML = `
        <p style="margin:0 0 8px">Selected columns: <b>${selected.length}</b> (${modeLabel} view)</p>
        <p style="margin:0 0 8px">Total time: <b>${formatTime(totalMs)}</b></p>
        <p style="margin:0 0 8px">Average: <b>${formatTime(avgMs)}</b></p>
        <p style="margin:0 0 8px">Min / Max: <b>${formatTime(minMs)}</b> / <b>${formatTime(maxMs)}</b></p>
        <p style="margin:0">Range: <b>${formatDateTime(firstTs)}</b> to <b>${formatDateTime(lastTs)}</b></p>
      `;
    }
    openOverlay(els.historyAnalysisOverlay as HTMLElement | null);
  }

  function resetTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    confirm("Reset Task", "Reset timer to zero?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      checkboxLabel: "Log this entry",
      checkboxChecked: true,
      onOk: () => {
        const doLog = !!els.confirmDeleteAll?.checked;

        if (doLog && canLogSession(t)) {
          const ms = getTaskElapsedMs(t);
          if (ms > 0) {
            appendHistory(t.id, { ts: nowMs(), name: t.name, ms, color: sessionColorForTaskMs(t, ms) });
          }
        }

        t.accumulatedMs = 0;
        t.running = false;
        t.startMs = null;
        t.hasStarted = false;
        resetCheckpointAlertTracking(t.id);

        save();
        render();
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function resetAll() {
    const eligibleTasks = tasks.filter((t) => canLogSession(t));

    confirm("Reset All", "Reset all timers?", {
      okLabel: "Reset",
      checkboxLabel: "Also delete all tasks",
      checkboxChecked: false,
      checkbox2Label: eligibleTasks.length ? "Log eligible sessions to History" : null,
      checkbox2Checked: eligibleTasks.length ? true : false,
      onOk: () => {
        const alsoDelete = !!els.confirmDeleteAll?.checked;
        const doLog = eligibleTasks.length ? !!els.confirmLogChk?.checked : false;

        if (doLog) {
          eligibleTasks.forEach((t) => {
            const ms = getTaskElapsedMs(t);
            if (ms > 0) {
              appendHistory(t.id, { ts: nowMs(), name: t.name, ms, color: sessionColorForTaskMs(t, ms) });
            }
          });
        }

        if (alsoDelete) {
          tasks = [];
          historyByTaskId = {};
          saveHistory(historyByTaskId);
        } else {
          tasks.forEach((t) => {
            t.accumulatedMs = 0;
            t.running = false;
            t.startMs = null;
            t.hasStarted = false;
            resetCheckpointAlertTracking(t.id);
          });
        }

        save();
        render();
        closeConfirm();
      },
    });
  }

  function openEdit(i: number) {
    const t = tasks[i];
    if (!t) return;
    editIndex = i;

    if (els.editName) els.editName.value = t.name || "";

    const elapsedMs = getElapsedMs(t);
    const totalSec = Math.floor(elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const remAfterDays = totalSec % 86400;
    const h = Math.floor(remAfterDays / 3600);
    const m = Math.floor((remAfterDays % 3600) / 60);
    const s = remAfterDays % 60;

    if (els.editD) els.editD.value = String(d);
    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);
    setEditElapsedOverrideEnabled(false);
    syncEditCheckpointAlertUi(t);
    {
      const current = taskModeOf(t);
      editMoveTargetMode = current;
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(current);
      [els.editMoveMode1, els.editMoveMode2, els.editMoveMode3].forEach((btn) => {
        if (!btn) return;
        const moveMode = btn.getAttribute("data-move-mode") as MainMode;
        const disabled = btn.getAttribute("data-move-mode") === current || !isModeEnabled(moveMode);
        btn.disabled = disabled;
        btn.classList.toggle("is-disabled", disabled);
      });
      if (els.editMoveMenu) els.editMoveMenu.open = false;
    }

    els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
    els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
    els.msArea?.classList.toggle("on", !!t.milestonesEnabled);
    setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour");

    renderMilestoneEditor(t);

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const t = editIndex != null ? tasks[editIndex] : null;

    if (saveChanges && t) {
      const prevElapsedMs = getElapsedMs(t);
      t.name = (els.editName?.value || "").trim() || t.name;

      if (isEditElapsedOverrideEnabled()) {
        const dd = Math.max(0, parseInt(els.editD?.value || "0", 10) || 0);
        const rawH = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
        const hh = isEditMilestoneUnitDay() ? Math.min(23, rawH) : rawH;
        const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
        const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));

        const newMs = (dd * 86400 + hh * 3600 + mm * 60 + ss) * 1000;

        t.accumulatedMs = newMs;
        t.startMs = t.running ? nowMs() : null;
        if (newMs < prevElapsedMs) resetCheckpointAlertTracking(t.id);
        else clearCheckpointBaseline(t.id);
      }

      t.checkpointSoundEnabled = isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      t.checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);

      t.milestones = sortMilestones(t.milestones);
      const moveMode = editMoveTargetMode || taskModeOf(t);
      if ((moveMode === "mode1" || moveMode === "mode2" || moveMode === "mode3") && isModeEnabled(moveMode)) {
        (t as any).mode = moveMode;
      }

      save();
      render();
    }

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    closeElapsedPad(false);
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    editIndex = null;
  }

  function elapsedPadLabelForInput(input: HTMLInputElement | null) {
    if (!input) return "Value";
    if (input === els.editD) return "Days";
    if (input === els.editH) return "Hours";
    if (input === els.editM) return "Minutes";
    if (input === els.editS) return "Seconds";
    return "Value";
  }

  function isEditElapsedOverrideEnabled() {
    return !!els.editOverrideElapsedToggle?.classList.contains("on");
  }

  function setEditElapsedOverrideEnabled(enabled: boolean) {
    els.editOverrideElapsedToggle?.classList.toggle("on", enabled);
    els.editOverrideElapsedToggle?.setAttribute("aria-checked", String(enabled));
    els.editOverrideElapsedFields?.classList.toggle("isDisabled", !enabled);
  }

  function elapsedPadRangeForInput(input: HTMLInputElement | null) {
    if (input === els.editD) return { min: 0, max: Number.POSITIVE_INFINITY };
    if (input === els.editH) {
      return isEditMilestoneUnitDay()
        ? { min: 0, max: 23 }
        : { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (input === els.editM || input === els.editS) return { min: 0, max: 59 };
    return { min: 0, max: 59 };
  }

  function elapsedPadErrorTextForInput(input: HTMLInputElement | null) {
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(range.max)) return `Enter a number greater than or equal to ${range.min}`;
    return `Enter a number within the range ${range.min}-${range.max}`;
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function elapsedPadValidatedValue(raw: string, input: HTMLInputElement | null) {
    const parsed = parseInt(raw || "", 10);
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(parsed) || isNaN(parsed)) return null;
    if (parsed < range.min || parsed > range.max) return null;
    return String(parsed);
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (elapsedPadDraft || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
  }

  function openElapsedPad(input: HTMLInputElement | null) {
    if (!input || !els.elapsedPadOverlay) return;
    elapsedPadMilestoneRef = null;
    elapsedPadTarget = input;
    elapsedPadOriginal = input.value || "0";
    elapsedPadDraft = elapsedPadOriginal;
    if (els.elapsedPadTitle) els.elapsedPadTitle.textContent = `Enter ${elapsedPadLabelForInput(input)}`;
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    if (!els.elapsedPadOverlay) return;
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = { task, milestone, ms, onApplied };
    elapsedPadOriginal = String(+milestone.hours || 0);
    elapsedPadDraft = elapsedPadOriginal;
    if (els.elapsedPadTitle) els.elapsedPadTitle.textContent = "Set Checkpoint <days> <hours> <minutes>";
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function closeElapsedPad(applyValue: boolean) {
    if (applyValue && (elapsedPadTarget || elapsedPadMilestoneRef)) {
      const valid =
        elapsedPadMilestoneRef && !elapsedPadTarget
          ? (() => {
              const parsed = parseInt(elapsedPadDraft || "", 10);
              if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) return null;
              return String(parsed);
            })()
          : elapsedPadValidatedValue(elapsedPadDraft, elapsedPadTarget);
      if (valid == null) {
        setElapsedPadError(
          elapsedPadMilestoneRef && !elapsedPadTarget
            ? "Enter a valid number"
            : elapsedPadErrorTextForInput(elapsedPadTarget)
        );
        return;
      }
      if (elapsedPadTarget) {
        elapsedPadTarget.value = valid;
      } else if (elapsedPadMilestoneRef) {
        elapsedPadMilestoneRef.milestone.hours = Number(valid);
        elapsedPadMilestoneRef.task.milestones = elapsedPadMilestoneRef.ms;
        if (elapsedPadMilestoneRef.onApplied) elapsedPadMilestoneRef.onApplied();
        else renderMilestoneEditor(elapsedPadMilestoneRef.task);
      }
    } else if (!applyValue && elapsedPadTarget) {
      elapsedPadTarget.value = elapsedPadOriginal;
    }
    clearElapsedPadError();
    if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "none";
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = null;
    elapsedPadDraft = "";
    elapsedPadOriginal = "";
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const next = `${elapsedPadDraft || ""}${digit}`.replace(/^0+(?=\d)/, "");
    elapsedPadDraft = next.slice(0, 6) || "0";
    renderElapsedPadDisplay();
  }

  function padBackspace() {
    clearElapsedPadError();
    const next = (elapsedPadDraft || "").slice(0, -1);
    elapsedPadDraft = next || "0";
    renderElapsedPadDisplay();
  }

  function padClear() {
    clearElapsedPadError();
    elapsedPadDraft = "0";
    renderElapsedPadDisplay();
  }

  function nextDuplicateName(originalName: string) {
    const name = (originalName || "Task").trim();
    const root = name.replace(/\s\d+$/, "").trim();
    let maxN = 0;

    tasks.forEach((t) => {
      const n = (t.name || "").trim();
      if (n === root) return;
      const mm = n.match(new RegExp("^" + escapeRegExp(root) + "\\s(\\d+)$"));
      if (mm) {
        const v = parseInt(mm[1], 10);
        if (!isNaN(v)) maxN = Math.max(maxN, v);
      }
    });

    return root + " " + (maxN + 1);
  }

  function duplicateTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    const newId = newTaskId();
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = newId;
    copy.name = nextDuplicateName(t.name);

    copy.running = false;
    copy.startMs = null;

    tasks.splice(i + 1, 0, copy);

    const h = historyByTaskId && historyByTaskId[t.id] ? JSON.parse(JSON.stringify(historyByTaskId[t.id])) : [];
    historyByTaskId[newId] = h;

    saveHistory(historyByTaskId);
    save();
    render();
  }

  function deleteTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    confirm("Delete Task", `Delete "${t.name}"?`, {
      okLabel: "Delete",
      cancelLabel: "Cancel",
      checkboxLabel: "Delete history logs",
      checkboxChecked: true,
      onOk: () => {
        const deleteHistory = !!els.confirmDeleteAll?.checked;

        tasks.splice(i, 1);

        if (deleteHistory) {
          if (historyByTaskId && historyByTaskId[t.id]) delete historyByTaskId[t.id];
          if (deletedTaskMeta && (deletedTaskMeta as any)[t.id]) delete (deletedTaskMeta as any)[t.id];
          saveHistory(historyByTaskId);

          if (deletedTaskMeta && (deletedTaskMeta as any)[t.id]) delete (deletedTaskMeta as any)[t.id];
          saveDeletedMeta(deletedTaskMeta);
        } else {
          deletedTaskMeta = deletedTaskMeta || ({} as DeletedTaskMeta);
          (deletedTaskMeta as any)[t.id] = { name: t.name, color: t.color || null, deletedAt: nowMs() };
          saveDeletedMeta(deletedTaskMeta);
          saveHistory(historyByTaskId);
        }

        save();
        render();
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function getTaskMetaForHistoryId(taskId: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (t) return { name: t.name, color: (t as any).color, deleted: false };

    const dm = deletedTaskMeta && (deletedTaskMeta as any)[taskId];
    if (dm) return { name: dm.name || "Deleted Task", color: dm.color || null, deleted: true };

    const arr = historyByTaskId && historyByTaskId[taskId];
    if (arr && arr.length) {
      const e = arr[arr.length - 1] as any;
      return { name: e.name || "Deleted Task", color: e.color || null, deleted: true };
    }

    return { name: "Deleted Task", color: null, deleted: true };
  }

  function escapeHtmlHM(str: any) {
    return String(str || "").replace(/[&<>"']/g, (s) => {
      const map: any = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[s];
    });
  }

  function syncHistoryManagerBulkUi() {
    if (els.historyManagerBulkBtn) {
      els.historyManagerBulkBtn.textContent = "Bulk Edit";
      els.historyManagerBulkBtn.classList.toggle("btn-accent", hmBulkEditMode);
      els.historyManagerBulkBtn.classList.toggle("btn-ghost", !hmBulkEditMode);
    }
    if (els.historyManagerBulkDeleteBtn) {
      const count = hmBulkSelectedRows.size;
      if (hmBulkEditMode && count > 0) {
        els.historyManagerBulkDeleteBtn.style.display = "";
        els.historyManagerBulkDeleteBtn.textContent = count === 1 ? "Delete (1)" : `Delete (${count})`;
      } else {
        els.historyManagerBulkDeleteBtn.style.display = "none";
      }
    }
  }

  function renderHistoryManager() {
    const listEl = document.getElementById("hmList");
    if (!listEl) return;
    if (listEl.children.length) {
      const nextTaskGroups = new Set<string>();
      const nextDateGroups = new Set<string>();
      listEl.querySelectorAll(".hmGroup[data-task]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        if (taskId && (el as HTMLDetailsElement).open) nextTaskGroups.add(taskId);
      });
      listEl.querySelectorAll(".hmDateGroup[data-task][data-date]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        const dateKey = (el as HTMLElement).getAttribute("data-date");
        if (taskId && dateKey && (el as HTMLDetailsElement).open) nextDateGroups.add(`${taskId}|${dateKey}`);
      });
      hmExpandedTaskGroups = nextTaskGroups;
      hmExpandedDateGroups = nextDateGroups;
    }
    hmRowsByTask = {};
    hmRowsByTaskDate = {};
    const taskIdFilter = (() => {
      try {
        const p = new URLSearchParams(window.location.search);
        const raw = (p.get("taskId") || "").trim();
        return raw || null;
      } catch {
        return null;
      }
    })();

    let hb: Record<string, any[]> = {};
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      hb = raw ? JSON.parse(raw) : {};
      if (!hb || typeof hb !== "object") hb = {};
    } catch {
      hb = {};
    }

    const idsWithHistory = Object.keys(hb || {}).filter((id) => {
      const arr = (hb as any)[id];
      return Array.isArray(arr) && arr.length;
    });
    const filteredIds = taskIdFilter ? idsWithHistory.filter((id) => String(id) === String(taskIdFilter)) : idsWithHistory;

    if (!filteredIds.length) {
      listEl.innerHTML = taskIdFilter
        ? `<div class="hmEmpty">No history entries found for this task.</div>`
        : `<div class="hmEmpty">No history entries found.</div>`;
      return;
    }

    const currentOrder = (tasks || []).map((t) => String(t.id));
    filteredIds.sort((a, b) => {
      const ai = currentOrder.indexOf(String(a));
      const bi = currentOrder.indexOf(String(b));
      const aIsCurrent = ai !== -1;
      const bIsCurrent = bi !== -1;
      if (aIsCurrent && bIsCurrent) return ai - bi;
      if (aIsCurrent) return -1;
      if (bIsCurrent) return 1;
      const ar = (hb as any)[a][(hb as any)[a].length - 1]?.ts || 0;
      const br = (hb as any)[b][(hb as any)[b].length - 1]?.ts || 0;
      return br - ar;
    });

    const groups = filteredIds
      .map((taskId) => {
        const meta = getTaskMetaForHistoryId(taskId);
        const arr = ((hb as any)[taskId] || []).slice().sort((x: any, y: any) => (y.ts || 0) - (x.ts || 0));
        const localDateKey = (ts: number) => {
          const d = new Date(ts);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const da = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${da}`;
        };
        const localDateLabel = (key: string) => {
          const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
          const dt = new Date(y, (m || 1) - 1, d || 1);
          try {
            return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
          } catch {
            return key;
          }
        };

        const rowsByDate: Record<string, any[]> = {};
        arr.forEach((e: any) => {
          const key = localDateKey(+e.ts || 0);
          if (!rowsByDate[key]) rowsByDate[key] = [];
          rowsByDate[key].push(e);
        });

        const dateGroupsHtml = Object.keys(rowsByDate)
          .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
          .map((dateKey) => {
            const entries = (rowsByDate[dateKey] || []).slice().sort((a: any, b: any) => {
              const av = hmSortKey === "ms" ? +a.ms || 0 : +a.ts || 0;
              const bv = hmSortKey === "ms" ? +b.ms || 0 : +b.ts || 0;
              return hmSortDir === "asc" ? av - bv : bv - av;
            });
            const rowIds = entries.map((e: any) => `${taskId}|${e.ts}|${e.ms}|${String(e.name || "")}`);
            hmRowsByTaskDate[`${taskId}|${dateKey}`] = rowIds;
            hmRowsByTask[taskId] = (hmRowsByTask[taskId] || []).concat(rowIds);
            const dateChecked = rowIds.length > 0 && rowIds.every((id) => hmBulkSelectedRows.has(id));
            const rows = entries
              .map((e: any) => {
                const dt = formatDateTime(e.ts);
                const tm = formatTime(e.ms || 0);
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                const rowId = `${taskId}|${rowKey}`;
                const rowCheckbox = hmBulkEditMode
                  ? `<input class="hmBulkCheckbox hmBulkRowChk" type="checkbox" data-task="${taskId}" data-key="${escapeHtmlHM(
                      rowKey
                    )}" ${hmBulkSelectedRows.has(rowId) ? "checked" : ""} />`
                  : "";
                return `
                  <tr>
                    <td class="hmSelectCell">${rowCheckbox}</td>
                    <td>${dt}</td>
                    <td>${tm}</td>
                    <td style="text-align:right;">
                      <button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(
                  rowKey
                )}" aria-label="Delete log" title="Delete log">&#128465;</button>
                    </td>
                  </tr>
                `;
              })
              .join("");
            const dateOpen = hmExpandedDateGroups.has(`${taskId}|${dateKey}`) ? " open" : "";
            const dateSortArrow = hmSortKey === "ts" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const elapsedSortArrow = hmSortKey === "ms" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const dateCheckbox = hmBulkEditMode
              ? `<input class="hmBulkCheckbox hmBulkDateChk" type="checkbox" data-task="${taskId}" data-date="${dateKey}" ${
                  dateChecked ? "checked" : ""
                } />`
              : "";
            return `
              <details class="hmDateGroup" data-task="${taskId}" data-date="${dateKey}"${dateOpen}>
                <summary class="hmDateHeading">${dateCheckbox}${escapeHtmlHM(localDateLabel(dateKey))}</summary>
                <table class="hmTable" role="table">
                  <thead>
                    <tr>
                      <th class="hmSelectHead"></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ts">Date/Time${dateSortArrow}</button></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ms">Elapsed${elapsedSortArrow}</button></th>
                      <th style="text-align:right;">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </details>
            `;
          })
          .join("");

        const swatch = `<span class="hmExpandIcon" aria-hidden="true"></span>`;
        const badge = meta.deleted ? `<span class="hmBadge deleted">Deleted</span>` : ``;
        const taskRows = hmRowsByTask[taskId] || [];
        const taskChecked = taskRows.length > 0 && taskRows.every((id) => hmBulkSelectedRows.has(id));
        const taskCheckbox = hmBulkEditMode
          ? `<input class="hmBulkCheckbox hmBulkTaskChk" type="checkbox" data-task="${taskId}" ${
              taskChecked ? "checked" : ""
            } />`
          : "";

        const taskOpen = hmExpandedTaskGroups.has(String(taskId)) ? " open" : "";
        return `
          <details class="hmGroup" data-task="${taskId}"${taskOpen}>
            <summary class="hmSummary">
              <div class="hmTitleRow">
                ${taskCheckbox}
                ${swatch}
                <div class="hmTaskName">${escapeHtmlHM(meta.name || "Task")}</div>
                ${badge}
              </div>
              <div class="hmCount">${arr.length} logs</div>
            </summary>

            ${dateGroupsHtml}
          </details>
        `;
      })
      .join("");

    listEl.innerHTML = groups;
    const validRowIds = new Set<string>();
    Object.values(hmRowsByTask).forEach((ids) => ids.forEach((id) => validRowIds.add(id)));
    hmBulkSelectedRows.forEach((id) => {
      if (!validRowIds.has(id)) hmBulkSelectedRows.delete(id);
    });
    syncHistoryManagerBulkUi();
  }

  function openHistoryManager() {
    if (els.menuOverlay) (els.menuOverlay as HTMLElement).style.display = "none";
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "block";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    renderHistoryManager();
  }

  function closeHistoryManager() {
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "none";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    hmExpandedTaskGroups = new Set<string>();
    hmExpandedDateGroups = new Set<string>();
    hmBulkEditMode = false;
    hmBulkSelectedRows = new Set<string>();
    hmRowsByTask = {};
    hmRowsByTaskDate = {};
    syncHistoryManagerBulkUi();
  }

  function openFocusMode(i: number) {
    const t = tasks[i];
    if (!t) return;
    focusModeTaskId = t.id;
    focusModeTaskName = (t.name || "").trim();
    if (els.focusTaskName) els.focusTaskName.textContent = focusModeTaskName || "Task";
    focusCheckpointSig = "";
    updateFocusDial(t);
    syncFocusRunButtons(t);
    updateFocusInsights(t);
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
  }

  function closeFocusMode() {
    focusModeTaskId = null;
    focusModeTaskName = "";
    focusShowCheckpoints = true;
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "none";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    if (els.focusTaskName) els.focusTaskName.textContent = "Task";
    if (els.focusTimerDays) els.focusTimerDays.textContent = "00d";
    if (els.focusTimerClock) els.focusTimerClock.textContent = "00:00:00";
    if (els.focusDial) {
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress", "0%");
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-color", fillBackgroundForPct(0));
    }
    if (els.focusCheckpointRing) (els.focusCheckpointRing as HTMLElement).innerHTML = "";
    if (els.focusCheckpointRing) (els.focusCheckpointRing as HTMLElement).style.display = "block";
    focusCheckpointSig = "";
    syncFocusRunButtons(null);
    if (els.focusInsightBest) els.focusInsightBest.textContent = "--";
    if (els.focusInsightWeekday) {
      els.focusInsightWeekday.textContent = "Need at least 14 logged days";
      els.focusInsightWeekday.classList.add("is-empty");
    }
    if (els.focusInsightTodayDelta) els.focusInsightTodayDelta.textContent = "--";
    if (els.focusInsightWeekDelta) els.focusInsightWeekDelta.textContent = "--";
  }

  function hasFocusCheckpoints(t: Task): boolean {
    return !!(t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.some((m) => (+m.hours || 0) > 0));
  }

  function syncFocusCheckpointToggle(t: Task) {
    const hasCp = hasFocusCheckpoints(t);
    const effectiveOn = hasCp ? focusShowCheckpoints : false;
    if (els.focusCheckpointToggle) {
      els.focusCheckpointToggle.classList.toggle("on", effectiveOn);
      els.focusCheckpointToggle.setAttribute("aria-checked", String(effectiveOn));
      els.focusCheckpointToggle.classList.toggle("opaque", !hasCp);
    }
    if (els.focusCheckpointRing) {
      (els.focusCheckpointRing as HTMLElement).style.display = effectiveOn ? "block" : "none";
    }
  }

  function formatFocusElapsed(ms: number): { daysText: string; clockText: string; showDays: boolean } {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return {
      daysText: `${formatTwo(days)}d`,
      clockText: `${formatTwo(hours)}:${formatTwo(minutes)}:${formatTwo(seconds)}`,
      showDays: days >= 1,
    };
  }

  function formatMainTaskElapsed(ms: number): string {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${formatTwo(days)} ${formatTwo(hours)} ${formatTwo(minutes)} ${formatTwo(seconds)}`;
  }

  function formatMainTaskElapsedHtml(ms: number, isRunning = false): string {
    const parts = formatMainTaskElapsed(ms).split(" ");
    const panelStateClass = !isRunning ? " isStopped" : "";
    return `
      <span class="timePanel${panelStateClass}">
        <span class="timeChunk"><span class="timeBoxValue"><span class="timeBoxNum">${parts[0]}</span><span class="timeBoxUnit">D</span></span></span>
        <span class="timeChunk"><span class="timeBoxValue"><span class="timeBoxNum">${parts[1]}</span><span class="timeBoxUnit">H</span></span></span>
        <span class="timeChunk"><span class="timeBoxValue"><span class="timeBoxNum">${parts[2]}</span><span class="timeBoxUnit">M</span></span></span>
        <span class="timeChunk"><span class="timeBoxValue"><span class="timeBoxNum">${parts[3]}</span><span class="timeBoxUnit">S</span></span></span>
      </span>
    `;
  }

  function updateFocusDial(t: Task) {
    const elapsedMs = getElapsedMs(t);
    const elapsedSec = elapsedMs / 1000;
    if (els.focusTaskName) els.focusTaskName.textContent = (t.name || "").trim() || focusModeTaskName || "Task";
    const f = formatFocusElapsed(elapsedMs);
    if (els.focusTimerDays) {
      els.focusTimerDays.textContent = f.daysText;
      (els.focusTimerDays as HTMLElement).style.display = f.showDays ? "block" : "none";
    }
    if (els.focusTimerClock) els.focusTimerClock.textContent = f.clockText;
    syncFocusRunButtons(t);
    updateFocusInsights(t);

    const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
    syncFocusCheckpointToggle(t);
    const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
    const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
    const maxSec = Math.max(maxValue * milestoneUnitSec(t), 1);
    const pct = hasMilestones ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;
    if (els.focusDial) {
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress", `${pct}%`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-color", fillBackgroundForPct(pct));
    }

    if (!els.focusCheckpointRing) return;
    if (!hasMilestones || maxValue <= 0) {
      (els.focusCheckpointRing as HTMLElement).innerHTML = "";
      focusCheckpointSig = "";
      return;
    }

    const dialPx = Math.max(1, Math.round((els.focusDial as HTMLElement | null)?.getBoundingClientRect().width || 0));
    const sig = `${t.milestoneTimeUnit || "hour"}|${dialPx}|${msSorted.map((m) => `${+m.hours || 0}:${m.description || ""}`).join(",")}`;
    if (sig !== focusCheckpointSig) {
      const parseConicStartDeg = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 0;
        const bg = window.getComputedStyle(progressEl).backgroundImage || "";
        const m = bg.match(/conic-gradient\(\s*from\s*([-\d.]+)deg/i);
        return m ? Number(m[1]) || 0 : 0;
      };
      const parseRingCenterRatio = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 0.82;
        const cs = window.getComputedStyle(progressEl);
        const mask = (cs.maskImage || (cs as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || "").toLowerCase();
        const pct = [...mask.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
        if (pct.length < 2) return 0.82;
        const centerHolePct = (pct[0] + pct[1]) / 2;
        return Math.max(0, Math.min(1, (centerHolePct + 100) / 200));
      };
      const dialRadiusPx = dialPx / 2;
      const ringInsetPx = 26;
      const progressBoxRadiusPx = Math.max(0, dialRadiusPx - ringInsetPx);
      const markerRadiusPx = Math.max(0, progressBoxRadiusPx * parseRingCenterRatio());
      const outerRingRadiusPx = Math.max(0, dialRadiusPx - 2);
      const markerLineLenPx = Math.max(4, outerRingRadiusPx - markerRadiusPx);
      const labelRadiusPx = dialRadiusPx + 18;
      const ringStartCssDeg = parseConicStartDeg();

      const dots = msSorted
        .filter((m) => (+m.hours || 0) > 0)
        .map((m) => {
          const v = +m.hours || 0;
          const secTarget = v * milestoneUnitSec(t);
          const ratioFromStart = Math.max(0, Math.min(1, secTarget / maxSec));
          const checkpointCssDeg = ringStartCssDeg + ratioFromStart * 360;
          const theta = (checkpointCssDeg * Math.PI) / 180;
          const mx = Math.sin(theta) * markerRadiusPx;
          const my = -Math.cos(theta) * markerRadiusPx;
          const markerAngleDeg = checkpointCssDeg - 90;
          const isRight = mx >= 0;
          const radialGapPx = 34;
          let lx = mx + Math.sin(theta) * radialGapPx;
          let ly = my - Math.cos(theta) * radialGapPx;
          const labelDist = Math.sqrt(lx * lx + ly * ly) || 1;
          const minOutsideRadius = labelRadiusPx + 12;
          if (labelDist < minOutsideRadius) {
            const k = minOutsideRadius / labelDist;
            lx *= k;
            ly *= k;
          }
          const fx = lx;
          const fy = ly;
          const lineText = `${v}${milestoneUnitSuffix(t)}`;
          return `
            <div class="focusCheckpointMark" style="--mxpx:${mx}px;--mypx:${my}px;--madeg:${markerAngleDeg}deg;--mlpx:${markerLineLenPx}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointFlag" style="--fxpx:${fx}px;--fypx:${fy}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointLabel ${isRight ? "right" : "left"}" style="--lxpx:${lx}px;--lypx:${ly}px" data-seconds="${secTarget}">
              <span class="focusCheckpointLabelTitle">${escapeHtmlUI(lineText)}</span>
            </div>
          `;
        })
        .join("");
      (els.focusCheckpointRing as HTMLElement).innerHTML = dots;
      focusCheckpointSig = sig;
    }

    (els.focusCheckpointRing as HTMLElement)
      .querySelectorAll(".focusCheckpointMark, .focusCheckpointFlag, .focusCheckpointLabel, .focusCheckpointConnector")
      .forEach((dot) => {
      const secTarget = Number((dot as HTMLElement).dataset.seconds || "0");
      (dot as HTMLElement).classList.toggle("reached", elapsedSec >= secTarget);
      });
  }

  function openPopup(which: string) {
    if (which === "historyManager") {
      openHistoryManager();
      return;
    }
    if (which === "howto") {
      window.location.href = appRoute("/tasktimer/user-guide");
      return;
    }
    if (which === "categoryManager") {
      syncModeLabelsUi();
    }
    if (which === "taskSettings") {
      syncTaskSettingsUi();
    }

    closeOverlay(els.menuOverlay as HTMLElement | null);

    const map: Record<string, HTMLElement | null> = {
      about: els.aboutOverlay as HTMLElement | null,
      howto: els.howtoOverlay as HTMLElement | null,
      appearance: els.appearanceOverlay as HTMLElement | null,
      taskSettings: els.taskSettingsOverlay as HTMLElement | null,
      categoryManager: els.categoryManagerOverlay as HTMLElement | null,
      contact: els.contactOverlay as HTMLElement | null,
    };

    if (map[which]) openOverlay(map[which]);
  }

  function applyTheme(mode: "light" | "dark") {
    themeMode = mode;
    const body = document.body;
    body.setAttribute("data-theme", mode);
    const isDark = mode === "dark";
    els.themeToggle?.classList.toggle("on", isDark);
    els.themeToggle?.setAttribute("aria-checked", String(isDark));
  }

  function loadThemePreference() {
    let mode: "light" | "dark" = "dark";
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "light" || raw === "dark") mode = raw;
    } catch {
      // ignore
    }
    applyTheme(mode);
  }

  function loadAddTaskCustomNames() {
    try {
      const raw = localStorage.getItem(ADD_TASK_CUSTOM_KEY);
      addTaskCustomNames = parseRecentCustomTaskNames(raw, 5);
    } catch {
      addTaskCustomNames = [];
    }
  }

  function loadDefaultTaskTimerFormat() {
    let next: "day" | "hour" | "minute" = "hour";
    try {
      const raw = (localStorage.getItem(DEFAULT_TASK_TIMER_FORMAT_KEY) || "").trim();
      if (raw === "day" || raw === "hour" || raw === "minute") next = raw;
    } catch {
      // ignore
    }
    defaultTaskTimerFormat = next;
  }

  function saveDefaultTaskTimerFormat() {
    try {
      localStorage.setItem(DEFAULT_TASK_TIMER_FORMAT_KEY, defaultTaskTimerFormat);
    } catch {
      // ignore
    }
  }

  function toggleSwitchElement(el: HTMLElement | null | undefined, enabled: boolean) {
    el?.classList.toggle("on", enabled);
    el?.setAttribute("aria-checked", String(enabled));
  }

  function isSwitchOn(el: HTMLElement | null | undefined) {
    return !!el?.classList.contains("on");
  }

  function syncTaskSettingsUi() {
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, dynamicColorsEnabled);
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, checkpointAlertSoundEnabled);
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, checkpointAlertToastEnabled);
    if (editIndex != null && tasks[editIndex]) syncEditCheckpointAlertUi(tasks[editIndex]);
  }

  function loadDynamicColorsSetting() {
    let next = true;
    try {
      const raw = (localStorage.getItem(DYNAMIC_COLORS_KEY) || "").trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "off") next = false;
      else if (raw === "true" || raw === "1" || raw === "on") next = true;
    } catch {
      // ignore
    }
    dynamicColorsEnabled = next;
  }

  function saveDynamicColorsSetting() {
    try {
      localStorage.setItem(DYNAMIC_COLORS_KEY, dynamicColorsEnabled ? "true" : "false");
    } catch {
      // ignore
    }
  }

  function loadCheckpointAlertSettings() {
    let soundNext = true;
    let toastNext = true;
    try {
      const raw = (localStorage.getItem(CHECKPOINT_ALERT_SOUND_KEY) || "").trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "off") soundNext = false;
      else if (raw === "true" || raw === "1" || raw === "on") soundNext = true;
    } catch {
      // ignore
    }
    try {
      const raw = (localStorage.getItem(CHECKPOINT_ALERT_TOAST_KEY) || "").trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "off") toastNext = false;
      else if (raw === "true" || raw === "1" || raw === "on") toastNext = true;
    } catch {
      // ignore
    }
    checkpointAlertSoundEnabled = soundNext;
    checkpointAlertToastEnabled = toastNext;
  }

  function saveCheckpointAlertSettings() {
    try {
      localStorage.setItem(CHECKPOINT_ALERT_SOUND_KEY, checkpointAlertSoundEnabled ? "true" : "false");
      localStorage.setItem(CHECKPOINT_ALERT_TOAST_KEY, checkpointAlertToastEnabled ? "true" : "false");
    } catch {
      // ignore
    }
  }

  function checkpointKeyForTask(m: { hours: number; description: string }, t: Task) {
    const unitSeconds = milestoneUnitSec(t);
    const targetSec = Math.max(0, Math.round((+m.hours || 0) * unitSeconds));
    const label = String(m.description || "").trim();
    return `${targetSec}|${label}`;
  }

  function resetCheckpointAlertTracking(taskId: string | null | undefined, opts?: { clearBaseline?: boolean }) {
    const id = String(taskId || "");
    if (!id) return;
    delete checkpointFiredKeysByTaskId[id];
    if (opts?.clearBaseline !== false) delete checkpointBaselineSecByTaskId[id];
  }

  function clearCheckpointBaseline(taskId: string | null | undefined) {
    const id = String(taskId || "");
    if (!id) return;
    delete checkpointBaselineSecByTaskId[id];
  }

  function getCheckpointFiredSet(taskId: string) {
    if (!checkpointFiredKeysByTaskId[taskId]) checkpointFiredKeysByTaskId[taskId] = new Set<string>();
    return checkpointFiredKeysByTaskId[taskId];
  }

  function ensureCheckpointBeepAudio() {
    if (checkpointBeepAudio) return checkpointBeepAudio;
    try {
      checkpointBeepAudio = new Audio("/checkpoint-beep.wav");
      checkpointBeepAudio.preload = "auto";
    } catch {
      checkpointBeepAudio = null;
    }
    return checkpointBeepAudio;
  }

  function playCheckpointBeep() {
    const audio = ensureCheckpointBeepAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      // ignore playback restrictions
    }
  }

  function flushCheckpointBeepQueue() {
    if (checkpointBeepQueueCount <= 0) {
      checkpointBeepQueueCount = 0;
      checkpointBeepQueueTimer = null;
      return;
    }
    playCheckpointBeep();
    checkpointBeepQueueCount -= 1;
    if (checkpointBeepQueueCount > 0) checkpointBeepQueueTimer = window.setTimeout(flushCheckpointBeepQueue, 150);
    else checkpointBeepQueueTimer = null;
  }

  function enqueueCheckpointBeeps(count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    checkpointBeepQueueCount += Math.floor(count);
    if (checkpointBeepQueueTimer == null) flushCheckpointBeepQueue();
  }

  function renderCheckpointToast() {
    const host = els.checkpointToastHost as HTMLElement | null;
    if (!host) return;
    if (!activeCheckpointToast) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `
      <div class="checkpointToast" data-toast-id="${escapeHtmlUI(activeCheckpointToast.id)}" role="status">
        <p class="checkpointToastTitle">${escapeHtmlUI(activeCheckpointToast.title)}</p>
        <button class="btn btn-ghost small checkpointToastClose" type="button" data-action="closeCheckpointToast" aria-label="Close alert">Exit</button>
        <p class="checkpointToastText">${escapeHtmlUI(activeCheckpointToast.text)}</p>
      </div>
    `;
  }

  function showNextCheckpointToast() {
    if (activeCheckpointToast || checkpointToastQueue.length === 0) return;
    activeCheckpointToast = checkpointToastQueue.shift() || null;
    renderCheckpointToast();
    if (checkpointToastAutoCloseTimer != null) window.clearTimeout(checkpointToastAutoCloseTimer);
    checkpointToastAutoCloseTimer = window.setTimeout(() => {
      dismissCheckpointToast();
    }, 5000);
  }

  function dismissCheckpointToast() {
    if (checkpointToastAutoCloseTimer != null) {
      window.clearTimeout(checkpointToastAutoCloseTimer);
      checkpointToastAutoCloseTimer = null;
    }
    activeCheckpointToast = null;
    renderCheckpointToast();
    if (checkpointToastQueue.length) {
      window.setTimeout(showNextCheckpointToast, 50);
    }
  }

  function enqueueCheckpointToast(title: string, text: string) {
    checkpointToastQueue.push({ id: `${Date.now()}-${Math.random()}`, title, text });
    showNextCheckpointToast();
  }

  function formatCheckpointAlertText(task: Task, milestone: { hours: number; description: string }) {
    const targetMs = Math.max(0, (+milestone.hours || 0) * milestoneUnitSec(task) * 1000);
    const label = String(milestone.description || "").trim();
    return label ? `${formatTime(targetMs)} - ${label}` : formatTime(targetMs);
  }

  function syncEditCheckpointAlertUi(t: Task) {
    toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, !!t.checkpointSoundEnabled);
    toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, !!t.checkpointToastEnabled);
    els.editCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointAlertSoundEnabled);
    els.editCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointAlertToastEnabled);
    const notes: string[] = [];
    if (!checkpointAlertSoundEnabled) notes.push("sound alerts are disabled globally");
    if (!checkpointAlertToastEnabled) notes.push("toast alerts are disabled globally");
    if (els.editCheckpointAlertsNote) {
      if (notes.length) {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "block";
        els.editCheckpointAlertsNote.textContent = `Checkpoint ${notes.join(" and ")}.`;
      } else {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "none";
        els.editCheckpointAlertsNote.textContent = "";
      }
    }
  }

  function processCheckpointAlertsForTask(t: Task, elapsedSecNow: number) {
    const taskId = String(t.id || "");
    if (!taskId || !t.running) {
      if (taskId) clearCheckpointBaseline(taskId);
      return;
    }
    if (!t.milestonesEnabled || !Array.isArray(t.milestones) || t.milestones.length === 0) {
      checkpointBaselineSecByTaskId[taskId] = Math.floor(elapsedSecNow);
      return;
    }

    const elapsedWholeSec = Math.floor(Math.max(0, elapsedSecNow));
    const prevBaseline = checkpointBaselineSecByTaskId[taskId];
    if (!Number.isFinite(prevBaseline)) {
      checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
      return;
    }
    if (elapsedWholeSec <= prevBaseline) {
      checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
      return;
    }

    const fired = getCheckpointFiredSet(taskId);
    const msSorted = sortMilestones((t.milestones || []).slice());
    let beepCount = 0;
    msSorted.forEach((m) => {
      const targetSec = Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec(t)));
      if (targetSec <= 0) return;
      if (targetSec <= prevBaseline || targetSec > elapsedWholeSec) return;
      const key = checkpointKeyForTask(m, t);
      if (fired.has(key)) return;
      fired.add(key);
      const text = formatCheckpointAlertText(t, m);
      if (checkpointAlertToastEnabled && t.checkpointToastEnabled) {
        enqueueCheckpointToast("Checkpoint Reached", text);
      }
      if (checkpointAlertSoundEnabled && t.checkpointSoundEnabled) {
        beepCount += 1;
      }
    });
    checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
    if (beepCount > 0) enqueueCheckpointBeeps(beepCount);
  }

  function saveAddTaskCustomNames() {
    try {
      localStorage.setItem(ADD_TASK_CUSTOM_KEY, JSON.stringify(addTaskCustomNames.slice(0, 5)));
    } catch {
      // ignore
    }
  }

  function loadPinnedHistoryTaskIds() {
    try {
      const raw = localStorage.getItem(PINNED_HISTORY_KEY);
      const parsed = safeJsonParse(raw || "");
      if (!Array.isArray(parsed)) {
        pinnedHistoryTaskIds = new Set<string>();
        return;
      }
      pinnedHistoryTaskIds = new Set<string>(parsed.map((v) => String(v || "").trim()).filter(Boolean));
    } catch {
      pinnedHistoryTaskIds = new Set<string>();
    }
  }

  function savePinnedHistoryTaskIds() {
    try {
      localStorage.setItem(PINNED_HISTORY_KEY, JSON.stringify(Array.from(pinnedHistoryTaskIds)));
    } catch {
      // ignore
    }
  }

  function rememberCustomTaskName(name: string) {
    addTaskCustomNames = rememberRecentCustomTaskName(name, addTaskCustomNames, ADD_TASK_PRESET_NAMES, 5);
    saveAddTaskCustomNames();
  }

  function setAddTaskNameMenuOpen(open: boolean) {
    if (!els.addTaskNameMenu) return;
    (els.addTaskNameMenu as HTMLElement).style.display = open ? "block" : "none";
  }

  function renderAddTaskNameMenu(filterText = "") {
    const { custom, presets } = filterTaskNameOptions(addTaskCustomNames, ADD_TASK_PRESET_NAMES, filterText);

    if (els.addTaskNameCustomList) {
      els.addTaskNameCustomList.innerHTML = custom
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${escapeHtmlUI(name)}">${escapeHtmlUI(name)}</button>`)
        .join("");
    }
    if (els.addTaskNamePresetList) {
      els.addTaskNamePresetList.innerHTML = presets
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${escapeHtmlUI(name)}">${escapeHtmlUI(name)}</button>`)
        .join("");
    }
    const hasCustom = custom.length > 0;
    if (els.addTaskNameCustomTitle) (els.addTaskNameCustomTitle as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNameDivider) (els.addTaskNameDivider as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNamePresetTitle) (els.addTaskNamePresetTitle as HTMLElement).style.display = presets.length ? "block" : "none";
  }

  function toggleThemeMode() {
    const next: "light" | "dark" = themeMode === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }

  function applyMainMode(mode: MainMode) {
    if (!isModeEnabled(mode)) mode = "mode1";
    currentMode = mode;
    applyModeAccent(mode);
    document.body.setAttribute("data-main-mode", mode);
    els.mode1Btn?.classList.toggle("isOn", mode === "mode1");
    els.mode2Btn?.classList.toggle("isOn", mode === "mode2");
    els.mode3Btn?.classList.toggle("isOn", mode === "mode3");
    els.mode1View?.classList.toggle("modeViewOn", true);
    els.mode2View?.classList.toggle("modeViewOn", mode === "mode2");
    els.mode3View?.classList.toggle("modeViewOn", mode === "mode3");
    render();
  }

  function applyAppPage(page: "tasks" | "dashboard" | "test1" | "test2") {
    document.body.setAttribute("data-app-page", page);
    els.appPageTasks?.classList.toggle("appPageOn", page === "tasks");
    els.appPageDashboard?.classList.toggle("appPageOn", page === "dashboard");
    els.appPageTest1?.classList.toggle("appPageOn", page === "test1");
    els.appPageTest2?.classList.toggle("appPageOn", page === "test2");
    if (els.modeSwitch) (els.modeSwitch as HTMLElement).style.display = page === "tasks" ? "flex" : "none";
    els.footerTasksBtn?.classList.toggle("isOn", page === "tasks");
    els.footerDashboardBtn?.classList.toggle("isOn", page === "dashboard");
    els.footerTest1Btn?.classList.toggle("isOn", page === "test1");
    els.footerTest2Btn?.classList.toggle("isOn", page === "test2");
    if (page === "tasks") render();
  }

  function deleteTasksInMode(mode: MainMode) {
    tasks = (tasks || []).filter((t) => taskModeOf(t) !== mode);
    save();
    render();
  }

  function wireEvents() {
    const setAddTaskError = (msg: string) => {
      if (els.addTaskError) els.addTaskError.textContent = msg;
    };
    const wireModeColorPair = (picker: HTMLInputElement | null, hex: HTMLInputElement | null, mode: MainMode) => {
      on(picker, "input", () => {
        if (!picker || !hex) return;
        hex.value = sanitizeModeColor(picker.value, DEFAULT_MODE_COLORS[mode]);
      });
      on(hex, "input", () => {
        if (!picker || !hex) return;
        const normalized = sanitizeModeColor(hex.value, "");
        if (normalized) picker.value = normalized;
      });
      on(hex, "blur", () => {
        if (!picker || !hex) return;
        const normalized = sanitizeModeColor(hex.value, DEFAULT_MODE_COLORS[mode]);
        hex.value = normalized;
        picker.value = normalized;
      });
    };
    wireModeColorPair(els.categoryMode1Color, els.categoryMode1ColorHex, "mode1");
    wireModeColorPair(els.categoryMode2Color, els.categoryMode2ColorHex, "mode2");
    wireModeColorPair(els.categoryMode3Color, els.categoryMode3ColorHex, "mode3");

    const syncAddTaskMilestonesUi = () => {
      els.addTaskMsToggle?.classList.toggle("on", addTaskMilestonesEnabled);
      els.addTaskMsToggle?.setAttribute("aria-checked", String(addTaskMilestonesEnabled));
      els.addTaskMsArea?.classList.toggle("on", addTaskMilestonesEnabled);
      setAddTaskMilestoneUnitUi(addTaskMilestoneTimeUnit);
    };

    const resetAddTaskMilestones = () => {
      addTaskMilestonesEnabled = false;
      addTaskMilestoneTimeUnit = defaultTaskTimerFormat;
      addTaskMilestones = [];
      if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
      syncAddTaskMilestonesUi();
    };

    const openAddTaskModal = () => {
      resetAddTaskMilestones();
      setAddTaskError("");
      renderAddTaskNameMenu("");
      setAddTaskNameMenuOpen(false);
      suppressAddTaskNameFocusOpen = true;
      openOverlay(els.addTaskOverlay as HTMLElement | null);
      setTimeout(() => {
        try {
          els.addTaskName?.focus();
        } catch {
          // ignore
        }
        suppressAddTaskNameFocusOpen = false;
      }, 60);
    };

    const closeAddTaskModal = () => {
      closeOverlay(els.addTaskOverlay as HTMLElement | null);
      if (els.addTaskName) els.addTaskName.value = "";
      setAddTaskNameMenuOpen(false);
      setAddTaskError("");
      resetAddTaskMilestones();
    };

    on(els.openAddTaskBtn, "click", openAddTaskModal);
    on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    on(els.addTaskOverlay, "click", (e: any) => {
      if (e.target === els.addTaskOverlay) closeAddTaskModal();
    });

    on(els.addTaskMsToggle, "click", () => {
      addTaskMilestonesEnabled = !addTaskMilestonesEnabled;
      syncAddTaskMilestonesUi();
    });

    on(els.addTaskMsUnitDay, "click", () => {
      addTaskMilestoneTimeUnit = "day";
      setAddTaskMilestoneUnitUi("day");
      renderAddTaskMilestoneEditor();
    });

    on(els.addTaskMsUnitHour, "click", () => {
      addTaskMilestoneTimeUnit = "hour";
      setAddTaskMilestoneUnitUi("hour");
      renderAddTaskMilestoneEditor();
    });
    on(els.addTaskMsUnitMinute, "click", () => {
      addTaskMilestoneTimeUnit = "minute";
      setAddTaskMilestoneUnitUi("minute");
      renderAddTaskMilestoneEditor();
    });
    on(els.mode1Btn, "click", () => applyMainMode("mode1"));
    on(els.mode2Btn, "click", () => applyMainMode("mode2"));
    on(els.mode3Btn, "click", () => applyMainMode("mode3"));
    on(els.footerTasksBtn, "click", () => applyAppPage("tasks"));
    on(els.footerDashboardBtn, "click", () => applyAppPage("dashboard"));
    on(els.footerTest1Btn, "click", () => applyAppPage("test1"));
    on(els.footerTest2Btn, "click", (e: any) => {
      e?.preventDefault?.();
      window.location.href = appRoute("/tasktimer/user-guide");
    });
    on(els.footerSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      window.location.href = appRoute("/tasktimer/settings");
    });
    on(els.editMoveMode1, "click", () => {
      if (els.editMoveMode1?.disabled) return;
      editMoveTargetMode = "mode1";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel("mode1");
      if (els.editMoveMenu) els.editMoveMenu.open = false;
    });
    on(els.editMoveMode2, "click", () => {
      if (els.editMoveMode2?.disabled) return;
      editMoveTargetMode = "mode2";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel("mode2");
      if (els.editMoveMenu) els.editMoveMenu.open = false;
    });
    on(els.editMoveMode3, "click", () => {
      if (els.editMoveMode3?.disabled) return;
      editMoveTargetMode = "mode3";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel("mode3");
      if (els.editMoveMenu) els.editMoveMenu.open = false;
    });

    on(els.addTaskName, "input", () => {
      if ((els.addTaskName?.value || "").trim()) setAddTaskError("");
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    on(els.addTaskName, "focus", () => {
      if (suppressAddTaskNameFocusOpen) return;
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    on(els.addTaskNameToggle, "click", (ev: any) => {
      ev.preventDefault?.();
      const isOpen = (els.addTaskNameMenu as HTMLElement | null)?.style.display === "block";
      if (!isOpen) renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(!isOpen);
      if (!isOpen) els.addTaskName?.focus();
    });
    on(els.addTaskNameMenu, "click", (ev: any) => {
      const item = ev.target?.closest?.("[data-add-task-name]");
      if (!item) return;
      const name = item.getAttribute("data-add-task-name") || "";
      if (els.addTaskName) {
        els.addTaskName.value = name;
        els.addTaskName.focus();
      }
      setAddTaskError("");
      setAddTaskNameMenuOpen(false);
    });

    on(els.addTaskAddMsBtn, "click", () => {
      if (!addTaskMilestonesEnabled) return;
      addTaskMilestones.push({ hours: 0, description: "" });
      renderAddTaskMilestoneEditor();
    });

    on(els.addTaskForm, "submit", (e: any) => {
      e.preventDefault();
      const name = (els.addTaskName?.value || "").trim();
      if (!name) {
        setAddTaskError("Task name is required");
        return;
      }
      rememberCustomTaskName(name);
      setAddTaskError("");
      const nextOrder = (tasks.reduce((mx, t) => Math.max(mx, t.order || 0), 0) || 0) + 1;
      const newTask = makeTask(name, nextOrder);
      newTask.milestonesEnabled = addTaskMilestonesEnabled;
      newTask.milestoneTimeUnit = addTaskMilestoneTimeUnit;
      newTask.milestones = sortMilestones(addTaskMilestones.slice());
      tasks.push(newTask);
      closeAddTaskModal();
      save();
      render();
    });

    on(els.taskList, "click", (e: any) => {
      const taskEl = e.target?.closest?.(".task");
      if (!taskEl) return;
      const i = parseInt(taskEl.dataset.index, 10);
      if (!Number.isFinite(i)) return;

      const btn = e.target?.closest?.("[data-action]");
      if (!btn) {
        const inTopRow = !!e.target?.closest?.(".row");
        const inActions = !!e.target?.closest?.(".actions");
        if (inTopRow && !inActions) {
          openFocusMode(i);
        }
        return;
      }
      const action = btn.getAttribute("data-action");

      if (action === "start") startTask(i);
      else if (action === "stop") stopTask(i);
      else if (action === "reset") resetTask(i);
      else if (action === "delete") deleteTask(i);
      else if (action === "edit") openEdit(i);
      else if (action === "history") openHistory(i);
      else if (action === "duplicate") duplicateTask(i);
      else if (action === "editName") openFocusMode(i);
      else if (action === "collapse") toggleCollapse(i);

      const menu = btn.closest?.(".taskMenu") as HTMLDetailsElement | null;
      if (menu && menu.open) menu.open = false;
    });

    on(els.resetAllBtn, "click", resetAll);

    on(document, "click", (ev: any) => {
      const insideMenu = ev.target?.closest?.(".taskMenu");
      if (insideMenu) {
        document.querySelectorAll(".taskMenu[open]").forEach((el) => {
          if (el !== insideMenu) (el as HTMLDetailsElement).open = false;
        });
      } else {
        document.querySelectorAll(".taskMenu[open]").forEach((el) => {
          (el as HTMLDetailsElement).open = false;
        });
      }
      const insideEditMove = ev.target?.closest?.(".editMoveMenu");
      if (!insideEditMove && els.editMoveMenu) els.editMoveMenu.open = false;
      const insideAddNameMenu = ev.target?.closest?.("#addTaskNameCombo");
      if (!insideAddNameMenu) setAddTaskNameMenuOpen(false);
    });
    on(els.taskList, "click", (ev: any) => {
      const summary = ev.target?.closest?.(".taskMenu > summary");
      if (!summary) return;
      const menu = summary.closest?.(".taskMenu") as HTMLDetailsElement | null;
      if (!menu) return;

      window.setTimeout(() => {
        if (!menu.open) {
          menu.classList.remove("open-up");
          return;
        }
        menu.classList.remove("open-up");
      }, 0);
    });

    on(els.taskList, "click", (ev: any) => {
      const rangeToggle = ev.target?.closest?.("[data-history-range-toggle]") as HTMLElement | null;
      if (rangeToggle) {
        const taskEl = rangeToggle.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        state.rangeDays = state.rangeDays === 14 ? 7 : 14;
        saveHistoryRangePref(taskId, state.rangeDays);
        state.page = 0;
        renderHistory(taskId);
        return;
      }
      const rangeModeBtn = ev.target?.closest?.("[data-history-range-mode]") as HTMLElement | null;
      if (rangeModeBtn) {
        const taskEl = rangeModeBtn.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        const mode = rangeModeBtn.getAttribute("data-history-range-mode");
        state.rangeMode = mode === "day" ? "day" : "entries";
        saveHistoryRangeModePref(taskId, state.rangeMode);
        renderHistory(taskId);
        return;
      }

      const btn = ev.target?.closest?.("[data-history-action]");
      const action = btn?.getAttribute?.("data-history-action");
      if (!action) return;
      const taskEl = btn?.closest?.(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      if (action === "pin") {
        if (pinnedHistoryTaskIds.has(taskId)) pinnedHistoryTaskIds.delete(taskId);
        else pinnedHistoryTaskIds.add(taskId);
        savePinnedHistoryTaskIds();
        if (pinnedHistoryTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
        render();
        return;
      }
      if (action === "close") {
        closeHistory(taskId);
        return;
      }
      if (action === "edit") {
        state.editMode = !state.editMode;
        renderHistory(taskId);
        return;
      }
      if (action === "older") {
        state.slideDir = "left";
        state.page += 1;
        renderHistory(taskId);
        return;
      }
      if (action === "newer") {
        state.slideDir = "right";
        state.page = Math.max(0, state.page - 1);
        renderHistory(taskId);
        return;
      }
      if (action === "manage") {
        window.location.href = appRoute(`/tasktimer/history-manager?taskId=${encodeURIComponent(taskId)}`);
        return;
      }
      if (action === "analyse") {
        if (state.lockedAbsIndexes.size < 2) return;
        openHistoryAnalysisModal(taskId);
        return;
      }
      if (action === "clearLocks") {
        clearHistoryLockedSelections(taskId);
        renderHistory(taskId);
        return;
      }
      const lockedList = Array.from(state.lockedAbsIndexes.values());
      const deleteAbsIndex = state.selectedAbsIndex != null ? state.selectedAbsIndex : lockedList[lockedList.length - 1] ?? null;
      if (action !== "delete" || deleteAbsIndex == null) return;

      const all = getHistoryForTask(taskId);
      const e = all[deleteAbsIndex];
      if (!e) return;

      confirm("Delete Log Entry", `Delete this entry (${formatTime(e.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          const all2 = getHistoryForTask(taskId);
          if (deleteAbsIndex >= 0 && deleteAbsIndex < all2.length) {
            all2.splice(deleteAbsIndex, 1);
            historyByTaskId[taskId] = all2 as any;
            saveHistory(historyByTaskId);

            if (state.selectedAbsIndex === deleteAbsIndex) {
              state.selectedAbsIndex = null;
              state.selectedRelIndex = null;
              startHistorySelectionAnimation(taskId, null);
            } else if (state.selectedAbsIndex != null && state.selectedAbsIndex > deleteAbsIndex) {
              state.selectedAbsIndex -= 1;
            }
            if (state.lockedAbsIndexes.size > 0) {
              const nextLocked = new Set<number>();
              state.lockedAbsIndexes.forEach((idx) => {
                if (idx === deleteAbsIndex) return;
                nextLocked.add(idx > deleteAbsIndex ? idx - 1 : idx);
              });
              state.lockedAbsIndexes = nextLocked;
            }

            const maxPage = Math.max(0, Math.ceil(all2.length / historyPageSize(taskId)) - 1);
            state.page = Math.min(state.page, maxPage);
            renderHistory(taskId);
          }
          closeConfirm();
        },
      });
    });

    on(els.taskList, "click", (ev: any) => {
      const canvas = ev.target?.closest?.(".historyChartInline") as HTMLCanvasElement | null;
      if (!canvas) return;
      const taskEl = canvas.closest(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let hit: any = null;
      for (let i = 0; i < state.barRects.length; i++) {
        const r = state.barRects[i];
        if (!r) continue;
        const hx = typeof r.hitX === "number" ? r.hitX : r.x;
        const hy = typeof r.hitY === "number" ? r.hitY : r.y;
        const hw = typeof r.hitW === "number" ? r.hitW : r.w;
        const hh = typeof r.hitH === "number" ? r.hitH : r.h;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) {
          hit = { rel: i, abs: r.absIndex };
          break;
        }
      }
      if (!hit) {
        for (let i = 0; i < state.labelHitRects.length; i++) {
          const r = state.labelHitRects[i];
          if (!r) continue;
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            hit = { rel: i, abs: r.absIndex };
            break;
          }
        }
      }

      if (hit) {
        const isSameTransient = state.selectedAbsIndex != null && state.selectedAbsIndex === hit.abs;
        const isSameLocked = state.lockedAbsIndexes.has(hit.abs);
        if (isSameLocked) {
          state.lockedAbsIndexes.delete(hit.abs);
          const ui = getHistoryUi(taskId);
          const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
          if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
        } else if (isSameTransient) {
          state.lockedAbsIndexes.add(hit.abs);
          if (state.selectionClearTimer != null) {
            window.clearTimeout(state.selectionClearTimer);
            state.selectionClearTimer = null;
          }
          state.selectedRelIndex = null;
          state.selectedAbsIndex = null;
          startHistorySelectionAnimation(taskId, null);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
        } else {
          state.selectedRelIndex = hit.rel;
          state.selectedAbsIndex = hit.abs;
          startHistorySelectionAnimation(taskId, hit.abs);
          scheduleHistorySelectionClear(taskId);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
        }
      } else {
        clearHistoryChartSelection(taskId);
        const ui = getHistoryUi(taskId);
        const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
        if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
      }

      renderHistory(taskId);
    });

    let swipeStartX: number | null = null;
    let swipeStartY: number | null = null;
    let swipeWrap: HTMLElement | null = null;
    let swipePointerId: number | null = null;

    const runHistorySwipe = (endX: number, endY: number) => {
      if (!swipeWrap) return;
      if (swipeStartX === null || swipeStartY === null) return;

      const dx = endX - swipeStartX;
      const dy = endY - swipeStartY;

      swipeStartX = null;
      swipeStartY = null;
      const currentWrap = swipeWrap;
      swipeWrap = null;
      swipePointerId = null;

      if (Math.abs(dx) < 24) return;
      if (Math.abs(dy) > 60) return;

      const taskId = currentWrap?.closest(".task")?.getAttribute("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);
      const rangeDays = state.rangeDays || 7;
      const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
      const visibleEntries = getHistoryForTask(taskId).filter((e: any) => (+e.ts || 0) >= cutoffMs);
      const total =
        state.rangeMode === "day"
          ? new Set(
              visibleEntries.map((e: any) => {
                const d = new Date(+e.ts || 0);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const da = String(d.getDate()).padStart(2, "0");
                return `${y}-${m}-${da}`;
              })
            ).size
          : visibleEntries.length;
      const pageSize = historyPageSize(taskId);
      const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

      if (dx < 0) {
        if (state.page < maxPage) {
          state.slideDir = "left";
          state.page += 1;
          renderHistory(taskId);
        }
      } else {
        if (state.page > 0) {
          state.slideDir = "right";
          state.page = Math.max(0, state.page - 1);
          renderHistory(taskId);
        }
      }
    };

    if ("PointerEvent" in window) {
      on(els.taskList, "pointerdown", (e: any) => {
        const wrap = e.target?.closest?.(".historyCanvasWrap") || null;
        if (!wrap) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swipeWrap = wrap;
        swipePointerId = typeof e.pointerId === "number" ? e.pointerId : null;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
      });

      on(els.taskList, "pointerup", (e: any) => {
        if (swipePointerId != null && e.pointerId !== swipePointerId) return;
        runHistorySwipe(e.clientX, e.clientY);
      });

      on(els.taskList, "pointercancel", () => {
        swipeStartX = null;
        swipeStartY = null;
        swipeWrap = null;
        swipePointerId = null;
      });
    } else {
      on(
        els.taskList,
        "touchstart",
        (e: any) => {
          swipeWrap = e.target?.closest?.(".historyCanvasWrap") || null;
          if (!swipeWrap) return;
          if (!e.touches || !e.touches.length) return;
          swipeStartX = e.touches[0].clientX;
          swipeStartY = e.touches[0].clientY;
        },
        { passive: true }
      );

      on(
        els.taskList,
        "touchend",
        (e: any) => {
          const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
          if (!t) return;
          runHistorySwipe(t.clientX, t.clientY);
        },
        { passive: true }
      );

      on(els.taskList, "touchcancel", () => {
        swipeStartX = null;
        swipeStartY = null;
        swipeWrap = null;
        swipePointerId = null;
      });
    }

    on(window, "resize", () => {
      for (const taskId of openHistoryTaskIds) {
        renderHistory(taskId);
      }
    });

    on(els.menuIcon, "click", () => {
      window.location.href = appRoute("/tasktimer/settings");
    });
    on(els.dashboardEditBtn, "click", beginDashboardEditMode);
    on(els.dashboardEditCancelBtn, "click", cancelDashboardEditMode);
    on(els.dashboardEditDoneBtn, "click", commitDashboardEditMode);
    on(els.dashboardGrid, "dragstart", (e: any) => {
      if (!dashboardEditMode) return;
      const card = e.target?.closest?.(".dashboardCard") as HTMLElement | null;
      if (!card || !els.dashboardGrid?.contains(card)) return;
      dashboardDragEl = card;
      card.classList.add("isDragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", card.getAttribute("data-dashboard-id") || "");
        } catch {
          // ignore
        }
      }
    });
    on(els.dashboardGrid, "dragover", (e: any) => {
      if (!dashboardEditMode) return;
      const grid = els.dashboardGrid;
      const dragging = dashboardDragEl;
      if (!grid || !dragging) return;
      const over = e.target?.closest?.(".dashboardCard") as HTMLElement | null;
      if (!over || over === dragging || !grid.contains(over)) return;
      e.preventDefault();
      const rect = over.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) grid.insertBefore(dragging, over);
      else grid.insertBefore(dragging, over.nextSibling);
    });
    on(els.dashboardGrid, "drop", (e: any) => {
      if (!dashboardEditMode) return;
      e.preventDefault();
    });
    on(els.dashboardGrid, "dragend", () => {
      if (dashboardDragEl) dashboardDragEl.classList.remove("isDragging");
      dashboardDragEl = null;
    });
    on(els.closeMenuBtn, "click", () => {
      if (els.menuOverlay) closeOverlay(els.menuOverlay as HTMLElement | null);
      else window.location.href = appRoute("/tasktimer");
    });
    on(els.themeToggle, "click", toggleThemeMode);
    on(els.themeToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#themeToggle")) return;
      toggleThemeMode();
    });
    on(els.taskDefaultFormatDay, "click", () => {
      defaultTaskTimerFormat = "day";
      syncTaskSettingsUi();
    });
    on(els.taskDefaultFormatHour, "click", () => {
      defaultTaskTimerFormat = "hour";
      syncTaskSettingsUi();
    });
    on(els.taskDefaultFormatMinute, "click", () => {
      defaultTaskTimerFormat = "minute";
      syncTaskSettingsUi();
    });
    on(els.taskDynamicColorsToggle, "click", () => {
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskDynamicColorsToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskDynamicColorsToggle")) return;
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskCheckpointSoundToggle, "click", () => {
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskCheckpointSoundToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointSoundToggle")) return;
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskCheckpointToastToggle, "click", () => {
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskCheckpointToastToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointToastToggle")) return;
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
    });
    on(els.taskSettingsSaveBtn, "click", () => {
      saveDefaultTaskTimerFormat();
      saveDynamicColorsSetting();
      saveCheckpointAlertSettings();
      render();
      closeOverlay(els.taskSettingsOverlay as HTMLElement | null);
    });
    on(els.categoryMode2Toggle, "click", () => {
      modeEnabled.mode2 = !modeEnabled.mode2;
      syncModeLabelsUi();
    });
    on(els.categoryMode3Toggle, "click", () => {
      modeEnabled.mode3 = !modeEnabled.mode3;
      syncModeLabelsUi();
    });

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    on(els.categorySaveBtn, "click", () => {
      modeLabels.mode1 = sanitizeModeLabel(els.categoryMode1Input?.value, DEFAULT_MODE_LABELS.mode1);
      modeLabels.mode2 = sanitizeModeLabel(els.categoryMode2Input?.value, DEFAULT_MODE_LABELS.mode2);
      modeLabels.mode3 = sanitizeModeLabel(els.categoryMode3Input?.value, DEFAULT_MODE_LABELS.mode3);
      modeColors.mode1 = sanitizeModeColor(
        (els.categoryMode1ColorHex?.value || "").trim() || els.categoryMode1Color?.value,
        DEFAULT_MODE_COLORS.mode1
      );
      modeColors.mode2 = sanitizeModeColor(
        (els.categoryMode2ColorHex?.value || "").trim() || els.categoryMode2Color?.value,
        DEFAULT_MODE_COLORS.mode2
      );
      modeColors.mode3 = sanitizeModeColor(
        (els.categoryMode3ColorHex?.value || "").trim() || els.categoryMode3Color?.value,
        DEFAULT_MODE_COLORS.mode3
      );
      modeEnabled.mode1 = true;
      saveModeSettings();
      syncModeLabelsUi();
      if (!isModeEnabled(currentMode)) applyMainMode("mode1");
      else applyModeAccent(currentMode);
      if (!isModeEnabled(editMoveTargetMode)) editMoveTargetMode = "mode1";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
      closeOverlay(els.categoryManagerOverlay as HTMLElement | null);
    });
    on(els.categoryResetBtn, "click", () => {
      modeLabels = { ...DEFAULT_MODE_LABELS };
      modeEnabled = { ...DEFAULT_MODE_ENABLED };
      modeColors = { ...DEFAULT_MODE_COLORS };
      saveModeSettings();
      syncModeLabelsUi();
      applyModeAccent(currentMode);
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
    });
    const confirmDeleteCategory = (mode: MainMode) => {
      const label = getModeLabel(mode);
      const safeLabel = escapeHtmlUI(label);
      confirm("Delete Category Tasks", "", {
        okLabel: "Delete",
        textHtml: `<span class="confirmDanger">All tasks under the ${safeLabel} category will be deleted. Proceed?</span>`,
        onOk: () => {
          deleteTasksInMode(mode);
          closeConfirm();
        },
      });
    };
    on(els.categoryMode2TrashBtn, "click", () => confirmDeleteCategory("mode2"));
    on(els.categoryMode3TrashBtn, "click", () => confirmDeleteCategory("mode3"));

    on(els.exportBtn, "click", exportBackup);
    on(els.importBtn, "click", () => els.importFile?.click());

    on(els.importFile, "change", (e: any) => {
      const f = e.target?.files && e.target.files[0] ? e.target.files[0] : null;
      e.target.value = "";
      if (f) importBackupFromFile(f);
    });

    document.querySelectorAll(".closePopup").forEach((btn) => {
      on(btn, "click", () => {
        const ov = (btn as HTMLElement).closest(".overlay") as HTMLElement | null;
        if (ov) closeOverlay(ov);
      });
    });

    on(els.cancelEditBtn, "click", () => closeEdit(false));
    on(els.saveEditBtn, "click", () => closeEdit(true));
    on(els.editOverrideElapsedToggle, "click", () => {
      setEditElapsedOverrideEnabled(!isEditElapsedOverrideEnabled());
    });
    on(els.editCheckpointSoundToggle, "click", () => {
      if (!checkpointAlertSoundEnabled) return;
      toggleSwitchElement(
        els.editCheckpointSoundToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null)
      );
    });
    on(els.editCheckpointSoundToggleRow, "click", (e: any) => {
      if (!checkpointAlertSoundEnabled || e.target?.closest?.("#editCheckpointSoundToggle")) return;
      toggleSwitchElement(
        els.editCheckpointSoundToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null)
      );
    });
    on(els.editCheckpointToastToggle, "click", () => {
      if (!checkpointAlertToastEnabled) return;
      toggleSwitchElement(
        els.editCheckpointToastToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null)
      );
    });
    on(els.editCheckpointToastToggleRow, "click", (e: any) => {
      if (!checkpointAlertToastEnabled || e.target?.closest?.("#editCheckpointToastToggle")) return;
      toggleSwitchElement(
        els.editCheckpointToastToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null)
      );
    });
    on(els.editD, "click", (e: any) => {
      if (!isEditElapsedOverrideEnabled()) return;
      e.preventDefault();
      openElapsedPad(els.editD);
    });
    on(els.editH, "click", (e: any) => {
      if (!isEditElapsedOverrideEnabled()) return;
      e.preventDefault();
      openElapsedPad(els.editH);
    });
    on(els.editM, "click", (e: any) => {
      if (!isEditElapsedOverrideEnabled()) return;
      e.preventDefault();
      openElapsedPad(els.editM);
    });
    on(els.editS, "click", (e: any) => {
      if (!isEditElapsedOverrideEnabled()) return;
      e.preventDefault();
      openElapsedPad(els.editS);
    });
    on(els.editD, "focus", () => {
      if (!isEditElapsedOverrideEnabled()) return;
      openElapsedPad(els.editD);
    });
    on(els.editH, "focus", () => {
      if (!isEditElapsedOverrideEnabled()) return;
      openElapsedPad(els.editH);
    });
    on(els.editM, "focus", () => {
      if (!isEditElapsedOverrideEnabled()) return;
      openElapsedPad(els.editM);
    });
    on(els.editS, "focus", () => {
      if (!isEditElapsedOverrideEnabled()) return;
      openElapsedPad(els.editS);
    });

    on(els.elapsedPadOverlay, "click", (e: any) => {
      if (e.target === els.elapsedPadOverlay) closeElapsedPad(false);
    });
    on(els.elapsedPadCancelBtn, "click", () => closeElapsedPad(false));
    on(els.elapsedPadDoneBtn, "click", () => closeElapsedPad(true));

    document.querySelectorAll(".elapsedPadKey").forEach((btn) => {
      on(btn, "click", () => {
        const el = btn as HTMLElement;
        const digit = el.getAttribute("data-pad-digit");
        const action = el.getAttribute("data-pad-action");
        if (digit != null) {
          padAppendDigit(digit);
          return;
        }
        if (action === "back") {
          padBackspace();
          return;
        }
        if (action === "clear") {
          padClear();
        }
      });
    });

    on(els.msToggle, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestonesEnabled = !t.milestonesEnabled;
      els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
      els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
      els.msArea?.classList.toggle("on", !!t.milestonesEnabled);

      if (!t.milestonesEnabled) {
        save();
        render();
      }
    });

    on(els.msUnitDay, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "day";
      setMilestoneUnitUi("day");
      renderMilestoneEditor(t);
    });
    on(els.msUnitHour, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "hour";
      setMilestoneUnitUi("hour");
      renderMilestoneEditor(t);
    });
    on(els.msUnitMinute, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "minute";
      setMilestoneUnitUi("minute");
      renderMilestoneEditor(t);
    });

    on(els.addMsBtn, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestones = t.milestones || [];
      t.milestones.push({ hours: 0, description: "" });
      renderMilestoneEditor(t);
    });

    on(els.confirmCancelBtn, "click", closeConfirm);
    on(els.confirmAltBtn, "click", () => {
      if (typeof confirmActionAlt === "function") confirmActionAlt();
    });
    on(els.confirmOkBtn, "click", () => {
      if (typeof confirmAction === "function") confirmAction();
      else closeConfirm();
    });
    on(els.checkpointToastHost, "click", (e: any) => {
      const btn = e.target?.closest?.('[data-action="closeCheckpointToast"]');
      if (!btn) return;
      dismissCheckpointToast();
    });

    on(els.historyManagerBtn, "click", () => {
      window.location.href = appRoute("/tasktimer/history-manager");
    });
    on(els.historyManagerBulkBtn, "click", () => {
      hmBulkEditMode = !hmBulkEditMode;
      if (!hmBulkEditMode) hmBulkSelectedRows = new Set<string>();
      renderHistoryManager();
    });
    on(els.historyManagerBulkDeleteBtn, "click", () => {
      const selected = Array.from(hmBulkSelectedRows);
      if (!selected.length) return;
      const byTask: Record<string, Set<string>> = {};
      selected.forEach((id) => {
        const firstSep = id.indexOf("|");
        if (firstSep <= 0) return;
        const taskId = id.slice(0, firstSep);
        const rowKey = id.slice(firstSep + 1);
        if (!byTask[taskId]) byTask[taskId] = new Set<string>();
        byTask[taskId].add(rowKey);
      });
      const taskCount = Object.keys(byTask).length;
      const entryCount = selected.length;
      confirm(
        "Delete Selected History",
        `${entryCount} entr${entryCount === 1 ? "y" : "ies"} across ${taskCount} task${
          taskCount === 1 ? "" : "s"
        } will be deleted. Continue?`,
        {
          okLabel: "Delete",
          cancelLabel: "Cancel",
          onOk: () => {
            historyByTaskId = loadHistory();
            Object.keys(byTask).forEach((taskId) => {
              const keys = byTask[taskId];
              const arr = (historyByTaskId[taskId] || []).slice();
              const next: any[] = [];
              arr.forEach((e: any) => {
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                if (keys.has(rowKey)) keys.delete(rowKey);
                else next.push(e);
              });
              historyByTaskId[taskId] = next;
              if (next.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
                delete (deletedTaskMeta as any)[taskId];
                saveDeletedMeta(deletedTaskMeta);
              }
            });
            saveHistory(historyByTaskId);
            hmBulkSelectedRows = new Set<string>();
            renderHistoryManager();
            closeConfirm();
          },
          onCancel: () => closeConfirm(),
        }
      );
    });
    on(els.historyManagerBackBtn, "click", () => {
      window.location.href = appRoute("/tasktimer");
    });
    on(els.focusModeBackBtn, "click", closeFocusMode);
    on(els.focusCheckpointToggle, "click", () => {
      if (!focusModeTaskId) return;
      const t = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
      if (!t) return;
      if (!hasFocusCheckpoints(t)) {
        syncFocusCheckpointToggle(t);
        return;
      }
      focusShowCheckpoints = !focusShowCheckpoints;
      syncFocusCheckpointToggle(t);
    });
    on(els.focusStartBtn, "click", () => {
      if (!focusModeTaskId) return;
      const idx = tasks.findIndex((x) => String(x.id || "") === String(focusModeTaskId));
      if (idx < 0) return;
      startTask(idx);
    });
    on(els.focusStopBtn, "click", () => {
      if (!focusModeTaskId) return;
      const idx = tasks.findIndex((x) => String(x.id || "") === String(focusModeTaskId));
      if (idx < 0) return;
      stopTask(idx);
    });

    on(els.hmList, "click", (ev: any) => {
      const bulkCheckbox = ev.target?.closest?.(".hmBulkCheckbox");
      if (bulkCheckbox) {
        ev.stopPropagation();
        return;
      }
      const sortBtn = ev.target?.closest?.(".hmSortBtn");
      if (sortBtn) {
        const key = sortBtn.getAttribute("data-hm-sort");
        if (key === "ts" || key === "ms") {
          if (hmSortKey === key) hmSortDir = hmSortDir === "asc" ? "desc" : "asc";
          else {
            hmSortKey = key;
            hmSortDir = "desc";
          }
          renderHistoryManager();
        }
        return;
      }

      const btn = ev.target?.closest?.(".hmDelBtn");
      if (!btn) return;

      const taskId = btn.getAttribute("data-task");
      const key = btn.getAttribute("data-key");
      if (!taskId || !key) return;

      const parts = key.split("|");
      const ts = parseInt(parts[0], 10);
      const ms = parseInt(parts[1], 10);
      const name = parts.slice(2).join("|");

      confirm("Delete Log Entry", "Delete this entry?", {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          historyByTaskId = loadHistory();
          const orig = historyByTaskId[taskId] || [];
          const pos = orig.findIndex(
            (e: any) => e.ts === ts && e.ms === ms && String(e.name || "") === String(name || "")
          );

          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            saveHistory(historyByTaskId);

            if (orig.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
              delete (deletedTaskMeta as any)[taskId];
              saveDeletedMeta(deletedTaskMeta);
            }
          }

          renderHistoryManager();
          closeConfirm();
        },
        onCancel: () => closeConfirm(),
      });
    });
    on(els.hmList, "change", (ev: any) => {
      if (!hmBulkEditMode) return;
      const el = ev.target as HTMLInputElement | null;
      if (!el || !el.classList || !el.classList.contains("hmBulkCheckbox")) return;
      const checked = !!el.checked;
      if (el.classList.contains("hmBulkTaskChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const ids = hmRowsByTask[taskId] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkDateChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const dateKey = el.getAttribute("data-date") || "";
        const ids = hmRowsByTaskDate[`${taskId}|${dateKey}`] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkRowChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const rowKey = el.getAttribute("data-key") || "";
        const id = `${taskId}|${rowKey}`;
        if (checked) hmBulkSelectedRows.add(id);
        else hmBulkSelectedRows.delete(id);
        renderHistoryManager();
      }
    });
  }

  function tick() {
    if (destroyed) return;

    if (!els.taskList) {
      tickRaf = window.requestAnimationFrame(() => {
        tickTimeout = window.setTimeout(tick, 200);
      });
      return;
    }

    const processedCheckpointTaskIds = new Set<string>();
    const nodes = els.taskList.querySelectorAll(".task");
    nodes.forEach((node) => {
      const i = parseInt((node as HTMLElement).dataset.index || "0", 10);
      const t = tasks[i];
      if (!t) return;

      const timeEl = node.querySelector(".time");
      const elapsedMs = getElapsedMs(t);
      if (timeEl) (timeEl as HTMLElement).innerHTML = formatMainTaskElapsedHtml(elapsedMs, !!t.running);
      processCheckpointAlertsForTask(t, elapsedMs / 1000);
      processedCheckpointTaskIds.add(String(t.id || ""));

      if (t.milestonesEnabled && t.milestones && t.milestones.length > 0) {
        const msSorted = sortMilestones(t.milestones);
        const maxValue = Math.max(...msSorted.map((m) => +m.hours || 0), 0) || 1;
        const maxSec = maxValue * milestoneUnitSec(t);
        const pct = Math.min((elapsedMs / 1000 / maxSec) * 100, 100);

        const fill = node.querySelector(".progressFill") as HTMLElement | null;
        if (fill) {
          fill.style.width = pct + "%";
          fill.style.background = dynamicColorsEnabled ? fillBackgroundForPct(pct) : getModeColor(taskModeOf(t));
        }

        const elapsedSec = elapsedMs / 1000;
        const mkTimes = node.querySelectorAll(".mkTime");

        mkTimes.forEach((mt) => {
          const txt = (mt.textContent || "").trim();
          const v = parseFloat(txt.replace(/[^0-9.]/g, "")) || 0;
          const reached = elapsedSec >= v * milestoneUnitSec(t);
          mt.classList.toggle("mkAch", reached);
          mt.classList.toggle("mkPend", !reached);
        });
      }
    });

    tasks.forEach((t) => {
      const taskId = String(t.id || "");
      if (!taskId || processedCheckpointTaskIds.has(taskId)) return;
      processCheckpointAlertsForTask(t, getElapsedMs(t) / 1000);
    });

    if (focusModeTaskId) {
      const ft = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
      if (ft) {
        updateFocusDial(ft);
      } else if (els.focusTaskName && focusModeTaskName) {
        els.focusTaskName.textContent = focusModeTaskName;
      }
    }

    tickRaf = window.requestAnimationFrame(() => {
      tickTimeout = window.setTimeout(tick, 200);
    });
  }

  // Init
  deletedTaskMeta = loadDeletedMeta();
  loadHistoryIntoMemory();
  loadHistoryRangePrefs();
  load();
  loadAddTaskCustomNames();
  loadDefaultTaskTimerFormat();
  loadDynamicColorsSetting();
  loadCheckpointAlertSettings();
  loadPinnedHistoryTaskIds();
  loadThemePreference();
  loadModeLabels();
  backfillHistoryColorsFromSessionLogic();
  syncModeLabelsUi();
  applyMainMode("mode1");
  applyAppPage(getInitialAppPageFromQuery());
  applyDashboardOrderFromStorage();
  applyDashboardEditMode();
  wireEvents();
  render();
  maybeOpenImportFromQuery();
  if (!els.taskList && els.historyManagerScreen) {
    openHistoryManager();
  }
  tick();

  return { destroy };
}
