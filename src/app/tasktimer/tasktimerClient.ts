﻿/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey } from "./lib/history";
import { formatMainTaskElapsed, formatMainTaskElapsedHtml } from "./lib/tasks";
import { AVATAR_CATALOG } from "./lib/avatarCatalog";
import {
  deleteSharedTaskSummariesForTask,
  syncOwnFriendshipProfile,
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
import type { TaskUiConfig } from "./lib/cloudStore";
import {
  DEFAULT_REWARD_PROGRESS,
  normalizeRewardProgress,
} from "./lib/rewards";
import {
  hasTaskTimerEntitlement,
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerEntitlement,
  type TaskTimerPlan,
} from "./lib/entitlements";
import type {
  AppPage,
  DashboardRenderOptions,
  MainMode,
  TaskTimerClientHandle,
  TaskTimerMutableState,
} from "./client/types";
import { collectTaskTimerElements } from "./client/elements";
import { createTaskTimerRuntime, destroyTaskTimerRuntime } from "./client/runtime";
import { createTaskTimerAppShell } from "./client/app-shell";
import { createTaskTimerGroups } from "./client/groups";
import { createTaskTimerSession } from "./client/session";
import { createTaskTimerTasks } from "./client/tasks";
import { isSwitchEnabled, setSwitchState } from "./client/control-helpers";
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
import { createTaskTimerMutableStore } from "./client/mutable-store";
import { createTaskTimerRootBootstrap } from "./client/root-state";
import { createTaskTimerSharedTask } from "./client/task-shared";
import {
  buildExitAppConfirmOptions,
  buildUpgradePromptConfirmOptions,
} from "./client/confirm-actions";
import {
  buildFriendInitialAvatarDataUrl,
  buildFriendAvatarSrcMap,
  getFriendAvatarSrcById,
  getFriendAvatarSrc,
  getMergedFriendProfile,
} from "./client/friend-avatar";
import {
  registerTaskTimerRootEvents,
  startTaskTimerRootLifecycle,
} from "./client/root-runtime";
import {
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "./client/state";
import { createTaskTimerWorkspaceRepository } from "./lib/workspaceRepository";
import { type ScheduleDay } from "./lib/schedule-placement";
import {
  createTaskTimerScheduleRuntime,
  formatScheduleDayLabel,
  isScheduleMobileLayout,
  isScheduleRenderableTask,
  isRecurringDailyScheduleTask,
  normalizeScheduleDay,
  SCHEDULE_MINUTE_PX,
  type TaskTimerScheduleState,
} from "./client/schedule-runtime";
import {
  broadcastTaskTimerCheckpointAlertMute,
  getCurrentTaskTimerEmail,
  getCurrentTaskTimerUid,
} from "./client/runtime-bridge";
import {
  addRangeMsToLocalDayMap,
  createTaskTimerRewardSessionBridge,
} from "./client/reward-session-bridge";
import { createTaskTimerRuntimeActions } from "./client/runtime-actions";
import { createTaskTimerTaskDelete } from "./client/task-delete";
import {
  createTaskTimerAddTaskStateBindings,
  createTaskTimerDashboardLayoutBindings,
  createTaskTimerEditStateBindings,
  createTaskTimerFocusBindings,
} from "./client/context-bindings";
import {
  createTaskTimerAddTaskContext,
  createTaskTimerAppShellContext,
  createTaskTimerDashboardFeature,
  createTaskTimerGroupsContext,
  createTaskTimerHistoryInlineContext,
  createTaskTimerHistoryManagerContext,
  createTaskTimerPersistenceContext,
  createTaskTimerPreferencesContext,
  createTaskTimerRewardsHistoryContext,
  createTaskTimerSessionContext,
  createTaskTimerTasksContext,
} from "./client/feature-context-builders";
import {
  createTaskTimerRuntimeCoordinator,
} from "./client/runtime-coordinator";
import { createTaskTimerRuntimeFacade } from "./client/runtime-facade";

const ARCHITECT_EMAIL = "aniven82@gmail.com";
const DASHBOARD_BUSY_MIN_VISIBLE_MS = 420;

export function initTaskTimerClient(initialAppPage: AppPage = "tasks"): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }
  const {
    initialState,
    storageKeys: {
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      MOBILE_PUSH_ALERTS_KEY,
      WEB_PUSH_ALERTS_KEY,
      THEME_KEY,
      MENU_BUTTON_STYLE_KEY,
      WEEK_STARTING_KEY,
      TASK_VIEW_KEY,
      OPTIMAL_PRODUCTIVITY_START_TIME_KEY,
      OPTIMAL_PRODUCTIVITY_END_TIME_KEY,
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
  const ARCHIE_NAVIGATE_EVENT = "tasktimer:archieNavigate";

  const runtime = createTaskTimerRuntime();
  const workspaceRepository = createTaskTimerWorkspaceRepository();
  const cloudSyncState = createTaskTimerMutableStore({
    cloudRefreshInFlight: initialState.cloudRefreshInFlight,
    lastCloudRefreshAtMs: initialState.lastCloudRefreshAtMs,
    deferredCloudRefreshTimer: null as number | null,
    pendingDeferredCloudRefresh: initialState.pendingDeferredCloudRefresh,
    lastUiInteractionAtMs: initialState.lastUiInteractionAtMs,
  });
  const dashboardBusyState = createTaskTimerMutableStore({
    stack: initialState.dashboardBusyStack,
    keySeq: initialState.dashboardBusyKeySeq,
    overlayActive: initialState.dashboardBusyOverlayActive,
    restoreFocusEl: initialState.dashboardBusyRestoreFocusEl,
    shownAtMs: initialState.dashboardBusyShownAtMs,
    hideTimer: initialState.dashboardBusyHideTimer,
  });
  const modalState = createTaskTimerMutableStore({
    confirmAction: initialState.confirmAction,
    confirmActionAlt: initialState.confirmActionAlt,
    timeGoalModalTaskId: initialState.timeGoalModalTaskId,
    timeGoalModalFrozenElapsedMs: initialState.timeGoalModalFrozenElapsedMs,
  });
  const scheduleState = createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null as string | null,
    dragSourceDay: null as ScheduleDay | null,
    dragPreviewDay: null as ScheduleDay | null,
    dragPreviewStartMinutes: null as number | null,
    dragPointerOffsetMinutes: 0,
  });
  const workingIndicatorState = createTaskTimerMutableStore({
    stack: initialState.workingIndicatorStack,
    keySeq: initialState.workingIndicatorKeySeq,
    overlayActive: initialState.workingIndicatorOverlayActive,
    restoreFocusEl: initialState.workingIndicatorRestoreFocusEl,
  });
  const appRuntimeState = createTaskTimerMutableStore({
    dashboardMenuFlipped: initialState.dashboardMenuFlipped,
    currentAppPage: initialState.currentAppPage,
    currentTileColumnCount: initialState.currentTileColumnCount,
    suppressNavStackPush: initialState.suppressNavStackPush,
    lastNativeBackHandledAtMs: initialState.lastNativeBackHandledAtMs,
    dashboardRefreshPending: false,
    initialAuthHydrating: initialState.initialAuthHydrating,
  });
  const { on } = runtime;

  function getCurrentPlan(): TaskTimerPlan {
    return readTaskTimerPlanFromStorage();
  }

  function hasEntitlement(entitlement: TaskTimerEntitlement) {
    return hasTaskTimerEntitlement(getCurrentPlan(), entitlement);
  }

  const destroy = () => {
    if (unsubscribeCheckpointAlertMuteSignals) {
      unsubscribeCheckpointAlertMuteSignals();
      unsubscribeCheckpointAlertMuteSignals = null;
    }
    sessionApi?.destroySessionRuntime();
    finishInitialAuthHydration();
    dashboardBusyApi.destroy();
    destroyTaskTimerRuntime({
      runtime,
      deferredCloudRefreshTimer: cloudSyncState.get("deferredCloudRefreshTimer"),
      checkpointToastAutoCloseTimer: sessionRuntimeState.get("checkpointToastAutoCloseTimer"),
      checkpointToastCountdownRefreshTimer: sessionRuntimeState.get("checkpointToastCountdownRefreshTimer"),
      checkpointBeepQueueTimer: sessionRuntimeState.get("checkpointBeepQueueTimer"),
      checkpointRepeatCycleTimer: sessionRuntimeState.get("checkpointRepeatCycleTimer"),
      unsubscribeCachedPreferences,
    });
  };

  function showUpgradePrompt(featureLabel: string, requiredPlan: TaskTimerPlan = "pro") {
    const confirmConfig = buildUpgradePromptConfirmOptions({
      featureLabel,
      requiredPlan: requiredPlan === "pro" ? "pro" : "pro",
      closeConfirm,
      openPlans: () => {
        window.location.href = "/settings?pane=general";
      },
    });
    confirm(confirmConfig.title, confirmConfig.text, confirmConfig.options);
  }

  const taskDataState = createTaskTimerMutableStore({
    deletedTaskMeta: initialState.deletedTaskMeta,
    tasks: initialState.tasks,
    historyByTaskId: initialState.historyByTaskId,
  });
  const modeState = createTaskTimerMutableStore({
    currentMode: initialState.currentMode,
    modeLabels: initialState.modeLabels,
    modeEnabled: initialState.modeEnabled,
  });
  const focusState = createTaskTimerMutableStore({
    focusCheckpointSig: initialState.focusCheckpointSig,
    focusModeTaskId: initialState.focusModeTaskId,
    focusModeTaskName: initialState.focusModeTaskName,
    focusShowCheckpoints: initialState.focusShowCheckpoints,
    focusSessionNotesByTaskId: initialState.focusSessionNotesByTaskId,
    focusSessionNoteSaveTimer: null as number | null,
  });
  const preferencesState = createTaskTimerMutableStore({
    themeMode: initialState.themeMode,
    menuButtonStyle: initialState.menuButtonStyle,
    addTaskCustomNames: initialState.addTaskCustomNames,
    weekStarting: initialState.weekStarting,
    taskView: initialState.taskView,
    dynamicColorsEnabled: initialState.dynamicColorsEnabled,
    autoFocusOnTaskLaunchEnabled: initialState.autoFocusOnTaskLaunchEnabled,
    mobilePushAlertsEnabled: initialState.mobilePushAlertsEnabled,
    webPushAlertsEnabled: initialState.webPushAlertsEnabled,
    checkpointAlertSoundEnabled: initialState.checkpointAlertSoundEnabled,
    checkpointAlertToastEnabled: initialState.checkpointAlertToastEnabled,
    optimalProductivityStartTime: initialState.optimalProductivityStartTime,
    optimalProductivityEndTime: initialState.optimalProductivityEndTime,
  });
  const sessionRuntimeState = createTaskTimerMutableStore({
    deferredFocusModeTimeGoalModals: [] as Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }>,
    timeGoalCompleteDurationUnit: "hour" as "minute" | "hour",
    timeGoalCompleteDurationPeriod: "day" as "day" | "week",
    activeCheckpointToast: initialState.activeCheckpointToast,
    checkpointToastAutoCloseTimer: null as number | null,
    checkpointToastCountdownRefreshTimer: null as number | null,
    checkpointBeepAudio: initialState.checkpointBeepAudio,
    checkpointBeepQueueCount: initialState.checkpointBeepQueueCount,
    checkpointBeepQueueTimer: null as number | null,
    checkpointRepeatStopAtMs: initialState.checkpointRepeatStopAtMs,
    checkpointRepeatCycleTimer: null as number | null,
    checkpointRepeatActiveTaskId: initialState.checkpointRepeatActiveTaskId,
    checkpointAutoResetDirty: initialState.checkpointAutoResetDirty,
    historyNoteCloudRepairAttempted: initialState.historyNoteCloudRepairAttempted,
  });
  const rewardSessionTrackersByTaskIdInitial: Record<string, {
    taskId: string;
    untrackedMs: number;
    segments: Array<{ startMs: number; endMs: number; multiplier: number }>;
    activeSegmentStartMs: number | null;
    activeMultiplier: number | null;
  }> = {};

  const historyUiState = createTaskTimerMutableStore({
    historyRangeDaysByTaskId: initialState.historyRangeDaysByTaskId,
    historyRangeModeByTaskId: initialState.historyRangeModeByTaskId,
    pinnedHistoryTaskIds: initialState.pinnedHistoryTaskIds,
    hmExpandedTaskGroups: initialState.hmExpandedTaskGroups,
    hmExpandedDateGroups: initialState.hmExpandedDateGroups,
    hmSortKey: initialState.hmSortKey,
    hmSortDir: initialState.hmSortDir,
    hmBulkEditMode: initialState.hmBulkEditMode,
    hmBulkSelectedRows: initialState.hmBulkSelectedRows,
    hmRowsByTask: initialState.hmRowsByTask,
    hmRowsByTaskDate: initialState.hmRowsByTaskDate,
    historyEntryNoteAnchorTaskId: initialState.historyEntryNoteAnchorTaskId,
  });
  const openHistoryTaskIds = initialState.openHistoryTaskIds;
  const historyViewByTaskId = initialState.historyViewByTaskId;
  const addTaskState = createTaskTimerMutableStore({
    addTaskMilestonesEnabled: initialState.addTaskMilestonesEnabled,
    addTaskMilestoneTimeUnit: initialState.addTaskMilestoneTimeUnit,
    addTaskMilestones: initialState.addTaskMilestones,
    addTaskCheckpointSoundEnabled: initialState.addTaskCheckpointSoundEnabled,
    addTaskCheckpointSoundMode: initialState.addTaskCheckpointSoundMode,
    addTaskCheckpointToastEnabled: initialState.addTaskCheckpointToastEnabled,
    addTaskCheckpointToastMode: initialState.addTaskCheckpointToastMode,
    addTaskPresetIntervalsEnabled: initialState.addTaskPresetIntervalsEnabled,
    addTaskPresetIntervalValue: initialState.addTaskPresetIntervalValue,
    addTaskWizardStep: initialState.addTaskWizardStep,
    addTaskType: initialState.addTaskType,
    addTaskOnceOffDay: initialState.addTaskOnceOffDay,
    addTaskPlannedStartTime: initialState.addTaskPlannedStartTime,
    addTaskPlannedStartOpenEnded: initialState.addTaskPlannedStartOpenEnded,
    addTaskDurationValue: initialState.addTaskDurationValue,
    addTaskDurationUnit: initialState.addTaskDurationUnit,
    addTaskDurationPeriod: initialState.addTaskDurationPeriod,
    addTaskNoTimeGoal: initialState.addTaskNoTimeGoal,
    suppressAddTaskNameFocusOpen: initialState.suppressAddTaskNameFocusOpen,
  });
  const timeGoalReminderAtMsByTaskId = initialState.timeGoalReminderAtMsByTaskId;
  const editTaskState = createTaskTimerMutableStore({
    editIndex: initialState.editIndex,
    editDraftSnapshot: initialState.editDraftSnapshot,
    editTaskDurationUnit: "hour" as "minute" | "hour",
    editTaskDurationPeriod: "week" as "day" | "week",
    editTaskDraft: null as Task | null,
    elapsedPadTarget: initialState.elapsedPadTarget,
    elapsedPadMilestoneRef: initialState.elapsedPadMilestoneRef,
    elapsedPadDraft: initialState.elapsedPadDraft,
    elapsedPadOriginal: initialState.elapsedPadOriginal,
    editMoveTargetMode: initialState.editMoveTargetMode,
  });
  const dashboardUiState = createTaskTimerMutableStore({
    dashboardEditMode: initialState.dashboardEditMode,
    dashboardDragEl: initialState.dashboardDragEl,
    dashboardOrderDraftBeforeEdit: initialState.dashboardOrderDraftBeforeEdit,
    dashboardCardSizes: initialState.dashboardCardSizes,
    dashboardCardSizesDraftBeforeEdit: initialState.dashboardCardSizesDraftBeforeEdit,
    dashboardCardVisibility: initialState.dashboardCardVisibility,
    dashboardIncludedModes: initialState.dashboardIncludedModes,
    dashboardAvgRange: initialState.dashboardAvgRange,
    dashboardTimelineDensity: initialState.dashboardTimelineDensity,
  });
  const taskListRuntimeState = createTaskTimerMutableStore({
    taskDragEl: initialState.taskDragEl,
    lastRenderedTaskFlipMode: null as MainMode | null,
    lastRenderedTaskFlipView: null as "list" | "tile" | null,
  });
  const checkpointToastQueue = initialState.checkpointToastQueue;
  const checkpointFiredKeysByTaskId = initialState.checkpointFiredKeysByTaskId;
  const checkpointBaselineSecByTaskId = initialState.checkpointBaselineSecByTaskId;
  const cacheRuntimeState = createTaskTimerMutableStore({
    cloudPreferencesCache: workspaceRepository.loadCachedPreferences(),
    cloudDashboardCache: workspaceRepository.loadCachedDashboard(),
    cloudTaskUiCache: workspaceRepository.loadCachedTaskUi(),
    navStackMemory: initialState.navStackMemory,
    pendingTaskJumpMemory: initialState.pendingTaskJumpMemory,
    exportTaskIndex: initialState.exportTaskIndex,
    historyManagerRefreshInFlight: null as Promise<void> | null,
    lastDashboardLiveSignature: "",
  });
  const rewardState = createTaskTimerMutableStore({
    rewardProgress: normalizeRewardProgress((cacheRuntimeState.get("cloudPreferencesCache") || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS),
    rewardSessionTrackersByTaskId: rewardSessionTrackersByTaskIdInitial,
    cloudPreferencesCache: cacheRuntimeState.get("cloudPreferencesCache"),
  });
  const groupsState = createTaskTimerMutableStore({
    groupsIncomingRequests: initialState.groupsIncomingRequests,
    groupsOutgoingRequests: initialState.groupsOutgoingRequests,
    groupsFriendships: initialState.groupsFriendships,
    groupsSharedSummaries: initialState.groupsSharedSummaries,
    ownSharedSummaries: initialState.ownSharedSummaries,
    shareTaskIndex: initialState.shareTaskIndex,
    shareTaskMode: initialState.shareTaskMode,
    shareTaskTaskId: initialState.shareTaskTaskId,
    groupsLoading: initialState.groupsLoading,
    groupsLoadingDepth: initialState.groupsLoadingDepth,
    groupsRefreshSeq: initialState.groupsRefreshSeq,
    activeFriendProfileUid: initialState.activeFriendProfileUid,
    activeFriendProfileName: initialState.activeFriendProfileName,
    friendProfileCacheByUid: initialState.friendProfileCacheByUid,
  });
  let historyInlineApi: ReturnType<typeof createTaskTimerHistoryInline> | null = null;
  let sessionApi: ReturnType<typeof createTaskTimerSession> | null = null;
  let addTaskApi: ReturnType<typeof createTaskTimerAddTask> | null = null;
  let preferencesApi: ReturnType<typeof createTaskTimerPreferences> | null = null;
  let editTaskApi: ReturnType<typeof createTaskTimerEditTask> | null = null;
  let persistenceApi: ReturnType<typeof createTaskTimerPersistence> | null = null;
  let cloudSyncApi: ReturnType<typeof createTaskTimerCloudSync> | null = null;
  let closeEditApi: (saveChanges: boolean) => void = () => {};
  let openElapsedPadForMilestoneApi:
    (task: Task, milestone: { hours: number; description: string }, ms: Task["milestones"], onApplied?: (() => void) | undefined) => void =
      () => {};
  let closeElapsedPadApi: (applyValue: boolean) => void = () => {};
  let registerEditTaskEvents: () => void = () => {};
  const openFriendSharedTaskUids = initialState.openFriendSharedTaskUids;
  const flippedTaskIds = new Set<string>();
  let rewardsHistoryApi: ReturnType<typeof createTaskTimerRewardsHistory> | null = null;
  let runtimeActions = null as unknown as ReturnType<typeof createTaskTimerRuntimeActions>;
  const dashboardWidgetHasRenderedData = initialState.dashboardWidgetHasRenderedData;
  let unsubscribeCheckpointAlertMuteSignals: (() => void) | null = null;
  const unsubscribeCachedPreferences = workspaceRepository.subscribeCachedPreferences((prefs) => {
    cacheRuntimeState.set("cloudPreferencesCache", prefs);
    rewardState.set("cloudPreferencesCache", prefs);
    rewardState.set("rewardProgress", normalizeRewardProgress((prefs || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS));
  });
  const avatarSrcById = buildFriendAvatarSrcMap(AVATAR_CATALOG);
  const defaultFriendAvatarSrc = "/avatars/initials/initials-AN.svg";
  const friendAvatarOptions = {
    avatarSrcById,
    defaultFriendAvatarSrc,
    env: {
      exportBasePath: "",
      isNativeRuntime: !!(
        (window as any)?.Capacitor &&
        typeof (window as any).Capacitor.isNativePlatform === "function" &&
        (window as any).Capacitor.isNativePlatform()
      ),
      locationPathname: window.location.pathname || "",
      locationProtocol: window.location.protocol || "",
    },
  };
  const scheduleRuntime = createTaskTimerScheduleRuntime({
    state: scheduleState,
    getTasks: () => taskDataState.get("tasks"),
    save: () => runtimeActions.save(),
    render: () => render(),
  });
  const rewardSessionBridge = createTaskTimerRewardSessionBridge({
    getRewardsHistoryApi: () => rewardsHistoryApi,
    getTaskElapsedMs: (task) => getTaskElapsedMs(task),
  });

  const els = collectTaskTimerElements(document);
  const sharedTaskApi = createTaskTimerSharedTask({
    createId: () => cryptoRandomId(),
    getCurrentMode: () => modeState.get("currentMode"),
    getEditTimeGoalDraft: () => ({
      value: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      unit: editTaskState.get("editTaskDurationUnit"),
      period: editTaskState.get("editTaskDurationPeriod"),
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
    const confirmConfig = buildExitAppConfirmOptions({
      closeConfirm,
      exitApp: () => exitAppNow(),
    });
    confirm(confirmConfig.title, confirmConfig.text, confirmConfig.options);
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
    getConfirmAction: () => modalState.get("confirmAction"),
    setConfirmAction: (value) => {
      modalState.set("confirmAction", value);
    },
    getConfirmActionAlt: () => modalState.get("confirmActionAlt"),
    setConfirmActionAlt: (value) => {
      modalState.set("confirmActionAlt", value);
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
  const planBindings = { hasEntitlement, getCurrentPlan, showUpgradePrompt };
  const overlayBindings = { openOverlay, closeOverlay, confirm, closeConfirm };
  let syncDashboardRefreshButtonUi = () => {};
  let syncDashboardMenuFlipUi = () => {};
  let renderDashboardWidgetsWithBusy: (opts?: DashboardRenderOptions) => void = () => {};
  let renderDashboardLiveWidgetsWithMemo = () => {};
  let escapeHtmlUI: (str: unknown) => string = (str) => String(str ?? "");
  let getElapsedMs: (task: Task) => number = () => 0;
  let getTaskElapsedMs: (task: Task) => number = () => 0;
  let renderSchedulePage = () => {};
  let requestScheduleEntryScroll = () => {};
  let render = () => {};
  let resetAllOpenHistoryChartSelections = () => {};
  let renderHistory: (taskId: string) => void = () => {};
  let isTaskSharedByOwner: (taskId: string) => boolean = () => false;
  let applyMainMode: (mode: MainMode) => void = () => {};
  const taskCollectionBindings = {
    getTasks: () => taskDataState.get("tasks"),
    setTasks: (value: TaskTimerMutableState["tasks"]) => {
      taskDataState.set("tasks", value);
    },
    getHistoryByTaskId: () => taskDataState.get("historyByTaskId"),
    setHistoryByTaskId: (value: TaskTimerMutableState["historyByTaskId"]) => {
      taskDataState.set("historyByTaskId", value);
    },
    getDeletedTaskMeta: () => taskDataState.get("deletedTaskMeta"),
    setDeletedTaskMeta: (value: TaskTimerMutableState["deletedTaskMeta"]) => {
      taskDataState.set("deletedTaskMeta", value);
    },
  };
  const renderBindings = {
    render,
    renderDashboardWidgets: (opts?: DashboardRenderOptions) => renderDashboardWidgetsWithBusy(opts),
    save: (opts?: { deletedTaskIds?: string[] }) => runtimeActions.save(opts),
  };
  const currentAppPageBinding = {
    getCurrentAppPage: () => appRuntimeState.get("currentAppPage"),
  };
  const dashboardLayoutBindings = createTaskTimerDashboardLayoutBindings(dashboardUiState);
  const editStateBindings = createTaskTimerEditStateBindings(editTaskState);
  const addTaskStateBindings = createTaskTimerAddTaskStateBindings(addTaskState);
  const focusBindings = createTaskTimerFocusBindings(focusState);

  const importExport = createTaskTimerImportExport({
    els,
    on,
    getTasks: taskCollectionBindings.getTasks,
    setTasks: taskCollectionBindings.setTasks,
    getHistoryByTaskId: taskCollectionBindings.getHistoryByTaskId,
    setHistoryByTaskId: taskCollectionBindings.setHistoryByTaskId,
    getExportTaskIndex: () => cacheRuntimeState.get("exportTaskIndex"),
    setExportTaskIndex: (value) => {
      cacheRuntimeState.set("exportTaskIndex", value);
    },
    ...overlayBindings,
    ...renderBindings,
    saveHistory,
    createId: () => cryptoRandomId(),
    makeTask: (name, order) => makeTask(name, order),
    sortMilestones,
    ensureMilestoneIdentity: (task) => ensureMilestoneIdentity(task),
    getPresetIntervalValueNum: (task) => getPresetIntervalValueNum(task),
    getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
    cleanupHistory,
    ...planBindings,
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
    getTasks: taskCollectionBindings.getTasks,
    setTasks: taskCollectionBindings.setTasks,
    getCurrentMode: () => modeState.get("currentMode"),
    ...currentAppPageBinding,
    getTaskView: () => preferencesState.get("taskView"),
    getTaskDragEl: () => taskListRuntimeState.get("taskDragEl"),
    setTaskDragEl: (value) => {
      taskListRuntimeState.set("taskDragEl", value);
    },
    getFlippedTaskIds: () => flippedTaskIds,
    getLastRenderedTaskFlipMode: () => taskListRuntimeState.get("lastRenderedTaskFlipMode"),
    setLastRenderedTaskFlipMode: (value) => {
      taskListRuntimeState.set("lastRenderedTaskFlipMode", value);
    },
    getLastRenderedTaskFlipView: () => taskListRuntimeState.get("lastRenderedTaskFlipView"),
    setLastRenderedTaskFlipView: (value) => {
      taskListRuntimeState.set("lastRenderedTaskFlipView", value);
    },
    taskModeOf,
    ...renderBindings,
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
    getCurrentUid: () => getCurrentTaskTimerUid(),
    getHistoryRangeDaysByTaskId: () => historyUiState.get("historyRangeDaysByTaskId"),
    getHistoryRangeModeByTaskId: () => historyUiState.get("historyRangeModeByTaskId"),
    getPinnedHistoryTaskIds: () => historyUiState.get("pinnedHistoryTaskIds"),
    setPinnedHistoryTaskIds: (value) => {
      historyUiState.set("pinnedHistoryTaskIds", value);
    },
    getAddTaskCustomNames: () => preferencesState.get("addTaskCustomNames"),
    getCloudTaskUiCache: () => cacheRuntimeState.get("cloudTaskUiCache"),
    setCloudTaskUiCache: (value) => {
      cacheRuntimeState.set("cloudTaskUiCache", value as TaskUiConfig | null);
    },
    loadCachedTaskUi,
    saveCloudTaskUi: (value) => {
      saveCloudTaskUi(value as Parameters<typeof saveCloudTaskUi>[0]);
    },
    getTasks: taskCollectionBindings.getTasks,
    getHistoryByTaskId: taskCollectionBindings.getHistoryByTaskId,
    saveHistory,
    getWorkingIndicatorStack: () => workingIndicatorState.get("stack"),
    getWorkingIndicatorKeySeq: () => workingIndicatorState.get("keySeq"),
    setWorkingIndicatorKeySeq: (value) => {
      workingIndicatorState.set("keySeq", value);
    },
    getWorkingIndicatorOverlayActive: () => workingIndicatorState.get("overlayActive"),
    setWorkingIndicatorOverlayActive: (value) => {
      workingIndicatorState.set("overlayActive", value);
    },
    getWorkingIndicatorRestoreFocusEl: () => workingIndicatorState.get("restoreFocusEl"),
    setWorkingIndicatorRestoreFocusEl: (value) => {
      workingIndicatorState.set("restoreFocusEl", value);
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

  const groupsApi = createTaskTimerGroups(
    createTaskTimerGroupsContext({
      els,
      on,
      taskCollectionBindings,
      appRuntimeState,
      modeState,
      groupsState,
      openFriendSharedTaskUids,
      getCurrentUid: () => getCurrentTaskTimerUid(),
      applyMainMode,
      applyAppPage: (page, opts) => applyAppPage(page, opts),
      render,
      closeConfirm,
      confirm,
      escapeHtmlUI,
      taskModeOf,
      normalizeHistoryTimestampMs,
      showWorkingIndicator,
      hideWorkingIndicator,
      getMergedFriendProfile: (friendUid, baseProfile) =>
        getMergedFriendProfile(friendUid, baseProfile, groupsState.get("friendProfileCacheByUid")),
      getFriendAvatarSrcById: (avatarIdRaw) => getFriendAvatarSrcById(avatarIdRaw, friendAvatarOptions),
      buildFriendInitialAvatarDataUrl,
      getFriendAvatarSrc: (profile) => getFriendAvatarSrc(profile, friendAvatarOptions),
      jumpToTaskById: (taskId) => runtimeActions.jumpToTaskById(taskId),
      hasEntitlement,
      getCurrentPlan,
      showUpgradePrompt,
    })
  );
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
  const {
    dashboardBindings,
    dashboardApi,
    closeDashboardHeatSummaryCard,
  } = createTaskTimerDashboardFeature({
    dashboardRender: {
      els,
      taskCollectionBindings,
      preferencesState,
      dashboardUiState,
      dashboardWidgetHasRenderedData,
      dashboardBusyState,
      cloudSyncState,
      getElapsedMs,
      escapeHtmlUI,
      normalizeHistoryTimestampMs,
      taskModeOf,
      isModeEnabled: (mode) => isModeEnabled(mode),
      getModeLabel: (mode) => getModeLabel(mode),
      getModeColor: (mode) => getModeColor(mode),
      addRangeMsToLocalDayMap: (dayMap, startMs, endMs) => addRangeMsToLocalDayMap(dayMap, startMs, endMs, localDayKey),
      hasEntitlement,
      getCurrentPlan,
    },
    dashboardRuntime: {
      documentRef: document,
      nowMs,
      taskCollectionBindings,
      preferencesState,
      appRuntimeState,
      setLastDashboardLiveSignature: (value) => {
        cacheRuntimeState.set("lastDashboardLiveSignature", value);
      },
      getLastDashboardLiveSignature: () => cacheRuntimeState.get("lastDashboardLiveSignature"),
      getDashboardRefreshBtn: () => els.dashboardRefreshBtn as HTMLButtonElement | null,
      getDashboardShellScene: () => els.dashboardShellScene as HTMLElement | null,
      getDashboardShellContent: () => els.dashboardShellContent as HTMLElement | null,
      getDashboardShellBack: () => els.dashboardShellBack as HTMLElement | null,
      getDashboardPanelMenuBtn: () => els.dashboardPanelMenuBtn as HTMLButtonElement | null,
      getDashboardPanelMenuBackBtn: () => els.dashboardPanelMenuBackBtn as HTMLButtonElement | null,
    },
    dashboardBindings: {
      setDashboardRefreshPendingValue: (value) => {
        appRuntimeState.set("dashboardRefreshPending", value);
      },
      dashboardBusyState,
      nowMs,
      minVisibleMs: DASHBOARD_BUSY_MIN_VISIBLE_MS,
      getOverlayEl: () => els.dashboardRefreshBusyOverlay as HTMLElement | null,
      getTextEl: () => els.dashboardRefreshBusyText as HTMLElement | null,
      getShellContentEl: () => els.dashboardShellContent as HTMLElement | null,
    },
    dashboard: {
      els,
      on,
      hasEntitlement,
      showUpgradePrompt,
      rewardState,
      taskCollectionBindings,
      currentAppPageBinding,
      appRuntimeState,
      preferencesState,
      dashboardLayoutBindings,
      getCloudDashboardCache: () => cacheRuntimeState.get("cloudDashboardCache"),
      setCloudDashboardCache: (value: unknown) => {
        cacheRuntimeState.set("cloudDashboardCache", value as ReturnType<typeof loadCachedDashboard>);
      },
      loadCachedDashboard,
      saveCloudDashboard: (value: unknown) => {
        const nextDashboard = value as NonNullable<ReturnType<typeof loadCachedDashboard>>;
        if (nextDashboard) saveCloudDashboard(nextDashboard);
      },
      getModeLabel: (mode) => getModeLabel(mode),
      isModeEnabled: (mode) => isModeEnabled(mode),
      taskModeOf,
    },
  });
  const {
    dashboardBusyApi,
    setDashboardRefreshPending,
    showDashboardBusyIndicator,
    hideDashboardBusyIndicator,
    syncDashboardRefreshButtonUi: syncDashboardRefreshButtonUiBound,
    syncDashboardMenuFlipUi: syncDashboardMenuFlipUiBound,
    renderDashboardWidgetsWithBusy: renderDashboardWidgetsWithBusyBound,
    renderDashboardLiveWidgetsWithMemo: renderDashboardLiveWidgetsWithMemoBound,
  } = dashboardBindings;
  syncDashboardRefreshButtonUi = syncDashboardRefreshButtonUiBound;
  syncDashboardMenuFlipUi = syncDashboardMenuFlipUiBound;
  renderDashboardWidgetsWithBusy = renderDashboardWidgetsWithBusyBound;
  renderDashboardLiveWidgetsWithMemo = renderDashboardLiveWidgetsWithMemoBound;

  function setInitialAuthBusyVisible(isOn: boolean, message?: string) {
    const overlayEl = els.initialAuthBusyOverlay as HTMLElement | null;
    const textEl = els.initialAuthBusyText as HTMLElement | null;
    if (textEl && typeof message === "string" && message.trim()) {
      textEl.textContent = message.trim();
    } else if (textEl && !isOn) {
      textEl.textContent = "Loading your workspace into this session...";
    }
    document.body.classList.toggle("isInitialAuthHydrating", !!isOn);
    if (!overlayEl) return;
    overlayEl.classList.toggle("isOn", !!isOn);
    overlayEl.setAttribute("aria-hidden", isOn ? "false" : "true");
    if (isOn) {
      try {
        overlayEl.focus({ preventScroll: true });
      } catch {
        overlayEl.focus();
      }
    }
  }

  function startInitialAuthHydration(message = "Loading your workspace into this session...") {
    appRuntimeState.set("initialAuthHydrating", true);
    setInitialAuthBusyVisible(true, message);
  }

  function finishInitialAuthHydration() {
    appRuntimeState.set("initialAuthHydrating", false);
    setInitialAuthBusyVisible(false);
  }

  function isInitialAuthHydrating() {
    return !!appRuntimeState.get("initialAuthHydrating");
  }
  setInitialAuthBusyVisible(isInitialAuthHydrating());
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
  const tasksApi = createTaskTimerTasks(
    createTaskTimerTasksContext({
      els,
      on,
      sharedTasks: sharedTaskApi,
      taskCollectionBindings,
      appRuntimeState,
      modeState,
      preferencesState,
      rewardState,
      historyUiState,
      openHistoryTaskIds,
      historyViewByTaskId,
      focusModeTaskId: focusBindings.getFocusModeTaskId,
      editStateBindings,
      checkpointAutoResetDirty: () => sessionRuntimeState.get("checkpointAutoResetDirty"),
      setCheckpointAutoResetDirty: (value) => {
        sessionRuntimeState.set("checkpointAutoResetDirty", value);
      },
      render,
      renderHistory,
      renderDashboardWidgets: renderBindings.renderDashboardWidgets,
      syncTimeGoalModalWithTaskState: () => sessionApi?.syncTimeGoalModalWithTaskState(),
      maybeRestorePendingTimeGoalFlow: () => sessionApi?.maybeRestorePendingTimeGoalFlow(),
      getElapsedMs: (task) => sessionApi?.getElapsedMs(task) ?? 0,
      getTaskElapsedMs: (task) => sessionApi?.getTaskElapsedMs(task) ?? 0,
      save: renderBindings.save,
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
      openRewardSessionSegment: (task, startMsRaw) => rewardSessionBridge.openRewardSessionSegment(task, startMsRaw),
      closeRewardSessionSegment: (task, endMsRaw) => rewardSessionBridge.closeRewardSessionSegment(task, endMsRaw),
      clearRewardSessionTracker: (taskIdRaw) => rewardSessionBridge.clearRewardSessionTracker(taskIdRaw),
      openFocusMode: (index) => sessionApi?.openFocusMode(index),
      closeFocusMode: () => sessionApi?.closeFocusMode(),
      canLogSession: (task) => rewardSessionBridge.canLogSession(task),
      appendCompletedSessionHistory: (task, completedAtMs, elapsedMs, noteOverride, completionDifficulty) =>
        rewardSessionBridge.appendCompletedSessionHistory(task, completedAtMs, elapsedMs, noteOverride, completionDifficulty),
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
      currentUid: () => getCurrentTaskTimerUid(),
      deleteSharedTaskSummariesForTask,
      refreshOwnSharedSummaries,
      refreshGroupsData,
      deleteTask: (index) => deleteTask(index),
      checkpointRepeatActiveTaskId: () => sessionApi?.checkpointRepeatActiveTaskId() || null,
      activeCheckpointToastTaskId: () => sessionApi?.activeCheckpointToastTaskId() || null,
      stopCheckpointRepeatAlert: () => sessionApi?.stopCheckpointRepeatAlert(),
      broadcastCheckpointAlertMute: (taskId) => broadcastTaskTimerCheckpointAlertMute(taskId),
      enqueueCheckpointToast: (title, text, opts) => sessionApi?.enqueueCheckpointToast(title, text, opts as any),
      syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
      syncSharedTaskSummariesForTasks: (taskIds) => syncSharedTaskSummariesForTasks(taskIds),
      hasEntitlement,
      getCurrentPlan,
      showUpgradePrompt,
    })
  );
  const {
    renderTasksPage,
    startTask: startTaskApi,
    stopTask: stopTaskApi,
    resetTask: resetTaskApi,
    resetTaskStateImmediate: resetTaskStateImmediateApi,
    registerTaskEvents,
  } = tasksApi;
  addTaskApi = createTaskTimerAddTask(
    createTaskTimerAddTaskContext({
      els,
      on,
      sharedTasks: sharedTaskApi,
      taskCollectionBindings,
      modeState,
      addTaskStateBindings,
      preferencesState,
      getCheckpointAlertSoundEnabled: () => preferencesState.get("checkpointAlertSoundEnabled"),
      getCheckpointAlertToastEnabled: () => preferencesState.get("checkpointAlertToastEnabled"),
      loadCachedTaskUi: () => cacheRuntimeState.get("cloudTaskUiCache") || loadCachedTaskUi(),
      saveCloudTaskUi: (next) => {
        cacheRuntimeState.set("cloudTaskUiCache", next as TaskUiConfig | null);
        saveCloudTaskUi(next as Parameters<typeof saveCloudTaskUi>[0]);
      },
      openOverlay: overlayBindings.openOverlay,
      closeOverlay: overlayBindings.closeOverlay,
      save: renderBindings.save,
      render,
      escapeHtmlUI,
      sortMilestones,
      jumpToTaskAndHighlight,
      openElapsedPadForMilestone: (task, milestone, ms, onApplied) =>
        openElapsedPadForMilestoneApi(task, milestone, ms, onApplied),
      hasEntitlement,
      showUpgradePrompt,
    })
  );
  const { registerAddTaskEvents, loadAddTaskCustomNames: loadAddTaskCustomNamesApi } = addTaskApi;

  function navigateToAppRouteViaShell(path: string) {
    navigateToAppRoute(path);
  }

  sessionApi = createTaskTimerSession(
    createTaskTimerSessionContext({
      els,
      on,
      runtime,
      sharedTasks: sharedTaskApi,
      storageKeys: { FOCUS_SESSION_NOTES_KEY, TIME_GOAL_PENDING_FLOW_KEY },
      getTasks: taskCollectionBindings.getTasks,
      appRuntimeState,
      getHistoryByTaskId: taskCollectionBindings.getHistoryByTaskId,
      preferencesState,
      dashboardUiState,
      rewardState,
      focusBindings,
      deferredFocusModeTimeGoalModals: () => sessionRuntimeState.get("deferredFocusModeTimeGoalModals"),
      setDeferredFocusModeTimeGoalModals: (value) => {
        sessionRuntimeState.set("deferredFocusModeTimeGoalModals", value);
      },
      modalState,
      getTimeGoalReminderAtMsByTaskId: () => timeGoalReminderAtMsByTaskId,
      getTimeGoalCompleteDurationUnit: () => sessionRuntimeState.get("timeGoalCompleteDurationUnit"),
      setTimeGoalCompleteDurationUnit: (value) => {
        sessionRuntimeState.set("timeGoalCompleteDurationUnit", value);
      },
      getTimeGoalCompleteDurationPeriod: () => sessionRuntimeState.get("timeGoalCompleteDurationPeriod"),
      setTimeGoalCompleteDurationPeriod: (value) => {
        sessionRuntimeState.set("timeGoalCompleteDurationPeriod", value);
      },
      getCheckpointToastQueue: () => checkpointToastQueue,
      getActiveCheckpointToast: () => sessionRuntimeState.get("activeCheckpointToast"),
      setActiveCheckpointToast: (value) => {
        sessionRuntimeState.set("activeCheckpointToast", value as TaskTimerMutableState["activeCheckpointToast"]);
      },
      getCheckpointToastAutoCloseTimer: () => sessionRuntimeState.get("checkpointToastAutoCloseTimer"),
      setCheckpointToastAutoCloseTimer: (value) => {
        sessionRuntimeState.set("checkpointToastAutoCloseTimer", value);
      },
      getCheckpointToastCountdownRefreshTimer: () => sessionRuntimeState.get("checkpointToastCountdownRefreshTimer"),
      setCheckpointToastCountdownRefreshTimer: (value) => {
        sessionRuntimeState.set("checkpointToastCountdownRefreshTimer", value);
      },
      getCheckpointBeepAudio: () => sessionRuntimeState.get("checkpointBeepAudio"),
      setCheckpointBeepAudio: (value) => {
        sessionRuntimeState.set("checkpointBeepAudio", value);
      },
      getCheckpointBeepQueueCount: () => sessionRuntimeState.get("checkpointBeepQueueCount"),
      setCheckpointBeepQueueCount: (value) => {
        sessionRuntimeState.set("checkpointBeepQueueCount", value);
      },
      getCheckpointBeepQueueTimer: () => sessionRuntimeState.get("checkpointBeepQueueTimer"),
      setCheckpointBeepQueueTimer: (value) => {
        sessionRuntimeState.set("checkpointBeepQueueTimer", value);
      },
      getCheckpointRepeatStopAtMs: () => sessionRuntimeState.get("checkpointRepeatStopAtMs"),
      setCheckpointRepeatStopAtMs: (value) => {
        sessionRuntimeState.set("checkpointRepeatStopAtMs", value);
      },
      getCheckpointRepeatCycleTimer: () => sessionRuntimeState.get("checkpointRepeatCycleTimer"),
      setCheckpointRepeatCycleTimer: (value) => {
        sessionRuntimeState.set("checkpointRepeatCycleTimer", value);
      },
      getCheckpointRepeatActiveTaskId: () => sessionRuntimeState.get("checkpointRepeatActiveTaskId"),
      setCheckpointRepeatActiveTaskId: (value) => {
        sessionRuntimeState.set("checkpointRepeatActiveTaskId", value);
      },
      getCheckpointAutoResetDirty: () => sessionRuntimeState.get("checkpointAutoResetDirty"),
      setCheckpointAutoResetDirty: (value) => {
        sessionRuntimeState.set("checkpointAutoResetDirty", value);
      },
      getCheckpointFiredKeysByTaskId: () => checkpointFiredKeysByTaskId,
      getCheckpointBaselineSecByTaskId: () => checkpointBaselineSecByTaskId,
      render,
      renderDashboardWidgets: renderBindings.renderDashboardWidgets,
      renderDashboardLiveWidgets: () => renderDashboardLiveWidgetsWithMemo(),
      save: renderBindings.save,
      openOverlay: overlayBindings.openOverlay,
      closeOverlay: overlayBindings.closeOverlay,
      navigateToAppRoute: navigateToAppRouteViaShell,
      normalizedPathname: () => normalizedPathname(),
      savePendingTaskJump: (taskId) => runtimeActions.savePendingTaskJump(taskId),
      jumpToTaskById: (taskId) => runtimeActions.jumpToTaskById(taskId),
      escapeHtmlUI,
      formatTime,
      formatMainTaskElapsed,
      formatMainTaskElapsedHtml,
      getModeColor: (mode) => getModeColor(mode),
      fillBackgroundForPct,
      sortMilestones,
      isModeEnabled: (mode) => isModeEnabled(mode),
      taskModeOf,
      normalizeHistoryTimestampMs,
      getHistoryEntryNote: (entry) => runtimeActions.getHistoryEntryNote(entry),
      syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
      syncRewardSessionTrackerForTask: (task, nowValue) => syncRewardSessionTrackerForRunningTask(task, nowValue),
      hasEntitlement,
      startTask: (index) => startTaskApi(index),
      stopTask: (index) => stopTaskApi(index),
      resetTask: (index) => resetTaskApi(index),
      resetTaskStateImmediate: (task, opts) => resetTaskStateImmediateApi(task, opts),
      broadcastCheckpointAlertMute: (taskId) => broadcastTaskTimerCheckpointAlertMute(taskId),
      getCurrentUid: () => getCurrentTaskTimerUid(),
    })
  );
  rewardSessionBridge.bootstrapRewardSessionTrackers();
  const { loadFocusSessionNotes: loadFocusSessionNotesApi, tick: tickApi, syncTimeGoalModalWithTaskState: syncTimeGoalModalWithTaskStateApi, maybeRestorePendingTimeGoalFlow: maybeRestorePendingTimeGoalFlowApi, registerSessionEvents } = sessionApi;

  const appShell = createTaskTimerAppShell(
    createTaskTimerAppShellContext({
      els,
      runtime,
      on,
      initialAppPage,
      navStackKey: NAV_STACK_KEY,
      navStackMax: NAV_STACK_MAX,
      nativeBackDebounceMs: NATIVE_BACK_DEBOUNCE_MS,
      appRuntimeState,
      syncDashboardMenuFlipUi,
      getNavStackMemory: () => cacheRuntimeState.get("navStackMemory"),
      setNavStackMemory: (stack) => {
        cacheRuntimeState.set("navStackMemory", stack);
      },
      resetAllOpenHistoryChartSelections,
      clearTaskFlipStates,
      renderFriendsFooterAlertBadge,
      closeTaskExportModal,
      closeShareTaskModal,
      closeFriendProfileModal,
      closeFriendRequestModal,
      requestScheduleEntryScroll,
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
    })
  );

  const { taskTimerExportBasePath, appPathForPage, getInitialAppPageFromLocation, normalizedPathname, normalizeTaskTimerRoutePath, navigateToAppRoute, getCapAppPlugin, exitAppNow, handleAppBackNavigation, initMobileBackHandling, applyAppPage, registerAppShellEvents } = appShell;
  friendAvatarOptions.env.exportBasePath = taskTimerExportBasePath();
  runtimeActions = createTaskTimerRuntimeActions({
    els,
    getTasks: taskCollectionBindings.getTasks,
    getCurrentMode: () => modeState.get("currentMode"),
    getFocusModeTaskId: () => focusState.get("focusModeTaskId"),
    taskModeOf,
    applyMainMode,
    applyAppPage,
    persistenceApi: () => persistenceApi,
    sessionApi: () => sessionApi,
    historyInlineApi: () => historyInlineApi,
  });
  rewardsHistoryApi = createTaskTimerRewardsHistory(
    createTaskTimerRewardsHistoryContext({
      rewardSessionTrackersStorageKey: REWARD_SESSION_TRACKERS_KEY,
      getTasks: taskCollectionBindings.getTasks,
      getHistoryByTaskId: taskCollectionBindings.getHistoryByTaskId,
      getDeletedTaskMeta: taskCollectionBindings.getDeletedTaskMeta,
      preferencesState,
      dashboardUiState,
      rewardState,
      focusBindings,
      setCloudPreferencesCache: (value: Parameters<typeof saveCloudPreferences>[0] | null) => {
        rewardState.set("cloudPreferencesCache", value ?? null);
        cacheRuntimeState.set("cloudPreferencesCache", value ?? null);
      },
      getCurrentPlan,
      hasEntitlement,
      currentUid: () => getCurrentTaskTimerUid(),
      taskModeOf: (task) => taskModeOf(task),
      isModeEnabled: (mode) => isModeEnabled(mode),
      getTaskElapsedMs: (task) => getTaskElapsedMs(task),
      sessionColorForTaskMs,
      captureSessionNoteSnapshot: (taskId) => runtimeActions.captureSessionNoteSnapshot(taskId),
      setFocusSessionDraft: (taskId, noteRaw) => runtimeActions.setFocusSessionDraft(taskId, noteRaw),
      clearFocusSessionDraft: (taskId) => runtimeActions.clearFocusSessionDraft(taskId),
      syncFocusSessionNotesInput: (taskId) => runtimeActions.syncFocusSessionNotesInput(taskId),
      syncFocusSessionNotesAccordion: (taskId) => runtimeActions.syncFocusSessionNotesAccordion(taskId),
      appendHistoryEntry: (taskId, entry) => appendHistoryEntry(taskId, entry as any),
      saveHistoryLocally,
      buildDefaultCloudPreferences: () => buildDefaultCloudPreferences(),
      saveCloudPreferences: (prefs) => saveCloudPreferences(prefs),
      syncSharedTaskSummariesForTask,
      syncOwnFriendshipProfile,
    })
  );
  const {
    syncRewardSessionTrackerForRunningTask,
  } = rewardsHistoryApi;

  const runtimeCoordinator = createTaskTimerRuntimeCoordinator({
      els,
      scheduleState,
      scheduleRuntime,
      escapeHtmlUI,
      getOptimalProductivityStartTime: () => preferencesState.get("optimalProductivityStartTime"),
      getOptimalProductivityEndTime: () => preferencesState.get("optimalProductivityEndTime"),
      renderTasksPage,
      getCloudSyncApi: () => cloudSyncApi,
    pendingPushActionKey: PENDING_PUSH_ACTION_KEY,
    getTasks: taskCollectionBindings.getTasks,
    startTaskByIndex: (index) => tasksApi.startTask(index),
    jumpToTaskById: (taskId) => runtimeActions.jumpToTaskById(taskId),
    maybeRestorePendingTimeGoalFlow: () => sessionApi?.maybeRestorePendingTimeGoalFlow(),
    applyAppPage,
    navigateToAppRoute,
    checkpointRepeatActiveTaskId: () => sessionApi?.checkpointRepeatActiveTaskId() || null,
    stopCheckpointRepeatAlert: () => sessionApi?.stopCheckpointRepeatAlert(),
    getHistoryInlineApi: () => historyInlineApi,
    windowRef: window,
    getCurrentUid: () => getCurrentTaskTimerUid(),
    getCurrentEmail: () => getCurrentTaskTimerEmail(),
    architectEmail: ARCHITECT_EMAIL,
  });
  const {
    rehydrateFromCloudAndRender,
    initCloudRefreshSync,
    maybeHandlePendingPushAction,
    handleArchieNavigate,
    getTileColumnCount,
    isArchitectUser,
  } = runtimeCoordinator;
  const runtimeFacade = createTaskTimerRuntimeFacade({
    getSessionApi: () => sessionApi,
    runtimeCoordinator,
    getCurrentUid: () => getCurrentTaskTimerUid(),
    getOwnSharedSummaries: () => groupsState.get("ownSharedSummaries"),
    applyMainMode: (mode) => preferencesApi?.applyMainMode(mode),
  });
  escapeHtmlUI = runtimeFacade.escapeHtmlUI;
  getElapsedMs = runtimeFacade.getElapsedMs;
  getTaskElapsedMs = runtimeFacade.getTaskElapsedMs;
  renderSchedulePage = runtimeFacade.renderSchedulePage;
  requestScheduleEntryScroll = runtimeFacade.requestScheduleEntryScroll;
  render = runtimeFacade.render;
  resetAllOpenHistoryChartSelections = runtimeFacade.resetAllOpenHistoryChartSelections;
  renderHistory = runtimeFacade.renderHistory;

  function subscribeToCheckpointAlertMuteSignals() {
    const ref = { current: unsubscribeCheckpointAlertMuteSignals };
    runtimeFacade.subscribeToCheckpointAlertMuteSignals(ref);
    unsubscribeCheckpointAlertMuteSignals = ref.current;
  }
  const deleteTask = createTaskTimerTaskDelete({
    getTasks: taskCollectionBindings.getTasks,
    getHistoryByTaskId: () => taskCollectionBindings.getHistoryByTaskId() as Record<string, unknown[]>,
    setHistoryByTaskId: (value) => {
      taskCollectionBindings.setHistoryByTaskId(value as TaskTimerMutableState["historyByTaskId"]);
    },
    getDeletedTaskMeta: taskCollectionBindings.getDeletedTaskMeta,
    setDeletedTaskMeta: taskCollectionBindings.setDeletedTaskMeta,
    getConfirmOverlay: () => els.confirmOverlay as HTMLElement | null,
    getConfirmDeleteAllChecked: () => !!els.confirmDeleteAll?.checked,
    escapeHtmlUI,
    confirm,
    closeConfirm,
    saveHistory: (history) => saveHistory(history as TaskTimerMutableState["historyByTaskId"]),
    saveDeletedMeta,
    save: renderBindings.save,
    deleteSharedTaskSummariesForTask,
    refreshOwnSharedSummaries,
    getCurrentUid: () => getCurrentTaskTimerUid(),
    render,
  });

  isTaskSharedByOwner = runtimeFacade.isTaskSharedByOwner;
  applyMainMode = runtimeFacade.applyMainMode;

  const historyManager = createTaskTimerHistoryManager(
    createTaskTimerHistoryManagerContext({
      els,
      on,
      runtime,
      taskCollectionBindings,
      historyUiState,
      getHistoryManagerRefreshInFlight: () => cacheRuntimeState.get("historyManagerRefreshInFlight"),
      setHistoryManagerRefreshInFlight: (value) => {
        cacheRuntimeState.set("historyManagerRefreshInFlight", value);
      },
      isArchitectUser,
      getHistoryEntryNote: (entry) => runtimeActions.getHistoryEntryNote(entry),
      csvEscape: (value) => rewardSessionBridge.csvEscape(value),
      parseCsvRows: (input) => rewardSessionBridge.parseCsvRows(input),
      downloadCsvFile: (filename, text) => rewardSessionBridge.downloadCsvFile(filename, text),
      formatTwo,
      formatDateTime,
      sortMilestones,
      sessionColorForTaskMs,
      save: renderBindings.save,
      saveHistory,
      saveHistoryAndWait,
      loadHistory,
      refreshHistoryFromCloud,
      saveDeletedMeta,
      loadDeletedMeta,
      load: () => runtimeActions.load(),
      render,
      navigateToAppRoute,
      openOverlay: overlayBindings.openOverlay,
      confirm: overlayBindings.confirm,
      closeConfirm: overlayBindings.closeConfirm,
      escapeHtmlUI,
      syncSharedTaskSummariesForTasks,
      syncSharedTaskSummariesForTask,
      hasEntitlement,
      getCurrentPlan,
      showUpgradePrompt,
    })
  );
  const { openHistoryManager, registerHistoryManagerEvents } = historyManager;

  const historyInline = createTaskTimerHistoryInline(
    createTaskTimerHistoryInlineContext({
      els,
      on,
      sharedTasks: sharedTaskApi,
      taskCollectionBindings,
      historyUiState,
      historyViewByTaskId,
      openHistoryTaskIds,
      getCurrentAppPage: currentAppPageBinding.getCurrentAppPage,
      savePinnedHistoryTaskIds,
      persistTaskUiToCloud,
      saveHistory,
      confirm: overlayBindings.confirm,
      closeConfirm: overlayBindings.closeConfirm,
      navigateToAppRoute,
      openOverlay: overlayBindings.openOverlay,
      closeOverlay: overlayBindings.closeOverlay,
      render,
      renderDashboardWidgets: renderBindings.renderDashboardWidgets,
      nowMs,
      normalizeHistoryTimestampMs,
      formatTime,
      formatTwo,
      formatDateTime,
      escapeHtmlUI,
      sortMilestones,
      sessionColorForTaskMs,
      getModeColor: (mode) => DEFAULT_MODE_COLORS[mode] || DEFAULT_MODE_COLORS.mode1,
      getDynamicColorsEnabled: () => preferencesState.get("dynamicColorsEnabled"),
      hasEntitlement,
      showUpgradePrompt,
    })
  );
  historyInlineApi = historyInline;
  const { registerHistoryInlineEvents } = historyInline;

  const stopCheckpointRepeatAlert = () => {
    sessionApi?.stopCheckpointRepeatAlert();
  };

  const preferences = createTaskTimerPreferences(
    createTaskTimerPreferencesContext({
      els,
      on,
      preferencesState,
      modeState,
      editTaskState,
      rewardState,
      toggleSwitchElement: (el, enabled) => setSwitchState(el, enabled),
      isSwitchOn: (el) => isSwitchEnabled(el),
      storageKeys: {
        THEME_KEY,
        TASK_VIEW_KEY,
        AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
        MOBILE_PUSH_ALERTS_KEY,
        WEB_PUSH_ALERTS_KEY,
        OPTIMAL_PRODUCTIVITY_START_TIME_KEY,
        OPTIMAL_PRODUCTIVITY_END_TIME_KEY,
        MENU_BUTTON_STYLE_KEY,
        MODE_SETTINGS_KEY,
        WEEK_STARTING_KEY,
      },
      defaultModeLabels: DEFAULT_MODE_LABELS,
      defaultModeEnabled: DEFAULT_MODE_ENABLED,
      defaultModeColors: DEFAULT_MODE_COLORS,
      normalizeRewardProgress,
      getCurrentUid: () => getCurrentTaskTimerUid(),
      loadCachedPreferences,
      loadCachedTaskUi,
      getCloudPreferencesCache: () => cacheRuntimeState.get("cloudPreferencesCache"),
      setCloudPreferencesCache: (value) => {
        cacheRuntimeState.set("cloudPreferencesCache", value ?? null);
      },
      buildDefaultCloudPreferences: () => buildDefaultCloudPreferences() as NonNullable<ReturnType<typeof loadCachedPreferences>>,
      saveCloudPreferences: (prefs) => {
        saveCloudPreferences(prefs as Parameters<typeof saveCloudPreferences>[0]);
      },
      syncOwnFriendshipProfile,
      saveDashboardWidgetState: saveDashboardWidgetStateApi,
      getDashboardCardSizeMapForStorage: getDashboardCardSizeMapForStorageApi,
      getDashboardAvgRange: getDashboardAvgRangeApi,
      taskCollectionBindings,
      getCurrentEditTask: () => editTaskApi?.getCurrentEditTask() ?? null,
      syncEditCheckpointAlertUi: (task) => editTaskApi?.syncEditCheckpointAlertUi(task),
      clearTaskFlipStates,
      taskModeOf,
      save: renderBindings.save,
      render,
      renderDashboardPanelMenu: () => renderDashboardPanelMenuApi(),
      renderDashboardWidgets: renderBindings.renderDashboardWidgets,
      ensureDashboardIncludedModesValid: () => ensureDashboardIncludedModesValidApi(),
      closeOverlay: overlayBindings.closeOverlay,
      closeConfirm: overlayBindings.closeConfirm,
      confirm: overlayBindings.confirm,
      escapeHtmlUI,
      stopCheckpointRepeatAlert,
      getCurrentAppPage: currentAppPageBinding.getCurrentAppPage,
      hasEntitlement,
      getCurrentPlan,
      showUpgradePrompt,
    })
  );
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
    loadOptimalProductivityPeriodPreference,
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
    clearHistoryEntryNoteOverlayPosition: () => runtimeActions.clearHistoryEntryNoteOverlayPosition(),
    hasEntitlement,
    showUpgradePrompt,
  });
  const { registerPopupMenuEvents } = popupMenu;

  editTaskApi = createTaskTimerEditTask({
    els,
    on,
    sharedTasks: sharedTaskApi,
    getTasks: taskCollectionBindings.getTasks,
    getCurrentMode: () => modeState.get("currentMode"),
    ...editStateBindings,
    getCheckpointAlertSoundEnabled: () => preferencesState.get("checkpointAlertSoundEnabled"),
    getCheckpointAlertToastEnabled: () => preferencesState.get("checkpointAlertToastEnabled"),
    getElapsedMs,
    render,
    save: renderBindings.save,
    confirm: overlayBindings.confirm,
    closeConfirm: overlayBindings.closeConfirm,
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

  persistenceApi = createTaskTimerPersistence(
    createTaskTimerPersistenceContext({
      focusSessionNotesKey: FOCUS_SESSION_NOTES_KEY,
      pendingTaskJumpKey: PENDING_PUSH_TASK_ID_KEY,
      taskCollectionBindings,
      historyUiState,
      focusState,
      runtimeDestroyed: () => runtime.destroyed,
      getCurrentUid: () => getCurrentTaskTimerUid(),
      pendingTaskJumpMemory: () => cacheRuntimeState.get("pendingTaskJumpMemory"),
      setPendingTaskJumpMemory: (value) => {
        cacheRuntimeState.set("pendingTaskJumpMemory", value);
      },
      getFocusSessionNotesInputValue: () => String(els.focusSessionNotesInput?.value || ""),
      setFocusSessionNotesInputValue: (value) => {
        if (els.focusSessionNotesInput) els.focusSessionNotesInput.value = value;
      },
      setFocusSessionNotesSectionOpen: () => {
        if (els.focusSessionNotesSection) {
          els.focusSessionNotesSection.setAttribute("data-notes-visible", "true");
        }
      },
      getCurrentAppPage: currentAppPageBinding.getCurrentAppPage,
      getInitialAppPageFromLocation,
      initialAppPage,
      getCloudTaskUiCache: () => cacheRuntimeState.get("cloudTaskUiCache"),
      loadCachedTaskUi,
      loadDeletedMeta,
      setDeletedTaskMeta: (value) => {
        taskCollectionBindings.setDeletedTaskMeta(value);
      },
      primeDashboardCacheFromShadow,
      loadFocusSessionNotes: () => loadFocusSessionNotesApi(),
      loadAddTaskCustomNames: () => loadAddTaskCustomNamesApi(),
      loadWeekStartingPreference,
      loadTaskViewPreference,
      loadAutoFocusOnTaskLaunchSetting,
      loadDynamicColorsSetting,
      loadCheckpointAlertSettings,
      loadOptimalProductivityPeriodPreference,
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
        if (sessionRuntimeState.get("historyNoteCloudRepairAttempted")) return;
        sessionRuntimeState.set("historyNoteCloudRepairAttempted", true);
        saveHistory(taskCollectionBindings.getHistoryByTaskId(), { showIndicator: false });
      },
      taskModeOf,
      jumpToTaskById: (taskId) => runtimeActions.jumpToTaskById(taskId),
      maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
      normalizeLoadedTask,
    })
  );

  cloudSyncApi = createTaskTimerCloudSync({
    runtime,
    on,
    nowMs,
    getCapAppPlugin,
    cloudRefreshInFlight: cloudSyncState.accessor("cloudRefreshInFlight"),
    lastCloudRefreshAtMs: cloudSyncState.accessor("lastCloudRefreshAtMs"),
    pendingDeferredCloudRefresh: cloudSyncState.accessor("pendingDeferredCloudRefresh"),
    deferredCloudRefreshTimer: cloudSyncState.accessor("deferredCloudRefreshTimer"),
    lastUiInteractionAtMs: cloudSyncState.accessor("lastUiInteractionAtMs"),
    hydrateUiStateFromCaches,
    syncTimeGoalModalWithTaskState: () => syncTimeGoalModalWithTaskStateApi(),
    render,
    renderDashboardWidgets: (opts) => renderDashboardWidgetsWithBusy(opts),
    maybeHandlePendingTaskJump: () => runtimeActions.maybeHandlePendingTaskJump(),
    maybeHandlePendingPushAction,
    maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
    currentUid: () => getCurrentTaskTimerUid(),
    isInitialAuthHydrating,
    showDashboardBusyIndicator,
    hideDashboardBusyIndicator,
    setDashboardRefreshPending,
  });

  function wireEvents() {
    registerTaskTimerRootEvents({
      on,
      runtime,
      els,
      documentRef: document,
      windowRef: window,
      planChangedEvent: TASKTIMER_PLAN_CHANGED_EVENT,
      scheduleMinutePx: SCHEDULE_MINUTE_PX,
      isScheduleMobileLayout,
      normalizeScheduleDay,
      tasks: taskCollectionBindings.getTasks,
      isScheduleRenderableTask,
      isRecurringDailyScheduleTask,
      formatScheduleDayLabel,
      save: () => runtimeActions.save(),
      render,
      renderSchedulePage,
      setScheduleSelectedDay: (day) => {
        scheduleState.set("selectedDay", day);
      },
      setScheduleDragTaskId: (taskId) => {
        scheduleState.set("dragTaskId", taskId);
      },
      setScheduleDragSourceDay: (day) => {
        scheduleState.set("dragSourceDay", day);
      },
      getScheduleDragTaskId: () => scheduleState.get("dragTaskId"),
      getScheduleDragSourceDay: () => scheduleState.get("dragSourceDay"),
      clearScheduleDragPreview: () => scheduleRuntime.clearDragPreview(),
      setScheduleDragPointerOffsetMinutes: (value) => {
        scheduleState.set("dragPointerOffsetMinutes", value);
      },
      resolveScheduleDropStartMinutes: (dropZone, clientY) => scheduleRuntime.resolveDropStartMinutes(dropZone, clientY),
      getScheduleDragPreviewDay: () => scheduleState.get("dragPreviewDay"),
      getScheduleDragPreviewStartMinutes: () => scheduleState.get("dragPreviewStartMinutes"),
      setScheduleDragPreview: (day, startMinutes) => {
        if (!day) return;
        scheduleState.set("dragPreviewDay", day);
        scheduleState.set("dragPreviewStartMinutes", startMinutes);
      },
      currentAppPage: () => appRuntimeState.get("currentAppPage"),
      moveTaskOnSchedule: (taskId, day, startMinutes, sourceDay) => scheduleRuntime.moveTaskOnSchedule(taskId, day, startMinutes, sourceDay),
      toggleTaskScheduleFlexible: (taskId) => scheduleRuntime.toggleTaskScheduleFlexible(taskId),
      openOverlay,
      getTaskView: () => preferencesState.get("taskView"),
      hasTaskList: () => !!els.taskList,
      getTileColumnCount,
      getCurrentTileColumnCount: () => appRuntimeState.get("currentTileColumnCount"),
      renderDashboardWidgetsWithBusy,
      renderGroupsPage,
      openHistoryManager,
      pendingPushEvent: PENDING_PUSH_TASK_EVENT,
      archieNavigateEvent: ARCHIE_NAVIGATE_EVENT,
      maybeHandlePendingTaskJump: () => runtimeActions.maybeHandlePendingTaskJump(),
      maybeHandlePendingPushAction,
      rehydrateFromCloudAndRender,
      maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
      handleArchieNavigate,
      registerAppShellEvents,
      registerGroupsEvents,
      registerAddTaskEvents,
      registerTaskEvents,
      registerTaskListUiEvents,
      registerDashboardEvents,
      registerPreferenceEvents,
      normalizedPathname,
      normalizeTaskTimerRoutePath,
      appPathForPage,
      handleAppBackNavigation,
      registerHistoryInlineEvents,
      registerHistoryManagerEvents,
      registerSessionEvents,
      registerEditTaskEvents,
      registerPopupMenuEvents,
      registerImportExportEvents,
      isDashboardBusy: () => dashboardBusyApi.isBusy(),
      dashboardMenuFlipped: () => appRuntimeState.get("dashboardMenuFlipped"),
      setDashboardRefreshPending,
      closeDashboardHeatSummaryCard: (opts) => closeDashboardHeatSummaryCard(opts),
      registerConfirmOverlayEvents,
    });
  }

  function hydrateUiStateFromCaches(opts?: { skipDashboardWidgetsRender?: boolean }) {
    persistenceApi?.hydrateUiStateFromCaches(opts);
  }

  startTaskTimerRootLifecycle({
    runtime,
    hydrateUiStateFromCaches,
    startInitialAuthHydration,
    finishInitialAuthHydration,
    subscribeToCheckpointAlertMuteSignals,
    refreshOwnSharedSummaries,
    reconcileOwnedSharedSummaryStates,
    render,
    currentAppPage: appRuntimeState.get("currentAppPage"),
    openHistoryTaskIds,
    renderHistory,
    initMobileBackHandling,
    initCloudRefreshSync,
    wireEvents,
    maybeOpenImportFromQuery,
    syncDashboardMenuFlipUi,
    syncDashboardRefreshButtonUi,
    maybeHandlePendingPushAction,
    maybeHandlePendingTaskJump: () => runtimeActions.maybeHandlePendingTaskJump(),
    hasTaskList: () => !!els.taskList,
    hasHistoryManagerScreen: () => !!els.historyManagerScreen,
    openHistoryManager,
    tickApi: () => tickApi(),
    setDashboardRefreshPending,
    currentUid: () => getCurrentTaskTimerUid(),
    rehydrateFromCloudAndRender,
  });

  return { destroy };
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
