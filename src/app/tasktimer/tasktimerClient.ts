﻿/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey } from "./lib/history";
import {
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
      closeDashboardHeatSummaryCardApi({ restoreFocus: true });
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
