import type { AppPage, MainMode, TaskTimerMutableState } from "./types";
import { DEFAULT_REWARD_PROGRESS } from "../lib/rewards";

export type TaskTimerStorageKeys = {
  AUTO_FOCUS_ON_TASK_LAUNCH_KEY: string;
  THEME_KEY: string;
  MENU_BUTTON_STYLE_KEY: string;
  WEEK_STARTING_KEY: string;
  TASK_VIEW_KEY: string;
  DYNAMIC_COLORS_KEY: string;
  MOBILE_PUSH_ALERTS_KEY: string;
  WEB_PUSH_ALERTS_KEY: string;
  CHECKPOINT_ALERT_SOUND_KEY: string;
  CHECKPOINT_ALERT_TOAST_KEY: string;
  OPTIMAL_PRODUCTIVITY_START_TIME_KEY: string;
  OPTIMAL_PRODUCTIVITY_END_TIME_KEY: string;
  MODE_SETTINGS_KEY: string;
  NAV_STACK_KEY: string;
  FOCUS_SESSION_NOTES_KEY: string;
  NAV_STACK_MAX: number;
  NATIVE_BACK_DEBOUNCE_MS: number;
};

export const DEFAULT_MODE_LABELS: Record<MainMode, string> = {
  mode1: "Mode 1",
  mode2: "Mode 2",
  mode3: "Mode 3",
};

export const DEFAULT_MODE_ENABLED: Record<MainMode, boolean> = {
  mode1: true,
  mode2: true,
  mode3: true,
};

export const DEFAULT_MODE_COLORS: Record<MainMode, string> = {
  mode1: "#00CFC8",
  mode2: "#3A86FF",
  mode3: "#FF6B6B",
};

export function createTaskTimerStorageKeys(storageKey: string): TaskTimerStorageKeys {
  return {
    AUTO_FOCUS_ON_TASK_LAUNCH_KEY: `${storageKey}:autoFocusOnTaskLaunchEnabled`,
    THEME_KEY: `${storageKey}:theme`,
    MENU_BUTTON_STYLE_KEY: `${storageKey}:menuButtonStyle`,
    WEEK_STARTING_KEY: `${storageKey}:weekStarting`,
    TASK_VIEW_KEY: `${storageKey}:taskView`,
    DYNAMIC_COLORS_KEY: `${storageKey}:dynamicColorsEnabled`,
    MOBILE_PUSH_ALERTS_KEY: `${storageKey}:mobilePushAlertsEnabled`,
    WEB_PUSH_ALERTS_KEY: `${storageKey}:webPushAlertsEnabled`,
    CHECKPOINT_ALERT_SOUND_KEY: `${storageKey}:checkpointAlertSoundEnabled`,
    CHECKPOINT_ALERT_TOAST_KEY: `${storageKey}:checkpointAlertToastEnabled`,
    OPTIMAL_PRODUCTIVITY_START_TIME_KEY: `${storageKey}:optimalProductivityStartTime`,
    OPTIMAL_PRODUCTIVITY_END_TIME_KEY: `${storageKey}:optimalProductivityEndTime`,
    MODE_SETTINGS_KEY: `${storageKey}:modeSettings`,
    NAV_STACK_KEY: `${storageKey}:navStack`,
    FOCUS_SESSION_NOTES_KEY: `${storageKey}:focusSessionNotes`,
    NAV_STACK_MAX: 50,
    NATIVE_BACK_DEBOUNCE_MS: 200,
  };
}

export function createInitialTaskTimerState(initialAppPage: AppPage): TaskTimerMutableState {
  return {
    deletedTaskMeta: {},
    tasks: [],
    currentMode: "mode1",
    modeLabels: { ...DEFAULT_MODE_LABELS },
    modeEnabled: { ...DEFAULT_MODE_ENABLED },
    editIndex: null,
    editDraftSnapshot: "",
    focusCheckpointSig: "",
    focusModeTaskName: "",
    focusShowCheckpoints: true,
    suppressAddTaskNameFocusOpen: false,
    confirmAction: null,
    confirmActionAlt: null,
    themeMode: "purple",
    menuButtonStyle: "square",
    addTaskCustomNames: [],
    weekStarting: "mon",
    taskView: "tile",
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    mobilePushAlertsEnabled: false,
    webPushAlertsEnabled: false,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    optimalProductivityStartTime: "00:00",
    optimalProductivityEndTime: "23:59",
    rewardProgress: DEFAULT_REWARD_PROGRESS,
    historyByTaskId: {},
    historyRangeDaysByTaskId: {},
    historyRangeModeByTaskId: {},
    focusModeTaskId: null,
    openHistoryTaskIds: new Set(),
    pinnedHistoryTaskIds: new Set(),
    hmExpandedTaskGroups: new Set(),
    hmExpandedDateGroups: new Set(),
    hmSortKey: "ts",
    hmSortDir: "desc",
    hmBulkEditMode: false,
    hmBulkSelectedRows: new Set(),
    hmRowsByTask: {},
    hmRowsByTaskDate: {},
    historyViewByTaskId: {},
    addTaskMilestonesEnabled: false,
    addTaskMilestoneTimeUnit: "hour",
    addTaskMilestones: [],
    addTaskCheckpointSoundEnabled: false,
    addTaskCheckpointSoundMode: "once",
    addTaskCheckpointToastEnabled: false,
    addTaskCheckpointToastMode: "auto5s",
    addTaskPresetIntervalsEnabled: false,
    addTaskPresetIntervalValue: 0,
    timeGoalModalTaskId: null,
    timeGoalModalFrozenElapsedMs: 0,
    timeGoalReminderAtMsByTaskId: {},
    addTaskWizardStep: 1,
    addTaskPlannedStartTime: "09:00",
    addTaskPlannedStartOpenEnded: false,
    addTaskDurationValue: 5,
    addTaskDurationUnit: "hour",
    addTaskDurationPeriod: "week",
    focusSessionNotesByTaskId: {},
    addTaskNoTimeGoal: false,
    elapsedPadTarget: null,
    elapsedPadMilestoneRef: null,
    elapsedPadDraft: "",
    elapsedPadOriginal: "",
    editMoveTargetMode: "mode1",
    dashboardEditMode: false,
    dashboardDragEl: null,
    taskDragEl: null,
    dashboardOrderDraftBeforeEdit: null,
    dashboardCardSizes: {},
    dashboardCardSizesDraftBeforeEdit: null,
    dashboardCardVisibility: {},
    dashboardIncludedModes: { mode1: true, mode2: true, mode3: true },
    dashboardAvgRange: "past7",
    dashboardTimelineDensity: "medium",
    dashboardMenuFlipped: false,
    currentAppPage: initialAppPage,
    currentTileColumnCount: 1,
    suppressNavStackPush: false,
    lastNativeBackHandledAtMs: 0,
    checkpointToastQueue: [],
    activeCheckpointToast: null,
    checkpointBeepAudio: null,
    checkpointBeepQueueCount: 0,
    checkpointRepeatStopAtMs: 0,
    checkpointRepeatActiveTaskId: null,
    checkpointAutoResetDirty: false,
    historyNoteCloudRepairAttempted: false,
    checkpointFiredKeysByTaskId: {},
    checkpointBaselineSecByTaskId: {},
    cloudPreferencesCache: null,
    cloudDashboardCache: null,
    cloudTaskUiCache: null,
    navStackMemory: [],
    pendingTaskJumpMemory: null,
    groupsIncomingRequests: [],
    groupsOutgoingRequests: [],
    groupsFriendships: [],
    groupsSharedSummaries: [],
    ownSharedSummaries: [],
    shareTaskIndex: null,
    shareTaskMode: "share",
    shareTaskTaskId: null,
    exportTaskIndex: null,
    groupsLoading: false,
    groupsLoadingDepth: 0,
    groupsRefreshSeq: 0,
    activeFriendProfileUid: null,
    activeFriendProfileName: "",
    historyEntryNoteAnchorTaskId: "",
    openFriendSharedTaskUids: new Set(),
    workingIndicatorStack: [],
    workingIndicatorKeySeq: 0,
    workingIndicatorOverlayActive: false,
    workingIndicatorRestoreFocusEl: null,
    dashboardBusyStack: [],
    dashboardBusyKeySeq: 0,
    dashboardBusyOverlayActive: false,
    dashboardBusyRestoreFocusEl: null,
    dashboardBusyShownAtMs: 0,
    dashboardBusyHideTimer: null,
    friendProfileCacheByUid: {},
    cloudRefreshInFlight: null,
    lastCloudRefreshAtMs: 0,
    pendingDeferredCloudRefresh: false,
    lastUiInteractionAtMs: 0,
    dashboardWidgetHasRenderedData: {
      tasksCompleted: false,
      momentum: false,
      focusTrend: false,
      heatCalendar: false,
      modeDistribution: false,
      avgSession: false,
      timeline: false,
    },
  };
}
