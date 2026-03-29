﻿/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey } from "./lib/history";
import {
} from "./lib/historyChart";
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
import { createTaskTimerConfirmOverlay } from "./client/confirm-overlay";
import { createTaskTimerPopupMenu } from "./client/popup-menu";
import { createTaskTimerImportExport } from "./client/import-export";
import { createTaskTimerTaskListUi } from "./client/task-list-ui";
import { createTaskTimerRootBootstrap, createTaskTimerStateAccessor } from "./client/root-state";
import { createTaskTimerSharedTask } from "./client/task-shared";
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
    selectDashboardTimelineSuggestion: selectDashboardTimelineSuggestionApi,
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
    selectDashboardTimelineSuggestion: (key) => selectDashboardTimelineSuggestionApi(key),
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
    jumpToTaskAndHighlight,
    openElapsedPadForMilestone: (task, milestone, ms, onApplied) =>
      openElapsedPadForMilestoneApi(task, milestone, ms, onApplied),
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

  function persistPreferencesToCloud() {
    preferencesApi?.persistPreferencesToCloud();
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

  function render() {
    renderTasksPage();
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
    openOverlay,
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
    getDynamicColorsEnabled: () => dynamicColorsEnabled,
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
    renderDashboardWidgets: (opts) => renderDashboardWidgetsApi(opts),
    ensureDashboardIncludedModesValid: () => ensureDashboardIncludedModesValidApi(),
    closeOverlay,
    closeConfirm,
    confirm,
    escapeHtmlUI,
    stopCheckpointRepeatAlert,
    getCurrentAppPage: () => currentAppPage,
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
    loadDefaultTaskTimerFormat,
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

  function wireEvents() {
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
    registerAppShellEvents();
    on(els.rewardsInfoOpenBtn, "click", (e: any) => {
      e?.preventDefault?.();
      openOverlay(els.rewardsInfoOverlay as HTMLElement | null);
    });
    on(window, "resize", () => {
      if (taskView !== "tile" || !els.taskList) return;
      const nextCount = getTileColumnCount();
      if (nextCount !== currentTileColumnCount) render();
    });
    registerGroupsEvents();
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
    registerTaskListUiEvents();
    registerDashboardEvents();
    registerPreferenceEvents({
      handleAppBackNavigation: () => {
        const currentRoutePath = normalizeTaskTimerRoutePath(normalizedPathname());
        if (currentRoutePath === "/tasktimer/settings") {
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

    on(els.dashboardHeatSummaryCloseBtn, "click", () => {
      closeDashboardHeatSummaryCardApi({ restoreFocus: true });
    });
    registerConfirmOverlayEvents();
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
