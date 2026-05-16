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
} from "./lib/storage";
import type { DashboardConfig, TaskUiConfig, UserPreferencesV1 } from "./lib/cloudStore";
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
  TaskTimerClientHandle,
  TaskTimerMutableState,
} from "./client/types";
import { collectTaskTimerElements } from "./client/elements";
import { destroyTaskTimerRuntime } from "./client/runtime";
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
import { registerCloudSyncNoticeRuntime } from "./client/cloud-sync-notice";
import { createTaskTimerPersistence } from "./client/persistence";
import { createTaskTimerConfirmOverlay } from "./client/confirm-overlay";
import { createTaskTimerPopupMenu } from "./client/popup-menu";
import { createTaskTimerImportExport } from "./client/import-export";
import { createTaskTimerTaskListUi } from "./client/task-list-ui";
import { createTaskTimerTaskUiPersistence } from "./client/task-ui-persistence";
import { createTaskTimerRewardsHistory } from "./client/rewards-history";
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
} from "./client/state";
import {
  createTaskTimerScheduleRuntime,
  formatScheduleDayLabel,
  isScheduleMobileLayout,
  isScheduleRenderableTask,
  isRecurringDailyScheduleTask,
  normalizeScheduleDay,
  SCHEDULE_MINUTE_PX,
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
import { projectHistoryWithLiveSessions } from "./client/live-session-history";
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
import { createTaskTimerRuntimeComposition } from "./client/runtime-composition";

const ARCHITECT_EMAIL = "aniven82@gmail.com";
const DASHBOARD_BUSY_MIN_VISIBLE_MS = 420;

export function initTaskTimerClient(initialAppPage: AppPage = "tasks"): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }
  const composition = createTaskTimerRuntimeComposition(initialAppPage, STORAGE_KEY);
  const {
    runtime,
    workspaceRepository,
    workspaceAdapters,
    storageKeys: {
      AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
      MOBILE_PUSH_ALERTS_KEY,
      WEB_PUSH_ALERTS_KEY,
      THEME_KEY,
      MENU_BUTTON_STYLE_KEY,
      WEEK_STARTING_KEY,
      STARTUP_MODULE_KEY,
      TASK_VIEW_KEY,
      TASK_ORDER_BY_KEY,
      OPTIMAL_PRODUCTIVITY_START_TIME_KEY,
      OPTIMAL_PRODUCTIVITY_END_TIME_KEY,
      OPTIMAL_PRODUCTIVITY_DAYS_KEY,
      NAV_STACK_KEY,
      FOCUS_SESSION_NOTES_KEY,
      NAV_STACK_MAX,
      NATIVE_BACK_DEBOUNCE_MS,
    },
    derivedKeys: {
      TIME_GOAL_PENDING_FLOW_KEY,
      PENDING_PUSH_TASK_ID_KEY,
      PENDING_PUSH_ACTION_KEY,
      REWARD_SESSION_TRACKERS_KEY,
    },
    events: {
      PENDING_PUSH_TASK_EVENT,
    },
    stores: {
      cloudSyncState,
      dashboardBusyState,
      modalState,
      scheduleState,
      workingIndicatorState,
      appRuntimeState,
      taskDataState,
      focusState,
      preferencesState,
      sessionRuntimeState,
      historyUiState,
      addTaskState,
      editTaskState,
      dashboardUiState,
      taskListRuntimeState,
      cacheRuntimeState,
      rewardState,
      groupsState,
    },
    refs: {
      openHistoryTaskIds,
      historyViewByTaskId,
      timeGoalReminderAtMsByTaskId,
      checkpointToastQueue,
      checkpointFiredKeysByTaskId,
      checkpointBaselineSecByTaskId,
      openFriendSharedTaskUids,
      dashboardWidgetHasRenderedData,
    },
  } = composition;
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
        window.location.href = "/account";
      },
    });
    confirm(confirmConfig.title, confirmConfig.text, confirmConfig.options);
  }

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
  const flippedTaskIds = new Set<string>();
  let rewardsHistoryApi: ReturnType<typeof createTaskTimerRewardsHistory> | null = null;
  let runtimeActions = null as unknown as ReturnType<typeof createTaskTimerRuntimeActions>;
  let unsubscribeCheckpointAlertMuteSignals: (() => void) | null = null;
  const unsubscribeCachedPreferences = workspaceRepository.subscribeCachedPreferences((prefs) => {
    cacheRuntimeState.set("cloudPreferencesCache", prefs);
    rewardState.set("cloudPreferencesCache", prefs);
    rewardState.set("rewardProgress", normalizeRewardProgress((prefs || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS));
  });
  const avatarSrcById = buildFriendAvatarSrcMap(AVATAR_CATALOG);
  const defaultFriendAvatarSrc = "/avatars/toons/toonHead-male.svg";
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
  registerCloudSyncNoticeRuntime({
    host: els.cloudSyncNoticeHost as HTMLElement | null,
    on,
  });
  const sharedTaskApi = createTaskTimerSharedTask({
    createId: () => cryptoRandomId(),
    getEditTimeGoalDraft: () => ({
      value: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      unit: editTaskState.get("editTaskDurationUnit"),
      period: editTaskState.get("editTaskDurationPeriod"),
    }),
  });
  const {
    makeTask,
    normalizeLoadedTask,
    ensureMilestoneIdentity,
    getPresetIntervalValueNum,
    getPresetIntervalNextSeqNum,
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
    const mobileDetailPanel = document.querySelector(".settingsDetailPanel.isMobileOpen");
    if (!mobileDetailPanel) return false;
    window.dispatchEvent(new Event("tasktimer:closeSettingsMobileDetail"));
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
    getConfirmActionCancel: () => modalState.get("confirmActionCancel"),
    setConfirmActionCancel: (value) => {
      modalState.set("confirmActionCancel", value);
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
  let requestScheduleEntryScroll = (mode?: "open" | "firstScheduled") => {
    void mode;
  };
  let render = () => {};
  let resetAllOpenHistoryChartSelections = () => {};
  let closeUnpinnedOpenHistoryCharts = () => {};
  let renderHistory: (taskId: string) => void = () => {};
  let isTaskSharedByOwner: (taskId: string) => boolean = () => false;
  let applyMainMode: (mode: "mode1") => void = () => {};
  const taskCollectionBindings = {
    getTasks: () => taskDataState.get("tasks"),
    setTasks: (value: TaskTimerMutableState["tasks"]) => {
      taskDataState.set("tasks", value);
    },
    getHistoryByTaskId: () => taskDataState.get("historyByTaskId"),
    setHistoryByTaskId: (value: TaskTimerMutableState["historyByTaskId"]) => {
      taskDataState.set("historyByTaskId", value);
    },
    getLiveSessionsByTaskId: () => taskDataState.get("liveSessionsByTaskId"),
    setLiveSessionsByTaskId: (value: TaskTimerMutableState["liveSessionsByTaskId"]) => {
      taskDataState.set("liveSessionsByTaskId", value);
    },
    getDeletedTaskMeta: () => taskDataState.get("deletedTaskMeta"),
    setDeletedTaskMeta: (value: TaskTimerMutableState["deletedTaskMeta"]) => {
      taskDataState.set("deletedTaskMeta", value);
    },
  };
  const getProjectedHistoryByTaskId = () =>
    projectHistoryWithLiveSessions(
      taskCollectionBindings.getHistoryByTaskId() as TaskTimerMutableState["historyByTaskId"],
      taskCollectionBindings.getLiveSessionsByTaskId() as TaskTimerMutableState["liveSessionsByTaskId"]
    );
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
    saveHistory: workspaceRepository.saveHistory,
    createId: () => cryptoRandomId(),
    makeTask: (name, order) => makeTask(name, order),
    sortMilestones,
    ensureMilestoneIdentity: (task) => ensureMilestoneIdentity(task),
    getPresetIntervalValueNum: (task) => getPresetIntervalValueNum(task),
    getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
    cleanupHistory: workspaceRepository.cleanupHistory,
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
    ...currentAppPageBinding,
    getTaskView: () => "tile",
    getTaskOrderBy: () => preferencesState.get("taskOrderBy"),
    getTaskDragEl: () => taskListRuntimeState.get("taskDragEl"),
    setTaskDragEl: (value) => {
      taskListRuntimeState.set("taskDragEl", value);
    },
    getFlippedTaskIds: () => flippedTaskIds,
    getLastRenderedTaskFlipView: () => taskListRuntimeState.get("lastRenderedTaskFlipView"),
    setLastRenderedTaskFlipView: (value) => {
      taskListRuntimeState.set("lastRenderedTaskFlipView", value);
    },
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
    loadCachedTaskUi: workspaceRepository.loadCachedTaskUi,
    saveCloudTaskUi: (value) => {
      workspaceRepository.saveTaskUi(value as TaskUiConfig);
    },
    getTasks: taskCollectionBindings.getTasks,
    getHistoryByTaskId: taskCollectionBindings.getHistoryByTaskId,
    saveHistory: workspaceRepository.saveHistory,
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
      taskCollectionBindings: {
        ...taskCollectionBindings,
        getHistoryByTaskId: getProjectedHistoryByTaskId,
      },
      appRuntimeState,
      groupsState,
      openFriendSharedTaskUids,
      getCurrentUid: () => getCurrentTaskTimerUid(),
      applyMainMode,
      applyAppPage: (page, opts) => applyAppPage(page, opts),
      render,
      closeConfirm,
      confirm,
      escapeHtmlUI,
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
      taskCollectionBindings: {
        ...taskCollectionBindings,
        getHistoryByTaskId: getProjectedHistoryByTaskId,
      },
      rewardState,
      preferencesState,
      dashboardUiState,
      dashboardWidgetHasRenderedData,
      dashboardBusyState,
      cloudSyncState,
      getElapsedMs,
      escapeHtmlUI,
      normalizeHistoryTimestampMs,
      getModeColor: (mode) => getModeColor(mode),
      addRangeMsToLocalDayMap: (dayMap, startMs, endMs) => addRangeMsToLocalDayMap(dayMap, startMs, endMs, localDayKey),
      openHistoryEntryNoteOverlay: (taskId, entries) => historyInlineApi?.openHistoryEntryNoteOverlay(taskId, entries),
      hasEntitlement,
      getCurrentPlan,
    },
    dashboardRuntime: {
      documentRef: document,
      nowMs,
      taskCollectionBindings: {
        ...taskCollectionBindings,
        getHistoryByTaskId: getProjectedHistoryByTaskId,
      },
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
      taskCollectionBindings: {
        ...taskCollectionBindings,
        getHistoryByTaskId: getProjectedHistoryByTaskId,
      },
      currentAppPageBinding,
      appRuntimeState,
      preferencesState,
      dashboardLayoutBindings,
      getCloudDashboardCache: () => cacheRuntimeState.get("cloudDashboardCache"),
      setCloudDashboardCache: (value: unknown) => {
        cacheRuntimeState.set("cloudDashboardCache", value as DashboardConfig | null);
      },
      loadCachedDashboard: workspaceRepository.loadCachedDashboard,
      saveCloudDashboard: (value: unknown) => {
        const nextDashboard = value as DashboardConfig | null;
        if (nextDashboard) workspaceRepository.saveDashboard(nextDashboard);
      },
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
    loadDashboardWidgetState: loadDashboardWidgetStateApi,
    applyDashboardCardVisibility: applyDashboardCardVisibilityApi,
    applyDashboardCardSizes: applyDashboardCardSizesApi,
    applyDashboardOrderFromStorage: applyDashboardOrderFromStorageApi,
    applyDashboardEditMode: applyDashboardEditModeApi,
    registerDashboardEvents,
  } = dashboardApi;

  let openManualEntryForTaskFromHistoryManager: (taskId: string) => void = () => {};
  const tasksApi = createTaskTimerTasks(
    createTaskTimerTasksContext({
      els,
      on,
      sharedTasks: sharedTaskApi,
      taskCollectionBindings: {
        ...taskCollectionBindings,
        getHistoryByTaskId: getProjectedHistoryByTaskId,
      },
      appRuntimeState,
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
      saveHistory: workspaceRepository.saveHistory,
      saveDeletedMeta: workspaceRepository.saveDeletedMeta,
      escapeHtmlUI,
      getModeColor: (mode) => getModeColor(mode),
      fillBackgroundForPct,
      formatMainTaskElapsedHtml,
      sortMilestones,
      isTaskSharedByOwner,
      confirm,
      closeConfirm,
      openEdit: (index, sourceEl) => editTaskApi?.openEdit(index, sourceEl),
      clearTaskTimeGoalFlow: (taskId) => sessionApi?.clearTaskTimeGoalFlow(taskId),
      flushPendingFocusSessionNoteSave: (taskId) => sessionApi?.flushPendingFocusSessionNoteSave(taskId),
      clearCheckpointBaseline: (taskId) => sessionApi?.clearCheckpointBaseline(taskId),
      openRewardSessionSegment: (task, startMsRaw) => rewardSessionBridge.openRewardSessionSegment(task, startMsRaw),
      closeRewardSessionSegment: (task, endMsRaw) => rewardSessionBridge.closeRewardSessionSegment(task, endMsRaw),
      clearRewardSessionTracker: (taskIdRaw) => rewardSessionBridge.clearRewardSessionTracker(taskIdRaw),
      upsertLiveSession: (task, opts) => rewardSessionBridge.upsertLiveSession(task, opts),
      finalizeLiveSession: (task, opts) => rewardSessionBridge.finalizeLiveSession(task, opts),
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
      getPresetIntervalNextSeqNum: (task) => getPresetIntervalNextSeqNum(task),
      isEditMilestoneUnitDay: () => editTaskApi?.isEditMilestoneUnitDay() ?? false,
      setTaskFlipped: (taskId, flipped, taskEl) => setTaskFlipped(taskId, flipped, taskEl),
      syncTaskFlipStatesForVisibleTasks: (activeTaskIds) => syncTaskFlipStatesForVisibleTasks(activeTaskIds),
      applyTaskFlipDomState: (taskId, taskEl) => applyTaskFlipDomState(taskId, taskEl),
      openHistoryInline: (index) => historyInlineApi?.openHistory(index),
      openTaskExportModal: (index) => openTaskExportModal(index),
      openShareTaskModal: (index) => openShareTaskModal(index),
      openManualEntryForTask: (taskId) => openManualEntryForTaskFromHistoryManager(taskId),
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
      currentAppPageBinding: {
        getCurrentAppPage: () => appRuntimeState.get("currentAppPage"),
      },
      addTaskStateBindings,
      preferencesState,
      getCheckpointAlertSoundEnabled: () => preferencesState.get("checkpointAlertSoundEnabled"),
      getCheckpointAlertToastEnabled: () => preferencesState.get("checkpointAlertToastEnabled"),
      loadCachedTaskUi: () => cacheRuntimeState.get("cloudTaskUiCache") || workspaceRepository.loadCachedTaskUi(),
      saveCloudTaskUi: (next) => {
        cacheRuntimeState.set("cloudTaskUiCache", next as TaskUiConfig | null);
        workspaceRepository.saveTaskUi(next as TaskUiConfig);
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
      getLiveSessionsByTaskId: taskCollectionBindings.getLiveSessionsByTaskId,
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
      normalizeHistoryTimestampMs,
      getHistoryEntryNote: (entry) => runtimeActions.getHistoryEntryNote(entry),
      syncSharedTaskSummariesForTask: (taskId) => syncSharedTaskSummariesForTask(taskId),
      syncRewardSessionTrackerForTask: (task, nowValue) => syncRewardSessionTrackerForRunningTask(task, nowValue),
      syncLiveSessionForTask: (task, nowValue) => rewardSessionBridge.syncLiveSessionForTask(task, nowValue),
      hasEntitlement,
      startTask: (index) => startTaskApi(index),
      stopTask: (index) => stopTaskApi(index),
      resetTask: (index) => resetTaskApi(index),
      resetTaskStateImmediate: (task, opts) => resetTaskStateImmediateApi(task, opts),
      broadcastCheckpointAlertMute: (taskId) => broadcastTaskTimerCheckpointAlertMute(taskId),
      getCurrentUid: () => getCurrentTaskTimerUid(),
    })
  );
  const { loadFocusSessionNotes: loadFocusSessionNotesApi, tick: tickApi, syncTimeGoalModalWithTaskState: syncTimeGoalModalWithTaskStateApi, maybeRestorePendingTimeGoalFlow: maybeRestorePendingTimeGoalFlowApi, registerSessionEvents } = sessionApi;
  let openHistoryManagerFromShell = () => {};

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
      syncDashboardMenuFlipUi: () => syncDashboardMenuFlipUi(),
      getNavStackMemory: () => cacheRuntimeState.get("navStackMemory"),
      setNavStackMemory: (stack) => {
        cacheRuntimeState.set("navStackMemory", stack);
      },
      resetAllOpenHistoryChartSelections: () => resetAllOpenHistoryChartSelections(),
      closeUnpinnedOpenHistoryCharts: () => closeUnpinnedOpenHistoryCharts(),
      clearTaskFlipStates,
      renderFriendsFooterAlertBadge,
      closeTaskExportModal,
      closeShareTaskModal,
      closeFriendProfileModal,
      closeFriendRequestModal,
      openHistoryManager: () => openHistoryManagerFromShell(),
      requestScheduleEntryScroll: (mode) => requestScheduleEntryScroll(mode),
      render: () => render(),
      renderHistory: (taskId) => renderHistory(taskId),
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
    getFocusModeTaskId: () => focusState.get("focusModeTaskId"),
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
      setHistoryByTaskId: (value) => {
        taskCollectionBindings.setHistoryByTaskId(value as TaskTimerMutableState["historyByTaskId"]);
      },
      getLiveSessionsByTaskId: taskCollectionBindings.getLiveSessionsByTaskId,
      setLiveSessionsByTaskId: (value) => {
        taskCollectionBindings.setLiveSessionsByTaskId(value as TaskTimerMutableState["liveSessionsByTaskId"]);
      },
      getDeletedTaskMeta: taskCollectionBindings.getDeletedTaskMeta,
      preferencesState,
      rewardState,
      focusBindings,
      setCloudPreferencesCache: (value: UserPreferencesV1 | null) => {
        rewardState.set("cloudPreferencesCache", value ?? null);
        cacheRuntimeState.set("cloudPreferencesCache", value ?? null);
      },
      getCurrentPlan,
      hasEntitlement,
      currentUid: () => getCurrentTaskTimerUid(),
      getTaskElapsedMs: (task) => getTaskElapsedMs(task),
      sessionColorForTaskMs,
      captureSessionNoteSnapshot: (taskId) => runtimeActions.captureSessionNoteSnapshot(taskId),
      setFocusSessionDraft: (taskId, noteRaw) => runtimeActions.setFocusSessionDraft(taskId, noteRaw),
      clearFocusSessionDraft: (taskId) => runtimeActions.clearFocusSessionDraft(taskId),
      syncFocusSessionNotesInput: (taskId) => runtimeActions.syncFocusSessionNotesInput(taskId),
      syncFocusSessionNotesAccordion: (taskId) => runtimeActions.syncFocusSessionNotesAccordion(taskId),
      appendHistoryEntry: (taskId, entry) => workspaceRepository.appendHistoryEntry(taskId, entry as any),
      saveLiveSession: (session) => workspaceRepository.saveLiveSession(session as any),
      clearLiveSession: (taskId) => workspaceRepository.clearLiveSession(taskId),
      saveHistoryLocally: workspaceRepository.saveHistoryLocally,
      saveHistory: workspaceRepository.saveHistory,
      buildDefaultCloudPreferences: () => workspaceRepository.buildDefaultPreferences(),
      saveCloudPreferences: (prefs) => workspaceRepository.savePreferences(prefs),
      syncSharedTaskSummariesForTask,
      syncOwnFriendshipProfile,
    })
  );
  const {
    syncRewardSessionTrackerForRunningTask,
  } = rewardsHistoryApi;
  rewardSessionBridge.bootstrapRewardSessionTrackers();

  const runtimeCoordinator = createTaskTimerRuntimeCoordinator({
      els,
      scheduleState,
      scheduleRuntime,
      escapeHtmlUI,
      getWeekStarting: () => preferencesState.get("weekStarting"),
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
  closeUnpinnedOpenHistoryCharts = runtimeFacade.closeUnpinnedOpenHistoryCharts;
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
    confirm,
    closeConfirm,
    saveHistory: (history, opts) => workspaceRepository.saveHistory(history as TaskTimerMutableState["historyByTaskId"], opts),
    saveDeletedMeta: workspaceRepository.saveDeletedMeta,
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
      rewardState,
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
      saveHistory: workspaceRepository.saveHistory,
      saveHistoryAndWait: workspaceRepository.saveHistoryAndWait,
      loadHistory: workspaceRepository.loadHistory,
      refreshHistoryFromCloud: workspaceRepository.refreshHistoryFromCloud,
      saveDeletedMeta: workspaceRepository.saveDeletedMeta,
      loadDeletedMeta: workspaceRepository.loadDeletedMeta,
      load: () => runtimeActions.load(),
      render,
      navigateToAppRoute,
      openOverlay: overlayBindings.openOverlay,
      closeOverlay: overlayBindings.closeOverlay,
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
  const { openHistoryManager, openManualEntryForTask, registerHistoryManagerEvents } = historyManager;
  openManualEntryForTaskFromHistoryManager = openManualEntryForTask;
  openHistoryManagerFromShell = openHistoryManager;

  const historyInline = createTaskTimerHistoryInline(
    createTaskTimerHistoryInlineContext({
      els,
      on,
      sharedTasks: sharedTaskApi,
      rewardState,
      taskCollectionBindings,
      historyUiState,
      historyViewByTaskId,
      openHistoryTaskIds,
      getCurrentAppPage: currentAppPageBinding.getCurrentAppPage,
      savePinnedHistoryTaskIds,
      persistTaskUiToCloud,
      saveHistory: workspaceRepository.saveHistory,
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
      getHistoryEntryNote: (entry) => runtimeActions.getHistoryEntryNote(entry),
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
      rewardState,
      toggleSwitchElement: (el, enabled) => setSwitchState(el, enabled),
      isSwitchOn: (el) => isSwitchEnabled(el),
      storageKeys: {
        THEME_KEY,
        TASK_VIEW_KEY,
        TASK_ORDER_BY_KEY,
        AUTO_FOCUS_ON_TASK_LAUNCH_KEY,
        MOBILE_PUSH_ALERTS_KEY,
        WEB_PUSH_ALERTS_KEY,
        OPTIMAL_PRODUCTIVITY_START_TIME_KEY,
        OPTIMAL_PRODUCTIVITY_END_TIME_KEY,
        OPTIMAL_PRODUCTIVITY_DAYS_KEY,
        MENU_BUTTON_STYLE_KEY,
        WEEK_STARTING_KEY,
        STARTUP_MODULE_KEY,
      },
      defaultModeColors: DEFAULT_MODE_COLORS,
      normalizeRewardProgress,
      getCurrentUid: () => getCurrentTaskTimerUid(),
      loadCachedPreferences: workspaceRepository.loadCachedPreferences,
      loadCachedTaskUi: workspaceRepository.loadCachedTaskUi,
      getCloudPreferencesCache: () => cacheRuntimeState.get("cloudPreferencesCache"),
      setCloudPreferencesCache: (value) => {
        cacheRuntimeState.set("cloudPreferencesCache", value ?? null);
      },
      buildDefaultCloudPreferences: () => workspaceRepository.buildDefaultPreferences(),
      saveCloudPreferences: (prefs) => {
        workspaceRepository.savePreferences(prefs as UserPreferencesV1);
      },
      syncOwnFriendshipProfile,
      saveDashboardWidgetState: saveDashboardWidgetStateApi,
      getDashboardCardSizeMapForStorage: getDashboardCardSizeMapForStorageApi,
      getDashboardAvgRange: getDashboardAvgRangeApi,
      taskCollectionBindings,
      getCurrentEditTask: () => editTaskApi?.getCurrentEditTask() ?? null,
      syncEditCheckpointAlertUi: (task) => editTaskApi?.syncEditCheckpointAlertUi(task),
      clearTaskFlipStates,
      save: renderBindings.save,
      render,
      renderDashboardPanelMenu: () => renderDashboardPanelMenuApi(),
      renderDashboardWidgets: renderBindings.renderDashboardWidgets,
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
    getModeColor,
    syncModeLabelsUi,
    loadModeLabels,
    loadThemePreference,
    loadMenuButtonStylePreference,
    loadWeekStartingPreference,
    loadStartupModulePreference,
    loadTaskViewPreference,
    loadTaskOrderByPreference,
    loadAutoFocusOnTaskLaunchSetting,
    toggleSwitchElement,
    isSwitchOn,
    syncTaskSettingsUi,
    loadDynamicColorsSetting,
    loadCheckpointAlertSettings,
    loadOptimalProductivityPeriodPreference,
    loadOptimalProductivityDaysPreference,
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
    ...editStateBindings,
    getCheckpointAlertSoundEnabled: () => preferencesState.get("checkpointAlertSoundEnabled"),
    getCheckpointAlertToastEnabled: () => preferencesState.get("checkpointAlertToastEnabled"),
    getMobilePushAlertsEnabled: () => preferencesState.get("mobilePushAlertsEnabled"),
    setMobilePushAlertsEnabledState: (value) => {
      preferencesState.set("mobilePushAlertsEnabled", value);
    },
    getWebPushAlertsEnabled: () => preferencesState.get("webPushAlertsEnabled"),
    setWebPushAlertsEnabledState: (value) => {
      preferencesState.set("webPushAlertsEnabled", value);
    },
    persistPushAlertsPreference: () => {
      try {
        localStorage.setItem(MOBILE_PUSH_ALERTS_KEY, preferencesState.get("mobilePushAlertsEnabled") ? "true" : "false");
        localStorage.setItem(WEB_PUSH_ALERTS_KEY, preferencesState.get("webPushAlertsEnabled") ? "true" : "false");
      } catch {
        // Ignore localStorage write failures.
      }
    },
    getElapsedMs,
    render,
    save: renderBindings.save,
    confirm: overlayBindings.confirm,
    closeConfirm: overlayBindings.closeConfirm,
    cloneTaskForEdit: (task) => editTaskApi?.cloneTaskForEdit(task) ?? task,
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
      workspaceRepository,
      historyPersistence: workspaceAdapters.historyPersistence,
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
      loadCachedTaskUi: workspaceRepository.loadCachedTaskUi,
      loadDeletedMeta: workspaceRepository.loadDeletedMeta,
      setDeletedTaskMeta: (value) => {
        taskCollectionBindings.setDeletedTaskMeta(value);
      },
      primeDashboardCacheFromShadow: workspaceRepository.primeDashboardCacheFromShadow,
      loadFocusSessionNotes: () => loadFocusSessionNotesApi(),
      loadAddTaskCustomNames: () => loadAddTaskCustomNamesApi(),
      loadWeekStartingPreference,
      loadStartupModulePreference,
      loadTaskViewPreference,
      loadTaskOrderByPreference,
      loadAutoFocusOnTaskLaunchSetting,
      loadDynamicColorsSetting,
      loadCheckpointAlertSettings,
      loadOptimalProductivityPeriodPreference,
      loadOptimalProductivityDaysPreference,
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
        workspaceRepository.saveHistory(taskCollectionBindings.getHistoryByTaskId(), { showIndicator: false });
      },
      jumpToTaskById: (taskId) => runtimeActions.jumpToTaskById(taskId),
      maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
      normalizeLoadedTask,
    })
  );

  cloudSyncApi = createTaskTimerCloudSync({
    workspaceRepository,
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
    getTasks: taskCollectionBindings.getTasks,
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
      getTaskView: () => "tile",
      hasTaskList: () => !!els.taskList,
      getTileColumnCount,
      getCurrentTileColumnCount: () => appRuntimeState.get("currentTileColumnCount"),
      renderDashboardWidgetsWithBusy,
      renderGroupsPage,
      openHistoryManager,
      pendingPushEvent: PENDING_PUSH_TASK_EVENT,
      maybeHandlePendingTaskJump: () => runtimeActions.maybeHandlePendingTaskJump(),
      maybeHandlePendingPushAction,
      rehydrateFromCloudAndRender,
      maybeRestorePendingTimeGoalFlow: () => maybeRestorePendingTimeGoalFlowApi(),
      flushPendingCloudWrites: () => workspaceRepository.flushPendingCloudWrites(),
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
    flushPendingCloudWrites: () => workspaceRepository.flushPendingCloudWrites(),
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
