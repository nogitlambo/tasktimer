import { DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "../lib/rewards";
import type { TaskTimerWorkspaceRepository } from "../lib/workspaceRepository";
import { createTaskTimerWorkspaceHistoryPersistence, createTaskTimerWorkspaceRepository } from "../lib/workspaceRepository";
import { createTaskTimerMutableStore } from "./mutable-store";
import { createTaskTimerRootBootstrap } from "./root-state";
import { createTaskTimerRuntime, type TaskTimerRuntime } from "./runtime";
import type { TaskTimerScheduleState } from "./schedule-runtime";
import type { AppPage, TaskTimerMutableState } from "./types";

type RuntimeCompositionFactories = {
  createRuntime?: () => TaskTimerRuntime;
  createWorkspaceRepository?: () => TaskTimerWorkspaceRepository;
};

export function createTaskTimerRuntimeComposition(
  initialAppPage: AppPage,
  storageKey: string,
  factories: RuntimeCompositionFactories = {}
) {
  const {
    initialState,
    storageKeys,
  } = createTaskTimerRootBootstrap(initialAppPage, storageKey);
  const runtime = (factories.createRuntime ?? createTaskTimerRuntime)();
  const workspaceRepository = (factories.createWorkspaceRepository ?? createTaskTimerWorkspaceRepository)();
  const workspaceSnapshot = workspaceRepository.loadWorkspaceSnapshot();
  const cloudPreferencesCache = workspaceSnapshot.preferences;

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
    confirmActionCancel: initialState.confirmActionCancel,
    timeGoalModalTaskId: initialState.timeGoalModalTaskId,
    timeGoalModalFrozenElapsedMs: initialState.timeGoalModalFrozenElapsedMs,
  });
  const scheduleState = createTaskTimerMutableStore<TaskTimerScheduleState>({
    selectedDay: "mon",
    dragTaskId: null,
    dragSourceDay: null,
    dragPreviewDay: null,
    dragPreviewStartMinutes: null,
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
  const taskDataState = createTaskTimerMutableStore({
    deletedTaskMeta: initialState.deletedTaskMeta,
    tasks: initialState.tasks,
    historyByTaskId: initialState.historyByTaskId,
    liveSessionsByTaskId: initialState.liveSessionsByTaskId,
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
    startupModule: initialState.startupModule,
    taskView: "tile",
    taskOrderBy: initialState.taskOrderBy,
    dynamicColorsEnabled: initialState.dynamicColorsEnabled,
    autoFocusOnTaskLaunchEnabled: initialState.autoFocusOnTaskLaunchEnabled,
    mobilePushAlertsEnabled: initialState.mobilePushAlertsEnabled,
    webPushAlertsEnabled: initialState.webPushAlertsEnabled,
    interactionClickSoundEnabled: initialState.interactionClickSoundEnabled,
    checkpointAlertSoundEnabled: initialState.checkpointAlertSoundEnabled,
    checkpointAlertToastEnabled: initialState.checkpointAlertToastEnabled,
    optimalProductivityStartTime: initialState.optimalProductivityStartTime,
    optimalProductivityEndTime: initialState.optimalProductivityEndTime,
    optimalProductivityDays: initialState.optimalProductivityDays,
  });
  const sessionRuntimeState = createTaskTimerMutableStore({
    deferredFocusModeTimeGoalModals: [] as Array<{
      taskId: string;
      frozenElapsedMs: number;
      reminder: boolean;
      awardPreview?: { fromXp: number; toXp: number; awardedXp: number };
    }>,
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
  const addTaskState = createTaskTimerMutableStore({
    addTaskMilestonesEnabled: initialState.addTaskMilestonesEnabled,
    addTaskMilestoneTimeUnit: initialState.addTaskMilestoneTimeUnit,
    addTaskMilestones: initialState.addTaskMilestones,
    addTaskCheckpointSoundEnabled: initialState.addTaskCheckpointSoundEnabled,
    addTaskCheckpointSoundMode: initialState.addTaskCheckpointSoundMode,
    addTaskCheckpointToastEnabled: initialState.addTaskCheckpointToastEnabled,
    addTaskCheckpointToastMode: initialState.addTaskCheckpointToastMode,
    addTaskWizardStep: initialState.addTaskWizardStep,
    addTaskType: initialState.addTaskType,
    addTaskOnceOffDay: initialState.addTaskOnceOffDay,
    addTaskPlannedStartTime: initialState.addTaskPlannedStartTime,
    addTaskDurationValue: initialState.addTaskDurationValue,
    addTaskDurationUnit: initialState.addTaskDurationUnit,
    addTaskDurationPeriod: initialState.addTaskDurationPeriod,
    addTaskNoTimeGoal: initialState.addTaskNoTimeGoal,
    suppressAddTaskNameFocusOpen: initialState.suppressAddTaskNameFocusOpen,
  });
  const editTaskState = createTaskTimerMutableStore({
    editIndex: initialState.editIndex,
    editDraftSnapshot: initialState.editDraftSnapshot,
    editTaskDurationUnit: "hour" as "minute" | "hour",
    editTaskDurationPeriod: "week" as "day" | "week",
    editTaskDraft: null as TaskTimerMutableState["tasks"][number] | null,
    elapsedPadTarget: initialState.elapsedPadTarget,
    elapsedPadMilestoneRef: initialState.elapsedPadMilestoneRef,
    elapsedPadDraft: initialState.elapsedPadDraft,
    elapsedPadOriginal: initialState.elapsedPadOriginal,
  });
  const dashboardUiState = createTaskTimerMutableStore({
    dashboardEditMode: initialState.dashboardEditMode,
    dashboardDragEl: initialState.dashboardDragEl,
    dashboardOrderDraftBeforeEdit: initialState.dashboardOrderDraftBeforeEdit,
    dashboardCardPlacements: initialState.dashboardCardPlacements,
    dashboardCardPlacementsDraftBeforeEdit: initialState.dashboardCardPlacementsDraftBeforeEdit,
    dashboardCardSizes: initialState.dashboardCardSizes,
    dashboardCardSizesDraftBeforeEdit: initialState.dashboardCardSizesDraftBeforeEdit,
    dashboardCardVisibility: initialState.dashboardCardVisibility,
    dashboardAvgRange: initialState.dashboardAvgRange,
    dashboardTimelineDensity: initialState.dashboardTimelineDensity,
  });
  const taskListRuntimeState = createTaskTimerMutableStore({
    taskDragEl: initialState.taskDragEl,
    lastRenderedTaskFlipView: null as "list" | "tile" | null,
  });
  const cacheRuntimeState = createTaskTimerMutableStore({
    cloudPreferencesCache,
    cloudDashboardCache: workspaceSnapshot.dashboard,
    cloudTaskUiCache: workspaceSnapshot.taskUi,
    navStackMemory: initialState.navStackMemory,
    pendingTaskJumpMemory: initialState.pendingTaskJumpMemory,
    exportTaskIndex: initialState.exportTaskIndex,
    historyManagerRefreshInFlight: null as Promise<void> | null,
    lastDashboardLiveSignature: "",
  });
  const rewardSessionTrackersByTaskIdInitial: Record<
    string,
    {
      taskId: string;
      untrackedMs: number;
      segments: Array<{ startMs: number; endMs: number; multiplier: number }>;
      activeSegmentStartMs: number | null;
      activeMultiplier: number | null;
    }
  > = {};
  const rewardState = createTaskTimerMutableStore({
    rewardProgress: normalizeRewardProgress(
      (cloudPreferencesCache || workspaceRepository.buildDefaultPreferences()).rewards || DEFAULT_REWARD_PROGRESS
    ),
    rewardSessionTrackersByTaskId: rewardSessionTrackersByTaskIdInitial,
    cloudPreferencesCache,
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

  const workspaceAdapters = {
    historyPersistence: createTaskTimerWorkspaceHistoryPersistence(workspaceRepository),
    preferencesPersistence: {
      loadCached: () => workspaceRepository.loadCachedPreferences(),
      buildDefault: () => workspaceRepository.buildDefaultPreferences(),
      save: (prefs: Parameters<TaskTimerWorkspaceRepository["savePreferences"]>[0]) => workspaceRepository.savePreferences(prefs),
    },
  };

  return {
    initialState,
    storageKeys,
    derivedKeys: {
      TIME_GOAL_PENDING_FLOW_KEY: `${storageKey}:timeGoalPendingFlow`,
      PENDING_PUSH_TASK_ID_KEY: `${storageKey}:pendingPushTaskId`,
      PENDING_PUSH_ACTION_KEY: `${storageKey}:pendingPushAction`,
      REWARD_SESSION_TRACKERS_KEY: `${storageKey}:rewardSessionTrackers`,
    },
    events: {
      PENDING_PUSH_TASK_EVENT: "tasktimer:pendingTaskJump",
    },
    runtime,
    workspaceRepository,
    workspaceAdapters,
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
      openHistoryTaskIds: initialState.openHistoryTaskIds,
      historyViewByTaskId: initialState.historyViewByTaskId,
      timeGoalReminderAtMsByTaskId: initialState.timeGoalReminderAtMsByTaskId,
      checkpointToastQueue: initialState.checkpointToastQueue,
      checkpointFiredKeysByTaskId: initialState.checkpointFiredKeysByTaskId,
      checkpointBaselineSecByTaskId: initialState.checkpointBaselineSecByTaskId,
      openFriendSharedTaskUids: initialState.openFriendSharedTaskUids,
      dashboardWidgetHasRenderedData: initialState.dashboardWidgetHasRenderedData,
    },
  };
}
