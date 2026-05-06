import type { DeletedTaskMeta, HistoryByTaskId, Task } from "../lib/types";
import type { LiveSessionsByTaskId } from "../lib/types";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import type { DashboardWeekStart } from "../lib/historyChart";
import type { FriendProfile, FriendRequest, Friendship, SharedTaskSummary } from "../lib/friendsStore";
import type { RewardProgressV1 } from "../lib/rewards";
import type { TaskTimerAppPageOptions } from "./context";
import type { AppPage, DashboardAvgRange, DashboardRenderOptions, DashboardTimelineDensity, HistoryViewState, MainMode } from "./types";
import type { StartupModulePreference } from "../lib/startupModule";
import type { TaskTimerMutableStore } from "./mutable-store";
import { createTaskTimerAddTask } from "./add-task";
import { createTaskTimerAppShell } from "./app-shell";
import { createTaskTimerDashboard } from "./dashboard";
import { createTaskTimerDashboardRender } from "./dashboard-render";
import { createTaskTimerDashboardRuntime } from "./dashboard-runtime";
import { createTaskTimerDashboardBindings } from "./dashboard-bindings";
import { createTaskTimerGroups } from "./groups";
import { createTaskTimerHistoryInline } from "./history-inline";
import { createTaskTimerHistoryManager } from "./history-manager";
import { createTaskTimerPersistence } from "./persistence";
import { createTaskTimerPreferences } from "./preferences";
import { createTaskTimerRewardsHistory } from "./rewards-history";
import { createTaskTimerSession } from "./session";
import { createTaskTimerTasks } from "./tasks";

type MutableStore = Pick<TaskTimerMutableStore<Record<string, unknown>>, "get" | "set">;
const asType = <T>(value: unknown) => value as T;

type CreateGroupsOptionsArgs = {
  els: Parameters<typeof createTaskTimerGroups>[0]["els"];
  on: Parameters<typeof createTaskTimerGroups>[0]["on"];
  taskCollectionBindings: {
    getTasks: () => Task[];
    getHistoryByTaskId: () => HistoryByTaskId;
  };
  appRuntimeState: MutableStore;
  groupsState: MutableStore;
  openFriendSharedTaskUids: Set<string>;
  getCurrentUid: () => string | null;
  applyMainMode: (mode: MainMode) => void;
  applyAppPage: (page: AppPage, opts?: TaskTimerAppPageOptions) => void;
  render: () => void;
  closeConfirm: () => void;
  confirm: Parameters<typeof createTaskTimerGroups>[0]["confirm"];
  escapeHtmlUI: (value: unknown) => string;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  showWorkingIndicator: (message: string) => number;
  hideWorkingIndicator: (key?: number) => void;
  getMergedFriendProfile: (friendUid: string, baseProfile?: FriendProfile | null) => FriendProfile;
  getFriendAvatarSrcById: (avatarIdRaw: string) => string;
  buildFriendInitialAvatarDataUrl: (labelRaw: string) => string;
  getFriendAvatarSrc: (profile?: FriendProfile | null) => string;
  jumpToTaskById: (taskId: string) => void;
  hasEntitlement: Parameters<typeof createTaskTimerGroups>[0]["hasEntitlement"];
  getCurrentPlan: Parameters<typeof createTaskTimerGroups>[0]["getCurrentPlan"];
  showUpgradePrompt: Parameters<typeof createTaskTimerGroups>[0]["showUpgradePrompt"];
};

type CreatePreferencesOptionsArgs = {
  els: Parameters<typeof createTaskTimerPreferences>[0]["els"];
  on: Parameters<typeof createTaskTimerPreferences>[0]["on"];
  preferencesState: MutableStore;
  rewardState: MutableStore;
  storageKeys: Parameters<typeof createTaskTimerPreferences>[0]["storageKeys"];
  defaultModeColors: Parameters<typeof createTaskTimerPreferences>[0]["defaultModeColors"];
  toggleSwitchElement: Parameters<typeof createTaskTimerPreferences>[0]["toggleSwitchElement"];
  isSwitchOn: Parameters<typeof createTaskTimerPreferences>[0]["isSwitchOn"];
  normalizeRewardProgress: (value: unknown) => unknown;
  getCurrentUid: () => string | null;
  loadCachedPreferences: Parameters<typeof createTaskTimerPreferences>[0]["loadCachedPreferences"];
  loadCachedTaskUi: Parameters<typeof createTaskTimerPreferences>[0]["loadCachedTaskUi"];
  getCloudPreferencesCache: () => unknown;
  setCloudPreferencesCache: (value: UserPreferencesV1 | null) => void;
  buildDefaultCloudPreferences: () => unknown;
  saveCloudPreferences: (prefs: unknown) => void;
  syncOwnFriendshipProfile: Parameters<typeof createTaskTimerPreferences>[0]["syncOwnFriendshipProfile"];
  saveDashboardWidgetState: Parameters<typeof createTaskTimerPreferences>[0]["saveDashboardWidgetState"];
  getDashboardCardSizeMapForStorage: Parameters<typeof createTaskTimerPreferences>[0]["getDashboardCardSizeMapForStorage"];
  getDashboardAvgRange: Parameters<typeof createTaskTimerPreferences>[0]["getDashboardAvgRange"];
  taskCollectionBindings: {
    getTasks: () => Task[];
    setTasks: (value: Task[]) => void;
  };
  getCurrentEditTask: () => Task | null;
  syncEditCheckpointAlertUi: (task: Task) => void;
  clearTaskFlipStates: () => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  render: () => void;
  renderDashboardPanelMenu: () => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  closeOverlay: Parameters<typeof createTaskTimerPreferences>[0]["closeOverlay"];
  closeConfirm: () => void;
  confirm: Parameters<typeof createTaskTimerPreferences>[0]["confirm"];
  escapeHtmlUI: (value: unknown) => string;
  stopCheckpointRepeatAlert: () => void;
  getCurrentAppPage: () => AppPage;
  hasEntitlement: Parameters<typeof createTaskTimerPreferences>[0]["hasEntitlement"];
  getCurrentPlan: Parameters<typeof createTaskTimerPreferences>[0]["getCurrentPlan"];
  showUpgradePrompt: Parameters<typeof createTaskTimerPreferences>[0]["showUpgradePrompt"];
};

type CreatePersistenceOptionsArgs = {
  workspaceRepository: Parameters<typeof createTaskTimerPersistence>[0]["workspaceRepository"];
  historyPersistence: Parameters<typeof createTaskTimerPersistence>[0]["historyPersistence"];
  focusSessionNotesKey: string;
  pendingTaskJumpKey: string;
  taskCollectionBindings: {
    getTasks: () => Task[];
    setTasks: (value: Task[]) => void;
    getHistoryByTaskId: () => HistoryByTaskId;
    setHistoryByTaskId: (value: HistoryByTaskId) => void;
    getLiveSessionsByTaskId: () => LiveSessionsByTaskId;
    setLiveSessionsByTaskId: (value: LiveSessionsByTaskId) => void;
  };
  historyUiState: MutableStore;
  focusState: MutableStore;
  runtimeDestroyed: () => boolean;
  getCurrentUid: () => string;
  pendingTaskJumpMemory: () => string | null;
  setPendingTaskJumpMemory: (value: string | null) => void;
  getFocusSessionNotesInputValue: () => string;
  setFocusSessionNotesInputValue: (value: string) => void;
  setFocusSessionNotesSectionOpen: (open: boolean) => void;
  getCurrentAppPage: () => AppPage;
  getInitialAppPageFromLocation: (fallback: AppPage) => AppPage;
  initialAppPage: AppPage;
  getCloudTaskUiCache: () => unknown;
  loadCachedTaskUi: Parameters<typeof createTaskTimerPersistence>[0]["loadCachedTaskUi"];
  loadDeletedMeta: Parameters<typeof createTaskTimerPersistence>[0]["loadDeletedMeta"];
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  primeDashboardCacheFromShadow: () => void;
  loadFocusSessionNotes: Parameters<typeof createTaskTimerPersistence>[0]["loadFocusSessionNotes"];
  loadAddTaskCustomNames: () => void;
  loadWeekStartingPreference: () => void;
  loadStartupModulePreference: () => void;
  loadTaskViewPreference: () => void;
  loadTaskOrderByPreference: () => void;
  loadAutoFocusOnTaskLaunchSetting: () => void;
  loadDynamicColorsSetting: () => void;
  loadCheckpointAlertSettings: () => void;
  loadOptimalProductivityPeriodPreference: () => void;
  loadDashboardWidgetState: () => void;
  loadThemePreference: () => void;
  loadMenuButtonStylePreference: () => void;
  syncTaskSettingsUi: () => void;
  loadPinnedHistoryTaskIds: () => void;
  loadModeLabels: () => void;
  backfillHistoryColorsFromSessionLogic: () => void;
  syncModeLabelsUi: () => void;
  applyMainMode: (mode: MainMode) => void;
  applyAppPage: (page: AppPage, opts?: TaskTimerAppPageOptions) => void;
  applyDashboardOrderFromStorage: () => void;
  applyDashboardCardSizes: () => void;
  renderDashboardPanelMenu: () => void;
  applyDashboardCardVisibility: () => void;
  applyDashboardEditMode: () => void;
  renderDashboardWidgets: () => void;
  maybeRepairHistoryNotesInCloudAfterHydrate: () => void;
  jumpToTaskById: (taskId: string) => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  normalizeLoadedTask: (task: Task) => void;
};

type CreateHistoryManagerOptionsArgs = {
  els: Parameters<typeof createTaskTimerHistoryManager>[0]["els"];
  on: Parameters<typeof createTaskTimerHistoryManager>[0]["on"];
  runtime: Parameters<typeof createTaskTimerHistoryManager>[0]["runtime"];
  rewardState: MutableStore;
  taskCollectionBindings: {
    getTasks: () => Task[];
    setTasks: (value: Task[]) => void;
    getHistoryByTaskId: () => HistoryByTaskId;
    setHistoryByTaskId: (value: HistoryByTaskId) => void;
    getLiveSessionsByTaskId: () => Record<string, unknown>;
    getDeletedTaskMeta: () => DeletedTaskMeta;
    setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  };
  historyUiState: MutableStore;
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
  closeOverlay: (overlay: HTMLElement | null) => void;
  confirm: Parameters<typeof createTaskTimerHistoryManager>[0]["confirm"];
  closeConfirm: () => void;
  escapeHtmlUI: (value: unknown) => string;
  syncSharedTaskSummariesForTasks: (taskIds: string[]) => Promise<void>;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  hasEntitlement: Parameters<typeof createTaskTimerHistoryManager>[0]["hasEntitlement"];
  getCurrentPlan: Parameters<typeof createTaskTimerHistoryManager>[0]["getCurrentPlan"];
  showUpgradePrompt: Parameters<typeof createTaskTimerHistoryManager>[0]["showUpgradePrompt"];
};

type CreateHistoryInlineOptionsArgs = {
  els: Parameters<typeof createTaskTimerHistoryInline>[0]["els"];
  on: Parameters<typeof createTaskTimerHistoryInline>[0]["on"];
  sharedTasks: Parameters<typeof createTaskTimerHistoryInline>[0]["sharedTasks"];
  rewardState: MutableStore;
  taskCollectionBindings: {
    getTasks: () => Task[];
    getHistoryByTaskId: () => HistoryByTaskId;
    setHistoryByTaskId: (value: HistoryByTaskId) => void;
  };
  historyUiState: MutableStore;
  historyViewByTaskId: Record<string, HistoryViewState>;
  openHistoryTaskIds: Set<string>;
  getCurrentAppPage: () => AppPage;
  savePinnedHistoryTaskIds: () => void;
  persistTaskUiToCloud: () => void;
  saveHistory: (history: HistoryByTaskId) => void;
  confirm: Parameters<typeof createTaskTimerHistoryInline>[0]["confirm"];
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
  getHistoryEntryNote: (entry: unknown) => string;
  escapeHtmlUI: (value: unknown) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
  getModeColor: (mode: MainMode) => string;
  getDynamicColorsEnabled: () => boolean;
  hasEntitlement: Parameters<typeof createTaskTimerHistoryInline>[0]["hasEntitlement"];
  showUpgradePrompt: Parameters<typeof createTaskTimerHistoryInline>[0]["showUpgradePrompt"];
};

type CreateTasksOptionsArgs = {
  els: Parameters<typeof createTaskTimerTasks>[0]["els"];
  on: Parameters<typeof createTaskTimerTasks>[0]["on"];
  sharedTasks: Parameters<typeof createTaskTimerTasks>[0]["sharedTasks"];
  taskCollectionBindings: {
    getTasks: () => Task[];
    setTasks: (value: Task[]) => void;
    getHistoryByTaskId: () => HistoryByTaskId;
    setHistoryByTaskId: (value: HistoryByTaskId) => void;
    getDeletedTaskMeta: () => DeletedTaskMeta;
    setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  };
  appRuntimeState: MutableStore;
  preferencesState: MutableStore;
  rewardState: MutableStore;
  historyUiState: MutableStore;
  openHistoryTaskIds: Set<string>;
  historyViewByTaskId: Record<string, HistoryViewState>;
  focusModeTaskId: () => string | null;
  editStateBindings: Pick<
    Parameters<typeof createTaskTimerTasks>[0],
    | "getEditIndex"
    | "setEditIndex"
    | "getEditTaskDraft"
    | "setEditTaskDraft"
    | "getEditTaskDurationUnit"
    | "setEditTaskDurationUnit"
    | "getEditTaskDurationPeriod"
    | "setEditTaskDurationPeriod"
    | "getEditDraftSnapshot"
    | "setEditDraftSnapshot"
    | "getElapsedPadTarget"
    | "setElapsedPadTarget"
    | "getElapsedPadMilestoneRef"
    | "setElapsedPadMilestoneRef"
    | "getElapsedPadDraft"
    | "setElapsedPadDraft"
    | "getElapsedPadOriginal"
    | "setElapsedPadOriginal"
  >;
  checkpointAutoResetDirty: () => boolean;
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
  confirm: Parameters<typeof createTaskTimerTasks>[0]["confirm"];
  closeConfirm: () => void;
  openEdit: (index: number, sourceEl?: HTMLElement | null) => void;
  clearTaskTimeGoalFlow: (taskId: string) => void;
  flushPendingFocusSessionNoteSave: (taskId: string) => void;
  clearCheckpointBaseline: (taskId: string | null | undefined) => void;
  openRewardSessionSegment: Parameters<typeof createTaskTimerTasks>[0]["openRewardSessionSegment"];
  closeRewardSessionSegment: Parameters<typeof createTaskTimerTasks>[0]["closeRewardSessionSegment"];
  clearRewardSessionTracker: Parameters<typeof createTaskTimerTasks>[0]["clearRewardSessionTracker"];
  upsertLiveSession: Parameters<typeof createTaskTimerTasks>[0]["upsertLiveSession"];
  finalizeLiveSession: Parameters<typeof createTaskTimerTasks>[0]["finalizeLiveSession"];
  openFocusMode: (index: number) => void;
  closeFocusMode: () => void;
  canLogSession: (task: Task) => boolean;
  appendCompletedSessionHistory: Parameters<typeof createTaskTimerTasks>[0]["appendCompletedSessionHistory"];
  resetCheckpointAlertTracking: (taskId: string | null | undefined) => void;
  clearFocusSessionDraft: (taskId: string) => void;
  syncFocusSessionNotesInput: (taskId: string | null) => void;
  syncFocusSessionNotesAccordion: (taskId: string | null) => void;
  captureResetActionSessionNote: (taskId: string) => string;
  setFocusSessionDraft: (taskId: string, note: string) => void;
  setResetTaskConfirmBusy: (busy: boolean, logging: boolean) => void;
  syncConfirmPrimaryToggleUi: () => void;
  cloneTaskForEdit: (task: Task) => Task;
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
  hasCheckpointAtOrAboveTimeGoal: (milestones: Task["milestones"], unitSec: number, timeGoalMinutes: number) => boolean;
  isCheckpointAtOrAboveTimeGoal: (checkpointHours: number, unitSec: number, timeGoalMinutes: number) => boolean;
  formatCheckpointTimeGoalText: Parameters<typeof createTaskTimerTasks>[0]["formatCheckpointTimeGoalText"];
  getEditTaskTimeGoalMinutes: () => number;
  getEditTaskTimeGoalMinutesFor: (value: number, unit: "minute" | "hour", period: "day" | "week") => number;
  getAddTaskTimeGoalMinutesState: () => number;
  isEditTimeGoalEnabled: () => boolean;
  ensureMilestoneIdentity: (task: Task) => void;
  toggleSwitchElement: (el: HTMLElement | null, on: boolean) => void;
  isSwitchOn: (el: HTMLElement | null) => boolean;
  buildEditDraftSnapshot: (task: Task) => string;
  getCurrentEditTask: () => Task | null;
  syncEditTaskDurationReadout: Parameters<typeof createTaskTimerTasks>[0]["syncEditTaskDurationReadout"];
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
  openManualEntryForTask: (taskId: string) => void;
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
  hasEntitlement: Parameters<typeof createTaskTimerTasks>[0]["hasEntitlement"];
  getCurrentPlan: Parameters<typeof createTaskTimerTasks>[0]["getCurrentPlan"];
  showUpgradePrompt: Parameters<typeof createTaskTimerTasks>[0]["showUpgradePrompt"];
};

type CreateAddTaskOptionsArgs = {
  els: Parameters<typeof createTaskTimerAddTask>[0]["els"];
  on: Parameters<typeof createTaskTimerAddTask>[0]["on"];
  sharedTasks: Parameters<typeof createTaskTimerAddTask>[0]["sharedTasks"];
  taskCollectionBindings: { getTasks: () => Task[]; setTasks: (value: Task[]) => void };
  addTaskStateBindings: Pick<
    Parameters<typeof createTaskTimerAddTask>[0],
    | "getAddTaskWizardStep"
    | "setAddTaskWizardStepState"
    | "getAddTaskType"
    | "setAddTaskTypeState"
    | "getAddTaskOnceOffDay"
    | "setAddTaskOnceOffDayState"
    | "getAddTaskPlannedStartTime"
    | "setAddTaskPlannedStartTimeState"
    | "getAddTaskDurationValue"
    | "setAddTaskDurationValueState"
    | "getAddTaskDurationUnit"
    | "setAddTaskDurationUnitState"
    | "getAddTaskDurationPeriod"
    | "setAddTaskDurationPeriodState"
    | "getAddTaskNoTimeGoal"
    | "setAddTaskNoTimeGoalState"
    | "getAddTaskMilestonesEnabled"
    | "setAddTaskMilestonesEnabledState"
    | "getAddTaskMilestoneTimeUnit"
    | "setAddTaskMilestoneTimeUnitState"
    | "getAddTaskMilestones"
    | "setAddTaskMilestonesState"
    | "getAddTaskCheckpointSoundEnabled"
    | "setAddTaskCheckpointSoundEnabledState"
    | "getAddTaskCheckpointSoundMode"
    | "setAddTaskCheckpointSoundModeState"
    | "getAddTaskCheckpointToastEnabled"
    | "setAddTaskCheckpointToastEnabledState"
    | "getAddTaskCheckpointToastMode"
    | "setAddTaskCheckpointToastModeState"
    | "getAddTaskPresetIntervalsEnabled"
    | "setAddTaskPresetIntervalsEnabledState"
    | "getAddTaskPresetIntervalValue"
    | "setAddTaskPresetIntervalValueState"
    | "getSuppressAddTaskNameFocusOpen"
    | "setSuppressAddTaskNameFocusOpenState"
  >;
  preferencesState: MutableStore;
  getCheckpointAlertSoundEnabled: () => boolean;
  getCheckpointAlertToastEnabled: () => boolean;
  loadCachedTaskUi: () => unknown;
  saveCloudTaskUi: (value: unknown) => void;
  openOverlay: (overlay: HTMLElement | null) => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  render: () => void;
  escapeHtmlUI: (value: unknown) => string;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  jumpToTaskAndHighlight: (taskId: string) => void;
  openElapsedPadForMilestone: Parameters<typeof createTaskTimerAddTask>[0]["openElapsedPadForMilestone"];
  hasEntitlement: Parameters<typeof createTaskTimerAddTask>[0]["hasEntitlement"];
  showUpgradePrompt: Parameters<typeof createTaskTimerAddTask>[0]["showUpgradePrompt"];
};

type CreateSessionOptionsArgs = {
  els: Parameters<typeof createTaskTimerSession>[0]["els"];
  on: Parameters<typeof createTaskTimerSession>[0]["on"];
  runtime: Parameters<typeof createTaskTimerSession>[0]["runtime"];
  sharedTasks: Parameters<typeof createTaskTimerSession>[0]["sharedTasks"];
  storageKeys: Parameters<typeof createTaskTimerSession>[0]["storageKeys"];
  getTasks: () => Task[];
  appRuntimeState: MutableStore;
  getHistoryByTaskId: () => HistoryByTaskId;
  getLiveSessionsByTaskId: () => LiveSessionsByTaskId;
  preferencesState: MutableStore;
  dashboardUiState: MutableStore;
  rewardState: MutableStore;
  focusBindings: Pick<
    Parameters<typeof createTaskTimerSession>[0],
    | "getFocusModeTaskId"
    | "setFocusModeTaskId"
    | "getFocusModeTaskName"
    | "setFocusModeTaskName"
    | "getFocusShowCheckpoints"
    | "setFocusShowCheckpoints"
    | "getFocusCheckpointSig"
    | "setFocusCheckpointSig"
    | "getFocusSessionNotesByTaskId"
    | "setFocusSessionNotesByTaskId"
    | "getFocusSessionNoteSaveTimer"
    | "setFocusSessionNoteSaveTimer"
  >;
  deferredFocusModeTimeGoalModals: () => Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }>;
  setDeferredFocusModeTimeGoalModals: (value: Array<{ taskId: string; frozenElapsedMs: number; reminder: boolean }>) => void;
  modalState: MutableStore;
  getTimeGoalReminderAtMsByTaskId: () => Record<string, number>;
  getTimeGoalCompleteDurationUnit: () => "minute" | "hour";
  setTimeGoalCompleteDurationUnit: (value: "minute" | "hour") => void;
  getTimeGoalCompleteDurationPeriod: () => "day" | "week";
  setTimeGoalCompleteDurationPeriod: (value: "day" | "week") => void;
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
  normalizeHistoryTimestampMs: (value: unknown) => number;
  getHistoryEntryNote: (entry: unknown) => string;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  syncRewardSessionTrackerForTask: (task: Task | null | undefined, nowValue?: number) => void;
  syncLiveSessionForTask: (task: Task | null | undefined, nowValue?: number) => void;
  hasEntitlement: Parameters<typeof createTaskTimerSession>[0]["hasEntitlement"];
  startTask: (index: number) => void;
  stopTask: (index: number) => void;
  resetTask: (index: number) => void;
  resetTaskStateImmediate: Parameters<typeof createTaskTimerSession>[0]["resetTaskStateImmediate"];
  broadcastCheckpointAlertMute: (taskId: string) => void;
  getCurrentUid: () => string | null;
};

type CreateAppShellOptionsArgs = {
  els: Parameters<typeof createTaskTimerAppShell>[0]["els"];
  runtime: Parameters<typeof createTaskTimerAppShell>[0]["runtime"];
  on: Parameters<typeof createTaskTimerAppShell>[0]["on"];
  initialAppPage: AppPage;
  navStackKey: string;
  navStackMax: number;
  nativeBackDebounceMs: number;
  appRuntimeState: MutableStore;
  syncDashboardMenuFlipUi: () => void;
  getNavStackMemory: () => string[];
  setNavStackMemory: (stack: string[]) => void;
  resetAllOpenHistoryChartSelections: () => void;
  clearTaskFlipStates: () => void;
  renderFriendsFooterAlertBadge: () => void;
  closeTaskExportModal: () => void;
  closeShareTaskModal: () => void;
  closeFriendProfileModal: () => void;
  closeFriendRequestModal: () => void;
  openHistoryManager: () => void;
  requestScheduleEntryScroll: (mode?: "open" | "firstScheduled") => void;
  render: () => void;
  renderHistory: (taskId: string) => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderGroupsPage: () => void;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<void>;
  getOpenHistoryTaskIds: () => Iterable<string>;
  closeTopOverlayIfOpen: () => boolean;
  closeMobileDetailPanelIfOpen: () => boolean;
  showExitAppConfirm: () => void;
  hasEntitlement: Parameters<typeof createTaskTimerAppShell>[0]["hasEntitlement"];
  showUpgradePrompt: Parameters<typeof createTaskTimerAppShell>[0]["showUpgradePrompt"];
};

type CreateDashboardRenderOptionsArgs = {
  els: Parameters<typeof createTaskTimerDashboardRender>[0]["els"];
  taskCollectionBindings: {
    getTasks: () => Task[];
    getHistoryByTaskId: () => HistoryByTaskId;
    getDeletedTaskMeta: () => DeletedTaskMeta;
  };
  rewardState: MutableStore;
  preferencesState: MutableStore;
  dashboardUiState: MutableStore;
  dashboardWidgetHasRenderedData: {
    tasksCompleted: boolean;
    momentum: boolean;
    focusTrend: boolean;
    heatCalendar: boolean;
    modeDistribution: boolean;
    avgSession: boolean;
    timeline: boolean;
  };
  dashboardBusyState: MutableStore;
  cloudSyncState: MutableStore;
  getElapsedMs: (task: Task) => number;
  escapeHtmlUI: (value: unknown) => string;
  normalizeHistoryTimestampMs: (value: unknown) => number;
  getModeColor: (mode: MainMode) => string;
  addRangeMsToLocalDayMap: (dayMap: Map<string, number>, startMs: number, endMs: number) => void;
  hasEntitlement: Parameters<typeof createTaskTimerDashboardRender>[0]["hasEntitlement"];
  getCurrentPlan: Parameters<typeof createTaskTimerDashboardRender>[0]["getCurrentPlan"];
};

type CreateDashboardRuntimeOptionsArgs = {
  documentRef: Document;
  nowMs: () => number;
  taskCollectionBindings: {
    getTasks: () => Task[];
    getHistoryByTaskId: () => HistoryByTaskId;
    getDeletedTaskMeta: () => DeletedTaskMeta;
  };
  preferencesState: MutableStore;
  appRuntimeState: MutableStore;
  setLastDashboardLiveSignature: (value: string) => void;
  getLastDashboardLiveSignature: () => string;
  isDashboardBusy: () => boolean;
  renderDashboardWidgets: (opts?: { includeAvgSession?: boolean }) => void;
  renderDashboardLiveWidgets: () => void;
  getDashboardRefreshBtn: () => HTMLButtonElement | null;
  getDashboardShellScene: () => HTMLElement | null;
  getDashboardShellContent: () => HTMLElement | null;
  getDashboardShellBack: () => HTMLElement | null;
  getDashboardPanelMenuBtn: () => HTMLButtonElement | null;
  getDashboardPanelMenuBackBtn: () => HTMLButtonElement | null;
};

type CreateDashboardOptionsArgs = {
  els: Parameters<typeof createTaskTimerDashboard>[0]["els"];
  on: Parameters<typeof createTaskTimerDashboard>[0]["on"];
  syncDashboardRefreshButtonUi: () => void;
  hasEntitlement: Parameters<typeof createTaskTimerDashboard>[0]["hasEntitlement"];
  showUpgradePrompt: Parameters<typeof createTaskTimerDashboard>[0]["showUpgradePrompt"];
  rewardState: MutableStore;
  taskCollectionBindings: { getTasks: () => Task[]; getHistoryByTaskId: () => HistoryByTaskId };
  currentAppPageBinding: { getCurrentAppPage: () => AppPage };
  appRuntimeState: MutableStore;
  preferencesState: MutableStore;
  syncDashboardMenuFlipUi: () => void;
  dashboardLayoutBindings: Pick<
    Parameters<typeof createTaskTimerDashboard>[0],
    | "getDashboardEditMode"
    | "setDashboardEditMode"
    | "getDashboardDragEl"
    | "setDashboardDragEl"
    | "getDashboardOrderDraftBeforeEdit"
    | "setDashboardOrderDraftBeforeEdit"
    | "getDashboardCardPlacements"
    | "setDashboardCardPlacements"
    | "getDashboardCardPlacementsDraftBeforeEdit"
    | "setDashboardCardPlacementsDraftBeforeEdit"
    | "getDashboardCardSizes"
    | "setDashboardCardSizes"
    | "getDashboardCardSizesDraftBeforeEdit"
    | "setDashboardCardSizesDraftBeforeEdit"
    | "getDashboardCardVisibility"
    | "setDashboardCardVisibility"
    | "getDashboardAvgRange"
    | "setDashboardAvgRange"
    | "getDashboardTimelineDensity"
    | "setDashboardTimelineDensity"
  >;
  getCloudDashboardCache: () => unknown;
  setCloudDashboardCache: (value: unknown) => void;
  loadCachedDashboard: () => unknown;
  saveCloudDashboard: (value: unknown) => void;
  renderDashboardWidgets: (opts?: DashboardRenderOptions) => void;
  renderDashboardTimelineCard: () => void;
  selectDashboardTimelineSuggestion: (key: string | null) => void;
  selectDashboardMomentumDriver: (key: string | null) => string | null;
  clearDashboardMomentumDriverSelection: () => void;
  hasSelectedDashboardMomentumDriver: () => boolean;
  openDashboardHeatSummaryCard: (dayKey: string, dateLabel: string) => void;
  closeDashboardHeatSummaryCard: (opts?: { restoreFocus?: boolean }) => void;
};

type CreateDashboardFeatureOptionsArgs = {
  dashboardRender: CreateDashboardRenderOptionsArgs;
  dashboardRuntime: Omit<
    CreateDashboardRuntimeOptionsArgs,
    "renderDashboardWidgets" | "renderDashboardLiveWidgets" | "isDashboardBusy"
  >;
  dashboardBindings: Omit<Parameters<typeof createTaskTimerDashboardBindings>[0], "dashboardRuntime">;
  dashboard: Omit<
    CreateDashboardOptionsArgs,
    | "syncDashboardRefreshButtonUi"
    | "syncDashboardMenuFlipUi"
    | "renderDashboardWidgets"
    | "renderDashboardTimelineCard"
    | "selectDashboardTimelineSuggestion"
    | "selectDashboardMomentumDriver"
    | "clearDashboardMomentumDriverSelection"
    | "hasSelectedDashboardMomentumDriver"
    | "openDashboardHeatSummaryCard"
    | "closeDashboardHeatSummaryCard"
  >;
};

type CreateRewardsHistoryOptionsArgs = {
  rewardSessionTrackersStorageKey: string;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getLiveSessionsByTaskId: () => LiveSessionsByTaskId;
  setLiveSessionsByTaskId: (value: LiveSessionsByTaskId) => void;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  preferencesState: MutableStore;
  rewardState: MutableStore;
  focusBindings: { getFocusModeTaskId: () => string | null };
  setCloudPreferencesCache: (value: UserPreferencesV1 | null) => void;
  getCurrentPlan: () => Parameters<typeof createTaskTimerRewardsHistory>[0]["getCurrentPlan"] extends () => infer T ? T : never;
  hasEntitlement: Parameters<typeof createTaskTimerRewardsHistory>[0]["hasEntitlement"];
  currentUid: () => string | null;
  getTaskElapsedMs: (task: Task) => number;
  sessionColorForTaskMs: (task: Task, elapsedMs: number) => string;
  captureSessionNoteSnapshot: (taskId?: string | null) => string;
  setFocusSessionDraft: (taskId: string, noteRaw: string) => void;
  clearFocusSessionDraft: (taskId: string) => void;
  syncFocusSessionNotesInput: (taskId: string | null) => void;
  syncFocusSessionNotesAccordion: (taskId: string | null) => void;
  appendHistoryEntry: Parameters<typeof createTaskTimerRewardsHistory>[0]["appendHistoryEntry"];
  saveLiveSession: Parameters<typeof createTaskTimerRewardsHistory>[0]["saveLiveSession"];
  clearLiveSession: Parameters<typeof createTaskTimerRewardsHistory>[0]["clearLiveSession"];
  saveHistoryLocally: Parameters<typeof createTaskTimerRewardsHistory>[0]["saveHistoryLocally"];
  buildDefaultCloudPreferences: Parameters<typeof createTaskTimerRewardsHistory>[0]["buildDefaultCloudPreferences"];
  saveCloudPreferences: Parameters<typeof createTaskTimerRewardsHistory>[0]["saveCloudPreferences"];
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
  syncOwnFriendshipProfile: Parameters<typeof createTaskTimerRewardsHistory>[0]["syncOwnFriendshipProfile"];
};

export function createTaskTimerGroupsContext(args: CreateGroupsOptionsArgs): Parameters<typeof createTaskTimerGroups>[0] {
  return {
    els: args.els,
    on: args.on,
    getTasks: args.taskCollectionBindings.getTasks,
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId as Parameters<typeof createTaskTimerGroups>[0]["getHistoryByTaskId"],
    getCurrentUid: args.getCurrentUid,
    getCurrentAppPage: () => asType<AppPage>(args.appRuntimeState.get("currentAppPage")),
    applyMainMode: args.applyMainMode,
    applyAppPage: args.applyAppPage as Parameters<typeof createTaskTimerGroups>[0]["applyAppPage"],
    render: args.render,
    closeConfirm: args.closeConfirm,
    confirm: args.confirm,
    escapeHtmlUI: args.escapeHtmlUI,
    normalizeHistoryTimestampMs: args.normalizeHistoryTimestampMs,
    showWorkingIndicator: args.showWorkingIndicator,
    hideWorkingIndicator: args.hideWorkingIndicator,
    getMergedFriendProfile: args.getMergedFriendProfile as Parameters<typeof createTaskTimerGroups>[0]["getMergedFriendProfile"],
    getFriendAvatarSrcById: args.getFriendAvatarSrcById,
    buildFriendInitialAvatarDataUrl: args.buildFriendInitialAvatarDataUrl,
    getFriendAvatarSrc: args.getFriendAvatarSrc as Parameters<typeof createTaskTimerGroups>[0]["getFriendAvatarSrc"],
    jumpToTaskById: args.jumpToTaskById,
    getGroupsIncomingRequests: () => asType<FriendRequest[]>(args.groupsState.get("groupsIncomingRequests")),
    setGroupsIncomingRequests: (value) => {
      args.groupsState.set("groupsIncomingRequests", value);
    },
    getGroupsOutgoingRequests: () => asType<FriendRequest[]>(args.groupsState.get("groupsOutgoingRequests")),
    setGroupsOutgoingRequests: (value) => {
      args.groupsState.set("groupsOutgoingRequests", value);
    },
    getGroupsFriendships: () => asType<Friendship[]>(args.groupsState.get("groupsFriendships")),
    setGroupsFriendships: (value) => {
      args.groupsState.set("groupsFriendships", value);
    },
    getGroupsSharedSummaries: () => asType<SharedTaskSummary[]>(args.groupsState.get("groupsSharedSummaries")),
    setGroupsSharedSummaries: (value) => {
      args.groupsState.set("groupsSharedSummaries", value);
    },
    getOwnSharedSummaries: () => asType<SharedTaskSummary[]>(args.groupsState.get("ownSharedSummaries")),
    setOwnSharedSummaries: (value) => {
      args.groupsState.set("ownSharedSummaries", value);
    },
    getGroupsLoading: () => asType<boolean>(args.groupsState.get("groupsLoading")),
    setGroupsLoading: (value) => {
      args.groupsState.set("groupsLoading", value);
    },
    getGroupsLoadingDepth: () => asType<number>(args.groupsState.get("groupsLoadingDepth")),
    setGroupsLoadingDepth: (value) => {
      args.groupsState.set("groupsLoadingDepth", value);
    },
    getGroupsRefreshSeq: () => asType<number>(args.groupsState.get("groupsRefreshSeq")),
    setGroupsRefreshSeq: (value) => {
      args.groupsState.set("groupsRefreshSeq", value);
    },
    getActiveFriendProfileUid: () => asType<string | null>(args.groupsState.get("activeFriendProfileUid")),
    setActiveFriendProfileUid: (value) => {
      args.groupsState.set("activeFriendProfileUid", value);
    },
    getActiveFriendProfileName: () => asType<string>(args.groupsState.get("activeFriendProfileName")),
    setActiveFriendProfileName: (value) => {
      args.groupsState.set("activeFriendProfileName", value);
    },
    getFriendProfileCacheByUid: () => asType<Record<string, FriendProfile>>(args.groupsState.get("friendProfileCacheByUid")),
    setFriendProfileCacheByUid: (value) => {
      args.groupsState.set("friendProfileCacheByUid", value);
    },
    getShareTaskIndex: () => asType<number | null>(args.groupsState.get("shareTaskIndex")),
    setShareTaskIndex: (value) => {
      args.groupsState.set("shareTaskIndex", value);
    },
    getShareTaskMode: () => asType<"share" | "unshare">(args.groupsState.get("shareTaskMode")),
    setShareTaskMode: (value) => {
      args.groupsState.set("shareTaskMode", value);
    },
    getShareTaskTaskId: () => asType<string | null>(args.groupsState.get("shareTaskTaskId")),
    setShareTaskTaskId: (value) => {
      args.groupsState.set("shareTaskTaskId", value);
    },
    getOpenFriendSharedTaskUids: () => args.openFriendSharedTaskUids,
    hasEntitlement: args.hasEntitlement,
    getCurrentPlan: args.getCurrentPlan,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerPreferencesContext(
  args: CreatePreferencesOptionsArgs
): Parameters<typeof createTaskTimerPreferences>[0] {
  return {
    els: args.els,
    on: args.on,
    toggleSwitchElement: args.toggleSwitchElement,
    isSwitchOn: args.isSwitchOn,
    storageKeys: args.storageKeys,
    defaultModeColors: args.defaultModeColors,
    getThemeMode: () => asType<"purple" | "cyan" | "lime">(args.preferencesState.get("themeMode")),
    setThemeModeState: (value) => {
      args.preferencesState.set("themeMode", value);
    },
    getTaskView: () => asType<"list" | "tile">(args.preferencesState.get("taskView")),
    setTaskViewState: (value) => {
      args.preferencesState.set("taskView", value);
    },
    getTaskOrderBy: () => asType<"custom" | "alpha" | "schedule">(args.preferencesState.get("taskOrderBy")),
    setTaskOrderByState: (value) => {
      args.preferencesState.set("taskOrderBy", value);
    },
    getMenuButtonStyle: () => asType<"parallelogram" | "square">(args.preferencesState.get("menuButtonStyle")),
    setMenuButtonStyleState: (value) => {
      args.preferencesState.set("menuButtonStyle", value);
    },
    getWeekStarting: () => asType<DashboardWeekStart>(args.preferencesState.get("weekStarting")),
    setWeekStartingState: (value: DashboardWeekStart) => {
      args.preferencesState.set("weekStarting", value);
    },
    getStartupModule: () => asType<StartupModulePreference>(args.preferencesState.get("startupModule")),
    setStartupModuleState: (value) => {
      args.preferencesState.set("startupModule", value);
    },
    getAutoFocusOnTaskLaunchEnabled: () => asType<boolean>(args.preferencesState.get("autoFocusOnTaskLaunchEnabled")),
    setAutoFocusOnTaskLaunchEnabledState: (value) => {
      args.preferencesState.set("autoFocusOnTaskLaunchEnabled", value);
    },
    getDynamicColorsEnabled: () => asType<boolean>(args.preferencesState.get("dynamicColorsEnabled")),
    setDynamicColorsEnabledState: (value) => {
      args.preferencesState.set("dynamicColorsEnabled", value);
    },
    getMobilePushAlertsEnabled: () => asType<boolean>(args.preferencesState.get("mobilePushAlertsEnabled")),
    setMobilePushAlertsEnabledState: (value) => {
      args.preferencesState.set("mobilePushAlertsEnabled", value);
    },
    getWebPushAlertsEnabled: () => asType<boolean>(args.preferencesState.get("webPushAlertsEnabled")),
    setWebPushAlertsEnabledState: (value) => {
      args.preferencesState.set("webPushAlertsEnabled", value);
    },
    getCheckpointAlertSoundEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertSoundEnabled")),
    setCheckpointAlertSoundEnabledState: (value) => {
      args.preferencesState.set("checkpointAlertSoundEnabled", value);
    },
    getCheckpointAlertToastEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertToastEnabled")),
    setCheckpointAlertToastEnabledState: (value) => {
      args.preferencesState.set("checkpointAlertToastEnabled", value);
    },
    getOptimalProductivityStartTime: () => asType<string>(args.preferencesState.get("optimalProductivityStartTime")),
    setOptimalProductivityStartTimeState: (value) => {
      args.preferencesState.set("optimalProductivityStartTime", value);
    },
    getOptimalProductivityEndTime: () => asType<string>(args.preferencesState.get("optimalProductivityEndTime")),
    setOptimalProductivityEndTimeState: (value) => {
      args.preferencesState.set("optimalProductivityEndTime", value);
    },
    getRewardProgress: () => args.rewardState.get("rewardProgress"),
    normalizeRewardProgress: args.normalizeRewardProgress,
    currentUid: args.getCurrentUid,
    loadCachedPreferences: args.loadCachedPreferences,
    loadCachedTaskUi: args.loadCachedTaskUi,
    getCloudPreferencesCache: args.getCloudPreferencesCache as Parameters<typeof createTaskTimerPreferences>[0]["getCloudPreferencesCache"],
    setCloudPreferencesCache: args.setCloudPreferencesCache as Parameters<typeof createTaskTimerPreferences>[0]["setCloudPreferencesCache"],
    buildDefaultCloudPreferences: args.buildDefaultCloudPreferences as Parameters<typeof createTaskTimerPreferences>[0]["buildDefaultCloudPreferences"],
    saveCloudPreferences: args.saveCloudPreferences as Parameters<typeof createTaskTimerPreferences>[0]["saveCloudPreferences"],
    syncOwnFriendshipProfile: args.syncOwnFriendshipProfile,
    saveDashboardWidgetState: args.saveDashboardWidgetState,
    getDashboardCardSizeMapForStorage: args.getDashboardCardSizeMapForStorage,
    getDashboardAvgRange: args.getDashboardAvgRange,
    getTasks: args.taskCollectionBindings.getTasks,
    setTasks: args.taskCollectionBindings.setTasks,
    getCurrentEditTask: args.getCurrentEditTask,
    syncEditCheckpointAlertUi: args.syncEditCheckpointAlertUi,
    clearTaskFlipStates: args.clearTaskFlipStates,
    save: args.save,
    render: args.render,
    renderDashboardPanelMenu: args.renderDashboardPanelMenu,
    renderDashboardWidgets: args.renderDashboardWidgets,
    closeOverlay: args.closeOverlay,
    closeConfirm: args.closeConfirm,
    confirm: args.confirm,
    escapeHtmlUI: args.escapeHtmlUI,
    stopCheckpointRepeatAlert: args.stopCheckpointRepeatAlert,
    getCurrentAppPage: args.getCurrentAppPage,
    hasEntitlement: args.hasEntitlement,
    getCurrentPlan: args.getCurrentPlan,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerPersistenceContext(
  args: CreatePersistenceOptionsArgs
): Parameters<typeof createTaskTimerPersistence>[0] {
  return {
    workspaceRepository: args.workspaceRepository,
    historyPersistence: args.historyPersistence,
    focusSessionNotesKey: args.focusSessionNotesKey,
    pendingTaskJumpKey: args.pendingTaskJumpKey,
    getTasks: args.taskCollectionBindings.getTasks,
    setTasks: args.taskCollectionBindings.setTasks,
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId as Parameters<typeof createTaskTimerPersistence>[0]["getHistoryByTaskId"],
    setHistoryByTaskId: args.taskCollectionBindings.setHistoryByTaskId as Parameters<typeof createTaskTimerPersistence>[0]["setHistoryByTaskId"],
    getLiveSessionsByTaskId: args.taskCollectionBindings.getLiveSessionsByTaskId as Parameters<typeof createTaskTimerPersistence>[0]["getLiveSessionsByTaskId"],
    setLiveSessionsByTaskId: args.taskCollectionBindings.setLiveSessionsByTaskId as Parameters<typeof createTaskTimerPersistence>[0]["setLiveSessionsByTaskId"],
    getHistoryRangeDaysByTaskId: () => asType<Record<string, 7 | 14>>(args.historyUiState.get("historyRangeDaysByTaskId")),
    setHistoryRangeDaysByTaskId: (value) => {
      args.historyUiState.set("historyRangeDaysByTaskId", value);
    },
    getHistoryRangeModeByTaskId: () => asType<Record<string, "entries" | "day">>(args.historyUiState.get("historyRangeModeByTaskId")),
    setHistoryRangeModeByTaskId: (value) => {
      args.historyUiState.set("historyRangeModeByTaskId", value);
    },
    getFocusSessionNotesByTaskId: () => asType<Record<string, string>>(args.focusState.get("focusSessionNotesByTaskId")),
    setFocusSessionNotesByTaskId: (value) => {
      args.focusState.set("focusSessionNotesByTaskId", value);
    },
    getPendingTaskJumpMemory: args.pendingTaskJumpMemory,
    setPendingTaskJumpMemory: args.setPendingTaskJumpMemory,
    getRuntimeDestroyed: args.runtimeDestroyed,
    getCurrentUid: args.getCurrentUid,
    getFocusModeTaskId: () => asType<string | null>(args.focusState.get("focusModeTaskId")),
    getFocusSessionNoteSaveTimer: () => asType<number | null>(args.focusState.get("focusSessionNoteSaveTimer")),
    setFocusSessionNoteSaveTimer: (value) => {
      args.focusState.set("focusSessionNoteSaveTimer", value);
    },
    getFocusSessionNotesInputValue: args.getFocusSessionNotesInputValue,
    setFocusSessionNotesInputValue: args.setFocusSessionNotesInputValue,
    setFocusSessionNotesSectionOpen: args.setFocusSessionNotesSectionOpen,
    getCurrentAppPage: args.getCurrentAppPage,
    getInitialAppPageFromLocation: args.getInitialAppPageFromLocation,
    initialAppPage: args.initialAppPage,
    getCloudTaskUiCache: args.getCloudTaskUiCache,
    loadCachedTaskUi: args.loadCachedTaskUi,
    loadDeletedMeta: args.loadDeletedMeta,
    setDeletedTaskMeta: args.setDeletedTaskMeta,
    primeDashboardCacheFromShadow: args.primeDashboardCacheFromShadow,
    loadFocusSessionNotes: args.loadFocusSessionNotes,
    loadAddTaskCustomNames: args.loadAddTaskCustomNames,
    loadWeekStartingPreference: args.loadWeekStartingPreference,
    loadStartupModulePreference: args.loadStartupModulePreference,
    loadTaskViewPreference: args.loadTaskViewPreference,
    loadTaskOrderByPreference: args.loadTaskOrderByPreference,
    loadAutoFocusOnTaskLaunchSetting: args.loadAutoFocusOnTaskLaunchSetting,
    loadDynamicColorsSetting: args.loadDynamicColorsSetting,
    loadCheckpointAlertSettings: args.loadCheckpointAlertSettings,
    loadOptimalProductivityPeriodPreference: args.loadOptimalProductivityPeriodPreference,
    loadDashboardWidgetState: args.loadDashboardWidgetState,
    loadThemePreference: args.loadThemePreference,
    loadMenuButtonStylePreference: args.loadMenuButtonStylePreference,
    syncTaskSettingsUi: args.syncTaskSettingsUi,
    loadPinnedHistoryTaskIds: args.loadPinnedHistoryTaskIds,
    loadModeLabels: args.loadModeLabels,
    backfillHistoryColorsFromSessionLogic: args.backfillHistoryColorsFromSessionLogic,
    syncModeLabelsUi: args.syncModeLabelsUi,
    applyMainMode: args.applyMainMode,
    applyAppPage: args.applyAppPage as Parameters<typeof createTaskTimerPersistence>[0]["applyAppPage"],
    applyDashboardOrderFromStorage: args.applyDashboardOrderFromStorage,
    applyDashboardCardSizes: args.applyDashboardCardSizes,
    renderDashboardPanelMenu: args.renderDashboardPanelMenu,
    applyDashboardCardVisibility: args.applyDashboardCardVisibility,
    applyDashboardEditMode: args.applyDashboardEditMode,
    renderDashboardWidgets: args.renderDashboardWidgets,
    maybeRepairHistoryNotesInCloudAfterHydrate: args.maybeRepairHistoryNotesInCloudAfterHydrate,
    jumpToTaskById: args.jumpToTaskById,
    maybeRestorePendingTimeGoalFlow: args.maybeRestorePendingTimeGoalFlow,
    normalizeLoadedTask: args.normalizeLoadedTask,
  };
}

export function createTaskTimerHistoryManagerContext(
  args: CreateHistoryManagerOptionsArgs
): Parameters<typeof createTaskTimerHistoryManager>[0] {
  return {
    els: args.els,
    on: args.on,
    runtime: args.runtime,
    ...args.taskCollectionBindings,
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    getHmExpandedTaskGroups: () => asType<Set<string>>(args.historyUiState.get("hmExpandedTaskGroups")),
    setHmExpandedTaskGroups: (value) => {
      args.historyUiState.set("hmExpandedTaskGroups", value);
    },
    getHmExpandedDateGroups: () => asType<Set<string>>(args.historyUiState.get("hmExpandedDateGroups")),
    setHmExpandedDateGroups: (value) => {
      args.historyUiState.set("hmExpandedDateGroups", value);
    },
    getHmSortKey: () => asType<"ts" | "ms">(args.historyUiState.get("hmSortKey")),
    setHmSortKey: (value) => {
      args.historyUiState.set("hmSortKey", value);
    },
    getHmSortDir: () => asType<"asc" | "desc">(args.historyUiState.get("hmSortDir")),
    setHmSortDir: (value) => {
      args.historyUiState.set("hmSortDir", value);
    },
    getHmBulkEditMode: () => asType<boolean>(args.historyUiState.get("hmBulkEditMode")),
    setHmBulkEditMode: (value) => {
      args.historyUiState.set("hmBulkEditMode", value);
    },
    getHmBulkSelectedRows: () => asType<Set<string>>(args.historyUiState.get("hmBulkSelectedRows")),
    setHmBulkSelectedRows: (value) => {
      args.historyUiState.set("hmBulkSelectedRows", value);
    },
    getHmRowsByTask: () => asType<Record<string, string[]>>(args.historyUiState.get("hmRowsByTask")),
    setHmRowsByTask: (value) => {
      args.historyUiState.set("hmRowsByTask", value);
    },
    getHmRowsByTaskDate: () => asType<Record<string, string[]>>(args.historyUiState.get("hmRowsByTaskDate")),
    setHmRowsByTaskDate: (value) => {
      args.historyUiState.set("hmRowsByTaskDate", value);
    },
    getHistoryManagerRefreshInFlight: args.getHistoryManagerRefreshInFlight,
    setHistoryManagerRefreshInFlight: args.setHistoryManagerRefreshInFlight,
    isArchitectUser: args.isArchitectUser,
    getHistoryEntryNote: args.getHistoryEntryNote,
    csvEscape: args.csvEscape,
    parseCsvRows: args.parseCsvRows,
    downloadCsvFile: args.downloadCsvFile,
    formatTwo: args.formatTwo,
    formatDateTime: args.formatDateTime,
    sortMilestones: args.sortMilestones,
    sessionColorForTaskMs: args.sessionColorForTaskMs,
    save: args.save,
    saveHistory: args.saveHistory,
    saveHistoryAndWait: args.saveHistoryAndWait,
    loadHistory: args.loadHistory,
    refreshHistoryFromCloud: args.refreshHistoryFromCloud,
    saveDeletedMeta: args.saveDeletedMeta,
    loadDeletedMeta: args.loadDeletedMeta,
    load: args.load,
    render: args.render,
    navigateToAppRoute: args.navigateToAppRoute,
    openOverlay: args.openOverlay,
    closeOverlay: args.closeOverlay,
    confirm: args.confirm,
    closeConfirm: args.closeConfirm,
    escapeHtmlUI: args.escapeHtmlUI,
    syncSharedTaskSummariesForTasks: args.syncSharedTaskSummariesForTasks,
    syncSharedTaskSummariesForTask: args.syncSharedTaskSummariesForTask,
    hasEntitlement: args.hasEntitlement,
    getCurrentPlan: args.getCurrentPlan,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerHistoryInlineContext(
  args: CreateHistoryInlineOptionsArgs
): Parameters<typeof createTaskTimerHistoryInline>[0] {
  return {
    els: args.els,
    on: args.on,
    sharedTasks: args.sharedTasks,
    getTasks: args.taskCollectionBindings.getTasks,
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId,
    setHistoryByTaskId: args.taskCollectionBindings.setHistoryByTaskId,
    getHistoryRangeDaysByTaskId: () => asType<Record<string, 7 | 14>>(args.historyUiState.get("historyRangeDaysByTaskId")),
    getHistoryRangeModeByTaskId: () => asType<Record<string, "entries" | "day">>(args.historyUiState.get("historyRangeModeByTaskId")),
    getHistoryViewByTaskId: () => args.historyViewByTaskId,
    getOpenHistoryTaskIds: () => args.openHistoryTaskIds,
    getCurrentAppPage: args.getCurrentAppPage,
    getPinnedHistoryTaskIds: () => asType<Set<string>>(args.historyUiState.get("pinnedHistoryTaskIds")),
    setPinnedHistoryTaskIds: (value) => {
      args.historyUiState.set("pinnedHistoryTaskIds", value);
    },
    savePinnedHistoryTaskIds: args.savePinnedHistoryTaskIds,
    getHistoryEntryNoteAnchorTaskId: () => asType<string>(args.historyUiState.get("historyEntryNoteAnchorTaskId")),
    setHistoryEntryNoteAnchorTaskId: (value) => {
      args.historyUiState.set("historyEntryNoteAnchorTaskId", value);
    },
    persistTaskUiToCloud: args.persistTaskUiToCloud,
    saveHistory: args.saveHistory,
    confirm: args.confirm,
    closeConfirm: args.closeConfirm,
    navigateToAppRoute: args.navigateToAppRoute,
    openOverlay: args.openOverlay,
    closeOverlay: args.closeOverlay,
    render: args.render,
    renderDashboardWidgets: args.renderDashboardWidgets,
    nowMs: args.nowMs,
    normalizeHistoryTimestampMs: args.normalizeHistoryTimestampMs,
    formatTime: args.formatTime,
    formatTwo: args.formatTwo,
    formatDateTime: args.formatDateTime,
    getHistoryEntryNote: args.getHistoryEntryNote,
    escapeHtmlUI: args.escapeHtmlUI,
    sortMilestones: args.sortMilestones,
    sessionColorForTaskMs: args.sessionColorForTaskMs,
    getModeColor: args.getModeColor,
    getDynamicColorsEnabled: args.getDynamicColorsEnabled,
    hasEntitlement: args.hasEntitlement,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerTasksContext(args: CreateTasksOptionsArgs): Parameters<typeof createTaskTimerTasks>[0] {
  return {
    els: args.els,
    on: args.on,
    sharedTasks: args.sharedTasks,
    ...args.taskCollectionBindings,
    getCurrentUid: args.currentUid,
    getCurrentAppPage: () => asType<AppPage>(args.appRuntimeState.get("currentAppPage")),
    getTaskView: () => asType<"list" | "tile">(args.preferencesState.get("taskView")),
    getTaskOrderBy: () => asType<"custom" | "alpha" | "schedule">(args.preferencesState.get("taskOrderBy")),
    getCurrentTileColumnCount: () => asType<number>(args.appRuntimeState.get("currentTileColumnCount")),
    setCurrentTileColumnCount: (value) => args.appRuntimeState.set("currentTileColumnCount", value),
    getFocusModeTaskId: args.focusModeTaskId,
    getOpenHistoryTaskIds: () => args.openHistoryTaskIds,
    getPinnedHistoryTaskIds: () => asType<Set<string>>(args.historyUiState.get("pinnedHistoryTaskIds")),
    getHistoryViewByTaskId: () => args.historyViewByTaskId,
    getThemeMode: () => asType<"purple" | "cyan" | "lime">(args.preferencesState.get("themeMode")),
    getAutoFocusOnTaskLaunchEnabled: () => asType<boolean>(args.preferencesState.get("autoFocusOnTaskLaunchEnabled")),
    getCheckpointAlertSoundEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertSoundEnabled")),
    getCheckpointAlertToastEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertToastEnabled")),
    getDynamicColorsEnabled: () => asType<boolean>(args.preferencesState.get("dynamicColorsEnabled")),
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    ...args.editStateBindings,
    getCheckpointAutoResetDirty: args.checkpointAutoResetDirty,
    setCheckpointAutoResetDirty: args.setCheckpointAutoResetDirty,
    render: args.render,
    renderHistory: args.renderHistory,
    renderDashboardWidgets: args.renderDashboardWidgets,
    syncTimeGoalModalWithTaskState: args.syncTimeGoalModalWithTaskState,
    maybeRestorePendingTimeGoalFlow: args.maybeRestorePendingTimeGoalFlow,
    getElapsedMs: args.getElapsedMs,
    getTaskElapsedMs: args.getTaskElapsedMs,
    save: args.save,
    saveHistory: args.saveHistory,
    saveDeletedMeta: args.saveDeletedMeta,
    escapeHtmlUI: args.escapeHtmlUI,
    getModeColor: args.getModeColor,
    fillBackgroundForPct: args.fillBackgroundForPct,
    formatMainTaskElapsedHtml: args.formatMainTaskElapsedHtml,
    sortMilestones: args.sortMilestones,
    isTaskSharedByOwner: args.isTaskSharedByOwner,
    confirm: args.confirm,
    closeConfirm: args.closeConfirm,
    openEdit: args.openEdit,
    clearTaskTimeGoalFlow: args.clearTaskTimeGoalFlow,
    flushPendingFocusSessionNoteSave: args.flushPendingFocusSessionNoteSave,
    clearCheckpointBaseline: args.clearCheckpointBaseline,
    openRewardSessionSegment: args.openRewardSessionSegment,
    closeRewardSessionSegment: args.closeRewardSessionSegment,
    clearRewardSessionTracker: args.clearRewardSessionTracker,
    upsertLiveSession: args.upsertLiveSession,
    finalizeLiveSession: args.finalizeLiveSession,
    openFocusMode: args.openFocusMode,
    closeFocusMode: args.closeFocusMode,
    canLogSession: args.canLogSession,
    appendCompletedSessionHistory: args.appendCompletedSessionHistory,
    resetCheckpointAlertTracking: args.resetCheckpointAlertTracking,
    clearFocusSessionDraft: args.clearFocusSessionDraft,
    syncFocusSessionNotesInput: args.syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion: args.syncFocusSessionNotesAccordion,
    captureResetActionSessionNote: args.captureResetActionSessionNote,
    setFocusSessionDraft: args.setFocusSessionDraft,
    setResetTaskConfirmBusy: args.setResetTaskConfirmBusy,
    syncConfirmPrimaryToggleUi: args.syncConfirmPrimaryToggleUi,
    cloneTaskForEdit: args.cloneTaskForEdit,
    setEditTimeGoalEnabled: args.setEditTimeGoalEnabled,
    syncEditTaskTimeGoalUi: args.syncEditTaskTimeGoalUi,
    syncEditCheckpointAlertUi: args.syncEditCheckpointAlertUi,
    syncEditSaveAvailability: args.syncEditSaveAvailability,
    syncEditMilestoneSectionUi: args.syncEditMilestoneSectionUi,
    setMilestoneUnitUi: args.setMilestoneUnitUi,
    renderMilestoneEditor: args.renderMilestoneEditor,
    clearEditValidationState: args.clearEditValidationState,
    validateEditTimeGoal: args.validateEditTimeGoal,
    showEditValidationError: args.showEditValidationError,
    editTaskHasActiveTimeGoal: args.editTaskHasActiveTimeGoal,
    hasNonPositiveCheckpoint: args.hasNonPositiveCheckpoint,
    hasCheckpointAtOrAboveTimeGoal: args.hasCheckpointAtOrAboveTimeGoal,
    isCheckpointAtOrAboveTimeGoal: args.isCheckpointAtOrAboveTimeGoal,
    formatCheckpointTimeGoalText: args.formatCheckpointTimeGoalText,
    getEditTaskTimeGoalMinutes: args.getEditTaskTimeGoalMinutes,
    getEditTaskTimeGoalMinutesFor: args.getEditTaskTimeGoalMinutesFor,
    getAddTaskTimeGoalMinutesState: args.getAddTaskTimeGoalMinutesState,
    isEditTimeGoalEnabled: args.isEditTimeGoalEnabled,
    ensureMilestoneIdentity: args.ensureMilestoneIdentity,
    toggleSwitchElement: args.toggleSwitchElement,
    isSwitchOn: args.isSwitchOn,
    buildEditDraftSnapshot: args.buildEditDraftSnapshot,
    getCurrentEditTask: args.getCurrentEditTask,
    syncEditTaskDurationReadout: args.syncEditTaskDurationReadout,
    maybeToggleEditPresetIntervals: args.maybeToggleEditPresetIntervals,
    hasValidPresetInterval: args.hasValidPresetInterval,
    addMilestoneWithCurrentPreset: args.addMilestoneWithCurrentPreset,
    getPresetIntervalNextSeqNum: args.getPresetIntervalNextSeqNum,
    isEditMilestoneUnitDay: args.isEditMilestoneUnitDay,
    setTaskFlipped: args.setTaskFlipped,
    syncTaskFlipStatesForVisibleTasks: args.syncTaskFlipStatesForVisibleTasks,
    applyTaskFlipDomState: args.applyTaskFlipDomState,
    openHistoryInline: args.openHistoryInline,
    openTaskExportModal: args.openTaskExportModal,
    openShareTaskModal: args.openShareTaskModal,
    openManualEntryForTask: args.openManualEntryForTask,
    currentUid: args.currentUid,
    deleteSharedTaskSummariesForTask: args.deleteSharedTaskSummariesForTask,
    refreshOwnSharedSummaries: args.refreshOwnSharedSummaries,
    refreshGroupsData: args.refreshGroupsData,
    deleteTask: args.deleteTask,
    checkpointRepeatActiveTaskId: args.checkpointRepeatActiveTaskId,
    activeCheckpointToastTaskId: args.activeCheckpointToastTaskId,
    stopCheckpointRepeatAlert: args.stopCheckpointRepeatAlert,
    broadcastCheckpointAlertMute: args.broadcastCheckpointAlertMute,
    enqueueCheckpointToast: args.enqueueCheckpointToast,
    syncSharedTaskSummariesForTask: args.syncSharedTaskSummariesForTask,
    syncSharedTaskSummariesForTasks: args.syncSharedTaskSummariesForTasks,
    hasEntitlement: args.hasEntitlement,
    getCurrentPlan: args.getCurrentPlan,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerAddTaskContext(args: CreateAddTaskOptionsArgs): Parameters<typeof createTaskTimerAddTask>[0] {
  return {
    els: args.els,
    on: args.on,
    sharedTasks: args.sharedTasks,
    getTasks: args.taskCollectionBindings.getTasks,
    setTasks: args.taskCollectionBindings.setTasks,
    ...args.addTaskStateBindings,
    getAddTaskCustomNames: () => asType<string[]>(args.preferencesState.get("addTaskCustomNames")),
    setAddTaskCustomNamesState: (value) => args.preferencesState.set("addTaskCustomNames", value),
    getCheckpointAlertSoundEnabled: args.getCheckpointAlertSoundEnabled,
    getCheckpointAlertToastEnabled: args.getCheckpointAlertToastEnabled,
    loadCachedTaskUi: args.loadCachedTaskUi,
    saveCloudTaskUi: args.saveCloudTaskUi,
    openOverlay: args.openOverlay,
    closeOverlay: args.closeOverlay,
    save: args.save,
    render: args.render,
    escapeHtmlUI: args.escapeHtmlUI,
    sortMilestones: args.sortMilestones,
    jumpToTaskAndHighlight: args.jumpToTaskAndHighlight,
    openElapsedPadForMilestone: args.openElapsedPadForMilestone,
    hasEntitlement: args.hasEntitlement,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerSessionContext(args: CreateSessionOptionsArgs): Parameters<typeof createTaskTimerSession>[0] {
  return {
    els: args.els,
    on: args.on,
    runtime: args.runtime,
    sharedTasks: args.sharedTasks,
    storageKeys: args.storageKeys,
    getTasks: args.getTasks,
    getCurrentAppPage: () => asType<AppPage>(args.appRuntimeState.get("currentAppPage")),
    getHistoryByTaskId: args.getHistoryByTaskId,
    getLiveSessionsByTaskId: () => asType<Parameters<typeof createTaskTimerSession>[0]["getLiveSessionsByTaskId"] extends () => infer T ? T : never>(args.getLiveSessionsByTaskId()),
    getWeekStarting: () => asType<DashboardWeekStart>(args.preferencesState.get("weekStarting")),
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    getCurrentUid: args.getCurrentUid,
    ...args.focusBindings,
    getDeferredFocusModeTimeGoalModals: args.deferredFocusModeTimeGoalModals,
    setDeferredFocusModeTimeGoalModals: args.setDeferredFocusModeTimeGoalModals,
    getTimeGoalModalTaskId: () => asType<string | null>(args.modalState.get("timeGoalModalTaskId")),
    setTimeGoalModalTaskId: (value) => args.modalState.set("timeGoalModalTaskId", value),
    getTimeGoalModalFrozenElapsedMs: () => asType<number>(args.modalState.get("timeGoalModalFrozenElapsedMs")),
    setTimeGoalModalFrozenElapsedMs: (value) => args.modalState.set("timeGoalModalFrozenElapsedMs", value),
    getTimeGoalReminderAtMsByTaskId: args.getTimeGoalReminderAtMsByTaskId,
    getTimeGoalCompleteDurationUnit: args.getTimeGoalCompleteDurationUnit,
    setTimeGoalCompleteDurationUnit: args.setTimeGoalCompleteDurationUnit,
    getTimeGoalCompleteDurationPeriod: args.getTimeGoalCompleteDurationPeriod,
    setTimeGoalCompleteDurationPeriod: args.setTimeGoalCompleteDurationPeriod,
    getCheckpointToastQueue: args.getCheckpointToastQueue,
    getActiveCheckpointToast: args.getActiveCheckpointToast,
    setActiveCheckpointToast: args.setActiveCheckpointToast,
    getCheckpointToastAutoCloseTimer: args.getCheckpointToastAutoCloseTimer,
    setCheckpointToastAutoCloseTimer: args.setCheckpointToastAutoCloseTimer,
    getCheckpointToastCountdownRefreshTimer: args.getCheckpointToastCountdownRefreshTimer,
    setCheckpointToastCountdownRefreshTimer: args.setCheckpointToastCountdownRefreshTimer,
    getCheckpointBeepAudio: args.getCheckpointBeepAudio,
    setCheckpointBeepAudio: args.setCheckpointBeepAudio,
    getCheckpointBeepQueueCount: args.getCheckpointBeepQueueCount,
    setCheckpointBeepQueueCount: args.setCheckpointBeepQueueCount,
    getCheckpointBeepQueueTimer: args.getCheckpointBeepQueueTimer,
    setCheckpointBeepQueueTimer: args.setCheckpointBeepQueueTimer,
    getCheckpointRepeatStopAtMs: args.getCheckpointRepeatStopAtMs,
    setCheckpointRepeatStopAtMs: args.setCheckpointRepeatStopAtMs,
    getCheckpointRepeatCycleTimer: args.getCheckpointRepeatCycleTimer,
    setCheckpointRepeatCycleTimer: args.setCheckpointRepeatCycleTimer,
    getCheckpointRepeatActiveTaskId: args.getCheckpointRepeatActiveTaskId,
    setCheckpointRepeatActiveTaskId: args.setCheckpointRepeatActiveTaskId,
    getCheckpointAutoResetDirty: args.getCheckpointAutoResetDirty,
    setCheckpointAutoResetDirty: args.setCheckpointAutoResetDirty,
    getCheckpointFiredKeysByTaskId: args.getCheckpointFiredKeysByTaskId,
    getCheckpointBaselineSecByTaskId: args.getCheckpointBaselineSecByTaskId,
    getDynamicColorsEnabled: () => asType<boolean>(args.preferencesState.get("dynamicColorsEnabled")),
    getCheckpointAlertSoundEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertSoundEnabled")),
    getCheckpointAlertToastEnabled: () => asType<boolean>(args.preferencesState.get("checkpointAlertToastEnabled")),
    getOptimalProductivityStartTime: () => asType<string>(args.preferencesState.get("optimalProductivityStartTime")),
    getOptimalProductivityEndTime: () => asType<string>(args.preferencesState.get("optimalProductivityEndTime")),
    render: args.render,
    renderDashboardWidgets: args.renderDashboardWidgets,
    renderDashboardLiveWidgets: args.renderDashboardLiveWidgets,
    save: args.save,
    openOverlay: args.openOverlay,
    closeOverlay: args.closeOverlay,
    navigateToAppRoute: args.navigateToAppRoute,
    normalizedPathname: args.normalizedPathname,
    savePendingTaskJump: args.savePendingTaskJump,
    jumpToTaskById: args.jumpToTaskById,
    escapeHtmlUI: args.escapeHtmlUI,
    formatTime: args.formatTime,
    formatMainTaskElapsed: args.formatMainTaskElapsed,
    formatMainTaskElapsedHtml: args.formatMainTaskElapsedHtml,
    getModeColor: args.getModeColor,
    fillBackgroundForPct: args.fillBackgroundForPct,
    sortMilestones: args.sortMilestones,
    normalizeHistoryTimestampMs: args.normalizeHistoryTimestampMs,
    getHistoryEntryNote: args.getHistoryEntryNote,
    syncSharedTaskSummariesForTask: args.syncSharedTaskSummariesForTask,
    syncRewardSessionTrackerForTask: args.syncRewardSessionTrackerForTask,
    syncLiveSessionForTask: args.syncLiveSessionForTask,
    hasEntitlement: args.hasEntitlement,
    startTask: args.startTask,
    stopTask: args.stopTask,
    resetTask: args.resetTask,
    resetTaskStateImmediate: args.resetTaskStateImmediate,
    broadcastCheckpointAlertMute: args.broadcastCheckpointAlertMute,
  };
}

export function createTaskTimerAppShellContext(args: CreateAppShellOptionsArgs): Parameters<typeof createTaskTimerAppShell>[0] {
  return {
    els: args.els,
    runtime: args.runtime,
    on: args.on,
    initialAppPage: args.initialAppPage,
    navStackKey: args.navStackKey,
    navStackMax: args.navStackMax,
    nativeBackDebounceMs: args.nativeBackDebounceMs,
    getCurrentAppPage: () => asType<AppPage>(args.appRuntimeState.get("currentAppPage")),
    setCurrentAppPage: (page) => args.appRuntimeState.set("currentAppPage", page),
    getDashboardMenuFlipped: () => asType<boolean>(args.appRuntimeState.get("dashboardMenuFlipped")),
    setDashboardMenuFlipped: (value) => args.appRuntimeState.set("dashboardMenuFlipped", value),
    syncDashboardMenuFlipUi: args.syncDashboardMenuFlipUi,
    getSuppressNavStackPush: () => asType<boolean>(args.appRuntimeState.get("suppressNavStackPush")),
    setSuppressNavStackPush: (value) => args.appRuntimeState.set("suppressNavStackPush", value),
    getNavStackMemory: args.getNavStackMemory,
    setNavStackMemory: args.setNavStackMemory,
    getLastNativeBackHandledAtMs: () => asType<number>(args.appRuntimeState.get("lastNativeBackHandledAtMs")),
    setLastNativeBackHandledAtMs: (ms) => args.appRuntimeState.set("lastNativeBackHandledAtMs", ms),
    resetAllOpenHistoryChartSelections: args.resetAllOpenHistoryChartSelections,
    clearTaskFlipStates: args.clearTaskFlipStates,
    renderFriendsFooterAlertBadge: args.renderFriendsFooterAlertBadge,
    closeTaskExportModal: args.closeTaskExportModal,
    closeShareTaskModal: args.closeShareTaskModal,
    closeFriendProfileModal: args.closeFriendProfileModal,
    closeFriendRequestModal: args.closeFriendRequestModal,
    openHistoryManager: args.openHistoryManager,
    requestScheduleEntryScroll: args.requestScheduleEntryScroll,
    render: args.render,
    renderHistory: args.renderHistory,
    renderDashboardWidgets: args.renderDashboardWidgets,
    renderGroupsPage: args.renderGroupsPage,
    refreshGroupsData: args.refreshGroupsData,
    getOpenHistoryTaskIds: args.getOpenHistoryTaskIds,
    closeTopOverlayIfOpen: args.closeTopOverlayIfOpen,
    closeMobileDetailPanelIfOpen: args.closeMobileDetailPanelIfOpen,
    showExitAppConfirm: args.showExitAppConfirm,
    hasEntitlement: args.hasEntitlement,
    showUpgradePrompt: args.showUpgradePrompt,
  };
}

export function createTaskTimerDashboardRenderContext(
  args: CreateDashboardRenderOptionsArgs
): Parameters<typeof createTaskTimerDashboardRender>[0] {
  return {
    els: args.els,
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    getTasks: args.taskCollectionBindings.getTasks,
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId,
    getDeletedTaskMeta: args.taskCollectionBindings.getDeletedTaskMeta,
    getWeekStarting: () => asType<DashboardWeekStart>(args.preferencesState.get("weekStarting")),
    getDashboardAvgRange: () => asType<DashboardAvgRange>(args.dashboardUiState.get("dashboardAvgRange")),
    setDashboardAvgRange: (value) => args.dashboardUiState.set("dashboardAvgRange", value),
    getDashboardTimelineDensity: () => asType<DashboardTimelineDensity>(args.dashboardUiState.get("dashboardTimelineDensity")),
    setDashboardTimelineDensity: (value) => args.dashboardUiState.set("dashboardTimelineDensity", value),
    getDashboardWidgetHasRenderedData: () => args.dashboardWidgetHasRenderedData,
    getDashboardRefreshHoldActive: () =>
      asType<boolean>(args.dashboardBusyState.get("overlayActive")) ||
      asType<Array<unknown>>(args.dashboardBusyState.get("stack")).length > 0 ||
      args.dashboardBusyState.get("hideTimer") != null,
    getCloudRefreshInFlight: () => asType<Promise<void> | null>(args.cloudSyncState.get("cloudRefreshInFlight")),
    getDynamicColorsEnabled: () => asType<boolean>(args.preferencesState.get("dynamicColorsEnabled")),
    getElapsedMs: args.getElapsedMs,
    escapeHtmlUI: args.escapeHtmlUI,
    normalizeHistoryTimestampMs: args.normalizeHistoryTimestampMs,
    getModeColor: args.getModeColor,
    addRangeMsToLocalDayMap: args.addRangeMsToLocalDayMap,
    hasEntitlement: args.hasEntitlement,
    getCurrentPlan: args.getCurrentPlan,
  };
}

export function createTaskTimerDashboardRuntimeContext(
  args: CreateDashboardRuntimeOptionsArgs
): Parameters<typeof createTaskTimerDashboardRuntime>[0] {
  return {
    documentRef: args.documentRef,
    nowMs: args.nowMs,
    getTasks: args.taskCollectionBindings.getTasks,
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId,
    getDeletedTaskMeta: args.taskCollectionBindings.getDeletedTaskMeta,
    getDynamicColorsEnabled: () => asType<boolean>(args.preferencesState.get("dynamicColorsEnabled")),
    getCurrentAppPage: () => asType<AppPage>(args.appRuntimeState.get("currentAppPage")),
    getDashboardMenuFlipped: () => asType<boolean>(args.appRuntimeState.get("dashboardMenuFlipped")),
    getDashboardRefreshPending: () => asType<boolean>(args.appRuntimeState.get("dashboardRefreshPending")),
    setLastDashboardLiveSignature: args.setLastDashboardLiveSignature,
    getLastDashboardLiveSignature: args.getLastDashboardLiveSignature,
    isDashboardBusy: args.isDashboardBusy,
    renderDashboardWidgets: args.renderDashboardWidgets,
    renderDashboardLiveWidgets: args.renderDashboardLiveWidgets,
    getDashboardRefreshBtn: args.getDashboardRefreshBtn,
    getDashboardShellScene: args.getDashboardShellScene,
    getDashboardShellContent: args.getDashboardShellContent,
    getDashboardShellBack: args.getDashboardShellBack,
    getDashboardPanelMenuBtn: args.getDashboardPanelMenuBtn,
    getDashboardPanelMenuBackBtn: args.getDashboardPanelMenuBackBtn,
  };
}

export function createTaskTimerDashboardContext(
  args: CreateDashboardOptionsArgs
): Parameters<typeof createTaskTimerDashboard>[0] {
  return {
    els: args.els,
    on: args.on,
    syncDashboardRefreshButtonUi: args.syncDashboardRefreshButtonUi,
    hasEntitlement: args.hasEntitlement,
    showUpgradePrompt: args.showUpgradePrompt,
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    getTasks: args.taskCollectionBindings.getTasks,
    getHistoryByTaskId: args.taskCollectionBindings.getHistoryByTaskId,
    getWeekStarting: () => asType<DashboardWeekStart>(args.preferencesState.get("weekStarting")),
    getCurrentAppPage: args.currentAppPageBinding.getCurrentAppPage,
    getDashboardMenuFlipped: () => asType<boolean>(args.appRuntimeState.get("dashboardMenuFlipped")),
    setDashboardMenuFlipped: (value) => args.appRuntimeState.set("dashboardMenuFlipped", value),
    syncDashboardMenuFlipUi: args.syncDashboardMenuFlipUi,
    ...args.dashboardLayoutBindings,
    getCloudDashboardCache: args.getCloudDashboardCache,
    setCloudDashboardCache: args.setCloudDashboardCache,
    loadCachedDashboard: args.loadCachedDashboard,
    saveCloudDashboard: args.saveCloudDashboard,
    renderDashboardWidgets: args.renderDashboardWidgets,
    renderDashboardTimelineCard: args.renderDashboardTimelineCard,
    selectDashboardTimelineSuggestion: args.selectDashboardTimelineSuggestion,
    selectDashboardMomentumDriver: args.selectDashboardMomentumDriver,
    clearDashboardMomentumDriverSelection: args.clearDashboardMomentumDriverSelection,
    hasSelectedDashboardMomentumDriver: args.hasSelectedDashboardMomentumDriver,
    openDashboardHeatSummaryCard: args.openDashboardHeatSummaryCard,
    closeDashboardHeatSummaryCard: args.closeDashboardHeatSummaryCard,
  };
}

export function createTaskTimerDashboardFeature(args: CreateDashboardFeatureOptionsArgs) {
  const dashboardRenderApi = createTaskTimerDashboardRender(
    createTaskTimerDashboardRenderContext(args.dashboardRender)
  );
  const {
    renderDashboardTimelineCard,
    renderDashboardLiveWidgets,
    renderDashboardWidgets: renderDashboardWidgetsFromRenderApi,
    selectDashboardTimelineSuggestion,
    selectDashboardMomentumDriver,
    clearDashboardMomentumDriverSelection,
    hasSelectedDashboardMomentumDriver,
    openDashboardHeatSummaryCard,
    closeDashboardHeatSummaryCard,
  } = dashboardRenderApi;

  let dashboardBusyApi: { isBusy: () => boolean } = { isBusy: () => false };

  const dashboardRuntime = createTaskTimerDashboardRuntime(
    createTaskTimerDashboardRuntimeContext({
      ...args.dashboardRuntime,
      isDashboardBusy: () => dashboardBusyApi.isBusy(),
      renderDashboardWidgets: (opts) => renderDashboardWidgetsFromRenderApi(opts),
      renderDashboardLiveWidgets: () => renderDashboardLiveWidgets(),
    })
  );

  const dashboardBindings = createTaskTimerDashboardBindings({
    ...args.dashboardBindings,
    dashboardRuntime,
  });
  dashboardBusyApi = dashboardBindings.dashboardBusyApi;

  const dashboardApi = createTaskTimerDashboard(
    createTaskTimerDashboardContext({
      ...args.dashboard,
      syncDashboardRefreshButtonUi: dashboardBindings.syncDashboardRefreshButtonUi,
      syncDashboardMenuFlipUi: dashboardBindings.syncDashboardMenuFlipUi,
      renderDashboardWidgets: dashboardBindings.renderDashboardWidgetsWithBusy,
      renderDashboardTimelineCard: () => renderDashboardTimelineCard(),
      selectDashboardTimelineSuggestion: (key) => selectDashboardTimelineSuggestion(key),
      selectDashboardMomentumDriver: (key) => selectDashboardMomentumDriver(key),
      clearDashboardMomentumDriverSelection: () => clearDashboardMomentumDriverSelection(),
      hasSelectedDashboardMomentumDriver: () => hasSelectedDashboardMomentumDriver(),
      openDashboardHeatSummaryCard: (dayKey, dateLabel) =>
        openDashboardHeatSummaryCard(dayKey, dateLabel),
      closeDashboardHeatSummaryCard: (opts) => closeDashboardHeatSummaryCard(opts),
    })
  );

  return {
    dashboardRenderApi,
    dashboardRuntime,
    dashboardBindings,
    dashboardApi,
    closeDashboardHeatSummaryCard,
  };
}

export function createTaskTimerRewardsHistoryContext(
  args: CreateRewardsHistoryOptionsArgs
): Parameters<typeof createTaskTimerRewardsHistory>[0] {
  return {
    rewardSessionTrackersStorageKey: args.rewardSessionTrackersStorageKey,
    getTasks: args.getTasks,
    getHistoryByTaskId: args.getHistoryByTaskId,
    getLiveSessionsByTaskId: () =>
      asType<Parameters<typeof createTaskTimerRewardsHistory>[0]["getLiveSessionsByTaskId"] extends () => infer T ? T : never>(
        args.getLiveSessionsByTaskId()
      ),
    setLiveSessionsByTaskId: (value) => args.setLiveSessionsByTaskId(value),
    getDeletedTaskMeta: args.getDeletedTaskMeta,
    getWeekStarting: () => asType<DashboardWeekStart>(args.preferencesState.get("weekStarting")),
    getRewardProgress: () => asType<RewardProgressV1>(args.rewardState.get("rewardProgress")),
    setRewardProgress: (value) => args.rewardState.set("rewardProgress", value),
    getRewardSessionTrackersByTaskId: () =>
      asType<Parameters<typeof createTaskTimerRewardsHistory>[0]["getRewardSessionTrackersByTaskId"] extends () => infer T ? T : never>(
        args.rewardState.get("rewardSessionTrackersByTaskId")
      ),
    setRewardSessionTrackersByTaskId: (value) => args.rewardState.set("rewardSessionTrackersByTaskId", value),
    getCloudPreferencesCache: () =>
      asType<Parameters<typeof createTaskTimerRewardsHistory>[0]["getCloudPreferencesCache"] extends () => infer T ? T : never>(
        args.rewardState.get("cloudPreferencesCache")
      ),
    setCloudPreferencesCache: (value) => args.setCloudPreferencesCache(value ?? null),
    getFocusModeTaskId: args.focusBindings.getFocusModeTaskId,
    getCurrentPlan: args.getCurrentPlan,
    hasEntitlement: args.hasEntitlement,
    currentUid: args.currentUid,
    getTaskElapsedMs: args.getTaskElapsedMs,
    sessionColorForTaskMs: args.sessionColorForTaskMs,
    captureSessionNoteSnapshot: args.captureSessionNoteSnapshot,
    setFocusSessionDraft: args.setFocusSessionDraft,
    clearFocusSessionDraft: args.clearFocusSessionDraft,
    syncFocusSessionNotesInput: args.syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion: args.syncFocusSessionNotesAccordion,
    appendHistoryEntry: args.appendHistoryEntry,
    saveLiveSession: args.saveLiveSession,
    clearLiveSession: args.clearLiveSession,
    saveHistoryLocally: args.saveHistoryLocally,
    buildDefaultCloudPreferences: args.buildDefaultCloudPreferences,
    saveCloudPreferences: args.saveCloudPreferences,
    syncSharedTaskSummariesForTask: args.syncSharedTaskSummariesForTask,
    syncOwnFriendshipProfile: args.syncOwnFriendshipProfile,
  };
}
