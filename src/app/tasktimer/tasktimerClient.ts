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
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  approveFriendRequest,
  declineFriendRequest,
  loadFriendships,
  loadIncomingRequests,
  loadOutgoingRequests,
  sendFriendRequest,
  type FriendRequest,
  type Friendship,
} from "./lib/friendsStore";
import {
  hydrateStorageFromCloud,
  loadTasks,
  saveTasks,
  loadHistory,
  saveHistory,
  loadDeletedMeta,
  saveDeletedMeta,
  cleanupHistory,
  loadCachedDashboard,
  loadCachedPreferences,
  loadCachedTaskUi,
  saveCloudDashboard,
  saveCloudPreferences,
  saveCloudTaskUi,
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
  let newTaskHighlightTimer: number | null = null;
  let eventsWired = false;
  let tickStarted = false;

  const destroy = () => {
    destroyed = true;

    if (tickTimeout != null) window.clearTimeout(tickTimeout);
    if (tickRaf != null) window.cancelAnimationFrame(tickRaf);
    if (checkpointToastAutoCloseTimer != null) window.clearTimeout(checkpointToastAutoCloseTimer);
    if (checkpointToastCountdownRefreshTimer != null) window.clearTimeout(checkpointToastCountdownRefreshTimer);
    if (checkpointBeepQueueTimer != null) window.clearTimeout(checkpointBeepQueueTimer);
    if (checkpointRepeatCycleTimer != null) window.clearTimeout(checkpointRepeatCycleTimer);
    if (removeCapBackListener) {
      try {
        removeCapBackListener();
      } catch {
        // ignore
      }
      removeCapBackListener = null;
    }

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
  let currentMode: MainMode = "mode1";
  let modeLabels: Record<MainMode, string> = { ...DEFAULT_MODE_LABELS };
  let modeEnabled: Record<MainMode, boolean> = { ...DEFAULT_MODE_ENABLED };
  let modeColors: Record<MainMode, string> = { ...DEFAULT_MODE_COLORS };
  let editIndex: number | null = null;
  let editDraftSnapshot = "";
  let focusCheckpointSig = "";
  let focusModeTaskName = "";
  let focusShowCheckpoints = true;
  let suppressAddTaskNameFocusOpen = false;

  let confirmAction: null | (() => void) = null;
  let confirmActionAlt: null | (() => void) = null;
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
  let addTaskCheckpointSoundEnabled = false;
  let addTaskCheckpointSoundMode: "once" | "repeat" = "once";
  let addTaskCheckpointToastEnabled = false;
  let addTaskCheckpointToastMode: "auto5s" | "manual" = "auto5s";
  let addTaskPresetIntervalsEnabled = false;
  let addTaskPresetIntervalValue = 0;
  let addTaskFinalCheckpointAction: "continue" | "resetLog" | "resetNoLog" = "continue";
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
  let taskDragEl: HTMLElement | null = null;
  let dashboardOrderDraftBeforeEdit: string[] | null = null;
  let currentAppPage: "tasks" | "dashboard" | "test1" | "test2" = "tasks";
  let suppressNavStackPush = false;
  let removeCapBackListener: null | (() => void) = null;
  const checkpointToastQueue: Array<{
    id: string;
    title: string;
    text: string;
    checkpointTimeText?: string | null;
    checkpointDescText?: string | null;
    taskName?: string | null;
    counterText?: string | null;
    autoCloseMs: number | null;
    autoCloseAtMs?: number | null;
    taskId?: string | null;
    muteRepeatOnManualDismiss?: boolean;
  }> = [];
  let activeCheckpointToast: {
    id: string;
    title: string;
    text: string;
    checkpointTimeText?: string | null;
    checkpointDescText?: string | null;
    taskName?: string | null;
    counterText?: string | null;
    autoCloseMs: number | null;
    autoCloseAtMs?: number | null;
    taskId?: string | null;
    muteRepeatOnManualDismiss?: boolean;
  } | null = null;
  let checkpointToastAutoCloseTimer: number | null = null;
  let checkpointToastCountdownRefreshTimer: number | null = null;
  let checkpointBeepAudio: HTMLAudioElement | null = null;
  let checkpointBeepQueueCount = 0;
  let checkpointBeepQueueTimer: number | null = null;
  let checkpointRepeatStopAtMs = 0;
  let checkpointRepeatCycleTimer: number | null = null;
  let checkpointRepeatActiveTaskId: string | null = null;
  let checkpointAutoResetDirty = false;
  const checkpointFiredKeysByTaskId: Record<string, Set<string>> = {};
  const checkpointBaselineSecByTaskId: Record<string, number> = {};
  let cloudPreferencesCache = loadCachedPreferences();
  let cloudDashboardCache = loadCachedDashboard();
  let cloudTaskUiCache = loadCachedTaskUi();
  let navStackMemory: string[] = [];
  let pendingTaskJumpMemory: string | null = null;
  let groupsIncomingRequests: FriendRequest[] = [];
  let groupsOutgoingRequests: FriendRequest[] = [];
  let groupsFriendships: Friendship[] = [];
  let groupsLoading = false;
  let groupsStatusMessage = "Ready.";

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
    addTaskCheckpointAlertsGroup: document.getElementById("addTaskCheckpointAlertsGroup"),
    addTaskCheckpointSoundToggleRow: document.getElementById("addTaskCheckpointSoundToggleRow"),
    addTaskCheckpointSoundToggle: document.getElementById("addTaskCheckpointSoundToggle"),
    addTaskCheckpointSoundModeField: document.getElementById("addTaskCheckpointSoundModeField"),
    addTaskCheckpointSoundModeSelect: document.getElementById("addTaskCheckpointSoundModeSelect") as HTMLSelectElement | null,
    addTaskCheckpointToastToggleRow: document.getElementById("addTaskCheckpointToastToggleRow"),
    addTaskCheckpointToastToggle: document.getElementById("addTaskCheckpointToastToggle"),
    addTaskCheckpointToastModeField: document.getElementById("addTaskCheckpointToastModeField"),
    addTaskCheckpointToastModeSelect: document.getElementById("addTaskCheckpointToastModeSelect") as HTMLSelectElement | null,
    addTaskCheckpointAlertsNote: document.getElementById("addTaskCheckpointAlertsNote"),
    addTaskTimerSettingsGroup: document.getElementById("addTaskTimerSettingsGroup"),
    addTaskPresetIntervalsToggleRow: document.getElementById("addTaskPresetIntervalsToggleRow"),
    addTaskPresetIntervalsToggle: document.getElementById("addTaskPresetIntervalsToggle"),
    addTaskPresetIntervalField: document.getElementById("addTaskPresetIntervalField"),
    addTaskPresetIntervalInput: document.getElementById("addTaskPresetIntervalInput") as HTMLInputElement | null,
    addTaskPresetIntervalNote: document.getElementById("addTaskPresetIntervalNote"),
    addTaskFinalCheckpointActionField: document.getElementById("addTaskFinalCheckpointActionField"),
    addTaskFinalCheckpointActionSelect: document.getElementById("addTaskFinalCheckpointActionSelect") as HTMLSelectElement | null,
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
    groupsFriendsSection: document.getElementById("groupsFriendsSection"),
    openFriendRequestModalBtn: document.getElementById("openFriendRequestModalBtn") as HTMLButtonElement | null,
    friendRequestModal: document.getElementById("friendRequestModal"),
    friendRequestUserIdInput: document.getElementById("friendRequestUserIdInput") as HTMLInputElement | null,
    friendRequestTokenInput: document.getElementById("friendRequestTokenInput") as HTMLInputElement | null,
    friendRequestCancelBtn: document.getElementById("friendRequestCancelBtn") as HTMLButtonElement | null,
    friendRequestSendBtn: document.getElementById("friendRequestSendBtn") as HTMLButtonElement | null,
    groupsIncomingRequestsList: document.getElementById("groupsIncomingRequestsList"),
    groupsOutgoingRequestsList: document.getElementById("groupsOutgoingRequestsList"),
    groupsFriendsList: document.getElementById("groupsFriendsList"),
    groupsFriendRequestStatus: document.getElementById("groupsFriendRequestStatus"),
    footerTasksBtn: document.getElementById("footerTasksBtn") as HTMLButtonElement | null,
    footerDashboardBtn: document.getElementById("footerDashboardBtn") as HTMLButtonElement | null,
    footerTest1Btn: document.getElementById("footerTest1Btn") as HTMLButtonElement | null,
    footerTest2Btn: document.getElementById("footerTest2Btn") as HTMLButtonElement | null,
    footerSettingsBtn: document.getElementById("footerSettingsBtn") as HTMLButtonElement | null,
    signedInHeaderBadge: document.getElementById("signedInHeaderBadge") as HTMLElement | null,
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
    focusCheckpointLog: document.getElementById("focusCheckpointLog"),
    focusCheckpointLogEmpty: document.getElementById("focusCheckpointLogEmpty"),
    focusCheckpointLogList: document.getElementById("focusCheckpointLogList"),
    focusTaskName: document.getElementById("focusTaskName"),
    focusTimerDays: document.getElementById("focusTimerDays"),
    focusTimerClock: document.getElementById("focusTimerClock"),
    focusStartBtn: document.getElementById("focusStartBtn") as HTMLButtonElement | null,
    focusStopBtn: document.getElementById("focusStopBtn") as HTMLButtonElement | null,
    focusResetBtn: document.getElementById("focusResetBtn") as HTMLButtonElement | null,
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
    editCheckpointSoundModeField: document.getElementById("editCheckpointSoundModeField"),
    editCheckpointSoundModeSelect: document.getElementById("editCheckpointSoundModeSelect") as HTMLSelectElement | null,
    editCheckpointAlertsGroup: document.getElementById("editCheckpointAlertsGroup"),
    editCheckpointToastToggleRow: document.getElementById("editCheckpointToastToggleRow"),
    editCheckpointToastToggle: document.getElementById("editCheckpointToastToggle"),
    editCheckpointToastModeField: document.getElementById("editCheckpointToastModeField"),
    editCheckpointToastModeSelect: document.getElementById("editCheckpointToastModeSelect") as HTMLSelectElement | null,
    editCheckpointAlertsNote: document.getElementById("editCheckpointAlertsNote"),
    editTimerSettingsGroup: document.getElementById("editTimerSettingsGroup"),
    editPresetIntervalsToggleRow: document.getElementById("editPresetIntervalsToggleRow"),
    editPresetIntervalsToggle: document.getElementById("editPresetIntervalsToggle"),
    editPresetIntervalField: document.getElementById("editPresetIntervalField"),
    editPresetIntervalInput: document.getElementById("editPresetIntervalInput") as HTMLInputElement | null,
    editPresetIntervalNote: document.getElementById("editPresetIntervalNote"),
    editFinalCheckpointActionField: document.getElementById("editFinalCheckpointActionField"),
    editFinalCheckpointActionSelect: document.getElementById("editFinalCheckpointActionSelect") as HTMLSelectElement | null,
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
    saveEditBtn: document.getElementById("saveEditBtn") as HTMLButtonElement | null,
    editValidationError: document.getElementById("editValidationError"),
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
    const capacitorApi = (window as any).Capacitor;
    const isNativeCapacitorRuntime = !!(
      capacitorApi &&
      typeof capacitorApi.isNativePlatform === "function" &&
      capacitorApi.isNativePlatform()
    );
    const usesExportedHtmlPaths =
      window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
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

  function normalizedPathname() {
    try {
      return (window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  }

  function screenTokenForCurrent(pageOverride?: "tasks" | "dashboard" | "test1" | "test2") {
    const path = normalizedPathname();
    if (/\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path)) {
      const page = pageOverride || currentAppPage || "tasks";
      return `app:${path}|page=${page}`;
    }
    return `route:${path}`;
  }

  function parseAppPageFromToken(token: string | null | undefined): "tasks" | "dashboard" | "test1" | "test2" | null {
    const m = String(token || "").match(/\|page=(tasks|dashboard|test1|test2)$/);
    if (!m) return null;
    const p = m[1];
    if (p === "tasks" || p === "dashboard" || p === "test1" || p === "test2") return p;
    return null;
  }

  function loadNavStack(): string[] {
    return Array.isArray(navStackMemory) ? navStackMemory.slice() : [];
  }

  function saveNavStack(stack: string[]) {
    navStackMemory = (Array.isArray(stack) ? stack : []).slice(-50);
  }

  function pushCurrentScreenToNavStack(pageOverride?: "tasks" | "dashboard" | "test1" | "test2") {
    if (suppressNavStackPush) return;
    const token = screenTokenForCurrent(pageOverride);
    const stack = loadNavStack();
    if (stack[stack.length - 1] === token) return;
    stack.push(token);
    saveNavStack(stack);
  }

  function ensureNavStackCurrentScreen() {
    pushCurrentScreenToNavStack();
  }

  function navigateToAppRoute(path: string) {
    pushCurrentScreenToNavStack();
    window.location.href = appRoute(path);
  }

  function exitAppNow() {
    try {
      const capApp = (window as any)?.Capacitor?.Plugins?.App;
      if (capApp?.exitApp) {
        capApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      const navApp = (navigator as any)?.app;
      if (navApp?.exitApp) {
        navApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      window.close();
    } catch {
      // ignore
    }
  }

  function showExitAppConfirm() {
    confirm("Exit App", "Do you want to exit the app?", {
      okLabel: "Yes",
      cancelLabel: "Cancel",
      onOk: () => {
        closeConfirm();
        exitAppNow();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function closeTopOverlayIfOpen() {
    const openOverlays = Array.from(document.querySelectorAll(".overlay")).filter((el) => {
      const node = el as HTMLElement;
      return getComputedStyle(node).display !== "none";
    }) as HTMLElement[];
    if (!openOverlays.length) return false;
    const top = openOverlays[openOverlays.length - 1];
    if (top.id === "editOverlay") {
      closeEdit(false);
      return true;
    }
    if (top.id === "elapsedPadOverlay") {
      closeElapsedPad(false);
      return true;
    }
    if (top.id === "confirmOverlay") {
      closeConfirm();
      return true;
    }
    closeOverlay(top);
    return true;
  }

  function handleAppBackNavigation(): boolean {
    if (closeTopOverlayIfOpen()) return true;

    const path = normalizedPathname();
    const stack = loadNavStack();
    const currentToken = screenTokenForCurrent();
    while (stack.length && stack[stack.length - 1] === currentToken) stack.pop();
    const prevToken = stack.pop() || null;
    saveNavStack(stack);

    if (!prevToken) {
      showExitAppConfirm();
      return true;
    }

    const prevAppPage = parseAppPageFromToken(prevToken);
    const prevIsSameRoot = prevToken.startsWith("app:") && (/\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path));
    if (prevIsSameRoot && prevAppPage) {
      suppressNavStackPush = true;
      applyAppPage(prevAppPage);
      suppressNavStackPush = false;
      return true;
    }

    if (prevToken.startsWith("route:")) {
      const routePath = prevToken.slice("route:".length);
      const target = routePath.endsWith(".html") || window.location.protocol === "file:" ? routePath : `${routePath}`;
      window.location.href = target;
      return true;
    }

    if (prevToken.startsWith("app:")) {
      const routePart = prevToken.slice("app:".length).split("|")[0] || "/tasktimer";
      const page = prevAppPage;
      const qs = page && page !== "tasks" ? `?page=${page}` : "";
      window.location.href = `${routePart}${qs}`;
      return true;
    }

    showExitAppConfirm();
    return true;
  }

  function initMobileBackHandling() {
    ensureNavStackCurrentScreen();

    const onPopState = () => {
      const path = normalizedPathname();
      if (!(/\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path))) return;
      const nextPage = getInitialAppPageFromQuery();
      suppressNavStackPush = true;
      applyAppPage(nextPage);
      suppressNavStackPush = false;
    };
    on(window, "popstate", onPopState as any);

    on(document as any, "backbutton", (e: any) => {
      e?.preventDefault?.();
      handleAppBackNavigation();
    });

    try {
      const capApp = (window as any)?.Capacitor?.Plugins?.App;
      if (capApp?.addListener) {
        const maybePromise = capApp.addListener("backButton", (ev: any) => {
          try {
            ev?.preventDefault?.();
          } catch {
            // ignore
          }
          handleAppBackNavigation();
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then((h: any) => {
            if (h?.remove) removeCapBackListener = () => h.remove();
          }).catch(() => {});
        } else if (maybePromise?.remove) {
          removeCapBackListener = () => maybePromise.remove();
        }
      }
    } catch {
      // ignore
    }
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
      checkpointSoundMode: "once",
      checkpointToastEnabled: false,
      checkpointToastMode: "auto5s",
      finalCheckpointAction: "continue",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
      presetIntervalLastMilestoneId: null,
      presetIntervalNextSeq: 1,
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
      // Prevent duplicate default-task writes for signed-in users.
      // Cloud hydration runs asynchronously; creating defaults before it completes
      // can repeatedly insert new task IDs into Firestore across app startups.
      const uid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
      if (uid) {
        tasks = [];
        return;
      }
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
      t.checkpointSoundMode = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = !!t.checkpointToastEnabled;
      t.checkpointToastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
      t.finalCheckpointAction =
        t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog"
          ? t.finalCheckpointAction
          : "continue";
    });
  }

  function ensureMilestoneIdentity(task: Task) {
    if (!task || !Array.isArray(task.milestones)) return;
    let nextSeq = 1;
    let maxSeq = 0;
    task.milestones.forEach((m) => {
      if (!m) return;
      if (!m.id) m.id = cryptoRandomId();
      const mAny = m as any;
      if (!Number.isFinite(+mAny.createdSeq) || (+mAny.createdSeq || 0) <= 0) {
        mAny.createdSeq = nextSeq++;
      }
      maxSeq = Math.max(maxSeq, +mAny.createdSeq || 0);
    });
    const taskAny = task as any;
    const currentNext = Number.isFinite(+taskAny.presetIntervalNextSeq)
      ? Math.max(1, Math.floor(+taskAny.presetIntervalNextSeq))
      : 1;
    taskAny.presetIntervalNextSeq = Math.max(currentNext, maxSeq + 1);
    if (taskAny.presetIntervalLastMilestoneId) {
      const exists = task.milestones.some((m) => String(m.id || "") === String(taskAny.presetIntervalLastMilestoneId || ""));
      if (!exists) taskAny.presetIntervalLastMilestoneId = null;
    }
  }

  function hasValidPresetInterval(task: Task | null | undefined) {
    const taskAny = task as any;
    return !!task && Number.isFinite(+taskAny?.presetIntervalValue) && +taskAny.presetIntervalValue > 0;
  }

  function getPresetIntervalValueNum(task: Task | null | undefined) {
    const taskAny = task as any;
    return Number.isFinite(+taskAny?.presetIntervalValue) ? Math.max(0, +taskAny.presetIntervalValue) : 0;
  }

  function getPresetIntervalNextSeqNum(task: Task | null | undefined) {
    const taskAny = task as any;
    return Number.isFinite(+taskAny?.presetIntervalNextSeq) ? Math.max(1, Math.floor(+taskAny.presetIntervalNextSeq)) : 1;
  }

  function getPresetIntervalLastMilestone(task: Task | null | undefined) {
    if (!task || !Array.isArray(task.milestones) || task.milestones.length === 0) return null;
    const taskAny = task as any;
    ensureMilestoneIdentity(task);
    const lastId = String(taskAny.presetIntervalLastMilestoneId || "");
    let match = task.milestones.find((m) => String(m.id || "") === lastId) || null;
    if (match) return match;
    match =
      task.milestones
        .slice()
        .sort((a, b) => (+((a as any).createdSeq) || 0) - (+((b as any).createdSeq) || 0))
        .pop() || null;
    if (match?.id) taskAny.presetIntervalLastMilestoneId = String(match.id);
    return match;
  }

  function addMilestoneWithCurrentPreset(task: Task) {
    const taskAny = task as any;
    task.milestones = Array.isArray(task.milestones) ? task.milestones : [];
    ensureMilestoneIdentity(task);
    const interval = Math.max(0, +taskAny.presetIntervalValue || 0);
    const last = getPresetIntervalLastMilestone(task);
    const nextHours = Math.max(0, (last ? +last.hours || 0 : 0) + interval);
    const nextSeq = Math.max(1, Math.floor(+taskAny.presetIntervalNextSeq || 1));
    const milestone = { id: cryptoRandomId(), createdSeq: nextSeq, hours: nextHours, description: "" };
    task.milestones.push(milestone);
    taskAny.presetIntervalLastMilestoneId = milestone.id;
    taskAny.presetIntervalNextSeq = nextSeq + 1;
    task.milestones = sortMilestones(task.milestones);
  }

  function regeneratePresetIntervalMilestones(task: Task) {
    if (!task || !Array.isArray(task.milestones) || task.milestones.length === 0) return;
    if (!hasValidPresetInterval(task)) return;
    const taskAny = task as any;
    ensureMilestoneIdentity(task);
    const interval = Math.max(0, +taskAny.presetIntervalValue || 0);
    const ordered = task.milestones.slice().sort((a, b) => (+((a as any).createdSeq) || 0) - (+((b as any).createdSeq) || 0));
    ordered.forEach((m, idx) => {
      m.hours = interval * (idx + 1);
    });
    const last = ordered[ordered.length - 1];
    taskAny.presetIntervalLastMilestoneId = last?.id ? String(last.id) : null;
    task.milestones = sortMilestones(ordered);
  }

  function savePendingTaskJump(taskId: string | null) {
    pendingTaskJumpMemory = taskId ? String(taskId) : null;
  }

  function loadPendingTaskJump() {
    const raw = String(pendingTaskJumpMemory || "").trim();
    return raw || null;
  }

  function jumpToTaskById(taskId: string) {
    const targetId = String(taskId || "").trim();
    if (!targetId) return;
    const t = tasks.find((x) => String(x.id || "") === targetId);
    if (!t) return;
    if (focusModeTaskId || ((els.focusModeScreen as HTMLElement | null)?.style.display !== "none" && (els.focusModeScreen as HTMLElement | null)?.getAttribute("aria-hidden") !== "true")) {
      closeFocusMode();
    }
    const mode = taskModeOf(t);
    if (currentMode !== mode) applyMainMode(mode);
    applyAppPage("tasks", { syncUrl: "push" });
    window.setTimeout(() => {
      const list = els.taskList;
      if (!list) return;
      const sel = `.task[data-task-id="${targetId.replace(/"/g, '\\"')}"]`;
      const el = list.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollIntoView();
      }
      el.classList.add("taskJumpFlash");
      window.setTimeout(() => el.classList.remove("taskJumpFlash"), 1400);
    }, 70);
  }

  function maybeHandlePendingTaskJump() {
    const taskId = loadPendingTaskJump();
    if (!taskId) return;
    savePendingTaskJump(null);
    jumpToTaskById(taskId);
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
    const taskUi = cloudTaskUiCache || loadCachedTaskUi();
    if (!taskUi) return;
    Object.keys(taskUi.historyRangeDaysByTaskId || {}).forEach((taskId) => {
      const value = (taskUi.historyRangeDaysByTaskId as any)[taskId];
      historyRangeDaysByTaskId[taskId] = value === 14 ? 14 : 7;
    });
    Object.keys(taskUi.historyRangeModeByTaskId || {}).forEach((taskId) => {
      const value = (taskUi.historyRangeModeByTaskId as any)[taskId];
      historyRangeModeByTaskId[taskId] = value === "day" ? "day" : "entries";
    });
  }

  function saveHistoryRangePref(taskId: string, rangeDays: 7 | 14) {
    if (!taskId) return;
    historyRangeDaysByTaskId[taskId] = rangeDays;
    persistTaskUiToCloud();
  }

  function saveHistoryRangeModePref(taskId: string, rangeMode: "entries" | "day") {
    if (!taskId) return;
    historyRangeModeByTaskId[taskId] = rangeMode;
    persistTaskUiToCloud();
  }

  function applyDashboardOrderFromStorage() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const dashboard = cloudDashboardCache || loadCachedDashboard();
    const order = Array.isArray(dashboard?.order) ? dashboard?.order : [];
    if (!order.length) return;
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
  }

  function saveDashboardOrder() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const order = getCurrentDashboardOrder();
    cloudDashboardCache = { order };
    saveCloudDashboard(cloudDashboardCache);
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

  function shouldIgnoreTaskDragStart(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest(
      ".actions, .taskMenu, .taskMenuList, .historyInline, .historyCanvasWrap, .progressRow, button, summary, details, canvas, input, select, textarea"
    );
  }

  function persistTaskOrderFromTaskListDom() {
    if (!els.taskList) return;
    const domTaskIds = Array.from(els.taskList.querySelectorAll(".task[data-task-id]"))
      .map((el) => String((el as HTMLElement).dataset.taskId || ""))
      .filter(Boolean);
    if (!domTaskIds.length) return;

    const byId = new Map(tasks.map((t) => [String(t.id || ""), t] as const));
    const domModeTasks: Task[] = [];
    domTaskIds.forEach((id) => {
      const t = byId.get(id);
      if (t && taskModeOf(t) === currentMode) domModeTasks.push(t);
    });
    if (!domModeTasks.length) return;

    const sortedAll = tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    let modePtr = 0;
    const merged = sortedAll.map((t) => {
      if (taskModeOf(t) !== currentMode) return t;
      const next = domModeTasks[modePtr++];
      return next || t;
    });

    merged.forEach((t, idx) => {
      t.order = idx + 1;
    });
    tasks = merged;
    save();
  }

  function safeJsonParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function currentUid() {
    return String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
  }

  function persistPreferencesToCloud() {
    const uid = currentUid();
    if (!uid) return;
    cloudPreferencesCache = {
      schemaVersion: 1,
      theme: themeMode,
      defaultTaskTimerFormat,
      dynamicColorsEnabled,
      checkpointAlertSoundEnabled,
      checkpointAlertToastEnabled,
      modeSettings: {
        mode1: { label: modeLabels.mode1, enabled: true, color: modeColors.mode1 },
        mode2: { label: modeLabels.mode2, enabled: !!modeEnabled.mode2, color: modeColors.mode2 },
        mode3: { label: modeLabels.mode3, enabled: !!modeEnabled.mode3, color: modeColors.mode3 },
      },
      updatedAtMs: Date.now(),
    };
    saveCloudPreferences(cloudPreferencesCache);
  }

  function persistTaskUiToCloud() {
    const uid = currentUid();
    if (!uid) return;
    cloudTaskUiCache = {
      historyRangeDaysByTaskId,
      historyRangeModeByTaskId,
      pinnedHistoryTaskIds: Array.from(pinnedHistoryTaskIds),
      customTaskNames: addTaskCustomNames.slice(0, 5),
    };
    saveCloudTaskUi(cloudTaskUiCache);
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
    persistPreferencesToCloud();
  }

  function loadModeLabels() {
    modeLabels = { ...DEFAULT_MODE_LABELS };
    modeEnabled = { ...DEFAULT_MODE_ENABLED };
    modeColors = { ...DEFAULT_MODE_COLORS };
    try {
      const parsed = (cloudPreferencesCache || loadCachedPreferences())?.modeSettings;
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
      modeLabels = { ...DEFAULT_MODE_LABELS };
      modeEnabled = { ...DEFAULT_MODE_ENABLED };
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
      tasks: (tasks || []).map((t) => ({
        ...t,
        milestonesEnabled: !!t.milestonesEnabled,
        milestoneTimeUnit:
          t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour",
        milestones: sortMilestones(Array.isArray(t.milestones) ? t.milestones.slice() : []).map((m) => ({
          id: String((m as any)?.id || cryptoRandomId()),
          createdSeq: Number.isFinite(+(m as any)?.createdSeq) ? Math.max(1, Math.floor(+(m as any).createdSeq)) : undefined,
          hours: Number.isFinite(+m.hours) ? +m.hours : 0,
          description: String(m.description || ""),
        })),
        checkpointSoundEnabled: !!t.checkpointSoundEnabled,
        checkpointSoundMode: t.checkpointSoundMode === "repeat" ? "repeat" : "once",
        checkpointToastEnabled: !!t.checkpointToastEnabled,
        checkpointToastMode: t.checkpointToastMode === "manual" ? "manual" : "auto5s",
        finalCheckpointAction:
          t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog"
            ? t.finalCheckpointAction
            : "continue",
        presetIntervalsEnabled: !!t.presetIntervalsEnabled,
        presetIntervalValue: getPresetIntervalValueNum(t),
        presetIntervalLastMilestoneId: t.presetIntervalLastMilestoneId ? String(t.presetIntervalLastMilestoneId) : null,
        presetIntervalNextSeq: getPresetIntervalNextSeqNum(t),
      })),
      history: historyByTaskId || {},
    };
  }

  function makeSingleTaskExportPayload(t: Task) {
    const taskId = String(t?.id || "");
    return {
      schema: "taskticka_backup_v1",
      exportedAt: new Date().toISOString(),
      tasks: [
        {
          ...t,
          milestonesEnabled: !!t.milestonesEnabled,
          milestoneTimeUnit:
            t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour",
          milestones: sortMilestones(Array.isArray(t.milestones) ? t.milestones.slice() : []).map((m) => ({
            id: String((m as any)?.id || cryptoRandomId()),
            createdSeq: Number.isFinite(+(m as any)?.createdSeq) ? Math.max(1, Math.floor(+(m as any).createdSeq)) : undefined,
            hours: Number.isFinite(+m.hours) ? +m.hours : 0,
            description: String(m.description || ""),
          })),
          checkpointSoundEnabled: !!t.checkpointSoundEnabled,
          checkpointSoundMode: t.checkpointSoundMode === "repeat" ? "repeat" : "once",
          checkpointToastEnabled: !!t.checkpointToastEnabled,
          checkpointToastMode: t.checkpointToastMode === "manual" ? "manual" : "auto5s",
          finalCheckpointAction:
            t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog"
              ? t.finalCheckpointAction
              : "continue",
          presetIntervalsEnabled: !!t.presetIntervalsEnabled,
          presetIntervalValue: getPresetIntervalValueNum(t),
          presetIntervalLastMilestoneId: t.presetIntervalLastMilestoneId ? String(t.presetIntervalLastMilestoneId) : null,
          presetIntervalNextSeq: getPresetIntervalNextSeqNum(t),
        },
      ],
      history: taskId ? { [taskId]: Array.isArray(historyByTaskId?.[taskId]) ? (historyByTaskId[taskId] || []).slice() : [] } : {},
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

  function exportTask(i: number) {
    const t = tasks[i];
    if (!t) return;
    const d = new Date();
    const dd = formatTwo(d.getDate());
    const mm = formatTwo(d.getMonth() + 1);
    const yyyy = String(d.getFullYear());
    const safeTaskName = String(t.name || "task")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "task";
    const filename = `tasktimer-export-${safeTaskName}${dd}${mm}${yyyy}.json`;
    const payload = makeSingleTaskExportPayload(t);
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
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
          id: m?.id ? String(m.id) : cryptoRandomId(),
          createdSeq: Number.isFinite(+m?.createdSeq) ? Math.max(1, Math.floor(+m.createdSeq)) : undefined,
          hours: Number.isFinite(+m.hours) ? +m.hours : 0,
          description: String(m.description || ""),
        }))
      : [];
    out.milestones = sortMilestones(out.milestones);
    out.hasStarted = !!t.hasStarted;
    out.checkpointSoundEnabled = !!t.checkpointSoundEnabled;
    out.checkpointSoundMode = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
    out.checkpointToastEnabled = !!t.checkpointToastEnabled;
    out.checkpointToastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
    out.finalCheckpointAction =
      t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog" ? t.finalCheckpointAction : "continue";
    out.presetIntervalsEnabled = !!t.presetIntervalsEnabled;
    out.presetIntervalValue = getPresetIntervalValueNum(t as any);
    out.presetIntervalLastMilestoneId = t.presetIntervalLastMilestoneId ? String(t.presetIntervalLastMilestoneId) : null;
    out.presetIntervalNextSeq = getPresetIntervalNextSeqNum(t as any);
    ensureMilestoneIdentity(out);
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

  function hasNonPositiveCheckpoint(milestones: Task["milestones"] | null | undefined): boolean {
    if (!Array.isArray(milestones) || milestones.length === 0) return false;
    return milestones.some((m) => !(Number(+m.hours) > 0));
  }

  function clearEditValidationState() {
    els.editValidationError?.classList.remove("isOn");
    if (els.editValidationError) els.editValidationError.textContent = "";
    els.msArea?.classList.remove("isInvalid");
    els.editPresetIntervalField?.classList.remove("isInvalid");
    els.msList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function clearAddTaskValidationState() {
    els.addTaskError?.classList.remove("isOn");
    if (els.addTaskError) els.addTaskError.textContent = "";
    els.addTaskName?.classList.remove("isInvalid");
    els.addTaskMsArea?.classList.remove("isInvalid");
    els.addTaskPresetIntervalField?.classList.remove("isInvalid");
    els.addTaskMsList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function applyAddTaskCheckpointValidationHighlights(opts?: {
    name?: boolean;
    checkpoints?: boolean;
    checkpointRows?: boolean;
    presetInterval?: boolean;
  }) {
    const options = opts || {};
    els.addTaskName?.classList.toggle("isInvalid", !!options.name);
    els.addTaskMsArea?.classList.toggle("isInvalid", !!options.checkpoints || !!options.checkpointRows);
    els.addTaskPresetIntervalField?.classList.toggle("isInvalid", !!options.presetInterval);
    const rows = Array.from(els.addTaskMsList?.querySelectorAll?.(".msRow") || []);
    rows.forEach((row, idx) => {
      const m = addTaskMilestones[idx];
      const invalid = !!options.checkpointRows && !!m && !(Number(+m.hours) > 0);
      row.classList.toggle("isInvalid", invalid);
    });
  }

  function showAddTaskValidationError(
    msg: string,
    opts?: { name?: boolean; checkpoints?: boolean; checkpointRows?: boolean; presetInterval?: boolean }
  ) {
    clearAddTaskValidationState();
    applyAddTaskCheckpointValidationHighlights(opts);
    if (els.addTaskError) {
      els.addTaskError.textContent = msg;
      els.addTaskError.classList.add("isOn");
    }
  }

  function applyEditCheckpointValidationHighlights(task: Task | null | undefined) {
    if (!task) return;
    const noCheckpoints = !!task.milestonesEnabled && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const invalidCheckpointTimes = !!task.milestonesEnabled && hasNonPositiveCheckpoint(task.milestones);
    const invalidPresetInterval = !!task.milestonesEnabled && !!task.presetIntervalsEnabled && !hasValidPresetInterval(task);

    els.msArea?.classList.toggle("isInvalid", noCheckpoints || invalidCheckpointTimes);
    els.editPresetIntervalField?.classList.toggle("isInvalid", invalidPresetInterval);

    const msRows = Array.from(els.msList?.querySelectorAll?.(".msRow") || []);
    const msSorted = Array.isArray(task.milestones) ? task.milestones.slice() : [];
    msRows.forEach((row, idx) => {
      const m = msSorted[idx];
      const invalid = !!task.milestonesEnabled && !!m && !(Number(+m.hours) > 0);
      row.classList.toggle("isInvalid", invalid);
    });
  }

  function showEditValidationError(task: Task | null | undefined, msg: string) {
    if (!task) return;
    applyEditCheckpointValidationHighlights(task);
    if (els.editValidationError) {
      els.editValidationError.textContent = msg;
      els.editValidationError.classList.add("isOn");
    }
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
    syncEditSaveAvailability(t);
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
        <div class="pill msSkewField">${escapeHtmlUI(String(+m.hours || 0))}${milestoneUnitSuffix(tempTask)}</div>
        <input class="msSkewInput" type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">&times;</button>
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

  function syncAddTaskCheckpointAlertUi() {
    const checkpointsEnabled = !!addTaskMilestonesEnabled;
    const presetEnabled = checkpointsEnabled && !!addTaskPresetIntervalsEnabled;
    const validPreset = (Number(addTaskPresetIntervalValue) || 0) > 0;

    els.addTaskTimerSettingsGroup?.classList.toggle("isHidden", !checkpointsEnabled);
    els.addTaskCheckpointAlertsGroup?.classList.toggle("isHidden", !checkpointsEnabled);

    toggleSwitchElement(els.addTaskPresetIntervalsToggle as HTMLElement | null, presetEnabled);
    if (els.addTaskPresetIntervalInput) {
      els.addTaskPresetIntervalInput.value = String(Number(addTaskPresetIntervalValue || 0) || 0);
    }
    els.addTaskPresetIntervalField?.classList.toggle("isHidden", !presetEnabled);
    if (els.addTaskPresetIntervalNote) {
      const showPresetNote = presetEnabled && !validPreset;
      (els.addTaskPresetIntervalNote as HTMLElement).style.display = showPresetNote ? "block" : "none";
      (els.addTaskPresetIntervalNote as HTMLElement).textContent = showPresetNote
        ? "Enter a preset interval greater than 0 to add checkpoints."
        : "";
    }

    toggleSwitchElement(els.addTaskCheckpointSoundToggle as HTMLElement | null, checkpointsEnabled && !!addTaskCheckpointSoundEnabled);
    toggleSwitchElement(els.addTaskCheckpointToastToggle as HTMLElement | null, checkpointsEnabled && !!addTaskCheckpointToastEnabled);
    if (els.addTaskCheckpointSoundModeSelect) {
      els.addTaskCheckpointSoundModeSelect.value = addTaskCheckpointSoundMode === "repeat" ? "repeat" : "once";
    }
    if (els.addTaskCheckpointToastModeSelect) {
      els.addTaskCheckpointToastModeSelect.value = addTaskCheckpointToastMode === "manual" ? "manual" : "auto5s";
    }
    if (els.addTaskFinalCheckpointActionSelect) {
      els.addTaskFinalCheckpointActionSelect.value =
        addTaskFinalCheckpointAction === "resetLog" || addTaskFinalCheckpointAction === "resetNoLog"
          ? addTaskFinalCheckpointAction
          : "continue";
    }

    const soundAvailable = checkpointAlertSoundEnabled;
    const toastAvailable = checkpointAlertToastEnabled;
    els.addTaskCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointsEnabled || !soundAvailable);
    els.addTaskCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointsEnabled || !toastAvailable);
    els.addTaskCheckpointSoundModeField?.classList.toggle(
      "isHidden",
      !checkpointsEnabled || !soundAvailable || !addTaskCheckpointSoundEnabled
    );
    els.addTaskCheckpointToastModeField?.classList.toggle(
      "isHidden",
      !checkpointsEnabled || !toastAvailable || !addTaskCheckpointToastEnabled
    );
    if (els.addTaskCheckpointAlertsNote) {
      const notes: string[] = [];
      if (!soundAvailable) notes.push("sound alerts are disabled globally");
      if (!toastAvailable) notes.push("toast alerts are disabled globally");
      (els.addTaskCheckpointAlertsNote as HTMLElement).style.display = checkpointsEnabled && notes.length ? "block" : "none";
      (els.addTaskCheckpointAlertsNote as HTMLElement).textContent = notes.length
        ? `Checkpoint alerts are currently unavailable because ${notes.join(" and ")}.`
        : "";
    }

    if (els.addTaskAddMsBtn) {
      const blocked = checkpointsEnabled && presetEnabled && !validPreset;
      els.addTaskAddMsBtn.disabled = blocked;
      els.addTaskAddMsBtn.title = blocked ? "Enter a preset interval greater than 0" : "";
    }
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
      const hasActiveToastForTask =
        !!activeCheckpointToast?.taskId && String(activeCheckpointToast.taskId) === String(t.id || "");
      taskEl.className =
        "task" +
        (t.collapsed ? " collapsed" : "") +
        ((checkpointRepeatActiveTaskId && checkpointRepeatActiveTaskId === String(t.id || "")) || hasActiveToastForTask
          ? " taskAlertPulse"
          : "");
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = String(t.id || "");
      taskEl.setAttribute("draggable", "true");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";

      let progressHTML = "";
      if (hasMilestones) {
        let markers = "";
        const unitSuffix = milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;

        const nextPendingIndex = msSorted.findIndex((m) => elapsedSec < (+m.hours || 0) * milestoneUnitSec(t));
        const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, msSorted.length - 1);

        msSorted.forEach((m, msIdx) => {
          const val = +m.hours || 0;
          const left = Math.min((val / (maxValue || 1)) * 100, 100);
          const reached = elapsedSec >= val * milestoneUnitSec(t);
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${val}${unitSuffix}`;
          const desc = (m.description || "").trim();
          const edgeCls = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
          const leftPos = edgeCls === "mkEdgeL" ? 0 : edgeCls === "mkEdgeR" ? 100 : left;
          const wrapCls = edgeCls && label.length > 8 ? "mkWrap8" : "";
          const showCheckpointLabel = msIdx === labelTargetIndex;
          markers += `
            <div class="mkFlag ${cls}" style="left:${leftPos}%"></div>
            ${
              showCheckpointLabel
                ? `<div class="mkTime ${cls} ${edgeCls} ${wrapCls}" style="left:${leftPos}%">${escapeHtmlUI(label)}</div>`
                : ``
            }
            ${
              showCheckpointLabel && desc
                ? `<div class="mkDesc ${cls} ${edgeCls}" style="left:${leftPos}%">${escapeHtmlUI(desc)}</div>`
                : ``
            }`;
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
        ${
          checkpointRepeatActiveTaskId && checkpointRepeatActiveTaskId === taskId
            ? '<button class="iconBtn checkpointMuteBtn" data-action="muteCheckpointAlert" title="Mute checkpoint alert" aria-label="Mute checkpoint alert">&#128276;</button>'
            : ""
        }
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
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
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

  function resetTaskStateImmediate(t: Task, opts?: { logHistory?: boolean }) {
    if (!t) return;
    if (!!opts?.logHistory && canLogSession(t)) {
      const ms = getTaskElapsedMs(t);
      if (ms > 0) appendHistory(t.id, { ts: nowMs(), name: t.name, ms, color: sessionColorForTaskMs(t, ms) });
    }
    t.accumulatedMs = 0;
    t.running = false;
    t.startMs = null;
    t.hasStarted = false;
    resetCheckpointAlertTracking(t.id);
    checkpointAutoResetDirty = true;
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

        resetTaskStateImmediate(t, { logHistory: doLog });

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
    syncEditSaveAvailability(t);
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
    if (els.msArea && "open" in (els.msArea as any)) {
      (els.msArea as HTMLDetailsElement).open = false;
    }
    setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour");

    renderMilestoneEditor(t);
    ensureMilestoneIdentity(t);
    if (els.editPresetIntervalInput) els.editPresetIntervalInput.value = String(Number(t.presetIntervalValue || 0) || 0);
    toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    syncEditCheckpointAlertUi(t);
    editDraftSnapshot = buildEditDraftSnapshot(t);
    clearEditValidationState();
    syncEditSaveAvailability(t);

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const t = editIndex != null ? tasks[editIndex] : null;

    if (saveChanges && t) {
      if (t.milestonesEnabled && (!Array.isArray(t.milestones) || t.milestones.length === 0)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Add at least 1 timer checkpoint before saving.");
        return;
      }
      if (t.milestonesEnabled && hasNonPositiveCheckpoint(t.milestones)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Checkpoint times must be greater than 0.");
        return;
      }
      if (t.milestonesEnabled && t.presetIntervalsEnabled && !hasValidPresetInterval(t)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Enter a preset interval greater than 0.");
        return;
      }
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
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
      t.presetIntervalsEnabled = isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null);
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      t.finalCheckpointAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : "continue";

      ensureMilestoneIdentity(t);
      t.milestones = sortMilestones(t.milestones);
      const moveMode = editMoveTargetMode || taskModeOf(t);
      if ((moveMode === "mode1" || moveMode === "mode2" || moveMode === "mode3") && isModeEnabled(moveMode)) {
        (t as any).mode = moveMode;
      }

      save();
      render();
    }

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    clearEditValidationState();
    closeElapsedPad(false);
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    editIndex = null;
    editDraftSnapshot = "";
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
              const parsed = parseFloat(elapsedPadDraft || "");
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
    if (editIndex != null && tasks[editIndex]) {
      syncEditCheckpointAlertUi(tasks[editIndex]);
      syncEditSaveAvailability(tasks[editIndex]);
    }
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = null;
    elapsedPadDraft = "";
    elapsedPadOriginal = "";
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const raw = `${elapsedPadDraft || ""}${digit}`;
    const next = raw.includes(".") ? raw : raw.replace(/^0+(?=\d)/, "");
    elapsedPadDraft = next.slice(0, 6) || "0";
    renderElapsedPadDisplay();
  }

  function padAppendDot() {
    clearElapsedPadError();
    if (!elapsedPadMilestoneRef || elapsedPadTarget) return;
    const current = elapsedPadDraft || "0";
    if (current.includes(".")) return;
    elapsedPadDraft = `${current}.`;
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

    let hb: Record<string, any[]> = (loadHistory() as Record<string, any[]>) || {};
    if (!hb || typeof hb !== "object") hb = {};

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
    renderFocusCheckpointCompletionLog(t);
    syncFocusRunButtons(t);
    updateFocusInsights(t);
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
  }

  function closeFocusMode() {
    const focusScreenEl = els.focusModeScreen as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    if (focusScreenEl && activeEl && focusScreenEl.contains(activeEl)) {
      if (els.footerTasksBtn && typeof els.footerTasksBtn.focus === "function") {
        els.footerTasksBtn.focus();
      } else if (els.mode1Btn && typeof els.mode1Btn.focus === "function") {
        els.mode1Btn.focus();
      } else if (typeof activeEl.blur === "function") {
        activeEl.blur();
      }
    }
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
    renderFocusCheckpointCompletionLog(null);
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

  function renderFocusCheckpointCompletionLog(t: Task | null) {
    const listEl = els.focusCheckpointLogList as HTMLElement | null;
    const emptyEl = els.focusCheckpointLogEmpty as HTMLElement | null;
    if (!listEl || !emptyEl) return;

    if (!t || !t.milestonesEnabled || !Array.isArray(t.milestones) || t.milestones.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    const taskId = String(t.id || "");
    if (!taskId) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    const fired = getCheckpointFiredSet(taskId);
    const allMilestones = sortMilestones((t.milestones || []).slice()).filter((m) => (+m.hours || 0) > 0);
    const byKey = new Map<string, { hours: number; description: string }>();
    allMilestones.forEach((m) => {
      byKey.set(checkpointKeyForTask(m, t), { hours: +m.hours || 0, description: String(m.description || "") });
    });

    const completedRows = Array.from(fired)
      .map((key) => ({ key, item: byKey.get(key) }))
      .filter((row): row is { key: string; item: { hours: number; description: string } } => !!row.item)
      .reverse();

    if (!completedRows.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    listEl.innerHTML = completedRows
      .map((row, idx) => {
        const timeText = `${row.item.hours}${milestoneUnitSuffix(t)}`;
        const desc = String(row.item.description || "").trim();
        return `
          <div class="focusCheckpointLogItem${idx === 0 ? " isLatest" : ""}">
            <div class="focusCheckpointLogItemTime">${escapeHtmlUI(timeText)}</div>
            ${desc ? `<div class="focusCheckpointLogItemDesc">${escapeHtmlUI(desc)}</div>` : ""}
          </div>
        `;
      })
      .join("");
    emptyEl.style.display = "none";
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
      renderFocusCheckpointCompletionLog(t);
      focusCheckpointSig = "";
      return;
    }

    const dialRect = (els.focusDial as HTMLElement | null)?.getBoundingClientRect();
    const dialPx = Math.max(1, Math.round(dialRect?.width || 0));
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
      const parseProgressInsetPx = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 16;
        const cs = window.getComputedStyle(progressEl);
        const rawInset =
          ((cs as CSSStyleDeclaration & { inset?: string }).inset || "").trim() ||
          (cs.top || "").trim() ||
          (cs.left || "").trim();
        const firstToken = rawInset.split(/\s+/)[0] || "";
        const px = parseFloat(firstToken);
        return Number.isFinite(px) ? px : 16;
      };
      const dialRadiusPx = dialPx / 2;
      const dialScale = Math.max(0.72, Math.min(1, dialPx / 420));
      const ringInsetPx = parseProgressInsetPx();
      const progressBoxRadiusPx = Math.max(0, dialRadiusPx - ringInsetPx);
      const markerRadiusPx = Math.max(0, progressBoxRadiusPx * parseRingCenterRatio());
      const outerRingRadiusPx = Math.max(0, dialRadiusPx - 2);
      const markerLineLenPx = Math.max(2, (outerRingRadiusPx - markerRadiusPx) * 0.5);
      const centerX = (dialRect?.left || 0) + (dialRect?.width || dialPx) / 2;
      const centerY = (dialRect?.top || 0) + (dialRect?.height || dialPx) / 2;
      const viewportPadPx = 10;
      const availableOuterRadiusPx = Math.max(
        outerRingRadiusPx + 4,
        Math.min(
          centerX - viewportPadPx,
          window.innerWidth - centerX - viewportPadPx,
          centerY - viewportPadPx,
          window.innerHeight - centerY - viewportPadPx
        )
      );
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
          const desiredFlagGapPx = 4 + 6 * dialScale;
          const minFlagRadiusPx = outerRingRadiusPx + 2;
          const maxFlagRadiusPx = Math.max(minFlagRadiusPx, availableOuterRadiusPx - 10);
          const flagRadiusPx = Math.min(Math.max(minFlagRadiusPx, outerRingRadiusPx + desiredFlagGapPx), maxFlagRadiusPx);
          const labelPadFromFlagPx = 8 + 8 * dialScale;
          let lx = Math.sin(theta) * (flagRadiusPx + labelPadFromFlagPx);
          let ly = -Math.cos(theta) * (flagRadiusPx + labelPadFromFlagPx);
          const labelDist = Math.sqrt(lx * lx + ly * ly) || 1;
          const preferredLabelRadiusPx = Math.max(dialRadiusPx + 10 * dialScale, flagRadiusPx + 8);
          const minOutsideRadius = Math.min(
            Math.max(flagRadiusPx + 6, availableOuterRadiusPx - 6),
            preferredLabelRadiusPx
          );
          if (labelDist < minOutsideRadius) {
            const k = minOutsideRadius / labelDist;
            lx *= k;
            ly *= k;
          }
          const fx = Math.sin(theta) * flagRadiusPx;
          const fy = -Math.cos(theta) * flagRadiusPx;
          const lineText = `${v}${milestoneUnitSuffix(t)}`;
          const descText = String(m.description || "").trim();
          return `
            <div class="focusCheckpointMark" style="--mxpx:${mx}px;--mypx:${my}px;--madeg:${markerAngleDeg}deg;--mlpx:${markerLineLenPx}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointFlag" style="--fxpx:${fx}px;--fypx:${fy}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointLabel ${isRight ? "right" : "left"}" style="--lxpx:${lx}px;--lypx:${ly}px" data-seconds="${secTarget}">
              <span class="focusCheckpointLabelTitle">${escapeHtmlUI(lineText)}</span>
              ${descText ? `<span class="focusCheckpointLabelDesc">${escapeHtmlUI(descText)}</span>` : ""}
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

    // Match task progress-bar behavior: keep all flags/markers visible, but only show
    // the next checkpoint label/description (or the final checkpoint after all are reached).
    const validMs = msSorted.filter((m) => (+m.hours || 0) > 0);
    if (validMs.length) {
      const nextPending = validMs.find((m) => elapsedSec < (+m.hours || 0) * milestoneUnitSec(t)) || null;
      const displayMs = nextPending || validMs[validMs.length - 1];
      const displayTargetSec = Math.max(0, (+displayMs.hours || 0) * milestoneUnitSec(t));
      (els.focusCheckpointRing as HTMLElement).querySelectorAll(".focusCheckpointLabel").forEach((el) => {
        const secTarget = Number((el as HTMLElement).dataset.seconds || "0");
        (el as HTMLElement).classList.toggle("isActive", Math.abs(secTarget - displayTargetSec) < 0.001);
      });
    } else {
      (els.focusCheckpointRing as HTMLElement).querySelectorAll(".focusCheckpointLabel").forEach((el) => {
        (el as HTMLElement).classList.remove("isActive");
      });
    }
    renderFocusCheckpointCompletionLog(t);
  }

  function openPopup(which: string) {
    if (which === "historyManager") {
      openHistoryManager();
      return;
    }
    if (which === "howto") {
      navigateToAppRoute("/tasktimer/user-guide");
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
    const mode: "light" | "dark" = (cloudPreferencesCache || loadCachedPreferences())?.theme === "light" ? "light" : "dark";
    applyTheme(mode);
  }

  function loadAddTaskCustomNames() {
    const settings = (cloudTaskUiCache || loadCachedTaskUi()) as any;
    const raw = Array.isArray(settings?.customTaskNames) ? JSON.stringify(settings.customTaskNames) : "";
    addTaskCustomNames = parseRecentCustomTaskNames(raw, 5);
  }

  function loadDefaultTaskTimerFormat() {
    const raw = (cloudPreferencesCache || loadCachedPreferences())?.defaultTaskTimerFormat;
    const next: "day" | "hour" | "minute" = raw === "day" || raw === "minute" ? raw : "hour";
    defaultTaskTimerFormat = next;
  }

  function saveDefaultTaskTimerFormat() {
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
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, dynamicColorsEnabled);
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, checkpointAlertSoundEnabled);
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, checkpointAlertToastEnabled);
    if (editIndex != null && tasks[editIndex]) syncEditCheckpointAlertUi(tasks[editIndex]);
  }

  function loadDynamicColorsSetting() {
    dynamicColorsEnabled = (cloudPreferencesCache || loadCachedPreferences())?.dynamicColorsEnabled !== false;
  }

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function loadCheckpointAlertSettings() {
    const prefs = cloudPreferencesCache || loadCachedPreferences();
    checkpointAlertSoundEnabled = prefs?.checkpointAlertSoundEnabled !== false;
    checkpointAlertToastEnabled = prefs?.checkpointAlertToastEnabled !== false;
  }

  function saveCheckpointAlertSettings() {
    persistPreferencesToCloud();
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

  function stopCheckpointRepeatAlert() {
    checkpointRepeatStopAtMs = 0;
    checkpointRepeatActiveTaskId = null;
    if (checkpointRepeatCycleTimer != null) {
      window.clearTimeout(checkpointRepeatCycleTimer);
      checkpointRepeatCycleTimer = null;
    }
    if (checkpointBeepQueueTimer != null) {
      window.clearTimeout(checkpointBeepQueueTimer);
      checkpointBeepQueueTimer = null;
    }
    checkpointBeepQueueCount = 0;
    if (checkpointBeepAudio) {
      try {
        checkpointBeepAudio.pause();
        checkpointBeepAudio.currentTime = 0;
      } catch {
        // ignore playback stop failures
      }
    }
    if (!destroyed) render();
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

  function scheduleCheckpointRepeatCycle() {
    if (checkpointRepeatStopAtMs <= 0) {
      stopCheckpointRepeatAlert();
      return;
    }
    if (Date.now() >= checkpointRepeatStopAtMs) {
      stopCheckpointRepeatAlert();
      return;
    }
    enqueueCheckpointBeeps(1);
    checkpointRepeatCycleTimer = window.setTimeout(scheduleCheckpointRepeatCycle, 2000);
  }

  function startCheckpointRepeatAlert(taskId: string) {
    checkpointRepeatActiveTaskId = taskId;
    checkpointRepeatStopAtMs = Date.now() + 60_000;
    if (!destroyed) render();
    if (checkpointRepeatCycleTimer != null) return;
    scheduleCheckpointRepeatCycle();
  }

  function enqueueCheckpointBeeps(count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    checkpointBeepQueueCount += Math.floor(count);
    if (checkpointBeepQueueTimer == null) flushCheckpointBeepQueue();
  }

  function renderCheckpointToast() {
    const host = els.checkpointToastHost as HTMLElement | null;
    if (!host) return;
    host.classList.toggle("isActive", !!activeCheckpointToast);
    if (!activeCheckpointToast) {
      host.innerHTML = "";
      return;
    }
    const showMuteBellIcon = !!activeCheckpointToast.muteRepeatOnManualDismiss;
    const dismissBtnLabel = showMuteBellIcon ? "Dismiss alert and mute sound" : "Dismiss alert";
    const toastSecsLeft =
      Number.isFinite(activeCheckpointToast.autoCloseAtMs as number) && (activeCheckpointToast.autoCloseAtMs || 0) > 0
        ? Math.max(0, Math.ceil(((activeCheckpointToast.autoCloseAtMs as number) - Date.now()) / 1000))
        : 0;
    const soundSecsLeft =
      showMuteBellIcon &&
      activeCheckpointToast.taskId &&
      checkpointRepeatActiveTaskId &&
      String(activeCheckpointToast.taskId) === String(checkpointRepeatActiveTaskId) &&
      checkpointRepeatStopAtMs > 0
        ? Math.max(0, Math.ceil((checkpointRepeatStopAtMs - Date.now()) / 1000))
        : 0;
    const dismissCountdownText =
      toastSecsLeft > 0 && soundSecsLeft > 0
        ? ` [T:${toastSecsLeft}s S:${soundSecsLeft}s]`
        : toastSecsLeft > 0
          ? ` [${toastSecsLeft}s]`
          : soundSecsLeft > 0
            ? ` [${soundSecsLeft}s]`
            : "";
    const dismissBtnText = `${showMuteBellIcon ? "&#128276; " : ""}Dismiss${dismissCountdownText}`;
    const jumpBtnText = `${showMuteBellIcon ? "&#128276; " : ""}Dismiss and Jump to Task`;
    const toastTaskName = String(activeCheckpointToast.taskName || "").trim();
    const checkpointTimeText = String(activeCheckpointToast.checkpointTimeText || activeCheckpointToast.text || "").trim();
    const checkpointDescText = String(activeCheckpointToast.checkpointDescText || "").trim();
    host.innerHTML = `
      <div class="checkpointToast" data-toast-id="${escapeHtmlUI(activeCheckpointToast.id)}" role="status">
        ${toastTaskName ? `<p class="checkpointToastTaskName">${escapeHtmlUI(toastTaskName)}</p>` : ""}
        <p class="checkpointToastTitle">${escapeHtmlUI(String(activeCheckpointToast.title || "CHECKPOINT REACHED!").toUpperCase())}</p>
        <div class="checkpointToastSummary">
          <p class="checkpointToastText">${escapeHtmlUI(checkpointTimeText)}</p>
          ${checkpointDescText ? `<p class="checkpointToastDesc">${escapeHtmlUI(checkpointDescText)}</p>` : ""}
        </div>
        <div class="checkpointToastActions">
          <button class="btn btn-ghost small checkpointToastClose" type="button" data-action="closeCheckpointToast" aria-label="${escapeHtmlUI(
            dismissBtnLabel
          )}" title="${escapeHtmlUI(dismissBtnLabel)}">${dismissBtnText}</button>
          <button class="btn btn-ghost small checkpointToastJump" type="button" data-action="jumpToCheckpointTask" aria-label="Dismiss and jump to task" title="Dismiss and Jump to Task">${jumpBtnText}</button>
        </div>
      </div>
    `;
  }

  function scheduleCheckpointToastCountdownRefresh() {
    if (checkpointToastCountdownRefreshTimer != null) {
      window.clearTimeout(checkpointToastCountdownRefreshTimer);
      checkpointToastCountdownRefreshTimer = null;
    }
    if (!activeCheckpointToast) return;
    const hasToastCountdown = (activeCheckpointToast.autoCloseAtMs || 0) > 0;
    const hasSoundCountdown =
      !!activeCheckpointToast.muteRepeatOnManualDismiss &&
      !!activeCheckpointToast.taskId &&
      !!checkpointRepeatActiveTaskId &&
      String(activeCheckpointToast.taskId) === String(checkpointRepeatActiveTaskId) &&
      checkpointRepeatStopAtMs > 0;
    if (!hasToastCountdown && !hasSoundCountdown) return;
    checkpointToastCountdownRefreshTimer = window.setTimeout(() => {
      checkpointToastCountdownRefreshTimer = null;
      if (!activeCheckpointToast) return;
      renderCheckpointToast();
      scheduleCheckpointToastCountdownRefresh();
    }, 250);
  }

  function showNextCheckpointToast() {
    if (activeCheckpointToast || checkpointToastQueue.length === 0) return;
    activeCheckpointToast = checkpointToastQueue.shift() || null;
    if (activeCheckpointToast) {
      activeCheckpointToast.autoCloseAtMs =
        (activeCheckpointToast.autoCloseMs || 0) > 0 ? Date.now() + (activeCheckpointToast.autoCloseMs as number) : null;
    }
    renderCheckpointToast();
    scheduleCheckpointToastCountdownRefresh();
    if (!destroyed) render();
    if (checkpointToastAutoCloseTimer != null) window.clearTimeout(checkpointToastAutoCloseTimer);
    if ((activeCheckpointToast?.autoCloseMs || 0) > 0) {
      checkpointToastAutoCloseTimer = window.setTimeout(() => {
      dismissCheckpointToast({ manual: false });
    }, activeCheckpointToast!.autoCloseMs as number);
    } else {
      checkpointToastAutoCloseTimer = null;
    }
  }

  function dismissCheckpointToast(opts?: { manual?: boolean }) {
    const manual = !!opts?.manual;
    if (
      manual &&
      activeCheckpointToast?.muteRepeatOnManualDismiss &&
      activeCheckpointToast.taskId &&
      checkpointRepeatActiveTaskId &&
      String(activeCheckpointToast.taskId) === String(checkpointRepeatActiveTaskId)
    ) {
      stopCheckpointRepeatAlert();
    }
    if (checkpointToastAutoCloseTimer != null) {
      window.clearTimeout(checkpointToastAutoCloseTimer);
      checkpointToastAutoCloseTimer = null;
    }
    if (checkpointToastCountdownRefreshTimer != null) {
      window.clearTimeout(checkpointToastCountdownRefreshTimer);
      checkpointToastCountdownRefreshTimer = null;
    }
    activeCheckpointToast = null;
    renderCheckpointToast();
    if (!destroyed) render();
    if (checkpointToastQueue.length) {
      window.setTimeout(showNextCheckpointToast, 50);
    }
  }

  function dismissCheckpointToastAndJumpToTask() {
    const taskId = String(activeCheckpointToast?.taskId || "").trim();
    dismissCheckpointToast({ manual: true });
    if (!taskId) return;
    const path = normalizedPathname();
    const onMainTaskTimerRoute = /\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path);
    if (onMainTaskTimerRoute) {
      jumpToTaskById(taskId);
      return;
    }
    savePendingTaskJump(taskId);
    navigateToAppRoute("/tasktimer");
  }

  function enqueueCheckpointToast(
    title: string,
    text: string,
    opts?: {
      autoCloseMs?: number | null;
      taskId?: string | null;
      taskName?: string | null;
      counterText?: string | null;
      checkpointTimeText?: string | null;
      checkpointDescText?: string | null;
      muteRepeatOnManualDismiss?: boolean;
    }
  ) {
    const autoCloseMs = opts?.autoCloseMs === null ? null : Math.max(0, Number(opts?.autoCloseMs ?? 5000)) || 0;
    // Do not stack checkpoint alerts: replace any existing/queued toast with the newest one.
    checkpointToastQueue.length = 0;
    if (checkpointToastAutoCloseTimer != null) {
      window.clearTimeout(checkpointToastAutoCloseTimer);
      checkpointToastAutoCloseTimer = null;
    }
    activeCheckpointToast = null;

    checkpointToastQueue.push({
      id: `${Date.now()}-${Math.random()}`,
      title,
      text,
      checkpointTimeText: opts?.checkpointTimeText ?? null,
      checkpointDescText: opts?.checkpointDescText ?? null,
      taskName: opts?.taskName ?? null,
      counterText: opts?.counterText ?? null,
      autoCloseMs,
      autoCloseAtMs: null,
      taskId: opts?.taskId ?? null,
      muteRepeatOnManualDismiss: !!opts?.muteRepeatOnManualDismiss,
    });
    showNextCheckpointToast();
  }

  function formatCheckpointAlertText(task: Task, milestone: { hours: number; description: string }) {
    const targetMs = Math.max(0, (+milestone.hours || 0) * milestoneUnitSec(task) * 1000);
    const label = String(milestone.description || "").trim();
    return label ? `${formatTime(targetMs)} - ${label}` : formatTime(targetMs);
  }

  function syncEditCheckpointAlertUi(t: Task) {
    ensureMilestoneIdentity(t);
    els.editCheckpointAlertsGroup?.classList.toggle("isHidden", !t.milestonesEnabled);
    if (els.editPresetIntervalsToggle) {
      toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    }
    if (els.editPresetIntervalInput) {
      const nextValue = getPresetIntervalValueNum(t);
      if (els.editPresetIntervalInput.value !== String(nextValue)) els.editPresetIntervalInput.value = String(nextValue);
      els.editPresetIntervalInput.disabled = !t.milestonesEnabled || !t.presetIntervalsEnabled;
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isDisabled", !t.milestonesEnabled);
    els.editPresetIntervalField?.classList.toggle("isHidden", !t.milestonesEnabled || !t.presetIntervalsEnabled);
    if (els.editPresetIntervalNote) {
      const intervalInvalid = !!t.milestonesEnabled && !!t.presetIntervalsEnabled && !hasValidPresetInterval(t);
      if (intervalInvalid) {
        (els.editPresetIntervalNote as HTMLElement).style.display = "block";
        els.editPresetIntervalNote.textContent = "Enter a preset interval greater than 0 to add checkpoints.";
      } else {
        (els.editPresetIntervalNote as HTMLElement).style.display = "none";
        els.editPresetIntervalNote.textContent = "";
      }
    }
    toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, !!t.checkpointSoundEnabled);
    toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, !!t.checkpointToastEnabled);
    els.editCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointAlertSoundEnabled);
    els.editCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointAlertToastEnabled);
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.value = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.value = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
    }
    els.editCheckpointSoundModeField?.classList.toggle(
      "isHidden",
      !checkpointAlertSoundEnabled || !t.checkpointSoundEnabled
    );
    els.editCheckpointToastModeField?.classList.toggle(
      "isHidden",
      !checkpointAlertToastEnabled || !t.checkpointToastEnabled
    );
    els.editTimerSettingsGroup?.classList.toggle("isHidden", !t.milestonesEnabled);
    if (els.editFinalCheckpointActionSelect) {
      els.editFinalCheckpointActionSelect.value =
        t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog" ? t.finalCheckpointAction : "continue";
    }
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

  function buildEditDraftSnapshot(task: Task | null | undefined) {
    if (!task) return "";
    const milestones = sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : []).map((m) => ({
      id: String((m as any)?.id || ""),
      createdSeq: Number.isFinite(+(m as any)?.createdSeq) ? Math.floor(+(m as any).createdSeq) : 0,
      hours: Number.isFinite(+m.hours) ? +m.hours : 0,
      description: String(m.description || ""),
    }));
    const elapsedDraft =
      isEditElapsedOverrideEnabled()
        ? {
            d: String(els.editD?.value || "0"),
            h: String(els.editH?.value || "0"),
            m: String(els.editM?.value || "0"),
            s: String(els.editS?.value || "0"),
          }
        : null;
    return JSON.stringify({
      name: String(els.editName?.value || task.name || "").trim(),
      mode: editMoveTargetMode || taskModeOf(task),
      milestoneTimeUnit: task.milestoneTimeUnit === "day" ? "day" : task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestonesEnabled: !!task.milestonesEnabled,
      milestones,
      overrideElapsedEnabled: !!elapsedDraft,
      elapsedDraft,
      checkpointSoundEnabled: !!isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null),
      checkpointSoundMode: els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null),
      checkpointToastMode: els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s",
      finalCheckpointAction:
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : "continue",
      presetIntervalsEnabled: !!isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null),
      presetIntervalValue: Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0),
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
      presetIntervalNextSeq: getPresetIntervalNextSeqNum(task),
    });
  }

  function syncEditSaveAvailability(t?: Task | null) {
    const task = t || (editIndex != null ? tasks[editIndex] : null);
    if (!els.saveEditBtn) return;
    clearEditValidationState();
    if (!task) {
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.title = "";
      return;
    }
    const requiresCheckpoint = !!task.milestonesEnabled;
    const isDirty = buildEditDraftSnapshot(task) !== editDraftSnapshot;
    const disabled = !isDirty;
    els.saveEditBtn.disabled = disabled;
    els.saveEditBtn.title =
      !isDirty ? "No changes to save" : requiresCheckpoint ? "Save Changes" : "";
  }

  function maybeToggleEditPresetIntervals(nextEnabled: boolean) {
    if (editIndex == null) return;
    const t = tasks[editIndex];
    if (!t) return;
    if (!t.milestonesEnabled) {
      t.presetIntervalsEnabled = false;
      syncEditCheckpointAlertUi(t);
      return;
    }
    if (!nextEnabled) {
      t.presetIntervalsEnabled = false;
      syncEditCheckpointAlertUi(t);
      return;
    }
    const hasExisting = Array.isArray(t.milestones) && t.milestones.length > 0;
    if (!hasExisting) {
      t.presetIntervalsEnabled = true;
      syncEditCheckpointAlertUi(t);
      return;
    }
    confirm("Use Preset Intervals", "Enabling preset intervals will clear the current checkpoints. Confirm?", {
      okLabel: "Confirm",
      cancelLabel: "Cancel",
      onOk: () => {
        t.milestones = [];
        t.presetIntervalLastMilestoneId = null;
        t.presetIntervalNextSeq = 1;
        t.presetIntervalsEnabled = true;
        renderMilestoneEditor(t);
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
        closeConfirm();
      },
      onCancel: () => {
        t.presetIntervalsEnabled = false;
        syncEditCheckpointAlertUi(t);
        closeConfirm();
      },
    });
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
    const validMilestones = msSorted.filter((m) => Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec(t))) > 0);
    const totalCheckpoints = validMilestones.length;
    let beepCount = 0;
    let shouldResetAtFinal: null | "resetLog" | "resetNoLog" = null;
    msSorted.forEach((m) => {
      const targetSec = Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec(t)));
      if (targetSec <= 0) return;
      if (targetSec <= prevBaseline || targetSec > elapsedWholeSec) return;
      const key = checkpointKeyForTask(m, t);
      if (fired.has(key)) return;
      fired.add(key);
      const text = formatCheckpointAlertText(t, m);
      const checkpointIndex = Math.max(
        1,
        validMilestones.findIndex((vm) => checkpointKeyForTask(vm, t) === key) + 1
      );
      const checkpointTimeText = formatTime(targetSec * 1000);
      const checkpointDescText = String(m.description || "").trim();
      if (checkpointAlertToastEnabled && t.checkpointToastEnabled) {
        const toastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
        enqueueCheckpointToast(`Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`, text, {
          autoCloseMs: toastMode === "manual" ? null : 5000,
          taskId,
          taskName: t.name || "",
          counterText: formatMainTaskElapsed(getElapsedMs(t)),
          checkpointTimeText,
          checkpointDescText,
          muteRepeatOnManualDismiss: checkpointAlertSoundEnabled && t.checkpointSoundEnabled && (t.checkpointSoundMode || "once") === "repeat",
        });
      }
      if (checkpointAlertSoundEnabled && t.checkpointSoundEnabled) {
        beepCount += 1;
      }
      if (
        checkpointIndex >= totalCheckpoints &&
        totalCheckpoints > 0 &&
        (t.finalCheckpointAction === "resetLog" || t.finalCheckpointAction === "resetNoLog")
      ) {
        shouldResetAtFinal = t.finalCheckpointAction;
      }
    });
    checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
    if (beepCount > 0) {
      if ((t.checkpointSoundMode || "once") === "repeat") startCheckpointRepeatAlert(taskId);
      else enqueueCheckpointBeeps(beepCount);
    }
    if (shouldResetAtFinal) {
      resetTaskStateImmediate(t, { logHistory: shouldResetAtFinal === "resetLog" });
    }
  }

  function saveAddTaskCustomNames() {
    const next = {
      historyRangeDaysByTaskId,
      historyRangeModeByTaskId,
      pinnedHistoryTaskIds: Array.from(pinnedHistoryTaskIds),
      customTaskNames: addTaskCustomNames.slice(0, 5),
    } as any;
    cloudTaskUiCache = next;
    saveCloudTaskUi(next);
  }

  function loadPinnedHistoryTaskIds() {
    const parsed = (cloudTaskUiCache || loadCachedTaskUi())?.pinnedHistoryTaskIds;
    if (!Array.isArray(parsed)) {
      pinnedHistoryTaskIds = new Set<string>();
      return;
    }
    pinnedHistoryTaskIds = new Set<string>(parsed.map((v) => String(v || "").trim()).filter(Boolean));
  }

  function savePinnedHistoryTaskIds() {
    persistTaskUiToCloud();
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
    persistPreferencesToCloud();
  }

  function setGroupsStatus(message: string) {
    groupsStatusMessage = String(message || "").trim() || "Ready.";
    if (els.groupsFriendRequestStatus) {
      els.groupsFriendRequestStatus.textContent = groupsStatusMessage;
    }
  }

  function openFriendRequestModal() {
    if (!els.friendRequestModal) return;
    (els.friendRequestModal as HTMLElement).style.display = "flex";
    if (els.friendRequestUserIdInput) els.friendRequestUserIdInput.value = "";
    if (els.friendRequestTokenInput) els.friendRequestTokenInput.value = "";
    setGroupsStatus("Enter User ID and secret token.");
    window.setTimeout(() => {
      try {
        els.friendRequestUserIdInput?.focus();
      } catch {
        // ignore
      }
    }, 0);
  }

  function closeFriendRequestModal() {
    if (!els.friendRequestModal) return;
    (els.friendRequestModal as HTMLElement).style.display = "none";
  }

  function renderGroupsRequestsList(
    container: HTMLElement | null,
    rows: FriendRequest[],
    opts: { incoming: boolean }
  ) {
    if (!container) return;
    if (!rows.length) {
      container.textContent = opts.incoming ? "No incoming requests." : "No outgoing requests.";
      return;
    }
    container.innerHTML = rows
      .map((row) => {
        const peerUid = opts.incoming ? row.senderUid : row.receiverUid;
        const peerEmail = opts.incoming ? row.senderEmail : row.receiverEmail;
        const status = String(row.status || "pending");
        const statusLabel = status[0].toUpperCase() + status.slice(1);
        const actionBtns =
          opts.incoming && status === "pending"
            ? `<div class="footerBtns"><button class="btn btn-accent small" type="button" data-friend-action="approve" data-request-id="${escapeHtmlUI(
                row.requestId
              )}">Approve</button><button class="btn btn-ghost small" type="button" data-friend-action="decline" data-request-id="${escapeHtmlUI(
                row.requestId
              )}">Decline</button></div>`
            : "";
        return `<div class="settingsDetailNote"><div><b>${escapeHtmlUI(statusLabel)}</b></div><div>User ID: ${escapeHtmlUI(
          peerUid
        )}</div>${peerEmail ? `<div>${escapeHtmlUI(peerEmail)}</div>` : ""}${actionBtns}</div>`;
      })
      .join("");
  }

  function renderGroupsFriendsList() {
    if (!els.groupsFriendsList) return;
    const uid = currentUid();
    if (!uid) {
      els.groupsFriendsList.textContent = "Sign in to view friends.";
      return;
    }
    if (!groupsFriendships.length) {
      els.groupsFriendsList.textContent = "No friends yet.";
      return;
    }
    els.groupsFriendsList.innerHTML = groupsFriendships
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        return `<div class="settingsDetailNote">User ID: ${escapeHtmlUI(friendUid)}</div>`;
      })
      .join("");
  }

  function renderGroupsPage() {
    renderGroupsRequestsList(els.groupsIncomingRequestsList as HTMLElement | null, groupsIncomingRequests, { incoming: true });
    renderGroupsRequestsList(els.groupsOutgoingRequestsList as HTMLElement | null, groupsOutgoingRequests, { incoming: false });
    renderGroupsFriendsList();
    if (els.friendRequestSendBtn) els.friendRequestSendBtn.disabled = groupsLoading;
  }

  async function refreshGroupsData() {
    const uid = currentUid();
    if (!uid) {
      groupsIncomingRequests = [];
      groupsOutgoingRequests = [];
      groupsFriendships = [];
      setGroupsStatus("Sign in to use Groups.");
      renderGroupsPage();
      return;
    }
    groupsLoading = true;
    renderGroupsPage();
    try {
      const [incoming, outgoing, friendships] = await Promise.all([
        loadIncomingRequests(uid),
        loadOutgoingRequests(uid),
        loadFriendships(uid),
      ]);
      groupsIncomingRequests = incoming;
      groupsOutgoingRequests = outgoing;
      groupsFriendships = friendships;
      setGroupsStatus("Ready.");
    } catch {
      setGroupsStatus("Could not load friend data.");
    } finally {
      groupsLoading = false;
      renderGroupsPage();
    }
  }

  async function handleSendFriendRequest() {
    const uid = currentUid();
    const auth = getFirebaseAuthClient();
    const email = auth?.currentUser?.email || null;
    const receiverUid = String(els.friendRequestUserIdInput?.value || "").trim();
    const secretToken = String(els.friendRequestTokenInput?.value || "").trim();
    groupsLoading = true;
    renderGroupsPage();
    setGroupsStatus("Sending request...");
    try {
      const result = await sendFriendRequest(uid, email, receiverUid, secretToken);
      if (!result.ok) {
        setGroupsStatus(result.message);
        return;
      }
      setGroupsStatus("Friend request sent.");
      closeFriendRequestModal();
      await refreshGroupsData();
    } catch {
      setGroupsStatus("Could not send friend request.");
    } finally {
      groupsLoading = false;
      renderGroupsPage();
    }
  }

  async function handleIncomingDecision(requestId: string, action: "approve" | "decline") {
    const uid = currentUid();
    if (!uid || !requestId) return;
    groupsLoading = true;
    setGroupsStatus(action === "approve" ? "Approving request..." : "Declining request...");
    renderGroupsPage();
    try {
      const result =
        action === "approve"
          ? await approveFriendRequest(requestId, uid)
          : await declineFriendRequest(requestId, uid);
      if (!result.ok) {
        setGroupsStatus(result.message || "Action failed.");
        return;
      }
      setGroupsStatus(action === "approve" ? "Friend request approved." : "Friend request declined.");
      await refreshGroupsData();
    } catch {
      setGroupsStatus("Could not update friend request.");
    } finally {
      groupsLoading = false;
      renderGroupsPage();
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

  function applyAppPage(
    page: "tasks" | "dashboard" | "test1" | "test2",
    opts?: { pushNavStack?: boolean; syncUrl?: "replace" | "push" | false }
  ) {
    currentAppPage = page;
    if (opts?.pushNavStack) pushCurrentScreenToNavStack(page);
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
    if (els.signedInHeaderBadge) {
      els.signedInHeaderBadge.style.display = page === "dashboard" || page === "test2" ? "inline-flex" : "none";
    }
    const syncUrlMode = opts?.syncUrl;
    const canSyncMainPageUrl = /\/tasktimer$/.test(normalizedPathname()) || /\/tasktimer\/index\.html$/i.test(normalizedPathname());
    if (syncUrlMode && canSyncMainPageUrl) {
      try {
        const path = appRoute("/tasktimer");
        const nextUrl = page === "tasks" ? path : `${path}?page=${page}`;
        if (syncUrlMode === "replace") window.history.replaceState({ page }, "", nextUrl);
        else window.history.pushState({ page }, "", nextUrl);
      } catch {
        // ignore history API failures
      }
    }
    if (page === "test2") {
      renderGroupsPage();
      void refreshGroupsData();
      return;
    }
    closeFriendRequestModal();
    if (page === "tasks") render();
  }

  function deleteTasksInMode(mode: MainMode) {
    tasks = (tasks || []).filter((t) => taskModeOf(t) !== mode);
    save();
    render();
  }

  function jumpToTaskAndHighlight(taskId: string) {
    if (!taskId) return;
    window.setTimeout(() => {
      const list = els.taskList as HTMLElement | null;
      if (!list) return;
      let taskEl: HTMLElement | null = null;
      try {
        const esc =
          typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function"
            ? (window as any).CSS.escape(taskId)
            : taskId.replace(/["\\]/g, "\\$&");
        taskEl = list.querySelector(`.task[data-task-id="${esc}"]`) as HTMLElement | null;
      } catch {
        taskEl = list.querySelector(`.task[data-task-id="${taskId}"]`) as HTMLElement | null;
      }
      if (!taskEl) return;
      try {
        taskEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        taskEl.scrollIntoView();
      }
      taskEl.classList.remove("isNewTaskGlow");
      void taskEl.offsetWidth;
      taskEl.classList.add("isNewTaskGlow");
      if (newTaskHighlightTimer != null) window.clearTimeout(newTaskHighlightTimer);
      newTaskHighlightTimer = window.setTimeout(() => {
        taskEl?.classList.remove("isNewTaskGlow");
        newTaskHighlightTimer = null;
      }, 3000);
    }, 0);
  }

  function wireEvents() {
    const setAddTaskError = (msg: string) => {
      if (!els.addTaskError) return;
      els.addTaskError.textContent = msg;
      els.addTaskError.classList.toggle("isOn", !!String(msg || "").trim());
    };
    const persistInlineTaskSettingsImmediate = () => {
      saveDefaultTaskTimerFormat();
      saveDynamicColorsSetting();
      saveCheckpointAlertSettings();
      render();
    };
    const applyAndPersistModeSettingsImmediate = (opts?: { closeOverlay?: boolean }) => {
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
      if (opts?.closeOverlay) closeOverlay(els.categoryManagerOverlay as HTMLElement | null);
      else render();
    };
    const wireModeColorPair = (picker: HTMLInputElement | null, hex: HTMLInputElement | null, mode: MainMode) => {
      on(picker, "input", () => {
        if (!picker || !hex) return;
        hex.value = sanitizeModeColor(picker.value, DEFAULT_MODE_COLORS[mode]);
        applyAndPersistModeSettingsImmediate();
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
        applyAndPersistModeSettingsImmediate();
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
      syncAddTaskCheckpointAlertUi();
    };

    const resetAddTaskMilestones = () => {
      addTaskMilestonesEnabled = false;
      addTaskMilestoneTimeUnit = defaultTaskTimerFormat;
      addTaskMilestones = [];
      addTaskCheckpointSoundEnabled = false;
      addTaskCheckpointSoundMode = "once";
      addTaskCheckpointToastEnabled = false;
      addTaskCheckpointToastMode = "auto5s";
      addTaskPresetIntervalsEnabled = false;
      addTaskPresetIntervalValue = 0;
      addTaskFinalCheckpointAction = "continue";
      if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
      if (els.addTaskMsArea && "open" in (els.addTaskMsArea as any)) {
        (els.addTaskMsArea as HTMLDetailsElement).open = false;
      }
      clearAddTaskValidationState();
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

    on(els.addTaskMsToggle, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      addTaskMilestonesEnabled = !addTaskMilestonesEnabled;
      if (els.addTaskMsArea && "open" in (els.addTaskMsArea as any)) {
        const hasCheckpoints = Array.isArray(addTaskMilestones) && addTaskMilestones.length > 0;
        (els.addTaskMsArea as HTMLDetailsElement).open = !!addTaskMilestonesEnabled && !hasCheckpoints;
      }
      if (!addTaskMilestonesEnabled) {
        addTaskPresetIntervalsEnabled = false;
      }
      syncAddTaskMilestonesUi();
    });

    on(els.addTaskMsUnitDay, "click", () => {
      addTaskMilestoneTimeUnit = "day";
      setAddTaskMilestoneUnitUi("day");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskMsUnitHour, "click", () => {
      addTaskMilestoneTimeUnit = "hour";
      setAddTaskMilestoneUnitUi("hour");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskMsUnitMinute, "click", () => {
      addTaskMilestoneTimeUnit = "minute";
      setAddTaskMilestoneUnitUi("minute");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.mode1Btn, "click", () => applyMainMode("mode1"));
    on(els.mode2Btn, "click", () => applyMainMode("mode2"));
    on(els.mode3Btn, "click", () => applyMainMode("mode3"));
    on(els.footerTasksBtn, "click", () => applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" }));
    on(els.footerDashboardBtn, "click", () => applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" }));
    on(els.footerTest1Btn, "click", () => applyAppPage("test1", { pushNavStack: true, syncUrl: "push" }));
    on(els.footerTest2Btn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("test2", { pushNavStack: true, syncUrl: "push" });
    });
    on(els.footerSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings");
    });
    on(els.openFriendRequestModalBtn, "click", (e: any) => {
      e?.preventDefault?.();
      openFriendRequestModal();
    });
    on(els.friendRequestCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendRequestModal();
    });
    on(els.friendRequestModal, "click", (e: any) => {
      if (e?.target === els.friendRequestModal) closeFriendRequestModal();
    });
    on(els.friendRequestSendBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (groupsLoading) return;
      void handleSendFriendRequest();
    });
    on(els.friendRequestTokenInput, "keydown", (e: any) => {
      if (e?.key !== "Enter") return;
      e?.preventDefault?.();
      if (groupsLoading) return;
      void handleSendFriendRequest();
    });
    on(els.groupsIncomingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline") return;
      if (groupsLoading) return;
      void handleIncomingDecision(requestId, action);
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
      if ((els.addTaskName?.value || "").trim()) clearAddTaskValidationState();
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

    on(els.addTaskPresetIntervalsToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled) return;
      addTaskPresetIntervalsEnabled = !addTaskPresetIntervalsEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalsToggleRow, "click", (e: any) => {
      if (!addTaskMilestonesEnabled || e.target?.closest?.("#addTaskPresetIntervalsToggle")) return;
      addTaskPresetIntervalsEnabled = !addTaskPresetIntervalsEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalInput, "input", () => {
      addTaskPresetIntervalValue = Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0);
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalInput, "change", () => {
      addTaskPresetIntervalValue = Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0);
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskFinalCheckpointActionSelect, "change", () => {
      addTaskFinalCheckpointAction =
        els.addTaskFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.addTaskFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : "continue";
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled || !checkpointAlertSoundEnabled) return;
      addTaskCheckpointSoundEnabled = !addTaskCheckpointSoundEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundToggleRow, "click", (e: any) => {
      if (!addTaskMilestonesEnabled || !checkpointAlertSoundEnabled || e.target?.closest?.("#addTaskCheckpointSoundToggle")) return;
      addTaskCheckpointSoundEnabled = !addTaskCheckpointSoundEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundModeSelect, "change", () => {
      addTaskCheckpointSoundMode = els.addTaskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled || !checkpointAlertToastEnabled) return;
      addTaskCheckpointToastEnabled = !addTaskCheckpointToastEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastToggleRow, "click", (e: any) => {
      if (!addTaskMilestonesEnabled || !checkpointAlertToastEnabled || e.target?.closest?.("#addTaskCheckpointToastToggle")) return;
      addTaskCheckpointToastEnabled = !addTaskCheckpointToastEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastModeSelect, "change", () => {
      addTaskCheckpointToastMode = els.addTaskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskAddMsBtn, "click", () => {
      if (!addTaskMilestonesEnabled) return;
      if (addTaskPresetIntervalsEnabled) {
        const interval = Math.max(0, Number(addTaskPresetIntervalValue) || 0);
        if (interval <= 0) {
          syncAddTaskCheckpointAlertUi();
          return;
        }
        const base = addTaskMilestones.length ? Number(addTaskMilestones[addTaskMilestones.length - 1]?.hours || 0) : 0;
        addTaskMilestones.push({ hours: base + interval, description: "" });
      } else {
        addTaskMilestones.push({ hours: 0, description: "" });
      }
      renderAddTaskMilestoneEditor();
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskForm, "submit", (e: any) => {
      e.preventDefault();
      clearAddTaskValidationState();
      const name = (els.addTaskName?.value || "").trim();
      if (!name) {
        showAddTaskValidationError("Task name is required", { name: true });
        return;
      }
      if (addTaskMilestonesEnabled && (!Array.isArray(addTaskMilestones) || addTaskMilestones.length === 0)) {
        showAddTaskValidationError("Add at least 1 checkpoint when Time Checkpoints is enabled", { checkpoints: true });
        return;
      }
      if (addTaskMilestonesEnabled && hasNonPositiveCheckpoint(addTaskMilestones)) {
        showAddTaskValidationError("Checkpoint times must be greater than 0", { checkpoints: true, checkpointRows: true });
        return;
      }
      if (addTaskMilestonesEnabled && addTaskPresetIntervalsEnabled && !(Number(addTaskPresetIntervalValue) > 0)) {
        showAddTaskValidationError("Enter a preset interval greater than 0", { presetInterval: true });
        return;
      }
      rememberCustomTaskName(name);
      setAddTaskError("");
      const nextOrder = (tasks.reduce((mx, t) => Math.max(mx, t.order || 0), 0) || 0) + 1;
      const newTask = makeTask(name, nextOrder);
      newTask.milestonesEnabled = addTaskMilestonesEnabled;
      newTask.milestoneTimeUnit = addTaskMilestoneTimeUnit;
      newTask.milestones = sortMilestones(addTaskMilestones.slice());
      newTask.checkpointSoundEnabled = !!addTaskMilestonesEnabled && !!addTaskCheckpointSoundEnabled;
      newTask.checkpointSoundMode = addTaskCheckpointSoundMode === "repeat" ? "repeat" : "once";
      newTask.checkpointToastEnabled = !!addTaskMilestonesEnabled && !!addTaskCheckpointToastEnabled;
      newTask.checkpointToastMode = addTaskCheckpointToastMode === "manual" ? "manual" : "auto5s";
      newTask.presetIntervalsEnabled = !!addTaskMilestonesEnabled && !!addTaskPresetIntervalsEnabled;
      newTask.presetIntervalValue = Math.max(0, Number(addTaskPresetIntervalValue) || 0);
      newTask.finalCheckpointAction =
        addTaskFinalCheckpointAction === "resetLog" || addTaskFinalCheckpointAction === "resetNoLog"
          ? addTaskFinalCheckpointAction
          : "continue";
      tasks.push(newTask);
      closeAddTaskModal();
      save();
      render();
      jumpToTaskAndHighlight(String(newTask.id || ""));
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
      else if (action === "exportTask") exportTask(i);
      else if (action === "muteCheckpointAlert") {
        stopCheckpointRepeatAlert();
        return;
      }

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
        navigateToAppRoute(`/tasktimer/history-manager?taskId=${encodeURIComponent(taskId)}`);
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
      navigateToAppRoute("/tasktimer/settings");
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
    on(els.taskList, "dragstart", (e: any) => {
      if (shouldIgnoreTaskDragStart(e.target)) return;
      const card = e.target?.closest?.(".task") as HTMLElement | null;
      if (!card || !els.taskList?.contains(card)) return;
      taskDragEl = card;
      card.classList.add("isDragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", card.getAttribute("data-task-id") || "");
        } catch {
          // ignore
        }
      }
    });
    on(els.taskList, "dragover", (e: any) => {
      const list = els.taskList;
      const dragging = taskDragEl;
      if (!list || !dragging) return;
      const over = e.target?.closest?.(".task") as HTMLElement | null;
      if (!over || over === dragging || !list.contains(over)) return;
      e.preventDefault();
      const rect = over.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) list.insertBefore(dragging, over);
      else list.insertBefore(dragging, over.nextSibling);
    });
    on(els.taskList, "drop", (e: any) => {
      if (!taskDragEl) return;
      e.preventDefault();
      persistTaskOrderFromTaskListDom();
      render();
    });
    on(els.taskList, "dragend", () => {
      if (taskDragEl) taskDragEl.classList.remove("isDragging");
      taskDragEl = null;
    });
    on(els.closeMenuBtn, "click", () => {
      if (els.menuOverlay) closeOverlay(els.menuOverlay as HTMLElement | null);
      else navigateToAppRoute("/tasktimer?page=dashboard");
    });
    on(els.themeToggle, "click", toggleThemeMode);
    on(els.themeToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#themeToggle")) return;
      toggleThemeMode();
    });
    on(els.taskDefaultFormatDay, "click", () => {
      defaultTaskTimerFormat = "day";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDefaultFormatHour, "click", () => {
      defaultTaskTimerFormat = "hour";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDefaultFormatMinute, "click", () => {
      defaultTaskTimerFormat = "minute";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDynamicColorsToggle, "click", () => {
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDynamicColorsToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskDynamicColorsToggle")) return;
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointSoundToggle, "click", () => {
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      if (!checkpointAlertSoundEnabled) stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointSoundToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointSoundToggle")) return;
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      if (!checkpointAlertSoundEnabled) stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointToastToggle, "click", () => {
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointToastToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointToastToggle")) return;
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
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
      applyAndPersistModeSettingsImmediate();
    });
    on(els.categoryMode3Toggle, "click", () => {
      modeEnabled.mode3 = !modeEnabled.mode3;
      syncModeLabelsUi();
      applyAndPersistModeSettingsImmediate();
    });
    on(els.categoryMode1Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode2Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode3Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode1Input, "blur", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode2Input, "blur", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode3Input, "blur", () => applyAndPersistModeSettingsImmediate());

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    on(els.categorySaveBtn, "click", () => {
      applyAndPersistModeSettingsImmediate({ closeOverlay: true });
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
    on(els.editName, "input", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      syncEditSaveAvailability(tasks[editIndex]);
    });
    on(els.editOverrideElapsedToggle, "click", () => {
      setEditElapsedOverrideEnabled(!isEditElapsedOverrideEnabled());
      if (editIndex != null && tasks[editIndex]) syncEditSaveAvailability(tasks[editIndex]);
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
      if (editIndex != null && tasks[editIndex]) {
        tasks[editIndex].checkpointSoundEnabled = isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(tasks[editIndex]);
        syncEditSaveAvailability(tasks[editIndex]);
      }
    });
    on(els.editCheckpointSoundToggle, "click", () => {
      if (editIndex != null && tasks[editIndex]) {
        tasks[editIndex].checkpointSoundEnabled = isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(tasks[editIndex]);
      }
    });
    on(els.editCheckpointSoundModeSelect, "change", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      tasks[editIndex].checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      syncEditCheckpointAlertUi(tasks[editIndex]);
      syncEditSaveAvailability(tasks[editIndex]);
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
      if (editIndex != null && tasks[editIndex]) {
        tasks[editIndex].checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(tasks[editIndex]);
        syncEditSaveAvailability(tasks[editIndex]);
      }
    });
    on(els.editCheckpointToastToggle, "click", () => {
      if (editIndex != null && tasks[editIndex]) {
        tasks[editIndex].checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(tasks[editIndex]);
      }
    });
    on(els.editCheckpointToastModeSelect, "change", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      tasks[editIndex].checkpointToastMode = els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      syncEditCheckpointAlertUi(tasks[editIndex]);
      syncEditSaveAvailability(tasks[editIndex]);
    });
    on(els.editPresetIntervalsToggle, "click", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      const t = tasks[editIndex];
      maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalsToggleRow, "click", (e: any) => {
      if (editIndex == null || !tasks[editIndex]) return;
      if (e.target?.closest?.("#editPresetIntervalsToggle")) return;
      const t = tasks[editIndex];
      maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalInput, "input", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      const t = tasks[editIndex];
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalInput, "change", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      const t = tasks[editIndex];
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editFinalCheckpointActionSelect, "change", () => {
      if (editIndex == null || !tasks[editIndex]) return;
      tasks[editIndex].finalCheckpointAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : "continue";
      syncEditCheckpointAlertUi(tasks[editIndex]);
      syncEditSaveAvailability(tasks[editIndex]);
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
        if (action === "dot") {
          padAppendDot();
          return;
        }
        if (action === "clear") {
          padClear();
        }
      });
    });

    on(els.msToggle, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestonesEnabled = !t.milestonesEnabled;
      els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
      els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
      els.msArea?.classList.toggle("on", !!t.milestonesEnabled);
      if (els.msArea && "open" in (els.msArea as any)) {
        const hasCheckpoints = Array.isArray(t.milestones) && t.milestones.length > 0;
        (els.msArea as HTMLDetailsElement).open = !!t.milestonesEnabled && !hasCheckpoints;
      }
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);

      if (!t.milestonesEnabled) {
        t.presetIntervalsEnabled = false;
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
      syncEditSaveAvailability(t);
    });
    on(els.msUnitHour, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "hour";
      setMilestoneUnitUi("hour");
      renderMilestoneEditor(t);
      syncEditSaveAvailability(t);
    });
    on(els.msUnitMinute, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "minute";
      setMilestoneUnitUi("minute");
      renderMilestoneEditor(t);
      syncEditSaveAvailability(t);
    });

    on(els.addMsBtn, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      if (t.presetIntervalsEnabled) {
        if (!hasValidPresetInterval(t)) {
          syncEditCheckpointAlertUi(t);
          return;
        }
        addMilestoneWithCurrentPreset(t);
      } else {
        t.milestones = t.milestones || [];
        ensureMilestoneIdentity(t);
        const nextSeq = getPresetIntervalNextSeqNum(t);
        t.milestones.push({ id: cryptoRandomId(), createdSeq: nextSeq, hours: 0, description: "" });
        t.presetIntervalLastMilestoneId = t.milestones[t.milestones.length - 1]?.id || null;
        t.presetIntervalNextSeq = nextSeq + 1;
      }
      renderMilestoneEditor(t);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
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
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "closeCheckpointToast") {
        dismissCheckpointToast({ manual: true });
        return;
      }
      if (action === "jumpToCheckpointTask") {
        dismissCheckpointToastAndJumpToTask();
      }
    });

    on(els.historyManagerBtn, "click", () => {
      navigateToAppRoute("/tasktimer/history-manager");
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
      navigateToAppRoute("/tasktimer");
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
    on(els.focusResetBtn, "click", () => {
      if (!focusModeTaskId) return;
      const idx = tasks.findIndex((x) => String(x.id || "") === String(focusModeTaskId));
      if (idx < 0) return;
      resetTask(idx);
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

    if (checkpointAutoResetDirty) {
      checkpointAutoResetDirty = false;
      save();
      render();
      if (focusModeTaskId) {
        const ft = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
        if (ft) {
          // Force a full checkpoint marker re-layout after auto-reset/log, since the dial
          // update was skipped in the same tick that triggered the reset.
          focusCheckpointSig = "";
          updateFocusDial(ft);
        }
      }
    }

    if (focusModeTaskId) {
      const ft = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
      if (ft) {
        updateFocusDial(ft);
      } else if (els.focusTaskName && focusModeTaskName) {
        els.focusTaskName.textContent = focusModeTaskName;
      }
    }

    if (activeCheckpointToast) {
      renderCheckpointToast();
    }

    tickRaf = window.requestAnimationFrame(() => {
      tickTimeout = window.setTimeout(tick, 200);
    });
  }

  function hydrateUiStateFromCaches() {
    deletedTaskMeta = loadDeletedMeta();
    loadHistoryIntoMemory();
    loadHistoryRangePrefs();
    load();
    loadAddTaskCustomNames();
    loadDefaultTaskTimerFormat();
    loadDynamicColorsSetting();
    loadCheckpointAlertSettings();
    // Keep Preferences controls in sync with hydrated cloud values on both
    // /tasktimer and /tasktimer/settings routes.
    syncTaskSettingsUi();
    loadPinnedHistoryTaskIds();
    loadThemePreference();
    loadModeLabels();
    backfillHistoryColorsFromSessionLogic();
    syncModeLabelsUi();
    applyMainMode("mode1");
    applyAppPage(getInitialAppPageFromQuery(), { syncUrl: "replace" });
    applyDashboardOrderFromStorage();
    applyDashboardEditMode();
  }

  // Init
  const bootstrap = () => {
    hydrateUiStateFromCaches();
    initMobileBackHandling();
    if (!eventsWired) {
      wireEvents();
      eventsWired = true;
    }
    render();
    maybeHandlePendingTaskJump();
    maybeOpenImportFromQuery();
    if (!els.taskList && els.historyManagerScreen) {
      openHistoryManager();
    }
    if (!tickStarted) {
      tick();
      tickStarted = true;
    }
  };

  bootstrap();
  void hydrateStorageFromCloud().then(() => {
    if (destroyed) return;
    hydrateUiStateFromCaches();
    render();
  }).catch(() => {
    // Keep the already-initialized in-memory fallback state.
  });

  return { destroy };
}
