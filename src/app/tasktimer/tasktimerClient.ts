﻿/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey } from "./lib/history";
import type { DashboardWeekStart } from "./lib/historyChart";
import { formatMainTaskElapsed, formatMainTaskElapsedHtml } from "./lib/tasks";
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
  loadCachedTaskUi,
  saveCloudDashboard,
  saveCloudPreferences,
  saveCloudTaskUi,
} from "./lib/storage";
import {
  DEFAULT_REWARD_PROGRESS,
  normalizeRewardProgress,
} from "./lib/rewards";
import { measureDashboardRender } from "./lib/dashboardPerformance";
import { buildDashboardRenderSummary } from "./lib/dashboardViewModel";
import {
  hasTaskTimerEntitlement,
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerEntitlement,
  type TaskTimerPlan,
} from "./lib/entitlements";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import type {
  AppPage,
  DashboardRenderOptions,
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
import { createTaskTimerConfirmOverlay } from "./client/confirm-overlay";
import { createTaskTimerPopupMenu } from "./client/popup-menu";
import { createTaskTimerImportExport } from "./client/import-export";
import { createTaskTimerTaskListUi } from "./client/task-list-ui";
import { createTaskTimerTaskUiPersistence } from "./client/task-ui-persistence";
import { createTaskTimerRewardsHistory } from "./client/rewards-history";
import { createTaskTimerRootBootstrap, createTaskTimerStateAccessor } from "./client/root-state";
import { createTaskTimerSharedTask } from "./client/task-shared";
import {
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "./client/state";
import { createTaskTimerWorkspaceRepository } from "./lib/workspaceRepository";
import { applyScheduledPushAction } from "./lib/pushFunctions";
import { getTaskTimerPushDeviceId, loadPendingPushAction } from "./lib/pushNotifications";

const ARCHITECT_UID = "mWN9rMhO4xMq410c4E4VYyThw0x2";
const ARCHITECT_EMAIL = "aniven82@gmail.com";
const DASHBOARD_BUSY_MIN_VISIBLE_MS = 420;
const SCHEDULE_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const SCHEDULE_DAY_LABELS: Record<(typeof SCHEDULE_DAY_ORDER)[number], string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const SCHEDULE_SNAP_MINUTES = 30;
const SCHEDULE_MINUTE_PX = 44 / 30;

export function initTaskTimerClient(initialAppPage: AppPage = "tasks"): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }
  const {
    initialState,
    storageKeys: {
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      MOBILE_PUSH_ALERTS_KEY,
      THEME_KEY,
      MENU_BUTTON_STYLE_KEY,
      WEEK_STARTING_KEY,
      TASK_VIEW_KEY,
      MODE_SETTINGS_KEY,
      NAV_STACK_KEY,
      FOCUS_SESSION_NOTES_KEY,
      NAV_STACK_MAX,
      NATIVE_BACK_DEBOUNCE_MS,
    },
  } = createTaskTimerRootBootstrap(initialAppPage, STORAGE_KEY);
  const TIME_GOAL_PENDING_FLOW_KEY = `${STORAGE_KEY}:timeGoalPendingFlow`;
  const PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
  const PENDING_PUSH_ACTION_KEY = `${STORAGE_KEY}:pendingPushAction`;
  const REWARD_SESSION_TRACKERS_KEY = `${STORAGE_KEY}:rewardSessionTrackers`;
  const PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";

  const runtime = createTaskTimerRuntime();
  const workspaceRepository = createTaskTimerWorkspaceRepository();
  const { on } = runtime;

  function getCurrentPlan(): TaskTimerPlan {
    return readTaskTimerPlanFromStorage();
  }

  function hasEntitlement(entitlement: TaskTimerEntitlement) {
    return hasTaskTimerEntitlement(getCurrentPlan(), entitlement);
  }

  const destroy = () => {
    if (dashboardBusyHideTimer != null) window.clearTimeout(dashboardBusyHideTimer);
    sessionApi?.destroySessionRuntime();
    dashboardBusyHideTimer = null;
    dashboardBusyStack.length = 0;
    setDashboardBusyIndicatorVisible(false);
    deactivateDashboardBusyOverlay();
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

  function showUpgradePrompt(featureLabel: string, requiredPlan: TaskTimerPlan = "pro") {
    const normalizedFeatureLabel = String(featureLabel || "This feature").trim() || "This feature";
    const planLabel = requiredPlan === "pro" ? "Pro" : "Pro";
    const bodyText = `${normalizedFeatureLabel} is available on the ${planLabel} plan.`;
    confirm(
      `${planLabel} Feature`,
      bodyText,
      {
        okLabel: "Open Plans",
        cancelLabel: "Close",
        onOk: () => {
          closeConfirm();
          window.location.href = "/settings?pane=general";
        },
        onCancel: () => closeConfirm(),
      }
    );
  }

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
  let weekStarting = initialState.weekStarting;
  let taskView = initialState.taskView;
  let dynamicColorsEnabled = initialState.dynamicColorsEnabled;
  let autoFocusOnTaskLaunchEnabled = initialState.autoFocusOnTaskLaunchEnabled;
  let mobilePushAlertsEnabled = initialState.mobilePushAlertsEnabled;
  let checkpointAlertSoundEnabled = initialState.checkpointAlertSoundEnabled;
  let checkpointAlertToastEnabled = initialState.checkpointAlertToastEnabled;
  let deferredFocusModeTimeGoalModals: Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }> = [];
  let rewardProgress = normalizeRewardProgress(initialState.rewardProgress);
  let rewardSessionTrackersByTaskId: Record<
    string,
    {
      taskId: string;
      untrackedMs: number;
      segments: Array<{ startMs: number; endMs: number; multiplier: number }>;
      activeSegmentStartMs: number | null;
      activeMultiplier: number | null;
    }
  > = {};

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
  let timeGoalModalTaskId = initialState.timeGoalModalTaskId;
  let timeGoalModalFrozenElapsedMs = initialState.timeGoalModalFrozenElapsedMs;
  const timeGoalReminderAtMsByTaskId = initialState.timeGoalReminderAtMsByTaskId;
  let timeGoalCompleteDurationUnit: "minute" | "hour" = "hour";
  let timeGoalCompleteDurationPeriod: "day" | "week" = "day";
  let addTaskWizardStep = initialState.addTaskWizardStep;
  let addTaskPlannedStartTime = initialState.addTaskPlannedStartTime;
  let addTaskPlannedStartOpenEnded = initialState.addTaskPlannedStartOpenEnded;
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
  let dashboardMenuFlipped = initialState.dashboardMenuFlipped;
  let currentAppPage = initialState.currentAppPage;
  let scheduleSelectedDay: Task["plannedStartDay"] = "mon";
  let scheduleDragTaskId: string | null = null;
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
  let cloudPreferencesCache = workspaceRepository.loadCachedPreferences();
  let cloudDashboardCache = workspaceRepository.loadCachedDashboard();
  let cloudTaskUiCache = workspaceRepository.loadCachedTaskUi();
  rewardProgress = normalizeRewardProgress((cloudPreferencesCache || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS);
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
  let preferencesApi: ReturnType<typeof createTaskTimerPreferences> | null = null;
  let editTaskApi: ReturnType<typeof createTaskTimerEditTask> | null = null;
  let persistenceApi: ReturnType<typeof createTaskTimerPersistence> | null = null;
  let cloudSyncApi: ReturnType<typeof createTaskTimerCloudSync> | null = null;
  let closeEditApi: (saveChanges: boolean) => void = () => {};
  let openElapsedPadForMilestoneApi: (
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: (() => void) | undefined
  ) => void = () => {};
  let closeElapsedPadApi: (applyValue: boolean) => void = () => {};
  let registerEditTaskEvents: () => void = () => {};
  const openFriendSharedTaskUids = initialState.openFriendSharedTaskUids;
  const workingIndicatorStack = initialState.workingIndicatorStack;
  let workingIndicatorKeySeq = initialState.workingIndicatorKeySeq;
  let workingIndicatorOverlayActive = initialState.workingIndicatorOverlayActive;
  let workingIndicatorRestoreFocusEl = initialState.workingIndicatorRestoreFocusEl;
  const dashboardBusyStack = initialState.dashboardBusyStack;
  let dashboardBusyKeySeq = initialState.dashboardBusyKeySeq;
  let dashboardBusyOverlayActive = initialState.dashboardBusyOverlayActive;
  let dashboardBusyRestoreFocusEl = initialState.dashboardBusyRestoreFocusEl;
  let dashboardBusyShownAtMs = initialState.dashboardBusyShownAtMs;
  let dashboardBusyHideTimer = initialState.dashboardBusyHideTimer;
  let dashboardRefreshPending = false;
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
  let rewardsHistoryApi: ReturnType<typeof createTaskTimerRewardsHistory> | null = null;
  const dashboardWidgetHasRenderedData = initialState.dashboardWidgetHasRenderedData;
  let lastDashboardLiveSignature = "";
  const unsubscribeCachedPreferences = workspaceRepository.subscribeCachedPreferences((prefs) => {
    cloudPreferencesCache = prefs;
    rewardProgress = normalizeRewardProgress((prefs || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS);
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
    const normalizedValue = value.replace(/^\/tasklaunch(?=\/avatars\/)/i, "");
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
      /^\/(?:tasklaunch\/)?avatars\//i.test(avatarId)
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
  const sharedTaskApi = createTaskTimerSharedTask({
    createId: () => cryptoRandomId(),
    getCurrentMode: () => currentMode,
    getEditTimeGoalDraft: () => ({
      value: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      unit: editTaskDurationUnit,
      period: editTaskDurationPeriod,
    }),
  });
  const {
    makeTask,
    taskModeOf,
    normalizeLoadedTask,
    ensureMilestoneIdentity,
    hasValidPresetInterval,
    getPresetIntervalValueNum,
    getPresetIntervalNextSeqNum,
    addMilestoneWithCurrentPreset,
    hasNonPositiveCheckpoint,
    formatCheckpointTimeGoalText,
    isCheckpointAtOrAboveTimeGoal,
    hasCheckpointAtOrAboveTimeGoal,
  } = sharedTaskApi;

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

  function closeMobileDetailPanelIfOpen() {
    const mobileBackBtn = document.querySelector(
      ".settingsDetailPanel.isMobileOpen .settingsMobileBackBtn"
    ) as HTMLButtonElement | null;
    if (!mobileBackBtn || mobileBackBtn.disabled) return false;
    mobileBackBtn.click();
    return true;
  }

  const confirmOverlay = createTaskTimerConfirmOverlay({
    els,
    on,
    getConfirmAction: () => confirmAction,
    setConfirmAction: (value) => {
      confirmAction = value;
    },
    getConfirmActionAlt: () => confirmActionAlt,
    setConfirmActionAlt: (value) => {
      confirmActionAlt = value;
    },
    closeEdit: (saveChanges) => closeEditApi(saveChanges),
    closeElapsedPad: (applyValue) => closeElapsedPadApi(applyValue),
    closeTaskExportModal: () => closeTaskExportModal(),
    closeShareTaskModal: () => closeShareTaskModal(),
  });
  const {
    openOverlay,
    closeOverlay,
    confirm,
    closeConfirm,
    setResetTaskConfirmBusy,
    syncConfirmPrimaryToggleUi,
    closeTopOverlayIfOpen,
    registerConfirmOverlayEvents,
  } = confirmOverlay;

  const importExport = createTaskTimerImportExport({
    els,
    on,
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (value) => {
      historyByTaskId = value;
    },
    getExportTaskIndex: () => exportTaskIndex,
    setExportTaskIndex: (value) => {
      exportTaskIndex = value;
    },
    openOverlay,
    closeOverlay,
    confirm,
    closeConfirm,
    save,
    saveHistory,
    render,
    createId: () => cryptoRandomId(),
    makeTask: (name, order) => makeTask(name, order),
    sortMilestones,
    ensureMilestoneIdentity: (task) => ensureMilestoneIdentity(task),
    getPresetIntervalValueNum: (task) => getPresetIntervalValueNum(task),
    getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
    cleanupHistory,
    hasEntitlement,
    getCurrentPlan,
    showUpgradePrompt,
  });
  const {
    openTaskExportModal,
    closeTaskExportModal,
    maybeOpenImportFromQuery,
    registerImportExportEvents,
  } = importExport;
  const taskListUi = createTaskTimerTaskListUi({
    els,
    on,
    runtime,
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getCurrentMode: () => currentMode,
    getCurrentAppPage: () => currentAppPage,
    getTaskView: () => taskView,
    getTaskDragEl: () => taskDragEl,
    setTaskDragEl: (value) => {
      taskDragEl = value;
    },
    getFlippedTaskIds: () => flippedTaskIds,
    getLastRenderedTaskFlipMode: () => lastRenderedTaskFlipMode,
    setLastRenderedTaskFlipMode: (value) => {
      lastRenderedTaskFlipMode = value;
    },
    getLastRenderedTaskFlipView: () => lastRenderedTaskFlipView,
    setLastRenderedTaskFlipView: (value) => {
      lastRenderedTaskFlipView = value;
    },
    taskModeOf,
    save,
    render,
  });
  const {
    clearTaskFlipStates,
    syncTaskFlipStatesForVisibleTasks,
    applyTaskFlipDomState,
    setTaskFlipped,
    jumpToTaskAndHighlight,
    registerTaskListUiEvents,
  } = taskListUi;
  const taskUiPersistence = createTaskTimerTaskUiPersistence({
    els,
    getCurrentUid: () => currentUid(),
    getHistoryRangeDaysByTaskId: () => historyRangeDaysByTaskId,
    getHistoryRangeModeByTaskId: () => historyRangeModeByTaskId,
    getPinnedHistoryTaskIds: () => pinnedHistoryTaskIds,
    setPinnedHistoryTaskIds: (value) => {
      pinnedHistoryTaskIds = value;
    },
    getAddTaskCustomNames: () => addTaskCustomNames,
    getCloudTaskUiCache: () => cloudTaskUiCache,
    setCloudTaskUiCache: (value) => {
      cloudTaskUiCache = value as typeof cloudTaskUiCache;
    },
    loadCachedTaskUi,
    saveCloudTaskUi: (value) => {
      saveCloudTaskUi(value as Parameters<typeof saveCloudTaskUi>[0]);
    },
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    saveHistory,
    getWorkingIndicatorStack: () => workingIndicatorStack,
    getWorkingIndicatorKeySeq: () => workingIndicatorKeySeq,
    setWorkingIndicatorKeySeq: (value) => {
      workingIndicatorKeySeq = value;
    },
    getWorkingIndicatorOverlayActive: () => workingIndicatorOverlayActive,
    setWorkingIndicatorOverlayActive: (value) => {
      workingIndicatorOverlayActive = value;
    },
    getWorkingIndicatorRestoreFocusEl: () => workingIndicatorRestoreFocusEl,
    setWorkingIndicatorRestoreFocusEl: (value) => {
      workingIndicatorRestoreFocusEl = value;
    },
    sessionColorForTaskMs,
  });
  const {
    loadPinnedHistoryTaskIds,
    savePinnedHistoryTaskIds,
    persistTaskUiToCloud,
    backfillHistoryColorsFromSessionLogic,
    showWorkingIndicator,
    hideWorkingIndicator,
  } = taskUiPersistence;

  function setDashboardBusyIndicatorVisible(isOn: boolean, message?: string) {
    const overlayEl = els.dashboardRefreshBusyOverlay as HTMLElement | null;
    const textEl = els.dashboardRefreshBusyText as HTMLElement | null;
    const shellContentEl = els.dashboardShellContent as HTMLElement | null;
    if (textEl && typeof message === "string" && message.trim()) {
      textEl.textContent = message.trim();
    } else if (textEl && !isOn) {
      textEl.textContent = "Refreshing...";
    }
    shellContentEl?.classList.toggle("isDashboardBusy", !!isOn);
    if (!overlayEl) return;
    overlayEl.classList.toggle("isOn", !!isOn);
    overlayEl.setAttribute("aria-hidden", isOn ? "false" : "true");
    syncDashboardRefreshButtonUi();
  }

  function syncDashboardRefreshButtonUi() {
    const buttonEl = els.dashboardRefreshBtn as HTMLButtonElement | null;
    if (!buttonEl) return;
    const isBusy = dashboardBusyOverlayActive || dashboardBusyStack.length > 0;
    const hasVisiblePanels =
      Array.from(
        document.querySelectorAll(
          '#appPageDashboard .dashboardHeroPanel[data-dashboard-panel-id], #appPageDashboard .dashboardCard[data-dashboard-id]'
        )
      ).some((node) => !(node as HTMLElement).hidden);
    const isDisabled = isBusy || !hasVisiblePanels || dashboardMenuFlipped;
    buttonEl.disabled = isDisabled;
    buttonEl.classList.toggle("isPending", dashboardRefreshPending && !isBusy);
    buttonEl.classList.toggle("isBusy", isBusy);
    buttonEl.setAttribute(
      "aria-label",
      isBusy
        ? "Refreshing dashboard"
        : dashboardMenuFlipped
          ? "Refresh unavailable while dashboard settings are open"
        : !hasVisiblePanels
          ? "Refresh unavailable while all dashboard panels are hidden"
        : dashboardRefreshPending
          ? "Refresh dashboard, new data available"
          : "Refresh dashboard"
    );
    buttonEl.setAttribute(
      "title",
      isBusy
        ? "Refreshing dashboard"
        : dashboardMenuFlipped
          ? "Refresh unavailable"
        : !hasVisiblePanels
          ? "Refresh unavailable"
        : dashboardRefreshPending
          ? "Refresh available"
          : "Refresh dashboard"
    );
  }

  function setDashboardRefreshPending(nextPending: boolean) {
    dashboardRefreshPending = !!nextPending;
    syncDashboardRefreshButtonUi();
  }

  function syncDashboardMenuFlipUi() {
    const flipped = !!dashboardMenuFlipped;
    const sceneEl = els.dashboardShellScene as HTMLElement | null;
    const frontEl = els.dashboardShellContent as HTMLElement | null;
    const backEl = els.dashboardShellBack as HTMLElement | null;
    const menuBtn = els.dashboardPanelMenuBtn as HTMLButtonElement | null;
    const backBtn = els.dashboardPanelMenuBackBtn as HTMLButtonElement | null;
    const editActionsEl = menuBtn?.closest(".dashboardEditActions") as HTMLElement | null;
    sceneEl?.classList.toggle("isFlipped", flipped);
    if (frontEl) {
      frontEl.setAttribute("aria-hidden", flipped ? "true" : "false");
      if (flipped) frontEl.setAttribute("inert", "");
      else frontEl.removeAttribute("inert");
      frontEl.classList.toggle("isBackfaceHidden", flipped);
    }
    if (backEl) {
      backEl.setAttribute("aria-hidden", flipped ? "false" : "true");
      if (!flipped) backEl.setAttribute("inert", "");
      else backEl.removeAttribute("inert");
    }
    if (menuBtn) menuBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
    if (backBtn) backBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
    if (editActionsEl) editActionsEl.classList.toggle("isMenuFlipped", flipped);
    syncDashboardRefreshButtonUi();
  }

  function getDashboardBusyTargets() {
    return [] as HTMLElement[];
  }

  function activateDashboardBusyOverlay() {
    if (dashboardBusyOverlayActive) return;
    dashboardBusyOverlayActive = true;
    dashboardBusyShownAtMs = nowMs();
    dashboardBusyRestoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    getDashboardBusyTargets().forEach((node) => {
      node.setAttribute("data-dashboard-busy-prev-inert", node.hasAttribute("inert") ? "true" : "false");
      node.setAttribute("data-dashboard-busy-prev-aria-hidden", node.getAttribute("aria-hidden") ?? "");
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });
    const overlayEl = els.dashboardRefreshBusyOverlay as HTMLElement | null;
    try {
      overlayEl?.focus({ preventScroll: true });
    } catch {
      overlayEl?.focus();
    }
  }

  function deactivateDashboardBusyOverlay() {
    if (!dashboardBusyOverlayActive) return;
    dashboardBusyOverlayActive = false;
    getDashboardBusyTargets().forEach((node) => {
      const prevInert = node.getAttribute("data-dashboard-busy-prev-inert");
      const prevAriaHidden = node.getAttribute("data-dashboard-busy-prev-aria-hidden");
      node.removeAttribute("data-dashboard-busy-prev-inert");
      node.removeAttribute("data-dashboard-busy-prev-aria-hidden");
      if (prevInert === "true") node.setAttribute("inert", "");
      else node.removeAttribute("inert");
      if (prevAriaHidden) node.setAttribute("aria-hidden", prevAriaHidden);
      else node.removeAttribute("aria-hidden");
    });
    const restoreEl = dashboardBusyRestoreFocusEl;
    dashboardBusyRestoreFocusEl = null;
    if (restoreEl && restoreEl.isConnected) {
      try {
        restoreEl.focus({ preventScroll: true });
      } catch {
        restoreEl.focus();
      }
    }
  }

  function showDashboardBusyIndicator(message = "Refreshing...") {
    if (dashboardBusyHideTimer != null) {
      window.clearTimeout(dashboardBusyHideTimer);
      dashboardBusyHideTimer = null;
    }
    const normalizedMessage = String(message || "").trim() || "Refreshing...";
    const key = dashboardBusyKeySeq + 1;
    dashboardBusyKeySeq = key;
    dashboardBusyStack.push({ key, message: normalizedMessage });
    if (dashboardBusyStack.length === 1) activateDashboardBusyOverlay();
    setDashboardBusyIndicatorVisible(true, normalizedMessage);
    return key;
  }

  function hideDashboardBusyIndicator(key?: number) {
    if (dashboardBusyHideTimer != null) {
      window.clearTimeout(dashboardBusyHideTimer);
      dashboardBusyHideTimer = null;
    }
    if (typeof key === "number") {
      const index = dashboardBusyStack.findIndex((entry) => entry.key === key);
      if (index >= 0) dashboardBusyStack.splice(index, 1);
    } else {
      dashboardBusyStack.length = 0;
    }
    const current = dashboardBusyStack[dashboardBusyStack.length - 1] || null;
    if (current) {
      setDashboardBusyIndicatorVisible(true, current.message);
      return;
    }
    const remainingMs = Math.max(0, DASHBOARD_BUSY_MIN_VISIBLE_MS - Math.max(0, nowMs() - dashboardBusyShownAtMs));
    dashboardBusyHideTimer = window.setTimeout(() => {
      dashboardBusyHideTimer = null;
      if (dashboardBusyStack.length) {
        const latest = dashboardBusyStack[dashboardBusyStack.length - 1] || null;
        if (latest) setDashboardBusyIndicatorVisible(true, latest.message);
        return;
      }
      setDashboardBusyIndicatorVisible(false);
      deactivateDashboardBusyOverlay();
    }, remainingMs);
  }

  function renderDashboardWidgetsWithBusy(opts?: DashboardRenderOptions) {
    const summary = buildDashboardRenderSummary({
      tasks,
      historyByTaskId,
      deletedTaskMeta,
      dynamicColorsEnabled,
      currentDayKey: localDayKey(nowMs()),
    });
    const renderOpts = opts ? { includeAvgSession: opts.includeAvgSession } : undefined;
    const shouldShowBusy = currentAppPage === "dashboard" && opts?.showBusy === true;
    if (!shouldShowBusy) {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        renderDashboardWidgetsFromRenderApi(renderOpts);
      });
      lastDashboardLiveSignature = summary.liveSignature;
      return;
    }
    const busyKey = showDashboardBusyIndicator(opts?.busyMessage || "Refreshing...");
    try {
      measureDashboardRender("full", summary.fullSignature, false, () => {
        renderDashboardWidgetsFromRenderApi(renderOpts);
      });
      lastDashboardLiveSignature = summary.liveSignature;
    } finally {
      hideDashboardBusyIndicator(busyKey);
    }
  }

  function renderDashboardLiveWidgetsWithMemo() {
    const summary = buildDashboardRenderSummary({
      tasks,
      historyByTaskId,
      deletedTaskMeta,
      dynamicColorsEnabled,
      currentDayKey: localDayKey(nowMs()),
    });
    if (summary.runningTaskCount > 0 && summary.liveSignature === lastDashboardLiveSignature) {
      measureDashboardRender("live", summary.liveSignature, true, () => undefined);
      return;
    }
    measureDashboardRender("live", summary.liveSignature, false, () => {
      renderDashboardLiveWidgetsApi();
    });
    lastDashboardLiveSignature = summary.liveSignature;
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
    hasEntitlement,
    getCurrentPlan,
    showUpgradePrompt,
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
    getWeekStarting: () => weekStarting,
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
    getDashboardRefreshHoldActive: () => dashboardBusyOverlayActive || dashboardBusyStack.length > 0 || dashboardBusyHideTimer != null,
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
    hasEntitlement,
    getCurrentPlan,
  });
  const {
    renderDashboardTimelineCard: renderDashboardTimelineCardApi,
    renderDashboardLiveWidgets: renderDashboardLiveWidgetsApi,
    renderDashboardWidgets: renderDashboardWidgetsFromRenderApi,
    selectDashboardTimelineSuggestion: selectDashboardTimelineSuggestionApi,
    openDashboardHeatSummaryCard: openDashboardHeatSummaryCardApi,
    closeDashboardHeatSummaryCard: closeDashboardHeatSummaryCardApi,
  } = dashboardRenderApi;
  const dashboardApi = createTaskTimerDashboard({
    els,
    on,
    syncDashboardRefreshButtonUi,
    getRewardProgress: () => rewardProgress,
    getTasks: () => tasks,
    getCurrentAppPage: () => currentAppPage,
    getDashboardMenuFlipped: () => dashboardMenuFlipped,
    setDashboardMenuFlipped: (value: boolean) => {
      dashboardMenuFlipped = value;
    },
    syncDashboardMenuFlipUi,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    renderDashboardTimelineCard: () => renderDashboardTimelineCardApi(),
    selectDashboardTimelineSuggestion: (key) => selectDashboardTimelineSuggestionApi(key),
    openDashboardHeatSummaryCard: (dayKey, dateLabel) => openDashboardHeatSummaryCardApi(dayKey, dateLabel),
    closeDashboardHeatSummaryCard: (opts) => closeDashboardHeatSummaryCardApi(opts),
  });
  const {
    renderDashboardPanelMenu: renderDashboardPanelMenuApi,
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
    sharedTasks: sharedTaskApi,
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
    getRewardProgress: () => rewardProgress,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    syncTimeGoalModalWithTaskState: () => sessionApi?.syncTimeGoalModalWithTaskState(),
    maybeRestorePendingTimeGoalFlow: () => sessionApi?.maybeRestorePendingTimeGoalFlow(),
    getElapsedMs: (task) => sessionApi?.getElapsedMs(task) ?? 0,
    getTaskElapsedMs: (task) => sessionApi?.getTaskElapsedMs(task) ?? 0,
    save,
    saveHistory,
    saveDeletedMeta,
    escapeHtmlUI,
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
    clearCheckpointBaseline: (taskId) => sessionApi?.clearCheckpointBaseline(taskId),
    openRewardSessionSegment,
    closeRewardSessionSegment,
    clearRewardSessionTracker,
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
    cloneTaskForEdit: (task) => editTaskApi?.cloneTaskForEdit(task) ?? task,
    getModeLabel: (mode) => getModeLabel(mode),
    isModeEnabled: (mode) => isModeEnabled(mode),
    setEditTimeGoalEnabled: (enabled) => editTaskApi?.setEditTimeGoalEnabled(enabled),
    syncEditTaskTimeGoalUi: (task) => editTaskApi?.syncEditTaskTimeGoalUi(task),
    syncEditCheckpointAlertUi: (task) => editTaskApi?.syncEditCheckpointAlertUi(task),
    syncEditSaveAvailability: (task) => editTaskApi?.syncEditSaveAvailability(task),
    syncEditMilestoneSectionUi: (task) => editTaskApi?.syncEditMilestoneSectionUi(task),
    setMilestoneUnitUi: (unit) => editTaskApi?.setMilestoneUnitUi(unit),
    renderMilestoneEditor: (task) => editTaskApi?.renderMilestoneEditor(task),
    clearEditValidationState: () => editTaskApi?.clearEditValidationState(),
    validateEditTimeGoal: () => editTaskApi?.validateEditTimeGoal() ?? true,
    showEditValidationError: (task, message) => editTaskApi?.showEditValidationError(task, message),
    editTaskHasActiveTimeGoal: () => editTaskApi?.editTaskHasActiveTimeGoal() ?? false,
    hasNonPositiveCheckpoint: (milestones) => hasNonPositiveCheckpoint(milestones),
    hasCheckpointAtOrAboveTimeGoal: (milestones, unitSec, timeGoalMinutes) =>
      hasCheckpointAtOrAboveTimeGoal(milestones, unitSec, timeGoalMinutes),
    isCheckpointAtOrAboveTimeGoal: (checkpointHours, unitSec, timeGoalMinutes) =>
      isCheckpointAtOrAboveTimeGoal(checkpointHours, unitSec, timeGoalMinutes),
    formatCheckpointTimeGoalText: (task, opts) => formatCheckpointTimeGoalText(task, opts),
    getEditTaskTimeGoalMinutes: () => editTaskApi?.getEditTaskTimeGoalMinutes() ?? 0,
    getEditTaskTimeGoalMinutesFor: (value, unit, period) => editTaskApi?.getEditTaskTimeGoalMinutesFor(value, unit, period) ?? 0,
    getAddTaskTimeGoalMinutesState: () => addTaskApi?.getAddTaskTimeGoalMinutesState() ?? 0,
    isEditTimeGoalEnabled: () => editTaskApi?.isEditTimeGoalEnabled() ?? false,
    ensureMilestoneIdentity: (task) => ensureMilestoneIdentity(task),
    toggleSwitchElement: (el, on) => toggleSwitchElement(el, on),
    isSwitchOn: (el) => isSwitchOn(el),
    buildEditDraftSnapshot: (task) => editTaskApi?.buildEditDraftSnapshot(task) ?? "",
    getCurrentEditTask: () => editTaskApi?.getCurrentEditTask() ?? null,
    syncEditTaskDurationReadout: (task) => editTaskApi?.syncEditTaskDurationReadout(task),
    maybeToggleEditPresetIntervals: (nextEnabled) => editTaskApi?.maybeToggleEditPresetIntervals(nextEnabled),
    hasValidPresetInterval: (task) => hasValidPresetInterval(task),
    addMilestoneWithCurrentPreset: (task, timeGoalMinutes) => addMilestoneWithCurrentPreset(task, timeGoalMinutes),
    getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
    isEditMilestoneUnitDay: () => editTaskApi?.isEditMilestoneUnitDay() ?? false,
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
    checkpointRepeatActiveTaskId: () => sessionApi?.checkpointRepeatActiveTaskId() || null,
    activeCheckpointToastTaskId: () => sessionApi?.activeCheckpointToastTaskId() || null,
    stopCheckpointRepeatAlert: () => sessionApi?.stopCheckpointRepeatAlert(),
    enqueueCheckpointToast: (title, text, opts) => sessionApi?.enqueueCheckpointToast(title, text, opts as any),
    syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
    syncSharedTaskSummariesForTasks: (taskIds) => syncSharedTaskSummariesForTasks(taskIds),
    hasEntitlement,
    getCurrentPlan,
    showUpgradePrompt,
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
    sharedTasks: sharedTaskApi,
    getTasks: () => tasks,
    getCurrentMode: () => currentMode,
    setTasks: (value: typeof tasks) => {
      tasks = value;
    },
    getAddTaskWizardStep: () => addTaskWizardStep,
    setAddTaskWizardStepState: (value) => {
      addTaskWizardStep = value;
    },
    getAddTaskPlannedStartTime: () => addTaskPlannedStartTime,
    setAddTaskPlannedStartTimeState: (value) => {
      addTaskPlannedStartTime = value;
    },
    getAddTaskPlannedStartOpenEnded: () => addTaskPlannedStartOpenEnded,
    setAddTaskPlannedStartOpenEndedState: (value) => {
      addTaskPlannedStartOpenEnded = value;
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
    getAddTaskCustomNames: () => addTaskCustomNames,
    setAddTaskCustomNamesState: (value) => {
      addTaskCustomNames = value;
    },
    getSuppressAddTaskNameFocusOpen: () => suppressAddTaskNameFocusOpen,
    setSuppressAddTaskNameFocusOpenState: (value) => {
      suppressAddTaskNameFocusOpen = value;
    },
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
    jumpToTaskAndHighlight,
    openElapsedPadForMilestone: (task, milestone, ms, onApplied) =>
      openElapsedPadForMilestoneApi(task, milestone, ms, onApplied),
    hasEntitlement,
    showUpgradePrompt,
  });
  const {
    registerAddTaskEvents,
    loadAddTaskCustomNames: loadAddTaskCustomNamesApi,
  } = addTaskApi;

  sessionApi = createTaskTimerSession({
    els,
    on,
    runtime,
    sharedTasks: sharedTaskApi,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    renderDashboardLiveWidgets: () => renderDashboardLiveWidgetsWithMemo(),
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
    getModeColor: (mode) => getModeColor(mode),
    fillBackgroundForPct,
    sortMilestones,
    normalizeHistoryTimestampMs,
    getHistoryEntryNote: (entry) => historyInlineApi?.getHistoryEntryNote(entry) || "",
    syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
    syncRewardSessionTrackerForTask: (task, nowValue) => syncRewardSessionTrackerForRunningTask(task, nowValue),
    startTask: (index) => startTaskApi(index),
    stopTask: (index) => stopTaskApi(index),
    resetTask: (index) => resetTaskApi(index),
    resetTaskStateImmediate: (task, opts) => resetTaskStateImmediateApi(task, opts),
  });
  bootstrapRewardSessionTrackers();
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
    getDashboardMenuFlipped: () => dashboardMenuFlipped,
    setDashboardMenuFlipped: (value) => {
      dashboardMenuFlipped = value;
    },
    syncDashboardMenuFlipUi,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    renderGroupsPage,
    refreshGroupsData,
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    closeTopOverlayIfOpen,
    closeMobileDetailPanelIfOpen,
    showExitAppConfirm,
    hasEntitlement,
    showUpgradePrompt,
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
    registerAppShellEvents,
  } = appShell;

  function rehydrateFromCloudAndRender(opts?: { force?: boolean }) {
    if (!cloudSyncApi) return Promise.resolve();
    return cloudSyncApi.rehydrateFromCloudAndRender(opts);
  }

  function initCloudRefreshSync() {
    cloudSyncApi?.initCloudRefreshSync();
  }

  function load() {
    persistenceApi?.load();
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
      sessionApi?.closeFocusMode();
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

  function clearPendingPushAction() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(PENDING_PUSH_ACTION_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function maybeHandlePendingPushAction() {
    const pending = loadPendingPushAction();
    if (!pending) return;
    if (!currentUid()) return;
    const taskId = String(pending.taskId || "").trim();
    if (!taskId) {
      clearPendingPushAction();
      return;
    }
    const taskIndex = tasks.findIndex((row) => String(row.id || "").trim() === taskId);
    if (taskIndex < 0) return;
    clearPendingPushAction();
    if (pending.actionId === "launchTask") {
      void applyScheduledPushAction({
        actionId: "launchTask",
        taskId,
        route: pending.route,
        deviceId: getTaskTimerPushDeviceId(),
      }).catch(() => {});
      tasksApi.startTask(taskIndex);
      return;
    }
    if (pending.actionId === "snooze10m") {
      void applyScheduledPushAction({
        actionId: "snooze10m",
        taskId,
        route: pending.route,
        deviceId: getTaskTimerPushDeviceId(),
      }).catch(() => {});
      jumpToTaskById(taskId);
      return;
    }
    if (pending.actionId === "postponeNextGap") {
      void applyScheduledPushAction({
        actionId: "postponeNextGap",
        taskId,
        route: pending.route,
        deviceId: getTaskTimerPushDeviceId(),
      }).catch(() => {});
      jumpToTaskById(taskId);
      return;
    }
  }

  function save(opts?: { deletedTaskIds?: string[] }) {
    persistenceApi?.save(opts);
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    sessionApi?.setFocusSessionDraft(taskId, noteRaw);
  }

  function clearFocusSessionDraft(taskId: string) {
    sessionApi?.clearFocusSessionDraft(taskId);
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    sessionApi?.syncFocusSessionNotesInput(taskId);
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    sessionApi?.syncFocusSessionNotesAccordion(taskId);
  }

  function captureSessionNoteSnapshot(taskId?: string | null): string {
    return sessionApi?.captureSessionNoteSnapshot(taskId) ?? "";
  }

  function getHistoryEntryNote(entry: any) {
    return historyInlineApi?.getHistoryEntryNote(entry) || "";
  }

  function clearHistoryEntryNoteOverlayPosition() {
    if (!historyInlineApi) return;
    historyInlineApi.clearHistoryEntryNoteOverlayPosition();
  }

  function currentUid() {
    return String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
  }

  function currentEmail() {
    return String(getFirebaseAuthClient()?.currentUser?.email || "").trim();
  }

  function escapeHtmlUI(str: unknown) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getElapsedMs(t: Task) {
    return sessionApi?.getElapsedMs(t) ?? 0;
  }

  function getTaskElapsedMs(t: Task) {
    return sessionApi?.getTaskElapsedMs(t) ?? 0;
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

  function openRewardSessionSegment(task: Task | null | undefined, startMsRaw?: number | null) {
    rewardsHistoryApi?.openRewardSessionSegment(task, startMsRaw);
  }

  function closeRewardSessionSegment(task: Task | null | undefined, endMsRaw?: number | null) {
    rewardsHistoryApi?.closeRewardSessionSegment(task, endMsRaw);
  }

  function clearRewardSessionTracker(taskIdRaw: string | null | undefined) {
    rewardsHistoryApi?.clearRewardSessionTracker(taskIdRaw);
  }

  function appendCompletedSessionHistory(t: Task, completedAtMs: number, elapsedMs: number, noteOverride?: string) {
    rewardsHistoryApi?.appendCompletedSessionHistory(t, completedAtMs, elapsedMs, noteOverride);
  }

  function csvEscape(value: unknown): string {
    return rewardsHistoryApi?.csvEscape(value) ?? String(value ?? "");
  }

  function parseCsvRows(input: string): string[][] {
    return rewardsHistoryApi?.parseCsvRows(input) ?? [];
  }

  function downloadCsvFile(filename: string, text: string) {
    rewardsHistoryApi?.downloadCsvFile(filename, text);
  }

  function bootstrapRewardSessionTrackers() {
    rewardsHistoryApi?.bootstrapRewardSessionTrackers();
  }

  rewardsHistoryApi = createTaskTimerRewardsHistory({
    rewardSessionTrackersStorageKey: REWARD_SESSION_TRACKERS_KEY,
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getDeletedTaskMeta: () => deletedTaskMeta,
    getWeekStarting: () => weekStarting,
    getDashboardIncludedModes: () => dashboardIncludedModes,
    getRewardProgress: () => rewardProgress,
    setRewardProgress: (value) => {
      rewardProgress = value;
    },
    getRewardSessionTrackersByTaskId: () => rewardSessionTrackersByTaskId,
    setRewardSessionTrackersByTaskId: (value) => {
      rewardSessionTrackersByTaskId = value;
    },
    getCloudPreferencesCache: () => cloudPreferencesCache,
    setCloudPreferencesCache: (value) => {
      cloudPreferencesCache = value ?? null;
    },
    getFocusModeTaskId: () => focusModeTaskId,
    getCurrentPlan: () => getCurrentPlan(),
    hasEntitlement: (entitlement) => hasEntitlement(entitlement),
    currentUid: () => currentUid(),
    taskModeOf: (task) => taskModeOf(task),
    isModeEnabled: (mode) => isModeEnabled(mode),
    getTaskElapsedMs: (task) => getTaskElapsedMs(task),
    sessionColorForTaskMs,
    captureSessionNoteSnapshot,
    setFocusSessionDraft,
    clearFocusSessionDraft,
    syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion,
    appendHistoryEntry: (taskId, entry) => appendHistoryEntry(taskId, entry as any),
    saveHistoryLocally,
    buildDefaultCloudPreferences: () => buildDefaultCloudPreferences(),
    saveCloudPreferences: (prefs) => saveCloudPreferences(prefs),
    syncSharedTaskSummariesForTask,
    syncOwnFriendshipProfile,
  });
  const {
    syncRewardSessionTrackerForRunningTask,
  } = rewardsHistoryApi;

  function isArchitectUser() {
    const uid = currentUid();
    if (uid !== ARCHITECT_UID) return false;
    const email = currentEmail();
    if (!email) return true;
    return email.toLowerCase() === ARCHITECT_EMAIL.toLowerCase();
  }

  function normalizeScheduleDay(raw: unknown): Task["plannedStartDay"] {
    const value = String(raw || "").trim().toLowerCase();
    return SCHEDULE_DAY_ORDER.includes(value as (typeof SCHEDULE_DAY_ORDER)[number])
      ? (value as (typeof SCHEDULE_DAY_ORDER)[number])
      : null;
  }

  function isScheduleMobileLayout() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  }

  function parseScheduleTimeMinutes(raw: unknown): number | null {
    const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function formatScheduleMinutes(totalMinutes: number) {
    const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(totalMinutes) || 0)));
    const hours24 = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    const meridiem = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
  }

  function formatScheduleStoredTime(totalMinutes: number) {
    const safeMinutes = Math.max(0, Math.min(24 * 60 - SCHEDULE_SNAP_MINUTES, Math.floor(Number(totalMinutes) || 0)));
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function formatScheduleDurationMinutes(totalMinutes: number) {
    const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
    if (safeMinutes <= 0) return "0m";
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }

  function snapScheduleMinutes(totalMinutes: number) {
    return Math.max(
      0,
      Math.min(24 * 60 - SCHEDULE_SNAP_MINUTES, Math.round(Math.max(0, totalMinutes) / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES)
    );
  }

  function getScheduleTaskDurationMinutes(task: Task) {
    const hasGoal = !!task.timeGoalEnabled && task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0;
    if (!hasGoal) return 0;
    const goalMinutes = Math.max(SCHEDULE_SNAP_MINUTES, Math.round(Number(task.timeGoalMinutes || 0)));
    return Math.min(24 * 60, goalMinutes);
  }

  function isScheduleRenderableTask(task: Task) {
    return getScheduleTaskDurationMinutes(task) > 0;
  }

  function getScheduleVisibleDays(): Array<(typeof SCHEDULE_DAY_ORDER)[number]> {
    if (isScheduleMobileLayout()) {
      const selectedDay = normalizeScheduleDay(scheduleSelectedDay) || "mon";
      scheduleSelectedDay = selectedDay;
      return [selectedDay];
    }
    return [...SCHEDULE_DAY_ORDER];
  }

  function getScheduleDaysForTask(task: Task): Array<(typeof SCHEDULE_DAY_ORDER)[number]> {
    const explicitDay = normalizeScheduleDay(task.plannedStartDay);
    if (explicitDay) return [explicitDay];
    return [...SCHEDULE_DAY_ORDER];
  }

  function buildScheduleViewModel() {
    const scheduled: Array<{
      task: Task;
      day: (typeof SCHEDULE_DAY_ORDER)[number];
      startMinutes: number;
      durationMinutes: number;
    }> = [];
    const unscheduled: Array<{ task: Task; canDrop: boolean }> = [];

    for (const task of tasks) {
      const durationMinutes = getScheduleTaskDurationMinutes(task);
      const startMinutes = parseScheduleTimeMinutes(task.plannedStartTime);
      if (
        durationMinutes > 0 &&
        startMinutes != null &&
        task.plannedStartOpenEnded !== true &&
        startMinutes + durationMinutes <= 24 * 60
      ) {
        const days = getScheduleDaysForTask(task);
        days.forEach((day) => {
          scheduled.push({ task, day, startMinutes, durationMinutes });
        });
      } else {
        unscheduled.push({ task, canDrop: durationMinutes > 0 });
      }
    }

    scheduled.sort((a, b) => {
      if (a.day !== b.day) return SCHEDULE_DAY_ORDER.indexOf(a.day) - SCHEDULE_DAY_ORDER.indexOf(b.day);
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.task.order - b.task.order;
    });
    unscheduled.sort((a, b) => a.task.order - b.task.order);
    return { scheduled, unscheduled };
  }

  function schedulePlacementHasOverlap(
    taskId: string,
    day: (typeof SCHEDULE_DAY_ORDER)[number],
    startMinutes: number,
    durationMinutes: number
  ) {
    const endMinutes = startMinutes + durationMinutes;
    if (endMinutes > 24 * 60) return true;
    const { scheduled } = buildScheduleViewModel();
    return scheduled.some((entry) => {
      if (String(entry.task.id || "") === taskId) return false;
      if (entry.day !== day) return false;
      const entryEnd = entry.startMinutes + entry.durationMinutes;
      return startMinutes < entryEnd && endMinutes > entry.startMinutes;
    });
  }

  function moveTaskOnSchedule(taskIdRaw: string, dayRaw: unknown, rawMinutes: number) {
    const taskId = String(taskIdRaw || "").trim();
    const day = normalizeScheduleDay(dayRaw);
    if (!taskId || !day) return;
    const taskIndex = tasks.findIndex((entry) => String(entry.id || "") === taskId);
    if (taskIndex < 0) return;
    const task = tasks[taskIndex];
    const durationMinutes = getScheduleTaskDurationMinutes(task);
    if (!(durationMinutes > 0)) return;
    const startMinutes = snapScheduleMinutes(rawMinutes);
    if (schedulePlacementHasOverlap(taskId, day, startMinutes, durationMinutes)) return;
    const hadExplicitDay = !!normalizeScheduleDay(task.plannedStartDay);
    task.plannedStartDay = hadExplicitDay ? day : null;
    task.plannedStartTime = formatScheduleStoredTime(startMinutes);
    task.plannedStartOpenEnded = false;
    scheduleSelectedDay = day;
    save();
    render();
  }

  function buildScheduleGridHtml() {
    const visibleDays = getScheduleVisibleDays();
    const { scheduled } = buildScheduleViewModel();
    const timeLabels = Array.from({ length: 48 }, (_, index) => {
      const minutes = index * SCHEDULE_SNAP_MINUTES;
      return `<div class="scheduleTimeLabel" style="height:${SCHEDULE_SNAP_MINUTES * SCHEDULE_MINUTE_PX}px">${escapeHtmlUI(
        formatScheduleMinutes(minutes)
      )}</div>`;
    }).join("");

    const dayColumns = visibleDays
      .map((day) => {
        const cards = scheduled
          .filter((entry) => entry.day === day)
          .map((entry) => {
            const topPx = entry.startMinutes * SCHEDULE_MINUTE_PX;
            const heightPx = entry.durationMinutes * SCHEDULE_MINUTE_PX;
            const metaText = `${formatScheduleMinutes(entry.startMinutes)} | ${formatScheduleDurationMinutes(entry.durationMinutes)}`;
            return `<button class="scheduleTaskCard" draggable="true" data-schedule-task-id="${escapeHtmlUI(
              String(entry.task.id || "")
            )}" type="button" style="top:${topPx}px;height:${heightPx}px">
              <span class="scheduleTaskCardName">${escapeHtmlUI(entry.task.name || "Task")}</span>
              <span class="scheduleTaskCardMeta">${escapeHtmlUI(metaText)}</span>
            </button>`;
          })
          .join("");
        const slots = Array.from({ length: 48 }, () => `<div class="scheduleSlot" style="height:${SCHEDULE_SNAP_MINUTES * SCHEDULE_MINUTE_PX}px"></div>`).join("");
        return `<section class="scheduleDayColumn" data-schedule-drop-day="${day}">
          <div class="scheduleDayBody">
            <div class="scheduleDaySlots">${slots}</div>
            <div class="scheduleDayCards">${cards}</div>
          </div>
        </section>`;
      })
      .join("");

    return `<div class="schedulePlanner${isScheduleMobileLayout() ? " isMobile" : ""}">
      <div class="schedulePlannerHead">
        <div class="schedulePlannerCorner">Time</div>
        <div class="schedulePlannerDays">${visibleDays
          .map((day) => `<div class="schedulePlannerDayChip">${escapeHtmlUI(SCHEDULE_DAY_LABELS[day])}</div>`)
          .join("")}</div>
      </div>
      <div class="schedulePlannerBody">
        <div class="scheduleTimeRail">${timeLabels}</div>
        <div class="scheduleDayColumns">${dayColumns}</div>
      </div>
    </div>`;
  }

  function renderSchedulePage() {
    if (!els.scheduleGrid || !els.scheduleTrayList) return;
    els.scheduleGrid.innerHTML = buildScheduleGridHtml();
    const { unscheduled } = buildScheduleViewModel();
    els.scheduleTrayList.innerHTML = unscheduled.length
      ? unscheduled
          .map(({ task, canDrop }) => {
            const unsupportedReason =
              canDrop || (task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0)
                ? ""
                : '<span class="scheduleTrayMeta">Needs a daily time goal before it can be placed.</span>';
            return `<div class="scheduleTrayTask${canDrop ? "" : " isDisabled"}" ${
              canDrop ? 'draggable="true"' : ""
            } data-schedule-task-id="${escapeHtmlUI(String(task.id || ""))}">
              <span class="scheduleTrayTaskName">${escapeHtmlUI(task.name || "Task")}</span>
              ${unsupportedReason}
            </div>`;
          })
          .join("")
      : '<div class="scheduleTrayEmpty">All schedulable tasks are already on the planner.</div>';

    if (els.scheduleMobileDayTabs) {
      const selectedDay = normalizeScheduleDay(scheduleSelectedDay) || "mon";
      Array.from(els.scheduleMobileDayTabs.querySelectorAll<HTMLElement>("[data-schedule-day]")).forEach((button) => {
        const day = normalizeScheduleDay(button.dataset.scheduleDay);
        const isSelected = day === selectedDay;
        button.classList.toggle("isOn", isSelected);
        button.setAttribute("aria-selected", String(isSelected));
        button.setAttribute("tabindex", isSelected ? "0" : "-1");
      });
    }
  }

  function render() {
    renderTasksPage();
    renderSchedulePage();
  }

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  function resetAllOpenHistoryChartSelections() {
    historyInlineApi?.resetAllOpenHistoryChartSelections();
  }

  function renderHistory(taskId: string) {
    historyInlineApi?.renderHistory(taskId);
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
        const taskId = String(t.id || "");
        const hasTaskHistory = !!(
          taskId &&
          historyByTaskId &&
          Array.isArray(historyByTaskId[taskId]) &&
          historyByTaskId[taskId].length > 0
        );
        const hasDeletedTaskMeta = !!(taskId && deletedTaskMeta && (deletedTaskMeta as any)[taskId]);

        tasks.splice(i, 1);

        if (deleteHistory) {
          if (taskId && historyByTaskId && taskId in historyByTaskId) delete historyByTaskId[taskId];
          if (hasTaskHistory) saveHistory(historyByTaskId);

          if (hasDeletedTaskMeta) {
            delete (deletedTaskMeta as any)[taskId];
            saveDeletedMeta(deletedTaskMeta);
          }
        } else {
          deletedTaskMeta = deletedTaskMeta || ({} as DeletedTaskMeta);
          (deletedTaskMeta as any)[taskId] = { name: t.name, color: t.color || null, deletedAt: nowMs() };
          saveDeletedMeta(deletedTaskMeta);
        }

        save({ deletedTaskIds: taskId ? [taskId] : [] });
        void deleteSharedTaskSummariesForTask(String(currentUid() || ""), taskId).catch(() => {});
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

  function isTaskSharedByOwner(taskId: string): boolean {
    const uid = currentUid();
    if (!uid || !taskId) return false;
    return ownSharedSummaries.some((row) => row.ownerUid === uid && row.taskId === taskId);
  }

  function applyMainMode(mode: MainMode) {
    preferencesApi?.applyMainMode(mode);
  }

  const historyManager = createTaskTimerHistoryManager({
    els,
    on,
    runtime,
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
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
    save,
    saveHistory,
    saveHistoryAndWait,
    loadHistory,
    refreshHistoryFromCloud,
    saveDeletedMeta,
    loadDeletedMeta,
    load,
    render,
    navigateToAppRoute,
    openOverlay,
    confirm,
    closeConfirm,
    escapeHtmlUI,
    syncSharedTaskSummariesForTasks,
    syncSharedTaskSummariesForTask,
    hasEntitlement,
    getCurrentPlan,
    showUpgradePrompt,
  });
  const {
    openHistoryManager,
    registerHistoryManagerEvents,
  } = historyManager;

  const historyInline = createTaskTimerHistoryInline({
    els,
    on,
    sharedTasks: sharedTaskApi,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    nowMs,
    normalizeHistoryTimestampMs,
    formatTime,
    formatTwo,
    formatDateTime,
    escapeHtmlUI,
    sortMilestones,
    sessionColorForTaskMs,
    getModeColor: (mode) => DEFAULT_MODE_COLORS[mode] || DEFAULT_MODE_COLORS.mode1,
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    hasEntitlement,
    showUpgradePrompt,
  });
  historyInlineApi = historyInline;
  const { registerHistoryInlineEvents } = historyInline;

  const stopCheckpointRepeatAlert = () => {
    sessionApi?.stopCheckpointRepeatAlert();
  };

  const preferences = createTaskTimerPreferences({
    els,
    on,
    storageKeys: {
      THEME_KEY,
      TASK_VIEW_KEY,
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      MOBILE_PUSH_ALERTS_KEY,
      MENU_BUTTON_STYLE_KEY,
      MODE_SETTINGS_KEY,
      WEEK_STARTING_KEY,
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
    getWeekStarting: () => weekStarting,
    setWeekStartingState: (value: DashboardWeekStart) => {
      weekStarting = value;
    },
    getAutoFocusOnTaskLaunchEnabled: () => autoFocusOnTaskLaunchEnabled,
    setAutoFocusOnTaskLaunchEnabledState: (value) => {
      autoFocusOnTaskLaunchEnabled = value;
    },
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
    setDynamicColorsEnabledState: (value) => {
      dynamicColorsEnabled = value;
    },
    getMobilePushAlertsEnabled: () => mobilePushAlertsEnabled,
    setMobilePushAlertsEnabledState: (value) => {
      mobilePushAlertsEnabled = value;
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
    setCurrentModeState: (value) => {
      currentMode = value;
    },
    getEditMoveTargetMode: () => editMoveTargetMode,
    setEditMoveTargetModeState: (value) => {
      editMoveTargetMode = value;
    },
    getRewardProgress: () => rewardProgress,
    normalizeRewardProgress,
    currentUid: () => currentUid(),
    loadCachedPreferences,
    loadCachedTaskUi,
    getCloudPreferencesCache: () => cloudPreferencesCache,
    setCloudPreferencesCache: (value) => {
      cloudPreferencesCache = (value ?? null) as typeof cloudPreferencesCache;
    },
    buildDefaultCloudPreferences: () => buildDefaultCloudPreferences() as NonNullable<typeof cloudPreferencesCache>,
    saveCloudPreferences: (prefs) => {
      saveCloudPreferences(prefs as Parameters<typeof saveCloudPreferences>[0]);
    },
    syncOwnFriendshipProfile,
    saveDashboardWidgetState: saveDashboardWidgetStateApi,
    getDashboardCardSizeMapForStorage: getDashboardCardSizeMapForStorageApi,
    getDashboardAvgRange: getDashboardAvgRangeApi,
    getTasks: () => tasks,
    setTasks: (value) => {
      tasks = value;
    },
    getCurrentEditTask: () => editTaskApi?.getCurrentEditTask() ?? null,
    syncEditCheckpointAlertUi: (task) => editTaskApi?.syncEditCheckpointAlertUi(task),
    clearTaskFlipStates,
    taskModeOf,
    save,
    render,
    renderDashboardPanelMenu: () => renderDashboardPanelMenuApi(),
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    ensureDashboardIncludedModesValid: () => ensureDashboardIncludedModesValidApi(),
    closeOverlay,
    closeConfirm,
    confirm,
    escapeHtmlUI,
    stopCheckpointRepeatAlert,
    getCurrentAppPage: () => currentAppPage,
    hasEntitlement,
    getCurrentPlan,
    showUpgradePrompt,
  });
  preferencesApi = preferences;
  const {
    getModeLabel,
    getModeColor,
    isModeEnabled,
    syncModeLabelsUi,
    loadModeLabels,
    loadThemePreference,
    loadMenuButtonStylePreference,
    loadWeekStartingPreference,
    loadTaskViewPreference,
    loadAutoFocusOnTaskLaunchSetting,
    toggleSwitchElement,
    isSwitchOn,
    syncTaskSettingsUi,
    loadDynamicColorsSetting,
    loadCheckpointAlertSettings,
    registerPreferenceEvents,
  } = preferences;

  const popupMenu = createTaskTimerPopupMenu({
    els,
    on,
    openOverlay,
    closeOverlay,
    navigateToAppRoute,
    openHistoryManager,
    syncModeLabelsUi,
    syncTaskSettingsUi,
    clearHistoryEntryNoteOverlayPosition,
    hasEntitlement,
    showUpgradePrompt,
  });
  const { registerPopupMenuEvents } = popupMenu;

  editTaskApi = createTaskTimerEditTask({
    els,
    on,
    sharedTasks: sharedTaskApi,
    getTasks: () => tasks,
    getCurrentMode: () => currentMode,
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
    cloneTaskForEdit: (task) => editTaskApi?.cloneTaskForEdit(task) ?? task,
    getModeLabel,
    isModeEnabled,
    escapeHtmlUI,
    setEditTimeGoalEnabled: (enabled) => editTaskApi?.setEditTimeGoalEnabled(enabled),
    isEditTimeGoalEnabled: () => editTaskApi?.isEditTimeGoalEnabled() ?? false,
    editTaskHasActiveTimeGoal: () => editTaskApi?.editTaskHasActiveTimeGoal() ?? false,
    syncEditTaskTimeGoalUi: (task) => editTaskApi?.syncEditTaskTimeGoalUi(task),
    syncEditCheckpointAlertUi: (task) => editTaskApi?.syncEditCheckpointAlertUi(task),
    syncEditSaveAvailability: (task) => editTaskApi?.syncEditSaveAvailability(task),
    syncEditMilestoneSectionUi: (task) => editTaskApi?.syncEditMilestoneSectionUi(task),
    setMilestoneUnitUi: (unit) => editTaskApi?.setMilestoneUnitUi(unit),
    renderMilestoneEditor: (task) => editTaskApi?.renderMilestoneEditor(task),
    clearEditValidationState: () => editTaskApi?.clearEditValidationState(),
    validateEditTimeGoal: () => editTaskApi?.validateEditTimeGoal() ?? true,
    showEditValidationError: (task, message) => editTaskApi?.showEditValidationError(task, message),
    getEditTaskTimeGoalMinutes: () => editTaskApi?.getEditTaskTimeGoalMinutes() ?? 0,
    getEditTaskTimeGoalMinutesFor: (value, unit, period) => editTaskApi?.getEditTaskTimeGoalMinutesFor(value, unit, period) ?? 0,
    getAddTaskTimeGoalMinutesState: () => addTaskApi?.getAddTaskTimeGoalMinutesState() ?? 0,
    sortMilestones,
    toggleSwitchElement,
    isSwitchOn,
    buildEditDraftSnapshot: (task) => editTaskApi?.buildEditDraftSnapshot(task) ?? "",
    syncEditTaskDurationReadout: (task) => editTaskApi?.syncEditTaskDurationReadout(task),
    maybeToggleEditPresetIntervals: (nextEnabled) => editTaskApi?.maybeToggleEditPresetIntervals(nextEnabled),
    isEditMilestoneUnitDay: () => editTaskApi?.isEditMilestoneUnitDay() ?? false,
    resetCheckpointAlertTracking: (taskId) => sessionApi?.resetCheckpointAlertTracking(taskId),
    clearCheckpointBaseline: (taskId) => sessionApi?.clearCheckpointBaseline(taskId),
    syncSharedTaskSummariesForTask,
    hasEntitlement,
    showUpgradePrompt,
  });
  {
    const { closeEdit, openElapsedPadForMilestone, closeElapsedPad, registerEditTaskEvents: registerEditTaskEventsLocal } =
      editTaskApi;
    closeEditApi = closeEdit;
    openElapsedPadForMilestoneApi = openElapsedPadForMilestone;
    closeElapsedPadApi = closeElapsedPad;
    registerEditTaskEvents = registerEditTaskEventsLocal;
  }

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
    setFocusSessionNotesSectionOpen: (_open) => {
      if (els.focusSessionNotesSection) {
        els.focusSessionNotesSection.setAttribute("data-notes-visible", "true");
      }
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
    loadWeekStartingPreference,
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
    renderDashboardWidgets: () => renderDashboardWidgetsWithBusy(),
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    maybeHandlePendingTaskJump,
    maybeHandlePendingPushAction,
    maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
    currentUid: () => currentUid(),
    showDashboardBusyIndicator,
    hideDashboardBusyIndicator,
    setDashboardRefreshPending,
  });

  function wireEvents() {
    const ARCHIE_HELP_REQUEST_EVENT = "tasktimer:archieHelpRequest";
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
      setEditPresetIntervalsInfoOpen(false);
      window.dispatchEvent(
        new CustomEvent(ARCHIE_HELP_REQUEST_EVENT, {
          detail: {
            message: "Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint.",
          },
        })
      );
    });
    on(document as any, "click", (e: any) => {
      const target = e?.target as HTMLElement | null;
      if (target?.closest?.("#editPresetIntervalsInfoBtn")) return;
      if (target?.closest?.("#editPresetIntervalsInfoDialog")) return;
      setEditPresetIntervalsInfoOpen(false);
    });
    registerAppShellEvents();
    on(document as any, "click", (e: any) => {
      const dayButton = (e?.target as HTMLElement | null)?.closest?.("[data-schedule-day]") as HTMLElement | null;
      if (!dayButton) return;
      const day = normalizeScheduleDay(dayButton.dataset.scheduleDay);
      if (!day) return;
      e?.preventDefault?.();
      scheduleSelectedDay = day;
      renderSchedulePage();
    });
    on(document as any, "dragstart", (e: any) => {
      const source = (e?.target as HTMLElement | null)?.closest?.("[data-schedule-task-id]") as HTMLElement | null;
      if (!source) return;
      const taskId = String(source.dataset.scheduleTaskId || "").trim();
      if (!taskId) return;
      const task = tasks.find((entry) => String(entry.id || "") === taskId);
      if (!task || !isScheduleRenderableTask(task)) {
        e?.preventDefault?.();
        return;
      }
      scheduleDragTaskId = taskId;
      source.classList.add("isDragging");
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", taskId);
      } catch {
        // ignore browser drag transfer failures
      }
    });
    on(document as any, "dragend", (e: any) => {
      scheduleDragTaskId = null;
      (e?.target as HTMLElement | null)?.closest?.("[data-schedule-task-id]")?.classList?.remove?.("isDragging");
      document.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
    });
    on(document as any, "dragover", (e: any) => {
      const dropZone = (e?.target as HTMLElement | null)?.closest?.("[data-schedule-drop-day]") as HTMLElement | null;
      if (!dropZone || !scheduleDragTaskId) return;
      e?.preventDefault?.();
      document.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
      dropZone.classList.add("isDropActive");
      try {
        e.dataTransfer.dropEffect = "move";
      } catch {
        // ignore browser drag transfer failures
      }
    });
    on(document as any, "drop", (e: any) => {
      const dropZone = (e?.target as HTMLElement | null)?.closest?.("[data-schedule-drop-day]") as HTMLElement | null;
      if (!dropZone || !els.scheduleGridScroller) return;
      const taskId = scheduleDragTaskId || String(e?.dataTransfer?.getData?.("text/plain") || "").trim();
      const day = normalizeScheduleDay(dropZone.dataset.scheduleDropDay);
      if (!taskId || !day) return;
      e?.preventDefault?.();
      const rect = dropZone.getBoundingClientRect();
      const yWithinColumn = Math.max(0, (Number(e?.clientY) || 0) - rect.top + els.scheduleGridScroller.scrollTop);
      const startMinutes = snapScheduleMinutes(yWithinColumn / SCHEDULE_MINUTE_PX);
      moveTaskOnSchedule(taskId, day, startMinutes);
      document.querySelectorAll(".scheduleDayColumn.isDropActive").forEach((node) => node.classList.remove("isDropActive"));
      scheduleDragTaskId = null;
    });
    on(els.rewardsInfoOpenBtn, "click", (e: any) => {
      e?.preventDefault?.();
      openOverlay(els.rewardsInfoOverlay as HTMLElement | null);
    });
    on(window, "resize", () => {
      if (currentAppPage === "schedule") renderSchedulePage();
      if (taskView !== "tile" || !els.taskList) return;
      const nextCount = getTileColumnCount();
      if (nextCount !== currentTileColumnCount) render();
    });
    on(window, TASKTIMER_PLAN_CHANGED_EVENT as any, () => {
      if (runtime.destroyed) return;
      render();
      if (currentAppPage === "dashboard") renderDashboardWidgetsWithBusy();
      if (currentAppPage === "test2") renderGroupsPage();
      if (!els.taskList && els.historyManagerScreen) openHistoryManager();
    });
    registerGroupsEvents();
    registerAddTaskEvents();

    registerTaskEvents();
    registerTaskListUiEvents();
    registerDashboardEvents();
    registerPreferenceEvents({
      handleAppBackNavigation: () => {
        const currentRoutePath = normalizeTaskTimerRoutePath(normalizedPathname());
        if (currentRoutePath === "/settings") {
          window.location.href = appPathForPage("dashboard");
          return true;
        }
        return handleAppBackNavigation();
      },
    });
    registerHistoryInlineEvents();
    registerHistoryManagerEvents();
    registerSessionEvents();
    registerEditTaskEvents();

    registerPopupMenuEvents();
    registerImportExportEvents();

    on(els.dashboardRefreshBtn, "click", () => {
      if (dashboardBusyOverlayActive || dashboardBusyStack.length > 0 || dashboardBusyHideTimer != null || dashboardMenuFlipped) return;
      setDashboardRefreshPending(false);
      void rehydrateFromCloudAndRender({ force: true });
    });
    on(els.dashboardHeatSummaryCloseBtn, "click", () => {
      closeDashboardHeatSummaryCardApi({ restoreFocus: true });
    });
    registerConfirmOverlayEvents();
  }

  function hydrateUiStateFromCaches(opts?: { skipDashboardWidgetsRender?: boolean }) {
    persistenceApi?.hydrateUiStateFromCaches(opts);
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
      maybeHandlePendingPushAction();
      void rehydrateFromCloudAndRender({ force: true }).then(() => {
        if (runtime.destroyed) return;
        maybeHandlePendingTaskJump();
        maybeHandlePendingPushAction();
        maybeRestorePendingTimeGoalFlowApi();
      });
    });
    maybeOpenImportFromQuery();
    syncDashboardMenuFlipUi();
    syncDashboardRefreshButtonUi();
  };

  bootstrap();

  const finishBootstrapUi = () => {
    if (runtime.destroyed) return;
    render();
    maybeHandlePendingTaskJump();
    maybeHandlePendingPushAction();
    if (!els.taskList && els.historyManagerScreen) {
      openHistoryManager();
    }
    if (!runtime.tickStarted) {
      tickApi();
      runtime.tickStarted = true;
    }
  };

  if (currentAppPage === "dashboard") {
    finishBootstrapUi();
    setDashboardRefreshPending(true);
  } else {
    const shouldHydrateBeforeInteractiveBoot = !!currentUid();
    if (shouldHydrateBeforeInteractiveBoot) {
      void rehydrateFromCloudAndRender()
        .catch(() => {
          // Fall back to cached state if the initial cloud hydrate is unavailable.
        })
        .finally(() => {
          finishBootstrapUi();
        });
    } else {
      finishBootstrapUi();
      void rehydrateFromCloudAndRender();
    }
  }

  return { destroy };
}

export function initTaskTimerTasksClient(): TaskTimerClientHandle {
  return initTaskTimerClient("tasks");
}

export function initTaskTimerDashboardClient(): TaskTimerClientHandle {
  return initTaskTimerClient("dashboard");
}

export function initTaskTimerFriendsClient(): TaskTimerClientHandle {
  return initTaskTimerClient("test2");
}

export function initTaskTimerSettingsClient(): TaskTimerClientHandle {
  return initTaskTimerClient();
}

export function initTaskTimerHistoryManagerClient(): TaskTimerClientHandle {
  return initTaskTimerClient();
}

export function initTaskTimerFeedbackClient(): TaskTimerClientHandle {
  return initTaskTimerClient();
}

export function initTaskTimerUserGuideClient(): TaskTimerClientHandle {
  return initTaskTimerClient();
}
