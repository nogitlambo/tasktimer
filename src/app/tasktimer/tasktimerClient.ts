﻿/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey } from "./lib/history";
import {
  getDashboardAvgRangeWindow,
  dashboardAvgRangeLabel,
  formatDashboardDurationShort,
  formatDashboardDurationWithMinutes,
  formatDashboardHeatMonthLabel,
  startOfCurrentWeekMondayMs,
} from "./lib/historyChart";
import { formatMainTaskElapsed, formatMainTaskElapsedHtml } from "./lib/tasks";
import {
  formatAddTaskDurationReadout,
  getAddTaskDurationMaxForPeriod,
  normalizeTaskConfigMilestones,
} from "./lib/taskConfig";
import { AVATAR_CATALOG } from "./lib/avatarCatalog";
import {
  deleteSharedTaskSummariesForTask,
  syncOwnFriendshipProfile,
  type FriendProfile,
} from "./lib/friendsStore";
import {
  STORAGE_KEY,
  buildDefaultCloudPreferences,
  refreshHistoryFromCloud,
  loadHistory,
  appendHistoryEntry,
  saveHistoryLocally,
  saveHistory,
  saveHistoryAndWait,
  loadDeletedMeta,
  saveDeletedMeta,
  cleanupHistory,
  loadCachedDashboard,
  primeDashboardCacheFromShadow,
  loadCachedPreferences,
  subscribeCachedPreferences,
  loadCachedTaskUi,
  saveCloudDashboard,
  saveCloudPreferences,
  saveCloudTaskUi,
} from "./lib/storage";
import { DEFAULT_REWARD_PROGRESS, awardTaskLaunchXp, normalizeRewardProgress } from "./lib/rewards";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import type {
  AppPage,
  DashboardAvgRange,
  DashboardTimelineDensity,
  MainMode,
  TaskTimerClientHandle,
} from "./client/types";
import { collectTaskTimerElements } from "./client/elements";
import { createTaskTimerRuntime, destroyTaskTimerRuntime } from "./client/runtime";
import { createTaskTimerAppShell } from "./client/app-shell";
import { createTaskTimerDashboard } from "./client/dashboard";
import { createTaskTimerDashboardRender } from "./client/dashboard-render";
import { createTaskTimerGroups } from "./client/groups";
import { createTaskTimerSession } from "./client/session";
import { createTaskTimerTasks } from "./client/tasks";
import { createTaskTimerEditTask } from "./client/edit-task";
import { createTaskTimerAddTask } from "./client/add-task";
import { createTaskTimerPreferences } from "./client/preferences";
import { createTaskTimerHistoryManager } from "./client/history-manager";
import { createTaskTimerHistoryInline } from "./client/history-inline";
import { createTaskTimerCloudSync } from "./client/cloud-sync";
import { createTaskTimerPersistence } from "./client/persistence";
import { createTaskTimerRootBootstrap, createTaskTimerStateAccessor } from "./client/root-state";
import {
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "./client/state";

const ARCHITECT_UID = "mWN9rMhO4xMq410c4E4VYyThw0x2";
const ARCHITECT_EMAIL = "aniven82@gmail.com";

export function initTaskTimerClient(initialAppPage: AppPage = "tasks"): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }
  const {
    initialState,
    storageKeys: {
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      THEME_KEY,
      MENU_BUTTON_STYLE_KEY,
      DEFAULT_TASK_TIMER_FORMAT_KEY,
      TASK_VIEW_KEY,
      DYNAMIC_COLORS_KEY,
      CHECKPOINT_ALERT_SOUND_KEY,
      CHECKPOINT_ALERT_TOAST_KEY,
      MODE_SETTINGS_KEY,
      NAV_STACK_KEY,
      FOCUS_SESSION_NOTES_KEY,
      NAV_STACK_MAX,
      NATIVE_BACK_DEBOUNCE_MS,
    },
  } = createTaskTimerRootBootstrap(initialAppPage, STORAGE_KEY);
  const TIME_GOAL_PENDING_FLOW_KEY = `${STORAGE_KEY}:timeGoalPendingFlow`;
  const PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
  const PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";

  const runtime = createTaskTimerRuntime();
  type SuppressedCheckpointToast = {
    title: string;
    text: string;
    autoCloseMs: number | null;
    taskId: string;
    taskName: string | null;
    counterText: string | null;
    checkpointTimeText: string | null;
    checkpointDescText: string | null;
    muteRepeatOnManualDismiss: boolean;
  };
  const { on } = runtime;

  const destroy = () => {
    sessionApi?.destroySessionRuntime();
    destroyTaskTimerRuntime({
      runtime,
      deferredCloudRefreshTimer,
      checkpointToastAutoCloseTimer,
      checkpointToastCountdownRefreshTimer,
      checkpointBeepQueueTimer,
      checkpointRepeatCycleTimer,
      unsubscribeCachedPreferences,
    });
  };

  let deletedTaskMeta = initialState.deletedTaskMeta;
  let tasks = initialState.tasks;
  let currentMode = initialState.currentMode;
  let modeLabels = initialState.modeLabels;
  let modeEnabled = initialState.modeEnabled;
  let editIndex = initialState.editIndex;
  let editDraftSnapshot = initialState.editDraftSnapshot;
  let focusCheckpointSig = initialState.focusCheckpointSig;
  let focusModeTaskName = initialState.focusModeTaskName;
  let focusShowCheckpoints = initialState.focusShowCheckpoints;
  let suppressAddTaskNameFocusOpen = initialState.suppressAddTaskNameFocusOpen;

  let confirmAction = initialState.confirmAction;
  let confirmActionAlt = initialState.confirmActionAlt;
  let themeMode = initialState.themeMode;
  let menuButtonStyle = initialState.menuButtonStyle;
  let addTaskCustomNames = initialState.addTaskCustomNames;
  let defaultTaskTimerFormat = initialState.defaultTaskTimerFormat;
  let taskView = initialState.taskView;
  let dynamicColorsEnabled = initialState.dynamicColorsEnabled;
  let autoFocusOnTaskLaunchEnabled = initialState.autoFocusOnTaskLaunchEnabled;
  let checkpointAlertSoundEnabled = initialState.checkpointAlertSoundEnabled;
  let checkpointAlertToastEnabled = initialState.checkpointAlertToastEnabled;
  let suppressedFocusModeCheckpointAlertsByTaskId: Record<string, SuppressedCheckpointToast> = {};
  let deferredFocusModeTimeGoalModals: Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }> = [];
  let rewardProgress = normalizeRewardProgress(initialState.rewardProgress);

  let historyByTaskId = initialState.historyByTaskId;
  let historyRangeDaysByTaskId = initialState.historyRangeDaysByTaskId;
  let historyRangeModeByTaskId = initialState.historyRangeModeByTaskId;
  let focusModeTaskId = initialState.focusModeTaskId;
  const openHistoryTaskIds = initialState.openHistoryTaskIds;
  let pinnedHistoryTaskIds = initialState.pinnedHistoryTaskIds;
  let hmExpandedTaskGroups = initialState.hmExpandedTaskGroups;
  let hmExpandedDateGroups = initialState.hmExpandedDateGroups;
  let hmSortKey = initialState.hmSortKey;
  let hmSortDir = initialState.hmSortDir;
  let hmBulkEditMode = initialState.hmBulkEditMode;
  let hmBulkSelectedRows = initialState.hmBulkSelectedRows;
  let hmRowsByTask = initialState.hmRowsByTask;
  let hmRowsByTaskDate = initialState.hmRowsByTaskDate;
  const historyViewByTaskId = initialState.historyViewByTaskId;
  let addTaskMilestonesEnabled = initialState.addTaskMilestonesEnabled;
  let addTaskMilestoneTimeUnit = initialState.addTaskMilestoneTimeUnit;
  let addTaskMilestones = initialState.addTaskMilestones;
  let addTaskCheckpointSoundEnabled = initialState.addTaskCheckpointSoundEnabled;
  let addTaskCheckpointSoundMode = initialState.addTaskCheckpointSoundMode;
  let addTaskCheckpointToastEnabled = initialState.addTaskCheckpointToastEnabled;
  let addTaskCheckpointToastMode = initialState.addTaskCheckpointToastMode;
  let addTaskPresetIntervalsEnabled = initialState.addTaskPresetIntervalsEnabled;
  let addTaskPresetIntervalValue = initialState.addTaskPresetIntervalValue;
  let addTaskTimeGoalAction = initialState.addTaskTimeGoalAction;
  let timeGoalModalTaskId = initialState.timeGoalModalTaskId;
  let timeGoalModalFrozenElapsedMs = initialState.timeGoalModalFrozenElapsedMs;
  const timeGoalReminderAtMsByTaskId = initialState.timeGoalReminderAtMsByTaskId;
  let timeGoalCompleteDurationUnit: "minute" | "hour" = "hour";
  let timeGoalCompleteDurationPeriod: "day" | "week" = "day";
  let addTaskWizardStep = initialState.addTaskWizardStep;
  let addTaskDurationValue = initialState.addTaskDurationValue;
  let addTaskDurationUnit = initialState.addTaskDurationUnit;
  let addTaskDurationPeriod = initialState.addTaskDurationPeriod;
  let focusSessionNotesByTaskId = initialState.focusSessionNotesByTaskId;
  let focusSessionNoteSaveTimer: number | null = null;
  let addTaskNoTimeGoal = initialState.addTaskNoTimeGoal;
  let editTaskDurationUnit: "minute" | "hour" = "hour";
  let editTaskDurationPeriod: "day" | "week" = "week";
  let editTaskDraft: Task | null = null;
  let elapsedPadTarget = initialState.elapsedPadTarget;
  let elapsedPadMilestoneRef = initialState.elapsedPadMilestoneRef;
  let elapsedPadDraft = initialState.elapsedPadDraft;
  let elapsedPadOriginal = initialState.elapsedPadOriginal;
  let editMoveTargetMode = initialState.editMoveTargetMode;
  let dashboardEditMode = initialState.dashboardEditMode;
  let dashboardDragEl = initialState.dashboardDragEl;
  let taskDragEl = initialState.taskDragEl;
  let dashboardOrderDraftBeforeEdit = initialState.dashboardOrderDraftBeforeEdit;
  let dashboardCardSizes = initialState.dashboardCardSizes;
  let dashboardCardSizesDraftBeforeEdit = initialState.dashboardCardSizesDraftBeforeEdit;
  let dashboardCardVisibility = initialState.dashboardCardVisibility;
  let dashboardIncludedModes = initialState.dashboardIncludedModes;
  let dashboardAvgRange = initialState.dashboardAvgRange;
  let dashboardTimelineDensity = initialState.dashboardTimelineDensity;
  let currentAppPage = initialState.currentAppPage;
  let currentTileColumnCount = initialState.currentTileColumnCount;
  let suppressNavStackPush = initialState.suppressNavStackPush;
  let lastNativeBackHandledAtMs = initialState.lastNativeBackHandledAtMs;
  const checkpointToastQueue = initialState.checkpointToastQueue;
  let activeCheckpointToast = initialState.activeCheckpointToast;
  let checkpointToastAutoCloseTimer: number | null = null;
  let checkpointToastCountdownRefreshTimer: number | null = null;
  let checkpointBeepAudio = initialState.checkpointBeepAudio;
  let checkpointBeepQueueCount = initialState.checkpointBeepQueueCount;
  let checkpointBeepQueueTimer: number | null = null;
  let checkpointRepeatStopAtMs = initialState.checkpointRepeatStopAtMs;
  let checkpointRepeatCycleTimer: number | null = null;
  let checkpointRepeatActiveTaskId = initialState.checkpointRepeatActiveTaskId;
  let checkpointAutoResetDirty = initialState.checkpointAutoResetDirty;
  let historyNoteCloudRepairAttempted = initialState.historyNoteCloudRepairAttempted;
  const checkpointFiredKeysByTaskId = initialState.checkpointFiredKeysByTaskId;
  const checkpointBaselineSecByTaskId = initialState.checkpointBaselineSecByTaskId;
  let cloudPreferencesCache = loadCachedPreferences();
  let cloudDashboardCache = loadCachedDashboard();
  let cloudTaskUiCache = loadCachedTaskUi();
  rewardProgress = normalizeRewardProgress((cloudPreferencesCache || buildDefaultCloudPreferences()).rewards || DEFAULT_REWARD_PROGRESS);
  let navStackMemory = initialState.navStackMemory;
  let pendingTaskJumpMemory = initialState.pendingTaskJumpMemory;
  let groupsIncomingRequests = initialState.groupsIncomingRequests;
  let groupsOutgoingRequests = initialState.groupsOutgoingRequests;
  let groupsFriendships = initialState.groupsFriendships;
  let groupsSharedSummaries = initialState.groupsSharedSummaries;
  let ownSharedSummaries = initialState.ownSharedSummaries;
  let shareTaskIndex = initialState.shareTaskIndex;
  let shareTaskMode = initialState.shareTaskMode;
  let shareTaskTaskId = initialState.shareTaskTaskId;
  let exportTaskIndex = initialState.exportTaskIndex;
  let groupsLoading = initialState.groupsLoading;
  let groupsLoadingDepth = initialState.groupsLoadingDepth;
  let groupsRefreshSeq = initialState.groupsRefreshSeq;
  let activeFriendProfileUid = initialState.activeFriendProfileUid;
  let activeFriendProfileName = initialState.activeFriendProfileName;
  let historyEntryNoteAnchorTaskId = initialState.historyEntryNoteAnchorTaskId;
  let historyInlineApi: ReturnType<typeof createTaskTimerHistoryInline> | null = null;
  let sessionApi: ReturnType<typeof createTaskTimerSession> | null = null;
  let addTaskApi: ReturnType<typeof createTaskTimerAddTask> | null = null;
  let editTaskApi: ReturnType<typeof createTaskTimerEditTask> | null = null;
  let persistenceApi: ReturnType<typeof createTaskTimerPersistence> | null = null;
  let cloudSyncApi: ReturnType<typeof createTaskTimerCloudSync> | null = null;
  const openFriendSharedTaskUids = initialState.openFriendSharedTaskUids;
  const workingIndicatorStack = initialState.workingIndicatorStack;
  let workingIndicatorKeySeq = initialState.workingIndicatorKeySeq;
  let workingIndicatorOverlayActive = initialState.workingIndicatorOverlayActive;
  let workingIndicatorRestoreFocusEl = initialState.workingIndicatorRestoreFocusEl;
  let friendProfileCacheByUid = initialState.friendProfileCacheByUid;
  let cloudRefreshInFlight = initialState.cloudRefreshInFlight;
  let lastCloudRefreshAtMs = initialState.lastCloudRefreshAtMs;
  const flippedTaskIds = new Set<string>();
  let lastRenderedTaskFlipMode: MainMode | null = null;
  let lastRenderedTaskFlipView: "list" | "tile" | null = null;
  let deferredCloudRefreshTimer: number | null = null;
  let pendingDeferredCloudRefresh = initialState.pendingDeferredCloudRefresh;
  let lastUiInteractionAtMs = initialState.lastUiInteractionAtMs;
  let historyManagerRefreshInFlight: Promise<void> | null = null;
  const dashboardWidgetHasRenderedData = initialState.dashboardWidgetHasRenderedData;
  const unsubscribeCachedPreferences = subscribeCachedPreferences((prefs) => {
    cloudPreferencesCache = prefs;
    rewardProgress = normalizeRewardProgress((prefs || buildDefaultCloudPreferences()).rewards || DEFAULT_REWARD_PROGRESS);
  });
  const avatarSrcById = AVATAR_CATALOG.reduce<Record<string, string>>((acc, item) => {
    const key = String(item.id || "").trim();
    if (key) acc[key] = item.src;
    return acc;
  }, {});
  const defaultFriendAvatarSrc = "/avatars/initials/initials-AN.svg";

  function normalizeFriendAvatarSrc(src: string): string {
    const value = String(src || "").trim();
    if (!value) return "";
    if (/^(?:data:|blob:|https?:\/\/|file:)/i.test(value)) return value;
    const normalizedValue = value.replace(/^\/tasktimer(?=\/avatars\/)/i, "");
    if (/^avatars\//i.test(normalizedValue)) return `/${normalizedValue}`;
    if (/^\/avatars\//i.test(normalizedValue)) {
      const capacitorApi = (window as any)?.Capacitor;
      const isNativeCapacitorRuntime = !!(
        capacitorApi &&
        typeof capacitorApi.isNativePlatform === "function" &&
        capacitorApi.isNativePlatform()
      );
      const usesExportedHtmlPaths =
        window.location.protocol === "file:" || /\.html$/i.test(window.location.pathname || "") || isNativeCapacitorRuntime;
      return usesExportedHtmlPaths ? `${taskTimerExportBasePath()}${normalizedValue}` : normalizedValue;
    }
    if (/^[^/].+\.(?:svg|png|jpe?g|webp|gif)$/i.test(normalizedValue)) return `/${normalizedValue}`;
    return normalizedValue;
  }

  function getFriendAvatarSrcById(avatarIdRaw: string): string {
    const avatarId = String(avatarIdRaw || "").trim();
    if (!avatarId) return normalizeFriendAvatarSrc(defaultFriendAvatarSrc);
    const knownSrc = avatarSrcById[avatarId];
    if (knownSrc) return normalizeFriendAvatarSrc(knownSrc);
    if (
      /^(?:data:|blob:|https?:\/\/|file:)/i.test(avatarId) ||
      /^\/(?:tasktimer\/)?avatars\//i.test(avatarId)
    ) {
      return normalizeFriendAvatarSrc(avatarId);
    }
    return normalizeFriendAvatarSrc(defaultFriendAvatarSrc);
  }

  function getMergedFriendProfile(friendUid: string, baseProfile?: FriendProfile | null): FriendProfile {
    const cachedProfile = friendProfileCacheByUid[String(friendUid || "").trim()] || null;
    return {
      alias: cachedProfile?.alias ?? baseProfile?.alias ?? null,
      avatarId: cachedProfile?.avatarId ?? baseProfile?.avatarId ?? null,
      avatarCustomSrc: cachedProfile?.avatarCustomSrc ?? baseProfile?.avatarCustomSrc ?? null,
      googlePhotoUrl: cachedProfile?.googlePhotoUrl ?? baseProfile?.googlePhotoUrl ?? null,
      rankThumbnailSrc: cachedProfile?.rankThumbnailSrc ?? baseProfile?.rankThumbnailSrc ?? null,
      currentRankId: cachedProfile?.currentRankId ?? baseProfile?.currentRankId ?? null,
    };
  }

  function isGoogleProfileAvatarId(avatarIdRaw: string): boolean {
    return /^google\/profile-photo:/i.test(String(avatarIdRaw || "").trim());
  }

  function buildFriendInitialAvatarDataUrl(labelRaw: string): string {
    const label = String(labelRaw || "").trim();
    const initial = (label.charAt(0) || "?").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0f1720"/><rect x="1.5" y="1.5" width="61" height="61" fill="none" stroke="#79e2ff" stroke-opacity=".4" stroke-width="1.5"/><text x="32" y="39" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#eaf7ff">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function getFriendAvatarImageSrc(profile?: FriendProfile | null): string {
    const customSrc = String(profile?.avatarCustomSrc || "").trim();
    if (customSrc) return normalizeFriendAvatarSrc(customSrc);
    const avatarId = String(profile?.avatarId || "").trim();
    if (!avatarId) return "";
    if (isGoogleProfileAvatarId(avatarId)) {
      const googlePhotoUrl = String(profile?.googlePhotoUrl || "").trim();
      return googlePhotoUrl ? normalizeFriendAvatarSrc(googlePhotoUrl) : "";
    }
    const resolved = getFriendAvatarSrcById(avatarId);
    return resolved === normalizeFriendAvatarSrc(defaultFriendAvatarSrc) ? "" : resolved;
  }

  function getFriendAvatarSrc(profile?: FriendProfile | null): string {
    const resolved = getFriendAvatarImageSrc(profile);
    return resolved || buildFriendInitialAvatarDataUrl(String(profile?.alias || ""));
  }

  const els = collectTaskTimerElements(document);

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
    if (top.id === "timeGoalCompleteOverlay") {
      return true;
    }
    if (top.id === "exportTaskOverlay") {
      closeTaskExportModal();
      return true;
    }
    if (top.id === "shareTaskModal") {
      closeShareTaskModal();
      return true;
    }
    closeOverlay(top);
    return true;
  }

  function closeMobileDetailPanelIfOpen() {
    const mobileBackBtn = document.querySelector(
      ".settingsDetailPanel.isMobileOpen .settingsMobileBackBtn"
    ) as HTMLButtonElement | null;
    if (!mobileBackBtn || mobileBackBtn.disabled) return false;
    mobileBackBtn.click();
    return true;
  }

  const groupsApi = createTaskTimerGroups({
    els,
    on,
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getCurrentUid: () => currentUid(),
    getCurrentAppPage: () => currentAppPage,
    getCurrentMode: () => currentMode,
    applyMainMode,
    applyAppPage: (page, opts) => applyAppPage(page, opts),
    render,
    closeConfirm,
    confirm,
    escapeHtmlUI,
    taskModeOf: (task) => (task ? taskModeOf(task) : "mode1"),
    normalizeHistoryTimestampMs,
    showWorkingIndicator,
    hideWorkingIndicator,
    getMergedFriendProfile,
    getFriendAvatarSrcById,
    buildFriendInitialAvatarDataUrl,
    getFriendAvatarSrc,
    jumpToTaskById,
    getGroupsIncomingRequests: () => groupsIncomingRequests,
    setGroupsIncomingRequests: (value) => {
      groupsIncomingRequests = value;
    },
    getGroupsOutgoingRequests: () => groupsOutgoingRequests,
    setGroupsOutgoingRequests: (value) => {
      groupsOutgoingRequests = value;
    },
    getGroupsFriendships: () => groupsFriendships,
    setGroupsFriendships: (value) => {
      groupsFriendships = value;
    },
    getGroupsSharedSummaries: () => groupsSharedSummaries,
    setGroupsSharedSummaries: (value) => {
      groupsSharedSummaries = value;
    },
    getOwnSharedSummaries: () => ownSharedSummaries,
    setOwnSharedSummaries: (value) => {
      ownSharedSummaries = value;
    },
    getGroupsLoading: () => groupsLoading,
    setGroupsLoading: (value) => {
      groupsLoading = value;
    },
    getGroupsLoadingDepth: () => groupsLoadingDepth,
    setGroupsLoadingDepth: (value) => {
      groupsLoadingDepth = value;
    },
    getGroupsRefreshSeq: () => groupsRefreshSeq,
    setGroupsRefreshSeq: (value) => {
      groupsRefreshSeq = value;
    },
    getActiveFriendProfileUid: () => activeFriendProfileUid,
    setActiveFriendProfileUid: (value) => {
      activeFriendProfileUid = value;
    },
    getActiveFriendProfileName: () => activeFriendProfileName,
    setActiveFriendProfileName: (value) => {
      activeFriendProfileName = value;
    },
    getFriendProfileCacheByUid: () => friendProfileCacheByUid,
    setFriendProfileCacheByUid: (value) => {
      friendProfileCacheByUid = value;
    },
    getShareTaskIndex: () => shareTaskIndex,
    setShareTaskIndex: (value) => {
      shareTaskIndex = value;
    },
    getShareTaskMode: () => shareTaskMode,
    setShareTaskMode: (value) => {
      shareTaskMode = value;
    },
    getShareTaskTaskId: () => shareTaskTaskId,
    setShareTaskTaskId: (value) => {
      shareTaskTaskId = value;
    },
    getOpenFriendSharedTaskUids: () => openFriendSharedTaskUids,
  });
  const {
    renderGroupsPage,
    renderFriendsFooterAlertBadge,
    refreshGroupsData,
    closeFriendProfileModal,
    closeFriendRequestModal,
    openShareTaskModal,
    closeShareTaskModal,
    refreshOwnSharedSummaries,
    reconcileOwnedSharedSummaryStates,
    syncSharedTaskSummariesForTask,
    syncSharedTaskSummariesForTasks,
    registerGroupsEvents,
  } = groupsApi;
  const dashboardRenderApi = createTaskTimerDashboardRender({
    els,
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getDeletedTaskMeta: () => deletedTaskMeta,
    getDashboardIncludedModes: () => dashboardIncludedModes,
    getDashboardAvgRange: () => dashboardAvgRange,
    setDashboardAvgRange: (value) => {
      dashboardAvgRange = value;
    },
    getDashboardTimelineDensity: () => dashboardTimelineDensity,
    setDashboardTimelineDensity: (value) => {
      dashboardTimelineDensity = value;
    },
    getDashboardWidgetHasRenderedData: () => dashboardWidgetHasRenderedData,
    getCloudRefreshInFlight: () => cloudRefreshInFlight,
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    getElapsedMs,
    escapeHtmlUI,
    normalizeHistoryTimestampMs,
    taskModeOf,
    isModeEnabled: (mode) => isModeEnabled(mode),
    getModeLabel: (mode) => getModeLabel(mode),
    getModeColor: (mode) => getModeColor(mode),
    addRangeMsToLocalDayMap,
  });
  const {
    renderDashboardTimelineCard: renderDashboardTimelineCardApi,
    renderDashboardWidgets: renderDashboardWidgetsFromRenderApi,
    openDashboardHeatSummaryCard: openDashboardHeatSummaryCardApi,
    closeDashboardHeatSummaryCard: closeDashboardHeatSummaryCardApi,
  } = dashboardRenderApi;
  const dashboardApi = createTaskTimerDashboard({
    els,
    on,
    getCurrentAppPage: () => currentAppPage,
    getDashboardEditMode: () => dashboardEditMode,
    setDashboardEditMode: (value: typeof dashboardEditMode) => {
      dashboardEditMode = value;
    },
    getDashboardDragEl: () => dashboardDragEl,
    setDashboardDragEl: (value: typeof dashboardDragEl) => {
      dashboardDragEl = value;
    },
    getDashboardOrderDraftBeforeEdit: () => dashboardOrderDraftBeforeEdit,
    setDashboardOrderDraftBeforeEdit: (value: typeof dashboardOrderDraftBeforeEdit) => {
      dashboardOrderDraftBeforeEdit = value;
    },
    getDashboardCardSizes: () => dashboardCardSizes,
    setDashboardCardSizes: (value: typeof dashboardCardSizes) => {
      dashboardCardSizes = value;
    },
    getDashboardCardSizesDraftBeforeEdit: () => dashboardCardSizesDraftBeforeEdit,
    setDashboardCardSizesDraftBeforeEdit: (value: typeof dashboardCardSizesDraftBeforeEdit) => {
      dashboardCardSizesDraftBeforeEdit = value;
    },
    getDashboardCardVisibility: () => dashboardCardVisibility,
    setDashboardCardVisibility: (value: typeof dashboardCardVisibility) => {
      dashboardCardVisibility = value;
    },
    getDashboardIncludedModes: () => dashboardIncludedModes,
    setDashboardIncludedModes: (value: typeof dashboardIncludedModes) => {
      dashboardIncludedModes = value;
    },
    getDashboardAvgRange: () => dashboardAvgRange,
    setDashboardAvgRange: (value: typeof dashboardAvgRange) => {
      dashboardAvgRange = value;
    },
    getDashboardTimelineDensity: () => dashboardTimelineDensity,
    setDashboardTimelineDensity: (value: typeof dashboardTimelineDensity) => {
      dashboardTimelineDensity = value;
    },
    getCloudDashboardCache: () => cloudDashboardCache,
    setCloudDashboardCache: (value: unknown) => {
      cloudDashboardCache = value as typeof cloudDashboardCache;
    },
    loadCachedDashboard,
    saveCloudDashboard: (value: unknown) => {
      const nextDashboard = value as NonNullable<typeof cloudDashboardCache>;
      if (nextDashboard) saveCloudDashboard(nextDashboard);
    },
    getModeLabel: (mode) => getModeLabel(mode),
    isModeEnabled: (mode) => isModeEnabled(mode),
    renderDashboardWidgets: (opts) => renderDashboardWidgetsFromRenderApi(opts),
    renderDashboardTimelineCard: () => renderDashboardTimelineCardApi(),
    openDashboardHeatSummaryCard: (dayKey, dateLabel) => openDashboardHeatSummaryCardApi(dayKey, dateLabel),
    closeDashboardHeatSummaryCard: (opts) => closeDashboardHeatSummaryCardApi(opts),
  });
  const {
    renderDashboardPanelMenu: renderDashboardPanelMenuApi,
    renderDashboardWidgets: renderDashboardWidgetsApi,
    saveDashboardWidgetState: saveDashboardWidgetStateApi,
    getDashboardCardSizeMapForStorage: getDashboardCardSizeMapForStorageApi,
    getDashboardAvgRange: getDashboardAvgRangeApi,
    ensureDashboardIncludedModesValid: ensureDashboardIncludedModesValidApi,
    loadDashboardWidgetState: loadDashboardWidgetStateApi,
    applyDashboardCardVisibility: applyDashboardCardVisibilityApi,
    applyDashboardCardSizes: applyDashboardCardSizesApi,
    applyDashboardOrderFromStorage: applyDashboardOrderFromStorageApi,
    applyDashboardEditMode: applyDashboardEditModeApi,
    registerDashboardEvents,
  } = dashboardApi;
  const tasksApi = createTaskTimerTasks({
    els,
    on,
    getTasks: () => tasks,
    setTasks: (value: typeof tasks) => {
      tasks = value;
    },
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (value: typeof historyByTaskId) => {
      historyByTaskId = value;
    },
    getDeletedTaskMeta: () => deletedTaskMeta,
    setDeletedTaskMeta: (value: typeof deletedTaskMeta) => {
      deletedTaskMeta = value;
    },
    getCurrentUid: () => currentUid(),
    getCurrentAppPage: () => currentAppPage,
    getCurrentMode: () => currentMode,
    getTaskView: () => taskView,
    getCurrentTileColumnCount: () => currentTileColumnCount,
    setCurrentTileColumnCount: (value: typeof currentTileColumnCount) => {
      currentTileColumnCount = value;
    },
    getFocusModeTaskId: () => focusModeTaskId,
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    getPinnedHistoryTaskIds: () => pinnedHistoryTaskIds,
    getHistoryViewByTaskId: () => historyViewByTaskId,
    getThemeMode: () => themeMode,
    getAutoFocusOnTaskLaunchEnabled: () => autoFocusOnTaskLaunchEnabled,
    getCheckpointAlertSoundEnabled: () => checkpointAlertSoundEnabled,
    getCheckpointAlertToastEnabled: () => checkpointAlertToastEnabled,
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    getEditIndex: () => editIndex,
    setEditIndex: (value: typeof editIndex) => {
      editIndex = value;
    },
    getEditTaskDraft: () => editTaskDraft,
    setEditTaskDraft: (value: typeof editTaskDraft) => {
      editTaskDraft = value;
    },
    getEditTaskDurationUnit: () => editTaskDurationUnit,
    setEditTaskDurationUnit: (value: typeof editTaskDurationUnit) => {
      editTaskDurationUnit = value;
    },
    getEditTaskDurationPeriod: () => editTaskDurationPeriod,
    setEditTaskDurationPeriod: (value: typeof editTaskDurationPeriod) => {
      editTaskDurationPeriod = value;
    },
    getEditDraftSnapshot: () => editDraftSnapshot,
    setEditDraftSnapshot: (value: typeof editDraftSnapshot) => {
      editDraftSnapshot = value;
    },
    getEditMoveTargetMode: () => editMoveTargetMode,
    setEditMoveTargetMode: (value: typeof editMoveTargetMode) => {
      editMoveTargetMode = value;
    },
    getElapsedPadTarget: () => elapsedPadTarget,
    setElapsedPadTarget: (value: typeof elapsedPadTarget) => {
      elapsedPadTarget = value;
    },
    getElapsedPadMilestoneRef: () => elapsedPadMilestoneRef,
    setElapsedPadMilestoneRef: (value: typeof elapsedPadMilestoneRef) => {
      elapsedPadMilestoneRef = value;
    },
    getElapsedPadDraft: () => elapsedPadDraft,
    setElapsedPadDraft: (value: typeof elapsedPadDraft) => {
      elapsedPadDraft = value;
    },
    getElapsedPadOriginal: () => elapsedPadOriginal,
    setElapsedPadOriginal: (value: typeof elapsedPadOriginal) => {
      elapsedPadOriginal = value;
    },
    getCheckpointAutoResetDirty: () => checkpointAutoResetDirty,
    setCheckpointAutoResetDirty: (value: typeof checkpointAutoResetDirty) => {
      checkpointAutoResetDirty = value;
    },
    render,
    renderHistory,
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    syncTimeGoalModalWithTaskState: () => sessionApi?.syncTimeGoalModalWithTaskState(),
    maybeRestorePendingTimeGoalFlow: () => sessionApi?.maybeRestorePendingTimeGoalFlow(),
    getElapsedMs: (task) => sessionApi?.getElapsedMs(task) ?? 0,
    getTaskElapsedMs: (task) => sessionApi?.getTaskElapsedMs(task) ?? 0,
    save,
    saveHistory,
    saveDeletedMeta,
    escapeHtmlUI,
    taskModeOf: (task) => (task ? taskModeOf(task) : "mode1"),
    milestoneUnitSec: (task) => milestoneUnitSec(task),
    milestoneUnitSuffix: (task) => milestoneUnitSuffix(task),
    getModeColor: (mode) => getModeColor(mode),
    fillBackgroundForPct,
    formatMainTaskElapsedHtml,
    sortMilestones,
    isTaskSharedByOwner,
    confirm,
    closeConfirm,
    openEdit: (index) => editTaskApi?.openEdit(index),
    clearTaskTimeGoalFlow: (taskId) => sessionApi?.clearTaskTimeGoalFlow(taskId),
    flushPendingFocusSessionNoteSave: (taskId) => sessionApi?.flushPendingFocusSessionNoteSave(taskId),
    awardLaunchXpForTask,
    clearCheckpointBaseline: (taskId) => sessionApi?.clearCheckpointBaseline(taskId),
    openFocusMode: (index) => sessionApi?.openFocusMode(index),
    closeFocusMode: () => sessionApi?.closeFocusMode(),
    canLogSession,
    appendCompletedSessionHistory,
    resetCheckpointAlertTracking: (taskId) => sessionApi?.resetCheckpointAlertTracking(taskId),
    clearFocusSessionDraft: (taskId) => sessionApi?.clearFocusSessionDraft(taskId),
    syncFocusSessionNotesInput: (taskId) => sessionApi?.syncFocusSessionNotesInput(taskId),
    syncFocusSessionNotesAccordion: (taskId) => sessionApi?.syncFocusSessionNotesAccordion(taskId),
    captureResetActionSessionNote: (taskId) => sessionApi?.captureResetActionSessionNote(taskId) || "",
    setFocusSessionDraft: (taskId, note) => sessionApi?.setFocusSessionDraft(taskId, note),
    setResetTaskConfirmBusy,
    syncConfirmPrimaryToggleUi,
    cloneTaskForEdit: (task) => cloneTaskForEdit(task),
    getModeLabel: (mode) => getModeLabel(mode),
    isModeEnabled: (mode) => isModeEnabled(mode),
    setEditTimeGoalEnabled: (enabled) => setEditTimeGoalEnabled(enabled),
    syncEditTaskTimeGoalUi: (task) => syncEditTaskTimeGoalUi(task),
    syncEditCheckpointAlertUi: (task) => syncEditCheckpointAlertUi(task),
    syncEditSaveAvailability: (task) => syncEditSaveAvailability(task),
    syncEditMilestoneSectionUi: (task) => syncEditMilestoneSectionUi(task),
    setMilestoneUnitUi: (unit) => setMilestoneUnitUi(unit),
    renderMilestoneEditor: (task) => renderMilestoneEditor(task),
    clearEditValidationState: () => clearEditValidationState(),
    validateEditTimeGoal: () => validateEditTimeGoal(),
    showEditValidationError: (task, message) => showEditValidationError(task, message),
    editTaskHasActiveTimeGoal: () => editTaskHasActiveTimeGoal(),
    hasNonPositiveCheckpoint: (milestones) => hasNonPositiveCheckpoint(milestones),
    hasCheckpointAtOrAboveTimeGoal: (milestones, unitSec, timeGoalMinutes) =>
      hasCheckpointAtOrAboveTimeGoal(milestones, unitSec, timeGoalMinutes),
    isCheckpointAtOrAboveTimeGoal: (checkpointHours, unitSec, timeGoalMinutes) =>
      isCheckpointAtOrAboveTimeGoal(checkpointHours, unitSec, timeGoalMinutes),
    formatCheckpointTimeGoalText: (task, opts) => formatCheckpointTimeGoalText(task, opts),
    getEditTaskTimeGoalMinutes: () => getEditTaskTimeGoalMinutes(),
    getEditTaskTimeGoalMinutesFor: (value, unit, period) => getEditTaskTimeGoalMinutesFor(value, unit, period),
    getAddTaskTimeGoalMinutesState: () => addTaskApi?.getAddTaskTimeGoalMinutes() ?? 0,
    isEditTimeGoalEnabled: () => isEditTimeGoalEnabled(),
    ensureMilestoneIdentity: (task) => ensureMilestoneIdentity(task),
    toggleSwitchElement: (el, on) => toggleSwitchElement(el, on),
    isSwitchOn: (el) => isSwitchOn(el),
    buildEditDraftSnapshot: (task) => buildEditDraftSnapshot(task),
    getCurrentEditTask: () => getCurrentEditTask(),
    syncEditTaskDurationReadout: (task) => syncEditTaskDurationReadout(task),
    maybeToggleEditPresetIntervals: (nextEnabled) => maybeToggleEditPresetIntervals(nextEnabled),
    hasValidPresetInterval: (task) => hasValidPresetInterval(task),
    addMilestoneWithCurrentPreset: (task, timeGoalMinutes) => addMilestoneWithCurrentPreset(task, timeGoalMinutes),
    getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
    isEditMilestoneUnitDay: () => isEditMilestoneUnitDay(),
    setTaskFlipped: (taskId, flipped, taskEl) => setTaskFlipped(taskId, flipped, taskEl),
    syncTaskFlipStatesForVisibleTasks: (activeTaskIds) => syncTaskFlipStatesForVisibleTasks(activeTaskIds),
    applyTaskFlipDomState: (taskId, taskEl) => applyTaskFlipDomState(taskId, taskEl),
    openHistoryInline: (index) => historyInlineApi?.openHistory(index),
    openTaskExportModal: (index) => openTaskExportModal(index),
    openShareTaskModal: (index) => openShareTaskModal(index),
    currentUid: () => currentUid(),
    deleteSharedTaskSummariesForTask,
    refreshOwnSharedSummaries,
    refreshGroupsData,
    deleteTask: (index) => deleteTask(index),
    isFocusModeFilteringAlerts: () => sessionApi?.isFocusModeFilteringAlerts() || false,
    getSuppressedFocusModeAlert: (taskId) => sessionApi?.getSuppressedFocusModeAlert(taskId) || null,
    checkpointRepeatActiveTaskId: () => sessionApi?.checkpointRepeatActiveTaskId() || null,
    activeCheckpointToastTaskId: () => sessionApi?.activeCheckpointToastTaskId() || null,
    stopCheckpointRepeatAlert: () => sessionApi?.stopCheckpointRepeatAlert(),
    enqueueCheckpointToast: (title, text, opts) => sessionApi?.enqueueCheckpointToast(title, text, opts as any),
    clearSuppressedFocusModeAlert: (taskId) => sessionApi?.clearSuppressedFocusModeAlert(taskId),
    syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
    syncSharedTaskSummariesForTasks: (taskIds) => syncSharedTaskSummariesForTasks(taskIds),
  });
  const {
    renderTasksPage,
    startTask: startTaskApi,
    stopTask: stopTaskApi,
    resetTask: resetTaskApi,
    resetTaskStateImmediate: resetTaskStateImmediateApi,
    registerTaskEvents,
  } = tasksApi;
  addTaskApi = createTaskTimerAddTask({
    els,
    on,
    getTasks: () => tasks,
    setTasks: (value: typeof tasks) => {
      tasks = value;
    },
    getAddTaskWizardStep: () => addTaskWizardStep,
    setAddTaskWizardStepState: (value) => {
      addTaskWizardStep = value;
    },
    getAddTaskDurationValue: () => addTaskDurationValue,
    setAddTaskDurationValueState: (value) => {
      addTaskDurationValue = value;
    },
    getAddTaskDurationUnit: () => addTaskDurationUnit,
    setAddTaskDurationUnitState: (value) => {
      addTaskDurationUnit = value;
    },
    getAddTaskDurationPeriod: () => addTaskDurationPeriod,
    setAddTaskDurationPeriodState: (value) => {
      addTaskDurationPeriod = value;
    },
    getAddTaskNoTimeGoal: () => addTaskNoTimeGoal,
    setAddTaskNoTimeGoalState: (value) => {
      addTaskNoTimeGoal = value;
    },
    getAddTaskMilestonesEnabled: () => addTaskMilestonesEnabled,
    setAddTaskMilestonesEnabledState: (value) => {
      addTaskMilestonesEnabled = value;
    },
    getAddTaskMilestoneTimeUnit: () => addTaskMilestoneTimeUnit,
    setAddTaskMilestoneTimeUnitState: (value) => {
      addTaskMilestoneTimeUnit = value;
    },
    getAddTaskMilestones: () => addTaskMilestones,
    setAddTaskMilestonesState: (value) => {
      addTaskMilestones = value;
    },
    getAddTaskCheckpointSoundEnabled: () => addTaskCheckpointSoundEnabled,
    setAddTaskCheckpointSoundEnabledState: (value) => {
      addTaskCheckpointSoundEnabled = value;
    },
    getAddTaskCheckpointSoundMode: () => addTaskCheckpointSoundMode,
    setAddTaskCheckpointSoundModeState: (value) => {
      addTaskCheckpointSoundMode = value;
    },
    getAddTaskCheckpointToastEnabled: () => addTaskCheckpointToastEnabled,
    setAddTaskCheckpointToastEnabledState: (value) => {
      addTaskCheckpointToastEnabled = value;
    },
    getAddTaskCheckpointToastMode: () => addTaskCheckpointToastMode,
    setAddTaskCheckpointToastModeState: (value) => {
      addTaskCheckpointToastMode = value;
    },
    getAddTaskPresetIntervalsEnabled: () => addTaskPresetIntervalsEnabled,
    setAddTaskPresetIntervalsEnabledState: (value) => {
      addTaskPresetIntervalsEnabled = value;
    },
    getAddTaskPresetIntervalValue: () => addTaskPresetIntervalValue,
    setAddTaskPresetIntervalValueState: (value) => {
      addTaskPresetIntervalValue = value;
    },
    getAddTaskTimeGoalAction: () => addTaskTimeGoalAction,
    setAddTaskTimeGoalActionState: (value) => {
      addTaskTimeGoalAction = value;
    },
    getAddTaskCustomNames: () => addTaskCustomNames,
    setAddTaskCustomNamesState: (value) => {
      addTaskCustomNames = value;
    },
    getSuppressAddTaskNameFocusOpen: () => suppressAddTaskNameFocusOpen,
    setSuppressAddTaskNameFocusOpenState: (value) => {
      suppressAddTaskNameFocusOpen = value;
    },
    getDefaultTaskTimerFormat: () => defaultTaskTimerFormat,
    getCheckpointAlertSoundEnabled: () => checkpointAlertSoundEnabled,
    getCheckpointAlertToastEnabled: () => checkpointAlertToastEnabled,
    loadCachedTaskUi: () => cloudTaskUiCache || loadCachedTaskUi(),
    saveCloudTaskUi: (next) => {
      cloudTaskUiCache = next as typeof cloudTaskUiCache;
      saveCloudTaskUi(next as Parameters<typeof saveCloudTaskUi>[0]);
    },
    openOverlay: (overlay) => openOverlay(overlay),
    closeOverlay: (overlay) => closeOverlay(overlay),
    save,
    render,
    escapeHtmlUI,
    sortMilestones,
    makeTask,
    jumpToTaskAndHighlight,
    clearAddTaskValidationState,
    showAddTaskValidationError,
    syncAddTaskCheckpointAlertUi,
    syncAddTaskDurationReadout,
    setAddTaskMilestoneUnitUi,
    renderAddTaskMilestoneEditor,
    hasNonPositiveCheckpoint,
    hasCheckpointAtOrAboveTimeGoal,
    isCheckpointAtOrAboveTimeGoal,
  });
  const {
    registerAddTaskEvents,
    loadAddTaskCustomNames: loadAddTaskCustomNamesApi,
  } = addTaskApi;

  sessionApi = createTaskTimerSession({
    els,
    on,
    runtime,
    storageKeys: {
      FOCUS_SESSION_NOTES_KEY,
      TIME_GOAL_PENDING_FLOW_KEY,
    },
    getTasks: () => tasks,
    getCurrentAppPage: () => currentAppPage,
    getHistoryByTaskId: () => historyByTaskId,
    getCurrentUid: () => currentUid(),
    getFocusModeTaskId: () => focusModeTaskId,
    setFocusModeTaskId: (value) => {
      focusModeTaskId = value;
    },
    getFocusModeTaskName: () => focusModeTaskName,
    setFocusModeTaskName: (value) => {
      focusModeTaskName = value;
    },
    getFocusShowCheckpoints: () => focusShowCheckpoints,
    setFocusShowCheckpoints: (value) => {
      focusShowCheckpoints = value;
    },
    getFocusCheckpointSig: () => focusCheckpointSig,
    setFocusCheckpointSig: (value) => {
      focusCheckpointSig = value;
    },
    getSuppressedFocusModeCheckpointAlertsByTaskId: () => suppressedFocusModeCheckpointAlertsByTaskId,
    setSuppressedFocusModeCheckpointAlertsByTaskId: (value) => {
      suppressedFocusModeCheckpointAlertsByTaskId = value as typeof suppressedFocusModeCheckpointAlertsByTaskId;
    },
    getDeferredFocusModeTimeGoalModals: () => deferredFocusModeTimeGoalModals,
    setDeferredFocusModeTimeGoalModals: (value) => {
      deferredFocusModeTimeGoalModals = value;
    },
    getTimeGoalModalTaskId: () => timeGoalModalTaskId,
    setTimeGoalModalTaskId: (value) => {
      timeGoalModalTaskId = value;
    },
    getTimeGoalModalFrozenElapsedMs: () => timeGoalModalFrozenElapsedMs,
    setTimeGoalModalFrozenElapsedMs: (value) => {
      timeGoalModalFrozenElapsedMs = value;
    },
    getTimeGoalReminderAtMsByTaskId: () => timeGoalReminderAtMsByTaskId,
    getTimeGoalCompleteDurationUnit: () => timeGoalCompleteDurationUnit,
    setTimeGoalCompleteDurationUnit: (value) => {
      timeGoalCompleteDurationUnit = value;
    },
    getTimeGoalCompleteDurationPeriod: () => timeGoalCompleteDurationPeriod,
    setTimeGoalCompleteDurationPeriod: (value) => {
      timeGoalCompleteDurationPeriod = value;
    },
    getFocusSessionNotesByTaskId: () => focusSessionNotesByTaskId,
    setFocusSessionNotesByTaskId: (value) => {
      focusSessionNotesByTaskId = value;
    },
    getFocusSessionNoteSaveTimer: () => focusSessionNoteSaveTimer,
    setFocusSessionNoteSaveTimer: (value) => {
      focusSessionNoteSaveTimer = value;
    },
    getCheckpointToastQueue: () => checkpointToastQueue,
    getActiveCheckpointToast: () => activeCheckpointToast,
    setActiveCheckpointToast: (value) => {
      activeCheckpointToast = value as typeof activeCheckpointToast;
    },
    getCheckpointToastAutoCloseTimer: () => checkpointToastAutoCloseTimer,
    setCheckpointToastAutoCloseTimer: (value) => {
      checkpointToastAutoCloseTimer = value;
    },
    getCheckpointToastCountdownRefreshTimer: () => checkpointToastCountdownRefreshTimer,
    setCheckpointToastCountdownRefreshTimer: (value) => {
      checkpointToastCountdownRefreshTimer = value;
    },
    getCheckpointBeepAudio: () => checkpointBeepAudio,
    setCheckpointBeepAudio: (value) => {
      checkpointBeepAudio = value;
    },
    getCheckpointBeepQueueCount: () => checkpointBeepQueueCount,
    setCheckpointBeepQueueCount: (value) => {
      checkpointBeepQueueCount = value;
    },
    getCheckpointBeepQueueTimer: () => checkpointBeepQueueTimer,
    setCheckpointBeepQueueTimer: (value) => {
      checkpointBeepQueueTimer = value;
    },
    getCheckpointRepeatStopAtMs: () => checkpointRepeatStopAtMs,
    setCheckpointRepeatStopAtMs: (value) => {
      checkpointRepeatStopAtMs = value;
    },
    getCheckpointRepeatCycleTimer: () => checkpointRepeatCycleTimer,
    setCheckpointRepeatCycleTimer: (value) => {
      checkpointRepeatCycleTimer = value;
    },
    getCheckpointRepeatActiveTaskId: () => checkpointRepeatActiveTaskId,
    setCheckpointRepeatActiveTaskId: (value) => {
      checkpointRepeatActiveTaskId = value;
    },
    getCheckpointAutoResetDirty: () => checkpointAutoResetDirty,
    setCheckpointAutoResetDirty: (value) => {
      checkpointAutoResetDirty = value;
    },
    getCheckpointFiredKeysByTaskId: () => checkpointFiredKeysByTaskId,
    getCheckpointBaselineSecByTaskId: () => checkpointBaselineSecByTaskId,
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    getCheckpointAlertSoundEnabled: () => checkpointAlertSoundEnabled,
    getCheckpointAlertToastEnabled: () => checkpointAlertToastEnabled,
    render,
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    save,
    openOverlay: (overlay) => openOverlay(overlay),
    closeOverlay: (overlay) => closeOverlay(overlay),
    navigateToAppRoute: (path) => navigateToAppRoute(path),
    normalizedPathname: () => normalizedPathname(),
    savePendingTaskJump: (taskId) => savePendingTaskJump(taskId),
    jumpToTaskById: (taskId) => jumpToTaskById(taskId),
    escapeHtmlUI,
    formatTime,
    formatMainTaskElapsed,
    formatMainTaskElapsedHtml,
    formatCheckpointTimeGoalText: (task, opts) => formatCheckpointTimeGoalText(task, opts),
    taskModeOf: (task) => (task ? taskModeOf(task) : "mode1"),
    milestoneUnitSec: (task) => milestoneUnitSec(task),
    milestoneUnitSuffix: (task) => milestoneUnitSuffix(task),
    getModeColor: (mode) => getModeColor(mode),
    fillBackgroundForPct,
    sortMilestones,
    normalizeHistoryTimestampMs,
    getHistoryEntryNote: (entry) => historyInlineApi?.getHistoryEntryNote(entry) || "",
    syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
    startTask: (index) => startTaskApi(index),
    stopTask: (index) => stopTaskApi(index),
    resetTask: (index) => resetTaskApi(index),
    resetTaskStateImmediate: (task, opts) => resetTaskStateImmediateApi(task, opts),
  });

  const {
    loadFocusSessionNotes: loadFocusSessionNotesApi,
    tick: tickApi,
    syncTimeGoalModalWithTaskState: syncTimeGoalModalWithTaskStateApi,
    maybeRestorePendingTimeGoalFlow: maybeRestorePendingTimeGoalFlowApi,
    registerSessionEvents,
  } = sessionApi;

  const appShell = createTaskTimerAppShell({
    els,
    runtime,
    on,
    initialAppPage,
    navStackKey: NAV_STACK_KEY,
    navStackMax: NAV_STACK_MAX,
    nativeBackDebounceMs: NATIVE_BACK_DEBOUNCE_MS,
    getCurrentAppPage: () => currentAppPage,
    setCurrentAppPage: (page) => {
      currentAppPage = page;
    },
    getSuppressNavStackPush: () => suppressNavStackPush,
    setSuppressNavStackPush: (value) => {
      suppressNavStackPush = value;
    },
    getNavStackMemory: () => navStackMemory,
    setNavStackMemory: (stack) => {
      navStackMemory = stack;
    },
    getLastNativeBackHandledAtMs: () => lastNativeBackHandledAtMs,
    setLastNativeBackHandledAtMs: (value) => {
      lastNativeBackHandledAtMs = value;
    },
    resetAllOpenHistoryChartSelections,
    clearTaskFlipStates,
    renderFriendsFooterAlertBadge,
    closeTaskExportModal,
    closeShareTaskModal,
    closeFriendProfileModal,
    closeFriendRequestModal,
    render,
    renderHistory,
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    renderGroupsPage,
    refreshGroupsData,
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    closeTopOverlayIfOpen,
    closeMobileDetailPanelIfOpen,
    showExitAppConfirm,
  });

  const {
    taskTimerExportBasePath,
    appPathForPage,
    getInitialAppPageFromLocation,
    normalizedPathname,
    normalizeTaskTimerRoutePath,
    navigateToAppRoute,
    getCapAppPlugin,
    exitAppNow,
    handleAppBackNavigation,
    initMobileBackHandling,
    applyAppPage,
  } = appShell;

  function rehydrateFromCloudAndRender(opts?: { force?: boolean }) {
    if (!cloudSyncApi) return Promise.resolve();
    return cloudSyncApi.rehydrateFromCloudAndRender(opts);
  }

  function shouldHoldDashboardWidget<K extends keyof typeof dashboardWidgetHasRenderedData>(widget: K, hasData: boolean) {
    if (hasData) {
      dashboardWidgetHasRenderedData[widget] = true;
      return false;
    }
    return !!cloudRefreshInFlight && dashboardWidgetHasRenderedData[widget];
  }

  function isDashboardModeIncluded(mode: MainMode) {
    return dashboardIncludedModes[mode] !== false;
  }

  function getDashboardIncludedTaskIds() {
    const taskIds = new Set<string>();
    (tasks || []).forEach((task) => {
      if (!task) return;
      const mode = taskModeOf(task);
      if (!isModeEnabled(mode) || !isDashboardModeIncluded(mode)) return;
      const taskId = String(task.id || "").trim();
      if (taskId) taskIds.add(taskId);
    });
    return taskIds;
  }

  function isDashboardTaskIncluded(taskId: string, includedTaskIds?: Set<string>) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return false;
    const source = includedTaskIds || getDashboardIncludedTaskIds();
    return source.has(normalizedTaskId);
  }

  function getDashboardFilteredTasks() {
    return (tasks || []).filter((task) => {
      if (!task) return false;
      const mode = taskModeOf(task);
      return isModeEnabled(mode) && isDashboardModeIncluded(mode);
    });
  }

  function initCloudRefreshSync() {
    cloudSyncApi?.initCloudRefreshSync();
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
      timeGoalAction: "confirmModal",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
      presetIntervalLastMilestoneId: null,
      presetIntervalNextSeq: 1,
      timeGoalEnabled: false,
      timeGoalValue: 0,
      timeGoalUnit: "hour",
      timeGoalPeriod: "week",
      timeGoalMinutes: 0,
    };
    (t as any).mode = currentMode;
    return t;
  }

  function taskModeOf(t: Task): "mode1" | "mode2" | "mode3" {
    const m = String((t as any)?.mode || "mode1");
    if (m === "mode2" || m === "mode3") return m;
    return "mode1";
  }

  function normalizeLoadedTask(task: Task) {
    const taskWithMode = task as Task & { mode?: "mode1" | "mode2" | "mode3"; finalCheckpointAction?: Task["timeGoalAction"] };
    if (!taskWithMode.mode) taskWithMode.mode = "mode1";
    if (task.milestoneTimeUnit !== "day" && task.milestoneTimeUnit !== "hour" && task.milestoneTimeUnit !== "minute") {
      task.milestoneTimeUnit = "hour";
    }
    task.checkpointSoundEnabled = !!task.checkpointSoundEnabled;
    task.checkpointSoundMode = task.checkpointSoundMode === "repeat" ? "repeat" : "once";
    task.checkpointToastEnabled = !!task.checkpointToastEnabled;
    task.checkpointToastMode = task.checkpointToastMode === "manual" ? "manual" : "auto5s";
    task.timeGoalAction =
      task.timeGoalAction === "resetLog" || task.timeGoalAction === "resetNoLog" || task.timeGoalAction === "confirmModal"
        ? task.timeGoalAction
        : taskWithMode.finalCheckpointAction === "resetLog" ||
            taskWithMode.finalCheckpointAction === "resetNoLog" ||
            taskWithMode.finalCheckpointAction === "confirmModal"
          ? taskWithMode.finalCheckpointAction
          : "continue";
    task.timeGoalEnabled = !!task.timeGoalEnabled;
    task.timeGoalValue = Number.isFinite(Number(task.timeGoalValue)) ? Math.max(0, Number(task.timeGoalValue)) : 0;
    task.timeGoalUnit = task.timeGoalUnit === "minute" ? "minute" : "hour";
    task.timeGoalPeriod = task.timeGoalPeriod === "day" ? "day" : "week";
    task.timeGoalMinutes = Number.isFinite(Number(task.timeGoalMinutes)) ? Math.max(0, Number(task.timeGoalMinutes)) : 0;
  }

  function load() {
    persistenceApi?.load();
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

  function addMilestoneWithCurrentPreset(task: Task, timeGoalMinutesOverride?: number | null): boolean {
    const taskAny = task as any;
    task.milestones = Array.isArray(task.milestones) ? task.milestones : [];
    ensureMilestoneIdentity(task);
    const interval = Math.max(0, +taskAny.presetIntervalValue || 0);
    const last = getPresetIntervalLastMilestone(task);
    const nextHours = Math.max(0, (last ? +last.hours || 0 : 0) + interval);
    const timeGoalMinutes = timeGoalMinutesOverride == null ? Number(task.timeGoalMinutes || 0) : timeGoalMinutesOverride;
    if (isCheckpointAtOrAboveTimeGoal(nextHours, milestoneUnitSec(task), timeGoalMinutes)) return false;
    const nextSeq = Math.max(1, Math.floor(+taskAny.presetIntervalNextSeq || 1));
    const milestone = { id: cryptoRandomId(), createdSeq: nextSeq, hours: nextHours, description: "" };
    task.milestones.push(milestone);
    taskAny.presetIntervalLastMilestoneId = milestone.id;
    taskAny.presetIntervalNextSeq = nextSeq + 1;
    task.milestones = sortMilestones(task.milestones);
    return true;
  }

  function savePendingTaskJump(taskId: string | null) {
    persistenceApi?.savePendingTaskJump(taskId);
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
    persistenceApi?.maybeHandlePendingTaskJump();
  }

  function save(opts?: { deletedTaskIds?: string[] }) {
    persistenceApi?.save(opts);
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    persistenceApi?.setFocusSessionDraft(taskId, noteRaw);
  }

  function clearFocusSessionDraft(taskId: string) {
    persistenceApi?.clearFocusSessionDraft(taskId);
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    persistenceApi?.syncFocusSessionNotesInput(taskId);
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    persistenceApi?.syncFocusSessionNotesAccordion(taskId);
  }

  function flushPendingFocusSessionNoteSave(taskId?: string | null) {
    persistenceApi?.flushPendingFocusSessionNoteSave(taskId);
  }

  function captureSessionNoteSnapshot(taskId?: string | null): string {
    return persistenceApi?.captureSessionNoteSnapshot(taskId) ?? "";
  }

  function getHistoryEntryNote(entry: any) {
    return historyInlineApi?.getHistoryEntryNote(entry) || "";
  }

  function clearHistoryEntryNoteOverlayPosition() {
    if (!historyInlineApi) return;
    historyInlineApi.clearHistoryEntryNoteOverlayPosition();
  }

  function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
    const raw = String(value || "").trim();
    if (raw === "past30" || raw === "currentMonth") return "past30";
    if (raw === "currentWeek") return "past7";
    return "past7";
  }

  function sanitizeDashboardTimelineDensity(value: unknown): DashboardTimelineDensity {
    const raw = String(value || "").trim();
    if (raw === "low" || raw === "high") return raw;
    return "medium";
  }

  function dashboardTimelineDensityLabel(value: DashboardTimelineDensity) {
    if (value === "low") return "Low";
    if (value === "high") return "High";
    return "Medium";
  }

  function getDashboardTimelineDensityTarget(value: DashboardTimelineDensity) {
    if (value === "low") return 3;
    if (value === "high") return 7;
    return 5;
  }

  function shouldIgnoreTaskDragStart(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest(
      ".actions, .taskFlipBtn, .taskBack, .taskBackActions, .historyInline, .historyCanvasWrap, .progressRow, button, summary, details, canvas, input, select, textarea"
    );
  }

  function clearTaskFlipStates() {
    flippedTaskIds.clear();
    lastRenderedTaskFlipMode = currentMode;
    lastRenderedTaskFlipView = taskView;
  }

  function syncTaskFlipStatesForVisibleTasks(visibleTaskIds: Iterable<string>) {
    if (currentAppPage !== "tasks") {
      clearTaskFlipStates();
      return;
    }
    if (lastRenderedTaskFlipMode && lastRenderedTaskFlipMode !== currentMode) flippedTaskIds.clear();
    if (lastRenderedTaskFlipView && lastRenderedTaskFlipView !== taskView) flippedTaskIds.clear();
    const visibleIdSet = new Set(Array.from(visibleTaskIds).map((taskId) => String(taskId || "").trim()).filter(Boolean));
    Array.from(flippedTaskIds).forEach((taskId) => {
      if (!visibleIdSet.has(taskId)) flippedTaskIds.delete(taskId);
    });
    lastRenderedTaskFlipMode = currentMode;
    lastRenderedTaskFlipView = taskView;
  }

  function applyTaskFlipDomState(taskId: string, taskEl?: HTMLElement | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const card =
      taskEl ||
      ((els.taskList as HTMLElement | null)?.querySelector(`.task[data-task-id="${normalizedTaskId.replace(/["\\]/g, "\\$&")}"]`) as HTMLElement | null);
    if (!card) return;
    const isFlipped = flippedTaskIds.has(normalizedTaskId);
    card.classList.toggle("isFlipped", isFlipped);
    const front = card.querySelector(".taskFaceFront") as HTMLElement | null;
    const back = card.querySelector(".taskFaceBack") as HTMLElement | null;
    const openBtn = card.querySelector('[data-task-flip="open"]') as HTMLElement | null;
    const closeBtn = card.querySelector('[data-task-flip="close"]') as HTMLElement | null;
    if (front) {
      front.setAttribute("aria-hidden", isFlipped ? "true" : "false");
      if (isFlipped) front.setAttribute("inert", "");
      else front.removeAttribute("inert");
    }
    if (back) {
      back.setAttribute("aria-hidden", isFlipped ? "false" : "true");
      if (!isFlipped) back.setAttribute("inert", "");
      else back.removeAttribute("inert");
    }
    if (openBtn) openBtn.setAttribute("aria-expanded", isFlipped ? "true" : "false");
    if (closeBtn) closeBtn.setAttribute("aria-expanded", isFlipped ? "true" : "false");
  }

  function setTaskFlipped(taskId: string, flipped: boolean, taskEl?: HTMLElement | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    if (flipped) flippedTaskIds.add(normalizedTaskId);
    else flippedTaskIds.delete(normalizedTaskId);
    applyTaskFlipDomState(normalizedTaskId, taskEl);
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

  function currentEmail() {
    return String(getFirebaseAuthClient()?.currentUser?.email || "").trim();
  }

  function isArchitectUser() {
    const uid = currentUid();
    if (uid !== ARCHITECT_UID) return false;
    const email = currentEmail();
    if (!email) return true;
    return email.toLowerCase() === ARCHITECT_EMAIL.toLowerCase();
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

  function downloadCsvFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
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

  function csvEscape(value: unknown): string {
    const text = String(value ?? "");
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function parseCsvRows(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let i = 0;
    let inQuotes = false;

    while (i < input.length) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(cell);
        cell = "";
        i += 1;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
        if (ch === "\r" && input[i + 1] === "\n") i += 2;
        else i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
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
        timeGoalAction:
          t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
            ? t.timeGoalAction
            : t.finalCheckpointAction === "resetLog" ||
                t.finalCheckpointAction === "resetNoLog" ||
                t.finalCheckpointAction === "confirmModal"
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

  function makeSingleTaskExportPayload(t: Task, opts?: { includeHistory?: boolean }) {
    const taskId = String(t?.id || "");
    const includeHistory = opts?.includeHistory !== false;
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
          timeGoalAction:
            t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
              ? t.timeGoalAction
              : t.finalCheckpointAction === "resetLog" ||
                  t.finalCheckpointAction === "resetNoLog" ||
                  t.finalCheckpointAction === "confirmModal"
                ? t.finalCheckpointAction
                : "continue",
          presetIntervalsEnabled: !!t.presetIntervalsEnabled,
          presetIntervalValue: getPresetIntervalValueNum(t),
          presetIntervalLastMilestoneId: t.presetIntervalLastMilestoneId ? String(t.presetIntervalLastMilestoneId) : null,
          presetIntervalNextSeq: getPresetIntervalNextSeqNum(t),
        },
      ],
      history:
        includeHistory && taskId
          ? { [taskId]: Array.isArray(historyByTaskId?.[taskId]) ? (historyByTaskId[taskId] || []).slice() : [] }
          : {},
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
  }

  function exportTask(i: number, opts?: { includeHistory?: boolean }) {
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
    const payload = makeSingleTaskExportPayload(t, opts);
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
    out.timeGoalAction =
      t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
        ? t.timeGoalAction
        : t.finalCheckpointAction === "resetLog" ||
            t.finalCheckpointAction === "resetNoLog" ||
            t.finalCheckpointAction === "confirmModal"
          ? t.finalCheckpointAction
          : "continue";
    out.xpDisqualifiedUntilReset = !!t.xpDisqualifiedUntilReset;
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
        const note = String(e.note || "").trim();
        nextHistory[destId].push({
          name: String(e.name || ""),
          ms,
          ts,
          ...("xpDisqualifiedUntilReset" in e ? { xpDisqualifiedUntilReset: !!e.xpDisqualifiedUntilReset } : {}),
          color: e.color ? String(e.color) : undefined,
          note: note || undefined,
        });
      });
    });

    tasks = nextTasks;
    historyByTaskId = cleanupHistory(nextHistory);
    save();
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
    if (String(timeGoalModalTaskId || "") === String(t?.id || "")) {
      return Math.max(0, Math.floor(Number(timeGoalModalFrozenElapsedMs || 0) || 0));
    }
    if (t.running && t.startMs) return (t.accumulatedMs || 0) + (nowMs() - t.startMs);
    return t.accumulatedMs || 0;
  }

  function getTaskElapsedMs(t: Task) {
    if (String(timeGoalModalTaskId || "") === String(t?.id || "")) {
      return Math.max(0, Math.floor(Number(timeGoalModalFrozenElapsedMs || 0) || 0));
    }
    const runMs = t.running && typeof t.startMs === "number" ? Math.max(0, nowMs() - t.startMs) : 0;
    return Math.max(0, (t.accumulatedMs || 0) + runMs);
  }

  function clearTaskTimeGoalFlow(taskId?: string | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (normalizedTaskId && timeGoalModalTaskId === normalizedTaskId) {
      timeGoalModalTaskId = null;
      timeGoalModalFrozenElapsedMs = 0;
    }
    if (!normalizedTaskId || timeGoalModalTaskId == null || normalizedTaskId === String(timeGoalModalTaskId || "").trim()) {
      clearPendingTimeGoalFlow();
      closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    }
    if (normalizedTaskId) {
      delete timeGoalReminderAtMsByTaskId[normalizedTaskId];
    }
  }

  function persistPendingTimeGoalFlow(task: Task, step: "main" | "saveNote" | "note", opts?: { reminder?: boolean }) {
    const taskId = String(task?.id || "").trim();
    if (!taskId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TIME_GOAL_PENDING_FLOW_KEY,
        JSON.stringify({
          taskId,
          step,
          frozenElapsedMs: Math.max(0, Math.floor(Number(timeGoalModalFrozenElapsedMs || 0) || 0)),
          reminder: !!opts?.reminder,
        })
      );
    } catch {
      // ignore localStorage failures
    }
  }

  function clearPendingTimeGoalFlow() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(TIME_GOAL_PENDING_FLOW_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function loadPendingTimeGoalFlow():
    | { taskId: string; step: "main" | "saveNote" | "note"; frozenElapsedMs: number; reminder: boolean }
    | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(TIME_GOAL_PENDING_FLOW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const taskId = String(parsed?.taskId || "").trim();
      const stepRaw = String(parsed?.step || "").trim();
      const step = stepRaw === "saveNote" || stepRaw === "note" ? stepRaw : "main";
      const frozenElapsedMs = Math.max(0, Math.floor(Number(parsed?.frozenElapsedMs || 0) || 0));
      const reminder = !!parsed?.reminder;
      if (!taskId) return null;
      return { taskId, step, frozenElapsedMs, reminder };
    } catch {
      return null;
    }
  }

  function shouldKeepTimeGoalCompletionFlow(task: Task | null | undefined, elapsedMsOverride?: number | null) {
    if (!task) return false;
    if (!task.running) return false;
    const timeGoalMinutes = Number(task.timeGoalMinutes || 0);
    if (!(task.timeGoalEnabled && timeGoalMinutes > 0)) return false;
    if (getTaskTimeGoalAction(task) !== "confirmModal") return false;
    const elapsedMs =
      elapsedMsOverride != null && Number.isFinite(Number(elapsedMsOverride))
        ? Math.max(0, Math.floor(Number(elapsedMsOverride) || 0))
        : getTaskElapsedMs(task);
    return elapsedMs >= Math.round(timeGoalMinutes * 60 * 1000);
  }

  function getTaskTimeGoalAction(task: Task | null | undefined) {
    if (!task) return "continue";
    return task.timeGoalAction === "resetLog" || task.timeGoalAction === "resetNoLog" || task.timeGoalAction === "confirmModal"
      ? task.timeGoalAction
      : "continue";
  }

  function setUnitButtonActive(btn: HTMLButtonElement | null, active: boolean) {
    if (!btn) return;
    btn.classList.toggle("isOn", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function syncTimeGoalCompleteDurationUnitUi() {
    const minuteOn = timeGoalCompleteDurationUnit === "minute";
    setUnitButtonActive(els.timeGoalCompleteDurationUnitMinute, minuteOn);
    setUnitButtonActive(els.timeGoalCompleteDurationUnitHour, !minuteOn);
    const dayOn = timeGoalCompleteDurationPeriod === "day";
    setUnitButtonActive(els.timeGoalCompleteDurationPeriodDay, dayOn);
    setUnitButtonActive(els.timeGoalCompleteDurationPeriodWeek, !dayOn);
    const value = Math.max(0, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "0") || 0));
    const unitLabel = timeGoalCompleteDurationUnit === "minute" ? (value === 1 ? "minute" : "minutes") : value === 1 ? "hour" : "hours";
    const periodLabel = timeGoalCompleteDurationPeriod === "day" ? "day" : "week";
    if (els.timeGoalCompleteDurationReadout) {
      els.timeGoalCompleteDurationReadout.textContent = `${value} ${unitLabel} per ${periodLabel}`;
    }
  }

  function setTimeGoalCompleteEditorVisible(visible: boolean) {
    if (els.timeGoalCompleteGoalEditor) {
      (els.timeGoalCompleteGoalEditor as HTMLElement).style.display = visible ? "block" : "none";
    }
  }

  function populateTimeGoalCompleteEditor(task: Task) {
    const durationValue = Math.max(1, Math.floor(Number(task.timeGoalValue || 1) || 1));
    timeGoalCompleteDurationUnit = task.timeGoalUnit === "minute" ? "minute" : "hour";
    timeGoalCompleteDurationPeriod = task.timeGoalPeriod === "week" ? "week" : "day";
    if (els.timeGoalCompleteDurationValueInput) {
      els.timeGoalCompleteDurationValueInput.value = String(durationValue);
    }
    syncTimeGoalCompleteDurationUnitUi();
  }

  function openTimeGoalCompleteModal(task: Task, elapsedMs: number, opts?: { reminder?: boolean }) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    timeGoalModalTaskId = taskId;
    timeGoalModalFrozenElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    delete timeGoalReminderAtMsByTaskId[taskId];
    if (els.timeGoalCompleteTitle) {
      els.timeGoalCompleteTitle.textContent = `${String(task.name || "Task")} Complete`;
    }
    const elapsedLabel = formatCheckpointTimeGoalText(task);
    if (els.timeGoalCompleteText) {
      els.timeGoalCompleteText.textContent = opts?.reminder
        ? `This task is still running beyond its current time goal of ${elapsedLabel}. Please choose how you want to proceed.`
        : `This task has reached its current time goal of ${elapsedLabel}. Please choose how you want to proceed.`;
    }
    if (els.timeGoalCompleteMeta) {
      els.timeGoalCompleteMeta.textContent = "";
    }
    populateTimeGoalCompleteEditor(task);
    setTimeGoalCompleteEditorVisible(false);
    persistPendingTimeGoalFlow(task, "main", opts);
    openOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
  }

  function openTimeGoalSaveNoteChoice(task: Task) {
    persistPendingTimeGoalFlow(task, "saveNote");
    openOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
  }

  function openTimeGoalNoteModal(task: Task) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const capturedNote = captureSessionNoteSnapshot(taskId);
    if (capturedNote) setFocusSessionDraft(taskId, capturedNote);
    if (els.timeGoalCompleteNoteTitle) {
      els.timeGoalCompleteNoteTitle.textContent = `${String(task.name || "Task")} Notes`;
    }
    if (els.timeGoalCompleteNoteText) {
      els.timeGoalCompleteNoteText.textContent = "Add a note for this saved session before the timer resets.";
    }
    if (els.timeGoalCompleteNoteInput) {
      els.timeGoalCompleteNoteInput.value = capturedNote;
    }
    persistPendingTimeGoalFlow(task, "note");
    openOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  function addRangeMsToLocalDayMap(dayMap: Map<string, number>, startMs: number, endMs: number) {
    const safeStart = Math.max(0, Math.floor(Number(startMs) || 0));
    const safeEnd = Math.max(0, Math.floor(Number(endMs) || 0));
    if (!(safeEnd > safeStart)) return;

    let cursor = safeStart;
    while (cursor < safeEnd) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, 0, 0, 0);
      const nextDayStartMs = new Date(
        dayStart.getFullYear(),
        dayStart.getMonth(),
        dayStart.getDate() + 1,
        0,
        0,
        0,
        0
      ).getTime();
      const sliceEnd = Math.min(safeEnd, nextDayStartMs);
      const sliceMs = Math.max(0, sliceEnd - cursor);
      if (sliceMs > 0) {
        const key = localDayKey(cursor);
        dayMap.set(key, (dayMap.get(key) || 0) + sliceMs);
      }
      cursor = sliceEnd;
    }
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
    const normalizedEntry = {
      ts: Number.isFinite(Number(entry?.ts)) ? Math.floor(Number(entry.ts)) : nowMs(),
      name: String(entry?.name || ""),
      ms: Number.isFinite(Number(entry?.ms)) ? Math.max(0, Math.floor(Number(entry.ms))) : 0,
      xpDisqualifiedUntilReset: !!entry?.xpDisqualifiedUntilReset,
      ...(entry?.color != null && String(entry.color).trim() ? { color: String(entry.color).trim() } : {}),
      ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
    };
    if (!Array.isArray(historyByTaskId[taskId])) historyByTaskId[taskId] = [];
    historyByTaskId[taskId].push(normalizedEntry);
    appendHistoryEntry(taskId, normalizedEntry);
    saveHistoryLocally(historyByTaskId);
    void syncSharedTaskSummariesForTask(taskId).catch(() => {});
  }

  function buildCloudPreferencesSnapshot() {
    const base = cloudPreferencesCache || buildDefaultCloudPreferences();
    return {
      ...base,
      schemaVersion: 1 as const,
      theme: themeMode,
      menuButtonStyle,
      defaultTaskTimerFormat,
      taskView,
      autoFocusOnTaskLaunchEnabled,
      dynamicColorsEnabled,
      checkpointAlertSoundEnabled,
      checkpointAlertToastEnabled,
      modeSettings: {
        mode1: { label: modeLabels.mode1, enabled: true },
        mode2: { label: modeLabels.mode2, enabled: !!modeEnabled.mode2 },
        mode3: { label: modeLabels.mode3, enabled: !!modeEnabled.mode3 },
      },
      rewards: normalizeRewardProgress(rewardProgress),
      updatedAtMs: Date.now(),
    };
  }

  function persistPreferencesToLocalStorage(snapshot: ReturnType<typeof buildCloudPreferencesSnapshot>) {
    try {
      localStorage.setItem(THEME_KEY, snapshot.theme);
      localStorage.setItem(MENU_BUTTON_STYLE_KEY, snapshot.menuButtonStyle);
      localStorage.setItem(TASK_VIEW_KEY, snapshot.taskView);
      localStorage.setItem(AUTO_FOCUS_ON_TASK_LAUNCH_KEY, snapshot.autoFocusOnTaskLaunchEnabled ? "true" : "false");
      localStorage.setItem(DEFAULT_TASK_TIMER_FORMAT_KEY, snapshot.defaultTaskTimerFormat);
      localStorage.setItem(DYNAMIC_COLORS_KEY, snapshot.dynamicColorsEnabled ? "true" : "false");
      localStorage.setItem(CHECKPOINT_ALERT_SOUND_KEY, snapshot.checkpointAlertSoundEnabled ? "true" : "false");
      localStorage.setItem(CHECKPOINT_ALERT_TOAST_KEY, snapshot.checkpointAlertToastEnabled ? "true" : "false");
      localStorage.setItem(MODE_SETTINGS_KEY, JSON.stringify(snapshot.modeSettings || null));
    } catch {
      // ignore localStorage write failures
    }
  }

  function persistPreferencesToCloud() {
    const snapshot = buildCloudPreferencesSnapshot();
    persistPreferencesToLocalStorage(snapshot);
    cloudPreferencesCache = snapshot;
    saveCloudPreferences(snapshot);
    const uid = currentUid();
    if (!uid) return;
    void syncOwnFriendshipProfile(uid, {
      currentRankId: normalizeRewardProgress(rewardProgress).currentRankId,
    }).catch(() => {
      // Keep local/cloud preference persistence even if friendship profile sync fails.
    });
  }

  function getCurrentSessionNoteForTask(taskId: string): string {
    const taskKey = String(taskId || "");
    if (!taskKey) return "";
    return captureSessionNoteSnapshot(taskKey);
  }

  function appendCompletedSessionHistory(t: Task, completedAtMs: number, elapsedMs: number, noteOverride?: string) {
    const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    if (!t || !t.id || safeElapsedMs <= 0) return;
    const taskId = String(t.id || "");
    const liveNote = getCurrentSessionNoteForTask(taskId);
    const note = String(noteOverride || liveNote || "").trim();
    if (note) setFocusSessionDraft(taskId, note);
    appendHistory(t.id, {
      ts: completedAtMs,
      name: t.name,
      ms: safeElapsedMs,
      xpDisqualifiedUntilReset: !!t.xpDisqualifiedUntilReset,
      color: sessionColorForTaskMs(t, safeElapsedMs),
      ...(note ? { note } : {}),
    });
    clearFocusSessionDraft(taskId);
    if (String(focusModeTaskId || "") === taskId) {
      syncFocusSessionNotesInput(taskId);
      syncFocusSessionNotesAccordion(taskId);
    }
  }

  function awardLaunchXpForTask(t: Task | null | undefined) {
    if (!t?.id) return;
    if (t.xpDisqualifiedUntilReset) return;
    const nextAward = awardTaskLaunchXp(rewardProgress, {
      taskId: String(t.id || ""),
      awardedAt: nowMs(),
    });
    rewardProgress = nextAward.next;
    persistPreferencesToCloud();
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

    if (changed) saveHistory(historyByTaskId, { showIndicator: false });
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
      (els.confirmOkBtn as HTMLButtonElement).disabled = false;
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
        (els.confirmAltBtn as HTMLButtonElement).disabled = false;
      } else {
        (els.confirmAltBtn as HTMLElement).style.display = "none";
        els.confirmAltBtn.textContent = "";
      }
    }

    const showChk = !!opts?.checkboxLabel;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).style.display = showChk ? "flex" : "none";
    if (showChk && els.confirmChkLabel) {
      const labelTextEl = els.confirmChkLabel.querySelector(".confirmChkLabelText");
      if (labelTextEl) labelTextEl.textContent = String(opts.checkboxLabel || "");
      else els.confirmChkLabel.textContent = opts.checkboxLabel;
    }
    if (els.confirmDeleteAll) els.confirmDeleteAll.checked = showChk ? !!opts.checkboxChecked : false;
    const disableChk = showChk ? !!opts?.checkboxDisabled : false;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = disableChk;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-disabled", disableChk);
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();
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
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isDeleteTaskConfirm");
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isDeleteFriendConfirm");
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isTaskAlreadyRunningConfirm");
    confirmAction = null;
    confirmActionAlt = null;
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLElement).style.display = "none";
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLButtonElement).disabled = false;
    if (els.confirmOkBtn) {
      (els.confirmOkBtn as HTMLButtonElement).disabled = false;
      els.confirmOkBtn.classList.remove("btn-warn");
      els.confirmOkBtn.classList.add("btn-accent");
    }
    if (els.confirmCancelBtn) (els.confirmCancelBtn as HTMLButtonElement).disabled = false;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = false;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.remove("is-disabled");
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();
    if (els.confirmChkNote) {
      (els.confirmChkNote as HTMLElement).style.display = "none";
      (els.confirmChkNote as HTMLElement).textContent = "";
    }
  }

  function setResetTaskConfirmBusy(busy: boolean, shouldLog: boolean) {
    if (els.confirmOkBtn) {
      els.confirmOkBtn.textContent = busy ? (shouldLog ? "Logging..." : "Resetting...") : shouldLog ? "Log and Reset" : "Reset";
      (els.confirmOkBtn as HTMLButtonElement).disabled = busy;
    }
    if (els.confirmCancelBtn) (els.confirmCancelBtn as HTMLButtonElement).disabled = busy;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = busy;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-disabled", busy);
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();
  }

  function syncConfirmPrimaryToggleUi() {
    const toggle = document.getElementById("confirmDeleteAllSwitch");
    if (!(toggle instanceof HTMLElement)) return;
    const isOn = !!els.confirmDeleteAll?.checked;
    toggle.classList.toggle("on", isOn);
    toggle.setAttribute("aria-checked", isOn ? "true" : "false");
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

  function checkpointTimeGoalLimitSec(timeGoalMinutes: number | null | undefined): number {
    const minutes = Number.isFinite(Number(timeGoalMinutes)) ? Math.max(0, Number(timeGoalMinutes)) : 0;
    return minutes > 0 ? minutes * 60 : 0;
  }

  function formatCheckpointTimeGoalText(task: Task | null | undefined, opts?: { timeGoalMinutes?: number | null; forEditDraft?: boolean }) {
    const effectiveMinutesRaw =
      opts && Object.prototype.hasOwnProperty.call(opts, "timeGoalMinutes")
        ? Number(opts.timeGoalMinutes)
        : Number(task?.timeGoalMinutes || 0);
    const effectiveMinutes = Number.isFinite(effectiveMinutesRaw) ? Math.max(0, effectiveMinutesRaw) : 0;
    if (!(effectiveMinutes > 0)) return "the current time goal";

    const useEditDraft = !!opts?.forEditDraft;
    const goalUnit =
      useEditDraft ? editTaskDurationUnit : task?.timeGoalUnit === "minute" ? "minute" : task?.timeGoalUnit === "hour" ? "hour" : null;
    const goalPeriod = useEditDraft ? editTaskDurationPeriod : task?.timeGoalPeriod === "day" ? "day" : task?.timeGoalPeriod === "week" ? "week" : null;
    const goalValueRaw = useEditDraft ? Number(els.editTaskDurationValueInput?.value || 0) : Number(task?.timeGoalValue || 0);
    const goalValue = Number.isFinite(goalValueRaw) ? Math.max(0, goalValueRaw) : 0;

    if (goalUnit && goalPeriod && goalValue > 0) {
      const unitLabel = goalValue === 1 ? goalUnit : `${goalUnit}s`;
      const periodLabel = goalPeriod === "day" ? "per day" : "per week";
      return `${goalValue} ${unitLabel} ${periodLabel}`;
    }

    if (effectiveMinutes % 60 === 0) {
      const hours = effectiveMinutes / 60;
      return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `${effectiveMinutes} ${effectiveMinutes === 1 ? "minute" : "minutes"}`;
  }

  function isCheckpointAtOrAboveTimeGoal(
    checkpointHours: number | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ): boolean {
    const checkpointValue = Number(checkpointHours);
    if (!(checkpointValue > 0)) return false;
    const timeGoalSec = checkpointTimeGoalLimitSec(timeGoalMinutes);
    if (!(timeGoalSec > 0)) return false;
    return checkpointValue * milestoneUnitSeconds >= timeGoalSec;
  }

  function hasCheckpointAtOrAboveTimeGoal(
    milestones: Task["milestones"] | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ): boolean {
    if (!Array.isArray(milestones) || milestones.length === 0) return false;
    return milestones.some((m) => isCheckpointAtOrAboveTimeGoal(m?.hours, milestoneUnitSeconds, timeGoalMinutes));
  }

  function getAddTaskTimeGoalMinutesState() {
    const value = Math.max(0, Number(addTaskDurationValue) || 0);
    if (!(value > 0) || addTaskNoTimeGoal) return 0;
    if (addTaskDurationUnit === "minute") {
      return addTaskDurationPeriod === "day" ? value : value * 7;
    }
    return addTaskDurationPeriod === "day" ? value * 60 : value * 60 * 7;
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
    els.addTaskDurationValueInput?.classList.remove("isInvalid");
    els.addTaskMsArea?.classList.remove("isInvalid");
    els.addTaskPresetIntervalField?.classList.remove("isInvalid");
    els.addTaskMsList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function applyAddTaskCheckpointValidationHighlights(opts?: {
    name?: boolean;
    duration?: boolean;
    checkpoints?: boolean;
    checkpointRows?: boolean;
    presetInterval?: boolean;
  }) {
    const options = opts || {};
    els.addTaskName?.classList.toggle("isInvalid", !!options.name);
    els.addTaskDurationValueInput?.classList.toggle("isInvalid", !!options.duration);
    els.addTaskMsArea?.classList.toggle("isInvalid", !!options.checkpoints || !!options.checkpointRows);
    els.addTaskPresetIntervalField?.classList.toggle("isInvalid", !!options.presetInterval);
    const rows = Array.from(els.addTaskMsList?.querySelectorAll?.(".msRow") || []);
    const addTaskTimeGoalMinutes = getAddTaskTimeGoalMinutesState();
    const addTaskUnitSeconds =
      addTaskMilestoneTimeUnit === "day" ? 86400 : addTaskMilestoneTimeUnit === "minute" ? 60 : 3600;
    rows.forEach((row, idx) => {
      const m = addTaskMilestones[idx];
      const invalidForValue = !!m && !(Number(+m.hours) > 0);
      const invalidForTimeGoal = !!m && isCheckpointAtOrAboveTimeGoal(m.hours, addTaskUnitSeconds, addTaskTimeGoalMinutes);
      const invalid = !!options.checkpointRows && (invalidForValue || invalidForTimeGoal);
      row.classList.toggle("isInvalid", invalid);
    });
  }

  function showAddTaskValidationError(
    msg: string,
    opts?: { name?: boolean; duration?: boolean; checkpoints?: boolean; checkpointRows?: boolean; presetInterval?: boolean }
  ) {
    clearAddTaskValidationState();
    applyAddTaskCheckpointValidationHighlights(opts);
    if (els.addTaskError) {
      els.addTaskError.textContent = msg;
      els.addTaskError.classList.add("isOn");
    }
  }

  function syncAddTaskDurationReadout() {
    if (els.addTaskDurationReadout) {
      els.addTaskDurationReadout.textContent = formatAddTaskDurationReadout({
        name: "",
        mode: currentMode,
        durationValue: String(addTaskDurationValue),
        durationUnit: addTaskDurationUnit,
        durationPeriod: addTaskDurationPeriod,
        noTimeGoal: addTaskNoTimeGoal,
        milestonesEnabled: false,
        milestoneTimeUnit: addTaskMilestoneTimeUnit,
        milestones: [],
        checkpointSoundEnabled: false,
        checkpointSoundMode: "once",
        checkpointToastEnabled: false,
        checkpointToastMode: "auto5s",
        presetIntervalsEnabled: false,
        presetIntervalValue: "0",
        timeGoalAction: "confirmModal",
      });
    }
  }

  function syncEditTaskDurationReadout(task?: Task | null) {
    if (!els.editTaskDurationReadout) return;
    const currentTask = task || getCurrentEditTask();
    const noTimeGoal = !!els.editNoGoalCheckbox?.checked;
    const durationValue = String(els.editTaskDurationValueInput?.value || currentTask?.timeGoalValue || 0);
    const durationUnit = editTaskDurationUnit === "minute" ? "minute" : currentTask?.timeGoalUnit === "minute" ? "minute" : "hour";
    const durationPeriod =
      editTaskDurationPeriod === "day" ? "day" : currentTask?.timeGoalPeriod === "day" ? "day" : "week";
    els.editTaskDurationReadout.textContent = formatAddTaskDurationReadout({
      name: String(els.editName?.value || currentTask?.name || "").trim(),
      mode: currentTask ? taskModeOf(currentTask) : currentMode,
      durationValue,
      durationUnit,
      durationPeriod,
      noTimeGoal,
      milestonesEnabled: !!currentTask?.milestonesEnabled,
      milestoneTimeUnit:
        currentTask?.milestoneTimeUnit === "day"
          ? "day"
          : currentTask?.milestoneTimeUnit === "minute"
            ? "minute"
            : "hour",
      milestones: normalizeTaskConfigMilestones(
        (Array.isArray(currentTask?.milestones) ? currentTask.milestones : []).map((milestone, index) => ({
          id: String(milestone?.id || ""),
          createdSeq:
            Number.isFinite(Number(milestone?.createdSeq)) && Number(milestone.createdSeq) > 0
              ? Math.floor(Number(milestone.createdSeq))
              : index + 1,
          value: String(Number(milestone?.hours || 0)),
          description: String(milestone?.description || ""),
        }))
      ),
      checkpointSoundEnabled: !!currentTask?.checkpointSoundEnabled,
      checkpointSoundMode: currentTask?.checkpointSoundMode === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!currentTask?.checkpointToastEnabled,
      checkpointToastMode: currentTask?.checkpointToastMode === "manual" ? "manual" : "auto5s",
      presetIntervalsEnabled: !!currentTask?.presetIntervalsEnabled,
      presetIntervalValue: String(Number(currentTask?.presetIntervalValue || 0) || 0),
      timeGoalAction:
        currentTask?.timeGoalAction === "resetLog" ||
        currentTask?.timeGoalAction === "resetNoLog" ||
        currentTask?.timeGoalAction === "confirmModal"
          ? currentTask.timeGoalAction
          : currentTask?.finalCheckpointAction === "resetLog" ||
              currentTask?.finalCheckpointAction === "resetNoLog" ||
              currentTask?.finalCheckpointAction === "confirmModal"
            ? currentTask.finalCheckpointAction
            : "confirmModal",
    });
  }

  function syncEditTaskTimeGoalUi(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const noTimeGoal = !timeGoalEnabled;
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    els.editTaskDurationRow?.classList.toggle("isHidden", !timeGoalEnabled);
    els.editTaskDurationReadout?.classList.toggle("isHidden", !timeGoalEnabled);
    els.editTaskDurationRow?.classList.toggle("isDisabled", noTimeGoal);
    els.editTaskDurationReadout?.classList.toggle("isDisabled", noTimeGoal);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.disabled = noTimeGoal;
    if (timeGoalEnabled && els.editTaskDurationValueInput) {
      const parsedValue = Math.max(0, Math.floor(parseFloat(els.editTaskDurationValueInput.value || "0") || 0));
      const maxDay = getAddTaskDurationMaxForPeriod(editTaskDurationUnit, "day");
      const canUseDay = Number(parsedValue) <= maxDay;
      if (String(parsedValue || "") !== String(els.editTaskDurationValueInput.value || "")) {
        els.editTaskDurationValueInput.value = String(parsedValue || 0);
      }
      editTaskDurationPeriod = canUseDay && editTaskDurationPeriod === "day" ? "day" : "week";
    }
    const canUseDay = Number(els.editTaskDurationValueInput?.value || 0) <= getAddTaskDurationMaxForPeriod(editTaskDurationUnit, "day");
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.classList.toggle("isHidden", hidden);
      btn.disabled = noTimeGoal || hidden;
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.setAttribute("aria-hidden", hidden ? "true" : "false");
    };
    syncPill(els.editTaskDurationUnitMinute, editTaskDurationUnit === "minute");
    syncPill(els.editTaskDurationUnitHour, editTaskDurationUnit === "hour");
    syncPill(els.editTaskDurationPeriodDay, editTaskDurationPeriod === "day", !canUseDay);
    syncPill(els.editTaskDurationPeriodWeek, editTaskDurationPeriod === "week");
    els.editTaskDurationValueInput?.classList.remove("isInvalid");
    syncEditTaskDurationReadout(currentTask);
    const checkpointControlsDisabled = !hasActiveTimeGoal;
    els.msArea?.classList.toggle("isHidden", checkpointControlsDisabled);
    if (checkpointControlsDisabled && els.msArea && "open" in (els.msArea as any)) {
      (els.msArea as HTMLDetailsElement).open = false;
    }
    els.msArea?.classList.toggle("isDisabled", checkpointControlsDisabled || !currentTask?.milestonesEnabled);
    if (els.msToggle) {
      els.msToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.msToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    [els.msUnitDay, els.msUnitHour, els.msUnitMinute].forEach((btn) => {
      if (!btn) return;
      btn.toggleAttribute("disabled", checkpointControlsDisabled);
      btn.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    });
    if (els.editPresetIntervalsToggle) {
      els.editPresetIntervalsToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editPresetIntervalsToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isDisabled", checkpointControlsDisabled);
    if (els.editPresetIntervalInput) {
      els.editPresetIntervalInput.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.presetIntervalsEnabled;
    }
    if (els.addMsBtn) {
      els.addMsBtn.disabled = checkpointControlsDisabled;
      els.addMsBtn.title = checkpointControlsDisabled ? "Set a time goal to add checkpoints" : "";
    }
    if (els.editFinalCheckpointActionSelect) {
      els.editFinalCheckpointActionSelect.disabled = checkpointControlsDisabled;
    }
    if (els.editCheckpointSoundToggle) {
      els.editCheckpointSoundToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editCheckpointSoundToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.editCheckpointToastToggle) {
      els.editCheckpointToastToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editCheckpointToastToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointSoundEnabled;
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointToastEnabled;
    }
    els.editCheckpointSoundToggleRow?.classList.toggle(
      "isDisabled",
      checkpointControlsDisabled || !currentTask?.milestonesEnabled || !checkpointAlertSoundEnabled
    );
    els.editCheckpointToastToggleRow?.classList.toggle(
      "isDisabled",
      checkpointControlsDisabled || !currentTask?.milestonesEnabled || !checkpointAlertToastEnabled
    );
    if (currentTask) {
      syncEditCheckpointAlertUi(currentTask);
    } else {
      els.editTimerSettingsGroup?.classList.add("isHidden");
      els.editCheckpointAlertsGroup?.classList.add("isHidden");
    }
  }

  function validateEditTimeGoal() {
    if (!isEditTimeGoalEnabled()) return true;
    const value = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    if (!(value > 0)) {
      els.editTaskDurationValueInput?.classList.add("isInvalid");
      return false;
    }
    const max = getAddTaskDurationMaxForPeriod(editTaskDurationUnit, editTaskDurationPeriod);
    if (value > max) {
      els.editTaskDurationValueInput?.classList.add("isInvalid");
      return false;
    }
    return true;
  }

  function getEditTaskTimeGoalMinutes() {
    const value = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    if (!(value > 0) || !isEditTimeGoalEnabled()) return 0;
    return getEditTaskTimeGoalMinutesFor(value, editTaskDurationUnit, editTaskDurationPeriod);
  }

  function getEditTaskTimeGoalMinutesFor(value: number, unit: "minute" | "hour", period: "day" | "week") {
    if (!(value > 0)) return 0;
    if (unit === "minute") {
      return period === "day" ? value : value * 7;
    }
    return period === "day" ? value * 60 : value * 60 * 7;
  }

  function isEditTimeGoalEnabled() {
    return !els.editNoGoalCheckbox?.checked;
  }

  function setEditTimeGoalEnabled(enabled: boolean) {
    if (els.editNoGoalCheckbox) els.editNoGoalCheckbox.checked = !enabled;
    toggleSwitchElement(els.editTimeGoalToggle as HTMLElement | null, enabled);
    els.editTimeGoalToggle?.setAttribute("aria-checked", enabled ? "true" : "false");
  }

  function editTaskHasActiveTimeGoal() {
    return getEditTaskTimeGoalMinutes() > 0;
  }

  function applyEditCheckpointValidationHighlights(task: Task | null | undefined) {
    if (!task) return;
    const noCheckpoints = !!task.milestonesEnabled && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const effectiveTimeGoalMinutes = task === getCurrentEditTask() ? getEditTaskTimeGoalMinutes() : Number(task.timeGoalMinutes || 0);
    const invalidCheckpointTimes =
      !!task.milestonesEnabled &&
      (hasNonPositiveCheckpoint(task.milestones) ||
        hasCheckpointAtOrAboveTimeGoal(task.milestones, milestoneUnitSec(task), effectiveTimeGoalMinutes));
    const invalidPresetInterval = !!task.milestonesEnabled && !!task.presetIntervalsEnabled && !hasValidPresetInterval(task);

    els.msArea?.classList.toggle("isInvalid", noCheckpoints || invalidCheckpointTimes);
    els.editPresetIntervalField?.classList.toggle("isInvalid", invalidPresetInterval);

    const msRows = Array.from(els.msList?.querySelectorAll?.(".msRow") || []);
    const msSorted = Array.isArray(task.milestones) ? task.milestones.slice() : [];
    msRows.forEach((row, idx) => {
      const m = msSorted[idx];
      const invalid =
        !!task.milestonesEnabled &&
        !!m &&
        (!(Number(+m.hours) > 0) || isCheckpointAtOrAboveTimeGoal(m.hours, milestoneUnitSec(task), effectiveTimeGoalMinutes));
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
    return !!editTaskDraft && editTaskDraft.milestoneTimeUnit === "day";
  }

  function cloneTaskForEdit(task: Task): Task {
    return {
      ...task,
      milestones: Array.isArray(task.milestones)
        ? task.milestones.map((milestone) => ({
            ...milestone,
            id: String((milestone as any)?.id || ""),
            createdSeq: Number.isFinite(Number((milestone as any)?.createdSeq))
              ? Math.floor(Number((milestone as any).createdSeq))
              : 0,
            description: String(milestone?.description || ""),
          }))
        : [],
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
    };
  }

  function getCurrentEditTask() {
    return editTaskDraft;
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
        syncEditSaveAvailability(t);
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
    const hasActiveTimeGoal = getAddTaskTimeGoalMinutesState() > 0;
    const checkpointsEnabled = !!addTaskMilestonesEnabled && hasActiveTimeGoal;
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
        addTaskTimeGoalAction === "resetLog" || addTaskTimeGoalAction === "resetNoLog" || addTaskTimeGoalAction === "confirmModal"
          ? addTaskTimeGoalAction
          : "confirmModal";
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
      if (!hasActiveTimeGoal && addTaskMilestonesEnabled) notes.unshift("set a time goal first");
      (els.addTaskCheckpointAlertsNote as HTMLElement).style.display = checkpointsEnabled && notes.length ? "block" : "none";
      (els.addTaskCheckpointAlertsNote as HTMLElement).textContent = notes.length
        ? `Checkpoint alerts are currently unavailable because ${notes.join(" and ")}.`
        : "";
    }

    if (els.addTaskAddMsBtn) {
      const blocked = !hasActiveTimeGoal || (checkpointsEnabled && presetEnabled && !validPreset);
      els.addTaskAddMsBtn.disabled = blocked;
      els.addTaskAddMsBtn.title = !hasActiveTimeGoal ? "Set a time goal to add checkpoints" : blocked ? "Enter a preset interval greater than 0" : "";
    }
  }

  function render() {
    renderTasksPage();
  }

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  function syncFocusRunButtons(t?: Task | null) {
    const dial = els.focusDial as HTMLButtonElement | null;
    const hint = els.focusDialHint as HTMLElement | null;
    const resetBtn = els.focusResetBtn as HTMLButtonElement | null;
    if (!dial) return;
    if (!t) {
      dial.classList.remove("isRunning", "isStopped");
      dial.setAttribute("aria-pressed", "false");
      dial.setAttribute("aria-label", "Focus dial. Tap to launch timer");
      if (hint) hint.textContent = "Tap to Launch";
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.title = "Reset";
        resetBtn.setAttribute("aria-label", "Reset");
      }
      return;
    }
    const isRunning = !!t.running;
    dial.classList.toggle("isRunning", isRunning);
    dial.classList.toggle("isStopped", !isRunning);
    dial.setAttribute("aria-pressed", String(isRunning));
    dial.setAttribute("aria-label", isRunning ? "Focus dial. Tap to stop timer" : "Focus dial. Tap to launch timer");
    if (hint) hint.textContent = isRunning ? "Tap to Stop" : "Tap to Launch";
    if (resetBtn) {
      resetBtn.disabled = isRunning;
      resetBtn.title = isRunning ? "Stop task to reset" : "Reset";
      resetBtn.setAttribute("aria-label", isRunning ? "Stop task to reset" : "Reset");
    }
  }

  function formatSignedDelta(ms: number): string {
    if (!Number.isFinite(ms)) return "--";
    const sign = ms > 0 ? "+" : ms < 0 ? "-" : "";
    return `${sign}${formatTime(Math.abs(ms))}`;
  }

  function setFocusInsightDeltaValue(el: HTMLElement | null, ms: number) {
    if (!el) return;
    el.textContent = formatSignedDelta(ms);
    el.classList.remove("is-positive", "is-negative", "is-neutral", "is-empty");
    if (!Number.isFinite(ms)) {
      el.classList.add("is-empty");
      return;
    }
    if (ms > 0) {
      el.classList.add("is-positive");
      return;
    }
    if (ms < 0) {
      el.classList.add("is-negative");
      return;
    }
    el.classList.add("is-neutral");
  }

  function resetAllOpenHistoryChartSelections() {
    historyInlineApi?.resetAllOpenHistoryChartSelections();
  }

  function renderDashboardOverviewChart() {
    const valueEl = els.dashboardOverviewValue as HTMLElement | null;
    const subtextEl = els.dashboardOverviewSubtext as HTMLElement | null;
    const sessionsEl = els.dashboardOverviewSessionsValue as HTMLElement | null;
    const bestDayEl = els.dashboardOverviewBestDayValue as HTMLElement | null;
    const deltaEl = els.dashboardOverviewDeltaValue as HTMLElement | null;
    const axisEl = els.dashboardOverviewAxis as HTMLElement | null;
    const emptyEl = els.dashboardOverviewChartEmpty as HTMLElement | null;
    const canvas = els.dashboardOverviewChart;
    if (!canvas) return;

    const nowValue = nowMs();
    const includedTaskIds = getDashboardIncludedTaskIds();
    const today = new Date(nowValue);
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - idx));
      date.setHours(0, 0, 0, 0);
      return {
        startMs: date.getTime(),
        endMs: date.getTime() + 86400000,
        label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        longLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        totalMs: 0,
        sessions: 0,
      };
    });

    const currentWeekStartMs = days[0]?.startMs || today.getTime();
    const currentWeekEndMs = (days[days.length - 1]?.endMs || today.getTime() + 86400000) - 1;
    const previousWeekStartMs = currentWeekStartMs - 7 * 86400000;
    const previousWeekEndMs = currentWeekStartMs - 1;
    let currentWeekTotalMs = 0;
    let currentWeekSessions = 0;
    let previousWeekTotalMs = 0;

    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(ms) || ms <= 0) return;
        if (ts >= previousWeekStartMs && ts <= previousWeekEndMs) previousWeekTotalMs += ms;
        if (ts < currentWeekStartMs || ts > currentWeekEndMs) return;
        currentWeekTotalMs += ms;
        currentWeekSessions += 1;
        for (const day of days) {
          if (ts >= day.startMs && ts < day.endMs) {
            day.totalMs += ms;
            day.sessions += 1;
            break;
          }
        }
      });
    });

    const bestDay = days.reduce((best, day) => (day.totalMs > best.totalMs ? day : best), days[0]!);
    const deltaPct = previousWeekTotalMs > 0 ? Math.round(((currentWeekTotalMs - previousWeekTotalMs) / previousWeekTotalMs) * 100) : null;
    const hasData = currentWeekTotalMs > 0;
    if (shouldHoldDashboardWidget("overview", hasData)) return;

    if (valueEl) valueEl.textContent = formatDashboardDurationShort(currentWeekTotalMs);
    if (subtextEl) {
      subtextEl.textContent =
        deltaPct == null
          ? "Logged this week from history"
          : `Logged this week from history, ${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs last week`;
    }
    if (sessionsEl) sessionsEl.textContent = String(currentWeekSessions);
    if (bestDayEl) {
      bestDayEl.textContent = bestDay && bestDay.totalMs > 0 ? `${bestDay.label} ${formatDashboardDurationShort(bestDay.totalMs)}` : "-";
    }
    if (deltaEl) deltaEl.textContent = deltaPct == null ? "0%" : `${deltaPct >= 0 ? "+" : ""}${deltaPct}%`;
    if (axisEl) axisEl.innerHTML = days.map((day) => `<span>${escapeHtmlUI(day.label)}</span>`).join("");

    const wrap = canvas.closest(".dashboardOverviewChartWrap") as HTMLElement | null;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(rect.width || wrap.clientWidth || canvas.clientWidth || 0);
    const height = Math.floor(rect.height || wrap.clientHeight || canvas.clientHeight || 0);
    if (width <= 0 || height <= 0) return;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const maxMs = days.reduce((max, day) => Math.max(max, day.totalMs), 0);
    if (maxMs <= 0) {
      if (emptyEl) emptyEl.style.display = "grid";
      canvas.setAttribute("aria-label", "Weekly history overview chart with no completed history this week");
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const chartLeft = 12;
    const chartRight = width - 12;
    const chartTop = 14;
    const chartBottom = height - 18;
    const chartWidth = Math.max(120, chartRight - chartLeft);
    const chartHeight = Math.max(80, chartBottom - chartTop);
    const points = days.map((day, idx) => ({
      x: chartLeft + (chartWidth * idx) / Math.max(1, days.length - 1),
      y: chartBottom - (day.totalMs / maxMs) * chartHeight,
      day,
    }));

    ctx.strokeStyle = "rgba(140, 184, 201, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const pct = i / 3;
      const y = Math.round(chartBottom - chartHeight * pct) + 0.5;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(points[0]!.x, chartBottom);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1]!.x, chartBottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 207, 200, 0.12)";
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, idx) => {
      if (idx === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = "rgba(0, 207, 200, 0.95)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 207, 200, 1)";
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    canvas.setAttribute(
      "aria-label",
      `Weekly history overview chart. ${formatDashboardDurationShort(currentWeekTotalMs)} logged across ${currentWeekSessions} completed sessions.`
    );
  }

  function renderDashboardStreakCard() {
    const valueEl = els.dashboardStreakValue as HTMLElement | null;
    const fillEl = els.dashboardStreakBarFill as HTMLElement | null;
    const metaEl = els.dashboardStreakMeta as HTMLElement | null;
    const barEl = els.dashboardStreakBar as HTMLElement | null;

    const eligibleTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      if (task.timeGoalPeriod !== "day") return false;
      return Math.max(0, Number(task.timeGoalMinutes || 0)) > 0;
    });

    const taskGoalMinutesById = new Map<string, number>();
    eligibleTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return;
      taskGoalMinutesById.set(taskId, Math.max(0, Number(task.timeGoalMinutes || 0)));
    });

    const qualifyingDayTaskMs = new Map<string, Map<string, number>>();
    taskGoalMinutesById.forEach((_goalMinutes, taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(ms) || ms <= 0) return;
        const dayKey = localDayKey(ts);
        let byTaskForDay = qualifyingDayTaskMs.get(dayKey);
        if (!byTaskForDay) {
          byTaskForDay = new Map<string, number>();
          qualifyingDayTaskMs.set(dayKey, byTaskForDay);
        }
        byTaskForDay.set(taskId, (byTaskForDay.get(taskId) || 0) + ms);
      });
    });

    const qualifyingDayKeys = Array.from(qualifyingDayTaskMs.entries())
      .filter(([, byTask]) => {
        for (const [taskId, totalMs] of byTask.entries()) {
          const goalMinutes = taskGoalMinutesById.get(taskId) || 0;
          if (goalMinutes > 0 && totalMs >= goalMinutes * 60000) return true;
        }
        return false;
      })
      .map(([dayKey]) => dayKey)
      .sort();

    const hasData = qualifyingDayKeys.length > 0;
    if (shouldHoldDashboardWidget("streak", hasData)) return;

    let currentStreakDays = 0;
    let longestStreakDays = 0;
    let previousDayTime = 0;
    let runningStreak = 0;

    qualifyingDayKeys.forEach((dayKey) => {
      const dayTime = new Date(`${dayKey}T00:00:00`).getTime();
      if (previousDayTime > 0 && dayTime - previousDayTime === 86400000) runningStreak += 1;
      else runningStreak = 1;
      if (runningStreak > longestStreakDays) longestStreakDays = runningStreak;
      previousDayTime = dayTime;
    });

    const todayKey = localDayKey(nowMs());
    const yesterdayKey = localDayKey(nowMs() - 86400000);
    const qualifyingDaySet = new Set(qualifyingDayKeys);
    const todayComplete = qualifyingDaySet.has(todayKey);
    const yesterdayComplete = qualifyingDaySet.has(yesterdayKey);

    if (hasData) {
      let probeTime = todayComplete ? new Date(`${todayKey}T00:00:00`).getTime() : yesterdayComplete ? new Date(`${yesterdayKey}T00:00:00`).getTime() : 0;
      while (probeTime > 0) {
        const probeKey = localDayKey(probeTime);
        if (!qualifyingDaySet.has(probeKey)) break;
        currentStreakDays += 1;
        probeTime -= 86400000;
      }
    }

    const isPendingToday = !todayComplete && yesterdayComplete && currentStreakDays > 0;
    const isBroken = !todayComplete && !isPendingToday && hasData;
    const dayLabel = (count: number) => `${count} Day${count === 1 ? "" : "s"}`;

    if (!hasData) {
      if (valueEl) valueEl.textContent = "No streak yet";
      if (metaEl) metaEl.textContent = "Complete daily goals to start a streak";
      if (fillEl) fillEl.style.width = "0%";
      if (barEl) barEl.setAttribute("aria-label", "No streak progress yet");
      return;
    }

    if (valueEl) valueEl.textContent = isBroken ? "0 Days" : dayLabel(currentStreakDays);
    if (metaEl) {
      metaEl.textContent = isBroken
        ? `Longest: ${longestStreakDays} day${longestStreakDays === 1 ? "" : "s"} • Streak broken`
        : `Longest: ${longestStreakDays} day${longestStreakDays === 1 ? "" : "s"} • ${todayComplete ? "Today complete" : "Today pending"}`;
    }

    const fillPct = longestStreakDays > 0 ? Math.max(0, Math.min(100, Math.round((currentStreakDays / longestStreakDays) * 100))) : 0;
    if (fillEl) fillEl.style.width = `${fillPct}%`;
    if (barEl) {
      barEl.setAttribute(
        "aria-label",
        isBroken
          ? `Streak progress. Current streak broken. Longest streak ${longestStreakDays} days.`
          : `Streak progress. Current streak ${currentStreakDays} days out of longest streak ${longestStreakDays} days.`
      );
    }
  }

  function renderDashboardWeeklyGoalsCard() {
    const valueEl = els.dashboardWeeklyGoalsValue as HTMLElement | null;
    const metaEl = els.dashboardWeeklyGoalsMeta as HTMLElement | null;
    const progressBarEl = els.dashboardWeeklyGoalsProgressBar as HTMLElement | null;
    const projectionMarkerEl = els.dashboardWeeklyGoalsProjectionMarker as HTMLElement | null;
    const projectionFillEl = els.dashboardWeeklyGoalsProjectionFill as HTMLElement | null;
    const progressFillEl = els.dashboardWeeklyGoalsProgressFill as HTMLElement | null;
    const progressTextEl = els.dashboardWeeklyGoalsProgressText as HTMLElement | null;

    const nowValue = nowMs();
    const weekStartMs = startOfCurrentWeekMondayMs(nowValue);
    const goalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (goalMinutes <= 0) return false;
      return task.timeGoalPeriod === "day" || task.timeGoalPeriod === "week";
    });

    const totalGoalMs = goalTasks.reduce((sum, task) => {
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      const multiplier = task.timeGoalPeriod === "day" ? 7 : 1;
      return sum + goalMinutes * 60000 * multiplier;
    }, 0);

    const loggedMs = goalTasks.reduce((sum, task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return sum;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const taskWeekMs = entries.reduce((entrySum, entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts < weekStartMs || ts > nowValue) return entrySum;
        if (!Number.isFinite(ms) || ms <= 0) return entrySum;
        return entrySum + ms;
      }, 0);
      return sum + taskWeekMs;
    }, 0);

    const runningMs = goalTasks.reduce((sum, task) => {
      if (!task?.running) return sum;
      return sum + Math.max(0, getElapsedMs(task));
    }, 0);

    const projectedMs = loggedMs + runningMs;
    const progressPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((loggedMs / totalGoalMs) * 100))) : 0;
    const projectedPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((projectedMs / totalGoalMs) * 100))) : 0;
    const showProjectionMarker = totalGoalMs > 0 && runningMs > 0;
    const projectedDeltaPct = showProjectionMarker ? Math.max(0, projectedPct - progressPct) : 0;
    if (valueEl) valueEl.textContent = formatDashboardDurationWithMinutes(loggedMs);
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.style.display = "none";
    }
    if (progressFillEl) progressFillEl.style.width = `${progressPct}%`;
    if (projectionFillEl) {
      if (showProjectionMarker && projectedDeltaPct > 0) {
        projectionFillEl.style.display = "";
        projectionFillEl.style.left = `${progressPct}%`;
        projectionFillEl.style.width = `${projectedDeltaPct}%`;
      } else {
        projectionFillEl.style.display = "none";
        projectionFillEl.style.left = "0%";
        projectionFillEl.style.width = "0%";
      }
    }
    if (projectionMarkerEl) {
      if (showProjectionMarker) {
        projectionMarkerEl.style.display = "";
        projectionMarkerEl.classList.toggle("isAtEnd", projectedPct >= 100);
        if (projectedPct >= 100) {
          projectionMarkerEl.style.left = "";
        } else {
          projectionMarkerEl.style.left = `${projectedPct}%`;
        }
      } else {
        projectionMarkerEl.style.display = "none";
        projectionMarkerEl.classList.remove("isAtEnd");
        projectionMarkerEl.style.left = "";
      }
    }
    if (progressBarEl) {
      progressBarEl.setAttribute("aria-valuenow", String(progressPct));
      progressBarEl.setAttribute(
        "aria-label",
        totalGoalMs > 0
          ? showProjectionMarker
            ? `Weekly time goal progress: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(totalGoalMs)} logged, ${formatDashboardDurationShort(projectedMs)} projected if running tasks are logged`
            : `Weekly time goal progress: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(totalGoalMs)} logged`
          : "Weekly time goal progress: no weekly time goals enabled"
      );
    }
    if (progressTextEl) {
      progressTextEl.textContent =
        totalGoalMs > 0
          ? `${progressPct}% of weekly goal logged`
          : "No weekly time goals enabled";
    }
  }

  function applyDashboardGoalProgressUi(opts: {
    progressBarEl: HTMLElement | null;
    progressFillEl: HTMLElement | null;
    projectionFillEl: HTMLElement | null;
    projectionMarkerEl: HTMLElement | null;
    goalTotalMs: number;
    loggedMs: number;
    projectedMs: number;
    runningMs: number;
    emptyLabel: string;
    activeLabel: string;
    projectedLabel?: string;
  }) {
    const {
      progressBarEl,
      progressFillEl,
      projectionFillEl,
      projectionMarkerEl,
      goalTotalMs,
      loggedMs,
      projectedMs,
      runningMs,
      emptyLabel,
      activeLabel,
      projectedLabel,
    } = opts;

    const progressPct = goalTotalMs > 0 ? Math.max(0, Math.min(100, Math.round((loggedMs / goalTotalMs) * 100))) : 0;
    const projectedPct = goalTotalMs > 0 ? Math.max(0, Math.min(100, Math.round((projectedMs / goalTotalMs) * 100))) : 0;
    const showProjectionMarker = goalTotalMs > 0 && runningMs > 0;
    const projectedDeltaPct = showProjectionMarker ? Math.max(0, projectedPct - progressPct) : 0;

    if (progressFillEl) progressFillEl.style.width = `${progressPct}%`;
    if (projectionFillEl) {
      if (showProjectionMarker && projectedDeltaPct > 0) {
        projectionFillEl.style.display = "";
        projectionFillEl.style.left = `${progressPct}%`;
        projectionFillEl.style.width = `${projectedDeltaPct}%`;
      } else {
        projectionFillEl.style.display = "none";
        projectionFillEl.style.left = "0%";
        projectionFillEl.style.width = "0%";
      }
    }
    if (projectionMarkerEl) {
      if (showProjectionMarker) {
        projectionMarkerEl.style.display = "";
        projectionMarkerEl.classList.toggle("isAtEnd", projectedPct >= 100);
        if (projectedPct >= 100) {
          projectionMarkerEl.style.left = "";
        } else {
          projectionMarkerEl.style.left = `${projectedPct}%`;
        }
      } else {
        projectionMarkerEl.style.display = "none";
        projectionMarkerEl.classList.remove("isAtEnd");
        projectionMarkerEl.style.left = "";
      }
    }
    if (progressBarEl) {
      progressBarEl.setAttribute("aria-valuenow", String(progressPct));
      progressBarEl.setAttribute(
        "aria-label",
        goalTotalMs > 0
          ? showProjectionMarker
            ? `${activeLabel}: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(goalTotalMs)} logged, ${formatDashboardDurationShort(projectedMs)} ${projectedLabel || "projected if running tasks are logged"}`
            : `${activeLabel}: ${formatDashboardDurationShort(loggedMs)} of ${formatDashboardDurationShort(goalTotalMs)} logged`
          : emptyLabel
      );
    }

    return { progressPct, projectedPct, showProjectionMarker };
  }

  function renderDashboardTasksCompletedCard() {
    const valueEl = document.getElementById("dashboardTasksCompletedValue") as HTMLElement | null;
    const metaEl = document.getElementById("dashboardTasksCompletedMeta") as HTMLElement | null;
    const cardEl = valueEl?.closest(".dashboardTasksCompletedCard") as HTMLElement | null;
    const nowValue = nowMs();
    const weekStartMs = startOfCurrentWeekMondayMs(nowValue);
    const goalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (goalMinutes <= 0) return false;
      return task.timeGoalPeriod === "day" || task.timeGoalPeriod === "week";
    });

    const dailyTaskGoalMinutes = new Map<string, number>();
    const weeklyTaskGoalMinutes = new Map<string, number>();
    goalTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return;
      const goalMinutes = Math.max(0, Number(task.timeGoalMinutes || 0));
      if (task.timeGoalPeriod === "day") dailyTaskGoalMinutes.set(taskId, goalMinutes);
      else if (task.timeGoalPeriod === "week") weeklyTaskGoalMinutes.set(taskId, goalMinutes);
    });

    const dailyLoggedMsByTaskDay = new Map<string, Map<string, number>>();
    const weeklyLoggedMsByTask = new Map<string, number>();

    goalTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts < weekStartMs || ts > nowValue) return;
        if (!Number.isFinite(ms) || ms <= 0) return;
        if (dailyTaskGoalMinutes.has(taskId)) {
          const dayKey = localDayKey(ts);
          let byDay = dailyLoggedMsByTaskDay.get(taskId);
          if (!byDay) {
            byDay = new Map<string, number>();
            dailyLoggedMsByTaskDay.set(taskId, byDay);
          }
          byDay.set(dayKey, (byDay.get(dayKey) || 0) + ms);
        }
        if (weeklyTaskGoalMinutes.has(taskId)) {
          weeklyLoggedMsByTask.set(taskId, (weeklyLoggedMsByTask.get(taskId) || 0) + ms);
        }
      });
    });

    let dailyCompletedDays = 0;
    dailyLoggedMsByTaskDay.forEach((byDay, taskId) => {
      const goalMinutes = dailyTaskGoalMinutes.get(taskId) || 0;
      if (!(goalMinutes > 0)) return;
      byDay.forEach((loggedMs) => {
        if (loggedMs >= goalMinutes * 60000) dailyCompletedDays += 1;
      });
    });

    let weeklyCompletedTasks = 0;
    weeklyLoggedMsByTask.forEach((loggedMs, taskId) => {
      const goalMinutes = weeklyTaskGoalMinutes.get(taskId) || 0;
      if (goalMinutes > 0 && loggedMs >= goalMinutes * 60000) weeklyCompletedTasks += 1;
    });

    const totalCompleted = dailyCompletedDays + weeklyCompletedTasks;
    const hasData = totalCompleted > 0;
    if (shouldHoldDashboardWidget("tasksCompleted", hasData)) return;

    const formatCompletionText = (count: number, singular: string, plural: string) =>
      `${count} ${count === 1 ? singular : plural}`;

    if (valueEl) valueEl.textContent = String(totalCompleted);
    if (metaEl) {
      if (dailyCompletedDays > 0 && weeklyCompletedTasks > 0) {
        metaEl.textContent = `${formatCompletionText(dailyCompletedDays, "daily completion", "daily completions")} • ${formatCompletionText(
          weeklyCompletedTasks,
          "weekly completion",
          "weekly completions"
        )}`;
      } else if (dailyCompletedDays > 0) {
        metaEl.textContent = formatCompletionText(dailyCompletedDays, "daily completion", "daily completions");
      } else if (weeklyCompletedTasks > 0) {
        metaEl.textContent = formatCompletionText(weeklyCompletedTasks, "weekly completion", "weekly completions");
      } else {
        metaEl.textContent = "No weekly goal completions yet";
      }
    }
    if (cardEl) {
      cardEl.setAttribute(
        "aria-label",
        totalCompleted > 0
          ? `Task completion. ${totalCompleted} goal completions this week: ${dailyCompletedDays} daily and ${weeklyCompletedTasks} weekly.`
          : "Task completion. No weekly goal completions yet."
      );
    }
  }

  function renderDashboardTodayHoursCard() {
    const titleEl = document.getElementById("dashboardTodayHoursTitle") as HTMLElement | null;
    const valueEl = document.getElementById("dashboardTodayHoursValue") as HTMLElement | null;
    const metaEl = document.getElementById("dashboardTodayHoursMeta") as HTMLElement | null;
    const deltaEl = document.getElementById("dashboardTodayHoursDelta") as HTMLElement | null;
    const progressBarEl = document.getElementById("dashboardTodayHoursProgressBar") as HTMLElement | null;
    const projectionMarkerEl = document.getElementById("dashboardTodayHoursProjectionMarker") as HTMLElement | null;
    const projectionFillEl = document.getElementById("dashboardTodayHoursProjectionFill") as HTMLElement | null;
    const progressFillEl = document.getElementById("dashboardTodayHoursProgressFill") as HTMLElement | null;
    const nowValue = nowMs();
    const todayStartDate = new Date(nowValue);
    todayStartDate.setHours(0, 0, 0, 0);
    const todayStartMs = todayStartDate.getTime();
    const elapsedTodayMs = Math.max(0, nowValue - todayStartMs);
    const yesterdayStartMs = todayStartMs - 86400000;
    const yesterdaySameTimeCutoffMs = yesterdayStartMs + elapsedTodayMs;
    const todayKey = localDayKey(nowValue);
    const yesterdayDate = new Date(nowValue);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = localDayKey(yesterdayDate.getTime());
    const includedTaskIds = new Set(
      getDashboardFilteredTasks()
        .map((task) => String(task?.id || "").trim())
        .filter(Boolean)
    );
    const dailyGoalTasks = getDashboardFilteredTasks().filter((task) => {
      if (!task) return false;
      if (!task.timeGoalEnabled) return false;
      if (task.timeGoalPeriod !== "day") return false;
      return Math.max(0, Number(task.timeGoalMinutes || 0)) > 0;
    });
    const totalDailyGoalMs = dailyGoalTasks.reduce((sum, task) => sum + Math.max(0, Number(task.timeGoalMinutes || 0)) * 60000, 0);

    let todayLoggedMs = 0;
    let yesterdaySameTimeMs = 0;
    includedTaskIds.forEach((taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return;
        const entryDayKey = localDayKey(ts);
        if (entryDayKey === todayKey) todayLoggedMs += ms;
        else if (entryDayKey === yesterdayKey && ts <= yesterdaySameTimeCutoffMs) yesterdaySameTimeMs += ms;
      });
    });
    const todayInProgressMs = getDashboardFilteredTasks().reduce((sum, task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId || !includedTaskIds.has(taskId)) return sum;
      const elapsedMs = Math.max(0, getElapsedMs(task));
      if (elapsedMs <= 0) return sum;
      return sum + elapsedMs;
    }, 0);
    const todayMs = todayLoggedMs + todayInProgressMs;
    const dailyGoalLoggedMs = dailyGoalTasks.reduce((sum, task) => {
      const taskId = String(task.id || "").trim();
      if (!taskId) return sum;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      const taskTodayMs = entries.reduce((entrySum, entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return entrySum;
        return localDayKey(ts) === todayKey ? entrySum + ms : entrySum;
      }, 0);
      return sum + taskTodayMs;
    }, 0);
    const dailyGoalInProgressMs = dailyGoalTasks.reduce((sum, task) => {
      const elapsedMs = Math.max(0, getElapsedMs(task));
      if (elapsedMs <= 0) return sum;
      return sum + elapsedMs;
    }, 0);
    const dailyGoalProjectedMs = dailyGoalLoggedMs + dailyGoalInProgressMs;

    if (titleEl) titleEl.textContent = "Today";
    if (valueEl) valueEl.textContent = formatDashboardDurationShort(todayMs);
    applyDashboardGoalProgressUi({
      progressBarEl,
      progressFillEl,
      projectionFillEl,
      projectionMarkerEl,
      goalTotalMs: totalDailyGoalMs,
      loggedMs: dailyGoalLoggedMs,
      projectedMs: dailyGoalProjectedMs,
      runningMs: dailyGoalInProgressMs,
      emptyLabel: "Today's time goal progress: no daily time goals enabled",
      activeLabel: "Today's time goal progress",
      projectedLabel: "projected if running tasks are logged",
    });
    if (metaEl) {
      if (totalDailyGoalMs > 0) {
        metaEl.textContent = "";
        metaEl.style.display = "none";
      } else {
        metaEl.textContent = "No daily time goals enabled";
        metaEl.style.display = "";
      }
    }
    if (!deltaEl) return;

    deltaEl.classList.remove("positive", "negative");
    if (todayMs <= 0 && yesterdaySameTimeMs <= 0) {
      deltaEl.textContent = "No time logged today";
      return;
    }
    if (yesterdaySameTimeMs <= 0) {
      if (todayMs > 0) {
        deltaEl.textContent = `+${formatDashboardDurationShort(todayMs)} vs this time yesterday`;
        deltaEl.classList.add("positive");
      } else {
        deltaEl.textContent = "Same as this time yesterday";
      }
      return;
    }

    const deltaMs = todayMs - yesterdaySameTimeMs;
    const deltaText = formatDashboardDurationShort(Math.abs(deltaMs));
    if (deltaMs > 0) {
      deltaEl.textContent = `+${deltaText} vs this time yesterday`;
      deltaEl.classList.add("positive");
      return;
    }
    if (deltaMs < 0) {
      deltaEl.textContent = `-${deltaText} vs this time yesterday`;
      deltaEl.classList.add("negative");
      return;
    }
    deltaEl.textContent = "Same as this time yesterday";
  }

  function renderDashboardTimelineCard() {
    const listEl = els.dashboardTimelineList as HTMLElement | null;
    const noteEl = els.dashboardTimelineNote as HTMLElement | null;
    const cardEl = listEl?.closest(".dashboardTimelineCard") as HTMLElement | null;
    if (!listEl) return;

    const density = sanitizeDashboardTimelineDensity(dashboardTimelineDensity);
    dashboardTimelineDensity = density;
    const targetCount = getDashboardTimelineDensityTarget(density);
    const densityButtons = cardEl
      ? Array.from(cardEl.querySelectorAll("[data-dashboard-timeline-density]")) as HTMLButtonElement[]
      : [];
    densityButtons.forEach((button) => {
      const buttonDensity = sanitizeDashboardTimelineDensity(button.getAttribute("data-dashboard-timeline-density"));
      const isOn = buttonDensity === density;
      button.classList.toggle("isOn", isOn);
      button.setAttribute("aria-pressed", isOn ? "true" : "false");
      button.setAttribute("title", `${dashboardTimelineDensityLabel(buttonDensity)} density`);
    });

    const nowValue = nowMs();
    const thirtyDaysAgoMs = nowValue - 30 * 86400000;
    const showWeekendRoutine = [0, 6].includes(new Date(nowValue).getDay());
    const minimumActivityDays = 4;
    const preferredBranchMinimumDistinctDays = showWeekendRoutine ? 2 : 2;
    const fallbackMinimumDistinctDays = 2;
    const bucketSizeMinutes = 60;
    const minimumSessionMs = 10 * 60 * 1000;
    const minimumSegmentMinutes = 20;
    type TimelineBucketStats = {
      taskName: string;
      distinctDayKeys: Set<string>;
      totalMs: number;
      sessionCount: number;
      weightedMinuteSum: number;
      durationTotalMs: number;
    };
    type TimelineBucketMap = Map<number, Map<string, TimelineBucketStats>>;
    type TimelineSuggestionItem = {
      taskId: string;
      taskName: string;
      distinctDays: number;
      totalMs: number;
      sessionCount: number;
      suggestedMinute: number;
      bucketIndex: number;
      avgDurationMs: number;
      segmentStartMinute: number;
      segmentEndMinute: number;
      maxStartMinute: number;
      maxEndMinute: number;
      goalStartMinute: number | null;
      goalEndMinute: number | null;
      isPreferredBranch: boolean;
      colorIndex: number;
    };
    const bucketMap: TimelineBucketMap = new Map();
    const fallbackBucketMap: TimelineBucketMap = new Map();
    const matchedDayKeys = new Set<string>();
    const fallbackMatchedDayKeys = new Set<string>();
    const timeGoalMinutesByTaskId = new Map<string, number>();

    const formatTimelineClockMinute = (minuteRaw: number, opts?: { end?: boolean }) => {
      const boundedMinute = Math.max(0, Math.min(1440, Math.round(minuteRaw)));
      const normalizedMinute = boundedMinute === 1440 ? 0 : boundedMinute;
      const hours = boundedMinute === 1440 ? 24 : Math.floor(normalizedMinute / 60);
      const minutes = normalizedMinute % 60;
      if (opts?.end && boundedMinute === 1440) return "24:00";
      return `${formatTwo(hours)}:${formatTwo(minutes)}`;
    };

    const getTimelineSegmentRangeLabel = (startMinute: number, endMinute: number) => {
      return `${formatTimelineClockMinute(startMinute)} - ${formatTimelineClockMinute(endMinute, { end: true })}`;
    };

    const addTimelineEntryToBucketMap = (
      targetBucketMap: TimelineBucketMap,
      bucketIndex: number,
      taskId: string,
      taskName: string,
      dayKey: string,
      minuteOfDay: number,
      ms: number
    ) => {
      let bucket = targetBucketMap.get(bucketIndex);
      if (!bucket) {
        bucket = new Map();
        targetBucketMap.set(bucketIndex, bucket);
      }
      let stats = bucket.get(taskId);
      if (!stats) {
        stats = {
          taskName,
          distinctDayKeys: new Set<string>(),
          totalMs: 0,
          sessionCount: 0,
          weightedMinuteSum: 0,
          durationTotalMs: 0,
        };
        bucket.set(taskId, stats);
      }
      stats.distinctDayKeys.add(dayKey);
      stats.totalMs += ms;
      stats.sessionCount += 1;
      stats.weightedMinuteSum += minuteOfDay * ms;
      stats.durationTotalMs += ms;
    };

    const buildTimelineItems = (
      targetBucketMap: TimelineBucketMap,
      minimumDistinctDays: number
    ): TimelineSuggestionItem[] =>
      Array.from(targetBucketMap.entries())
        .map(([bucketIndex, taskMap]) => {
          const ranked = Array.from(taskMap.entries())
            .map(([taskId, stats]) => ({
              taskId,
              taskName: stats.taskName,
              distinctDays: stats.distinctDayKeys.size,
              totalMs: stats.totalMs,
              sessionCount: stats.sessionCount,
              avgDurationMs:
                stats.sessionCount > 0 ? Math.max(minimumSessionMs, Math.round(stats.durationTotalMs / stats.sessionCount)) : minimumSessionMs,
              suggestedMinute:
                stats.totalMs > 0
                  ? Math.max(0, Math.min(1439, Math.round(stats.weightedMinuteSum / stats.totalMs)))
                  : bucketIndex * bucketSizeMinutes,
            }))
            .filter((row) => row.distinctDays >= minimumDistinctDays)
            .sort((a, b) => {
              if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
              if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
              if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
              return a.taskName.localeCompare(b.taskName);
            });
          if (!ranked.length) return null;
          const winner = ranked[0]!;
          const averageDurationMinutes = Math.max(
            minimumSegmentMinutes,
            Math.round((winner.avgDurationMs / 60000) || minimumSegmentMinutes)
          );
          const halfDurationMinutes = averageDurationMinutes / 2;
          const startMinute = Math.max(0, Math.round(winner.suggestedMinute - halfDurationMinutes));
          const endMinute = Math.min(1440, Math.round(winner.suggestedMinute + halfDurationMinutes));
          const normalizedSegmentStartMinute = Math.max(0, Math.min(1440 - minimumSegmentMinutes, startMinute));
          const normalizedSegmentEndMinute = Math.max(normalizedSegmentStartMinute + minimumSegmentMinutes, endMinute);
          const goalDurationMinutes = Math.round(timeGoalMinutesByTaskId.get(winner.taskId) || 0);
          const goalHalfDurationMinutes = goalDurationMinutes / 2;
          const goalStartMinuteRaw = Math.max(0, Math.round(winner.suggestedMinute - goalHalfDurationMinutes));
          const goalEndMinuteRaw = Math.min(1440, Math.round(winner.suggestedMinute + goalHalfDurationMinutes));
          const hasExtendedGoal = goalDurationMinutes > averageDurationMinutes;
          return {
            ...winner,
            bucketIndex,
            segmentStartMinute: normalizedSegmentStartMinute,
            segmentEndMinute: normalizedSegmentEndMinute,
            maxStartMinute: hasExtendedGoal
              ? Math.max(0, Math.min(1440 - minimumSegmentMinutes, goalStartMinuteRaw))
              : normalizedSegmentStartMinute,
            maxEndMinute: hasExtendedGoal
              ? Math.max(
                  Math.max(0, Math.min(1440 - minimumSegmentMinutes, goalStartMinuteRaw)) + minimumSegmentMinutes,
                  goalEndMinuteRaw
                )
              : normalizedSegmentEndMinute,
            goalStartMinute: hasExtendedGoal ? Math.max(0, Math.min(1440 - minimumSegmentMinutes, goalStartMinuteRaw)) : null,
            goalEndMinute: hasExtendedGoal
              ? Math.max(
                  Math.max(0, Math.min(1440 - minimumSegmentMinutes, goalStartMinuteRaw)) + minimumSegmentMinutes,
                  goalEndMinuteRaw
                )
              : null,
            isPreferredBranch: false,
            colorIndex: 0,
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .sort((a, b) => {
          if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
          if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
          if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
          if (a.bucketIndex !== b.bucketIndex) return a.bucketIndex - b.bucketIndex;
          return a.taskName.localeCompare(b.taskName);
        });

    getDashboardFilteredTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      const timeGoalMinutes =
        !!task?.timeGoalEnabled && Number(task?.timeGoalMinutes || 0) > 0 ? Math.max(0, Number(task?.timeGoalMinutes || 0)) : 0;
      if (timeGoalMinutes > 0) timeGoalMinutesByTaskId.set(taskId, timeGoalMinutes);
      const taskName = String(task?.name || "").trim() || "Task";
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ts <= 0 || ms < minimumSessionMs) return;
        if (ts < thirtyDaysAgoMs || ts > nowValue) return;
        const midpointMs = Math.max(thirtyDaysAgoMs, Math.min(nowValue, Math.round(ts - ms / 2)));
        const midpointDate = new Date(midpointMs);
        const isWeekendEntry = midpointDate.getDay() === 0 || midpointDate.getDay() === 6;
        const dayKey = localDayKey(midpointMs);
        fallbackMatchedDayKeys.add(dayKey);
        const minuteOfDay =
          midpointDate.getHours() * 60 +
          midpointDate.getMinutes() +
          midpointDate.getSeconds() / 60;
        const bucketIndex = Math.max(0, Math.min(23, Math.floor(minuteOfDay / bucketSizeMinutes)));
        addTimelineEntryToBucketMap(fallbackBucketMap, bucketIndex, taskId, taskName, dayKey, minuteOfDay, ms);
        if (isWeekendEntry !== showWeekendRoutine) return;
        matchedDayKeys.add(dayKey);
        addTimelineEntryToBucketMap(bucketMap, bucketIndex, taskId, taskName, dayKey, minuteOfDay, ms);
      });
    });

    const qualifyingActivityDayCount = fallbackMatchedDayKeys.size;
    const preferredBranchActivityDayCount = matchedDayKeys.size;
    const preferredItems = buildTimelineItems(bucketMap, preferredBranchMinimumDistinctDays);
    const fallbackItems = buildTimelineItems(fallbackBucketMap, fallbackMinimumDistinctDays);
    const bestItemsByTaskId = new Map<string, TimelineSuggestionItem>();
    const rankTimelineItem = (candidate: TimelineSuggestionItem, isPreferredBranch: boolean) => {
      const nextItem = { ...candidate, isPreferredBranch };
      const current = bestItemsByTaskId.get(candidate.taskId);
      if (!current) {
        bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (Number(isPreferredBranch) !== Number(current.isPreferredBranch)) {
        if (isPreferredBranch) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.distinctDays !== current.distinctDays) {
        if (candidate.distinctDays > current.distinctDays) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.totalMs !== current.totalMs) {
        if (candidate.totalMs > current.totalMs) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.sessionCount !== current.sessionCount) {
        if (candidate.sessionCount > current.sessionCount) bestItemsByTaskId.set(candidate.taskId, nextItem);
        return;
      }
      if (candidate.bucketIndex < current.bucketIndex) bestItemsByTaskId.set(candidate.taskId, nextItem);
    };
    preferredItems.forEach((item) => rankTimelineItem(item, true));
    fallbackItems.forEach((item) => rankTimelineItem(item, false));
    const items = Array.from(bestItemsByTaskId.values())
      .sort((a, b) => {
        if (a.suggestedMinute !== b.suggestedMinute) return a.suggestedMinute - b.suggestedMinute;
        if (a.maxStartMinute !== b.maxStartMinute) return a.maxStartMinute - b.maxStartMinute;
        if (b.distinctDays !== a.distinctDays) return b.distinctDays - a.distinctDays;
        if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
        return a.taskName.localeCompare(b.taskName);
      })
      .slice(0, targetCount)
      .map((item) => ({ ...item }));

    for (let index = 0; index < items.length - 1; index += 1) {
      const current = items[index]!;
      const next = items[index + 1]!;
      const boundaryMinute = Math.round((current.suggestedMinute + next.suggestedMinute) / 2);
      current.maxEndMinute = Math.min(current.maxEndMinute, boundaryMinute);
      next.maxStartMinute = Math.max(next.maxStartMinute, boundaryMinute);
    }

    items.forEach((item, index) => {
      const desiredDurationMinutes = Math.max(minimumSegmentMinutes, Math.round(item.avgDurationMs / 60000) || minimumSegmentMinutes);
      const availableDurationMinutes = Math.max(minimumSegmentMinutes, item.maxEndMinute - item.maxStartMinute);
      const actualDurationMinutes = Math.min(desiredDurationMinutes, availableDurationMinutes);
      const centeredStartMinute = Math.round(item.suggestedMinute - actualDurationMinutes / 2);
      const segmentStartMinute = Math.max(
        item.maxStartMinute,
        Math.min(centeredStartMinute, Math.max(item.maxStartMinute, item.maxEndMinute - actualDurationMinutes))
      );
      item.segmentStartMinute = segmentStartMinute;
      item.segmentEndMinute = Math.min(item.maxEndMinute, segmentStartMinute + actualDurationMinutes);
      const hasGoalWindow = item.goalStartMinute != null && item.goalEndMinute != null && item.maxEndMinute > item.segmentEndMinute;
      item.goalStartMinute = hasGoalWindow ? item.maxStartMinute : null;
      item.goalEndMinute = hasGoalWindow ? item.maxEndMinute : null;
      item.colorIndex = index % 6;
    });
    const usingFallbackItems = items.some((item) => !item.isPreferredBranch);

    if (qualifyingActivityDayCount < minimumActivityDays) {
      listEl.innerHTML = "";
      if (noteEl) {
        noteEl.textContent =
          qualifyingActivityDayCount > 0
            ? `Add activity on ${minimumActivityDays}+ days to unlock routine suggestions`
            : `Log activity on ${minimumActivityDays}+ days to unlock routine suggestions`;
      }
      if (cardEl) {
        cardEl.setAttribute(
          "aria-description",
          `Timeline suggestions unavailable. ${qualifyingActivityDayCount} of ${minimumActivityDays} qualifying activity days found in the last 30 days.`
        );
      }
      if (!shouldHoldDashboardWidget("timeline", false)) {
        dashboardWidgetHasRenderedData.timeline = false;
      }
      return;
    }

    if (!items.length) {
      listEl.innerHTML = "";
      if (noteEl) {
        noteEl.textContent =
          preferredBranchActivityDayCount > 0
            ? `Recent ${showWeekendRoutine ? "weekend" : "weekday"} activity is too scattered to suggest a routine yet`
            : `No recent ${showWeekendRoutine ? "weekend" : "weekday"} routine yet. Broader history is still too scattered to suggest a time window`;
      }
      if (cardEl) {
        cardEl.setAttribute(
          "aria-description",
          preferredBranchActivityDayCount > 0
            ? `Timeline suggestions unavailable. ${qualifyingActivityDayCount} qualifying activity days were found, but recent ${showWeekendRoutine ? "weekend" : "weekday"} history is still too scattered across time windows.`
            : `Timeline suggestions unavailable. ${qualifyingActivityDayCount} qualifying activity days were found, but there is not enough consistent ${showWeekendRoutine ? "weekend" : "weekday"} history and broader history is still too scattered across time windows.`
        );
      }
      if (!shouldHoldDashboardWidget("timeline", false)) {
        dashboardWidgetHasRenderedData.timeline = false;
      }
      return;
    }

    if (shouldHoldDashboardWidget("timeline", true)) return;

    const formatTimelineDurationLabel = (durationMs: number) => {
      const totalMinutes = Math.max(minimumSegmentMinutes, Math.round(durationMs / 60000) || minimumSegmentMinutes);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h`;
      return `${totalMinutes}m`;
    };
    const timelineHourLabels = ["12a", "4a", "8a", "12p", "4p", "8p", "12a"];
    listEl.innerHTML = `
      <div class="dashboardTimelineTrackHours" aria-hidden="true">
        ${timelineHourLabels.map((label) => `<span>${escapeHtmlUI(label)}</span>`).join("")}
      </div>
      <div class="dashboardTimelineTrack">
        ${items
          .map((item) => {
            const timeText = getTimelineSegmentRangeLabel(item.segmentStartMinute, item.segmentEndMinute);
            const durationText = formatTimelineDurationLabel(item.avgDurationMs);
            const markerLeftPct = Math.max(0, Math.min(100, (item.suggestedMinute / 1440) * 100));
            const segmentStartPct = Math.max(0, Math.min(100, (item.segmentStartMinute / 1440) * 100));
            const segmentEndPct = Math.max(segmentStartPct, Math.min(100, (item.segmentEndMinute / 1440) * 100));
            const goalStartPct =
              item.goalStartMinute == null ? null : Math.max(0, Math.min(100, (item.goalStartMinute / 1440) * 100));
            const goalEndPct =
              item.goalEndMinute == null ? null : Math.max(goalStartPct || 0, Math.min(100, (item.goalEndMinute / 1440) * 100));
            const title = `${item.taskName} around ${timeText}. Typical duration ${durationText}. Seen on ${item.distinctDays} day${
              item.distinctDays === 1 ? "" : "s"
            } in the last 30 days.`;
            return `
              ${
                goalStartPct != null && goalEndPct != null
                  ? `<span class="dashboardTimelineSegment dashboardTimelineSegmentGoal dashboardTimelineSegmentGoalColor-${item.colorIndex}" style="left:${goalStartPct.toFixed(
                      2
                    )}%;width:${Math.max(0.8, goalEndPct - goalStartPct).toFixed(2)}%;" aria-hidden="true"></span>`
                  : ""
              }
              <span class="dashboardTimelineSegment dashboardTimelineSegmentColor-${item.colorIndex}" style="left:${segmentStartPct.toFixed(
                2
              )}%;width:${Math.max(0.8, segmentEndPct - segmentStartPct).toFixed(2)}%;" aria-hidden="true"></span>
              <span class="dashboardTimelineMarker" style="left:${markerLeftPct.toFixed(2)}%;" aria-hidden="true"></span>
              <div class="dashboardTimelineItem" style="left:${markerLeftPct.toFixed(
                2
              )}%;" title="${escapeHtmlUI(title)}" aria-label="${escapeHtmlUI(title)}">
                <span class="dashboardTimelineTime">${escapeHtmlUI(timeText)}</span>
                <div class="dashboardTimelineMeta">
                  <p class="dashboardTimelineLabel">${escapeHtmlUI(item.taskName)}</p>
                  <span class="dashboardTimelineDuration">${escapeHtmlUI(durationText)}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
    if (noteEl) {
      noteEl.textContent = usingFallbackItems
        ? `${items.length} task marker${items.length === 1 ? "" : "s"} arranged from your last 30 days of activity`
        : `${items.length} ${showWeekendRoutine ? "weekend" : "weekday"} task marker${items.length === 1 ? "" : "s"} across your day`;
    }
    if (cardEl) {
      cardEl.setAttribute(
        "aria-description",
        usingFallbackItems
          ? `Horizontal task timeline based on qualifying history from the last 30 days. Showing up to ${targetCount} suggested task markers and duration spans.`
          : `Horizontal ${showWeekendRoutine ? "weekend" : "weekday"} task timeline based on the last 30 days. Showing up to ${targetCount} suggested task markers and duration spans.`
      );
    }
  }

  function renderDashboardFocusTrend() {
    const cardEl = els.dashboardFocusTrendCard as HTMLElement | null;
    const barsEl = els.dashboardFocusTrendBars as HTMLElement | null;
    const axisEl = els.dashboardFocusTrendAxis as HTMLElement | null;
    if (!barsEl || !axisEl) return;

    const nowValue = nowMs();
    const includedTaskIds = getDashboardIncludedTaskIds();
    const today = new Date(nowValue);
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - idx));
      date.setHours(0, 0, 0, 0);
      return {
        startMs: date.getTime(),
        endMs: date.getTime() + 86400000,
        label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        longLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        totalMs: 0,
      };
    });

    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        for (const day of days) {
          if (ts >= day.startMs && ts < day.endMs) {
            day.totalMs += ms;
            break;
          }
        }
      });
    });

    const maxMs = days.reduce((max, day) => Math.max(max, day.totalMs), 0);
    const weekTotalMs = days.reduce((sum, day) => sum + day.totalMs, 0);
    if (shouldHoldDashboardWidget("focusTrend", weekTotalMs > 0)) return;
    const prevWeekStartMs = days[0]!.startMs - 7 * 86400000;
    const prevWeekEndMs = days[0]!.startMs;
    let prevWeekTotalMs = 0;

    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts >= prevWeekStartMs && ts < prevWeekEndMs) prevWeekTotalMs += ms;
      });
    });

    barsEl.innerHTML = days
      .map((day) => {
        const ratio = maxMs > 0 ? day.totalMs / maxMs : 0;
        const aria = `${day.longLabel}: ${formatDashboardDurationShort(day.totalMs)}`;
        return `<span class="dashboardGraphDay" role="img" aria-label="${escapeHtmlUI(aria)}" title="${escapeHtmlUI(aria)}"><span class="dashboardGraphValue">${escapeHtmlUI(formatDashboardDurationShort(day.totalMs))}</span><span class="dashboardGraphBarWrap"><span class="dashboardGraphBar" style="height:${Math.round(ratio * 100)}%;"></span></span></span>`;
      })
      .join("");

    axisEl.innerHTML = days.map((day) => `<span>${escapeHtmlUI(day.label)}</span>`).join("");

    if (cardEl) {
      const deltaPct = prevWeekTotalMs > 0 ? Math.round(((weekTotalMs - prevWeekTotalMs) / prevWeekTotalMs) * 100) : null;
      const summary =
        deltaPct === null
          ? `Focus trend for the last 7 days. ${formatDashboardDurationShort(weekTotalMs)} logged.`
          : `Focus trend for the last 7 days. ${formatDashboardDurationShort(weekTotalMs)} logged, ${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs previous 7 days.`;
      cardEl.setAttribute("aria-description", summary);
    }
  }

  function getDashboardHeatDaySummaryRows(dayKeyRaw: string) {
    const dayKey = String(dayKeyRaw || "").trim();
    const includedTaskIds = getDashboardIncludedTaskIds();
    const taskNameById = new Map<string, string>();
    getDashboardFilteredTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskNameById.set(taskId, String(task?.name || "").trim() || "Task");
    });

    const rows: Array<{ taskId: string; taskName: string; totalMs: number }> = [];
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId || !includedTaskIds.has(taskId)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      if (!entries.length) return;
      const totalMs = entries.reduce((sum, entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return sum;
        return localDayKey(ts) === dayKey ? sum + ms : sum;
      }, 0);
      if (totalMs <= 0) return;
      rows.push({
        taskId,
        taskName: taskNameById.get(taskId) || "Task",
        totalMs,
      });
    });

    rows.sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      return a.taskName.localeCompare(b.taskName);
    });
    return rows;
  }

  let dashboardHeatSelectedDayKey = "";

  function findDashboardHeatDayButton(dayKeyRaw: string): HTMLElement | null {
    const dayKey = String(dayKeyRaw || "").trim();
    if (!dayKey) return null;
    const grid = els.dashboardHeatCalendarGrid as HTMLElement | null;
    if (!grid) return null;
    try {
      const escaped =
        typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function"
          ? (window as any).CSS.escape(dayKey)
          : dayKey.replace(/["\\]/g, "\\$&");
      return grid.querySelector(`.dashboardHeatDayCell.isInteractive[data-heat-date="${escaped}"]`) as HTMLElement | null;
    } catch {
      return grid.querySelector(`.dashboardHeatDayCell.isInteractive[data-heat-date="${dayKey}"]`) as HTMLElement | null;
    }
  }

  function setDashboardHeatFlipState(isFlipped: boolean) {
    const card = els.dashboardHeatCard as HTMLElement | null;
    const front = els.dashboardHeatFaceFront as HTMLElement | null;
    const back = els.dashboardHeatFaceBack as HTMLElement | null;
    card?.classList.toggle("isFlipped", isFlipped);
    if (front) {
      front.setAttribute("aria-hidden", isFlipped ? "true" : "false");
      if (isFlipped) front.setAttribute("inert", "");
      else front.removeAttribute("inert");
    }
    if (back) {
      back.setAttribute("aria-hidden", isFlipped ? "false" : "true");
      if (isFlipped) back.removeAttribute("inert");
      else back.setAttribute("inert", "");
    }
    if (els.dashboardHeatSummaryCloseBtn) {
      els.dashboardHeatSummaryCloseBtn.setAttribute("aria-expanded", isFlipped ? "true" : "false");
    }
  }

  function closeDashboardHeatSummaryCard(opts?: { restoreFocus?: boolean }) {
    setDashboardHeatFlipState(false);
    if (opts?.restoreFocus && dashboardHeatSelectedDayKey) {
      window.setTimeout(() => {
        findDashboardHeatDayButton(dashboardHeatSelectedDayKey)?.focus();
      }, 0);
    }
  }

  function openDashboardHeatSummaryCard(dayKeyRaw: string, dateLabelRaw: string) {
    const dayKey = String(dayKeyRaw || "").trim();
    if (!dayKey) return;
    const dateLabel = String(dateLabelRaw || "").trim() || dayKey;
    const rows = getDashboardHeatDaySummaryRows(dayKey);
    if (!rows.length) return;
    dashboardHeatSelectedDayKey = dayKey;
    if (els.dashboardHeatSummaryDate) {
      els.dashboardHeatSummaryDate.textContent = dateLabel;
    }
    if (els.dashboardHeatSummaryBody) {
      els.dashboardHeatSummaryBody.innerHTML = `
        <div class="dashboardHeatSummaryList" role="list" aria-label="Logged task time for ${escapeHtmlUI(dateLabel)}">
          ${rows
            .map(
              (row) => `<div class="dashboardHeatSummaryRow" role="listitem">
                <span class="dashboardHeatSummaryTask">${escapeHtmlUI(row.taskName)}</span>
                <span class="dashboardHeatSummaryTime">${escapeHtmlUI(formatTime(row.totalMs))}</span>
              </div>`
            )
            .join("")}
        </div>
      `;
    }
    setDashboardHeatFlipState(true);
    window.setTimeout(() => {
      try {
        els.dashboardHeatSummaryCloseBtn?.focus();
      } catch {
        // ignore focus failures
      }
    }, 0);
  }

  function renderDashboardHeatCalendar() {
    const monthLabelEl = els.dashboardHeatMonthLabel as HTMLElement | null;
    const gridEl = els.dashboardHeatCalendarGrid as HTMLElement | null;
    if (!gridEl) return;

    const nowValue = nowMs();
    const nowDate = new Date(nowValue);
    const year = nowDate.getFullYear();
    const monthIndex = nowDate.getMonth();
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);
    const firstDow = monthStart.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    if (monthLabelEl) {
      monthLabelEl.textContent = formatDashboardHeatMonthLabel(year, monthIndex);
    }

    const byDayMs = new Map<string, number>();
    const historyByDayMs = new Map<string, number>();
    const includedTaskIds = getDashboardIncludedTaskIds();
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!isDashboardTaskIncluded(taskId, includedTaskIds)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts < monthStart.getTime() || ts >= monthEnd.getTime()) return;
        const key = localDayKey(ts);
        byDayMs.set(key, (byDayMs.get(key) || 0) + ms);
        historyByDayMs.set(key, (historyByDayMs.get(key) || 0) + ms);
      });
    });

    getDashboardFilteredTasks().forEach((task) => {
      if (!task?.running || typeof task.startMs !== "number") return;
      const runStartMs = Math.max(monthStart.getTime(), Math.floor(task.startMs));
      const runEndMs = Math.min(monthEnd.getTime(), nowValue);
      addRangeMsToLocalDayMap(byDayMs, runStartMs, runEndMs);
    });

    let maxDayMs = 0;
    byDayMs.forEach((v) => {
      if (v > maxDayMs) maxDayMs = v;
    });
    if (shouldHoldDashboardWidget("heatCalendar", maxDayMs > 0)) return;

    const totalSlots = 42;
    const trailingFillers = Math.max(0, totalSlots - firstDow - daysInMonth);
    const html: string[] = [];

    for (let i = 0; i < firstDow; i += 1) {
      html.push('<span class="dashboardHeatDayCell isFiller" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayDate = new Date(year, monthIndex, day);
      const key = localDayKey(dayDate.getTime());
      const dayMs = Math.max(0, byDayMs.get(key) || 0);
      const ratio = maxDayMs > 0 ? Math.max(0, Math.min(1, dayMs / maxDayMs)) : 0;
      const colorCss =
        dayMs > 0
          ? (() => {
              // Use a theme-independent activity spectrum:
              // green for lighter activity, orange for moderate, red for highest.
              if (ratio <= 0.5) {
                const t = ratio / 0.5;
                const hue = 120 - 84 * t;
                const sat = 78 + 6 * t;
                const light = 42 + 6 * t;
                return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
              }
              const t = (ratio - 0.5) / 0.5;
              const hue = 36 - 32 * t;
              const sat = 84 + 6 * t;
              const light = 48 - 6 * t;
              return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
            })()
          : "";
      const activityLevel = dayMs <= 0 ? "none" : ratio < 0.34 ? "low" : ratio < 0.67 ? "medium" : "high";
      const dateText = dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const durationText = formatDashboardDurationShort(dayMs);
      const aria = `${dateText}: ${durationText} of focused time`;
      const styleAttr = colorCss ? ` style="--heat-color:${colorCss}"` : "";
      const hasHistoryEntries = (historyByDayMs.get(key) || 0) > 0;
      html.push(
        hasHistoryEntries
          ? `<button class="dashboardHeatDayCell isActive isInteractive" type="button" data-activity-level="${activityLevel}" data-heat-date="${escapeHtmlUI(
              key
            )}" data-heat-date-label="${escapeHtmlUI(dateText)}" role="gridcell" aria-label="${escapeHtmlUI(aria)}" title="${escapeHtmlUI(
              aria
            )}"${styleAttr}><span class="dashboardHeatDayNum">${day}</span></button>`
          : `<span class="dashboardHeatDayCell${dayMs > 0 ? " isActive" : ""}" data-activity-level="${activityLevel}" role="gridcell" aria-label="${escapeHtmlUI(
              aria
            )}" title="${escapeHtmlUI(aria)}"${styleAttr}><span class="dashboardHeatDayNum">${day}</span></span>`
      );
    }

    for (let i = 0; i < trailingFillers; i += 1) {
      html.push('<span class="dashboardHeatDayCell isFiller" aria-hidden="true"></span>');
    }

    // Guarantee a fixed 6-row calendar footprint for stable card layout.
    while (html.length < totalSlots) {
      html.push('<span class="dashboardHeatDayCell isFiller" aria-hidden="true"></span>');
    }

    gridEl.innerHTML = html.join("");
  }

  function getDashboardAvgSessionRows(range: DashboardAvgRange, nowValue: number) {
    const { startMs, endMs } = getDashboardAvgRangeWindow(range, nowValue);
    const taskNameById = new Map<string, string>();
    const filteredTasks = getDashboardFilteredTasks();
    const includedTaskIds = new Set<string>();
    filteredTasks.forEach((task) => {
      const id = String(task.id || "").trim();
      if (!id) return;
      includedTaskIds.add(id);
      taskNameById.set(id, String(task.name || "").trim() || "Task");
    });

    const rows: Array<{ taskId: string; taskName: string; avgMs: number; count: number }> = [];
    Object.keys(historyByTaskId || {}).forEach((taskIdRaw) => {
      const taskId = String(taskIdRaw || "").trim();
      if (!taskId) return;
      if (!includedTaskIds.has(taskId)) return;
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      if (!entries.length) return;
      let sumMs = 0;
      let count = 0;
      entries.forEach((entry: any) => {
        const ts = Number(entry?.ts);
        const ms = Number(entry?.ms);
        if (!Number.isFinite(ts) || !Number.isFinite(ms) || ms <= 0) return;
        if (ts < startMs || ts > endMs) return;
        sumMs += ms;
        count += 1;
      });
      if (count < 1) return;
      const deletedName = String((deletedTaskMeta as any)?.[taskId]?.name || "").trim();
      const taskName = taskNameById.get(taskId) || deletedName || "Task";
      rows.push({
        taskId,
        taskName,
        avgMs: sumMs / count,
        count,
      });
    });

    rows.sort((a, b) => {
      if (b.avgMs !== a.avgMs) return b.avgMs - a.avgMs;
      const nameCmp = a.taskName.localeCompare(b.taskName);
      if (nameCmp !== 0) return nameCmp;
      return a.taskId.localeCompare(b.taskId);
    });
    return rows;
  }

  function truncateDashboardLabel(label: string, maxChars: number) {
    const clean = String(label || "").trim();
    if (clean.length <= maxChars) return clean;
    return `${clean.slice(0, Math.max(1, maxChars - 1))}...`;
  }

  function renderDashboardModeDistribution() {
    const donutEl = els.dashboardModeDonut as HTMLElement | null;
    const centerEl = els.dashboardModeDonutCenter as HTMLElement | null;
    const mode1LabelEl = els.dashboardMode1Label as HTMLElement | null;
    const mode2LabelEl = els.dashboardMode2Label as HTMLElement | null;
    const mode3LabelEl = els.dashboardMode3Label as HTMLElement | null;
    const mode1ValueEl = els.dashboardMode1Value as HTMLElement | null;
    const mode2ValueEl = els.dashboardMode2Value as HTMLElement | null;
    const mode3ValueEl = els.dashboardMode3Value as HTMLElement | null;

    if (mode1LabelEl) mode1LabelEl.textContent = getModeLabel("mode1");
    if (mode2LabelEl) mode2LabelEl.textContent = getModeLabel("mode2");
    if (mode3LabelEl) mode3LabelEl.textContent = getModeLabel("mode3");

    const totalsMs: Record<MainMode, number> = { mode1: 0, mode2: 0, mode3: 0 };
    getDashboardFilteredTasks().forEach((task) => {
      const mode = taskModeOf(task);
      totalsMs[mode] += Math.max(0, getElapsedMs(task));
    });
    const totalMs = totalsMs.mode1 + totalsMs.mode2 + totalsMs.mode3;
    if (shouldHoldDashboardWidget("modeDistribution", totalMs > 0)) return;

    const percentages: Record<MainMode, number> =
      totalMs > 0
        ? {
            mode1: (totalsMs.mode1 / totalMs) * 100,
            mode2: (totalsMs.mode2 / totalMs) * 100,
            mode3: (totalsMs.mode3 / totalMs) * 100,
          }
        : { mode1: 0, mode2: 0, mode3: 0 };

    if (mode1ValueEl) mode1ValueEl.textContent = `${Math.round(percentages.mode1)}%`;
    if (mode2ValueEl) mode2ValueEl.textContent = `${Math.round(percentages.mode2)}%`;
    if (mode3ValueEl) mode3ValueEl.textContent = `${Math.round(percentages.mode3)}%`;

    if (centerEl) {
      const dominantPct = Math.round(Math.max(percentages.mode1, percentages.mode2, percentages.mode3));
      centerEl.textContent = `${dominantPct}%`;
    }

    if (!donutEl) return;
    if (totalMs <= 0) {
      donutEl.style.background =
        "conic-gradient(var(--mode1-accent) 0 33.333%, var(--mode2-accent) 33.333% 66.666%, var(--mode3-accent) 66.666% 100%)";
      return;
    }
    const mode1End = percentages.mode1;
    const mode2End = percentages.mode1 + percentages.mode2;
    donutEl.style.background = `conic-gradient(var(--mode1-accent) 0 ${mode1End}%, var(--mode2-accent) ${mode1End}% ${mode2End}%, var(--mode3-accent) ${mode2End}% 100%)`;
  }

  function renderDashboardAvgSessionChart() {
    const titleEl = els.dashboardAvgSessionTitle as HTMLElement | null;
    const emptyEl = els.dashboardAvgSessionEmpty as HTMLElement | null;
    const canvas = els.dashboardAvgSessionChart;
    const rangeLabelEl = document.getElementById("dashboardAvgRangeMenuLabel") as HTMLElement | null;
    const range = sanitizeDashboardAvgRange(dashboardAvgRange);
    dashboardAvgRange = range;

    if (titleEl) titleEl.textContent = `Avg Session by Task (${dashboardAvgRangeLabel(range)})`;
    if (rangeLabelEl) rangeLabelEl.textContent = dashboardAvgRangeLabel(range);

    if (!canvas) return;
    const wrap = canvas.closest(".historyCanvasWrap") as HTMLElement | null;
    if (!wrap) return;
    const rows = getDashboardAvgSessionRows(range, nowMs());
    if (shouldHoldDashboardWidget("avgSession", rows.length > 0)) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const measuredWidth = Math.floor(rect.width || wrap.clientWidth || canvas.clientWidth || 0);
    const measuredHeight = Math.floor(rect.height || wrap.clientHeight || canvas.clientHeight || 0);
    if (measuredWidth <= 0 || measuredHeight <= 0) return;
    // Match canvas backing size to the rendered size to avoid CSS downscaling blur/skew.
    const width = measuredWidth;
    const height = measuredHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!rows.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const chartTop = 14;
    const chartBottom = height - 56;
    const chartHeight = Math.max(80, chartBottom - chartTop);
    const maxAvgMs = Math.max(...rows.map((row) => row.avgMs), 1);
    const tickCount = 4;
    const tickLabelFont = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.font = tickLabelFont;
    let maxTickLabelWidth = 0;
    for (let i = 1; i <= tickCount; i += 1) {
      const pct = i / tickCount;
      const tickMs = maxAvgMs * pct;
      maxTickLabelWidth = Math.max(maxTickLabelWidth, ctx.measureText(formatDashboardDurationShort(tickMs)).width);
    }
    const chartLeft = 12 + Math.ceil(maxTickLabelWidth) + 10;
    const chartRight = width - 12;
    const chartWidth = Math.max(120, chartRight - chartLeft);
    const barCount = rows.length;
    const gap = barCount > 10 ? 4 : 8;
    const labelMaxChars = width <= 420 ? 8 : 13;
    const labelFont = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.font = labelFont;
    const longestLabelWidth = rows.reduce((maxWidth, row) => {
      const label = truncateDashboardLabel(row.taskName, labelMaxChars);
      return Math.max(maxWidth, ctx.measureText(label).width);
    }, 0);
    const preferredBarWidth = Math.ceil(longestLabelWidth + 10);
    const maxBarWidthByChart = Math.max(8, Math.floor((chartWidth - gap * (barCount - 1)) / Math.max(1, barCount)));
    const barWidth = Math.max(8, Math.min(preferredBarWidth, maxBarWidthByChart));
    const startX = chartLeft;

    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.font = tickLabelFont;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= tickCount; i += 1) {
      const pct = i / tickCount;
      const y = Math.round(chartBottom - chartHeight * pct) + 0.5;
      ctx.globalAlpha = i === 0 ? 0.5 : 0.24;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (i === 0) continue;
      const tickMs = maxAvgMs * pct;
      ctx.fillText(formatDashboardDurationShort(tickMs), chartLeft - 6, y);
    }

    rows.forEach((row, idx) => {
      const ratio = Math.max(0, Math.min(1, row.avgMs / maxAvgMs));
      const x = startX + idx * (barWidth + gap);
      const barHeight = Math.max(2, Math.round(chartHeight * ratio));
      const y = chartBottom - barHeight;
      const rowTask = tasks.find((task) => String(task.id || "") === String(row.taskId));
      const rowStaticColor = rowTask ? getModeColor(taskModeOf(rowTask)) : "rgb(0,207,200)";
      const rowDynamicColor = rowTask ? sessionColorForTaskMs(rowTask as any, row.avgMs) : rowStaticColor;
      ctx.fillStyle = dynamicColorsEnabled ? rowDynamicColor : rowStaticColor;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.globalAlpha = 1;

      const label = truncateDashboardLabel(row.taskName, labelMaxChars);
      ctx.save();
      ctx.translate(x + barWidth / 2, chartBottom + 10);
      ctx.rotate((-42 * Math.PI) / 180);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.font = labelFont;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });
  }

  function renderHistory(taskId: string) {
    historyInlineApi?.renderHistory(taskId);
  }

  function closeEdit(saveChanges: boolean) {
    closeEditApi(saveChanges);
  }

  function isEditElapsedOverrideEnabled() {
    return !!els.editOverrideElapsedToggle?.classList.contains("on");
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    openElapsedPadForMilestoneApi(task, milestone, ms, onApplied);
  }

  function closeElapsedPad(applyValue: boolean) {
    closeElapsedPadApi(applyValue);
  }

  function deleteTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    const clearDeleteTaskConfirmState = () => {
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isDeleteTaskConfirm");
    };
    const safeTaskName = escapeHtmlUI(t.name || "this task");
    confirm("Delete Task", "", {
      okLabel: "Delete",
      cancelLabel: "Cancel",
      checkboxLabel: "Delete history logs",
      checkboxChecked: true,
      textHtml: `<span class="confirmDanger">Delete "${safeTaskName}"?</span>`,
      onOk: () => {
        clearDeleteTaskConfirmState();
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

        const deletedTaskId = String(t.id || "");
        save({ deletedTaskIds: deletedTaskId ? [deletedTaskId] : [] });
        void deleteSharedTaskSummariesForTask(String(currentUid() || ""), deletedTaskId).catch(() => {});
        void refreshOwnSharedSummaries().catch(() => {});
        render();
        closeConfirm();
      },
      onCancel: () => {
        clearDeleteTaskConfirmState();
        closeConfirm();
      },
    });
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isDeleteTaskConfirm");
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
    const closingFocusTaskId = String(focusModeTaskId || "").trim();
    flushPendingFocusSessionNoteSave(closingFocusTaskId);
    if (closingFocusTaskId && els.focusSessionNotesInput) {
      setFocusSessionDraft(closingFocusTaskId, String(els.focusSessionNotesInput.value || ""));
    }
    focusModeTaskId = null;
    focusModeTaskName = "";
    focusShowCheckpoints = true;
    if (focusSessionNoteSaveTimer != null) {
      window.clearTimeout(focusSessionNoteSaveTimer);
      focusSessionNoteSaveTimer = null;
    }
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "none";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    if (els.focusTaskName) els.focusTaskName.textContent = "Task";
    if (els.focusTimerDays) els.focusTimerDays.textContent = "00d";
    syncFocusSessionNotesInput(null);
    syncFocusSessionNotesAccordion(null);
    if (els.focusTimerClock) els.focusTimerClock.textContent = "00:00:00";
    if (els.focusDialHint) els.focusDialHint.textContent = "Tap to Launch";
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
      els.focusInsightWeekday.textContent = "No logged sessions yet";
      els.focusInsightWeekday.classList.add("is-empty");
    }
    setFocusInsightDeltaValue(els.focusInsightTodayDelta as HTMLElement | null, Number.NaN);
    setFocusInsightDeltaValue(els.focusInsightWeekDelta as HTMLElement | null, Number.NaN);
    render();
    openDeferredFocusModeTimeGoalModal();
  }

  function openDeferredFocusModeTimeGoalModal() {
    if (!deferredFocusModeTimeGoalModals.length) return;
    const nextPending = deferredFocusModeTimeGoalModals.shift() || null;
    if (!nextPending) return;
    const task = tasks.find((row) => String(row.id || "").trim() === nextPending.taskId);
    if (!task || !task.timeGoalEnabled || !(Number(task.timeGoalMinutes || 0) > 0)) {
      openDeferredFocusModeTimeGoalModal();
      return;
    }
    openTimeGoalCompleteModal(task, nextPending.frozenElapsedMs || getTaskElapsedMs(task), { reminder: nextPending.reminder });
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
            <div class="focusCheckpointLogItemLine">
              <span class="focusCheckpointLogItemTime">${escapeHtmlUI(timeText)}</span>${desc ? `<span class="focusCheckpointLogItemSep"> - </span><span class="focusCheckpointLogItemDesc">${escapeHtmlUI(desc)}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
    emptyEl.style.display = "none";
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

  function checkpointKeyForTask(m: { hours: number; description: string }, t: Task) {
    const unitSeconds = milestoneUnitSec(t);
    const targetSec = Math.max(0, Math.round((+m.hours || 0) * unitSeconds));
    const label = String(m.description || "").trim();
    return `${targetSec}|${label}`;
  }

  function getCheckpointFiredSet(taskId: string) {
    if (!checkpointFiredKeysByTaskId[taskId]) checkpointFiredKeysByTaskId[taskId] = new Set<string>();
    return checkpointFiredKeysByTaskId[taskId];
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
    if (!runtime.destroyed) render();
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
    if (!runtime.destroyed) render();
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
    if (!runtime.destroyed) render();
    if (checkpointToastQueue.length) {
      window.setTimeout(showNextCheckpointToast, 50);
    }
  }

  function syncEditCheckpointAlertUi(t: Task) {
    ensureMilestoneIdentity(t);
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    const checkpointingEnabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    els.editCheckpointAlertsGroup?.classList.toggle("isHidden", !timeGoalEnabled || !checkpointingEnabled);
    if (els.editPresetIntervalsToggle) {
      toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, checkpointingEnabled && !!t.presetIntervalsEnabled);
    }
    if (els.editPresetIntervalInput) {
      const nextValue = getPresetIntervalValueNum(t);
      if (els.editPresetIntervalInput.value !== String(nextValue)) els.editPresetIntervalInput.value = String(nextValue);
      els.editPresetIntervalInput.disabled = !checkpointingEnabled || !t.presetIntervalsEnabled;
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled);
    els.editPresetIntervalField?.classList.toggle("isHidden", !checkpointingEnabled || !t.presetIntervalsEnabled);
    if (els.editPresetIntervalNote) {
      const intervalInvalid = checkpointingEnabled && !!t.presetIntervalsEnabled && !hasValidPresetInterval(t);
      if (intervalInvalid) {
        (els.editPresetIntervalNote as HTMLElement).style.display = "block";
        els.editPresetIntervalNote.textContent = "Enter a preset interval greater than 0 to add checkpoints.";
      } else {
        (els.editPresetIntervalNote as HTMLElement).style.display = "none";
        els.editPresetIntervalNote.textContent = "";
      }
    }
    toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, checkpointingEnabled && !!t.checkpointSoundEnabled);
    toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, checkpointingEnabled && !!t.checkpointToastEnabled);
    els.editCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled || !checkpointAlertSoundEnabled);
    els.editCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled || !checkpointAlertToastEnabled);
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.value = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.value = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
    }
    els.editCheckpointSoundModeField?.classList.toggle(
      "isHidden",
      !checkpointingEnabled || !checkpointAlertSoundEnabled || !t.checkpointSoundEnabled
    );
    els.editCheckpointToastModeField?.classList.toggle(
      "isHidden",
      !checkpointingEnabled || !checkpointAlertToastEnabled || !t.checkpointToastEnabled
    );
    els.editTimerSettingsGroup?.classList.toggle("isHidden", !timeGoalEnabled || !hasActiveTimeGoal);
    if (els.editFinalCheckpointActionSelect) {
      els.editFinalCheckpointActionSelect.value =
        t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
          ? t.timeGoalAction
          : t.finalCheckpointAction === "resetLog" ||
              t.finalCheckpointAction === "resetNoLog" ||
              t.finalCheckpointAction === "confirmModal"
            ? t.finalCheckpointAction
            : "continue";
    }
    const notes: string[] = [];
    if (!timeGoalEnabled || !hasActiveTimeGoal) notes.push("set a time goal to enable checkpoints");
    if (!checkpointAlertSoundEnabled) notes.push("sound alerts are disabled globally");
    if (!checkpointAlertToastEnabled) notes.push("toast alerts are disabled globally");
    if (els.editCheckpointAlertsNote) {
      if (notes.length) {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "block";
        els.editCheckpointAlertsNote.textContent = !timeGoalEnabled || !hasActiveTimeGoal
          ? "Set a time goal to enable Time Checkpoints and related alerts."
          : "Sound and toast notifications can be enabled via Settings > Notifications";
      } else {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "none";
        els.editCheckpointAlertsNote.textContent = "";
      }
    }
  }

  function syncEditMilestoneSectionUi(t: Task) {
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    const enabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    els.msToggle?.classList.toggle("on", enabled);
    els.msToggle?.setAttribute("aria-checked", String(enabled));
    els.msArea?.classList.toggle("on", enabled);
    els.msArea?.classList.toggle("isHidden", !timeGoalEnabled);
    els.msArea?.classList.toggle("isDisabled", !enabled);
    if (els.msArea && "open" in (els.msArea as any)) {
      (els.msArea as HTMLDetailsElement).open = enabled;
    }
    const summary = els.msArea?.querySelector?.("summary") as HTMLElement | null;
    if (summary) {
      summary.classList.toggle("isDisabled", !enabled);
      summary.setAttribute("aria-disabled", !enabled ? "true" : "false");
      summary.tabIndex = enabled ? 0 : -1;
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isHidden", !enabled);
    els.editPresetIntervalField?.classList.toggle("isHidden", !enabled || !t.presetIntervalsEnabled);
    els.editPresetIntervalNote?.classList.toggle("isHidden", !enabled);
    els.msList?.parentElement?.classList.toggle("isHidden", !enabled);
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
      timeGoalEnabled: isEditTimeGoalEnabled(),
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: editTaskDurationUnit,
      timeGoalPeriod: editTaskDurationPeriod,
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
      milestoneTimeUnit: task.milestoneTimeUnit === "day" ? "day" : task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestonesEnabled: !!task.milestonesEnabled,
      milestones,
      overrideElapsedEnabled: !!elapsedDraft,
      elapsedDraft,
      checkpointSoundEnabled: !!isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null),
      checkpointSoundMode: els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null),
      checkpointToastMode: els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s",
      timeGoalAction:
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue",
      presetIntervalsEnabled: !!isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null),
      presetIntervalValue: Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0),
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
      presetIntervalNextSeq: getPresetIntervalNextSeqNum(task),
    });
  }

  function syncEditSaveAvailability(t?: Task | null) {
    const task = t || getCurrentEditTask();
    if (!els.saveEditBtn) return;
    clearEditValidationState();
    if (!task) {
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.title = "";
      return;
    }
    const invalidTimeGoal = !validateEditTimeGoal();
    const checkpointingActive = !!task.milestonesEnabled && editTaskHasActiveTimeGoal();
    const noCheckpoints = checkpointingActive && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const invalidCheckpointTimes =
      checkpointingActive &&
      (hasNonPositiveCheckpoint(task.milestones) ||
        hasCheckpointAtOrAboveTimeGoal(task.milestones, milestoneUnitSec(task), getEditTaskTimeGoalMinutes()));
    const invalidPresetInterval = checkpointingActive && !!task.presetIntervalsEnabled && !hasValidPresetInterval(task);
    const blocked = invalidTimeGoal || noCheckpoints || invalidCheckpointTimes || invalidPresetInterval;
    els.saveEditBtn.disabled = blocked;
    els.saveEditBtn.title = blocked ? "Resolve validation issues before saving" : "Save Changes";
    if (!blocked) return;
    applyEditCheckpointValidationHighlights(task);
  }

  function maybeToggleEditPresetIntervals(nextEnabled: boolean) {
    const t = getCurrentEditTask();
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
    t.presetIntervalsEnabled = true;
    syncEditCheckpointAlertUi(t);
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

  function setWorkingIndicatorVisible(isOn: boolean, message?: string) {
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    const textEl = els.historySaveWorkingText as HTMLElement | null;
    if (textEl && typeof message === "string" && message.trim()) {
      textEl.textContent = message.trim();
    } else if (textEl && !isOn) {
      textEl.textContent = "";
    }
    if (!indicatorEl) return;
    indicatorEl.classList.toggle("isOn", !!isOn);
    indicatorEl.setAttribute("aria-hidden", isOn ? "false" : "true");
  }

  function getWorkingIndicatorBusyTargets() {
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    const seen = new Set<HTMLElement>();
    return [
      els.appRoot as HTMLElement | null,
      els.friendRequestModal as HTMLElement | null,
      els.friendProfileModal as HTMLElement | null,
      els.confirmOverlay as HTMLElement | null,
    ].filter((node): node is HTMLElement => {
      if (!node || node === indicatorEl || seen.has(node)) return false;
      seen.add(node);
      return true;
    });
  }

  function activateWorkingIndicatorOverlay() {
    if (workingIndicatorOverlayActive) return;
    workingIndicatorOverlayActive = true;
    workingIndicatorRestoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    getWorkingIndicatorBusyTargets().forEach((node) => {
      node.setAttribute("data-groups-busy-prev-inert", node.hasAttribute("inert") ? "true" : "false");
      node.setAttribute("data-groups-busy-prev-aria-hidden", node.getAttribute("aria-hidden") ?? "");
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    try {
      indicatorEl?.focus({ preventScroll: true });
    } catch {
      indicatorEl?.focus();
    }
  }

  function deactivateWorkingIndicatorOverlay() {
    if (!workingIndicatorOverlayActive) return;
    workingIndicatorOverlayActive = false;
    getWorkingIndicatorBusyTargets().forEach((node) => {
      const prevInert = node.getAttribute("data-groups-busy-prev-inert");
      const prevAriaHidden = node.getAttribute("data-groups-busy-prev-aria-hidden");
      node.removeAttribute("data-groups-busy-prev-inert");
      node.removeAttribute("data-groups-busy-prev-aria-hidden");
      if (prevInert === "true") node.setAttribute("inert", "");
      else node.removeAttribute("inert");
      if (prevAriaHidden) node.setAttribute("aria-hidden", prevAriaHidden);
      else node.removeAttribute("aria-hidden");
    });
    const restoreEl = workingIndicatorRestoreFocusEl;
    workingIndicatorRestoreFocusEl = null;
    if (restoreEl && restoreEl.isConnected) {
      try {
        restoreEl.focus({ preventScroll: true });
      } catch {
        restoreEl.focus();
      }
    }
  }

  function showWorkingIndicator(message: string) {
    const normalizedMessage = String(message || "").trim() || "Working...";
    const key = ++workingIndicatorKeySeq;
    workingIndicatorStack.push({ key, message: normalizedMessage });
    if (workingIndicatorStack.length === 1) activateWorkingIndicatorOverlay();
    setWorkingIndicatorVisible(true, normalizedMessage);
    return key;
  }

  function hideWorkingIndicator(key?: number) {
    if (typeof key === "number") {
      const index = workingIndicatorStack.findIndex((entry) => entry.key === key);
      if (index >= 0) workingIndicatorStack.splice(index, 1);
    } else {
      workingIndicatorStack.pop();
    }
    const current = workingIndicatorStack[workingIndicatorStack.length - 1] || null;
    if (!current) deactivateWorkingIndicatorOverlay();
    setWorkingIndicatorVisible(!!current, current?.message);
  }

  function openTaskExportModal(i: number) {
    const t = tasks[i];
    if (!t || !els.exportTaskOverlay) return;
    exportTaskIndex = i;
    const taskId = String(t.id || "");
    const hasHistoryEntries = taskId ? Array.isArray(historyByTaskId?.[taskId]) && (historyByTaskId[taskId] || []).length > 0 : false;
    if (els.exportTaskTitle) {
      const taskName = String(t.name || "Task").trim() || "Task";
      els.exportTaskTitle.textContent = `Export ${taskName}`;
    }
    if (els.exportTaskIncludeHistory) {
      els.exportTaskIncludeHistory.checked = false;
      els.exportTaskIncludeHistory.disabled = !hasHistoryEntries;
    }
    if (els.exportTaskIncludeHistoryLabel) {
      els.exportTaskIncludeHistoryLabel.textContent = hasHistoryEntries ? "Include history entries" : "No history entries to export";
    }
    if (els.exportTaskIncludeHistoryRow) {
      els.exportTaskIncludeHistoryRow.classList.toggle("is-disabled", !hasHistoryEntries);
    }
    openOverlay(els.exportTaskOverlay as HTMLElement | null);
  }

  function closeTaskExportModal() {
    exportTaskIndex = null;
    if (els.exportTaskTitle) els.exportTaskTitle.textContent = "Export Task";
    if (els.exportTaskIncludeHistory) {
      els.exportTaskIncludeHistory.checked = false;
      els.exportTaskIncludeHistory.disabled = false;
    }
    if (els.exportTaskIncludeHistoryLabel) {
      els.exportTaskIncludeHistoryLabel.textContent = "Include history entries";
    }
    if (els.exportTaskIncludeHistoryRow) {
      els.exportTaskIncludeHistoryRow.classList.remove("is-disabled");
    }
    closeOverlay(els.exportTaskOverlay as HTMLElement | null);
  }

  function submitTaskExportModal() {
    if (exportTaskIndex == null) return;
    const includeHistory = !!els.exportTaskIncludeHistory?.checked;
    exportTask(exportTaskIndex, { includeHistory });
    closeTaskExportModal();
  }

  function isTaskSharedByOwner(taskId: string): boolean {
    const uid = currentUid();
    if (!uid || !taskId) return false;
    return ownSharedSummaries.some((row) => row.ownerUid === uid && row.taskId === taskId);
  }

  function applyMainMode(mode: MainMode) {
    if (!isModeEnabled(mode)) mode = "mode1";
    currentMode = mode;
    applyModeAccent(mode);
    document.body.setAttribute("data-main-mode", mode);
    if (els.modeSwitchCurrentLabel) els.modeSwitchCurrentLabel.textContent = getModeLabel(mode);
    els.mode1Btn?.classList.toggle("isOn", mode === "mode1");
    els.mode2Btn?.classList.toggle("isOn", mode === "mode2");
    els.mode3Btn?.classList.toggle("isOn", mode === "mode3");
    els.mode1Btn?.setAttribute("aria-checked", String(mode === "mode1"));
    els.mode2Btn?.setAttribute("aria-checked", String(mode === "mode2"));
    els.mode3Btn?.setAttribute("aria-checked", String(mode === "mode3"));
    if (els.modeSwitch && "open" in (els.modeSwitch as HTMLDetailsElement)) {
      (els.modeSwitch as HTMLDetailsElement).open = false;
    }
    els.mode1View?.classList.toggle("modeViewOn", true);
    els.mode2View?.classList.toggle("modeViewOn", mode === "mode2");
    els.mode3View?.classList.toggle("modeViewOn", mode === "mode3");
    render();
  }

  function deleteTasksInMode(mode: MainMode) {
    const deletedTaskIds = (tasks || [])
      .filter((t) => taskModeOf(t) === mode)
      .map((t) => String(t.id || ""))
      .filter(Boolean);
    tasks = (tasks || []).filter((t) => taskModeOf(t) !== mode);
    save({ deletedTaskIds });
    render();
  }

  const historyManager = createTaskTimerHistoryManager({
    els,
    on,
    runtime,
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (value) => {
      historyByTaskId = value;
    },
    getDeletedTaskMeta: () => deletedTaskMeta,
    setDeletedTaskMeta: (value) => {
      deletedTaskMeta = value;
    },
    getHmExpandedTaskGroups: () => hmExpandedTaskGroups,
    setHmExpandedTaskGroups: (value) => {
      hmExpandedTaskGroups = value;
    },
    getHmExpandedDateGroups: () => hmExpandedDateGroups,
    setHmExpandedDateGroups: (value) => {
      hmExpandedDateGroups = value;
    },
    getHmSortKey: () => hmSortKey,
    setHmSortKey: (value) => {
      hmSortKey = value;
    },
    getHmSortDir: () => hmSortDir,
    setHmSortDir: (value) => {
      hmSortDir = value;
    },
    getHmBulkEditMode: () => hmBulkEditMode,
    setHmBulkEditMode: (value) => {
      hmBulkEditMode = value;
    },
    getHmBulkSelectedRows: () => hmBulkSelectedRows,
    setHmBulkSelectedRows: (value) => {
      hmBulkSelectedRows = value;
    },
    getHmRowsByTask: () => hmRowsByTask,
    setHmRowsByTask: (value) => {
      hmRowsByTask = value;
    },
    getHmRowsByTaskDate: () => hmRowsByTaskDate,
    setHmRowsByTaskDate: (value) => {
      hmRowsByTaskDate = value;
    },
    getHistoryManagerRefreshInFlight: () => historyManagerRefreshInFlight,
    setHistoryManagerRefreshInFlight: (value) => {
      historyManagerRefreshInFlight = value;
    },
    isArchitectUser,
    getHistoryEntryNote,
    csvEscape,
    parseCsvRows,
    downloadCsvFile,
    formatTwo,
    formatDateTime,
    sortMilestones,
    sessionColorForTaskMs,
    saveHistory,
    saveHistoryAndWait,
    loadHistory,
    refreshHistoryFromCloud,
    saveDeletedMeta,
    loadDeletedMeta,
    load,
    render,
    navigateToAppRoute,
    confirm,
    closeConfirm,
    escapeHtmlUI,
    syncSharedTaskSummariesForTasks,
    syncSharedTaskSummariesForTask,
  });
  const {
    openHistoryManager,
    registerHistoryManagerEvents,
  } = historyManager;

  const historyInline = createTaskTimerHistoryInline({
    els,
    on,
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (value) => {
      historyByTaskId = value;
    },
    getHistoryRangeDaysByTaskId: () => historyRangeDaysByTaskId,
    getHistoryRangeModeByTaskId: () => historyRangeModeByTaskId,
    getHistoryViewByTaskId: () => historyViewByTaskId,
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    getCurrentAppPage: () => currentAppPage,
    getPinnedHistoryTaskIds: () => pinnedHistoryTaskIds,
    setPinnedHistoryTaskIds: (value) => {
      pinnedHistoryTaskIds = value;
    },
    savePinnedHistoryTaskIds,
    getHistoryEntryNoteAnchorTaskId: () => historyEntryNoteAnchorTaskId,
    setHistoryEntryNoteAnchorTaskId: (value) => {
      historyEntryNoteAnchorTaskId = value;
    },
    persistTaskUiToCloud,
    saveHistory,
    confirm,
    closeConfirm,
    navigateToAppRoute,
    openOverlay,
    closeOverlay,
    render,
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    nowMs,
    normalizeHistoryTimestampMs,
    formatTime,
    formatTwo,
    formatDateTime,
    escapeHtmlUI,
    sortMilestones,
    sessionColorForTaskMs,
    getModeColor: (mode) => DEFAULT_MODE_COLORS[mode] || DEFAULT_MODE_COLORS.mode1,
    taskModeOf: (task) => (task ? taskModeOf(task) : "mode1"),
    milestoneUnitSec,
    milestoneUnitSuffix,
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
  });
  historyInlineApi = historyInline;
  const { registerHistoryInlineEvents } = historyInline;

  const preferences = createTaskTimerPreferences({
    els,
    on,
    storageKeys: {
      THEME_KEY,
      TASK_VIEW_KEY,
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      MENU_BUTTON_STYLE_KEY,
      MODE_SETTINGS_KEY,
      DEFAULT_TASK_TIMER_FORMAT_KEY,
    },
    defaultModeLabels: DEFAULT_MODE_LABELS,
    defaultModeEnabled: DEFAULT_MODE_ENABLED,
    defaultModeColors: DEFAULT_MODE_COLORS,
    getThemeMode: () => themeMode,
    setThemeModeState: (value) => {
      themeMode = value;
    },
    getTaskView: () => taskView,
    setTaskViewState: (value) => {
      taskView = value;
    },
    getMenuButtonStyle: () => menuButtonStyle,
    setMenuButtonStyleState: (value) => {
      menuButtonStyle = value;
    },
    getDefaultTaskTimerFormat: () => defaultTaskTimerFormat,
    setDefaultTaskTimerFormatState: (value) => {
      defaultTaskTimerFormat = value;
    },
    getAutoFocusOnTaskLaunchEnabled: () => autoFocusOnTaskLaunchEnabled,
    setAutoFocusOnTaskLaunchEnabledState: (value) => {
      autoFocusOnTaskLaunchEnabled = value;
    },
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    setDynamicColorsEnabledState: (value) => {
      dynamicColorsEnabled = value;
    },
    getCheckpointAlertSoundEnabled: () => checkpointAlertSoundEnabled,
    setCheckpointAlertSoundEnabledState: (value) => {
      checkpointAlertSoundEnabled = value;
    },
    getCheckpointAlertToastEnabled: () => checkpointAlertToastEnabled,
    setCheckpointAlertToastEnabledState: (value) => {
      checkpointAlertToastEnabled = value;
    },
    getModeLabels: () => modeLabels,
    setModeLabelsState: (value) => {
      modeLabels = value;
    },
    getModeEnabled: () => modeEnabled,
    setModeEnabledState: (value) => {
      modeEnabled = value;
    },
    getCurrentMode: () => currentMode,
    getEditMoveTargetMode: () => editMoveTargetMode,
    setEditMoveTargetModeState: (value) => {
      editMoveTargetMode = value;
    },
    persistPreferencesToCloud,
    loadCachedPreferences,
    loadCachedTaskUi,
    getCloudPreferencesCache: () => cloudPreferencesCache,
    saveDashboardWidgetState: saveDashboardWidgetStateApi,
    getDashboardCardSizeMapForStorage: getDashboardCardSizeMapForStorageApi,
    getDashboardAvgRange: getDashboardAvgRangeApi,
    getCurrentEditTask,
    syncEditCheckpointAlertUi,
    applyMainMode,
    clearTaskFlipStates,
    render,
    renderDashboardPanelMenu: () => renderDashboardPanelMenuApi(),
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    ensureDashboardIncludedModesValid: () => ensureDashboardIncludedModesValidApi(),
    closeOverlay,
    closeConfirm,
    confirm,
    deleteTasksInMode,
    escapeHtmlUI,
    stopCheckpointRepeatAlert,
    getCurrentAppPage: () => currentAppPage,
  });
  const {
    sanitizeModeLabel,
    getModeLabel,
    getModeColor,
    applyModeAccent,
    isModeEnabled,
    syncModeLabelsUi,
    saveModeSettings,
    loadModeLabels,
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
    registerPreferenceEvents,
  } = preferences;

  editTaskApi = createTaskTimerEditTask({
    els,
    on,
    getTasks: () => tasks,
    getEditIndex: () => editIndex,
    setEditIndex: (value) => {
      editIndex = value;
    },
    getEditTaskDraft: () => editTaskDraft,
    setEditTaskDraft: (value) => {
      editTaskDraft = value;
    },
    setEditDraftSnapshot: (value) => {
      editDraftSnapshot = value;
    },
    getEditTaskDurationUnit: () => editTaskDurationUnit,
    setEditTaskDurationUnit: (value) => {
      editTaskDurationUnit = value;
    },
    getEditTaskDurationPeriod: () => editTaskDurationPeriod,
    setEditTaskDurationPeriod: (value) => {
      editTaskDurationPeriod = value;
    },
    getEditMoveTargetMode: () => editMoveTargetMode,
    setEditMoveTargetMode: (value) => {
      editMoveTargetMode = value;
    },
    getElapsedPadTarget: () => elapsedPadTarget,
    setElapsedPadTarget: (value) => {
      elapsedPadTarget = value;
    },
    getElapsedPadMilestoneRef: () => elapsedPadMilestoneRef,
    setElapsedPadMilestoneRef: (value) => {
      elapsedPadMilestoneRef = value;
    },
    getElapsedPadDraft: () => elapsedPadDraft,
    setElapsedPadDraft: (value) => {
      elapsedPadDraft = value;
    },
    getElapsedPadOriginal: () => elapsedPadOriginal,
    setElapsedPadOriginal: (value) => {
      elapsedPadOriginal = value;
    },
    getCheckpointAlertSoundEnabled: () => checkpointAlertSoundEnabled,
    getCheckpointAlertToastEnabled: () => checkpointAlertToastEnabled,
    getElapsedMs,
    render,
    save,
    confirm,
    closeConfirm,
    cloneTaskForEdit,
    getModeLabel,
    isModeEnabled,
    taskModeOf: (task) => (task ? taskModeOf(task) : "mode1"),
    setEditTimeGoalEnabled,
    isEditTimeGoalEnabled,
    editTaskHasActiveTimeGoal,
    syncEditTaskTimeGoalUi,
    syncEditCheckpointAlertUi,
    syncEditSaveAvailability,
    syncEditMilestoneSectionUi,
    setMilestoneUnitUi,
    renderMilestoneEditor,
    clearEditValidationState,
    validateEditTimeGoal,
    showEditValidationError,
    hasNonPositiveCheckpoint,
    hasCheckpointAtOrAboveTimeGoal,
    isCheckpointAtOrAboveTimeGoal,
    milestoneUnitSec,
    formatCheckpointTimeGoalText,
    getEditTaskTimeGoalMinutes,
    getEditTaskTimeGoalMinutesFor,
    getAddTaskTimeGoalMinutesState: () => addTaskApi?.getAddTaskTimeGoalMinutes() ?? 0,
    ensureMilestoneIdentity,
    sortMilestones,
    toggleSwitchElement,
    isSwitchOn,
    buildEditDraftSnapshot,
    syncEditTaskDurationReadout,
    maybeToggleEditPresetIntervals,
    hasValidPresetInterval,
    addMilestoneWithCurrentPreset,
    getPresetIntervalNextSeqNum,
    isEditMilestoneUnitDay,
    createId: () => cryptoRandomId(),
    resetCheckpointAlertTracking: (taskId) => sessionApi?.resetCheckpointAlertTracking(taskId),
    clearCheckpointBaseline: (taskId) => sessionApi?.clearCheckpointBaseline(taskId),
    syncSharedTaskSummariesForTask,
  });
  const {
    closeEdit: closeEditApi,
    openElapsedPadForMilestone: openElapsedPadForMilestoneApi,
    closeElapsedPad: closeElapsedPadApi,
    registerEditTaskEvents,
  } = editTaskApi;

  persistenceApi = createTaskTimerPersistence({
    focusSessionNotesKey: FOCUS_SESSION_NOTES_KEY,
    pendingTaskJumpKey: PENDING_PUSH_TASK_ID_KEY,
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (value) => {
      historyByTaskId = value;
    },
    getHistoryRangeDaysByTaskId: () => historyRangeDaysByTaskId,
    setHistoryRangeDaysByTaskId: (value) => {
      historyRangeDaysByTaskId = value;
    },
    getHistoryRangeModeByTaskId: () => historyRangeModeByTaskId,
    setHistoryRangeModeByTaskId: (value) => {
      historyRangeModeByTaskId = value;
    },
    getFocusSessionNotesByTaskId: () => focusSessionNotesByTaskId,
    setFocusSessionNotesByTaskId: (value) => {
      focusSessionNotesByTaskId = value;
    },
    getPendingTaskJumpMemory: () => pendingTaskJumpMemory,
    setPendingTaskJumpMemory: (value) => {
      pendingTaskJumpMemory = value;
    },
    getRuntimeDestroyed: () => runtime.destroyed,
    getCurrentUid: () => currentUid(),
    getFocusModeTaskId: () => focusModeTaskId,
    getFocusSessionNoteSaveTimer: () => focusSessionNoteSaveTimer,
    setFocusSessionNoteSaveTimer: (value) => {
      focusSessionNoteSaveTimer = value;
    },
    getFocusSessionNotesInputValue: () => String(els.focusSessionNotesInput?.value || ""),
    setFocusSessionNotesInputValue: (value) => {
      if (els.focusSessionNotesInput) els.focusSessionNotesInput.value = value;
    },
    setFocusSessionNotesSectionOpen: (open) => {
      if (els.focusSessionNotesSection) els.focusSessionNotesSection.open = open;
    },
    getCurrentAppPage: () => currentAppPage,
    getInitialAppPageFromLocation,
    initialAppPage,
    getCloudTaskUiCache: () => cloudTaskUiCache,
    loadCachedTaskUi,
    loadDeletedMeta,
    setDeletedTaskMeta: (value) => {
      deletedTaskMeta = value;
    },
    primeDashboardCacheFromShadow,
    loadFocusSessionNotes: () => loadFocusSessionNotesApi(),
    loadAddTaskCustomNames: () => loadAddTaskCustomNamesApi(),
    loadDefaultTaskTimerFormat,
    loadTaskViewPreference,
    loadAutoFocusOnTaskLaunchSetting,
    loadDynamicColorsSetting,
    loadCheckpointAlertSettings,
    loadDashboardWidgetState: () => loadDashboardWidgetStateApi(),
    loadThemePreference,
    loadMenuButtonStylePreference,
    syncTaskSettingsUi,
    loadPinnedHistoryTaskIds,
    loadModeLabels,
    backfillHistoryColorsFromSessionLogic,
    syncModeLabelsUi,
    applyMainMode,
    applyAppPage,
    applyDashboardOrderFromStorage: () => applyDashboardOrderFromStorageApi(),
    applyDashboardCardSizes: () => applyDashboardCardSizesApi(),
    renderDashboardPanelMenu: () => renderDashboardPanelMenuApi(),
    applyDashboardCardVisibility: () => applyDashboardCardVisibilityApi(),
    applyDashboardEditMode: () => applyDashboardEditModeApi(),
    renderDashboardWidgets: () => renderDashboardWidgetsApi(),
    maybeRepairHistoryNotesInCloudAfterHydrate: () => {
      if (historyNoteCloudRepairAttempted) return;
      historyNoteCloudRepairAttempted = true;
      saveHistory(historyByTaskId, { showIndicator: false });
    },
    taskModeOf,
    jumpToTaskById,
    maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
    normalizeLoadedTask,
  });

  cloudSyncApi = createTaskTimerCloudSync({
    runtime,
    on,
    nowMs,
    getCapAppPlugin,
    cloudRefreshInFlight: createTaskTimerStateAccessor(
      () => cloudRefreshInFlight,
      (value) => {
        cloudRefreshInFlight = value;
      }
    ),
    lastCloudRefreshAtMs: createTaskTimerStateAccessor(
      () => lastCloudRefreshAtMs,
      (value) => {
        lastCloudRefreshAtMs = value;
      }
    ),
    pendingDeferredCloudRefresh: createTaskTimerStateAccessor(
      () => pendingDeferredCloudRefresh,
      (value) => {
        pendingDeferredCloudRefresh = value;
      }
    ),
    deferredCloudRefreshTimer: createTaskTimerStateAccessor(
      () => deferredCloudRefreshTimer,
      (value) => {
        deferredCloudRefreshTimer = value;
      }
    ),
    lastUiInteractionAtMs: createTaskTimerStateAccessor(
      () => lastUiInteractionAtMs,
      (value) => {
        lastUiInteractionAtMs = value;
      }
    ),
    hydrateUiStateFromCaches,
    syncTimeGoalModalWithTaskState: () => syncTimeGoalModalWithTaskStateApi(),
    render,
    maybeHandlePendingTaskJump,
    maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
    currentUid: () => currentUid(),
  });

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
      if (runtime.newTaskHighlightTimer != null) window.clearTimeout(runtime.newTaskHighlightTimer);
      runtime.newTaskHighlightTimer = window.setTimeout(() => {
        taskEl?.classList.remove("isNewTaskGlow");
        runtime.newTaskHighlightTimer = null;
      }, 3000);
    }, 0);
  }

  function wireEvents() {
    const persistInlineTaskSettingsImmediate = () => {
      saveDefaultTaskTimerFormat();
      saveTaskViewPreference();
      saveAutoFocusOnTaskLaunchSetting();
      saveDynamicColorsSetting();
      saveCheckpointAlertSettings();
      render();
    };
    const applyAndPersistModeSettingsImmediate = (opts?: { closeOverlay?: boolean }) => {
      modeLabels.mode1 = sanitizeModeLabel(els.categoryMode1Input?.value, DEFAULT_MODE_LABELS.mode1);
      modeLabels.mode2 = sanitizeModeLabel(els.categoryMode2Input?.value, DEFAULT_MODE_LABELS.mode2);
      modeLabels.mode3 = sanitizeModeLabel(els.categoryMode3Input?.value, DEFAULT_MODE_LABELS.mode3);
      modeEnabled.mode1 = true;
      saveModeSettings();
      syncModeLabelsUi();
      saveDashboardWidgetStateApi({
        cardSizes: getDashboardCardSizeMapForStorageApi(),
        avgSessionByTaskRange: getDashboardAvgRangeApi(),
      });
      if (!isModeEnabled(currentMode)) applyMainMode("mode1");
      else applyModeAccent(currentMode);
      if (!isModeEnabled(editMoveTargetMode)) editMoveTargetMode = "mode1";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
      if (opts?.closeOverlay) closeOverlay(els.categoryManagerOverlay as HTMLElement | null);
      else render();
    };
    const setEditPresetIntervalsInfoOpen = (open: boolean) => {
      const dialog = els.editPresetIntervalsInfoDialog as HTMLElement | null;
      dialog?.classList.toggle("isOpen", open);
      if (els.editPresetIntervalsInfoBtn) {
        els.editPresetIntervalsInfoBtn.setAttribute("aria-expanded", String(open));
      }
    };
    on(els.editPresetIntervalsInfoBtn, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.editPresetIntervalsInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setEditPresetIntervalsInfoOpen(!isOpen);
    });
    on(document as any, "click", (e: any) => {
      const target = e?.target as HTMLElement | null;
      if (target?.closest?.("#editPresetIntervalsInfoBtn")) return;
      if (target?.closest?.("#editPresetIntervalsInfoDialog")) return;
      setEditPresetIntervalsInfoOpen(false);
    });
    on(els.mode1Btn, "click", () => applyMainMode("mode1"));
    on(els.mode2Btn, "click", () => applyMainMode("mode2"));
    on(els.mode3Btn, "click", () => applyMainMode("mode3"));
    on(document as any, "click", (e: any) => {
      const target = e?.target as HTMLElement | null;
      const modeSwitch = els.modeSwitch as HTMLDetailsElement | null;
      if (!target || !modeSwitch) return;
      if (!target.closest?.("#modeSwitch")) modeSwitch.open = false;
    });
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
    on(els.commandCenterTasksBtn, "click", () => applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" }));
    on(els.commandCenterDashboardBtn, "click", () => applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" }));
    on(els.commandCenterGroupsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("test2", { pushNavStack: true, syncUrl: "push" });
    });
    on(els.commandCenterSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings");
    });
    on(els.rewardsInfoOpenBtn, "click", (e: any) => {
      e?.preventDefault?.();
      openOverlay(els.rewardsInfoOverlay as HTMLElement | null);
    });
    on(window, "resize", () => {
      if (taskView !== "tile" || !els.taskList) return;
      const nextCount = getTileColumnCount();
      if (nextCount !== currentTileColumnCount) render();
    });
    on(document as any, "click", (e: any) => {
      const badge = e?.target?.closest?.("#signedInHeaderBadge");
      if (!badge) return;
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings?pane=general");
    });
    registerGroupsEvents();
    on(els.exportTaskCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeTaskExportModal();
    });
    on(els.exportTaskConfirmBtn, "click", (e: any) => {
      e?.preventDefault?.();
      submitTaskExportModal();
    });
    on(els.exportTaskOverlay, "click", (e: any) => {
      if (e?.target === els.exportTaskOverlay) closeTaskExportModal();
    });
    on(els.exportTaskIncludeHistory, "keydown", (e: any) => {
      if (e?.key !== "Enter") return;
      e?.preventDefault?.();
      submitTaskExportModal();
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
    registerAddTaskEvents();

    registerTaskEvents();

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

    on(els.menuIcon, "click", () => {
      navigateToAppRoute("/tasktimer/settings");
    });
    registerDashboardEvents();
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
      const over = Array.from(list.children).find((child) => child.contains(e.target as Node)) as HTMLElement | undefined;
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
    registerPreferenceEvents({
      handleAppBackNavigation: () => {
        const currentRoutePath = normalizeTaskTimerRoutePath(normalizedPathname());
        if (currentRoutePath === "/tasktimer/settings") {
          window.location.href = appPathForPage("dashboard");
          return true;
        }
        return handleAppBackNavigation();
      },
      persistInlineTaskSettingsImmediate,
      applyAndPersistModeSettingsImmediate,
    });
    registerHistoryInlineEvents();
    registerHistoryManagerEvents();
    registerSessionEvents();
    registerEditTaskEvents();

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

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
        if (ov?.id === "historyEntryNoteOverlay") clearHistoryEntryNoteOverlayPosition();
        if (ov) closeOverlay(ov);
      });
    });
    on(els.dashboardHeatSummaryCloseBtn, "click", () => {
      closeDashboardHeatSummaryCard({ restoreFocus: true });
    });
    on(els.confirmCancelBtn, "click", closeConfirm);
    on(els.confirmAltBtn, "click", () => {
      if (typeof confirmActionAlt === "function") confirmActionAlt();
    });
    on(els.confirmOkBtn, "click", () => {
      if (typeof confirmAction === "function") confirmAction();
      else closeConfirm();
    });
  }

  function hydrateUiStateFromCaches() {
    persistenceApi?.hydrateUiStateFromCaches();
  }

  // Init
  const bootstrap = () => {
    hydrateUiStateFromCaches();
    void refreshOwnSharedSummaries()
      .then(() => reconcileOwnedSharedSummaryStates())
      .then(() => {
        render();
        if (currentAppPage === "tasks") {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (runtime.destroyed || currentAppPage !== "tasks") return;
              for (const taskId of openHistoryTaskIds) {
                renderHistory(taskId);
              }
            });
          });
        }
      })
      .catch(() => {});
    initMobileBackHandling();
    initCloudRefreshSync();
    if (!runtime.eventsWired) {
      wireEvents();
      runtime.eventsWired = true;
    }
    on(window, PENDING_PUSH_TASK_EVENT as any, () => {
      maybeHandlePendingTaskJump();
      void rehydrateFromCloudAndRender({ force: true }).then(() => {
        if (runtime.destroyed) return;
        maybeRestorePendingTimeGoalFlowApi();
      });
    });
    render();
    maybeHandlePendingTaskJump();
    maybeOpenImportFromQuery();
    if (!els.taskList && els.historyManagerScreen) {
      openHistoryManager();
    }
    if (!runtime.tickStarted) {
      tickApi();
      runtime.tickStarted = true;
    }
  };

  bootstrap();
  void rehydrateFromCloudAndRender();

  return { destroy };
}
