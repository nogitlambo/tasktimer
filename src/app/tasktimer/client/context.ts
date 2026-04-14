import type { TaskTimerElements } from "./elements";
import type { TaskTimerRuntime } from "./runtime";
import type { TaskTimerSharedTaskApi } from "./task-shared";
import type {
  AppPage,
  DashboardAvgRange,
  DashboardCardSize,
  DashboardMomentumDriverKey,
  DashboardRenderOptions,
  DashboardTimelineDensity,
  HistoryViewState,
  MainMode,
} from "./types";
import type { DeletedTaskMeta, HistoryByTaskId, Task } from "../lib/types";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import type { FriendProfile, FriendRequest, Friendship, SharedTaskSummary } from "../lib/friendsStore";
import type { DashboardWeekStart } from "../lib/historyChart";
import type { TaskTimerEntitlement, TaskTimerPlan } from "../lib/entitlements";
import type { RewardProgressV1 } from "../lib/rewards";
import type { CompletionDifficulty } from "../lib/completionDifficulty";

export type TaskTimerAppPageSyncUrlMode = "replace" | "push" | false;

export type TaskTimerCachedModeSettings =
  | Partial<
      Record<
        MainMode,
        {
          label?: unknown;
          enabled?: unknown;
        }
      >
    >
  | Record<string, unknown>
  | null;

export type TaskTimerCachedPreferences = {
  schemaVersion?: unknown;
  theme?: unknown;
  menuButtonStyle?: unknown;
  weekStarting?: unknown;
  taskView?: unknown;
  autoFocusOnTaskLaunchEnabled?: unknown;
  dynamicColorsEnabled?: unknown;
  mobilePushAlertsEnabled?: unknown;
  webPushAlertsEnabled?: unknown;
  checkpointAlertSoundEnabled?: unknown;
  checkpointAlertToastEnabled?: unknown;
  modeSettings?: TaskTimerCachedModeSettings;
  rewards?: unknown;
  updatedAtMs?: unknown;
};

export type TaskTimerConfirmOptions = {
  okLabel?: string;
  cancelLabel?: string;
  altLabel?: string | null;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  checkboxDisabled?: boolean;
  checkboxNote?: string;
  checkbox2Label?: string | null;
  checkbox2Checked?: boolean;
  dangerInputLabel?: string;
  dangerInputMatch?: string | null;
  dangerInputPlaceholder?: string;
  textHtml?: string;
  onOk?: (() => void) | null;
  onAlt?: (() => void) | null;
  onCancel?: (() => void) | null;
};

export type TaskTimerConfirmOverlayContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  getConfirmAction: () => null | (() => void);
  setConfirmAction: (value: null | (() => void)) => void;
  getConfirmActionAlt: () => null | (() => void);
  setConfirmActionAlt: (value: null | (() => void)) => void;
  closeEdit: (saveChanges: boolean) => void;
  closeElapsedPad: (applyValue: boolean) => void;
  closeTaskExportModal: () => void;
  closeShareTaskModal: () => void;
};

export type TaskTimerPopupMenuContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  navigateToAppRoute: (path: string) => void;
  openHistoryManager: () => void;
  syncModeLabelsUi: () => void;
  syncTaskSettingsUi: () => void;
  clearHistoryEntryNoteOverlayPosition: () => void;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerRewardsHistoryContext = {
  rewardSessionTrackersStorageKey: string;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  getWeekStarting: () => DashboardWeekStart;
  getDashboardIncludedModes: () => Record<MainMode, boolean>;
  getRewardProgress: () => RewardProgressV1;
  setRewardProgress: (value: RewardProgressV1) => void;
  getRewardSessionTrackersByTaskId: () => Record<
    string,
    {
      taskId: string;
      untrackedMs: number;
      segments: Array<{ startMs: number; endMs: number; multiplier: number }>;
      activeSegmentStartMs: number | null;
      activeMultiplier: number | null;
    }
  >;
  setRewardSessionTrackersByTaskId: (
    value: Record<
      string,
      {
        taskId: string;
        untrackedMs: number;
        segments: Array<{ startMs: number; endMs: number; multiplier: number }>;
        activeSegmentStartMs: number | null;
        activeMultiplier: number | null;
      }
    >
  ) => void;
  getCloudPreferencesCache: () => UserPreferencesV1 | null;
  setCloudPreferencesCache: (value: UserPreferencesV1 | null) => void;
  getFocusModeTaskId: () => string | null;
  getCurrentPlan: () => TaskTimerPlan;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  currentUid: () => string | null;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  isModeEnabled: (mode: MainMode) => boolean;
  getTaskElapsedMs: (task: Task) => number;
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
  captureSessionNoteSnapshot: (taskId?: string | null) => string;
  setFocusSessionDraft: (taskId: string, note: string) => void;
  clearFocusSessionDraft: (taskId: string) => void;
  syncFocusSessionNotesInput: (taskId: string | null) => void;
  syncFocusSessionNotesAccordion: (taskId: string | null) => void;
  appendHistoryEntry: (taskId: string, entry: Record<string, unknown>) => void;
  saveHistoryLocally: (history: HistoryByTaskId) => void;
  buildDefaultCloudPreferences: () => UserPreferencesV1;
  saveCloudPreferences: (prefs: UserPreferencesV1) => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  syncOwnFriendshipProfile: (uid: string, partial: { currentRankId?: string | null | undefined }) => Promise<unknown>;
};

export type TaskTimerTaskUiPersistenceContext = {
  els: TaskTimerElements;
  getCurrentUid: () => string;
  getHistoryRangeDaysByTaskId: () => Record<string, 7 | 14>;
  getHistoryRangeModeByTaskId: () => Record<string, "entries" | "day">;
  getPinnedHistoryTaskIds: () => Set<string>;
  setPinnedHistoryTaskIds: (value: Set<string>) => void;
  getAddTaskCustomNames: () => string[];
  getCloudTaskUiCache: () => unknown;
  setCloudTaskUiCache: (value: unknown) => void;
  loadCachedTaskUi: () => unknown;
  saveCloudTaskUi: (value: unknown) => void;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  saveHistory: (history: HistoryByTaskId, opts?: { showIndicator?: boolean }) => void;
  getWorkingIndicatorStack: () => Array<{ key: number; message: string }>;
  getWorkingIndicatorKeySeq: () => number;
  setWorkingIndicatorKeySeq: (value: number) => void;
  getWorkingIndicatorOverlayActive: () => boolean;
  setWorkingIndicatorOverlayActive: (value: boolean) => void;
  getWorkingIndicatorRestoreFocusEl: () => HTMLElement | null;
  setWorkingIndicatorRestoreFocusEl: (value: HTMLElement | null) => void;
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
};

export type TaskTimerImportExportContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (value: HistoryByTaskId) => void;
  getExportTaskIndex: () => number | null;
  setExportTaskIndex: (value: number | null) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  saveHistory: (history: HistoryByTaskId) => void;
  render: () => void;
  createId: () => string;
  makeTask: (name: string, order: number) => Task;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  ensureMilestoneIdentity: (task: Task) => void;
  getPresetIntervalValueNum: (task: Task) => number;
  getPresetIntervalNextSeqNum: (task: Task) => number;
  cleanupHistory: (history: HistoryByTaskId) => HistoryByTaskId;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerTaskListUiContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  runtime: TaskTimerRuntime;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getCurrentMode: () => MainMode;
  getCurrentAppPage: () => AppPage;
  getTaskView: () => "list" | "tile";
  getTaskDragEl: () => HTMLElement | null;
  setTaskDragEl: (value: HTMLElement | null) => void;
  getFlippedTaskIds: () => Set<string>;
  getLastRenderedTaskFlipMode: () => MainMode | null;
  setLastRenderedTaskFlipMode: (value: MainMode | null) => void;
  getLastRenderedTaskFlipView: () => "list" | "tile" | null;
  setLastRenderedTaskFlipView: (value: "list" | "tile" | null) => void;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  render: () => void;
};

export type TaskTimerAppShellContext = {
  els: TaskTimerElements;
  runtime: TaskTimerRuntime;
  on: TaskTimerRuntime["on"];
  initialAppPage: AppPage;
  navStackKey: string;
  navStackMax: number;
  nativeBackDebounceMs: number;
  getCurrentAppPage: () => AppPage;
  setCurrentAppPage: (page: AppPage) => void;
  getDashboardMenuFlipped: () => boolean;
  setDashboardMenuFlipped: (value: boolean) => void;
  syncDashboardMenuFlipUi: () => void;
  getSuppressNavStackPush: () => boolean;
  setSuppressNavStackPush: (value: boolean) => void;
  getNavStackMemory: () => string[];
  setNavStackMemory: (stack: string[]) => void;
  getLastNativeBackHandledAtMs: () => number;
  setLastNativeBackHandledAtMs: (ms: number) => void;
  resetAllOpenHistoryChartSelections: () => void;
  clearTaskFlipStates: () => void;
  renderFriendsFooterAlertBadge: () => void;
  closeTaskExportModal: () => void;
  closeShareTaskModal: () => void;
  closeFriendProfileModal: () => void;
  closeFriendRequestModal: () => void;
  render: () => void;
  renderHistory: (taskId: string) => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderGroupsPage: () => void;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<void>;
  getOpenHistoryTaskIds: () => Iterable<string>;
  closeTopOverlayIfOpen: () => boolean;
  closeMobileDetailPanelIfOpen: () => boolean;
  showExitAppConfirm: () => void;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerAppPageOptions = {
  pushNavStack?: boolean;
  syncUrl?: TaskTimerAppPageSyncUrlMode;
  skipDashboardRender?: boolean;
};

export type TaskTimerGroupsContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getCurrentUid: () => string | null;
  getCurrentAppPage: () => AppPage;
  getCurrentMode: () => MainMode;
  applyMainMode: (mode: MainMode) => void;
  applyAppPage: (page: AppPage, opts?: TaskTimerAppPageOptions) => void;
  render: () => void;
  closeConfirm: () => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  escapeHtmlUI: (value: unknown) => string;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  showWorkingIndicator: (message: string) => number;
  hideWorkingIndicator: (key?: number) => void;
  getMergedFriendProfile: (friendUid: string, baseProfile?: FriendProfile | null) => FriendProfile;
  getFriendAvatarSrcById: (avatarIdRaw: string) => string;
  buildFriendInitialAvatarDataUrl: (labelRaw: string) => string;
  getFriendAvatarSrc: (profile?: FriendProfile | null) => string;
  jumpToTaskById: (taskId: string) => void;
  getGroupsIncomingRequests: () => FriendRequest[];
  setGroupsIncomingRequests: (value: FriendRequest[]) => void;
  getGroupsOutgoingRequests: () => FriendRequest[];
  setGroupsOutgoingRequests: (value: FriendRequest[]) => void;
  getGroupsFriendships: () => Friendship[];
  setGroupsFriendships: (value: Friendship[]) => void;
  getGroupsSharedSummaries: () => SharedTaskSummary[];
  setGroupsSharedSummaries: (value: SharedTaskSummary[]) => void;
  getOwnSharedSummaries: () => SharedTaskSummary[];
  setOwnSharedSummaries: (value: SharedTaskSummary[]) => void;
  getGroupsLoading: () => boolean;
  setGroupsLoading: (value: boolean) => void;
  getGroupsLoadingDepth: () => number;
  setGroupsLoadingDepth: (value: number) => void;
  getGroupsRefreshSeq: () => number;
  setGroupsRefreshSeq: (value: number) => void;
  getActiveFriendProfileUid: () => string | null;
  setActiveFriendProfileUid: (value: string | null) => void;
  getActiveFriendProfileName: () => string;
  setActiveFriendProfileName: (value: string) => void;
  getFriendProfileCacheByUid: () => Record<string, FriendProfile>;
  setFriendProfileCacheByUid: (value: Record<string, FriendProfile>) => void;
  getShareTaskIndex: () => number | null;
  setShareTaskIndex: (value: number | null) => void;
  getShareTaskMode: () => "share" | "unshare";
  setShareTaskMode: (value: "share" | "unshare") => void;
  getShareTaskTaskId: () => string | null;
  setShareTaskTaskId: (value: string | null) => void;
  getOpenFriendSharedTaskUids: () => Set<string>;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerTasksContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  sharedTasks: TaskTimerSharedTaskApi;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (value: HistoryByTaskId) => void;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  getCurrentUid: () => string | null;
  getCurrentAppPage: () => AppPage;
  getCurrentMode: () => MainMode;
  getTaskView: () => "list" | "tile";
  getCurrentTileColumnCount: () => number;
  setCurrentTileColumnCount: (value: number) => void;
  getFocusModeTaskId: () => string | null;
  getOpenHistoryTaskIds: () => Set<string>;
  getPinnedHistoryTaskIds: () => Set<string>;
  getHistoryViewByTaskId: () => Record<string, HistoryViewState>;
  getThemeMode: () => "purple" | "cyan" | "lime";
  getAutoFocusOnTaskLaunchEnabled: () => boolean;
  getCheckpointAlertSoundEnabled: () => boolean;
  getCheckpointAlertToastEnabled: () => boolean;
  getDynamicColorsEnabled: () => boolean;
  getRewardProgress: () => RewardProgressV1;
  getEditIndex: () => number | null;
  setEditIndex: (value: number | null) => void;
  getEditTaskDraft: () => Task | null;
  setEditTaskDraft: (value: Task | null) => void;
  getEditTaskDurationUnit: () => "minute" | "hour";
  setEditTaskDurationUnit: (value: "minute" | "hour") => void;
  getEditTaskDurationPeriod: () => "day" | "week";
  setEditTaskDurationPeriod: (value: "day" | "week") => void;
  getEditDraftSnapshot: () => string;
  setEditDraftSnapshot: (value: string) => void;
  getEditMoveTargetMode: () => MainMode;
  setEditMoveTargetMode: (value: MainMode) => void;
  getElapsedPadTarget: () => HTMLInputElement | null;
  setElapsedPadTarget: (value: HTMLInputElement | null) => void;
  getElapsedPadMilestoneRef: () =>
    | {
        task: Task;
        milestone: { hours: number; description: string };
        ms: Task["milestones"];
        onApplied?: (() => void) | undefined;
      }
    | null;
  setElapsedPadMilestoneRef: (
    value:
      | {
          task: Task;
          milestone: { hours: number; description: string };
          ms: Task["milestones"];
          onApplied?: (() => void) | undefined;
        }
      | null
  ) => void;
  getElapsedPadDraft: () => string;
  setElapsedPadDraft: (value: string) => void;
  getElapsedPadOriginal: () => string;
  setElapsedPadOriginal: (value: string) => void;
  getCheckpointAutoResetDirty: () => boolean;
  setCheckpointAutoResetDirty: (value: boolean) => void;
  render: () => void;
  renderHistory: (taskId: string) => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  syncTimeGoalModalWithTaskState: () => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  getElapsedMs: (task: Task) => number;
  getTaskElapsedMs: (task: Task) => number;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  saveHistory: (history: HistoryByTaskId) => void;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  escapeHtmlUI: (value: unknown) => string;
  getModeColor: (mode: MainMode) => string;
  fillBackgroundForPct: (pct: number) => string;
  formatMainTaskElapsedHtml: (elapsedMs: number, running: boolean) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  isTaskSharedByOwner: (taskId: string) => boolean;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions & { checkbox2Label?: string | null; checkbox2Checked?: boolean }) => void;
  closeConfirm: () => void;
  openEdit: (index: number) => void;
  clearTaskTimeGoalFlow: (taskId: string) => void;
  flushPendingFocusSessionNoteSave: (taskId: string) => void;
  clearCheckpointBaseline: (taskId: string | null | undefined) => void;
  openRewardSessionSegment: (task: Task | null | undefined, startMs?: number | null) => void;
  closeRewardSessionSegment: (task: Task | null | undefined, endMs?: number | null) => void;
  clearRewardSessionTracker: (taskId: string | null | undefined) => void;
  openFocusMode: (index: number) => void;
  closeFocusMode: () => void;
  canLogSession: (task: Task) => boolean;
  appendCompletedSessionHistory: (task: Task, completedAtMs: number, elapsedMs: number, note?: string, completionDifficulty?: CompletionDifficulty) => void;
  resetCheckpointAlertTracking: (taskId: string | null | undefined) => void;
  clearFocusSessionDraft: (taskId: string) => void;
  syncFocusSessionNotesInput: (taskId: string | null) => void;
  syncFocusSessionNotesAccordion: (taskId: string | null) => void;
  captureResetActionSessionNote: (taskId: string) => string;
  setFocusSessionDraft: (taskId: string, note: string) => void;
  setResetTaskConfirmBusy: (busy: boolean, logging: boolean) => void;
  syncConfirmPrimaryToggleUi: () => void;
  cloneTaskForEdit: (task: Task) => Task;
  getModeLabel: (mode: MainMode) => string;
  isModeEnabled: (mode: MainMode) => boolean;
  setEditTimeGoalEnabled: (enabled: boolean) => void;
  syncEditTaskTimeGoalUi: (task: Task) => void;
  syncEditCheckpointAlertUi: (task: Task) => void;
  syncEditSaveAvailability: (task: Task) => void;
  syncEditMilestoneSectionUi: (task: Task) => void;
  setMilestoneUnitUi: (unit: "hour" | "minute") => void;
  renderMilestoneEditor: (task: Task) => void;
  clearEditValidationState: () => void;
  validateEditTimeGoal: () => boolean;
  showEditValidationError: (task: Task, message: string) => void;
  editTaskHasActiveTimeGoal: () => boolean;
  hasNonPositiveCheckpoint: (milestones: Task["milestones"]) => boolean;
  hasCheckpointAtOrAboveTimeGoal: (
    milestones: Task["milestones"],
    unitSec: number,
    timeGoalMinutes: number
  ) => boolean;
  isCheckpointAtOrAboveTimeGoal: (checkpointHours: number, unitSec: number, timeGoalMinutes: number) => boolean;
  formatCheckpointTimeGoalText: (
    task: Task,
    opts?: { timeGoalMinutes?: number; forEditDraft?: boolean }
  ) => string;
  getEditTaskTimeGoalMinutes: () => number;
  getEditTaskTimeGoalMinutesFor: (value: number, unit: "minute" | "hour", period: "day" | "week") => number;
  getAddTaskTimeGoalMinutesState: () => number;
  isEditTimeGoalEnabled: () => boolean;
  ensureMilestoneIdentity: (task: Task) => void;
  toggleSwitchElement: (el: HTMLElement | null, on: boolean) => void;
  isSwitchOn: (el: HTMLElement | null) => boolean;
  buildEditDraftSnapshot: (task: Task) => string;
  getCurrentEditTask: () => Task | null;
  syncEditTaskDurationReadout: (task?: Task | null) => void;
  maybeToggleEditPresetIntervals: (nextEnabled: boolean) => void;
  hasValidPresetInterval: (task: Task) => boolean;
  addMilestoneWithCurrentPreset: (task: Task, timeGoalMinutes: number) => boolean;
  getPresetIntervalNextSeqNum: (task: Task) => number;
  isEditMilestoneUnitDay: () => boolean;
  setTaskFlipped: (taskId: string, flipped: boolean, taskEl?: HTMLElement | null) => void;
  syncTaskFlipStatesForVisibleTasks: (activeTaskIds: Set<string>) => void;
  applyTaskFlipDomState: (taskId: string, taskEl?: HTMLElement | null) => void;
  openHistoryInline: (index: number) => void;
  openTaskExportModal: (index: number) => void;
  openShareTaskModal: (index: number) => void;
  currentUid: () => string | null;
  deleteSharedTaskSummariesForTask: (uid: string, taskId: string) => Promise<void>;
  refreshOwnSharedSummaries: () => Promise<void>;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<void>;
  deleteTask: (index: number) => void;
  checkpointRepeatActiveTaskId: () => string | null;
  activeCheckpointToastTaskId: () => string | null;
  stopCheckpointRepeatAlert: () => void;
  broadcastCheckpointAlertMute: (taskId: string) => void;
  enqueueCheckpointToast: (title: string, text: string, opts: unknown) => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  syncSharedTaskSummariesForTasks: (taskIds: string[]) => Promise<void>;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerEditTaskContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  sharedTasks: TaskTimerSharedTaskApi;
  getTasks: () => Task[];
  getCurrentMode: () => MainMode;
  getEditIndex: () => number | null;
  setEditIndex: (value: number | null) => void;
  getEditTaskDraft: () => Task | null;
  setEditTaskDraft: (value: Task | null) => void;
  setEditDraftSnapshot: (value: string) => void;
  getEditTaskDurationUnit: () => "minute" | "hour";
  setEditTaskDurationUnit: (value: "minute" | "hour") => void;
  getEditTaskDurationPeriod: () => "day" | "week";
  setEditTaskDurationPeriod: (value: "day" | "week") => void;
  getEditMoveTargetMode: () => MainMode;
  setEditMoveTargetMode: (value: MainMode) => void;
  getElapsedPadTarget: () => HTMLInputElement | null;
  setElapsedPadTarget: (value: HTMLInputElement | null) => void;
  getElapsedPadMilestoneRef: () =>
    | {
        task: Task;
        milestone: { hours: number; description: string };
        ms: Task["milestones"];
        onApplied?: (() => void) | undefined;
      }
    | null;
  setElapsedPadMilestoneRef: (
    value:
      | {
          task: Task;
          milestone: { hours: number; description: string };
          ms: Task["milestones"];
          onApplied?: (() => void) | undefined;
        }
      | null
  ) => void;
  getElapsedPadDraft: () => string;
  setElapsedPadDraft: (value: string) => void;
  getElapsedPadOriginal: () => string;
  setElapsedPadOriginal: (value: string) => void;
  getCheckpointAlertSoundEnabled: () => boolean;
  getCheckpointAlertToastEnabled: () => boolean;
  getElapsedMs: (task: Task) => number;
  render: () => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  cloneTaskForEdit: (task: Task) => Task;
  getModeLabel: (mode: MainMode) => string;
  isModeEnabled: (mode: MainMode) => boolean;
  escapeHtmlUI: (value: unknown) => string;
  setEditTimeGoalEnabled: (enabled: boolean) => void;
  isEditTimeGoalEnabled: () => boolean;
  editTaskHasActiveTimeGoal: () => boolean;
  syncEditTaskTimeGoalUi: (task?: Task | null) => void;
  syncEditCheckpointAlertUi: (task: Task) => void;
  syncEditSaveAvailability: (task?: Task | null) => void;
  syncEditMilestoneSectionUi: (task: Task) => void;
  setMilestoneUnitUi: (unit: "hour" | "minute") => void;
  renderMilestoneEditor: (task: Task) => void;
  clearEditValidationState: () => void;
  validateEditTimeGoal: () => boolean;
  showEditValidationError: (task: Task | null | undefined, message: string) => void;
  getEditTaskTimeGoalMinutes: () => number;
  getEditTaskTimeGoalMinutesFor: (value: number, unit: "minute" | "hour", period: "day" | "week") => number;
  getAddTaskTimeGoalMinutesState: () => number;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  toggleSwitchElement: (el: HTMLElement | null, on: boolean) => void;
  isSwitchOn: (el: HTMLElement | null) => boolean;
  buildEditDraftSnapshot: (task: Task) => string;
  syncEditTaskDurationReadout: (task?: Task | null) => void;
  maybeToggleEditPresetIntervals: (nextEnabled: boolean) => void;
  isEditMilestoneUnitDay: () => boolean;
  resetCheckpointAlertTracking: (taskId: string | null | undefined) => void;
  clearCheckpointBaseline: (taskId: string | null | undefined) => void;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerAddTaskContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  sharedTasks: TaskTimerSharedTaskApi;
  getTasks: () => Task[];
  getCurrentMode: () => MainMode;
  setTasks: (value: Task[]) => void;
  getCheckpointAlertSoundEnabled: () => boolean;
  getCheckpointAlertToastEnabled: () => boolean;
  getAddTaskWizardStep: () => 1 | 2 | 3 | 4;
  setAddTaskWizardStepState: (value: 1 | 2 | 3 | 4) => void;
  getAddTaskPlannedStartTime: () => string;
  setAddTaskPlannedStartTimeState: (value: string) => void;
  getAddTaskPlannedStartOpenEnded: () => boolean;
  setAddTaskPlannedStartOpenEndedState: (value: boolean) => void;
  getAddTaskDurationValue: () => number;
  setAddTaskDurationValueState: (value: number) => void;
  getAddTaskDurationUnit: () => "minute" | "hour";
  setAddTaskDurationUnitState: (value: "minute" | "hour") => void;
  getAddTaskDurationPeriod: () => "day" | "week";
  setAddTaskDurationPeriodState: (value: "day" | "week") => void;
  getAddTaskNoTimeGoal: () => boolean;
  setAddTaskNoTimeGoalState: (value: boolean) => void;
  getAddTaskMilestonesEnabled: () => boolean;
  setAddTaskMilestonesEnabledState: (value: boolean) => void;
  getAddTaskMilestoneTimeUnit: () => "day" | "hour" | "minute";
  setAddTaskMilestoneTimeUnitState: (value: "day" | "hour" | "minute") => void;
  getAddTaskMilestones: () => Task["milestones"];
  setAddTaskMilestonesState: (value: Task["milestones"]) => void;
  getAddTaskCheckpointSoundEnabled: () => boolean;
  setAddTaskCheckpointSoundEnabledState: (value: boolean) => void;
  getAddTaskCheckpointSoundMode: () => "once" | "repeat";
  setAddTaskCheckpointSoundModeState: (value: "once" | "repeat") => void;
  getAddTaskCheckpointToastEnabled: () => boolean;
  setAddTaskCheckpointToastEnabledState: (value: boolean) => void;
  getAddTaskCheckpointToastMode: () => "auto5s" | "manual";
  setAddTaskCheckpointToastModeState: (value: "auto5s" | "manual") => void;
  getAddTaskPresetIntervalsEnabled: () => boolean;
  setAddTaskPresetIntervalsEnabledState: (value: boolean) => void;
  getAddTaskPresetIntervalValue: () => number;
  setAddTaskPresetIntervalValueState: (value: number) => void;
  getAddTaskCustomNames: () => string[];
  setAddTaskCustomNamesState: (value: string[]) => void;
  getSuppressAddTaskNameFocusOpen: () => boolean;
  setSuppressAddTaskNameFocusOpenState: (value: boolean) => void;
  loadCachedTaskUi: () => unknown;
  saveCloudTaskUi: (value: unknown) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  render: () => void;
  escapeHtmlUI: (value: unknown) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  jumpToTaskAndHighlight: (taskId: string) => void;
  openElapsedPadForMilestone: (
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) => void;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerSessionContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  runtime: TaskTimerRuntime;
  sharedTasks: TaskTimerSharedTaskApi;
  storageKeys: {
    FOCUS_SESSION_NOTES_KEY: string;
    TIME_GOAL_PENDING_FLOW_KEY: string;
  };
  getTasks: () => Task[];
  getCurrentAppPage: () => AppPage;
  getHistoryByTaskId: () => HistoryByTaskId;
  getWeekStarting: () => DashboardWeekStart;
  getDashboardIncludedModes: () => Record<MainMode, boolean>;
  getRewardProgress: () => RewardProgressV1;
  getCurrentUid: () => string | null;
  getFocusModeTaskId: () => string | null;
  setFocusModeTaskId: (value: string | null) => void;
  getFocusModeTaskName: () => string;
  setFocusModeTaskName: (value: string) => void;
  getFocusShowCheckpoints: () => boolean;
  setFocusShowCheckpoints: (value: boolean) => void;
  getFocusCheckpointSig: () => string;
  setFocusCheckpointSig: (value: string) => void;
  getDeferredFocusModeTimeGoalModals: () => Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }>;
  setDeferredFocusModeTimeGoalModals: (
    value: Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }>
  ) => void;
  getTimeGoalModalTaskId: () => string | null;
  setTimeGoalModalTaskId: (value: string | null) => void;
  getTimeGoalModalFrozenElapsedMs: () => number;
  setTimeGoalModalFrozenElapsedMs: (value: number) => void;
  getTimeGoalReminderAtMsByTaskId: () => Record<string, number>;
  getTimeGoalCompleteDurationUnit: () => "minute" | "hour";
  setTimeGoalCompleteDurationUnit: (value: "minute" | "hour") => void;
  getTimeGoalCompleteDurationPeriod: () => "day" | "week";
  setTimeGoalCompleteDurationPeriod: (value: "day" | "week") => void;
  getFocusSessionNotesByTaskId: () => Record<string, string>;
  setFocusSessionNotesByTaskId: (value: Record<string, string>) => void;
  getFocusSessionNoteSaveTimer: () => number | null;
  setFocusSessionNoteSaveTimer: (value: number | null) => void;
  getCheckpointToastQueue: () => unknown[];
  getActiveCheckpointToast: () => unknown | null;
  setActiveCheckpointToast: (value: unknown | null) => void;
  getCheckpointToastAutoCloseTimer: () => number | null;
  setCheckpointToastAutoCloseTimer: (value: number | null) => void;
  getCheckpointToastCountdownRefreshTimer: () => number | null;
  setCheckpointToastCountdownRefreshTimer: (value: number | null) => void;
  getCheckpointBeepAudio: () => HTMLAudioElement | null;
  setCheckpointBeepAudio: (value: HTMLAudioElement | null) => void;
  getCheckpointBeepQueueCount: () => number;
  setCheckpointBeepQueueCount: (value: number) => void;
  getCheckpointBeepQueueTimer: () => number | null;
  setCheckpointBeepQueueTimer: (value: number | null) => void;
  getCheckpointRepeatStopAtMs: () => number;
  setCheckpointRepeatStopAtMs: (value: number) => void;
  getCheckpointRepeatCycleTimer: () => number | null;
  setCheckpointRepeatCycleTimer: (value: number | null) => void;
  getCheckpointRepeatActiveTaskId: () => string | null;
  setCheckpointRepeatActiveTaskId: (value: string | null) => void;
  getCheckpointAutoResetDirty: () => boolean;
  setCheckpointAutoResetDirty: (value: boolean) => void;
  getCheckpointFiredKeysByTaskId: () => Record<string, Set<string>>;
  getCheckpointBaselineSecByTaskId: () => Record<string, number>;
  getDynamicColorsEnabled: () => boolean;
  getCheckpointAlertSoundEnabled: () => boolean;
  getCheckpointAlertToastEnabled: () => boolean;
  broadcastCheckpointAlertMute: (taskId: string) => void;
  render: () => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderDashboardLiveWidgets: () => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  navigateToAppRoute: (path: string) => void;
  normalizedPathname: () => string;
  savePendingTaskJump: (taskId: string) => void;
  jumpToTaskById: (taskId: string) => void;
  escapeHtmlUI: (value: unknown) => string;
  formatTime: (value: number) => string;
  formatMainTaskElapsed: (elapsedMs: number, running?: boolean) => string;
  formatMainTaskElapsedHtml: (elapsedMs: number, running: boolean) => string;
  getModeColor: (mode: MainMode) => string;
  fillBackgroundForPct: (pct: number) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  isModeEnabled: (mode: MainMode) => boolean;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  getHistoryEntryNote: (entry: unknown) => string;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  syncRewardSessionTrackerForTask: (task: Task | null | undefined, nowValue?: number) => void;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  startTask: (index: number) => void;
  stopTask: (index: number) => void;
  resetTask: (index: number) => void;
  resetTaskStateImmediate: (task: Task, opts?: { logHistory?: boolean; sessionNote?: string; completionDifficulty?: CompletionDifficulty }) => void;
};

export type TaskTimerDashboardContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  syncDashboardRefreshButtonUi: () => void;
  getRewardProgress: () => RewardProgressV1;
  getTasks: () => Task[];
  getCurrentAppPage: () => AppPage;
  getDashboardMenuFlipped: () => boolean;
  setDashboardMenuFlipped: (value: boolean) => void;
  syncDashboardMenuFlipUi: () => void;
  getDashboardEditMode: () => boolean;
  setDashboardEditMode: (value: boolean) => void;
  getDashboardDragEl: () => HTMLElement | null;
  setDashboardDragEl: (value: HTMLElement | null) => void;
  getDashboardOrderDraftBeforeEdit: () => string[] | null;
  setDashboardOrderDraftBeforeEdit: (value: string[] | null) => void;
  getDashboardCardSizes: () => Record<string, DashboardCardSize>;
  setDashboardCardSizes: (value: Record<string, DashboardCardSize>) => void;
  getDashboardCardSizesDraftBeforeEdit: () => Record<string, DashboardCardSize> | null;
  setDashboardCardSizesDraftBeforeEdit: (value: Record<string, DashboardCardSize> | null) => void;
  getDashboardCardVisibility: () => Record<string, boolean>;
  setDashboardCardVisibility: (value: Record<string, boolean>) => void;
  getDashboardIncludedModes: () => Record<MainMode, boolean>;
  setDashboardIncludedModes: (value: Record<MainMode, boolean>) => void;
  getDashboardAvgRange: () => DashboardAvgRange;
  setDashboardAvgRange: (value: DashboardAvgRange) => void;
  getDashboardTimelineDensity: () => DashboardTimelineDensity;
  setDashboardTimelineDensity: (value: DashboardTimelineDensity) => void;
  getCloudDashboardCache: () => unknown;
  setCloudDashboardCache: (value: unknown) => void;
  loadCachedDashboard: () => unknown;
  saveCloudDashboard: (value: unknown) => void;
  getModeLabel: (mode: MainMode) => string;
  isModeEnabled: (mode: MainMode) => boolean;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderDashboardTimelineCard: () => void;
  selectDashboardTimelineSuggestion: (key: string | null) => void;
  selectDashboardMomentumDriver: (key: DashboardMomentumDriverKey | string | null) => string | null;
  openDashboardHeatSummaryCard: (dayKey: string, dateLabel: string) => void;
  closeDashboardHeatSummaryCard: (opts?: { restoreFocus?: boolean }) => void;
};

export type TaskTimerDashboardRenderContext = {
  els: TaskTimerElements;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  getWeekStarting: () => DashboardWeekStart;
  getDashboardIncludedModes: () => Record<MainMode, boolean>;
  getDashboardAvgRange: () => DashboardAvgRange;
  setDashboardAvgRange: (value: DashboardAvgRange) => void;
  getDashboardTimelineDensity: () => DashboardTimelineDensity;
  setDashboardTimelineDensity: (value: DashboardTimelineDensity) => void;
  getDashboardWidgetHasRenderedData: () => {
    tasksCompleted: boolean;
    momentum: boolean;
    focusTrend: boolean;
    heatCalendar: boolean;
    modeDistribution: boolean;
    avgSession: boolean;
    timeline: boolean;
  };
  getDashboardRefreshHoldActive: () => boolean;
  getCloudRefreshInFlight: () => Promise<void> | null;
  getDynamicColorsEnabled: () => boolean;
  getElapsedMs: (task: Task) => number;
  escapeHtmlUI: (value: unknown) => string;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  isModeEnabled: (mode: MainMode) => boolean;
  getModeLabel: (mode: MainMode) => string;
  getModeColor: (mode: MainMode) => string;
  addRangeMsToLocalDayMap: (dayMap: Map<string, number>, startMs: number, endMs: number) => void;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
};

export type TaskTimerPreferencesContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  storageKeys: {
    THEME_KEY: string;
    TASK_VIEW_KEY: string;
    AUTO_FOCUS_ON_TASK_LAUNCH_KEY: string;
    MOBILE_PUSH_ALERTS_KEY: string;
    WEB_PUSH_ALERTS_KEY: string;
    MENU_BUTTON_STYLE_KEY: string;
    MODE_SETTINGS_KEY: string;
    WEEK_STARTING_KEY: string;
  };
  defaultModeLabels: Record<MainMode, string>;
  defaultModeEnabled: Record<MainMode, boolean>;
  defaultModeColors: Record<MainMode, string>;
  getThemeMode: () => "purple" | "cyan" | "lime";
  setThemeModeState: (value: "purple" | "cyan" | "lime") => void;
  getTaskView: () => "list" | "tile";
  setTaskViewState: (value: "list" | "tile") => void;
  getMenuButtonStyle: () => "parallelogram" | "square";
  setMenuButtonStyleState: (value: "parallelogram" | "square") => void;
  getWeekStarting: () => DashboardWeekStart;
  setWeekStartingState: (value: DashboardWeekStart) => void;
  getAutoFocusOnTaskLaunchEnabled: () => boolean;
  setAutoFocusOnTaskLaunchEnabledState: (value: boolean) => void;
  getDynamicColorsEnabled: () => boolean;
  setDynamicColorsEnabledState: (value: boolean) => void;
  getMobilePushAlertsEnabled: () => boolean;
  setMobilePushAlertsEnabledState: (value: boolean) => void;
  getWebPushAlertsEnabled: () => boolean;
  setWebPushAlertsEnabledState: (value: boolean) => void;
  getCheckpointAlertSoundEnabled: () => boolean;
  setCheckpointAlertSoundEnabledState: (value: boolean) => void;
  getCheckpointAlertToastEnabled: () => boolean;
  setCheckpointAlertToastEnabledState: (value: boolean) => void;
  getModeLabels: () => Record<MainMode, string>;
  setModeLabelsState: (value: Record<MainMode, string>) => void;
  getModeEnabled: () => Record<MainMode, boolean>;
  setModeEnabledState: (value: Record<MainMode, boolean>) => void;
  getCurrentMode: () => MainMode;
  setCurrentModeState: (value: MainMode) => void;
  getEditMoveTargetMode: () => MainMode;
  setEditMoveTargetModeState: (value: MainMode) => void;
  getRewardProgress: () => unknown;
  normalizeRewardProgress: (value: unknown) => unknown;
  currentUid: () => string | null;
  loadCachedPreferences: () => TaskTimerCachedPreferences | null | undefined;
  loadCachedTaskUi: () => unknown;
  getCloudPreferencesCache: () => TaskTimerCachedPreferences | null | undefined;
  setCloudPreferencesCache: (value: TaskTimerCachedPreferences | null | undefined) => void;
  buildDefaultCloudPreferences: () => NonNullable<TaskTimerCachedPreferences>;
  saveCloudPreferences: (prefs: NonNullable<TaskTimerCachedPreferences>) => void;
  syncOwnFriendshipProfile: (uid: string, partial: { currentRankId?: string | null | undefined }) => Promise<unknown>;
  saveDashboardWidgetState: (partialWidgets: Record<string, unknown>) => void;
  getDashboardCardSizeMapForStorage: () => Record<string, unknown>;
  getDashboardAvgRange: () => string;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getCurrentEditTask: () => Task | null;
  syncEditCheckpointAlertUi: (task: Task) => void;
  clearTaskFlipStates: () => void;
  taskModeOf: (task: Task | null | undefined) => MainMode;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  render: () => void;
  renderDashboardPanelMenu: () => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  ensureDashboardIncludedModesValid: () => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  closeConfirm: () => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  escapeHtmlUI: (value: unknown) => string;
  stopCheckpointRepeatAlert: () => void;
  getCurrentAppPage: () => AppPage;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerHistoryManagerSortKey = "ts" | "ms";
export type TaskTimerHistoryManagerSortDir = "asc" | "desc";

export type TaskTimerHistoryManagerContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  runtime: TaskTimerRuntime;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (value: HistoryByTaskId) => void;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  getHmExpandedTaskGroups: () => Set<string>;
  setHmExpandedTaskGroups: (value: Set<string>) => void;
  getHmExpandedDateGroups: () => Set<string>;
  setHmExpandedDateGroups: (value: Set<string>) => void;
  getHmSortKey: () => TaskTimerHistoryManagerSortKey;
  setHmSortKey: (value: TaskTimerHistoryManagerSortKey) => void;
  getHmSortDir: () => TaskTimerHistoryManagerSortDir;
  setHmSortDir: (value: TaskTimerHistoryManagerSortDir) => void;
  getHmBulkEditMode: () => boolean;
  setHmBulkEditMode: (value: boolean) => void;
  getHmBulkSelectedRows: () => Set<string>;
  setHmBulkSelectedRows: (value: Set<string>) => void;
  getHmRowsByTask: () => Record<string, string[]>;
  setHmRowsByTask: (value: Record<string, string[]>) => void;
  getHmRowsByTaskDate: () => Record<string, string[]>;
  setHmRowsByTaskDate: (value: Record<string, string[]>) => void;
  getHistoryManagerRefreshInFlight: () => Promise<void> | null;
  setHistoryManagerRefreshInFlight: (value: Promise<void> | null) => void;
  isArchitectUser: () => boolean;
  getHistoryEntryNote: (entry: unknown) => string;
  csvEscape: (value: unknown) => string;
  parseCsvRows: (input: string) => string[][];
  downloadCsvFile: (filename: string, text: string) => void;
  formatTwo: (value: number) => string;
  formatDateTime: (value: number) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  saveHistory: (history: HistoryByTaskId) => void;
  saveHistoryAndWait: (history: HistoryByTaskId) => Promise<void>;
  loadHistory: () => HistoryByTaskId;
  refreshHistoryFromCloud: () => Promise<HistoryByTaskId>;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  loadDeletedMeta: () => DeletedTaskMeta;
  load: () => void;
  render: () => void;
  navigateToAppRoute: (path: string) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  escapeHtmlUI: (value: unknown) => string;
  syncSharedTaskSummariesForTasks: (taskIds: string[]) => Promise<void>;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  getCurrentPlan: () => TaskTimerPlan;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};

export type TaskTimerHistoryInlineContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  sharedTasks: TaskTimerSharedTaskApi;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (value: HistoryByTaskId) => void;
  getHistoryRangeDaysByTaskId: () => Record<string, 7 | 14>;
  getHistoryRangeModeByTaskId: () => Record<string, "entries" | "day">;
  getHistoryViewByTaskId: () => Record<string, HistoryViewState>;
  getOpenHistoryTaskIds: () => Set<string>;
  getCurrentAppPage: () => AppPage;
  getPinnedHistoryTaskIds: () => Set<string>;
  setPinnedHistoryTaskIds: (value: Set<string>) => void;
  savePinnedHistoryTaskIds: () => void;
  getHistoryEntryNoteAnchorTaskId: () => string;
  setHistoryEntryNoteAnchorTaskId: (value: string) => void;
  persistTaskUiToCloud: () => void;
  saveHistory: (history: HistoryByTaskId) => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  navigateToAppRoute: (path: string) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  render: () => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  nowMs: () => number;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  formatTime: (value: number) => string;
  formatTwo: (value: number) => string;
  formatDateTime: (value: number) => string;
  escapeHtmlUI: (value: unknown) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
  getModeColor: (mode: MainMode) => string;
  getDynamicColorsEnabled: () => boolean;
  hasEntitlement: (entitlement: TaskTimerEntitlement) => boolean;
  showUpgradePrompt: (featureLabel: string, requiredPlan?: TaskTimerPlan) => void;
};
