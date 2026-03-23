/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task, DeletedTaskMeta } from "./lib/types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId, escapeRegExp, newTaskId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import { normalizeHistoryTimestampMs, localDayKey, getCalendarWeekStartMs } from "./lib/history";
import { escapeHistoryManagerHtml as escapeHtmlHM } from "./lib/historyManager";
import {
  getDashboardAvgRangeWindow,
  dashboardAvgRangeLabel,
  formatDashboardDurationShort,
  formatDashboardHeatMonthLabel,
  startOfCurrentWeekMondayMs,
} from "./lib/historyChart";
import { formatFocusElapsed, formatMainTaskElapsed, formatMainTaskElapsedHtml } from "./lib/tasks";
import {
  ADD_TASK_PRESET_NAMES,
  filterTaskNameOptions,
  parseRecentCustomTaskNames,
  rememberRecentCustomTaskName,
} from "./lib/addTaskNames";
import {
  formatAddTaskDurationReadout,
  getAddTaskDurationMaxForPeriod,
  normalizeTaskConfigMilestones,
} from "@/features/tasktimer-react/model/taskConfig";
import { computeFocusInsights } from "./lib/focusInsights";
import { AVATAR_CATALOG } from "./lib/avatarCatalog";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  approveFriendRequest,
  cancelOutgoingFriendRequest,
  deleteFriendship,
  deleteSharedTaskSummary,
  deleteSharedTaskSummariesForTask,
  declineFriendRequest,
  loadFriendProfile,
  loadFriendships,
  loadIncomingRequests,
  loadOutgoingRequests,
  loadSharedTaskSummariesForViewer,
  loadSharedTaskSummariesForOwner,
  sendFriendRequest,
  syncOwnFriendshipProfile,
  upsertSharedTaskSummary,
  type FriendProfile,
  type FriendRequest,
} from "./lib/friendsStore";
import {
  STORAGE_KEY,
  buildDefaultCloudPreferences,
  hydrateStorageFromCloud,
  refreshHistoryFromCloud,
  loadTasks,
  saveTasks,
  loadHistory,
  appendHistoryEntry,
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
  subscribeCloudTaskCollection,
} from "./lib/storage";
import { DEFAULT_REWARD_PROGRESS, awardTaskLaunchXp, getRankLabelById, getRankThumbnailDescriptor, normalizeRewardProgress } from "./lib/rewards";
import { onAuthStateChanged } from "firebase/auth";
import type {
  AppPage,
  DashboardAvgRange,
  DashboardCardSize,
  DashboardTimelineDensity,
  HistoryViewState,
  MainMode,
  TaskTimerClientHandle,
} from "./client/types";
import { collectTaskTimerElements } from "./client/elements";
import { createTaskTimerRuntime, destroyTaskTimerRuntime } from "./client/runtime";
import {
  createInitialTaskTimerState,
  createTaskTimerStorageKeys,
  DEFAULT_MODE_COLORS,
  DEFAULT_MODE_ENABLED,
  DEFAULT_MODE_LABELS,
} from "./client/state";

const ARCHITECT_UID = "mWN9rMhO4xMq410c4E4VYyThw0x2";
const ARCHITECT_EMAIL = "aniven82@gmail.com";

type HistoryGenParams = {
  taskIds: string[];
  daysBack: number;
  entriesPerDayMin: number;
  entriesPerDayMax: number;
  windowStartMinute: number;
  windowEndMinute: number;
  replaceExisting: boolean;
};

type HistoryGenPreview = {
  params: HistoryGenParams;
  perTaskCount: Record<string, number>;
  totalGenerated: number;
  nextHistory: HistoryByTaskId;
};

export function initTaskTimerClient(initialAppPage: AppPage = "tasks"): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }
  const {
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
  } = createTaskTimerStorageKeys(STORAGE_KEY);
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

  const initialState = createInitialTaskTimerState(initialAppPage);

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
  let groupsStatusMessage = initialState.groupsStatusMessage;
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

  function taskTimerRootPath() {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return `${taskTimerMatch[1] || ""}/tasktimer`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide|feedback|dashboard|friends)$/, "");
    return pageStyleRoot || normalized || "/tasktimer";
  }

  function taskTimerExportBasePath() {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return taskTimerMatch[1] || "";
    return "";
  }

  function appRoute(path: string) {
    if (!path.startsWith("/tasktimer")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasktimer/, "");
    const resolved = `${taskTimerRootPath()}${suffix}${trailing}`;

    // In exported/mobile builds (e.g. Android WebView), folder URLs like `/tasktimer/settings/`
    // can fall back to the app root. Target the actual exported file path instead.
    const currentPath = window.location.pathname || "";
    const capacitorApi = (window as any).Capacitor;
    const isNativeCapacitorRuntime = !!(
      capacitorApi &&
      typeof capacitorApi.isNativePlatform === "function" &&
      capacitorApi.isNativePlatform()
    );
    const usesExportedHtmlPaths =
      window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
    if (!usesExportedHtmlPaths) return resolved;

    const resolvedHashIndex = resolved.indexOf("#");
    const resolvedQueryIndex = resolved.indexOf("?");
    const resolvedCutIndex =
      resolvedQueryIndex === -1
        ? resolvedHashIndex
        : resolvedHashIndex === -1
          ? resolvedQueryIndex
          : Math.min(resolvedQueryIndex, resolvedHashIndex);
    const resolvedPathOnly = resolvedCutIndex >= 0 ? resolved.slice(0, resolvedCutIndex) : resolved;
    const resolvedTrailing = resolvedCutIndex >= 0 ? resolved.slice(resolvedCutIndex) : "";
    if (/\/index\.html$/i.test(resolvedPathOnly)) return resolved;
    const noTrailingSlash = resolvedPathOnly.replace(/\/+$/, "");
    return `${noTrailingSlash}/index.html${resolvedTrailing}`;
  }

  function isTaskTimerTasksPath(path: string) {
    return /\/tasktimer$/i.test(path) || /\/tasktimer\/index\.html$/i.test(path);
  }

  function isTaskTimerDashboardPath(path: string) {
    return /\/tasktimer\/dashboard$/i.test(path) || /\/tasktimer\/dashboard\/index\.html$/i.test(path);
  }

  function isTaskTimerFriendsPath(path: string) {
    return /\/tasktimer\/friends$/i.test(path) || /\/tasktimer\/friends\/index\.html$/i.test(path);
  }

  function isTaskTimerMainAppPath(path: string) {
    return isTaskTimerTasksPath(path) || isTaskTimerDashboardPath(path) || isTaskTimerFriendsPath(path);
  }

  function appPathForPage(page: AppPage) {
    if (page === "dashboard") return appRoute("/tasktimer/dashboard");
    if (page === "test1") return `${appRoute("/tasktimer")}?page=test1`;
    if (page === "test2") return appRoute("/tasktimer/friends");
    return appRoute("/tasktimer");
  }

  function getInitialAppPageFromLocation(defaultPage: AppPage = initialAppPage): AppPage {
    try {
      const path = normalizedPathname();
      if (isTaskTimerDashboardPath(path)) return "dashboard";
      if (isTaskTimerFriendsPath(path)) return "test2";
      const params = new URLSearchParams(window.location.search || "");
      const page = String(params.get("page") || "").toLowerCase();
      if (page === "dashboard") return "dashboard";
      if (page === "test1") return "test1";
      if (page === "test2") return "test2";
    } catch {
      // ignore
    }
    return isTaskTimerTasksPath(normalizedPathname()) ? "tasks" : defaultPage;
  }

  function normalizedPathname() {
    try {
      return (window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  }

  function normalizeTaskTimerRoutePath(pathRaw: string) {
    const trimmed = String(pathRaw || "").trim();
    if (!trimmed) return "";
    const withoutQuery = trimmed.split("#")[0]?.split("?")[0] || "";
    let normalized = withoutQuery.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
    normalized = normalized.replace(/\/index\.html$/i, "");
    if (/\/tasktimer\/settings\.html$/i.test(normalized)) return "/tasktimer/settings";
    if (/\/tasktimer\/history-manager\.html$/i.test(normalized)) return "/tasktimer/history-manager";
    if (/\/tasktimer\/user-guide\.html$/i.test(normalized)) return "/tasktimer/user-guide";
    if (/\/tasktimer\/feedback\.html$/i.test(normalized)) return "/tasktimer/feedback";
    if (/\/tasktimer(?:\/index)?$/i.test(normalized)) return "/tasktimer";
    return normalized;
  }

  function isValidTaskTimerBackRoute(pathRaw: string) {
    const path = normalizeTaskTimerRoutePath(pathRaw);
    return (
      path === "/tasktimer" ||
      path === "/tasktimer/settings" ||
      path === "/tasktimer/history-manager" ||
      path === "/tasktimer/user-guide" ||
      path === "/tasktimer/feedback"
    );
  }

  function screenTokenForCurrent(pageOverride?: AppPage) {
    const path = normalizedPathname();
    if (isTaskTimerMainAppPath(path)) {
      const page = pageOverride || currentAppPage || "tasks";
      return `app:tasktimer|page=${page}`;
    }
    return `route:${path}`;
  }

  function parseAppPageFromToken(token: string | null | undefined): AppPage | null {
    const m = String(token || "").match(/\|page=(tasks|dashboard|test1|test2)$/);
    if (!m) return null;
    const p = m[1];
    if (p === "tasks" || p === "dashboard" || p === "test1" || p === "test2") return p;
    return null;
  }

  function normalizeNavStack(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => String(entry || "").trim())
      .filter((entry) => !!entry)
      .slice(-NAV_STACK_MAX);
  }

  function loadNavStack(): string[] {
    try {
      const raw = localStorage.getItem(NAV_STACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = normalizeNavStack(parsed);
        navStackMemory = next.slice();
        return next;
      }
    } catch {
      // ignore localStorage/JSON failures
    }
    const fallback = normalizeNavStack(navStackMemory);
    navStackMemory = fallback.slice();
    return fallback;
  }

  function saveNavStack(stack: string[]) {
    const next = normalizeNavStack(stack);
    navStackMemory = next.slice();
    try {
      if (next.length) localStorage.setItem(NAV_STACK_KEY, JSON.stringify(next));
      else localStorage.removeItem(NAV_STACK_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function pushCurrentScreenToNavStack(pageOverride?: AppPage) {
    if (suppressNavStackPush) return;
    const token = screenTokenForCurrent(pageOverride);
    const stack = loadNavStack();
    if (stack[stack.length - 1] === token) return;
    stack.push(token);
    saveNavStack(stack);
  }

  function ensureNavStackCurrentScreen() {
    pushCurrentScreenToNavStack();
  }

  function navigateToAppRoute(path: string) {
    if (currentAppPage === "tasks") resetAllOpenHistoryChartSelections();
    pushCurrentScreenToNavStack();
    window.location.href = appRoute(path);
  }

  function getCapAppPlugin() {
    const cap = (window as any)?.Capacitor;
    if (!cap) return null;
    const direct = cap?.Plugins?.App || cap?.App;
    if (direct) return direct;
    if (typeof cap?.registerPlugin === "function") {
      try {
        return cap.registerPlugin("App");
      } catch {
        return null;
      }
    }
    return null;
  }

  function exitAppNow() {
    try {
      const capApp = getCapAppPlugin();
      if (capApp?.exitApp) {
        capApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      const navApp = (navigator as any)?.app;
      if (navApp?.exitApp) {
        navApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      window.close();
    } catch {
      // ignore
    }
  }

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

  function resolveBackNavigationTarget(token: string, currentToken: string, currentPath: string) {
    const rawToken = String(token || "").trim();
    if (!rawToken || rawToken === currentToken) return null;

    if (rawToken.startsWith("app:")) {
      const page = parseAppPageFromToken(rawToken);
      if (!page) return null;
      if (screenTokenForCurrent(page) === currentToken) return null;
      return { kind: "app" as const, page };
    }

    if (rawToken.startsWith("route:")) {
      const routePath = normalizeTaskTimerRoutePath(rawToken.slice("route:".length));
      const currentRoutePath = normalizeTaskTimerRoutePath(currentPath);
      if (!routePath || routePath === currentRoutePath) return null;
      if (!isValidTaskTimerBackRoute(routePath)) return null;
      return { kind: "route" as const, path: routePath };
    }

    return null;
  }

  function canUseBrowserHistoryFallback(currentPath: string) {
    try {
      if ((window.history?.length || 0) <= 1) return false;
      const referrer = String(document.referrer || "").trim();
      if (!referrer) return false;
      const url = new URL(referrer, window.location.href);
      if (url.origin !== window.location.origin) return false;
      const refPath = normalizeTaskTimerRoutePath(url.pathname || "");
      const nowPath = normalizeTaskTimerRoutePath(currentPath);
      return !!refPath && refPath !== nowPath && isValidTaskTimerBackRoute(refPath);
    } catch {
      return false;
    }
  }

  function handleAppBackNavigation(): boolean {
    if (closeTopOverlayIfOpen()) return true;
    if (closeMobileDetailPanelIfOpen()) return true;

    const path = normalizedPathname();
    const stack = loadNavStack();
    const currentToken = screenTokenForCurrent();
    while (stack.length && stack[stack.length - 1] === currentToken) stack.pop();
    let nextTarget: ReturnType<typeof resolveBackNavigationTarget> = null;
    while (stack.length && !nextTarget) {
      const candidate = stack.pop() || "";
      nextTarget = resolveBackNavigationTarget(candidate, currentToken, path);
    }
    saveNavStack(stack);

    if (nextTarget?.kind === "app") {
      suppressNavStackPush = true;
      applyAppPage(nextTarget.page);
      suppressNavStackPush = false;
      ensureNavStackCurrentScreen();
      return true;
    }

    if (nextTarget?.kind === "route") {
      window.location.href = appRoute(nextTarget.path);
      return true;
    }

    if (canUseBrowserHistoryFallback(path)) {
      window.history.back();
      return true;
    }

    showExitAppConfirm();
    return true;
  }

  function onNativeBackPressed(ev?: any) {
    try {
      ev?.preventDefault?.();
    } catch {
      // ignore
    }
    const now = Date.now();
    if (now - lastNativeBackHandledAtMs < NATIVE_BACK_DEBOUNCE_MS) return;
    lastNativeBackHandledAtMs = now;
    handleAppBackNavigation();
  }

  function initMobileBackHandling() {
    ensureNavStackCurrentScreen();

    const onPopState = () => {
      const path = normalizedPathname();
      if (!isTaskTimerMainAppPath(path)) return;
      const nextPage = getInitialAppPageFromLocation();
      suppressNavStackPush = true;
      applyAppPage(nextPage);
      suppressNavStackPush = false;
      ensureNavStackCurrentScreen();
    };
    on(window, "popstate", onPopState as any);

    let capBackHooked = false;

    try {
      const capApp = getCapAppPlugin();
      if (capApp?.addListener) {
        capBackHooked = true;
        const maybePromise = capApp.addListener("backButton", (ev: any) => {
          onNativeBackPressed(ev);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then((h: any) => {
            if (h?.remove) runtime.removeCapBackListener = () => h.remove();
          }).catch(() => {});
        } else if (maybePromise?.remove) {
          runtime.removeCapBackListener = () => maybePromise.remove();
        }
      }
    } catch {
      // ignore
    }

    if (!capBackHooked) {
      on(document as any, "backbutton", (e: any) => {
        onNativeBackPressed(e);
      });
    }
  }

  function rehydrateFromCloudAndRender(opts?: { force?: boolean }) {
    if (runtime.destroyed) return Promise.resolve();
    if (cloudRefreshInFlight) return cloudRefreshInFlight;
    cloudRefreshInFlight = hydrateStorageFromCloud(opts)
      .then(() => {
        if (runtime.destroyed) return;
        hydrateUiStateFromCaches();
        syncTimeGoalModalWithTaskState();
        render();
        maybeHandlePendingTaskJump();
        maybeRestorePendingTimeGoalFlow();
        lastCloudRefreshAtMs = nowMs();
      })
      .catch(() => {
        // Keep current in-memory state when cloud refresh is unavailable.
      })
      .finally(() => {
        cloudRefreshInFlight = null;
      });
    return cloudRefreshInFlight;
  }

  function hasActiveFormInteraction() {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return false;
    return active.matches('input, textarea, select, [contenteditable="true"]');
  }

  function noteUiInteraction() {
    lastUiInteractionAtMs = nowMs();
  }

  function hasRecentUiInteraction(windowMs = 1200) {
    return nowMs() - lastUiInteractionAtMs < windowMs;
  }

  function isOverlayVisible(overlay: HTMLElement | null) {
    if (!overlay) return false;
    return overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
  }

  function hasActiveTimeGoalCompletionFlow() {
    const taskId = String(timeGoalModalTaskId || "").trim();
    if (!taskId) return false;
    return (
      isOverlayVisible(els.timeGoalCompleteOverlay as HTMLElement | null) ||
      isOverlayVisible(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null) ||
      isOverlayVisible(els.timeGoalCompleteNoteOverlay as HTMLElement | null)
    );
  }

  function scheduleDeferredCloudRefresh(minIntervalMs = 0) {
    pendingDeferredCloudRefresh = true;
    if (deferredCloudRefreshTimer != null || runtime.destroyed) return;
    deferredCloudRefreshTimer = window.setTimeout(() => {
      deferredCloudRefreshTimer = null;
      if (runtime.destroyed || !pendingDeferredCloudRefresh) return;
      if (!hasActiveTimeGoalCompletionFlow() && (hasActiveFormInteraction() || hasRecentUiInteraction())) {
        scheduleDeferredCloudRefresh(minIntervalMs);
        return;
      }
      pendingDeferredCloudRefresh = false;
      refreshCloudStateIfStale(minIntervalMs);
    }, 500);
  }

  function refreshCloudStateIfStale(minIntervalMs = 3000) {
    if (!hasActiveTimeGoalCompletionFlow() && (hasActiveFormInteraction() || hasRecentUiInteraction())) {
      scheduleDeferredCloudRefresh(minIntervalMs);
      return;
    }
    pendingDeferredCloudRefresh = false;
    const currentMs = nowMs();
    if (currentMs - lastCloudRefreshAtMs < minIntervalMs) return;
    void rehydrateFromCloudAndRender({ force: true });
  }

  function shouldHoldDashboardWidget<K extends keyof typeof dashboardWidgetHasRenderedData>(widget: K, hasData: boolean) {
    if (hasData) {
      dashboardWidgetHasRenderedData[widget] = true;
      return false;
    }
    return !!cloudRefreshInFlight && dashboardWidgetHasRenderedData[widget];
  }

  function getVisibleDashboardModes(): MainMode[] {
    return (["mode1", "mode2", "mode3"] as MainMode[]).filter((mode) => isModeEnabled(mode));
  }

  function isDashboardModeIncluded(mode: MainMode) {
    return dashboardIncludedModes[mode] !== false;
  }

  function ensureDashboardIncludedModesValid() {
    const visibleModes = getVisibleDashboardModes();
    if (!visibleModes.length) {
      dashboardIncludedModes.mode1 = true;
      return;
    }
    const hasVisibleMode = visibleModes.some((mode) => isDashboardModeIncluded(mode));
    if (hasVisibleMode) return;
    dashboardIncludedModes[visibleModes[0] || "mode1"] = true;
  }

  function getDashboardIncludedModesMapForStorage() {
    return {
      mode1: dashboardIncludedModes.mode1 !== false,
      mode2: dashboardIncludedModes.mode2 !== false,
      mode3: dashboardIncludedModes.mode3 !== false,
    } satisfies Record<MainMode, boolean>;
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

  function syncCloudTaskCollectionListener() {
    if (runtime.removeCloudTaskCollectionListener) {
      try {
        runtime.removeCloudTaskCollectionListener();
      } catch {
        // ignore
      }
      runtime.removeCloudTaskCollectionListener = null;
    }
    const uid = currentUid();
    if (!uid) return;
    runtime.removeCloudTaskCollectionListener = subscribeCloudTaskCollection(uid, () => {
      refreshCloudStateIfStale(0);
    });
  }

  function initCloudRefreshSync() {
    on(document, "pointerdown", () => {
      noteUiInteraction();
    });
    on(document, "focusin", () => {
      noteUiInteraction();
    });
    on(document, "input", () => {
      noteUiInteraction();
    });
    on(document, "change", () => {
      noteUiInteraction();
    });
    on(window, "focus", () => {
      refreshCloudStateIfStale(0);
      maybeRestorePendingTimeGoalFlow();
    });
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshCloudStateIfStale(0);
        maybeRestorePendingTimeGoalFlow();
      }
    });

    try {
      const capApp = getCapAppPlugin();
      if (capApp?.addListener) {
        const maybePromise = capApp.addListener("appStateChange", (state: { isActive?: boolean } | null) => {
          if (state?.isActive) {
            refreshCloudStateIfStale(0);
            maybeRestorePendingTimeGoalFlow();
          }
        });
        if (maybePromise && typeof (maybePromise as any).then === "function") {
          (maybePromise as Promise<any>)
            .then((h: any) => {
              if (h?.remove) runtime.removeCapAppStateListener = () => h.remove();
            })
            .catch(() => {});
        } else if ((maybePromise as any)?.remove) {
          runtime.removeCapAppStateListener = () => (maybePromise as any).remove();
        }
      }
    } catch {
      // ignore native app-state listener failures
    }

    const auth = getFirebaseAuthClient();
    if (auth) {
      runtime.removeAuthStateListener = onAuthStateChanged(auth, () => {
        syncCloudTaskCollectionListener();
        refreshCloudStateIfStale(0);
      });
    }
    syncCloudTaskCollectionListener();
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

  function load() {
    const loaded = loadTasks();
    if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
      tasks = [];
      return;
    }
    tasks = loaded;
    tasks.forEach((t) => {
      if (!(t as any).mode) (t as any).mode = "mode1";
      if (t.milestoneTimeUnit !== "day" && t.milestoneTimeUnit !== "hour" && t.milestoneTimeUnit !== "minute") {
        t.milestoneTimeUnit = "hour";
      }
      t.checkpointSoundEnabled = !!t.checkpointSoundEnabled;
      t.checkpointSoundMode = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = !!t.checkpointToastEnabled;
      t.checkpointToastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
      t.timeGoalAction =
        t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
          ? t.timeGoalAction
          : t.finalCheckpointAction === "resetLog" ||
              t.finalCheckpointAction === "resetNoLog" ||
              t.finalCheckpointAction === "confirmModal"
            ? t.finalCheckpointAction
            : "continue";
      t.timeGoalEnabled = !!t.timeGoalEnabled;
      t.timeGoalValue = Number.isFinite(Number(t.timeGoalValue)) ? Math.max(0, Number(t.timeGoalValue)) : 0;
      t.timeGoalUnit = t.timeGoalUnit === "minute" ? "minute" : "hour";
      t.timeGoalPeriod = t.timeGoalPeriod === "day" ? "day" : "week";
      t.timeGoalMinutes = Number.isFinite(Number(t.timeGoalMinutes)) ? Math.max(0, Number(t.timeGoalMinutes)) : 0;
    });
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

  function regeneratePresetIntervalMilestones(task: Task) {
    if (!task || !Array.isArray(task.milestones) || task.milestones.length === 0) return;
    if (!hasValidPresetInterval(task)) return;
    const taskAny = task as any;
    ensureMilestoneIdentity(task);
    const interval = Math.max(0, +taskAny.presetIntervalValue || 0);
    const ordered = task.milestones.slice().sort((a, b) => (+((a as any).createdSeq) || 0) - (+((b as any).createdSeq) || 0));
    ordered.forEach((m, idx) => {
      m.hours = interval * (idx + 1);
    });
    const last = ordered[ordered.length - 1];
    taskAny.presetIntervalLastMilestoneId = last?.id ? String(last.id) : null;
    task.milestones = sortMilestones(ordered);
  }

  function savePendingTaskJump(taskId: string | null) {
    pendingTaskJumpMemory = taskId ? String(taskId) : null;
    try {
      if (pendingTaskJumpMemory) window.localStorage.setItem(PENDING_PUSH_TASK_ID_KEY, pendingTaskJumpMemory);
      else window.localStorage.removeItem(PENDING_PUSH_TASK_ID_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function loadPendingTaskJump() {
    const raw = String(pendingTaskJumpMemory || "").trim();
    if (raw) return raw || null;
    try {
      const stored = String(window.localStorage.getItem(PENDING_PUSH_TASK_ID_KEY) || "").trim();
      return stored || null;
    } catch {
      return null;
    }
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
    const taskId = loadPendingTaskJump();
    if (!taskId) return;
    if (!tasks.some((row) => String(row.id || "") === taskId)) return;
    savePendingTaskJump(null);
    jumpToTaskById(taskId);
    maybeRestorePendingTimeGoalFlow();
    window.setTimeout(() => {
      if (runtime.destroyed || loadPendingTaskJump()) return;
      maybeRestorePendingTimeGoalFlow();
    }, 120);
  }

  function save(opts?: { deletedTaskIds?: string[] }) {
    saveTasks(tasks, opts);
  }

  function historySignature(history: HistoryByTaskId) {
    const parts: string[] = [];
    Object.keys(history || {})
      .sort()
      .forEach((taskId) => {
        const rows = Array.isArray(history?.[taskId]) ? history[taskId] : [];
        const rowSig = rows
          .map((e: any) => `${Number(e?.ts || 0)}|${Number(e?.ms || 0)}|${String(e?.name || "")}|${String(e?.note || "")}`)
          .join(",");
        parts.push(`${taskId}:${rowSig}`);
      });
    return parts.join("||");
  }

  function loadFocusSessionNotes() {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(FOCUS_SESSION_NOTES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return {};
      const next: Record<string, string> = {};
      Object.keys(parsed).forEach((taskId) => {
        const value = String(parsed[taskId] || "").trim();
        if (value) next[taskId] = value;
      });
      return next;
    } catch {
      return {};
    }
  }

  function persistFocusSessionNotes() {
    if (typeof window === "undefined") return;
    try {
      const next: Record<string, string> = {};
      Object.keys(focusSessionNotesByTaskId || {}).forEach((taskId) => {
        const value = String(focusSessionNotesByTaskId[taskId] || "").trim();
        if (value) next[taskId] = value;
      });
      if (Object.keys(next).length) window.localStorage.setItem(FOCUS_SESSION_NOTES_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(FOCUS_SESSION_NOTES_KEY);
    } catch {
      // ignore localStorage failures
    }
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return;
    const value = String(noteRaw || "").trim();
    if (value) focusSessionNotesByTaskId[taskKey] = value;
    else delete focusSessionNotesByTaskId[taskKey];
    persistFocusSessionNotes();
  }

  function getFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    return String(focusSessionNotesByTaskId[taskKey] || "");
  }

  function clearFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey || !focusSessionNotesByTaskId[taskKey]) return;
    delete focusSessionNotesByTaskId[taskKey];
    persistFocusSessionNotes();
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    if (!els.focusSessionNotesInput) return;
    els.focusSessionNotesInput.value = taskId ? getFocusSessionDraft(taskId) : "";
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    if (!els.focusSessionNotesSection) return;
    const noteValue = taskId ? getFocusSessionDraft(taskId) : "";
    els.focusSessionNotesSection.open = !!noteValue.trim();
  }

  function scheduleFocusSessionNoteSave(taskId: string, noteRaw: string) {
    if (focusSessionNoteSaveTimer != null) {
      window.clearTimeout(focusSessionNoteSaveTimer);
      focusSessionNoteSaveTimer = null;
    }
    focusSessionNoteSaveTimer = window.setTimeout(() => {
      setFocusSessionDraft(taskId, noteRaw);
      focusSessionNoteSaveTimer = null;
    }, 250);
  }

  function flushPendingFocusSessionNoteSave(taskId?: string | null) {
    const pendingTaskId = String(taskId || focusModeTaskId || "").trim();
    if (focusSessionNoteSaveTimer != null) {
      window.clearTimeout(focusSessionNoteSaveTimer);
      focusSessionNoteSaveTimer = null;
    }
    if (!pendingTaskId) return;
    const isActiveFocusTask = String(focusModeTaskId || "").trim() === pendingTaskId;
    if (isActiveFocusTask && els.focusSessionNotesInput) {
      setFocusSessionDraft(pendingTaskId, String(els.focusSessionNotesInput.value || ""));
    }
  }

  function getLiveFocusSessionNoteValue(taskId?: string | null): string {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    if (String(focusModeTaskId || "").trim() !== taskKey) return "";
    return String(els.focusSessionNotesInput?.value || "").trim();
  }

  function captureSessionNoteSnapshot(taskId?: string | null): string {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    flushPendingFocusSessionNoteSave(taskKey);
    const liveNote = getLiveFocusSessionNoteValue(taskKey);
    if (liveNote) {
      setFocusSessionDraft(taskKey, liveNote);
      return liveNote;
    }
    return getFocusSessionDraft(taskKey);
  }

  function captureResetActionSessionNote(taskId?: string | null): string {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    const liveFocusNote = getLiveFocusSessionNoteValue(taskKey);
    if (liveFocusNote) {
      setFocusSessionDraft(taskKey, liveFocusNote);
      return liveFocusNote;
    }
    return captureSessionNoteSnapshot(taskKey);
  }

  function getHistoryEntryNote(entry: any) {
    const note = String(entry?.note || "").trim();
    return note || "";
  }

  type HistoryNoteLine = {
    timeText: string;
    noteText: string;
    copyText: string;
  };

  type HistoryNoteGroup = {
    headerText: string;
    notes: HistoryNoteLine[];
  };

  type HistoryEntryNoteOverlayPayload = {
    notes: HistoryNoteLine[];
    groups: HistoryNoteGroup[];
  };

  function historyLocalDateKey(tsRaw: unknown) {
    const ts = normalizeHistoryTimestampMs(tsRaw);
    if (ts <= 0) return "";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function getHistorySingleEntryNoteGroup(displayEntry: any): HistoryNoteGroup | null {
    const note = getHistoryEntryNote(displayEntry);
    if (!note) return null;
    const ts = normalizeHistoryTimestampMs(displayEntry?.ts);
    return {
      headerText: "",
      notes: [
        {
          timeText: ts > 0 ? formatDateTime(ts) : "Saved session note",
          noteText: note,
          copyText: note,
        },
      ],
    };
  }

  function getHistoryNoteLinesForDisplay(taskId: string, displayEntry: any, rangeMode: "entries" | "day"): HistoryNoteLine[] {
    const singleNote = getHistoryEntryNote(displayEntry);
    if (rangeMode !== "day") {
      if (!singleNote) return [];
      const ts = normalizeHistoryTimestampMs(displayEntry?.ts);
      return [
        {
          timeText: ts > 0 ? formatDateTime(ts) : "Saved session note",
          noteText: singleNote,
          copyText: singleNote,
        },
      ];
    }

    const dayKey = historyLocalDateKey(displayEntry?.ts);
    if (!dayKey) return [];
    return getHistoryForTask(taskId)
      .filter((entry: any) => historyLocalDateKey(entry?.ts) === dayKey)
      .map((entry: any) => {
        const note = getHistoryEntryNote(entry);
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        if (!note) return null;
        return {
          ts,
          timeText: ts > 0 ? formatDateTime(ts) : "Saved session note",
          noteText: note,
          copyText: note,
        };
      })
      .filter((entry): entry is { ts: number; timeText: string; noteText: string; copyText: string } => !!entry)
      .sort((a, b) => b.ts - a.ts)
      .map((entry) => ({ timeText: entry.timeText, noteText: entry.noteText, copyText: entry.copyText }));
  }

  function getHistoryEntryNoteOverlayPayload(
    taskId: string,
    displayEntry: any,
    rangeMode: "entries" | "day",
    lockedAbsIndexes?: Set<number> | null
  ): HistoryEntryNoteOverlayPayload {
    if (rangeMode === "day") {
      return { notes: getHistoryNoteLinesForDisplay(taskId, displayEntry, rangeMode), groups: [] };
    }
    const lockedIndexes = lockedAbsIndexes ? Array.from(lockedAbsIndexes.values()).sort((a, b) => a - b) : [];
    if (lockedIndexes.length >= 2) {
      const state = ensureHistoryViewState(taskId);
      const displayEntries = getHistoryDisplayForTask(taskId, state);
      const groups = lockedIndexes
        .map((absIndex) => getHistorySingleEntryNoteGroup(displayEntries[absIndex]))
        .filter((group): group is HistoryNoteGroup => !!group);
      return { notes: [], groups };
    }
    const singleGroup = getHistorySingleEntryNoteGroup(displayEntry);
    return { notes: singleGroup ? singleGroup.notes : [], groups: [] };
  }

  function renderHistoryEntryNoteItems(notes: HistoryNoteLine[]) {
    return notes
      .map(
        (note, index) => `<div class="historyEntryNoteItem${index < notes.length - 1 ? " historyEntryNoteItem-spaced" : ""}">
            <div class="historyEntryNoteLine"><span class="historyEntryNoteTime">${escapeHtmlUI(note.timeText)}</span><span class="historyEntryNoteSep"> - </span><span class="historyEntryNoteText">${escapeHtmlUI(note.noteText)}</span></div>
            <div class="historyEntryNoteCopyCell">
              <button class="historyEntryNoteCopyLink" type="button" data-history-note-copy="${escapeHtmlUI(note.copyText)}">Copy</button>
            </div>
          </div>`
      )
      .join("");
  }

  async function copyTextToClipboard(textRaw: string) {
    const text = String(textRaw || "");
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback.
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }

  function positionHistoryEntryNoteOverlay(taskId: string) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    const modal = overlay?.querySelector(".modal") as HTMLElement | null;
    const ui = getHistoryUi(taskId);
    const chartWrap = ((ui?.canvasWrap as HTMLElement | null) || (els.historyCanvasWrap as HTMLElement | null));
    if (!overlay || !modal || !chartWrap) {
      if (overlay) {
        overlay.style.removeProperty("--history-note-left");
        overlay.style.removeProperty("--history-note-top");
      }
      return;
    }

    const gap = 10;
    const viewportPad = 14;
    const chartRect = chartWrap.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const modalWidth = Math.max(Math.ceil(modalRect.width || modal.offsetWidth || 0), 280);
    const modalHeight = Math.max(Math.ceil(modalRect.height || modal.offsetHeight || 0), 120);

    let left = chartRect.left;
    const maxLeft = Math.max(viewportPad, viewportWidth - modalWidth - viewportPad);
    if (left > maxLeft) left = maxLeft;
    if (left < viewportPad) left = viewportPad;

    let top = chartRect.bottom + gap;
    const maxTop = Math.max(viewportPad, viewportHeight - modalHeight - viewportPad);
    if (top > maxTop) top = maxTop;
    if (top < viewportPad) top = viewportPad;

    overlay.style.setProperty("--history-note-left", `${Math.round(left)}px`);
    overlay.style.setProperty("--history-note-top", `${Math.round(top)}px`);
  }

  function refreshHistoryEntryNoteOverlayPosition() {
    if (!historyEntryNoteAnchorTaskId) return;
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay || overlay.style.display === "none") return;
    positionHistoryEntryNoteOverlay(historyEntryNoteAnchorTaskId);
  }

  function clearHistoryEntryNoteOverlayPosition() {
    historyEntryNoteAnchorTaskId = "";
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay) return;
    overlay.style.removeProperty("--history-note-left");
    overlay.style.removeProperty("--history-note-top");
  }

  function isHistoryEntryNoteOverlayOpen() {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    return !!overlay && overlay.style.display !== "none";
  }

  function closeHistoryEntryNoteOverlay(opts?: { preservePosition?: boolean }) {
    if (!opts?.preservePosition) clearHistoryEntryNoteOverlayPosition();
    closeOverlay(els.historyEntryNoteOverlay as HTMLElement | null);
  }

  function isHistoryChartInteractionTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest?.(".historyCanvasWrap");
  }

  function openHistoryEntryNoteOverlay(
    taskId: string,
    displayEntry: any,
    rangeMode: "entries" | "day" = "entries",
    lockedAbsIndexes?: Set<number> | null
  ) {
    const payload = getHistoryEntryNoteOverlayPayload(taskId, displayEntry, rangeMode, lockedAbsIndexes);
    const notes = payload.notes;
    const groups = payload.groups;
    const hasGroups = groups.length > 0;
    const totalNoteCount = hasGroups ? groups.reduce((sum, group) => sum + group.notes.length, 0) : notes.length;
    if (!totalNoteCount) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    if (els.historyEntryNoteTitle) els.historyEntryNoteTitle.textContent = "Task Notes";
    if (els.historyEntryNoteMeta) els.historyEntryNoteMeta.textContent = "";
    if (els.historyEntryNoteBody) {
      els.historyEntryNoteBody.innerHTML = hasGroups
        ? groups
            .map(
              (group, index) => `<section class="historyEntryNoteGroup${
                index < groups.length - 1 ? " historyEntryNoteGroup-spaced" : ""
              }">
                ${group.headerText ? `<div class="historyEntryNoteGroupHeader">${escapeHtmlUI(group.headerText)}</div>` : ""}
                ${renderHistoryEntryNoteItems(group.notes)}
              </section>`
            )
            .join("")
        : renderHistoryEntryNoteItems(notes);
    }
    historyEntryNoteAnchorTaskId = taskId;
    openOverlay(els.historyEntryNoteOverlay as HTMLElement | null);
    requestAnimationFrame(() => {
      refreshHistoryEntryNoteOverlayPosition();
    });
  }

  function syncHistoryEntryNoteOverlayForSelection(taskId: string, state?: HistoryViewState | null) {
    if (historyEntryNoteAnchorTaskId !== taskId) return;
    const nextState = state || ensureHistoryViewState(taskId);
    const lockedIndexes = Array.from(nextState.lockedAbsIndexes.values()).sort((a, b) => a - b);
    if (!lockedIndexes.length) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    const display = getHistoryDisplayForTask(taskId, nextState);
    if (!display.length) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    const displayEntry = display[lockedIndexes[0]];
    if (!displayEntry) {
      closeHistoryEntryNoteOverlay();
      return;
    }
    openHistoryEntryNoteOverlay(taskId, displayEntry, nextState.rangeMode, nextState.lockedAbsIndexes);
  }

  function loadHistoryIntoMemory() {
    const loadedHistory = loadHistory();
    const cleanedHistory = cleanupHistory(loadedHistory);
    historyByTaskId = cleanedHistory;
    if (historySignature(cleanedHistory) !== historySignature(loadedHistory)) {
      saveHistory(historyByTaskId, { showIndicator: false });
    }
  }

  function hasHistoryEntryNotes(history: HistoryByTaskId | null | undefined) {
    return Object.values(history || {}).some(
      (rows) => Array.isArray(rows) && rows.some((row) => typeof row?.note === "string" && row.note.trim())
    );
  }

  function maybeRepairHistoryNotesInCloud() {
    if (historyNoteCloudRepairAttempted) return;
    if (!currentUid()) return;
    if (!hasHistoryEntryNotes(historyByTaskId)) return;
    historyNoteCloudRepairAttempted = true;
    saveHistory(historyByTaskId, { showIndicator: false });
  }

  function loadHistoryRangePrefs() {
    historyRangeDaysByTaskId = {};
    historyRangeModeByTaskId = {};
    const taskUi = cloudTaskUiCache || loadCachedTaskUi();
    if (!taskUi) return;
    Object.keys(taskUi.historyRangeDaysByTaskId || {}).forEach((taskId) => {
      const value = (taskUi.historyRangeDaysByTaskId as any)[taskId];
      historyRangeDaysByTaskId[taskId] = value === 14 ? 14 : 7;
    });
    Object.keys(taskUi.historyRangeModeByTaskId || {}).forEach((taskId) => {
      const value = (taskUi.historyRangeModeByTaskId as any)[taskId];
      historyRangeModeByTaskId[taskId] = value === "day" ? "day" : "entries";
    });
  }

  function saveHistoryRangePref(taskId: string, rangeDays: 7 | 14) {
    if (!taskId) return;
    historyRangeDaysByTaskId[taskId] = rangeDays;
    persistTaskUiToCloud();
  }

  function saveHistoryRangeModePref(taskId: string, rangeMode: "entries" | "day") {
    if (!taskId) return;
    historyRangeModeByTaskId[taskId] = rangeMode;
    persistTaskUiToCloud();
  }

  function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
    const raw = String(value || "").trim();
    if (raw === "currentWeek" || raw === "past30" || raw === "currentMonth") return raw;
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

  function collectDashboardPanelMeta() {
    const out = [] as Array<{ panel: HTMLElement; panelId: string; label: string }>;
    const heroPanel = document.querySelector(
      '#appPageDashboard .dashboardHeroPanel[data-dashboard-panel-id]'
    ) as HTMLElement | null;
    if (heroPanel) {
      const panelId = String(heroPanel.getAttribute("data-dashboard-panel-id") || "").trim();
      if (panelId) {
        const titleEl = heroPanel.querySelector(".dashboardHeroTitle") as HTMLElement | null;
        const title = String(titleEl?.textContent || "").trim();
        const ariaLabel = String(heroPanel.getAttribute("aria-label") || "").trim();
        out.push({
          panel: heroPanel,
          panelId,
          label: title || ariaLabel || panelId,
        });
      }
    }
    const grid = els.dashboardGrid;
    if (!grid) return out;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const panel = el as HTMLElement;
      const panelId = String(panel.getAttribute("data-dashboard-id") || "").trim();
      if (!panelId) return;
      const customLabel = String(panel.getAttribute("data-dashboard-label") || "").trim();
      const titleEl = panel.querySelector(".dashboardCardTitle") as HTMLElement | null;
      const title = String(titleEl?.textContent || "").trim();
      const ariaLabel = String(panel.getAttribute("aria-label") || "").trim();
      out.push({
        panel,
        panelId,
        label: customLabel || title || ariaLabel || panelId,
      });
    });
    return out;
  }

  function getDashboardCardVisibilityMapForStorage() {
    const out: Record<string, boolean> = {};
    collectDashboardPanelMeta().forEach(({ panelId }) => {
      out[panelId] = dashboardCardVisibility[panelId] !== false;
    });
    return out;
  }

  function getDashboardCategoryMeta() {
    return getVisibleDashboardModes().map((mode) => ({
      mode,
      label: getModeLabel(mode),
    }));
  }

  function isDashboardCardVisible(cardId: string) {
    return dashboardCardVisibility[cardId] !== false;
  }

  function syncDashboardPanelMenuState() {
    const menuList = els.dashboardPanelMenuList;
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
    Array.from(menuList.querySelectorAll("input[data-dashboard-panel-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      const panelId = String(checkbox.getAttribute("data-dashboard-panel-id") || "");
      const isVisible = isDashboardCardVisible(panelId);
      checkbox.checked = isVisible;
      checkbox.disabled = isVisible && visibleCount <= 1;
    });
    const categoryMeta = getDashboardCategoryMeta();
    const includedCount = categoryMeta.reduce((count, row) => (isDashboardModeIncluded(row.mode) ? count + 1 : count), 0);
    Array.from(menuList.querySelectorAll("input[data-dashboard-category-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      const modeAttr = String(checkbox.getAttribute("data-dashboard-category-id") || "").trim();
      const mode = modeAttr === "mode2" || modeAttr === "mode3" ? modeAttr : "mode1";
      const isIncluded = isDashboardModeIncluded(mode);
      checkbox.checked = isIncluded;
      checkbox.disabled = isIncluded && includedCount <= 1;
    });
  }

  function renderDashboardPanelMenu() {
    const menuList = els.dashboardPanelMenuList;
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    const categories = getDashboardCategoryMeta();
    menuList.innerHTML = "";
    if (!categories.length && !meta.length) return;
    const appendSectionTitle = (title: string) => {
      const heading = document.createElement("div");
      heading.className = "dashboardPanelMenuSectionTitle";
      heading.textContent = title;
      menuList.appendChild(heading);
    };
    if (categories.length) {
      appendSectionTitle("Categories");
      categories.forEach(({ mode, label }) => {
        const row = document.createElement("label");
        row.className = "dashboardPanelMenuItem";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-dashboard-category-id", mode);
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        menuList.appendChild(row);
      });
    }
    if (meta.length) {
      if (categories.length) {
        const divider = document.createElement("div");
        divider.className = "dashboardPanelMenuDivider";
        divider.setAttribute("aria-hidden", "true");
        menuList.appendChild(divider);
      }
      appendSectionTitle("Panels");
      meta.forEach(({ panelId, label }) => {
        const row = document.createElement("label");
        row.className = "dashboardPanelMenuItem";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-dashboard-panel-id", panelId);
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        menuList.appendChild(row);
      });
    }
    syncDashboardPanelMenuState();
  }

  function closeDashboardPanelMenu() {
    if (els.dashboardPanelMenu) els.dashboardPanelMenu.open = false;
  }

  function saveDashboardWidgetState(partialWidgets: Record<string, unknown>) {
    const dashboard = cloudDashboardCache || loadCachedDashboard();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const existingOrder = Array.isArray(dashboard?.order) ? dashboard!.order : getCurrentDashboardOrder();
    const widgets = {
      ...existingWidgets,
      ...partialWidgets,
      cardVisibility: getDashboardCardVisibilityMapForStorage(),
      includedModes: getDashboardIncludedModesMapForStorage(),
    };
    cloudDashboardCache = { order: existingOrder, widgets };
    saveCloudDashboard(cloudDashboardCache);
  }

  function applyDashboardCardVisibility() {
    const meta = collectDashboardPanelMeta();
    if (!meta.length) return;
    let visibleCount = 0;
    meta.forEach(({ panelId }) => {
      if (isDashboardCardVisible(panelId)) visibleCount += 1;
    });
    if (visibleCount <= 0) {
      const fallbackPanelId = meta[0].panelId;
      dashboardCardVisibility[fallbackPanelId] = true;
      visibleCount = 1;
    }
    meta.forEach(({ panel, panelId }) => {
      panel.style.display = isDashboardCardVisible(panelId) ? "" : "none";
    });
    syncDashboardPanelMenuState();
  }

  function loadDashboardWidgetState() {
    const dashboard = cloudDashboardCache || loadCachedDashboard();
    const widgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    dashboardAvgRange = sanitizeDashboardAvgRange((widgets as any).avgSessionByTaskRange);
    dashboardTimelineDensity = sanitizeDashboardTimelineDensity((widgets as any).timelineDensity);
    const nextSizes: Record<string, DashboardCardSize> = {};
    const rawSizes = (widgets as any).cardSizes;
    if (rawSizes && typeof rawSizes === "object") {
      Object.entries(rawSizes as Record<string, unknown>).forEach(([cardId, size]) => {
        const nextSize = sanitizeDashboardCardSize(size, cardId);
        if (!cardId || !nextSize) return;
        nextSizes[cardId] = nextSize;
      });
    }
    dashboardCardSizes = nextSizes;
    const nextVisibility: Record<string, boolean> = {};
    const rawVisibility = (widgets as any).cardVisibility;
    if (rawVisibility && typeof rawVisibility === "object") {
      Object.entries(rawVisibility as Record<string, unknown>).forEach(([cardId, visible]) => {
        if (!cardId) return;
        if (typeof visible !== "boolean") return;
        nextVisibility[cardId] = visible;
      });
    }
    dashboardCardVisibility = nextVisibility;
    const nextIncludedModes: Record<MainMode, boolean> = { mode1: true, mode2: true, mode3: true };
    const rawIncludedModes = (widgets as any).includedModes;
    if (rawIncludedModes && typeof rawIncludedModes === "object") {
      (["mode1", "mode2", "mode3"] as MainMode[]).forEach((mode) => {
        if (typeof (rawIncludedModes as Record<string, unknown>)[mode] === "boolean") {
          nextIncludedModes[mode] = (rawIncludedModes as Record<string, boolean>)[mode];
        }
      });
    }
    dashboardIncludedModes = nextIncludedModes;
    ensureDashboardIncludedModesValid();
  }

  function saveDashboardAvgRange(range: DashboardAvgRange) {
    dashboardAvgRange = sanitizeDashboardAvgRange(range);
    saveDashboardWidgetState({
      avgSessionByTaskRange: dashboardAvgRange,
    });
  }

  function saveDashboardTimelineDensity(value: DashboardTimelineDensity) {
    dashboardTimelineDensity = sanitizeDashboardTimelineDensity(value);
    saveDashboardWidgetState({
      timelineDensity: dashboardTimelineDensity,
    });
  }

  function canUseCompactDashboardCardSize(cardId: string) {
    return (
      cardId === "streak" ||
      cardId === "week-hours" ||
      cardId === "weekly-time-goals" ||
      cardId === "tasks-completed"
    );
  }

  function sanitizeDashboardCardSize(value: unknown, cardId?: string | null): DashboardCardSize | null {
    if (value === "full" || value === "half" || value === "quarter") return value;
    if (value === "eighth" && canUseCompactDashboardCardSize(String(cardId || "").trim())) return value;
    return null;
  }

  function getDashboardCardSizeMapForStorage() {
    const out: Record<string, DashboardCardSize> = {};
    Object.entries(dashboardCardSizes || {}).forEach(([cardId, size]) => {
      if (!cardId) return;
      const nextSize = sanitizeDashboardCardSize(size, cardId);
      if (nextSize) out[cardId] = nextSize;
    });
    return out;
  }

  function applyDashboardCardSizes() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const size = sanitizeDashboardCardSize(dashboardCardSizes[cardId], cardId);
      if (size) card.setAttribute("data-dashboard-size", size);
      else card.removeAttribute("data-dashboard-size");
    });
  }

  function ensureDashboardCardSizeControls() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      if (card.querySelector(".dashboardSizeControl")) return;
      const cardId = String(card.getAttribute("data-dashboard-id") || "").trim();
      const compactSizeOption = canUseCompactDashboardCardSize(cardId)
        ? `
          <button class="dashboardSizeOption" type="button" data-dashboard-size="eighth" role="menuitemradio" aria-checked="false">Compact</button>`
        : "";
      const control = document.createElement("div");
      control.className = "dashboardSizeControl";
      control.innerHTML = `
        <button class="iconBtn dashboardSizeBtn" type="button" data-dashboard-size-toggle="true" aria-label="Panel size options" title="Panel size options" aria-expanded="false">
          <span class="dashboardSizeGlyph" aria-hidden="true"></span>
        </button>
        <div class="dashboardSizeMenu" data-dashboard-size-menu="true" role="menu" aria-label="Panel size options">
          <button class="dashboardSizeOption" type="button" data-dashboard-size="full" role="menuitemradio" aria-checked="false">Full width</button>
          <button class="dashboardSizeOption" type="button" data-dashboard-size="half" role="menuitemradio" aria-checked="false">Half width</button>
          <button class="dashboardSizeOption" type="button" data-dashboard-size="quarter" role="menuitemradio" aria-checked="false">Quarter width</button>
          ${compactSizeOption}
        </div>
      `;
      card.prepend(control);
    });
  }

  function syncDashboardCardSizeControlState() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const selectedSize = sanitizeDashboardCardSize(dashboardCardSizes[cardId], cardId);
      const toggle = card.querySelector("[data-dashboard-size-toggle]") as HTMLButtonElement | null;
      const menuOpen = card.classList.contains("isSizeMenuOpen");
      if (toggle) toggle.setAttribute("aria-expanded", menuOpen ? "true" : "false");
      Array.from(card.querySelectorAll(".dashboardSizeOption[data-dashboard-size]")).forEach((btn) => {
        const option = btn as HTMLButtonElement;
        const optionSize = sanitizeDashboardCardSize(option.getAttribute("data-dashboard-size"), cardId);
        const isSelected = !!optionSize && !!selectedSize && optionSize === selectedSize;
        option.classList.toggle("isOn", isSelected);
        option.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    });
  }

  function closeDashboardCardSizeMenus() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard.isSizeMenuOpen")).forEach((el) => {
      (el as HTMLElement).classList.remove("isSizeMenuOpen");
    });
    syncDashboardCardSizeControlState();
  }

  function applyOrderedDashboardCards(grid: HTMLElement, order: string[] | null | undefined) {
    if (!Array.isArray(order) || !order.length) return;
    const cards = Array.from(grid.querySelectorAll(".dashboardCard")) as HTMLElement[];
    if (!cards.length) return;
    const byId = new Map<string, HTMLElement>();
    cards.forEach((card) => {
      const id = card.getAttribute("data-dashboard-id");
      if (id) byId.set(id, card);
    });
    const ordered: HTMLElement[] = [];
    const seen = new Set<string>();
    order.forEach((idRaw) => {
      const id = String(idRaw || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const card = byId.get(id);
      if (card) ordered.push(card);
    });
    const unordered = cards.filter((card) => {
      const id = card.getAttribute("data-dashboard-id") || "";
      return !seen.has(id);
    });
    [...ordered, ...unordered].forEach((card) => grid.appendChild(card));
  }

  function applyDashboardOrderFromStorage() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const dashboard = cloudDashboardCache || loadCachedDashboard();
    const order = Array.isArray(dashboard?.order) ? dashboard?.order : [];
    if (!order.length) return;
    applyOrderedDashboardCards(grid, order);
  }

  function saveDashboardOrder() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const order = getCurrentDashboardOrder();
    const dashboard = cloudDashboardCache || loadCachedDashboard();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const widgets = {
      ...existingWidgets,
      cardSizes: getDashboardCardSizeMapForStorage(),
      cardVisibility: getDashboardCardVisibilityMapForStorage(),
    };
    cloudDashboardCache = { order, widgets };
    saveCloudDashboard(cloudDashboardCache);
  }

  function getCurrentDashboardOrder() {
    const grid = els.dashboardGrid;
    if (!grid) return [] as string[];
    return Array.from(grid.querySelectorAll(".dashboardCard"))
      .map((el) => (el as HTMLElement).getAttribute("data-dashboard-id") || "")
      .filter(Boolean);
  }

  function applyDashboardOrder(order: string[] | null | undefined) {
    const grid = els.dashboardGrid;
    if (!grid || !Array.isArray(order) || !order.length) return;
    applyOrderedDashboardCards(grid, order);
  }

  function beginDashboardEditMode() {
    if (dashboardEditMode) return;
    dashboardOrderDraftBeforeEdit = getCurrentDashboardOrder();
    dashboardCardSizesDraftBeforeEdit = { ...dashboardCardSizes };
    dashboardEditMode = true;
    applyDashboardEditMode();
  }

  function cancelDashboardEditMode() {
    if (!dashboardEditMode) return;
    if (dashboardOrderDraftBeforeEdit && dashboardOrderDraftBeforeEdit.length) {
      applyDashboardOrder(dashboardOrderDraftBeforeEdit);
    }
    dashboardCardSizes = dashboardCardSizesDraftBeforeEdit ? { ...dashboardCardSizesDraftBeforeEdit } : {};
    applyDashboardCardSizes();
    dashboardEditMode = false;
    dashboardOrderDraftBeforeEdit = null;
    dashboardCardSizesDraftBeforeEdit = null;
    applyDashboardEditMode();
  }

  function commitDashboardEditMode() {
    if (!dashboardEditMode) return;
    saveDashboardOrder();
    dashboardEditMode = false;
    dashboardOrderDraftBeforeEdit = null;
    dashboardCardSizesDraftBeforeEdit = null;
    applyDashboardEditMode();
    if (currentAppPage === "dashboard") {
      renderDashboardWidgets();
    }
  }

  function applyDashboardEditMode() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    ensureDashboardCardSizeControls();
    if (!dashboardEditMode) closeDashboardCardSizeMenus();
    grid.classList.toggle("isEditMode", dashboardEditMode);
    Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
      (el as HTMLElement).setAttribute("draggable", dashboardEditMode ? "true" : "false");
    });
    syncDashboardCardSizeControlState();
    if (els.dashboardEditBtn) {
      els.dashboardEditBtn.classList.toggle("isOn", dashboardEditMode);
      (els.dashboardEditBtn as HTMLElement).style.display = dashboardEditMode ? "none" : "inline-flex";
    }
    if (els.dashboardEditCancelBtn) (els.dashboardEditCancelBtn as HTMLElement).style.display = dashboardEditMode ? "inline-flex" : "none";
    if (els.dashboardEditDoneBtn) (els.dashboardEditDoneBtn as HTMLElement).style.display = dashboardEditMode ? "inline-flex" : "none";
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

  function sanitizeModeLabel(value: unknown, fallback: string) {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return fallback;
    return raw.slice(0, 10);
  }
  function getModeLabel(mode: MainMode) {
    return modeLabels[mode] || DEFAULT_MODE_LABELS[mode];
  }
  function getModeColor(mode: MainMode) {
    return DEFAULT_MODE_COLORS[mode];
  }
  function applyModeAccent(mode: MainMode) {
    document.documentElement.style.setProperty("--mode-accent", getModeColor(mode));
    document.documentElement.style.setProperty("--mode1-accent", getModeColor("mode1"));
    document.documentElement.style.setProperty("--mode2-accent", getModeColor("mode2"));
    document.documentElement.style.setProperty("--mode3-accent", getModeColor("mode3"));
  }

  function isModeEnabled(mode: MainMode) {
    if (mode === "mode1") return true;
    return !!modeEnabled[mode];
  }

  function syncModeLabelsUi() {
    if (els.mode1Btn) els.mode1Btn.textContent = getModeLabel("mode1");
    if (els.mode2Btn) els.mode2Btn.textContent = getModeLabel("mode2");
    if (els.mode3Btn) els.mode3Btn.textContent = getModeLabel("mode3");
    if (els.modeSwitchCurrentLabel) els.modeSwitchCurrentLabel.textContent = getModeLabel(currentMode);
    if (els.mode2Btn) els.mode2Btn.disabled = !isModeEnabled("mode2");
    if (els.mode3Btn) els.mode3Btn.disabled = !isModeEnabled("mode3");
    if (els.mode1Btn) els.mode1Btn.setAttribute("aria-checked", String(currentMode === "mode1"));
    if (els.mode2Btn) els.mode2Btn.setAttribute("aria-checked", String(currentMode === "mode2"));
    if (els.mode3Btn) els.mode3Btn.setAttribute("aria-checked", String(currentMode === "mode3"));
    if (els.editMoveMode1) els.editMoveMode1.textContent = getModeLabel("mode1");
    if (els.editMoveMode2) els.editMoveMode2.textContent = getModeLabel("mode2");
    if (els.editMoveMode3) els.editMoveMode3.textContent = getModeLabel("mode3");
    if (els.categoryMode1Input) els.categoryMode1Input.value = getModeLabel("mode1");
    if (els.categoryMode2Input) els.categoryMode2Input.value = getModeLabel("mode2");
    if (els.categoryMode3Input) els.categoryMode3Input.value = getModeLabel("mode3");
    els.categoryMode2Toggle?.classList.toggle("on", isModeEnabled("mode2"));
    els.categoryMode2Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode2")));
    els.categoryMode3Toggle?.classList.toggle("on", isModeEnabled("mode3"));
    els.categoryMode3Toggle?.setAttribute("aria-checked", String(isModeEnabled("mode3")));
    if (els.categoryMode2ToggleLabel) {
      els.categoryMode2ToggleLabel.textContent = isModeEnabled("mode2") ? "Disable Category 2" : "Enable Category 2";
    }
    if (els.categoryMode3ToggleLabel) {
      els.categoryMode3ToggleLabel.textContent = isModeEnabled("mode3") ? "Disable Category 3" : "Enable Category 3";
    }
    if (els.categoryMode2Row) (els.categoryMode2Row as HTMLElement).style.display = isModeEnabled("mode2") ? "block" : "none";
    if (els.categoryMode3Row) (els.categoryMode3Row as HTMLElement).style.display = isModeEnabled("mode3") ? "block" : "none";
    if (els.editMoveMode2) els.editMoveMode2.classList.toggle("is-disabled", !isModeEnabled("mode2"));
    if (els.editMoveMode3) els.editMoveMode3.classList.toggle("is-disabled", !isModeEnabled("mode3"));
    ensureDashboardIncludedModesValid();
    renderDashboardPanelMenu();
    if (currentAppPage === "dashboard") renderDashboardWidgets();
  }

  function saveModeSettings() {
    persistPreferencesToCloud();
  }

  function loadModeLabels() {
    modeLabels = { ...DEFAULT_MODE_LABELS };
    modeEnabled = { ...DEFAULT_MODE_ENABLED };
    try {
      const parsed = (cloudPreferencesCache || loadCachedPreferences())?.modeSettings;
      if (parsed && typeof parsed === "object") {
        modeLabels.mode1 = sanitizeModeLabel((parsed as any).mode1?.label, DEFAULT_MODE_LABELS.mode1);
        modeLabels.mode2 = sanitizeModeLabel((parsed as any).mode2?.label, DEFAULT_MODE_LABELS.mode2);
        modeLabels.mode3 = sanitizeModeLabel((parsed as any).mode3?.label, DEFAULT_MODE_LABELS.mode3);
        modeEnabled.mode2 = !!(parsed as any).mode2?.enabled;
        modeEnabled.mode3 = !!(parsed as any).mode3?.enabled;
        return;
      }
      modeLabels = { ...DEFAULT_MODE_LABELS };
      modeEnabled = { ...DEFAULT_MODE_ENABLED };
    } catch {
      // ignore
    }
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

  function exportHistoryManagerCsv() {
    const rows: string[] = [];
    rows.push(["taskId", "taskName", "entryName", "ts", "dateTimeIso", "ms", "color", "note"].join(","));

    const taskIds = Object.keys(historyByTaskId || {});
    taskIds.sort((a, b) => {
      const ai = tasks.findIndex((t) => String(t.id || "") === String(a));
      const bi = tasks.findIndex((t) => String(t.id || "") === String(b));
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return String(a).localeCompare(String(b));
    });

    taskIds.forEach((taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? (historyByTaskId[taskId] || []).slice() : [];
      if (!entries.length) return;
      entries.sort((a: any, b: any) => (+a.ts || 0) - (+b.ts || 0));
      const taskMeta = getTaskMetaForHistoryId(taskId);
      const taskName = String(taskMeta?.name || "").trim() || "Task";
      entries.forEach((entry: any) => {
        const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
        const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
        if (ts <= 0) return;
        const dateTimeIso = new Date(ts).toISOString();
        const entryName = String(entry?.name || "").trim() || taskName;
        const color = entry?.color == null ? "" : String(entry.color);
        const note = getHistoryEntryNote(entry);
        rows.push(
          [
            csvEscape(taskId),
            csvEscape(taskName),
            csvEscape(entryName),
            csvEscape(ts),
            csvEscape(dateTimeIso),
            csvEscape(ms),
            csvEscape(color),
            csvEscape(note),
          ].join(",")
        );
      });
    });

    const d = new Date();
    const y = d.getFullYear();
    const mo = formatTwo(d.getMonth() + 1);
    const da = formatTwo(d.getDate());
    const hh = formatTwo(d.getHours());
    const mi = formatTwo(d.getMinutes());
    const ss = formatTwo(d.getSeconds());
    const filename = `tasktimer-history-${y}${mo}${da}-${hh}${mi}${ss}.csv`;
    downloadCsvFile(filename, rows.join("\n"));
  }

  function importHistoryManagerCsvFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = parseCsvRows(text);
      if (!parsed.length) {
        alert("The CSV file is empty.");
        return;
      }

      const header = parsed[0].map((v, idx) => {
        const raw = String(v || "");
        const noBom = idx === 0 ? raw.replace(/^\uFEFF/, "") : raw;
        return noBom.trim().toLowerCase();
      });
      const idxTaskId = header.indexOf("taskid");
      const idxTaskName = header.indexOf("taskname");
      const idxEntryName = header.indexOf("entryname");
      const idxTs = header.indexOf("ts");
      const idxMs = header.indexOf("ms");
      const idxColor = header.indexOf("color");
      const idxNote = header.indexOf("note");
      if (idxTaskId < 0 || idxTs < 0 || idxMs < 0) {
        alert("Invalid CSV format. Expected columns: taskId, ts, ms.");
        return;
      }

      const nextHistory: HistoryByTaskId = { ...(historyByTaskId || {}) };
      const seenByTask = new Map<string, Set<string>>();
      Object.keys(nextHistory).forEach((taskId) => {
        const set = new Set<string>();
        const arr = Array.isArray(nextHistory[taskId]) ? nextHistory[taskId] : [];
        arr.forEach((entry) => {
          set.add(`${Math.floor(+entry.ts || 0)}|${Math.floor(+entry.ms || 0)}|${String(entry.name || "")}`);
        });
        seenByTask.set(taskId, set);
      });

      let imported = 0;
      let skipped = 0;

      parsed.slice(1).forEach((row) => {
        const taskId = String(row[idxTaskId] || "").trim();
        if (!taskId) {
          skipped += 1;
          return;
        }
        const ts = Math.floor(Number(row[idxTs] || 0));
        const ms = Math.floor(Number(row[idxMs] || 0));
        if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(ms) || ms < 0) {
          skipped += 1;
          return;
        }
        const task = tasks.find((t) => String(t.id || "") === taskId);
        const taskName = String(row[idxTaskName] || "").trim();
        const entryNameRaw = idxEntryName >= 0 ? String(row[idxEntryName] || "").trim() : "";
        const entryName = entryNameRaw || taskName || String(task?.name || "").trim() || "Task";
        const color = idxColor >= 0 ? String(row[idxColor] || "").trim() : "";
        const note = idxNote >= 0 ? String(row[idxNote] || "").trim() : "";
        const key = `${ts}|${ms}|${entryName}`;

        let seen = seenByTask.get(taskId);
        if (!seen) {
          seen = new Set<string>();
          seenByTask.set(taskId, seen);
        }
        if (seen.has(key)) {
          skipped += 1;
          return;
        }

        if (!Array.isArray(nextHistory[taskId])) nextHistory[taskId] = [];
        nextHistory[taskId].push({
          ts,
          ms,
          name: entryName,
          ...(color ? { color } : {}),
          ...(note ? { note } : {}),
        });
        seen.add(key);
        imported += 1;
      });

      if (imported <= 0) {
        alert("No valid history rows were imported.");
        return;
      }

      Object.keys(nextHistory).forEach((taskId) => {
        if (!Array.isArray(nextHistory[taskId])) return;
        nextHistory[taskId].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      });
      historyByTaskId = nextHistory;
      saveHistory(historyByTaskId);
      render();
      renderHistoryManager();
      alert(`Imported ${imported} row(s).${skipped ? ` Skipped ${skipped} duplicate/invalid row(s).` : ""}`);
    };
    reader.onerror = () => alert("Could not read the CSV file.");
    reader.readAsText(file);
  }

  function parseHistoryGenTimeToMinute(value: string): number | null {
    const raw = String(value || "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatHistoryGenMinute(minute: number): string {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minute || 0)));
    const hh = Math.floor(clamped / 60);
    const mm = clamped % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function readHistoryManagerGenerateParamsFromConfirm(): HistoryGenParams | null {
    const host = els.confirmText as HTMLElement | null;
    if (!host) return null;
    const selectedTaskIds = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-history-gen-task-id]:checked')
    )
      .map((el) => String(el.getAttribute("data-history-gen-task-id") || "").trim())
      .filter(Boolean);
    if (!selectedTaskIds.length) {
      alert("Select at least one task.");
      return null;
    }

    const daysBack = Math.floor(Number((host.querySelector("#historyGenDaysBack") as HTMLInputElement | null)?.value || 0));
    if (!Number.isFinite(daysBack) || daysBack <= 0) {
      alert("Enter a valid date range in days (greater than 0).");
      return null;
    }

    const entriesPerDayMin = Math.floor(
      Number((host.querySelector("#historyGenEntriesMin") as HTMLInputElement | null)?.value || 0)
    );
    const entriesPerDayMax = Math.floor(
      Number((host.querySelector("#historyGenEntriesMax") as HTMLInputElement | null)?.value || 0)
    );
    if (!Number.isFinite(entriesPerDayMin) || !Number.isFinite(entriesPerDayMax) || entriesPerDayMin <= 0 || entriesPerDayMax <= 0) {
      alert("Entries per day must be positive numbers.");
      return null;
    }
    if (entriesPerDayMin > entriesPerDayMax) {
      alert("Entries/day minimum cannot be greater than maximum.");
      return null;
    }

    const startRaw = (host.querySelector("#historyGenStartTime") as HTMLInputElement | null)?.value || "";
    const endRaw = (host.querySelector("#historyGenEndTime") as HTMLInputElement | null)?.value || "";
    const windowStartMinute = parseHistoryGenTimeToMinute(startRaw);
    const windowEndMinute = parseHistoryGenTimeToMinute(endRaw);
    if (windowStartMinute == null || windowEndMinute == null || windowStartMinute >= windowEndMinute) {
      alert("Enter a valid time window where start is earlier than end.");
      return null;
    }

    return {
      taskIds: selectedTaskIds,
      daysBack,
      entriesPerDayMin,
      entriesPerDayMax,
      windowStartMinute,
      windowEndMinute,
      replaceExisting: !!els.confirmDeleteAll?.checked,
    };
  }

  function buildHistoryManagerTestDataPreview(params: HistoryGenParams): HistoryGenPreview {
    const cloneHistory: HistoryByTaskId = {};
    if (!params.replaceExisting) {
      Object.keys(historyByTaskId || {}).forEach((taskId) => {
        cloneHistory[taskId] = Array.isArray(historyByTaskId[taskId]) ? (historyByTaskId[taskId] || []).slice() : [];
      });
    }
    const nextHistory: HistoryByTaskId = cloneHistory;

    const taskOrderById = new Map<string, number>();
    (tasks || []).forEach((task, idx) => {
      const taskId = String(task.id || "").trim();
      if (taskId) taskOrderById.set(taskId, idx);
    });
    const selectedTasks = params.taskIds
      .map((taskId) => tasks.find((task) => String(task.id || "").trim() === String(taskId)))
      .filter((task): task is Task => !!task);
    const perTaskCount: Record<string, number> = {};
    selectedTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      perTaskCount[taskId] = 0;
      if (!Array.isArray(nextHistory[taskId])) nextHistory[taskId] = [];
    });

    const unitToMinute = (task: Task) => {
      if (task.milestoneTimeUnit === "day") return 24 * 60;
      if (task.milestoneTimeUnit === "minute") return 1;
      return 60;
    };
    const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let totalGenerated = 0;

    for (let dayOffset = params.daysBack - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(todayLocal);
      day.setDate(todayLocal.getDate() - dayOffset);

      selectedTasks.forEach((task) => {
        const taskId = String(task.id || "").trim();
        if (!taskId) return;
        const taskIdx = taskOrderById.get(taskId) || 0;
        const sessions = randInt(params.entriesPerDayMin, params.entriesPerDayMax);
        const milestonesMinutes = sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : [])
          .map((m) => Math.floor(Math.max(0, Number(m.hours || 0)) * unitToMinute(task)))
          .filter((m) => m > 0);

        for (let i = 0; i < sessions; i += 1) {
          const windowMinute = randInt(params.windowStartMinute, params.windowEndMinute - 1);
          const tsDate = new Date(day);
          tsDate.setHours(0, 0, 0, 0);
          const ts = tsDate.getTime() + windowMinute * 60_000 + i * 37_000 + taskIdx * 1_000;

          let durationMinutes = 0;
          if (milestonesMinutes.length) {
            const target = milestonesMinutes[(dayOffset + i + taskIdx) % milestonesMinutes.length];
            const variance = Math.max(5, Math.floor(target * 0.2));
            durationMinutes = Math.max(5, target + randInt(-variance, variance));
          } else {
            const baseMinutes = 18 + ((taskIdx * 7) % 35);
            const varianceMinutes = Math.floor(Math.random() * 55);
            durationMinutes = Math.max(5, baseMinutes + varianceMinutes);
          }

          const ms = durationMinutes * 60 * 1000;
          nextHistory[taskId].push({
            ts,
            name: String(task.name || "").trim() || "Task",
            ms,
            color: sessionColorForTaskMs(task, ms),
          });
          perTaskCount[taskId] += 1;
          totalGenerated += 1;
        }
      });
    }

    Object.keys(nextHistory).forEach((taskId) => {
      const arr = Array.isArray(nextHistory[taskId]) ? nextHistory[taskId] : [];
      arr.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      nextHistory[taskId] = arr;
    });

    return {
      params,
      perTaskCount,
      totalGenerated,
      nextHistory,
    };
  }

  async function applyHistoryManagerTestData(preview: HistoryGenPreview): Promise<void> {
    historyByTaskId = preview.nextHistory;
    await saveHistoryAndWait(historyByTaskId);
    render();
    renderHistoryManager();
    alert(`Generated ${preview.totalGenerated} test history entries.`);
  }

  function openHistoryManagerGeneratePreviewDialog(preview: HistoryGenPreview) {
    const perTaskRows = Object.entries(preview.perTaskCount)
      .map(([taskId, count]) => {
        const taskName = String(tasks.find((task) => String(task.id || "") === String(taskId))?.name || taskId || "Task").trim();
        return `<li><b>${escapeHtmlUI(taskName)}</b>: ${count}</li>`;
      })
      .join("");
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (preview.params.daysBack - 1));
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    confirm("Preview Test Data", "", {
      okLabel: "Generate",
      cancelLabel: "Cancel",
      textHtml: `
        <div class="hmGenConfirm">
          <p style="margin:0 0 8px;">Selected tasks: <b>${preview.params.taskIds.length}</b></p>
          <p style="margin:0 0 8px;">Date span: <b>${escapeHtmlUI(startDate.toLocaleDateString())}</b> to <b>${escapeHtmlUI(
            endDate.toLocaleDateString()
          )}</b> (${preview.params.daysBack} days)</p>
          <p style="margin:0 0 8px;">Entries/day: <b>${preview.params.entriesPerDayMin}</b> to <b>${
            preview.params.entriesPerDayMax
          }</b></p>
          <p style="margin:0 0 8px;">Entry window: <b>${formatHistoryGenMinute(preview.params.windowStartMinute)}</b> to <b>${formatHistoryGenMinute(
            preview.params.windowEndMinute
          )}</b></p>
          <p style="margin:0 0 8px;">Replace existing: <b>${preview.params.replaceExisting ? "Yes" : "No"}</b></p>
          <p style="margin:0 0 8px;">Total generated: <b>${preview.totalGenerated}</b></p>
          <ul style="margin:0; padding-left:20px;">${perTaskRows || "<li>No tasks</li>"}</ul>
        </div>
      `,
      onOk: () => {
        void applyHistoryManagerTestData(preview);
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function openHistoryManagerGenerateConfigDialog() {
    const taskList = (tasks || []).filter((task) => String(task.id || "").trim());
    if (!taskList.length) {
      alert("Add at least one task before generating test history.");
      return;
    }
    const taskOptions = taskList
      .map((task) => {
        const taskId = String(task.id || "").trim();
        const taskName = String(task.name || "").trim() || "Task";
        return `<label class="hmGenTaskRow" style="display:flex; align-items:center; gap:8px; margin:4px 0;">
          <input type="checkbox" data-history-gen-task-id="${escapeHtmlUI(taskId)}" />
          <span>${escapeHtmlUI(taskName)}</span>
        </label>`;
      })
      .join("");

    confirm("Generate Test Data", "", {
      okLabel: "Preview",
      cancelLabel: "Cancel",
      checkboxLabel: "Replace existing history",
      checkboxChecked: true,
      textHtml: `
        <div class="hmGenConfirm">
          <div style="margin:0 0 8px;"><b>Select tasks</b></div>
          <div id="historyGenTaskList" style="max-height:180px; overflow:auto; border:1px solid var(--line, rgba(255,255,255,.14)); border-radius:10px; padding:8px;">
            ${taskOptions}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Days back</span>
              <input id="historyGenDaysBack" type="number" min="1" max="3650" value="90" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Entries/day min</span>
              <input id="historyGenEntriesMin" type="number" min="1" max="1000" value="1" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Entries/day max</span>
              <input id="historyGenEntriesMax" type="number" min="1" max="1000" value="3" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Start time</span>
              <input id="historyGenStartTime" type="time" value="06:00" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>End time</span>
              <input id="historyGenEndTime" type="time" value="20:00" />
            </label>
          </div>
        </div>
      `,
      onOk: () => {
        const params = readHistoryManagerGenerateParamsFromConfirm();
        if (!params) return;
        const preview = buildHistoryManagerTestDataPreview(params);
        openHistoryManagerGeneratePreviewDialog(preview);
      },
      onCancel: () => closeConfirm(),
    });
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
    closeOverlay(els.menuOverlay as HTMLElement | null);
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

  function getTimeGoalReminderDelayMs() {
    return 60 * 60 * 1000;
  }

  function getTimeGoalCompleteDurationMinutes() {
    const value = Math.max(0, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "0") || 0));
    if (!(value > 0)) return 0;
    if (timeGoalCompleteDurationUnit === "minute") {
      return timeGoalCompleteDurationPeriod === "day" ? value : value * 7;
    }
    return timeGoalCompleteDurationPeriod === "day" ? value * 60 : value * 60 * 7;
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
    if (els.timeGoalCompleteNoteTitle) {
      els.timeGoalCompleteNoteTitle.textContent = `${String(task.name || "Task")} Notes`;
    }
    if (els.timeGoalCompleteNoteText) {
      els.timeGoalCompleteNoteText.textContent = "Add a note for this saved session before the timer resets.";
    }
    if (els.timeGoalCompleteNoteInput) {
      els.timeGoalCompleteNoteInput.value = getFocusSessionDraft(taskId);
    }
    persistPendingTimeGoalFlow(task, "note");
    openOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  function maybeRestorePendingTimeGoalFlow() {
    const pending = loadPendingTimeGoalFlow();
    if (pending) {
      const task = tasks.find((row) => String(row.id || "") === pending.taskId) || null;
      if (!shouldKeepTimeGoalCompletionFlow(task, pending.frozenElapsedMs)) {
        clearPendingTimeGoalFlow();
        if (pending.taskId) clearTaskTimeGoalFlow(pending.taskId);
        return;
      }
      if (!task) return;
      if (String(timeGoalModalTaskId || "") !== pending.taskId || !(Number(timeGoalModalFrozenElapsedMs || 0) > 0)) {
        openTimeGoalCompleteModal(task, pending.frozenElapsedMs || getTaskElapsedMs(task), { reminder: pending.reminder });
      }
      if (pending.step === "saveNote") {
        openTimeGoalSaveNoteChoice(task);
      } else if (pending.step === "note") {
        openTimeGoalNoteModal(task);
      }
      return;
    }
    if (String(timeGoalModalTaskId || "").trim()) return;
    const overdueTask = tasks.find((row) => !!row?.running && shouldKeepTimeGoalCompletionFlow(row));
    if (!overdueTask) return;
    openTimeGoalCompleteModal(overdueTask, getTaskElapsedMs(overdueTask), { reminder: true });
  }

  function syncTimeGoalModalWithTaskState() {
    const activeTaskId = String(timeGoalModalTaskId || "").trim();
    if (!activeTaskId) return;
    const task = tasks.find((row) => String(row.id || "") === activeTaskId) || null;
    if (shouldKeepTimeGoalCompletionFlow(task, timeGoalModalFrozenElapsedMs)) return;
    clearTaskTimeGoalFlow(activeTaskId);
    closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
  }

  async function resolveTimeGoalCompletion(task: Task, opts: { logHistory: boolean }) {
    const taskId = String(task.id || "");
    const sessionNote = captureResetActionSessionNote(taskId);
    if (sessionNote) setFocusSessionDraft(taskId, sessionNote);
    resetTaskStateImmediate(task, { logHistory: opts.logHistory, sessionNote });
    clearTaskTimeGoalFlow(taskId);
    closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
    closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
    closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
    if (opts.logHistory) {
      try {
        await saveHistoryAndWait(historyByTaskId);
      } catch {
        // Keep locally logged history when cloud sync is unavailable.
      }
    }
    save();
    void syncSharedTaskSummariesForTask(taskId).catch(() => {});
    render();
    openDeferredFocusModeTimeGoalModal();
  }

  function resumeTaskAfterTimeGoalModal(task: Task) {
    const taskId = String(task.id || "").trim();
    if (!taskId || timeGoalModalTaskId !== taskId) return;
    const frozenElapsedMs = Math.max(0, Math.floor(Number(timeGoalModalFrozenElapsedMs || 0) || 0));
    task.accumulatedMs = frozenElapsedMs;
    task.startMs = nowMs();
    task.running = true;
    task.hasStarted = true;
    timeGoalModalTaskId = null;
    timeGoalModalFrozenElapsedMs = 0;
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
    saveHistory(historyByTaskId);
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
    if (!els.taskList) return;

    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    els.taskList.innerHTML = "";
    const useTileColumns = taskView === "tile";
    const tileColumnCount = useTileColumns ? getTileColumnCount() : 1;
    currentTileColumnCount = tileColumnCount;
    if (useTileColumns) {
      els.taskList.setAttribute("data-tile-columns", String(tileColumnCount));
    } else {
      els.taskList.removeAttribute("data-tile-columns");
    }
    const modeTasks = tasks.filter((t) => taskModeOf(t) === currentMode);
    const activeTaskIds = new Set(modeTasks.map((t) => String(t.id || "")));
    syncTaskFlipStatesForVisibleTasks(activeTaskIds);
    for (const taskId of Array.from(pinnedHistoryTaskIds)) {
      if (activeTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
    }
    for (const taskId of Array.from(openHistoryTaskIds)) {
      if (!activeTaskIds.has(taskId)) {
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    let visibleTaskIndex = 0;
    tasks.forEach((t, index) => {
      if (taskModeOf(t) !== currentMode) return;
      const elapsedMs = getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;

      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
      const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
      const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
      const timeGoalSec = hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0;
      const maxSec = Math.max(maxValue * milestoneUnitSec(t), timeGoalSec, 1);
      const pct = hasMilestones || hasTimeGoal ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

      const taskEl = document.createElement("div");
      const taskId = String(t.id || "");
      const hasActiveToastForTask = !!activeCheckpointToast?.taskId && String(activeCheckpointToast.taskId) === taskId;
      const suppressedCheckpointAlert = !isFocusModeFilteringAlerts() ? getSuppressedFocusModeAlert(taskId) : null;
      taskEl.className =
        "task" +
        (t.collapsed ? " collapsed" : "") +
        ((checkpointRepeatActiveTaskId && checkpointRepeatActiveTaskId === String(t.id || "")) || hasActiveToastForTask
          ? " taskAlertPulse"
          : "");
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = String(t.id || "");
      taskEl.setAttribute("draggable", "true");

      const collapseLabel = t.collapsed ? "Show progress bar" : "Hide progress bar";

      let progressHTML = "";
      if (hasMilestones || hasTimeGoal) {
        let markers = "";
        const unitSuffix = milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;

        const nextPendingIndex = msSorted.findIndex((m) => elapsedSec < (+m.hours || 0) * milestoneUnitSec(t));
        const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, msSorted.length - 1);

        msSorted.forEach((m, msIdx) => {
          const val = +m.hours || 0;
          const secTarget = val * milestoneUnitSec(t);
          const left = Math.max(0, Math.min((secTarget / maxSec) * 100, 100));
          const reached = elapsedSec >= secTarget;
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${val}${unitSuffix}`;
          const desc = (m.description || "").trim();
          const edgeCls = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
          const leftPos = edgeCls === "mkEdgeL" ? 0 : edgeCls === "mkEdgeR" ? 100 : left;
          const wrapCls = edgeCls && label.length > 8 ? "mkWrap8" : "";
          const showCheckpointLabel = msIdx === labelTargetIndex;
          markers += `
            <div class="mkFlag ${cls}" style="left:${leftPos}%"></div>
            ${
              showCheckpointLabel
                ? `<div class="mkTime ${cls} ${edgeCls} ${wrapCls}" style="left:${leftPos}%">${escapeHtmlUI(label)}</div>`
                : ``
            }
            ${
              showCheckpointLabel && desc
                ? `<div class="mkDesc ${cls} ${edgeCls}" style="left:${leftPos}%">${escapeHtmlUI(desc)}</div>`
                : ``
            }`;
        });
        if (hasTimeGoal) {
          const goalLeft = Math.max(0, Math.min((timeGoalSec / maxSec) * 100, 100));
          const goalEdgeCls = goalLeft <= 1 ? "mkEdgeL" : goalLeft >= 99 ? "mkEdgeR" : "";
          const goalLeftPos = goalEdgeCls === "mkEdgeL" ? 0 : goalEdgeCls === "mkEdgeR" ? 100 : goalLeft;
          markers += `
            <div class="mkFlag mkGoal ${elapsedSec >= timeGoalSec ? "mkAch" : "mkPend"} ${goalEdgeCls}" style="left:${goalLeftPos}%"></div>`;
        }

        progressHTML = `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${pct}%;background:${
                  dynamicColorsEnabled ? fillBackgroundForPct(pct) : getModeColor(taskModeOf(t))
                }"></div>
                ${markers}
              </div>
            </div>
          </div>`;
      }

      const showHistory = openHistoryTaskIds.has(taskId);
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const historyHTML = showHistory
        ? `
          <section class="historyInline" aria-label="History for ${escapeHtmlUI(t.name)}">
            <div class="historyTop">
              <div class="historyMeta">
                <div class="historyTitle historyInlineTitle">History</div>
              </div>
              <div class="historyMeta historyTopActions">
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="export" title="Export" aria-label="Export">&#11123;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="analyse" title="Analysis" aria-label="Analysis">&#128269;</button>
                <button class="iconBtn historyActionIconBtn historyTopIconBtn" type="button" data-history-action="manage" title="Manage" aria-label="Manage">&#9881;</button>
                <button class="historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">X</button>
                <button class="historyPinBtn ${isHistoryPinned ? "isOn" : ""}" type="button" data-history-action="pin" title="${
                    isHistoryPinned ? "Unpin chart" : "Pin chart"
                  }" aria-label="${isHistoryPinned ? "Unpin chart" : "Pin chart"}">&#128204;</button>
              </div>
            </div>
            <div class="historyCanvasWrap">
              <canvas class="historyChartInline"></canvas>
            </div>
            <div class="historyTrashRow"></div>
            <div class="historyRangeRow">
              <div class="historyRangeInfo">
                <div class="historyMeta historyRangeText">&nbsp;</div>
                <div class="historyRangeToggleRow" aria-label="History range">
                  <button class="switch historyRangeToggle" type="button" role="switch" aria-checked="false" data-history-range-toggle="true"></button>
                  <button class="historyRangeModePill isOn" type="button" data-history-range-mode="entries" aria-pressed="true">Entries</button>
                  <button class="historyRangeModePill" type="button" data-history-range-mode="day" aria-pressed="false">Day</button>
                </div>
              </div>
              <div class="historyMeta historyRangeActions">
              </div>
            </div>
          </section>
        `
        : "";

      taskEl.innerHTML = `
        <div class="taskFlipScene">
          <div class="taskFace taskFaceFront">
            <div class="taskFaceShell taskFaceShellFront">
            ${
              checkpointRepeatActiveTaskId && checkpointRepeatActiveTaskId === taskId
                ? '<button class="iconBtn checkpointMuteBtn" data-action="muteCheckpointAlert" title="Mute checkpoint alert" aria-label="Mute checkpoint alert">&#128276;</button>'
                : ""
            }
            ${
              suppressedCheckpointAlert
                ? '<button class="iconBtn checkpointMissedAlertBtn" data-action="showSuppressedCheckpointAlert" title="Show missed checkpoint alert" aria-label="Show missed checkpoint alert">&#9888;</button>'
                : ""
            }
            <div class="row">
              <div class="taskHeadMain">
                <div class="name" data-action="editName" title="Open focus mode">${escapeHtmlUI(t.name)}</div>
              </div>
              <div class="time" data-action="focus" title="Open focus mode">${formatMainTaskElapsedHtml(elapsedMs, !!t.running)}</div>
              <div class="actions">
                ${
                  t.running
                    ? '<button class="btn btn-warn small" data-action="stop" title="Stop">Stop</button>'
                    : '<button class="btn btn-accent small" data-action="start" title="Launch">Launch</button>'
                }
                ${
                  themeMode === "cyan"
                    ? `<button class="iconBtn" data-action="reset" title="${
                        t.running ? "Stop task to reset" : "Reset"
                      }" aria-label="${t.running ? "Stop task to reset" : "Reset"}" ${t.running ? "disabled" : ""}>&#10227;</button>`
                    : `<button class="iconBtn" data-action="reset" title="${
                        t.running ? "Stop task to reset" : "Reset"
                      }" aria-label="${t.running ? "Stop task to reset" : "Reset"}" ${t.running ? "disabled" : ""}>&#10227;</button>`
                }
                <button class="iconBtn" data-action="edit" title="Edit">&#9998;</button>
                <button class="iconBtn historyActionBtn ${showHistory || isHistoryPinned ? "isActive" : ""} ${
                  isHistoryPinned ? "isPinned" : ""
                }" data-action="history" title="${
                  isHistoryPinned ? "History pinned" : "History"
                }" aria-pressed="${showHistory || isHistoryPinned ? "true" : "false"}" ${
                  isHistoryPinned ? "disabled" : ""
                }><img src="/Dashboard.svg" alt="" aria-hidden="true" width="18" height="18"></button>
                <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#8942;</button>
              </div>
            </div>
            ${progressHTML}
            ${historyHTML}
            </div>
          </div>
          <div class="taskFace taskFaceBack" aria-hidden="true" inert>
            <div class="taskFaceShell taskFaceShellBack">
            <div class="taskBack">
              <div class="taskBackHead">
                <button class="iconBtn taskFlipBtn taskFlipBackBtn" type="button" data-task-flip="close" title="Back to task" aria-label="Back to task" aria-expanded="false">&#8594;</button>
                <div class="taskBackTitle">${escapeHtmlUI(t.name)}</div>
              </div>
              <div class="taskBackActions">
                <button class="taskMenuItem" data-action="duplicate" title="Duplicate" type="button">Duplicate</button>
                <button class="taskMenuItem" data-action="collapse" title="${escapeHtmlUI(collapseLabel)}" type="button">${escapeHtmlUI(collapseLabel)}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
                <button class="taskMenuItem" data-action="${isTaskSharedByOwner(taskId) ? "unshareTask" : "shareTask"}" title="${isTaskSharedByOwner(taskId) ? "Unshare" : "Share"}" type="button">${isTaskSharedByOwner(taskId) ? "Unshare" : "Share"}</button>
                <button class="taskMenuItem taskMenuItemDelete" data-action="delete" title="Delete" type="button">Delete</button>
              </div>
            </div>
            </div>
          </div>
        </div>
      `;
      applyTaskFlipDomState(taskId, taskEl);

      els.taskList!.appendChild(taskEl);
      visibleTaskIndex += 1;
    });

    save();
    for (const taskId of openHistoryTaskIds) {
      renderHistory(taskId);
    }
    if (currentAppPage === "dashboard") {
      renderDashboardWidgets();
    }
    syncTimeGoalModalWithTaskState();
    maybeRestorePendingTimeGoalFlow();
  }

  function startTask(i: number) {
    const t = tasks[i];
    if (!t || t.running) return;
    clearTaskTimeGoalFlow(String(t.id || ""));
    flushPendingFocusSessionNoteSave(String(t.id || ""));
    awardLaunchXpForTask(t);
    t.running = true;
    t.startMs = nowMs();
    t.hasStarted = true;
    clearCheckpointBaseline(t.id);
    save();
    void syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    render();
    if (autoFocusOnTaskLaunchEnabled && String(focusModeTaskId || "") !== String(t.id || "")) {
      openFocusMode(i);
    }
  }

  function stopTask(i: number) {
    const t = tasks[i];
    if (!t || !t.running) return;
    clearTaskTimeGoalFlow(String(t.id || ""));
    flushPendingFocusSessionNoteSave(String(t.id || ""));
    t.accumulatedMs = getElapsedMs(t);
    t.running = false;
    t.startMs = null;
    clearCheckpointBaseline(t.id);
    save();
    void syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
    render();
  }

  function getTileColumnCount() {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1200px)").matches) return 3;
    if (window.matchMedia("(min-width: 720px)").matches) return 2;
    return 1;
  }

  function resetTaskStateImmediate(t: Task, opts?: { logHistory?: boolean; sessionNote?: string }) {
    if (!t) return;
    const taskId = String(t.id || "");
    flushPendingFocusSessionNoteSave(taskId);
    if (!!opts?.logHistory && canLogSession(t)) {
      const ms = getTaskElapsedMs(t);
      const completedAtMs = nowMs();
      if (ms > 0) appendCompletedSessionHistory(t, completedAtMs, ms, opts?.sessionNote);
    }
    t.accumulatedMs = 0;
    t.running = false;
    t.startMs = null;
    t.hasStarted = false;
    t.xpDisqualifiedUntilReset = false;
    clearTaskTimeGoalFlow(taskId);
    resetCheckpointAlertTracking(t.id);
    checkpointAutoResetDirty = true;
    clearFocusSessionDraft(taskId);
    if (String(focusModeTaskId || "") === taskId) {
      syncFocusSessionNotesInput(taskId);
      syncFocusSessionNotesAccordion(taskId);
    }
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

  function updateFocusInsights(t: Task) {
    const taskId = String(t.id || "");
    const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    const insights = computeFocusInsights(entries as Array<{ ts: number; ms: number }>, nowMs());
    if (els.focusInsightBest) els.focusInsightBest.textContent = insights.bestMs > 0 ? formatTime(insights.bestMs) : "--";

    if (els.focusInsightWeekday) {
      if (!insights.weekdayName || insights.weekdaySessionCount <= 0) {
        els.focusInsightWeekday.textContent = "No logged sessions yet";
        els.focusInsightWeekday.classList.add("is-empty");
      } else {
        const sessionLabel = insights.weekdaySessionCount === 1 ? "session" : "sessions";
        els.focusInsightWeekday.textContent = `${insights.weekdayName} (${insights.weekdaySessionCount} ${sessionLabel})`;
        els.focusInsightWeekday.classList.remove("is-empty");
      }
    }
    setFocusInsightDeltaValue(els.focusInsightTodayDelta as HTMLElement | null, insights.todayDeltaMs);
    setFocusInsightDeltaValue(els.focusInsightWeekDelta as HTMLElement | null, insights.weekDeltaMs);
  }

  function toggleCollapse(i: number) {
    const t = tasks[i];
    if (!t) return;
    t.collapsed = !t.collapsed;
    save();
    render();
  }

  function openHistory(i: number) {
    const t = tasks[i];
    if (!t) return;
    const taskId = String(t.id || "");
    if (openHistoryTaskIds.has(taskId)) {
      closeHistory(taskId);
      return;
    }
    openHistoryTaskIds.add(taskId);
    ensureHistoryViewState(taskId);
    render();
  }

  function closeHistory(taskId?: string) {
    if (!taskId || historyEntryNoteAnchorTaskId === taskId) closeHistoryEntryNoteOverlay();
    if (taskId) {
      const state = historyViewByTaskId[taskId];
      if (state?.selectionClearTimer != null) {
        window.clearTimeout(state.selectionClearTimer);
      }
      if (state?.selectionAnimRaf != null) {
        window.cancelAnimationFrame(state.selectionAnimRaf);
      }
      openHistoryTaskIds.delete(taskId);
      delete historyViewByTaskId[taskId];
    } else {
      openHistoryTaskIds.clear();
      Object.keys(historyViewByTaskId).forEach((k) => {
        const state = historyViewByTaskId[k];
        if (state?.selectionClearTimer != null) window.clearTimeout(state.selectionClearTimer);
        if (state?.selectionAnimRaf != null) window.cancelAnimationFrame(state.selectionAnimRaf);
        delete historyViewByTaskId[k];
      });
    }
    render();
  }

  function getHistoryForTask(taskId: string) {
    const arr = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    return arr.slice().sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0));
  }

  function historyPageSize(taskId?: string) {
    if (!taskId) return 7;
    const state = historyViewByTaskId[taskId];
    return state?.rangeDays || 7;
  }

  function ensureHistoryViewState(taskId: string): HistoryViewState {
    const existing = historyViewByTaskId[taskId];
    if (existing) return existing;
    const savedRangeDays = historyRangeDaysByTaskId[taskId] === 14 ? 14 : 7;
    const savedRangeMode = historyRangeModeByTaskId[taskId] === "day" ? "day" : "entries";
    const created: HistoryViewState = {
      page: 0,
      rangeDays: savedRangeDays,
      rangeMode: savedRangeMode,
      editMode: false,
      barRects: [],
      labelHitRects: [],
      lockedAbsIndexes: new Set<number>(),
      selectedAbsIndex: null,
      selectedRelIndex: null,
      selectionClearTimer: null,
      visualSelectedAbsIndex: null,
      selectionZoom: 1,
      selectionAnimRaf: null,
      slideDir: null,
    };
    historyViewByTaskId[taskId] = created;
    return created;
  }

  function startHistorySelectionAnimation(taskId: string, nextAbsIndex: number | null) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }

    const prevAbsIndex = state.visualSelectedAbsIndex;
    const switchingTarget = prevAbsIndex !== nextAbsIndex;
    const fromZoom = switchingTarget ? (nextAbsIndex == null ? state.selectionZoom : 1) : state.selectionZoom;
    const toZoom = nextAbsIndex == null ? 1 : 1.5;
    const durationMs = 180;
    const startAt = performance.now();

    if (nextAbsIndex != null) state.visualSelectedAbsIndex = nextAbsIndex;

    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - startAt) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      state.selectionZoom = fromZoom + (toZoom - fromZoom) * eased;
      renderHistory(taskId);
      if (t < 1) {
        state.selectionAnimRaf = window.requestAnimationFrame(tick);
      } else {
        state.selectionAnimRaf = null;
        state.selectionZoom = toZoom;
        if (nextAbsIndex == null) state.visualSelectedAbsIndex = null;
        renderHistory(taskId);
      }
    };

    state.selectionAnimRaf = window.requestAnimationFrame(tick);
  }

  function scheduleHistorySelectionClear(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectionClearTimer = window.setTimeout(() => {
      const next = historyViewByTaskId[taskId];
      if (!next) return;
      next.selectedAbsIndex = null;
      next.selectedRelIndex = null;
      next.selectionClearTimer = null;
      startHistorySelectionAnimation(taskId, null);
    }, 3000);
  }

  function clearHistoryChartSelection(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    state.selectedRelIndex = null;
    state.selectedAbsIndex = null;
    state.lockedAbsIndexes.clear();
    syncHistoryEntryNoteOverlayForSelection(taskId, state);
    startHistorySelectionAnimation(taskId, null);
  }

  function resetHistoryChartSelectionToDefault(taskId: string) {
    if (!taskId) return;
    const state = ensureHistoryViewState(taskId);
    if (state.selectionClearTimer != null) {
      window.clearTimeout(state.selectionClearTimer);
      state.selectionClearTimer = null;
    }
    if (state.selectionAnimRaf != null) {
      window.cancelAnimationFrame(state.selectionAnimRaf);
      state.selectionAnimRaf = null;
    }
    state.selectedRelIndex = null;
    state.selectedAbsIndex = null;
    state.lockedAbsIndexes.clear();
    state.visualSelectedAbsIndex = null;
    state.selectionZoom = 1;
    if (historyEntryNoteAnchorTaskId === taskId) closeHistoryEntryNoteOverlay();
    if (currentAppPage === "tasks" && openHistoryTaskIds.has(taskId)) renderHistory(taskId);
  }

  function resetAllOpenHistoryChartSelections() {
    Array.from(openHistoryTaskIds).forEach((taskId) => {
      resetHistoryChartSelectionToDefault(taskId);
    });
  }

  function clearHistoryLockedSelections(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    state.lockedAbsIndexes.clear();
    syncHistoryEntryNoteOverlayForSelection(taskId, state);
  }

  type HistoryUI = {
    root: HTMLElement;
    canvasWrap: HTMLElement | null;
    canvas: HTMLCanvasElement | null;
    clearLocksBtn: HTMLButtonElement | null;
    rangeText: HTMLElement | null;
    olderBtn: HTMLButtonElement | null;
    newerBtn: HTMLButtonElement | null;
    trashRow: HTMLElement | null;
    deleteBtn: HTMLButtonElement | null;
  };

  function getHistoryUi(taskId: string): HistoryUI | null {
    if (!els.taskList) return null;
    const root = els.taskList.querySelector(`.task[data-task-id="${taskId}"] .historyInline`) as HTMLElement | null;
    if (!root) return null;
    return {
      root,
      canvasWrap: root.querySelector(".historyCanvasWrap"),
      canvas: root.querySelector(".historyChartInline"),
      clearLocksBtn: root.querySelector('[data-history-action="clearLocks"]'),
      rangeText: root.querySelector(".historyRangeText"),
      olderBtn: root.querySelector('[data-history-action="older"]'),
      newerBtn: root.querySelector('[data-history-action="newer"]'),
      trashRow: root.querySelector(".historyTrashRow"),
      deleteBtn: root.querySelector('[data-history-action="delete"]'),
    };
  }

  function renderHistoryTrashRow(slice: any[], absStartIndex: number, ui: HistoryUI) {
    if (!ui.trashRow) return;
    const taskId = ui.root.closest(".task")?.getAttribute("data-task-id") || "";
    const state = ensureHistoryViewState(taskId);

    if (!state.editMode) {
      ui.trashRow.style.display = "none";
      ui.trashRow.innerHTML = "";
      return;
    }

    ui.trashRow.style.display = "flex";

    const pageSize = historyPageSize(taskId);
    const buttons: string[] = [];

    for (let i = 0; i < pageSize; i++) {
      const e = slice[i];
      const absIndex = absStartIndex + i;
      const disabled = !e;

      buttons.push(
        `<button class="historyTrashBtn" type="button" data-abs="${absIndex}" ${
          disabled ? "disabled" : ""
        } aria-label="Delete log" title="Delete log">&#128465;</button>`
      );
    }

    ui.trashRow.innerHTML = buttons.join("");
  }

  function drawHistoryChart(entries: any[], absStartIndex: number, ui: HistoryUI, taskId: string) {
    const canvas = ui.canvas;
    const wrap = ui.canvasWrap;
    if (!canvas || !wrap) return;
    const state = ensureHistoryViewState(taskId);

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Match the drawing coordinate space to the actual rendered canvas size so
    // click hit-testing lines up with the visible columns.
    const w = Math.floor(rect.width || wrap.clientWidth || canvas.clientWidth || 0);
    const h = Math.floor(rect.height || wrap.clientHeight || canvas.clientHeight || 0);
    if (w <= 0 || h <= 0) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const compactLabels = w <= 560;
    const veryCompactLabels = w <= 420;
    const padL = 12;
    const markerLabelPadR = 10;
    const padR = 12;
    const padT = 14;
    const barCount = Math.max(1, entries.length);
    const slotCount = Math.max(1, historyPageSize(taskId));
    // Keep consistent label styling between 7-entry and 14-entry views.
    const useAngledLabels = true;
    const padB = useAngledLabels ? (veryCompactLabels ? 110 : 122) : compactLabels ? 84 : 72;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const labelGutterW = markerLabelPadR;
    const plotSidePad = useAngledLabels ? (veryCompactLabels ? 10 : 14) : 6;
    const plotW = Math.max(140, innerW - labelGutterW - plotSidePad * 2);
    const plotLeft = padL + plotSidePad;
    const plotRight = plotLeft + plotW;

    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, padT + innerH + 0.5);
    ctx.lineTo(plotRight, padT + innerH + 0.5);
    ctx.stroke();

    state.barRects = [];
    state.labelHitRects = [];

    if (!entries || !entries.length) {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No entries to display", padL + innerW / 2, padT + innerH / 2);
      return;
    }

    const maxEntryMs = Math.max(...entries.map((e) => e.ms || 0), 1);
    const historyTask = tasks.find((task) => String(task.id || "") === taskId) || null;
    const milestoneMs =
      historyTask && historyTask.milestonesEnabled && Array.isArray(historyTask.milestones)
        ? sortMilestones(historyTask.milestones)
            .map((m) => ({ value: +m.hours || 0, ms: Math.max(0, (+m.hours || 0) * milestoneUnitSec(historyTask) * 1000) }))
            .filter((x, i, arr) => x.ms > 0 && arr.findIndex((y) => y.ms === x.ms) === i)
        : [];
    const maxGoalMs = milestoneMs.length ? Math.max(...milestoneMs.map((m) => m.ms || 0), 0) : 0;
    const scaleMaxMs = Math.max(maxEntryMs, maxGoalMs, 1);
    const gap = slotCount <= 10 ? Math.max(6, Math.floor(plotW * 0.02)) : Math.max(3, Math.floor(plotW * 0.01));
    const barW = Math.max(4, Math.floor((plotW - gap * (slotCount - 1)) / slotCount));

    ctx.textAlign = "center";

    const labelStep = useAngledLabels ? 1 : veryCompactLabels ? 2 : barCount <= 10 ? 1 : Math.ceil(barCount / 10);
    for (let idx = 0; idx < barCount; idx++) {
      const e = entries[idx];
      if (!e) continue;

      const ms = Math.max(0, e.ms || 0);
      const ratio = ms / scaleMaxMs;
      const bh = Math.max(2, Math.floor(innerH * ratio));
      const visualRelIndex =
        state.visualSelectedAbsIndex != null ? state.visualSelectedAbsIndex - (absStartIndex || 0) : null;
      const absIndex = (absStartIndex || 0) + idx;
      const isLocked = state.lockedAbsIndexes.has(absIndex);
      const isSelected = visualRelIndex === idx;
      const hasSelection = visualRelIndex != null || state.lockedAbsIndexes.size > 0;
      const baseX = plotLeft + idx * (barW + gap);
      const cx = baseX + barW / 2;
      // Keep bar size static; selection/lock state is indicated by accent borders and label zoom.
      const drawW = Math.max(2, Math.floor(barW));
      const drawH = Math.max(2, Math.min(innerH, Math.floor(bh)));
      const x = Math.max(plotLeft, Math.min(plotRight - drawW, Math.floor(cx - drawW / 2)));
      const y = Math.max(padT, padT + innerH - drawH);

      ctx.save();
      ctx.globalAlpha = hasSelection ? (isSelected || isLocked ? 0.98 : 0.28) : 0.92;
      const historyStaticColor = (() => {
        const t = (tasks || []).find((task) => String(task.id || "") === String(taskId));
        return t ? getModeColor(taskModeOf(t)) : "rgb(0,207,200)";
      })();
      ctx.fillStyle = dynamicColorsEnabled ? e.color || "rgb(0,207,200)" : historyStaticColor;
      ctx.fillRect(x, y, drawW, drawH);
      ctx.restore();

      const slotLeft = idx === 0 ? plotLeft : plotLeft + idx * (barW + gap) - Math.floor(gap / 2);
      const slotRight = idx === barCount - 1 ? plotRight : plotLeft + (idx + 1) * (barW + gap) - Math.floor(gap / 2);
      state.barRects[idx] = {
        x,
        y,
        w: drawW,
        h: drawH,
        absIndex: (absStartIndex || 0) + idx,
        hitX: Math.max(plotLeft, slotLeft),
        hitY: padT,
        hitW: Math.max(4, Math.min(plotRight, slotRight) - Math.max(plotLeft, slotLeft)),
        hitH: innerH,
      };

      if (isSelected || isLocked) {
        ctx.save();
        ctx.strokeStyle = isLocked ? "rgba(255,77,77,.95)" : "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, Math.max(1, drawW - 2), Math.max(1, drawH - 2));
        ctx.restore();
      }

      if (idx % labelStep === 0 || idx === barCount - 1) {
        const labelAlpha = hasSelection ? (isSelected || isLocked ? 1 : 0.28) : 1;
        ctx.save();
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = "rgba(255,255,255,.65)";
        const baseDateFont = compactLabels ? 10 : 11;
        const labelFontScale = isSelected ? 1 + ((state.selectionZoom || 1.5) - 1) : isLocked ? 1.5 : 1;
        ctx.font = `${Math.round(baseDateFont * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

        const d = new Date(e.ts || 0);
        const dd = formatTwo(d.getDate());
        const mm = formatTwo(d.getMonth() + 1);
        const hh = formatTwo(d.getHours());
        const mi = formatTwo(d.getMinutes());
        const compactDateLabel = veryCompactLabels ? `${dd}/${mm}` : compactLabels ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}:${hh}:${mi}`;
        const rawElapsedLabel = formatTime(ms);
        const compactElapsedLabel =
          veryCompactLabels && rawElapsedLabel.includes(":")
            ? rawElapsedLabel.split(":").slice(-2).join(":")
            : rawElapsedLabel;

        if (useAngledLabels) {
          const expandedLabelDrop = isSelected || isLocked ? Math.round(10 * labelFontScale) : 0;
          const tx = x + drawW / 2;
          const ty = padT + innerH + (compactLabels ? 20 : 24) + expandedLabelDrop;
          const lineStartX = x + drawW / 2;
          const lineStartY = padT + innerH + 2;
          const lineEndX = tx;
          const lineEndY = ty - 4;
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,.72)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineStartX, lineStartY);
          ctx.lineTo(lineEndX, lineEndY);
          ctx.stroke();
          ctx.restore();
          const angle = (-45 * Math.PI) / 180;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(angle);
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.font = `${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactDateLabel, 0, 0);
          ctx.fillStyle = "rgb(0,207,200)";
          ctx.font = `700 ${Math.round((veryCompactLabels ? 9 : 10) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactElapsedLabel, 0, Math.round(12 * labelFontScale));
          ctx.restore();
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((veryCompactLabels ? 30 : 34) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: tx - labelHitW / 2,
            y: ty - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
        } else {
          const lx = x + drawW / 2;
          const expandedLabelDrop = isSelected || isLocked ? Math.round(8 * labelFontScale) : 0;
          const line1Y = padT + innerH + (compactLabels ? 18 : 22) + expandedLabelDrop;
          const line2Y = padT + innerH + (compactLabels ? 34 : 39) + expandedLabelDrop;
          ctx.fillText(compactDateLabel, lx, line1Y);
          ctx.fillStyle = "rgb(0,207,200)";
          ctx.font = `700 ${Math.round((compactLabels ? 10 : 12) * labelFontScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(compactElapsedLabel, lx, line2Y);
          const labelHitW = Math.max(24, Math.round(barW * (isSelected || isLocked ? 1.5 : 1.15)));
          const labelHitH = Math.max(24, Math.round((compactLabels ? 28 : 32) * (isSelected || isLocked ? 1.2 : 1)));
          state.labelHitRects[idx] = {
            x: lx - labelHitW / 2,
            y: line1Y - 10,
            w: labelHitW,
            h: labelHitH,
            absIndex: (absStartIndex || 0) + idx,
          };
        }
        ctx.restore();
      }
    }

    if (milestoneMs.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.lineWidth = 1;

      const sortedGoals = milestoneMs.slice().sort((a, b) => b.ms - a.ms);
      const drawnLabelY: number[] = [];
      const minLabelGap = 11;

      for (const goal of sortedGoals) {
        const markerRatio = Math.max(0, Math.min(1, goal.ms / scaleMaxMs));
        const markerY = padT + innerH - Math.floor(innerH * markerRatio) + 0.5;

        ctx.beginPath();
        ctx.moveTo(plotLeft, markerY);
        ctx.lineTo(plotRight, markerY);
        ctx.stroke();

        const tooClose = drawnLabelY.some((y) => Math.abs(y - markerY) < minLabelGap);
        if (tooClose) continue;
        drawnLabelY.push(markerY);

        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${goal.value}${milestoneUnitSuffix(historyTask || undefined)}`, padL + innerW - 4, markerY);
      }
      ctx.restore();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
    }
  }

  function renderDashboardWidgets(opts?: { includeAvgSession?: boolean }) {
    renderDashboardStreakCard();
    renderDashboardOverviewChart();
    renderDashboardTodayHoursCard();
    renderDashboardWeeklyGoalsCard();
    renderDashboardTimelineCard();
    renderDashboardFocusTrend();
    renderDashboardModeDistribution();
    if (opts?.includeAvgSession !== false) renderDashboardAvgSessionChart();
    renderDashboardHeatCalendar();
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
      const startMs = Math.floor(Number(task.startMs) || 0);
      if (!Number.isFinite(startMs) || startMs <= 0 || startMs > nowValue) return sum;
      return sum + Math.max(0, nowValue - startMs);
    }, 0);

    const projectedMs = loggedMs + runningMs;
    const progressPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((loggedMs / totalGoalMs) * 100))) : 0;
    const projectedPct = totalGoalMs > 0 ? Math.max(0, Math.min(100, Math.round((projectedMs / totalGoalMs) * 100))) : 0;
    const showProjectionMarker = totalGoalMs > 0 && runningMs > 0;
    const projectedDeltaPct = showProjectionMarker ? Math.max(0, projectedPct - progressPct) : 0;
    if (valueEl) valueEl.textContent = formatDashboardDurationShort(loggedMs);
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

  function renderDashboardTodayHoursCard() {
    const titleEl = document.getElementById("dashboardTodayHoursTitle") as HTMLElement | null;
    const valueEl = document.getElementById("dashboardTodayHoursValue") as HTMLElement | null;
    const deltaEl = document.getElementById("dashboardTodayHoursDelta") as HTMLElement | null;
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

    let todayMs = 0;
    let yesterdaySameTimeMs = 0;
    includedTaskIds.forEach((taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
      entries.forEach((entry: any) => {
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = Math.max(0, Number(entry?.ms) || 0);
        if (!Number.isFinite(ts) || ms <= 0) return;
        const entryDayKey = localDayKey(ts);
        if (entryDayKey === todayKey) todayMs += ms;
        else if (entryDayKey === yesterdayKey && ts <= yesterdaySameTimeCutoffMs) yesterdaySameTimeMs += ms;
      });
    });

    if (titleEl) titleEl.textContent = "Today";
    if (valueEl) valueEl.textContent = formatDashboardDurationShort(todayMs);
    if (!deltaEl) return;

    deltaEl.classList.remove("positive", "negative");
    if (todayMs <= 0 && yesterdaySameTimeMs <= 0) {
      deltaEl.textContent = "No time logged today";
      return;
    }
    if (yesterdaySameTimeMs <= 0) {
      deltaEl.textContent = todayMs > 0 ? "New activity vs this time yesterday" : "0% vs this time yesterday";
      if (todayMs > 0) deltaEl.classList.add("positive");
      return;
    }

    const deltaPct = Math.round((Math.abs(todayMs - yesterdaySameTimeMs) / yesterdaySameTimeMs) * 100);
    if (todayMs > yesterdaySameTimeMs) {
      deltaEl.textContent = `+${deltaPct}% vs this time yesterday`;
      deltaEl.classList.add("positive");
      return;
    }
    if (todayMs < yesterdaySameTimeMs) {
      deltaEl.textContent = `-${deltaPct}% vs this time yesterday`;
      deltaEl.classList.add("negative");
      return;
    }
    deltaEl.textContent = "0% vs this time yesterday";
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
    const minimumDistinctDays = showWeekendRoutine ? 2 : 3;
    const bucketSizeMinutes = 180;
    const minimumSessionMs = 10 * 60 * 1000;
    const bucketMap = new Map<
      number,
      Map<
        string,
        {
          taskName: string;
          distinctDayKeys: Set<string>;
          totalMs: number;
          sessionCount: number;
          weightedMinuteSum: number;
        }
      >
    >();
    const matchedDayKeys = new Set<string>();

    getDashboardFilteredTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
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
        if (isWeekendEntry !== showWeekendRoutine) return;
        const dayKey = localDayKey(midpointMs);
        matchedDayKeys.add(dayKey);
        const minuteOfDay =
          midpointDate.getHours() * 60 +
          midpointDate.getMinutes() +
          midpointDate.getSeconds() / 60;
        const bucketIndex = Math.max(0, Math.min(7, Math.floor(minuteOfDay / bucketSizeMinutes)));
        let bucket = bucketMap.get(bucketIndex);
        if (!bucket) {
          bucket = new Map();
          bucketMap.set(bucketIndex, bucket);
        }
        let stats = bucket.get(taskId);
        if (!stats) {
          stats = {
            taskName,
            distinctDayKeys: new Set<string>(),
            totalMs: 0,
            sessionCount: 0,
            weightedMinuteSum: 0,
          };
          bucket.set(taskId, stats);
        }
        stats.distinctDayKeys.add(dayKey);
        stats.totalMs += ms;
        stats.sessionCount += 1;
        stats.weightedMinuteSum += minuteOfDay * ms;
      });
    });

    const items = Array.from(bucketMap.entries())
      .map(([bucketIndex, taskMap]) => {
        const ranked = Array.from(taskMap.entries())
          .map(([taskId, stats]) => ({
            taskId,
            taskName: stats.taskName,
            distinctDays: stats.distinctDayKeys.size,
            totalMs: stats.totalMs,
            sessionCount: stats.sessionCount,
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
        return {
          ...winner,
          bucketIndex,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .sort((a, b) => a.suggestedMinute - b.suggestedMinute)
      .slice(0, targetCount);

    if (!items.length) {
      listEl.innerHTML = "";
      if (noteEl) {
        noteEl.textContent = matchedDayKeys.size
          ? `Not enough recent ${showWeekendRoutine ? "weekend" : "weekday"} history to suggest a routine yet`
          : `No ${showWeekendRoutine ? "weekend" : "weekday"} history found in the last 30 days`;
      }
      if (cardEl) {
        cardEl.setAttribute(
          "aria-description",
          `Timeline suggestions unavailable. ${showWeekendRoutine ? "Weekend" : "Weekday"} history is too sparse.`
        );
      }
      if (!shouldHoldDashboardWidget("timeline", false)) {
        dashboardWidgetHasRenderedData.timeline = false;
      }
      return;
    }

    if (shouldHoldDashboardWidget("timeline", true)) return;

    listEl.innerHTML = items
      .map((item) => {
        const hours = Math.floor(item.suggestedMinute / 60);
        const minutes = item.suggestedMinute % 60;
        const timeText = `${formatTwo(hours)}:${formatTwo(minutes)}`;
        const title = `${timeText} ${item.taskName}. Seen on ${item.distinctDays} day${
          item.distinctDays === 1 ? "" : "s"
        } in the last 30 days.`;
        return `<li title="${escapeHtmlUI(title)}"><span>${escapeHtmlUI(timeText)}</span><p>${escapeHtmlUI(item.taskName)}</p></li>`;
      })
      .join("");
    if (noteEl) {
      noteEl.textContent = `${items.length} ${showWeekendRoutine ? "weekend" : "weekday"} suggestion${
        items.length === 1 ? "" : "s"
      } from the last 30 days`;
    }
    if (cardEl) {
      cardEl.setAttribute(
        "aria-description",
        `Timeline suggestions based on ${showWeekendRoutine ? "weekend" : "weekday"} history from the last 30 days. Showing up to ${targetCount} items.`
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
      html.push(
        `<span class="dashboardHeatDayCell${dayMs > 0 ? " isActive" : ""}" data-activity-level="${activityLevel}" role="gridcell" aria-label="${escapeHtmlUI(aria)}" title="${escapeHtmlUI(aria)}"${styleAttr}><span class="dashboardHeatDayNum">${day}</span></span>`
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
    const card = canvas?.closest(".dashboardAvgSessionCard") as HTMLElement | null;
    const rangeBtns = Array.from((card || document).querySelectorAll("[data-dashboard-avg-range]")) as HTMLElement[];
    const rangeLabelEl = document.getElementById("dashboardAvgRangeMenuLabel") as HTMLElement | null;
    const range = sanitizeDashboardAvgRange(dashboardAvgRange);
    dashboardAvgRange = range;

    if (titleEl) titleEl.textContent = `Avg Session by Task (${dashboardAvgRangeLabel(range)})`;
    if (rangeLabelEl) rangeLabelEl.textContent = dashboardAvgRangeLabel(range);
    rangeBtns.forEach((btn) => {
      const isOn = btn.getAttribute("data-dashboard-avg-range") === range;
      btn.classList.toggle("isOn", isOn);
      btn.setAttribute("aria-checked", String(isOn));
    });

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
    if (!taskId) return;
    const ui = getHistoryUi(taskId);
    if (!ui) return;
    const state = ensureHistoryViewState(taskId);

    const allRaw = getHistoryForTask(taskId);
    const rangeDays = state.rangeDays || 7;
    const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
    const all = allRaw.filter((e: any) => (+e.ts || 0) >= cutoffMs);
    const distinctDayCount = new Set(all.map((e: any) => historyLocalDateKey(e?.ts))).size;
    const pageSize = historyPageSize(taskId);
    const isDayMode = state.rangeMode === "day";
    const groupedByDay: Array<any> = [];
    if (isDayMode) {
      const historyTask = tasks.find((task) => String(task.id || "") === String(taskId));
      all.forEach((e: any) => {
        const ts = +e.ts || 0;
        const ms = Math.max(0, +e.ms || 0);
        const key = historyLocalDateKey(ts);
        const last = groupedByDay[groupedByDay.length - 1];
        if (last && last.dayKey === key) {
          last.ms += ms;
          last.count += 1;
          if (ts >= last.ts) last.ts = ts;
        } else {
          groupedByDay.push({
            dayKey: key,
            ts,
            ms,
            count: 1,
            color: historyTask ? sessionColorForTaskMs(historyTask as any, ms) : e.color,
          });
        }
      });
    }
    const display = isDayMode ? groupedByDay : all;
    const total = display.length;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 0) state.page = 0;

    const end = Math.max(0, total - state.page * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = display.slice(start, end);

    if (ui.rangeText) {
      if (total === 0) ui.rangeText.textContent = "No entries yet";
      else if (isDayMode) ui.rangeText.textContent = `Showing ${slice.length} of ${total} days (${all.length} entries)`;
      else
        ui.rangeText.textContent = `Showing ${slice.length} of ${total} entries (${distinctDayCount} ${
          distinctDayCount === 1 ? "day" : "days"
        })`;
    }

    if (ui.olderBtn) ui.olderBtn.disabled = start <= 0;
    if (ui.newerBtn) ui.newerBtn.disabled = end >= total;

    if (state.selectedAbsIndex != null) {
      const rel = state.selectedAbsIndex - start;
      if (rel >= 0 && rel < slice.length) state.selectedRelIndex = rel;
      else {
        state.selectedAbsIndex = null;
        state.selectedRelIndex = null;
      }
    } else {
      state.selectedRelIndex = null;
    }
    const hasDeleteTarget = !isDayMode && (state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0);
    if (ui.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTarget;
    if (ui.clearLocksBtn) ui.clearLocksBtn.style.display = state.lockedAbsIndexes.size > 0 ? "inline-flex" : "none";

    if (ui.canvasWrap && state.slideDir) {
      ui.canvasWrap.classList.remove("slideFromLeft", "slideFromRight");
      void ui.canvasWrap.offsetWidth;
      ui.canvasWrap.classList.add(state.slideDir === "left" ? "slideFromRight" : "slideFromLeft");
      state.slideDir = null;
    }

    drawHistoryChart(slice, start, ui, taskId);
    renderHistoryTrashRow(slice, start, ui);
    const rangeToggle = ui.root.querySelector(".historyRangeToggle") as HTMLElement | null;
    if (rangeToggle) {
      const is14 = rangeDays === 14;
      rangeToggle.classList.toggle("on", is14);
      rangeToggle.setAttribute("aria-checked", String(is14));
    }
    const rangeModeEntries = ui.root.querySelector('[data-history-range-mode="entries"]') as HTMLElement | null;
    const rangeModeDay = ui.root.querySelector('[data-history-range-mode="day"]') as HTMLElement | null;
    const isEntriesMode = state.rangeMode !== "day";
    if (rangeModeEntries) {
      rangeModeEntries.classList.toggle("isOn", isEntriesMode);
      rangeModeEntries.setAttribute("aria-pressed", String(isEntriesMode));
    }
    if (rangeModeDay) {
      rangeModeDay.classList.toggle("isOn", !isEntriesMode);
      rangeModeDay.setAttribute("aria-pressed", String(!isEntriesMode));
    }
    const analyseBtn = ui.root.querySelector('[data-history-action="analyse"]') as HTMLButtonElement | null;
    if (analyseBtn) {
      const canAnalyse = state.lockedAbsIndexes.size >= 2;
      analyseBtn.classList.toggle("isDisabled", !canAnalyse);
      analyseBtn.setAttribute("aria-disabled", String(!canAnalyse));
      analyseBtn.title = canAnalyse ? "Analysis" : "Lock at least 2 columns to analyse";
    }
  }

  function getHistoryDisplayForTask(taskId: string, state: HistoryViewState) {
    const allRaw = getHistoryForTask(taskId);
    const rangeDays = state.rangeDays || 7;
    const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
    const all = allRaw.filter((e: any) => (+e.ts || 0) >= cutoffMs);
    if (state.rangeMode !== "day") return all;

    const groupedByDay: Array<any> = [];
    const historyTask = tasks.find((task) => String(task.id || "") === String(taskId));
    all.forEach((e: any) => {
      const ts = +e.ts || 0;
      const ms = Math.max(0, +e.ms || 0);
      const key = historyLocalDateKey(ts);
      const last = groupedByDay[groupedByDay.length - 1];
      if (last && last.dayKey === key) {
        last.ms += ms;
        last.count += 1;
        if (ts >= last.ts) last.ts = ts;
      } else {
        groupedByDay.push({
          dayKey: key,
          ts,
          ms,
          count: 1,
          color: historyTask ? sessionColorForTaskMs(historyTask as any, ms) : e.color,
        });
      }
    });
    return groupedByDay;
  }

  function openHistoryAnalysisModal(taskId: string) {
    const state = ensureHistoryViewState(taskId);
    if (state.lockedAbsIndexes.size < 2) return;
    const display = getHistoryDisplayForTask(taskId, state);
    if (!display.length) return;
    const selected = Array.from(state.lockedAbsIndexes.values())
      .sort((a, b) => a - b)
      .map((idx) => display[idx])
      .filter(Boolean);
    if (selected.length < 2) return;

    const totalMs = selected.reduce((sum, e: any) => sum + Math.max(0, +e.ms || 0), 0);
    const avgMs = Math.floor(totalMs / selected.length);
    const minMs = Math.min(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const maxMs = Math.max(...selected.map((e: any) => Math.max(0, +e.ms || 0)));
    const firstTs = Math.min(...selected.map((e: any) => +e.ts || 0));
    const lastTs = Math.max(...selected.map((e: any) => +e.ts || 0));
    const task = tasks.find((t) => String(t.id || "") === String(taskId));
    const taskName = (task?.name || "Task").trim() || "Task";
    const modeLabel = state.rangeMode === "day" ? "Day" : "Entries";

    if (els.historyAnalysisTitle) {
      els.historyAnalysisTitle.textContent = `History Analysis - ${taskName}`;
    }
    if (els.historyAnalysisSummary) {
      els.historyAnalysisSummary.innerHTML = `
        <p style="margin:0 0 8px">Selected columns: <b>${selected.length}</b> (${modeLabel} view)</p>
        <p style="margin:0 0 8px">Total time: <b>${formatTime(totalMs)}</b></p>
        <p style="margin:0 0 8px">Average: <b>${formatTime(avgMs)}</b></p>
        <p style="margin:0 0 8px">Min / Max: <b>${formatTime(minMs)}</b> / <b>${formatTime(maxMs)}</b></p>
        <p style="margin:0">Range: <b>${formatDateTime(firstTs)}</b> to <b>${formatDateTime(lastTs)}</b></p>
      `;
    }
    openOverlay(els.historyAnalysisOverlay as HTMLElement | null);
  }

  function resetTask(i: number) {
    const t = tasks[i];
    if (!t) return;
    if (t.running) return;
    const shouldExitFocusModeAfterReset = String(focusModeTaskId || "").trim() === String(t.id || "").trim();

    const applyResetTaskConfirmState = () => {
      const shouldLog = !!els.confirmDeleteAll?.checked;
      setResetTaskConfirmBusy(false, shouldLog);
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isResetTaskConfirm");
      if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", shouldLog);
      syncConfirmPrimaryToggleUi();
    };
    const clearResetTaskConfirmState = () => {
      if (els.confirmDeleteAll) els.confirmDeleteAll.onchange = null;
      setResetTaskConfirmBusy(false, false);
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isResetTaskConfirm");
    };

    confirm("Reset Task", "Reset timer to zero?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      checkboxLabel: "Log this entry",
      checkboxChecked: true,
      onOk: async () => {
        const doLog = !!els.confirmDeleteAll?.checked;
        setResetTaskConfirmBusy(true, doLog);
        const sessionNote = captureResetActionSessionNote(String(t.id || ""));
        if (sessionNote) setFocusSessionDraft(String(t.id || ""), sessionNote);
        try {
          resetTaskStateImmediate(t, { logHistory: doLog, sessionNote });
          if (doLog) {
            try {
              await saveHistoryAndWait(historyByTaskId);
            } catch {
              // Keep local logged history when cloud history sync is temporarily unavailable.
            }
          }
          save();
          void syncSharedTaskSummariesForTask(String(t.id || "")).catch(() => {});
          closeConfirm();
          if (shouldExitFocusModeAfterReset) closeFocusMode();
          else render();
        } finally {
          clearResetTaskConfirmState();
        }
      },
      onCancel: () => {
        clearResetTaskConfirmState();
        closeConfirm();
      },
    });

    applyResetTaskConfirmState();
    if (els.confirmDeleteAll) els.confirmDeleteAll.onchange = applyResetTaskConfirmState;
  }

  function resetAll() {
    const eligibleTasks = tasks.filter((t) => canLogSession(t));

    confirm("Reset All", "Reset all timers?", {
      okLabel: "Reset",
      checkboxLabel: "Also delete all tasks",
      checkboxChecked: false,
      checkbox2Label: eligibleTasks.length ? "Log eligible sessions to History" : null,
      checkbox2Checked: eligibleTasks.length ? true : false,
      onOk: () => {
        const alsoDelete = !!els.confirmDeleteAll?.checked;
        const doLog = eligibleTasks.length ? !!els.confirmLogChk?.checked : false;
        const affectedTaskIds = (tasks || []).map((row) => String(row.id || "")).filter(Boolean);
        const uid = String(currentUid() || "");
        const deletedTaskCount = alsoDelete ? (tasks || []).length : 0;

        if (doLog) {
          eligibleTasks.forEach((t) => {
            const ms = getTaskElapsedMs(t);
            if (ms > 0) {
              appendCompletedSessionHistory(t, nowMs(), ms, captureResetActionSessionNote(String(t.id || "")));
            }
          });
        }

        if (alsoDelete) {
          const deletedHistoryEntryCount = Object.values(historyByTaskId || {}).reduce(
            (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
            0
          );
          tasks = [];
          historyByTaskId = {};
          saveHistory(historyByTaskId);
          deletedTaskMeta = {} as DeletedTaskMeta;
          saveDeletedMeta(deletedTaskMeta);
          save();
          if (uid && affectedTaskIds.length) {
            void Promise.all(affectedTaskIds.map((taskId) => deleteSharedTaskSummariesForTask(uid, taskId).catch(() => {})))
              .then(() => refreshOwnSharedSummaries())
              .catch(() => {});
          }
          render();
          closeConfirm();
          confirm(
            "Reset Complete",
            `${deletedTaskCount} task${deletedTaskCount === 1 ? "" : "s"} and ${deletedHistoryEntryCount} history entr${
              deletedHistoryEntryCount === 1 ? "y" : "ies"
            } deleted.`,
            {
              okLabel: "Close",
              cancelLabel: "Done",
              onOk: () => closeConfirm(),
              onCancel: () => closeConfirm(),
            }
          );
          return;
        } else {
          tasks.forEach((t) => {
            t.accumulatedMs = 0;
            t.running = false;
            t.startMs = null;
            t.hasStarted = false;
            t.xpDisqualifiedUntilReset = false;
            resetCheckpointAlertTracking(t.id);
          });
        }

        save();
        if (affectedTaskIds.length) {
          void syncSharedTaskSummariesForTasks(affectedTaskIds).catch(() => {});
        }
        render();
        closeConfirm();
      },
    });
  }

  function openEdit(i: number) {
    const sourceTask = tasks[i];
    if (!sourceTask) return;
    const t = cloneTaskForEdit(sourceTask);
    editIndex = i;
    editTaskDraft = t;

    if (els.editName) els.editName.value = t.name || "";
    setEditTimeGoalEnabled(!!t.timeGoalEnabled);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
    editTaskDurationUnit = t.timeGoalUnit === "minute" ? "minute" : "hour";
    editTaskDurationPeriod = t.timeGoalPeriod === "day" ? "day" : "week";
    syncEditTaskTimeGoalUi(t);

    const elapsedMs = getElapsedMs(t);
    const totalSec = Math.floor(elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const remAfterDays = totalSec % 86400;
    const h = Math.floor(remAfterDays / 3600);
    const m = Math.floor((remAfterDays % 3600) / 60);
    const s = remAfterDays % 60;

    if (els.editD) els.editD.value = String(d);
    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);
    [els.editD, els.editH, els.editM, els.editS].forEach((input) => {
      if (!input) return;
      input.dataset.autoclearPending = "1";
    });
    setEditElapsedOverrideEnabled(!!t.xpDisqualifiedUntilReset);
    if (els.editAdvancedSection) els.editAdvancedSection.open = !!t.xpDisqualifiedUntilReset;
    syncEditCheckpointAlertUi(t);
    syncEditSaveAvailability(t);
    {
      const current = taskModeOf(t);
      editMoveTargetMode = current;
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(current);
      [els.editMoveMode1, els.editMoveMode2, els.editMoveMode3].forEach((btn) => {
        if (!btn) return;
        const moveMode = btn.getAttribute("data-move-mode") as MainMode;
        const disabled = btn.getAttribute("data-move-mode") === current || !isModeEnabled(moveMode);
        btn.disabled = disabled;
        btn.classList.toggle("is-disabled", disabled);
      });
      if (els.editMoveMenu) els.editMoveMenu.open = false;
    }

    if (els.msArea && "open" in (els.msArea as any)) {
      (els.msArea as HTMLDetailsElement).open = false;
    }
    syncEditMilestoneSectionUi(t);
    setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour");

    renderMilestoneEditor(t);
    ensureMilestoneIdentity(t);
    if (els.editPresetIntervalInput) els.editPresetIntervalInput.value = String(Number(t.presetIntervalValue || 0) || 0);
    toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    syncEditCheckpointAlertUi(t);
    editDraftSnapshot = buildEditDraftSnapshot(t);
    clearEditValidationState();
    syncEditSaveAvailability(t);

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const sourceTask = editIndex != null ? tasks[editIndex] : null;
    const t = editTaskDraft;

    if (saveChanges && t && sourceTask) {
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      if (!validateEditTimeGoal()) {
        showEditValidationError(t, "Enter a valid time goal or turn Time Goal off.");
        return;
      }
      const checkpointingActiveForSave = !!t.milestonesEnabled && editTaskHasActiveTimeGoal();
      if (checkpointingActiveForSave && (!Array.isArray(t.milestones) || t.milestones.length === 0)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Add at least 1 timer checkpoint before saving.");
        return;
      }
      if (checkpointingActiveForSave && hasNonPositiveCheckpoint(t.milestones)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Checkpoint times must be greater than 0.");
        return;
      }
      if (checkpointingActiveForSave && hasCheckpointAtOrAboveTimeGoal(t.milestones, milestoneUnitSec(t), getEditTaskTimeGoalMinutes())) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Checkpoint times must be less than the time goal.");
        return;
      }
      if (checkpointingActiveForSave && t.presetIntervalsEnabled && !hasValidPresetInterval(t)) {
        syncEditSaveAvailability(t);
        showEditValidationError(t, "Enter a preset interval greater than 0.");
        return;
      }
      const prevElapsedMs = getElapsedMs(sourceTask);
      t.name = (els.editName?.value || "").trim() || t.name;

      if (isEditElapsedOverrideEnabled()) {
        const dd = Math.max(0, parseInt(els.editD?.value || "0", 10) || 0);
        const rawH = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
        const hh = isEditMilestoneUnitDay() ? Math.min(23, rawH) : rawH;
        const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
        const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));

        const newMs = (dd * 86400 + hh * 3600 + mm * 60 + ss) * 1000;

        t.accumulatedMs = newMs;
        t.startMs = t.running ? nowMs() : null;
        if (newMs < prevElapsedMs) resetCheckpointAlertTracking(t.id);
        else clearCheckpointBaseline(t.id);
      }
      t.xpDisqualifiedUntilReset = isEditElapsedOverrideEnabled();

      const timeGoalEnabledForSave = isEditTimeGoalEnabled();
      const checkpointingEnabledForSave = timeGoalEnabledForSave && !!t.milestonesEnabled;
      t.checkpointSoundEnabled = checkpointingEnabledForSave && isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = checkpointingEnabledForSave && isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
      t.presetIntervalsEnabled = checkpointingEnabledForSave && isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null);
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      t.timeGoalAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
            ? "confirmModal"
              : "continue";
      t.timeGoalEnabled = timeGoalEnabledForSave;
      if (!t.timeGoalEnabled) t.milestonesEnabled = false;
      t.timeGoalValue = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
      t.timeGoalUnit = editTaskDurationUnit;
      t.timeGoalPeriod = editTaskDurationPeriod;
      t.timeGoalMinutes = getEditTaskTimeGoalMinutesFor(t.timeGoalValue, t.timeGoalUnit, t.timeGoalPeriod);

      ensureMilestoneIdentity(t);
      t.milestones = sortMilestones(t.milestones);
      const moveMode = editMoveTargetMode || taskModeOf(t);
      if ((moveMode === "mode1" || moveMode === "mode2" || moveMode === "mode3") && isModeEnabled(moveMode)) {
        (t as any).mode = moveMode;
      }

      Object.assign(sourceTask, cloneTaskForEdit(t));
      save();
      void syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
      render();
    }

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    clearEditValidationState();
    closeElapsedPad(false);
    if (els.editAdvancedSection) els.editAdvancedSection.open = false;
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    editIndex = null;
    editTaskDraft = null;
    editDraftSnapshot = "";
  }

  function isEditElapsedOverrideEnabled() {
    return !!els.editOverrideElapsedToggle?.classList.contains("on");
  }

  function setEditElapsedOverrideEnabled(enabled: boolean) {
    els.editOverrideElapsedToggle?.classList.toggle("on", enabled);
    els.editOverrideElapsedToggle?.setAttribute("aria-checked", String(enabled));
    els.editOverrideElapsedFields?.classList.toggle("isDisabled", !enabled);
  }

  function confirmEnableElapsedOverride() {
    confirm(
      "Manual Time Override",
      "Manual time override will disqualify this task from earning XP until the next reset. Proceed?",
      {
        okLabel: "Proceed",
        cancelLabel: "Cancel",
        onOk: () => {
          setEditElapsedOverrideEnabled(true);
          if (getCurrentEditTask()) syncEditSaveAvailability(getCurrentEditTask());
          closeConfirm();
        },
        onCancel: () => closeConfirm(),
      }
    );
  }

  function normalizeEditElapsedValue(input: HTMLInputElement | null) {
    if (!input) return;
    const raw = String(input.value || "").trim();
    if (!raw) {
      input.value = "0";
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      input.value = "0";
      return;
    }
    if (input === els.editM || input === els.editS) {
      input.value = String(Math.min(59, Math.max(0, parsed)));
      return;
    }
    if (input === els.editH && isEditMilestoneUnitDay()) {
      input.value = String(Math.min(23, Math.max(0, parsed)));
      return;
    }
    input.value = String(Math.max(0, parsed));
  }

  function maybeAutoClearEditElapsedField(input: HTMLInputElement | null) {
    if (!input) return;
    if (!isEditElapsedOverrideEnabled()) return;
    if (input.dataset.autoclearPending !== "1") return;
    input.value = "";
    input.dataset.autoclearPending = "0";
  }

  function elapsedPadRangeForInput(input: HTMLInputElement | null) {
    if (input === els.editD) return { min: 0, max: Number.POSITIVE_INFINITY };
    if (input === els.editH) {
      return isEditMilestoneUnitDay()
        ? { min: 0, max: 23 }
        : { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (input === els.editM || input === els.editS) return { min: 0, max: 59 };
    return { min: 0, max: 59 };
  }

  function elapsedPadErrorTextForInput(input: HTMLInputElement | null) {
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(range.max)) return `Enter a number greater than or equal to ${range.min}`;
    return `Enter a number within the range ${range.min}-${range.max}`;
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function elapsedPadValidatedValue(raw: string, input: HTMLInputElement | null) {
    const parsed = parseInt(raw || "", 10);
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(parsed) || isNaN(parsed)) return null;
    if (parsed < range.min || parsed > range.max) return null;
    return String(parsed);
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (elapsedPadDraft || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    if (!els.elapsedPadOverlay) return;
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = { task, milestone, ms, onApplied };
    elapsedPadOriginal = String(+milestone.hours || 0);
    elapsedPadDraft = elapsedPadOriginal;
    if (els.elapsedPadTitle) {
      const unit = task?.milestoneTimeUnit === "day" ? "days" : task?.milestoneTimeUnit === "minute" ? "minutes" : "hours";
      els.elapsedPadTitle.textContent = `Set Checkpoint <${unit}>`;
    }
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function closeElapsedPad(applyValue: boolean) {
    if (applyValue && (elapsedPadTarget || elapsedPadMilestoneRef)) {
      const valid =
        elapsedPadMilestoneRef && !elapsedPadTarget
          ? (() => {
              const parsed = parseFloat(elapsedPadDraft || "");
              if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) return null;
              return String(parsed);
            })()
          : elapsedPadValidatedValue(elapsedPadDraft, elapsedPadTarget);
      if (valid == null) {
        setElapsedPadError(
          elapsedPadMilestoneRef && !elapsedPadTarget
            ? "Enter a valid number"
            : elapsedPadErrorTextForInput(elapsedPadTarget)
        );
        return;
      }
      if (elapsedPadTarget) {
        elapsedPadTarget.value = valid;
      } else if (elapsedPadMilestoneRef) {
        const nextHours = Number(valid);
        const isEditDraftMilestone = elapsedPadMilestoneRef.task === getCurrentEditTask();
        const timeGoalMinutes = isEditDraftMilestone ? getEditTaskTimeGoalMinutes() : getAddTaskTimeGoalMinutesState();
        if (isCheckpointAtOrAboveTimeGoal(nextHours, milestoneUnitSec(elapsedPadMilestoneRef.task), timeGoalMinutes)) {
          const timeGoalText = formatCheckpointTimeGoalText(elapsedPadMilestoneRef.task, {
            timeGoalMinutes,
            forEditDraft: isEditDraftMilestone,
          });
          setElapsedPadError(`Checkpoint must be less than the time goal of ${timeGoalText}`);
          return;
        }
        elapsedPadMilestoneRef.milestone.hours = nextHours;
        elapsedPadMilestoneRef.task.milestones = elapsedPadMilestoneRef.ms;
        if (elapsedPadMilestoneRef.onApplied) elapsedPadMilestoneRef.onApplied();
        else renderMilestoneEditor(elapsedPadMilestoneRef.task);
      }
    } else if (!applyValue && elapsedPadTarget) {
      elapsedPadTarget.value = elapsedPadOriginal;
    }
    clearElapsedPadError();
    if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "none";
    if (editIndex != null && tasks[editIndex]) {
      syncEditCheckpointAlertUi(tasks[editIndex]);
      syncEditSaveAvailability(tasks[editIndex]);
    }
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = null;
    elapsedPadDraft = "";
    elapsedPadOriginal = "";
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const raw = `${elapsedPadDraft || ""}${digit}`;
    const next = raw.includes(".") ? raw : raw.replace(/^0+(?=\d)/, "");
    elapsedPadDraft = next.slice(0, 6) || "0";
    renderElapsedPadDisplay();
  }

  function padAppendDot() {
    clearElapsedPadError();
    if (!elapsedPadMilestoneRef || elapsedPadTarget) return;
    const current = elapsedPadDraft || "0";
    if (current.includes(".")) return;
    elapsedPadDraft = `${current}.`;
    renderElapsedPadDisplay();
  }

  function padBackspace() {
    clearElapsedPadError();
    const next = (elapsedPadDraft || "").slice(0, -1);
    elapsedPadDraft = next || "0";
    renderElapsedPadDisplay();
  }

  function padClear() {
    clearElapsedPadError();
    elapsedPadDraft = "0";
    renderElapsedPadDisplay();
  }

  function nextDuplicateName(originalName: string) {
    const name = (originalName || "Task").trim();
    const root = name.replace(/\s\d+$/, "").trim();
    let maxN = 0;

    tasks.forEach((t) => {
      const n = (t.name || "").trim();
      if (n === root) return;
      const mm = n.match(new RegExp("^" + escapeRegExp(root) + "\\s(\\d+)$"));
      if (mm) {
        const v = parseInt(mm[1], 10);
        if (!isNaN(v)) maxN = Math.max(maxN, v);
      }
    });

    return root + " " + (maxN + 1);
  }

  function duplicateTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    const newId = newTaskId();
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = newId;
    copy.name = nextDuplicateName(t.name);

    copy.running = false;
    copy.startMs = null;

    tasks.splice(i + 1, 0, copy);

    const h = historyByTaskId && historyByTaskId[t.id] ? JSON.parse(JSON.stringify(historyByTaskId[t.id])) : [];
    historyByTaskId[newId] = h;

    saveHistory(historyByTaskId);
    save();
    render();
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

  function getTaskMetaForHistoryId(taskId: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (t) return { name: t.name, color: (t as any).color, deleted: false };

    const dm = deletedTaskMeta && (deletedTaskMeta as any)[taskId];
    if (dm) return { name: dm.name || "Deleted Task", color: dm.color || null, deleted: true };

    const arr = historyByTaskId && historyByTaskId[taskId];
    if (arr && arr.length) {
      const e = arr[arr.length - 1] as any;
      return { name: e.name || "Deleted Task", color: e.color || null, deleted: true };
    }

    return { name: "Deleted Task", color: null, deleted: true };
  }

  function syncHistoryManagerBulkUi() {
    if (els.historyManagerBulkBtn) {
      els.historyManagerBulkBtn.textContent = "Bulk Edit";
      els.historyManagerBulkBtn.classList.toggle("btn-accent", hmBulkEditMode);
      els.historyManagerBulkBtn.classList.toggle("btn-ghost", !hmBulkEditMode);
    }
    if (els.historyManagerBulkDeleteBtn) {
      const count = hmBulkSelectedRows.size;
      if (hmBulkEditMode && count > 0) {
        els.historyManagerBulkDeleteBtn.style.display = "";
        els.historyManagerBulkDeleteBtn.textContent = count === 1 ? "Delete (1)" : `Delete (${count})`;
      } else {
        els.historyManagerBulkDeleteBtn.style.display = "none";
      }
    }
  }

  function renderHistoryManager() {
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = isArchitectUser() ? "" : "none";
    }
    const listEl = document.getElementById("hmList");
    if (!listEl) return;
    if (listEl.children.length) {
      const nextTaskGroups = new Set<string>();
      const nextDateGroups = new Set<string>();
      listEl.querySelectorAll(".hmGroup[data-task]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        if (taskId && (el as HTMLDetailsElement).open) nextTaskGroups.add(taskId);
      });
      listEl.querySelectorAll(".hmDateGroup[data-task][data-date]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        const dateKey = (el as HTMLElement).getAttribute("data-date");
        if (taskId && dateKey && (el as HTMLDetailsElement).open) nextDateGroups.add(`${taskId}|${dateKey}`);
      });
      hmExpandedTaskGroups = nextTaskGroups;
      hmExpandedDateGroups = nextDateGroups;
    }
    hmRowsByTask = {};
    hmRowsByTaskDate = {};
    const taskIdFilter = (() => {
      try {
        const p = new URLSearchParams(window.location.search);
        const raw = (p.get("taskId") || "").trim();
        return raw || null;
      } catch {
        return null;
      }
    })();

    let hb: Record<string, any[]> = (historyByTaskId as Record<string, any[]>) || {};
    if (!hb || typeof hb !== "object") hb = {};

    const idsWithHistory = Object.keys(hb || {}).filter((id) => {
      const arr = (hb as any)[id];
      return Array.isArray(arr) && arr.length;
    });
    const filteredIds = taskIdFilter ? idsWithHistory.filter((id) => String(id) === String(taskIdFilter)) : idsWithHistory;

    if (!filteredIds.length) {
      listEl.innerHTML = taskIdFilter
        ? `<div class="hmEmpty">No history entries found for this task.</div>`
        : `<div class="hmEmpty">No history entries found.</div>`;
      return;
    }

    const currentOrder = (tasks || []).map((t) => String(t.id));
    filteredIds.sort((a, b) => {
      const ai = currentOrder.indexOf(String(a));
      const bi = currentOrder.indexOf(String(b));
      const aIsCurrent = ai !== -1;
      const bIsCurrent = bi !== -1;
      if (aIsCurrent && bIsCurrent) return ai - bi;
      if (aIsCurrent) return -1;
      if (bIsCurrent) return 1;
      const ar = (hb as any)[a][(hb as any)[a].length - 1]?.ts || 0;
      const br = (hb as any)[b][(hb as any)[b].length - 1]?.ts || 0;
      return br - ar;
    });

    const groups = filteredIds
      .map((taskId) => {
        const meta = getTaskMetaForHistoryId(taskId);
        const arr = ((hb as any)[taskId] || []).slice().sort((x: any, y: any) => (y.ts || 0) - (x.ts || 0));
        const localDateKey = (ts: number) => {
          const d = new Date(ts);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const da = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${da}`;
        };
        const localDateLabel = (key: string) => {
          const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
          const dt = new Date(y, (m || 1) - 1, d || 1);
          try {
            return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
          } catch {
            return key;
          }
        };

        const rowsByDate: Record<string, any[]> = {};
        arr.forEach((e: any) => {
          const key = localDateKey(+e.ts || 0);
          if (!rowsByDate[key]) rowsByDate[key] = [];
          rowsByDate[key].push(e);
        });

        const dateGroupsHtml = Object.keys(rowsByDate)
          .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
          .map((dateKey) => {
            const entries = (rowsByDate[dateKey] || []).slice().sort((a: any, b: any) => {
              const av = hmSortKey === "ms" ? +a.ms || 0 : +a.ts || 0;
              const bv = hmSortKey === "ms" ? +b.ms || 0 : +b.ts || 0;
              return hmSortDir === "asc" ? av - bv : bv - av;
            });
            const rowIds = entries.map((e: any) => `${taskId}|${e.ts}|${e.ms}|${String(e.name || "")}`);
            hmRowsByTaskDate[`${taskId}|${dateKey}`] = rowIds;
            hmRowsByTask[taskId] = (hmRowsByTask[taskId] || []).concat(rowIds);
            const dateChecked = rowIds.length > 0 && rowIds.every((id) => hmBulkSelectedRows.has(id));
            const rows = entries
              .map((e: any) => {
                const dt = formatDateTime(e.ts);
                const tm = formatTime(e.ms || 0);
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                const rowId = `${taskId}|${rowKey}`;
                const rowCheckbox = hmBulkEditMode
                  ? `<input class="hmBulkCheckbox hmBulkRowChk" type="checkbox" data-task="${taskId}" data-key="${escapeHtmlHM(
                      rowKey
                    )}" ${hmBulkSelectedRows.has(rowId) ? "checked" : ""} />`
                  : "";
                return `
                  <tr>
                    <td class="hmSelectCell">${rowCheckbox}</td>
                    <td>${dt}</td>
                    <td>${tm}</td>
                    <td style="text-align:right;">
                      <button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(
                  rowKey
                )}" aria-label="Delete log" title="Delete log">&#128465;</button>
                    </td>
                  </tr>
                `;
              })
              .join("");
            const dateOpen = hmExpandedDateGroups.has(`${taskId}|${dateKey}`) ? " open" : "";
            const dateSortArrow = hmSortKey === "ts" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const elapsedSortArrow = hmSortKey === "ms" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const dateCheckbox = hmBulkEditMode
              ? `<input class="hmBulkCheckbox hmBulkDateChk" type="checkbox" data-task="${taskId}" data-date="${dateKey}" ${
                  dateChecked ? "checked" : ""
                } />`
              : "";
            return `
              <details class="hmDateGroup" data-task="${taskId}" data-date="${dateKey}"${dateOpen}>
                <summary class="hmDateHeading">${dateCheckbox}${escapeHtmlHM(localDateLabel(dateKey))}</summary>
                <table class="hmTable" role="table">
                  <thead>
                    <tr>
                      <th class="hmSelectHead"></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ts">Date/Time${dateSortArrow}</button></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ms">Elapsed${elapsedSortArrow}</button></th>
                      <th style="text-align:right;">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </details>
            `;
          })
          .join("");

        const swatch = `<span class="hmExpandIcon" aria-hidden="true"></span>`;
        const badge = meta.deleted ? `<span class="hmBadge deleted">Deleted</span>` : ``;
        const taskRows = hmRowsByTask[taskId] || [];
        const taskChecked = taskRows.length > 0 && taskRows.every((id) => hmBulkSelectedRows.has(id));
        const taskCheckbox = hmBulkEditMode
          ? `<input class="hmBulkCheckbox hmBulkTaskChk" type="checkbox" data-task="${taskId}" ${
              taskChecked ? "checked" : ""
            } />`
          : "";

        const taskOpen = hmExpandedTaskGroups.has(String(taskId)) ? " open" : "";
        return `
          <details class="hmGroup" data-task="${taskId}"${taskOpen}>
            <summary class="hmSummary">
              <div class="hmTitleRow">
                ${taskCheckbox}
                ${swatch}
                <div class="hmTaskName">${escapeHtmlHM(meta.name || "Task")}</div>
                ${badge}
              </div>
              <div class="hmCount">${arr.length} logs</div>
            </summary>

            ${dateGroupsHtml}
          </details>
        `;
      })
      .join("");

    listEl.innerHTML = groups;
    const validRowIds = new Set<string>();
    Object.values(hmRowsByTask).forEach((ids) => ids.forEach((id) => validRowIds.add(id)));
    hmBulkSelectedRows.forEach((id) => {
      if (!validRowIds.has(id)) hmBulkSelectedRows.delete(id);
    });
    syncHistoryManagerBulkUi();
  }

  function openHistoryManager() {
    if (els.menuOverlay) (els.menuOverlay as HTMLElement).style.display = "none";
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = isArchitectUser() ? "" : "none";
    }
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "block";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    if (els.hmList) {
      els.hmList.innerHTML = `<div class="hmEmpty">Loading history...</div>`;
    }
    void refreshHistoryManagerFromCloud().then(() => {
      if (runtime.destroyed) return;
      renderHistoryManager();
    });
  }

  async function refreshHistoryManagerFromCloud() {
    try {
      await refreshHistoryFromCloud();
      deletedTaskMeta = loadDeletedMeta();
      load();
      historyByTaskId = loadHistory();
    } catch {
      // Keep last known in-memory state if cloud refresh fails.
    }
  }

  function closeHistoryManager() {
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "none";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    hmExpandedTaskGroups = new Set<string>();
    hmExpandedDateGroups = new Set<string>();
    hmBulkEditMode = false;
    hmBulkSelectedRows = new Set<string>();
    hmRowsByTask = {};
    hmRowsByTaskDate = {};
    syncHistoryManagerBulkUi();
  }

  function openFocusMode(i: number) {
    const t = tasks[i];
    if (!t) return;
    focusModeTaskId = t.id;
    suppressedFocusModeCheckpointAlertsByTaskId = {};
    deferredFocusModeTimeGoalModals = [];
    dismissNonFocusTaskAlertsForFocusTask(String(t.id || ""));
    focusModeTaskName = (t.name || "").trim();
    if (els.focusTaskName) els.focusTaskName.textContent = focusModeTaskName || "Task";
    focusCheckpointSig = "";
    updateFocusDial(t);
    renderFocusCheckpointCompletionLog(t);
    syncFocusRunButtons(t);
    updateFocusInsights(t);
    syncFocusSessionNotesInput(String(t.id || ""));
    syncFocusSessionNotesAccordion(String(t.id || ""));
    if (els.focusModeScreen) {
      (els.focusModeScreen as HTMLElement).style.display = "block";
      (els.focusModeScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
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

  function isFocusModeFilteringAlerts() {
    return String(focusModeTaskId || "").trim().length > 0;
  }

  function shouldSuppressTaskAlertsInFocusMode(taskIdRaw: string | null | undefined) {
    const activeFocusTaskId = String(focusModeTaskId || "").trim();
    const taskId = String(taskIdRaw || "").trim();
    return !!activeFocusTaskId && !!taskId && taskId !== activeFocusTaskId;
  }

  function noteSuppressedFocusModeAlert(toast: SuppressedCheckpointToast) {
    const taskId = String(toast.taskId || "").trim();
    if (!taskId) return;
    suppressedFocusModeCheckpointAlertsByTaskId[taskId] = {
      ...toast,
      taskId,
      taskName: toast.taskName ? String(toast.taskName) : null,
      counterText: toast.counterText ? String(toast.counterText) : null,
      checkpointTimeText: toast.checkpointTimeText ? String(toast.checkpointTimeText) : null,
      checkpointDescText: toast.checkpointDescText ? String(toast.checkpointDescText) : null,
    };
  }

  function getSuppressedFocusModeAlert(taskIdRaw: string | null | undefined): SuppressedCheckpointToast | null {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId) return null;
    return suppressedFocusModeCheckpointAlertsByTaskId[taskId] || null;
  }

  function clearSuppressedFocusModeAlert(taskIdRaw: string | null | undefined) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId || !suppressedFocusModeCheckpointAlertsByTaskId[taskId]) return;
    delete suppressedFocusModeCheckpointAlertsByTaskId[taskId];
  }

  function queueDeferredFocusModeTimeGoalModal(task: Task, elapsedMs: number, opts?: { reminder?: boolean }) {
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    if (deferredFocusModeTimeGoalModals.some((entry) => entry.taskId === taskId)) return;
    deferredFocusModeTimeGoalModals.push({
      taskId,
      frozenElapsedMs: Math.max(0, Math.floor(Number(elapsedMs || 0) || 0)),
      reminder: !!opts?.reminder,
    });
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

  function dismissNonFocusTaskAlertsForFocusTask(focusTaskIdRaw: string | null | undefined) {
    const focusTaskId = String(focusTaskIdRaw || "").trim();
    if (!focusTaskId) return;
    checkpointToastQueue.length = 0;
    if (checkpointRepeatActiveTaskId && String(checkpointRepeatActiveTaskId || "").trim() !== focusTaskId) {
      stopCheckpointRepeatAlert();
    }
    if (activeCheckpointToast && String(activeCheckpointToast.taskId || "").trim() !== focusTaskId) {
      dismissCheckpointToast({ manual: false });
    }
  }

  function hasFocusCheckpoints(t: Task): boolean {
    return !!(t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.some((m) => (+m.hours || 0) > 0));
  }

  function syncFocusCheckpointToggle(t: Task) {
    const hasCp = hasFocusCheckpoints(t);
    const effectiveOn = hasCp ? focusShowCheckpoints : false;
    if (els.focusCheckpointToggle) {
      els.focusCheckpointToggle.classList.toggle("on", effectiveOn);
      els.focusCheckpointToggle.setAttribute("aria-checked", String(effectiveOn));
      els.focusCheckpointToggle.classList.toggle("opaque", !hasCp);
    }
    if (els.focusCheckpointRing) {
      (els.focusCheckpointRing as HTMLElement).style.display = effectiveOn ? "block" : "none";
    }
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

  function updateFocusDial(t: Task) {
    const elapsedMs = getElapsedMs(t);
    const elapsedSec = elapsedMs / 1000;
    if (els.focusTaskName) els.focusTaskName.textContent = (t.name || "").trim() || focusModeTaskName || "Task";
    const f = formatFocusElapsed(elapsedMs);
    if (els.focusTimerDays) {
      els.focusTimerDays.textContent = f.daysText;
      (els.focusTimerDays as HTMLElement).style.display = f.showDays ? "block" : "none";
    }
    if (els.focusTimerClock) els.focusTimerClock.textContent = f.clockText;
    syncFocusRunButtons(t);
    updateFocusInsights(t);

    const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
    const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
    syncFocusCheckpointToggle(t);
    const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
    const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
    const timeGoalSec = hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0;
    const maxSec = Math.max(maxValue * milestoneUnitSec(t), timeGoalSec, 1);
    const pct = hasTimeGoal && timeGoalSec > 0 ? Math.min((elapsedSec / timeGoalSec) * 100, 100) : 0;
    if (els.focusDial) {
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress", `${pct}%`);
      (els.focusDial as HTMLElement).style.setProperty("--focus-progress-color", fillBackgroundForPct(pct));
    }

    if (!els.focusCheckpointRing) return;
    if (!hasMilestones || maxValue <= 0) {
      (els.focusCheckpointRing as HTMLElement).innerHTML = "";
      renderFocusCheckpointCompletionLog(t);
      focusCheckpointSig = "";
      return;
    }

    const dialRect = (els.focusDial as HTMLElement | null)?.getBoundingClientRect();
    const dialPx = Math.max(1, Math.round(dialRect?.width || 0));
    const sig = `${t.milestoneTimeUnit || "hour"}|${dialPx}|${msSorted.map((m) => `${+m.hours || 0}:${m.description || ""}`).join(",")}`;
    if (sig !== focusCheckpointSig) {
      const parseConicStartDeg = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 0;
        const bg = window.getComputedStyle(progressEl).backgroundImage || "";
        const m = bg.match(/conic-gradient\(\s*from\s*([-\d.]+)deg/i);
        return m ? Number(m[1]) || 0 : 0;
      };
      const parseRingCenterRatio = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 0.82;
        const cs = window.getComputedStyle(progressEl);
        const mask = (cs.maskImage || (cs as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || "").toLowerCase();
        const pct = [...mask.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
        if (pct.length < 2) return 0.82;
        const centerHolePct = (pct[0] + pct[1]) / 2;
        return Math.max(0, Math.min(1, (centerHolePct + 100) / 200));
      };
      const parseProgressInsetPx = () => {
        const progressEl = (els.focusDial as HTMLElement | null)?.querySelector(".focusDialProgress") as HTMLElement | null;
        if (!progressEl) return 16;
        const cs = window.getComputedStyle(progressEl);
        const rawInset =
          ((cs as CSSStyleDeclaration & { inset?: string }).inset || "").trim() ||
          (cs.top || "").trim() ||
          (cs.left || "").trim();
        const firstToken = rawInset.split(/\s+/)[0] || "";
        const px = parseFloat(firstToken);
        return Number.isFinite(px) ? px : 16;
      };
      const dialRadiusPx = dialPx / 2;
      const dialScale = Math.max(0.72, Math.min(1, dialPx / 420));
      const ringInsetPx = parseProgressInsetPx();
      const progressBoxRadiusPx = Math.max(0, dialRadiusPx - ringInsetPx);
      const markerRadiusPx = Math.max(0, progressBoxRadiusPx * parseRingCenterRatio());
      const outerRingRadiusPx = Math.max(0, dialRadiusPx - 2);
      const markerLineLenPx = Math.max(2, (outerRingRadiusPx - markerRadiusPx) * 0.5);
      const centerX = (dialRect?.left || 0) + (dialRect?.width || dialPx) / 2;
      const centerY = (dialRect?.top || 0) + (dialRect?.height || dialPx) / 2;
      const viewportPadPx = 10;
      const availableOuterRadiusPx = Math.max(
        outerRingRadiusPx + 4,
        Math.min(
          centerX - viewportPadPx,
          window.innerWidth - centerX - viewportPadPx,
          centerY - viewportPadPx,
          window.innerHeight - centerY - viewportPadPx
        )
      );
      const ringStartCssDeg = parseConicStartDeg();

      const dots = msSorted
        .filter((m) => (+m.hours || 0) > 0)
        .map((m) => {
          const v = +m.hours || 0;
          const secTarget = v * milestoneUnitSec(t);
          const ratioFromStart = Math.max(0, Math.min(1, secTarget / maxSec));
          const checkpointCssDeg = ringStartCssDeg + ratioFromStart * 360;
          const theta = (checkpointCssDeg * Math.PI) / 180;
          const mx = Math.sin(theta) * markerRadiusPx;
          const my = -Math.cos(theta) * markerRadiusPx;
          const markerAngleDeg = checkpointCssDeg - 90;
          const isRight = mx >= 0;
          const desiredFlagGapPx = 4 + 6 * dialScale;
          const minFlagRadiusPx = outerRingRadiusPx + 2;
          const maxFlagRadiusPx = Math.max(minFlagRadiusPx, availableOuterRadiusPx - 10);
          const flagRadiusPx = Math.min(Math.max(minFlagRadiusPx, outerRingRadiusPx + desiredFlagGapPx), maxFlagRadiusPx);
          const labelPadFromFlagPx = 8 + 8 * dialScale;
          let lx = Math.sin(theta) * (flagRadiusPx + labelPadFromFlagPx);
          let ly = -Math.cos(theta) * (flagRadiusPx + labelPadFromFlagPx);
          const labelDist = Math.sqrt(lx * lx + ly * ly) || 1;
          const preferredLabelRadiusPx = Math.max(dialRadiusPx + 10 * dialScale, flagRadiusPx + 8);
          const minOutsideRadius = Math.min(
            Math.max(flagRadiusPx + 6, availableOuterRadiusPx - 6),
            preferredLabelRadiusPx
          );
          if (labelDist < minOutsideRadius) {
            const k = minOutsideRadius / labelDist;
            lx *= k;
            ly *= k;
          }
          const fx = Math.sin(theta) * flagRadiusPx;
          const fy = -Math.cos(theta) * flagRadiusPx;
          const lineText = `${v}${milestoneUnitSuffix(t)}`;
          const descText = String(m.description || "").trim();
          return `
            <div class="focusCheckpointMark" style="--mxpx:${mx}px;--mypx:${my}px;--madeg:${markerAngleDeg}deg;--mlpx:${markerLineLenPx}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointFlag" style="--fxpx:${fx}px;--fypx:${fy}px" data-seconds="${secTarget}"></div>
            <div class="focusCheckpointLabel ${isRight ? "right" : "left"}" style="--lxpx:${lx}px;--lypx:${ly}px" data-seconds="${secTarget}">
              <span class="focusCheckpointLabelTitle">${escapeHtmlUI(lineText)}</span>
              ${descText ? `<span class="focusCheckpointLabelDesc">${escapeHtmlUI(descText)}</span>` : ""}
            </div>
          `;
        })
        .join("");
      (els.focusCheckpointRing as HTMLElement).innerHTML = dots;
      focusCheckpointSig = sig;
    }

    (els.focusCheckpointRing as HTMLElement)
      .querySelectorAll(".focusCheckpointMark, .focusCheckpointFlag, .focusCheckpointLabel, .focusCheckpointConnector")
      .forEach((dot) => {
      const secTarget = Number((dot as HTMLElement).dataset.seconds || "0");
      (dot as HTMLElement).classList.toggle("reached", elapsedSec >= secTarget);
      });

    // Match task progress-bar behavior: keep all flags/markers visible, but only show
    // the next checkpoint label/description (or the final checkpoint after all are reached).
    const validMs = msSorted.filter((m) => (+m.hours || 0) > 0);
    if (validMs.length) {
      const nextPending = validMs.find((m) => elapsedSec < (+m.hours || 0) * milestoneUnitSec(t)) || null;
      const displayMs = nextPending || validMs[validMs.length - 1];
      const displayTargetSec = Math.max(0, (+displayMs.hours || 0) * milestoneUnitSec(t));
      (els.focusCheckpointRing as HTMLElement).querySelectorAll(".focusCheckpointLabel").forEach((el) => {
        const secTarget = Number((el as HTMLElement).dataset.seconds || "0");
        (el as HTMLElement).classList.toggle("isActive", Math.abs(secTarget - displayTargetSec) < 0.001);
      });
    } else {
      (els.focusCheckpointRing as HTMLElement).querySelectorAll(".focusCheckpointLabel").forEach((el) => {
        (el as HTMLElement).classList.remove("isActive");
      });
    }
    renderFocusCheckpointCompletionLog(t);
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

    closeOverlay(els.menuOverlay as HTMLElement | null);

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

  function normalizeThemeMode(raw: string | null | undefined): "purple" | "cyan" {
    const value = String(raw || "").trim().toLowerCase();
    return value === "cyan" || value === "command" ? "cyan" : "purple";
  }

  function applyTheme(mode: "purple" | "cyan") {
    themeMode = mode;
    const body = document.body;
    body.setAttribute("data-theme", mode);
    if (els.themeSelect && els.themeSelect.value !== mode) {
      els.themeSelect.value = mode;
    }
  }

  function applyTaskViewPreference(next: "list" | "tile") {
    taskView = next === "tile" ? "tile" : "list";
    document.body.setAttribute("data-task-view", taskView);
    els.taskViewList?.classList.toggle("isOn", taskView === "list");
    els.taskViewTile?.classList.toggle("isOn", taskView === "tile");
    els.taskViewList?.setAttribute("aria-pressed", taskView === "list" ? "true" : "false");
    els.taskViewTile?.setAttribute("aria-pressed", taskView === "tile" ? "true" : "false");
  }

  function applyMenuButtonStyle(next: "parallelogram" | "square") {
    menuButtonStyle = next === "square" ? "square" : "parallelogram";
    const body = document.body;
    body.setAttribute("data-control-style", menuButtonStyle);
    if (els.menuButtonStyleSelect && els.menuButtonStyleSelect.value !== menuButtonStyle) {
      els.menuButtonStyleSelect.value = menuButtonStyle;
    }
  }

  function loadThemePreference() {
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(THEME_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    const cloudRaw = String((cloudPreferencesCache || loadCachedPreferences())?.theme || "").trim().toLowerCase();
    const raw = cloudRaw || localRaw;
    const mode = normalizeThemeMode(raw);
    applyTheme(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // ignore localStorage write failures
    }
  }

  function loadMenuButtonStylePreference() {
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(MENU_BUTTON_STYLE_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    const cloudRaw = String((cloudPreferencesCache || loadCachedPreferences())?.menuButtonStyle || "").trim().toLowerCase();
    const raw = cloudRaw || localRaw;
    const next: "parallelogram" | "square" = raw === "square" ? "square" : "parallelogram";
    applyMenuButtonStyle(next);
    try {
      localStorage.setItem(MENU_BUTTON_STYLE_KEY, next);
    } catch {
      // ignore localStorage write failures
    }
  }

  function loadAddTaskCustomNames() {
    const settings = (cloudTaskUiCache || loadCachedTaskUi()) as any;
    const raw = Array.isArray(settings?.customTaskNames) ? JSON.stringify(settings.customTaskNames) : "";
    addTaskCustomNames = parseRecentCustomTaskNames(raw, 5);
  }

  function loadDefaultTaskTimerFormat() {
    const raw = (cloudPreferencesCache || loadCachedPreferences())?.defaultTaskTimerFormat;
    const next: "day" | "hour" | "minute" = raw === "day" || raw === "minute" ? raw : "hour";
    defaultTaskTimerFormat = next;
  }

  function loadTaskViewPreference() {
    let localRaw = "";
    try {
      localRaw = String(localStorage.getItem(TASK_VIEW_KEY) || "").trim().toLowerCase();
    } catch {
      // ignore localStorage read failures
    }
    if (localRaw === "tile" || localRaw === "list") {
      applyTaskViewPreference(localRaw);
      return;
    }
    const cloudRaw = String((cloudPreferencesCache || loadCachedPreferences())?.taskView || "").trim().toLowerCase();
    if (cloudRaw === "tile" || cloudRaw === "list") {
      applyTaskViewPreference(cloudRaw);
      return;
    }
    applyTaskViewPreference("tile");
  }

  function saveDefaultTaskTimerFormat() {
    persistPreferencesToCloud();
  }

  function saveTaskViewPreference() {
    try {
      localStorage.setItem(TASK_VIEW_KEY, taskView);
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function loadAutoFocusOnTaskLaunchSetting() {
    const cloudValue = (cloudPreferencesCache || loadCachedPreferences())?.autoFocusOnTaskLaunchEnabled;
    if (typeof cloudValue === "boolean") {
      autoFocusOnTaskLaunchEnabled = cloudValue;
      return;
    }
    try {
      const raw = String(localStorage.getItem(AUTO_FOCUS_ON_TASK_LAUNCH_KEY) || "").trim().toLowerCase();
      if (raw === "false" || raw === "0" || raw === "off") {
        autoFocusOnTaskLaunchEnabled = false;
        return;
      }
      if (raw === "true" || raw === "1" || raw === "on") {
        autoFocusOnTaskLaunchEnabled = true;
        return;
      }
    } catch {
      // ignore localStorage read failures
    }
    autoFocusOnTaskLaunchEnabled = false;
  }

  function saveAutoFocusOnTaskLaunchSetting() {
    try {
      localStorage.setItem(AUTO_FOCUS_ON_TASK_LAUNCH_KEY, autoFocusOnTaskLaunchEnabled ? "true" : "false");
    } catch {
      // ignore localStorage write failures
    }
    persistPreferencesToCloud();
  }

  function toggleSwitchElement(el: HTMLElement | null | undefined, enabled: boolean) {
    el?.classList.toggle("on", enabled);
    el?.setAttribute("aria-checked", String(enabled));
  }

  function isSwitchOn(el: HTMLElement | null | undefined) {
    return !!el?.classList.contains("on");
  }

  function syncTaskSettingsUi() {
    els.taskDefaultFormatDay?.classList.toggle("isOn", defaultTaskTimerFormat === "day");
    els.taskDefaultFormatHour?.classList.toggle("isOn", defaultTaskTimerFormat === "hour");
    els.taskDefaultFormatMinute?.classList.toggle("isOn", defaultTaskTimerFormat === "minute");
    els.taskViewList?.classList.toggle("isOn", taskView === "list");
    els.taskViewTile?.classList.toggle("isOn", taskView === "tile");
    els.taskViewList?.setAttribute("aria-pressed", taskView === "list" ? "true" : "false");
    els.taskViewTile?.setAttribute("aria-pressed", taskView === "tile" ? "true" : "false");
    toggleSwitchElement(els.taskAutoFocusOnLaunchToggle as HTMLElement | null, autoFocusOnTaskLaunchEnabled);
    toggleSwitchElement(els.taskDynamicColorsToggle as HTMLElement | null, dynamicColorsEnabled);
    toggleSwitchElement(els.taskCheckpointSoundToggle as HTMLElement | null, checkpointAlertSoundEnabled);
    toggleSwitchElement(els.taskCheckpointToastToggle as HTMLElement | null, checkpointAlertToastEnabled);
    const currentEditTask = getCurrentEditTask();
    if (currentEditTask) syncEditCheckpointAlertUi(currentEditTask);
  }

  function loadDynamicColorsSetting() {
    dynamicColorsEnabled = (cloudPreferencesCache || loadCachedPreferences())?.dynamicColorsEnabled !== false;
  }

  function saveDynamicColorsSetting() {
    persistPreferencesToCloud();
  }

  function loadCheckpointAlertSettings() {
    const prefs = cloudPreferencesCache || loadCachedPreferences();
    checkpointAlertSoundEnabled = prefs?.checkpointAlertSoundEnabled !== false;
    checkpointAlertToastEnabled = prefs?.checkpointAlertToastEnabled !== false;
  }

  function saveCheckpointAlertSettings() {
    persistPreferencesToCloud();
  }

  function checkpointKeyForTask(m: { hours: number; description: string }, t: Task) {
    const unitSeconds = milestoneUnitSec(t);
    const targetSec = Math.max(0, Math.round((+m.hours || 0) * unitSeconds));
    const label = String(m.description || "").trim();
    return `${targetSec}|${label}`;
  }

  function resetCheckpointAlertTracking(taskId: string | null | undefined, opts?: { clearBaseline?: boolean }) {
    const id = String(taskId || "");
    if (!id) return;
    delete checkpointFiredKeysByTaskId[id];
    if (opts?.clearBaseline !== false) delete checkpointBaselineSecByTaskId[id];
  }

  function clearCheckpointBaseline(taskId: string | null | undefined) {
    const id = String(taskId || "");
    if (!id) return;
    delete checkpointBaselineSecByTaskId[id];
  }

  function getCheckpointFiredSet(taskId: string) {
    if (!checkpointFiredKeysByTaskId[taskId]) checkpointFiredKeysByTaskId[taskId] = new Set<string>();
    return checkpointFiredKeysByTaskId[taskId];
  }

  function ensureCheckpointBeepAudio() {
    if (checkpointBeepAudio) return checkpointBeepAudio;
    try {
      checkpointBeepAudio = new Audio("/checkpoint-beep.wav");
      checkpointBeepAudio.preload = "auto";
    } catch {
      checkpointBeepAudio = null;
    }
    return checkpointBeepAudio;
  }

  function playCheckpointBeep() {
    const audio = ensureCheckpointBeepAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      // ignore playback restrictions
    }
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

  function flushCheckpointBeepQueue() {
    if (checkpointBeepQueueCount <= 0) {
      checkpointBeepQueueCount = 0;
      checkpointBeepQueueTimer = null;
      return;
    }
    playCheckpointBeep();
    checkpointBeepQueueCount -= 1;
    if (checkpointBeepQueueCount > 0) checkpointBeepQueueTimer = window.setTimeout(flushCheckpointBeepQueue, 150);
    else checkpointBeepQueueTimer = null;
  }

  function scheduleCheckpointRepeatCycle() {
    if (checkpointRepeatStopAtMs <= 0) {
      stopCheckpointRepeatAlert();
      return;
    }
    if (Date.now() >= checkpointRepeatStopAtMs) {
      stopCheckpointRepeatAlert();
      return;
    }
    enqueueCheckpointBeeps(1);
    checkpointRepeatCycleTimer = window.setTimeout(scheduleCheckpointRepeatCycle, 2000);
  }

  function startCheckpointRepeatAlert(taskId: string) {
    checkpointRepeatActiveTaskId = taskId;
    checkpointRepeatStopAtMs = Date.now() + 60_000;
    if (!runtime.destroyed) render();
    if (checkpointRepeatCycleTimer != null) return;
    scheduleCheckpointRepeatCycle();
  }

  function enqueueCheckpointBeeps(count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    checkpointBeepQueueCount += Math.floor(count);
    if (checkpointBeepQueueTimer == null) flushCheckpointBeepQueue();
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

  function dismissCheckpointToastAndJumpToTask() {
    const taskId = String(activeCheckpointToast?.taskId || "").trim();
    dismissCheckpointToast({ manual: true });
    if (!taskId) return;
    const path = normalizedPathname();
    const onMainTaskTimerRoute = /\/tasktimer$/.test(path) || /\/tasktimer\/index\.html$/i.test(path);
    if (onMainTaskTimerRoute) {
      jumpToTaskById(taskId);
      return;
    }
    savePendingTaskJump(taskId);
    navigateToAppRoute("/tasktimer");
  }

  function enqueueCheckpointToast(
    title: string,
    text: string,
    opts?: {
      autoCloseMs?: number | null;
      taskId?: string | null;
      taskName?: string | null;
      counterText?: string | null;
      checkpointTimeText?: string | null;
      checkpointDescText?: string | null;
      muteRepeatOnManualDismiss?: boolean;
    }
  ) {
    const autoCloseMs = opts?.autoCloseMs === null ? null : Math.max(0, Number(opts?.autoCloseMs ?? 5000)) || 0;
    // Do not stack checkpoint alerts: replace any existing/queued toast with the newest one.
    checkpointToastQueue.length = 0;
    if (checkpointToastAutoCloseTimer != null) {
      window.clearTimeout(checkpointToastAutoCloseTimer);
      checkpointToastAutoCloseTimer = null;
    }
    activeCheckpointToast = null;

    checkpointToastQueue.push({
      id: `${Date.now()}-${Math.random()}`,
      title,
      text,
      checkpointTimeText: opts?.checkpointTimeText ?? null,
      checkpointDescText: opts?.checkpointDescText ?? null,
      taskName: opts?.taskName ?? null,
      counterText: opts?.counterText ?? null,
      autoCloseMs,
      autoCloseAtMs: null,
      taskId: opts?.taskId ?? null,
      muteRepeatOnManualDismiss: !!opts?.muteRepeatOnManualDismiss,
    });
    showNextCheckpointToast();
  }

  function formatCheckpointAlertText(task: Task, milestone: { hours: number; description: string }) {
    const targetMs = Math.max(0, (+milestone.hours || 0) * milestoneUnitSec(task) * 1000);
    const label = String(milestone.description || "").trim();
    return label ? `${formatTime(targetMs)} - ${label}` : formatTime(targetMs);
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

  function processCheckpointAlertsForTask(t: Task, elapsedSecNow: number) {
    const taskId = String(t.id || "");
    if (!taskId || !t.running) {
      if (taskId) clearCheckpointBaseline(taskId);
      return;
    }
    const hasMilestones = !!t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;

    const elapsedWholeSec = Math.floor(Math.max(0, elapsedSecNow));
    const prevBaseline = checkpointBaselineSecByTaskId[taskId];
    if (!Number.isFinite(prevBaseline)) {
      checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
      return;
    }
    if (elapsedWholeSec <= prevBaseline) {
      checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
      return;
    }

    const fired = getCheckpointFiredSet(taskId);
    const msSorted = hasMilestones ? sortMilestones((t.milestones || []).slice()) : [];
    const validMilestones = msSorted.filter((m) => Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec(t))) > 0);
    const totalCheckpoints = validMilestones.length;
    let beepCount = 0;
    let shouldResetAtTimeGoal: null | "resetLog" | "resetNoLog" = null;
    let shouldOpenTimeGoalModal = false;
    let openTimeGoalModalAsReminder = false;
    msSorted.forEach((m) => {
      const targetSec = Math.max(0, Math.round((+m.hours || 0) * milestoneUnitSec(t)));
      if (targetSec <= 0) return;
      if (targetSec <= prevBaseline || targetSec > elapsedWholeSec) return;
      const key = checkpointKeyForTask(m, t);
      if (fired.has(key)) return;
      fired.add(key);
      const text = formatCheckpointAlertText(t, m);
      const checkpointIndex = Math.max(
        1,
        validMilestones.findIndex((vm) => checkpointKeyForTask(vm, t) === key) + 1
      );
      const checkpointTimeText = formatTime(targetSec * 1000);
      const checkpointDescText = String(m.description || "").trim();
      const suppressForFocusMode = shouldSuppressTaskAlertsInFocusMode(taskId);
      if (checkpointAlertToastEnabled && t.checkpointToastEnabled && !suppressForFocusMode) {
        const toastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
        enqueueCheckpointToast(`Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`, text, {
          autoCloseMs: toastMode === "manual" ? null : 5000,
          taskId,
          taskName: t.name || "",
          counterText: formatMainTaskElapsed(getElapsedMs(t)),
          checkpointTimeText,
          checkpointDescText,
          muteRepeatOnManualDismiss: checkpointAlertSoundEnabled && !!t.checkpointSoundEnabled && (t.checkpointSoundMode || "once") === "repeat",
        });
      }
      if (suppressForFocusMode && ((checkpointAlertToastEnabled && t.checkpointToastEnabled) || (checkpointAlertSoundEnabled && t.checkpointSoundEnabled))) {
        const toastMode = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
        noteSuppressedFocusModeAlert({
          title: `Checkpoint ${checkpointIndex}/${Math.max(1, totalCheckpoints)} Reached!`,
          text,
          autoCloseMs: checkpointAlertToastEnabled && t.checkpointToastEnabled
            ? (toastMode === "manual" ? null : 5000)
            : 5000,
          taskId,
          taskName: t.name || "",
          counterText: formatMainTaskElapsed(getElapsedMs(t)),
          checkpointTimeText,
          checkpointDescText,
          muteRepeatOnManualDismiss: checkpointAlertSoundEnabled && !!t.checkpointSoundEnabled && (t.checkpointSoundMode || "once") === "repeat",
        });
      }
      if (checkpointAlertSoundEnabled && t.checkpointSoundEnabled && !suppressForFocusMode) {
        beepCount += 1;
      }
    });
    const timeGoalSec = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0 ? Math.round(Number(t.timeGoalMinutes || 0) * 60) : 0;
    const taskTimeGoalAction = getTaskTimeGoalAction(t);
    if (
      timeGoalSec > 0 &&
      prevBaseline < timeGoalSec &&
      elapsedWholeSec >= timeGoalSec &&
      (taskTimeGoalAction === "resetLog" || taskTimeGoalAction === "resetNoLog")
    ) {
      shouldResetAtTimeGoal = taskTimeGoalAction;
    }
    if (
      timeGoalSec > 0 &&
      taskTimeGoalAction === "confirmModal" &&
      timeGoalModalTaskId !== taskId &&
      prevBaseline < timeGoalSec &&
      elapsedWholeSec >= timeGoalSec
    ) {
      shouldOpenTimeGoalModal = true;
    }
    if (
      timeGoalSec > 0 &&
      taskTimeGoalAction === "confirmModal" &&
      timeGoalModalTaskId !== taskId &&
      !shouldOpenTimeGoalModal &&
      Number(timeGoalReminderAtMsByTaskId[taskId] || 0) > 0 &&
      nowMs() >= Number(timeGoalReminderAtMsByTaskId[taskId] || 0) &&
      elapsedWholeSec >= timeGoalSec
    ) {
      shouldOpenTimeGoalModal = true;
      openTimeGoalModalAsReminder = true;
    }
    checkpointBaselineSecByTaskId[taskId] = elapsedWholeSec;
    if (beepCount > 0) {
      if ((t.checkpointSoundMode || "once") === "repeat") startCheckpointRepeatAlert(taskId);
      else enqueueCheckpointBeeps(beepCount);
    }
    if (shouldOpenTimeGoalModal) {
      if (shouldSuppressTaskAlertsInFocusMode(taskId)) {
        queueDeferredFocusModeTimeGoalModal(t, getTaskElapsedMs(t), { reminder: openTimeGoalModalAsReminder });
        return;
      }
      openTimeGoalCompleteModal(t, getTaskElapsedMs(t), { reminder: openTimeGoalModalAsReminder });
      checkpointBaselineSecByTaskId[taskId] = Math.floor(getElapsedMs(t) / 1000);
      return;
    }
    if (shouldResetAtTimeGoal) {
      resetTaskStateImmediate(t, {
        logHistory: shouldResetAtTimeGoal === "resetLog",
        sessionNote: captureResetActionSessionNote(String(t.id || "")),
      });
    }
  }

  function saveAddTaskCustomNames() {
    const next = {
      historyRangeDaysByTaskId,
      historyRangeModeByTaskId,
      pinnedHistoryTaskIds: Array.from(pinnedHistoryTaskIds),
      customTaskNames: addTaskCustomNames.slice(0, 5),
    } as any;
    cloudTaskUiCache = next;
    saveCloudTaskUi(next);
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

  function rememberCustomTaskName(name: string) {
    addTaskCustomNames = rememberRecentCustomTaskName(name, addTaskCustomNames, ADD_TASK_PRESET_NAMES, 5);
    saveAddTaskCustomNames();
  }

  function setAddTaskNameMenuOpen(open: boolean) {
    if (!els.addTaskNameMenu) return;
    (els.addTaskNameMenu as HTMLElement).style.display = open ? "block" : "none";
  }

  function renderAddTaskNameMenu(filterText = "") {
    const { custom, presets } = filterTaskNameOptions(addTaskCustomNames, ADD_TASK_PRESET_NAMES, filterText);

    if (els.addTaskNameCustomList) {
      els.addTaskNameCustomList.innerHTML = custom
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${escapeHtmlUI(name)}">${escapeHtmlUI(name)}</button>`)
        .join("");
    }
    if (els.addTaskNamePresetList) {
      els.addTaskNamePresetList.innerHTML = presets
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${escapeHtmlUI(name)}">${escapeHtmlUI(name)}</button>`)
        .join("");
    }
    const hasCustom = custom.length > 0;
    if (els.addTaskNameCustomTitle) (els.addTaskNameCustomTitle as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNameDivider) (els.addTaskNameDivider as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNamePresetTitle) (els.addTaskNamePresetTitle as HTMLElement).style.display = presets.length ? "block" : "none";
  }

  function setThemeMode(next: "purple" | "cyan") {
    applyTheme(next);
    persistPreferencesToCloud();
  }

  function setMenuButtonStyle(next: "parallelogram" | "square") {
    applyMenuButtonStyle(next);
    persistPreferencesToCloud();
  }

  function setGroupsStatus(message: string) {
    const nextMessage = String(message || "").trim();
    groupsStatusMessage = nextMessage || "Ready.";
    if (els.groupsFriendRequestStatus) {
      els.groupsFriendRequestStatus.textContent = groupsStatusMessage;
      (els.groupsFriendRequestStatus as HTMLElement).style.display =
        nextMessage && nextMessage !== "Ready." ? "block" : "none";
    }
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

  function beginGroupsLoading() {
    groupsLoadingDepth += 1;
    groupsLoading = true;
  }

  function endGroupsLoading() {
    groupsLoadingDepth = Math.max(0, groupsLoadingDepth - 1);
    groupsLoading = groupsLoadingDepth > 0;
  }

  type GroupsBusyResult<T> =
    | { ok: true; value: T; timedOut: false }
    | { ok: false; message: string; timedOut: boolean; error?: unknown };

  async function runGroupsBusy<T>(
    message: string,
    timeoutMessage: string,
    work: () => Promise<T>
  ): Promise<GroupsBusyResult<T>> {
    beginGroupsLoading();
    renderGroupsPage();
    let workingIndicatorKey: number | null = null;
    let indicatorDelayTimer = window.setTimeout(() => {
      workingIndicatorKey = showWorkingIndicator(message);
    }, 300);
    let timeoutHandle = 0 as number;
    try {
      const result = await Promise.race<
        | { kind: "value"; value: T }
        | { kind: "error"; error: unknown }
        | { kind: "timeout" }
      >([
        work()
          .then((value) => ({ kind: "value" as const, value }))
          .catch((error) => ({ kind: "error" as const, error })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timeoutHandle = window.setTimeout(() => resolve({ kind: "timeout" }), 60000);
        }),
      ]);
      if (result.kind === "timeout") {
        return { ok: false, message: timeoutMessage, timedOut: true };
      }
      if (result.kind === "error") {
        return { ok: false, message: "", timedOut: false, error: result.error };
      }
      return { ok: true, value: result.value, timedOut: false };
    } finally {
      if (indicatorDelayTimer) {
        window.clearTimeout(indicatorDelayTimer);
        indicatorDelayTimer = 0 as number;
      }
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      if (workingIndicatorKey != null) hideWorkingIndicator(workingIndicatorKey);
      endGroupsLoading();
      renderGroupsPage();
    }
  }

  async function loadGroupsSnapshot(uid: string) {
    const [incoming, outgoing, friendships] = await Promise.all([
      loadIncomingRequests(uid),
      loadOutgoingRequests(uid),
      loadFriendships(uid),
    ]);
    const profileEntries = await Promise.allSettled(
      friendships.map(async (row) => {
        const peerUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!peerUid) return null;
        const profile = await loadFriendProfile(peerUid);
        return [peerUid, profile] as const;
      })
    );
    const nextFriendProfileCache: Record<string, FriendProfile> = {};
    profileEntries.forEach((result) => {
      if (result.status !== "fulfilled" || !result.value) return;
      const [peerUid, profile] = result.value;
      if (!peerUid) return;
      nextFriendProfileCache[peerUid] = profile;
    });
    const [sharedForViewerResult, sharedForOwnerResult] = await Promise.allSettled([
      loadSharedTaskSummariesForViewer(uid),
      loadSharedTaskSummariesForOwner(uid),
    ]);
    return {
      incoming,
      outgoing,
      friendships,
      friendProfileCache: nextFriendProfileCache,
      sharedSummaries: sharedForViewerResult.status === "fulfilled" ? sharedForViewerResult.value || [] : [],
      ownSharedSummaries: sharedForOwnerResult.status === "fulfilled" ? sharedForOwnerResult.value || [] : [],
    };
  }

  function applyGroupsSnapshot(snapshot: Awaited<ReturnType<typeof loadGroupsSnapshot>>) {
    groupsIncomingRequests = snapshot.incoming;
    groupsOutgoingRequests = snapshot.outgoing;
    groupsFriendships = snapshot.friendships;
    friendProfileCacheByUid = snapshot.friendProfileCache;
    groupsSharedSummaries = snapshot.sharedSummaries;
    ownSharedSummaries = snapshot.ownSharedSummaries;
  }

  function syncOpenFriendSharedTaskUidsFromDom() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      if (details.open) openFriendSharedTaskUids.add(friendUid);
      else openFriendSharedTaskUids.delete(friendUid);
    });
  }

  function wireFriendSharedTaskDetailsState() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      details.addEventListener("toggle", () => {
        if (details.open) openFriendSharedTaskUids.add(friendUid);
        else openFriendSharedTaskUids.delete(friendUid);
      });
    });
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

  function openFriendRequestModal() {
    if (!els.friendRequestModal) return;
    (els.friendRequestModal as HTMLElement).style.display = "flex";
    if (els.friendRequestEmailInput) els.friendRequestEmailInput.value = "";
    setFriendRequestModalStatus("");
    window.setTimeout(() => {
      try {
        els.friendRequestEmailInput?.focus();
      } catch {
        // ignore
      }
    }, 0);
  }

  function closeFriendRequestModal() {
    if (!els.friendRequestModal) return;
    (els.friendRequestModal as HTMLElement).style.display = "none";
    setFriendRequestModalStatus("");
  }

  function setFriendRequestModalStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.friendRequestModalStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.friendRequestModalStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function closeFriendProfileModal() {
    if (!els.friendProfileModal) return;
    (els.friendProfileModal as HTMLElement).style.display = "none";
    activeFriendProfileUid = null;
    activeFriendProfileName = "";
  }

  function openFriendProfileModal(friendUid: string) {
    const uid = currentUid();
    if (!uid || !els.friendProfileModal) return;
    const targetUid = String(friendUid || "").trim();
    if (!targetUid) return;

    const rankedFriends = groupsFriendships
      .map((row) => {
        const peerUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!peerUid) return null;
        const profile = getMergedFriendProfile(peerUid, row.profileByUid?.[peerUid]);
        const alias = String(profile?.alias || "").trim() || peerUid;
        const rankThumbnailSrc = String(profile?.rankThumbnailSrc || "").trim();
        const currentRankId = String(profile?.currentRankId || "").trim() || "unranked";
        const avatarSrc = getFriendAvatarSrc(profile);
        const sharedCount = groupsSharedSummaries.filter((entry) => entry.ownerUid === peerUid).length;
        const createdAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        return { peerUid, alias, avatarSrc, rankThumbnailSrc, currentRankId, sharedCount, createdAtMs };
      })
      .filter(
        (row): row is {
          peerUid: string;
          alias: string;
          avatarSrc: string;
          rankThumbnailSrc: string;
          currentRankId: string;
          sharedCount: number;
          createdAtMs: number;
        } =>
          !!row
      )
      .sort((a, b) => {
        if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.peerUid.localeCompare(b.peerUid, undefined, { sensitivity: "base" });
      });

    const row = rankedFriends.find((entry) => entry.peerUid === targetUid);
    if (!row) return;
    const memberSinceText = Number.isFinite(row.createdAtMs) ? new Date(row.createdAtMs).toLocaleDateString() : "Unknown";

    if (els.friendProfileAvatar) {
      els.friendProfileAvatar.src = row.avatarSrc;
      els.friendProfileAvatar.alt = `${row.alias} avatar`;
    }
    if (els.friendProfileName) els.friendProfileName.textContent = row.alias;
    if (els.friendProfileRankImage) {
      const rankThumbnail = getRankThumbnailDescriptor(row.currentRankId);
      if (rankThumbnail.kind === "image") {
        els.friendProfileRankImage.src = rankThumbnail.src;
        els.friendProfileRankImage.style.display = "block";
        if (els.friendProfileRankPlaceholder) (els.friendProfileRankPlaceholder as HTMLElement).style.display = "none";
      } else {
        els.friendProfileRankImage.removeAttribute("src");
        els.friendProfileRankImage.style.display = "none";
        if (els.friendProfileRankPlaceholder) {
          (els.friendProfileRankPlaceholder as HTMLElement).textContent = rankThumbnail.label;
          (els.friendProfileRankPlaceholder as HTMLElement).style.display = "grid";
        }
      }
    }
    if (els.friendProfileRank) els.friendProfileRank.textContent = `Rank: ${getRankLabelById(row.currentRankId)}`;
    if (els.friendProfileMemberSince) els.friendProfileMemberSince.textContent = `Member since ${memberSinceText}`;
    activeFriendProfileUid = row.peerUid;
    activeFriendProfileName = row.alias;
    (els.friendProfileModal as HTMLElement).style.display = "flex";
  }

  function getTaskCreatedAtMs(taskId: string): number | null {
    const t = tasks.find((row) => String(row.id || "") === String(taskId));
    const raw = (t as any)?.createdAt;
    if (raw && typeof raw.toMillis === "function") return Math.max(0, Number(raw.toMillis()) || 0);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    const entries = (historyByTaskId[taskId] || []).slice();
    if (!entries.length) return null;
    const minTs = entries.reduce((min, e) => Math.min(min, normalizeHistoryTimestampMs(e?.ts)), Number.MAX_SAFE_INTEGER);
    return minTs > 0 && Number.isFinite(minTs) ? Math.floor(minTs) : null;
  }

  function computeTaskSharingMetrics(taskId: string): {
    createdAtMs: number | null;
    avgWeekMs: number;
    totalMs: number;
    focusTrend7dMs: number[];
    checkpointScaleMs: number | null;
  } {
    const weekStartMs = getCalendarWeekStartMs(new Date());
    const weekEntries = (historyByTaskId[taskId] || []).filter((e) => normalizeHistoryTimestampMs(e?.ts) >= weekStartMs);
    const weekTotalMs = weekEntries.reduce((sum, e) => sum + Math.max(0, Number(e?.ms || 0)), 0);
    const daysElapsed = Math.max(1, Math.floor((Date.now() - weekStartMs) / (24 * 60 * 60 * 1000)) + 1);
    const avgWeekMs = Math.floor(weekTotalMs / daysElapsed);
    const allHistoryMs = (historyByTaskId[taskId] || []).reduce((sum, e) => sum + Math.max(0, Number(e?.ms || 0)), 0);
    const task = tasks.find((row) => String(row.id || "") === String(taskId));
    const runningMs =
      task && task.running && Number.isFinite(Number(task.startMs))
        ? Math.max(0, Date.now() - Number(task.startMs || 0))
        : 0;
    const focusTrend7dMs = [0, 0, 0, 0, 0, 0, 0];
    weekEntries.forEach((e) => {
      const ts = normalizeHistoryTimestampMs(e?.ts);
      if (!ts) return;
      const dayIdx = new Date(ts).getDay();
      if (dayIdx >= 0 && dayIdx <= 6) {
        focusTrend7dMs[dayIdx] += Math.max(0, Number(e?.ms || 0));
      }
    });
    if (runningMs > 0) {
      const dayIdx = new Date().getDay();
      if (dayIdx >= 0 && dayIdx <= 6) {
        focusTrend7dMs[dayIdx] += runningMs;
      }
    }
    let checkpointScaleMs: number | null = null;
    if (task && Array.isArray((task as any).milestones) && (task as any).milestones.length) {
      const unitSec =
        (task as any).milestoneTimeUnit === "day"
          ? 86400
          : (task as any).milestoneTimeUnit === "minute"
            ? 60
            : 3600;
      const maxCheckpointUnits = (task as any).milestones.reduce((max: number, m: any) => {
        const hours = Number(m?.hours || 0);
        return Number.isFinite(hours) ? Math.max(max, hours) : max;
      }, 0);
      const candidate = Math.floor(maxCheckpointUnits * unitSec * 1000);
      checkpointScaleMs = candidate > 0 ? candidate : null;
    }
    return {
      createdAtMs: getTaskCreatedAtMs(taskId),
      avgWeekMs,
      totalMs: Math.floor(allHistoryMs + runningMs),
      focusTrend7dMs: focusTrend7dMs.map((v) => Math.max(0, Math.floor(Number(v) || 0))),
      checkpointScaleMs,
    };
  }

  function formatCompactDurationForSharedCard(msRaw: number): string {
    const totalMs = Math.max(0, Math.floor(Number(msRaw) || 0));
    let totalSeconds = Math.floor(totalMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    totalSeconds -= days * 86400;
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${String(days).padStart(2, "0")}d`);
    if (hours > 0) parts.push(`${String(hours).padStart(2, "0")}h`);
    if (minutes > 0) parts.push(`${String(minutes).padStart(2, "0")}m`);
    if (seconds > 0) parts.push(`${String(seconds).padStart(2, "0")}s`);
    if (!parts.length) parts.push("00s");
    return parts.join(" ");
  }

  function buildSharedTrendBarSvgMarkup(msByDay: number[], checkpointScaleMs?: number | null): string {
    const vals = new Array(7).fill(0).map((_, i) => Math.max(0, Number((msByDay || [])[i] || 0)));
    const scaleRef = Math.max(0, Number(checkpointScaleMs || 0));
    const maxVal = Math.max(...vals, 1);
    const width = 170;
    const height = 56;
    const padX = 6;
    const padY = 6;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;
    const step = usableW / 7;
    const barW = Math.max(6, Math.min(14, step - 4));
    const checkpointLines: string[] = [];
    if (scaleRef > 0) {
      let n = 1;
      while (n <= 8) {
        const yVal = scaleRef * n;
        if (yVal > maxVal) break;
        const y = padY + usableH - (usableH * yVal) / maxVal;
        checkpointLines.push(
          `<line class="friendSharedTrendCheckpointLine" x1="${padX.toFixed(1)}" y1="${y.toFixed(
            1
          )}" x2="${(padX + usableW).toFixed(1)}" y2="${y.toFixed(1)}" />`
        );
        n += 1;
      }
    }
    const bars = vals
      .map((v, i) => {
        const h = (usableH * v) / maxVal;
        const x = padX + i * step + (step - barW) / 2;
        const y = padY + usableH - h;
        return `<rect class="friendSharedTrendBar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
          1
        )}" height="${Math.max(1, h).toFixed(1)}" rx="1" ry="1" />`;
      })
      .join("");
    return `${checkpointLines.join("")}${bars}`;
  }

  function isTaskSharedByOwner(taskId: string): boolean {
    const uid = currentUid();
    if (!uid || !taskId) return false;
    return ownSharedSummaries.some((row) => row.ownerUid === uid && row.taskId === taskId);
  }

  function getSharedFriendUidsForTask(taskId: string): string[] {
    const uid = currentUid();
    if (!uid || !taskId) return [];
    return ownSharedSummaries.filter((row) => row.ownerUid === uid && row.taskId === taskId).map((row) => row.friendUid);
  }

  function setShareTaskStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.shareTaskStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.shareTaskStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function setShareTaskModalModeUi(opts: { mode: "share" | "unshare"; taskName: string; hasChoices?: boolean }) {
    const mode = opts.mode === "unshare" ? "unshare" : "share";
    const taskName = String(opts.taskName || "").trim() || "Untitled task";
    const hasChoices = opts.hasChoices !== false;
    const scopeField = (els.shareTaskScopeSelect?.parentElement as HTMLElement | null) || null;
    const friendsField = els.shareTaskFriendsField as HTMLElement | null;
    const friendsLabel = friendsField?.querySelector("label") as HTMLElement | null;
    if (els.shareTaskTitle) {
      els.shareTaskTitle.textContent = mode === "unshare" ? `Unshare "${taskName}"` : `Share "${taskName}"`;
    }
    const subtextEl = (els.shareTaskTitle?.nextElementSibling as HTMLElement | null) || null;
    if (subtextEl && subtextEl.classList.contains("shareTaskModalSubtext")) {
      subtextEl.textContent =
        mode === "unshare"
          ? "Choose which friends should no longer receive this task and its live progress."
          : "Choose who should receive this task and its live progress.";
    }
    if (scopeField) scopeField.style.display = mode === "share" ? "grid" : "none";
    if (friendsField) friendsField.style.display = mode === "share" ? (isShareTaskSpecificScopeSelected() ? "grid" : "none") : "grid";
    if (friendsLabel) {
      friendsLabel.textContent = mode === "unshare" ? "Select friend(s) to unshare" : "Select friend(s)";
    }
    if (els.shareTaskConfirmBtn) {
      els.shareTaskConfirmBtn.textContent = mode === "unshare" ? "Unshare" : "Share";
      els.shareTaskConfirmBtn.disabled = !hasChoices;
    }
  }

  function renderShareTaskFriendOptions() {
    const listEl = els.shareTaskFriendsList as HTMLElement | null;
    if (!listEl) return;
    const uid = currentUid();
    const mode = shareTaskMode === "unshare" ? "unshare" : "share";
    let rows: Array<{ friendUid: string; alias: string }> = [];
    if (uid && groupsFriendships.length) {
      rows = groupsFriendships
        .map((row) => {
          const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
          if (!friendUid) return null;
          const alias = String(row.profileByUid?.[friendUid]?.alias || "").trim() || friendUid;
          return { friendUid, alias };
        })
        .filter((row): row is { friendUid: string; alias: string } => !!row);
    }
    if (mode === "unshare") {
      const activeTaskId = String(shareTaskTaskId || "").trim();
      const targetUids = new Set(getSharedFriendUidsForTask(activeTaskId));
      rows = rows.filter((row) => targetUids.has(row.friendUid));
      if (!rows.length && activeTaskId) {
        rows = ownSharedSummaries
          .filter((row) => row.ownerUid === uid && row.taskId === activeTaskId)
          .map((row) => ({ friendUid: row.friendUid, alias: String(row.friendUid || "").trim() || "Unknown friend" }));
      }
    }
    if (!uid || !rows.length) {
      listEl.innerHTML = `<div class="settingsDetailNote isEmptyStatus">${
        mode === "unshare" ? "This task is not currently shared with any friends." : "No friends available."
      }</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((row) => {
        const friendUid = row.friendUid;
        const alias = row.alias;
        const inputId = `shareFriend_${escapeHtmlUI(friendUid)}`;
        return `<label class="shareTaskFriendOption" for="${inputId}">
          <input id="${inputId}" type="checkbox" data-share-friend-uid="${escapeHtmlUI(friendUid)}" />
          <span>${escapeHtmlUI(alias)}</span>
        </label>`;
      })
      .join("");
  }

  function isShareTaskSpecificScopeSelected() {
    return String(els.shareTaskScopeSelect?.value || "all") === "specific";
  }

  function syncShareTaskScopeUi() {
    if (shareTaskMode === "unshare") {
      if (els.shareTaskFriendsField) {
        (els.shareTaskFriendsField as HTMLElement).style.display = "grid";
      }
      return;
    }
    const specificMode = isShareTaskSpecificScopeSelected();
    if (els.shareTaskFriendsField) {
      (els.shareTaskFriendsField as HTMLElement).style.display = specificMode ? "grid" : "none";
    }
  }

  function closeShareTaskModal() {
    if (!els.shareTaskModal) return;
    (els.shareTaskModal as HTMLElement).style.display = "none";
    shareTaskIndex = null;
    shareTaskTaskId = null;
    shareTaskMode = "share";
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    if (els.shareTaskConfirmBtn) els.shareTaskConfirmBtn.disabled = false;
    setShareTaskStatus("");
  }

  function openShareTaskModal(taskIndex: number) {
    const t = tasks[taskIndex];
    if (!t) return;
    shareTaskIndex = taskIndex;
    shareTaskTaskId = String(t.id || "").trim();
    shareTaskMode = "share";
    setShareTaskModalModeUi({ mode: "share", taskName: String(t.name || "").trim() || "Untitled task", hasChoices: true });
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    syncShareTaskScopeUi();
    renderShareTaskFriendOptions();
    const uid = currentUid();
    if (uid && !groupsFriendships.length) {
      void loadFriendships(uid)
        .then((rows) => {
          groupsFriendships = rows || [];
          renderShareTaskFriendOptions();
        })
        .catch(() => {});
    }
    setShareTaskStatus("");
    if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
  }

  function openUnshareTaskModal(taskId: string) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const taskName =
      String(tasks.find((row) => String(row.id || "").trim() === normalizedTaskId)?.name || "").trim() ||
      String(ownSharedSummaries.find((row) => String(row.taskId || "").trim() === normalizedTaskId)?.taskName || "").trim() ||
      "Untitled task";
    shareTaskIndex = null;
    shareTaskTaskId = normalizedTaskId;
    shareTaskMode = "unshare";
    const openModal = () => {
      const targetCount = getSharedFriendUidsForTask(normalizedTaskId).length;
      setShareTaskModalModeUi({ mode: "unshare", taskName, hasChoices: targetCount > 0 });
      renderShareTaskFriendOptions();
      setShareTaskStatus(targetCount > 0 ? "" : "This task is not currently shared with any friends.");
      if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
    };
    if (currentUid() && !groupsFriendships.length) {
      void loadFriendships(String(currentUid() || ""))
        .then((rows) => {
          groupsFriendships = rows || [];
          openModal();
        })
        .catch(() => openModal());
      return;
    }
    openModal();
  }

  async function refreshOwnSharedSummaries() {
    const uid = currentUid();
    if (!uid) {
      ownSharedSummaries = [];
      return;
    }
    try {
      ownSharedSummaries = await loadSharedTaskSummariesForOwner(uid);
    } catch {
      ownSharedSummaries = [];
    }
  }

  function getOwnedSharedSummaryMismatchedTaskIds(): string[] {
    const uid = String(currentUid() || "");
    if (!uid || !Array.isArray(ownSharedSummaries) || !ownSharedSummaries.length) return [];
    const runningByTaskId = new Map<string, boolean>();
    (tasks || []).forEach((t) => {
      const taskId = String(t?.id || "").trim();
      if (!taskId) return;
      runningByTaskId.set(taskId, !!t.running);
    });
    const mismatched = new Set<string>();
    ownSharedSummaries.forEach((row) => {
      const ownerUid = String(row?.ownerUid || "").trim();
      if (!ownerUid || ownerUid !== uid) return;
      const taskId = String(row?.taskId || "").trim();
      if (!taskId || !runningByTaskId.has(taskId)) return;
      const summaryRunning = String(row?.timerState || "").trim().toLowerCase() === "running";
      const taskRunning = !!runningByTaskId.get(taskId);
      if (summaryRunning !== taskRunning) mismatched.add(taskId);
    });
    return Array.from(mismatched);
  }

  async function reconcileOwnedSharedSummaryStates() {
    const mismatchedTaskIds = getOwnedSharedSummaryMismatchedTaskIds();
    if (!mismatchedTaskIds.length) return;
    await syncSharedTaskSummariesForTasks(mismatchedTaskIds);
  }

  async function syncSharedTaskSummariesForTask(taskId: string) {
    const uid = currentUid();
    if (!uid || !taskId) return;
    const t = tasks.find((row) => String(row.id || "") === String(taskId));
    if (!t) return;
    const friendUids = getSharedFriendUidsForTask(taskId);
    if (!friendUids.length) return;
    const metrics = computeTaskSharingMetrics(taskId);
    const taskMode = taskModeOf(t);
    await Promise.all(
      friendUids.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId,
          taskName: String(t.name || ""),
          taskMode,
          timerState: t.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
        })
      )
    );
    await refreshOwnSharedSummaries();
  }

  async function syncSharedTaskSummariesForTasks(taskIds: string[]) {
    const ids = Array.from(new Set((taskIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return;
    await Promise.all(ids.map((id) => syncSharedTaskSummariesForTask(id).catch(() => {})));
  }

  async function submitShareTaskModal() {
    const uid = currentUid();
    const activeMode = shareTaskMode === "unshare" ? "unshare" : "share";
    if (!uid) return;
    if (activeMode === "share" && shareTaskIndex == null) return;
    const activeTaskId =
      activeMode === "share" ? String(tasks[shareTaskIndex!]?.id || "").trim() : String(shareTaskTaskId || "").trim();
    const shareTask = activeMode === "share" && shareTaskIndex != null ? tasks[shareTaskIndex] : null;
    if (!activeTaskId || (activeMode === "share" && !shareTask)) return;
    const selectedTargets = Array.from(
      (els.shareTaskFriendsList as HTMLElement | null)?.querySelectorAll<HTMLInputElement>("[data-share-friend-uid]:checked") || []
    )
      .map((el) => String(el.getAttribute("data-share-friend-uid") || "").trim())
      .filter(Boolean);
    if (activeMode === "unshare") {
      if (!selectedTargets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
      const results = await Promise.allSettled(selectedTargets.map((friendUid) => deleteSharedTaskSummary(uid, friendUid, activeTaskId)));
      const failures = results.filter((row) => row.status === "rejected");
      await refreshOwnSharedSummaries();
      render();
      if (!failures.length) {
        setShareTaskStatus("Task unshared successfully.", "success");
        window.setTimeout(() => closeShareTaskModal(), 500);
        return;
      }
      setShareTaskStatus(
        `Unshared with ${selectedTargets.length - failures.length} friend(s). ${failures.length} failed.`,
        "error"
      );
      return;
    }
    const specificMode = isShareTaskSpecificScopeSelected();
    if (!groupsFriendships.length) {
      try {
        groupsFriendships = await loadFriendships(uid);
      } catch {
        groupsFriendships = [];
      }
    }
    let targets: string[] = [];
    if (specificMode) {
      targets = selectedTargets;
      if (!targets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
    } else {
      targets = groupsFriendships.map((row) => (row.users[0] === uid ? row.users[1] : row.users[0])).filter(Boolean);
      if (!targets.length) {
        setShareTaskStatus("No friends available to share with.", "error");
        return;
      }
    }
    if (!shareTask) return;
    const metrics = computeTaskSharingMetrics(activeTaskId);
    const taskMode = taskModeOf(shareTask);
    const writes = await Promise.all(
      targets.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId: activeTaskId,
          taskName: String(shareTask.name || ""),
          taskMode,
          timerState: shareTask.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
        })
      )
    );
    const failures = writes.filter((row) => !row.ok).length;
    if (failures) {
      const firstFailure = writes.find((row) => !row.ok);
      const reason = String(firstFailure?.message || "").trim();
      setShareTaskStatus(
        `Shared with ${writes.length - failures} friend(s). ${failures} failed.${reason ? ` ${reason}` : ""}`,
        "error"
      );
    }
    else setShareTaskStatus("Task shared successfully.", "success");
    await refreshOwnSharedSummaries();
    render();
    if (!failures) window.setTimeout(() => closeShareTaskModal(), 500);
  }

  function renderGroupsRequestsList(
    container: HTMLElement | null,
    rows: FriendRequest[],
    opts: { incoming: boolean }
  ) {
    const titleEl = (opts.incoming ? els.groupsIncomingRequestsTitle : els.groupsOutgoingRequestsTitle) as HTMLElement | null;
    const detailsEl = (opts.incoming ? els.groupsIncomingRequestsDetails : els.groupsOutgoingRequestsDetails) as HTMLDetailsElement | null;
    const titleSuffix = opts.incoming ? "Incoming Requests" : "Outgoing Requests";
    if (titleEl) titleEl.textContent = `${rows.length} ${titleSuffix}`;
    if (detailsEl) detailsEl.open = rows.length > 0;
    if (!container) return;
    if (!rows.length) {
      container.classList.add("isEmptyStatus");
      container.textContent = opts.incoming ? "No incoming requests." : "No outgoing requests.";
      return;
    }
    container.classList.remove("isEmptyStatus");
    container.innerHTML = rows
      .map((row) => {
        const peerAliasRaw = opts.incoming ? row.senderAlias : row.receiverAlias;
        const peerEmail = opts.incoming ? row.senderEmail : row.receiverEmail;
        const peerAlias = String(peerAliasRaw || "").trim() || String(peerEmail || "").trim() || "Unknown user";
        const requestedAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        const requestedDate = Number.isFinite(requestedAtMs) ? new Date(requestedAtMs).toLocaleString() : "Unknown";
        const status = String(row.status || "pending");
        const statusLabel = status[0].toUpperCase() + status.slice(1);
        const disabledAttr = groupsLoading ? ' disabled aria-disabled="true"' : "";
        const actionBtns =
          status !== "pending"
            ? ""
            : opts.incoming
              ? `<div class="footerBtns groupsIncomingRequestActions"><button class="btn btn-ghost small" type="button" data-friend-action="decline" data-request-id="${escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Decline</button><button class="btn btn-accent small" type="button" data-friend-action="approve" data-request-id="${escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Approve</button></div>`
              : `<div class="footerBtns"><button class="btn btn-ghost small" type="button" data-friend-action="cancel" data-request-id="${escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Cancel request</button></div>`;
        const identityAvatarSrc = opts.incoming
          ? getFriendAvatarSrcById(String(row.senderAvatarId || "").trim())
          : buildFriendInitialAvatarDataUrl(peerAlias);
        const identityHtml = `<div class="friendRequestIdentityRow">
          <img src="${escapeHtmlUI(identityAvatarSrc)}" alt="" aria-hidden="true" class="friendRequestAvatar" />
          <div class="friendRequestIdentityText">
            <div class="friendRequestAlias">${escapeHtmlUI(peerAlias)}</div>
          </div>
        </div>`;
        if (opts.incoming) {
          const incomingSentence = `<b>${escapeHtmlUI(peerAlias)}</b> has sent you a friend request!`;
          return `<div class="settingsDetailNote"><div>${incomingSentence}</div><div>Date Requested: ${escapeHtmlUI(
            requestedDate
          )}</div>${identityHtml}${actionBtns}</div>`;
        }
        return `<div class="settingsDetailNote"><div><b>${escapeHtmlUI(statusLabel)}</b></div>${identityHtml}${actionBtns}</div>`;
      })
      .join("");
  }

  function renderGroupsFriendsList() {
    if (!els.groupsFriendsList) return;
    syncOpenFriendSharedTaskUidsFromDom();
    const uid = currentUid();
    if (!uid) {
      openFriendSharedTaskUids.clear();
      els.groupsFriendsList.textContent = "Sign in to view friends.";
      return;
    }
    if (!groupsFriendships.length) {
      openFriendSharedTaskUids.clear();
      els.groupsFriendsList.textContent = "No friends yet.";
      return;
    }
    const friendRows = groupsFriendships
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        const profile = getMergedFriendProfile(friendUid, row.profileByUid?.[friendUid]);
        const alias = String(profile?.alias || "").trim() || friendUid;
        const avatarSrc = getFriendAvatarSrc(profile);
        const summaries = groupsSharedSummaries.filter((entry) => entry.ownerUid === friendUid);
        const isOpen = openFriendSharedTaskUids.has(friendUid);
        return { friendUid, alias, avatarSrc, summaries, isOpen };
      })
      .sort((a, b) => {
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.friendUid.localeCompare(b.friendUid, undefined, { sensitivity: "base" });
      });

    const visibleFriendUids = new Set(friendRows.map((row) => row.friendUid).filter(Boolean));
    openFriendSharedTaskUids.forEach((friendUid) => {
      if (!visibleFriendUids.has(friendUid)) openFriendSharedTaskUids.delete(friendUid);
    });

    els.groupsFriendsList.innerHTML = friendRows
      .map((row) => {
        const summaryHtml = row.summaries
          .map((entry) => {
            const createdDate =
              entry.taskCreatedAtMs != null && Number.isFinite(Number(entry.taskCreatedAtMs))
                ? new Date(Number(entry.taskCreatedAtMs)).toLocaleDateString()
                : "Unknown";
            const timerState = String(entry.timerState || "stopped").toLowerCase() === "running" ? "Running" : "Stopped";
            const timerStateKey = timerState.toLowerCase() === "running" ? "running" : "stopped";
            const timerStateClass =
              String(entry.timerState || "stopped").toLowerCase() === "running"
                ? "friendSharedTaskState isRunning"
                : "friendSharedTaskState isStopped";
            const trendBars = buildSharedTrendBarSvgMarkup(entry.focusTrend7dMs || [], (entry as any).checkpointScaleMs);
            return `<div class="friendSharedTaskCard friendSharedTaskCardState-${escapeHtmlUI(timerStateKey)}">
              <div class="friendSharedTaskCardLayout">
                <div class="friendSharedTaskInfo">
                  <div class="friendSharedTaskTitle">${escapeHtmlUI(entry.taskName)}</div>
                  <div class="friendSharedTaskMeta">Status: <span class="${timerStateClass}">${escapeHtmlUI(timerState)}</span></div>
                  <div class="friendSharedTaskMeta">Created: ${escapeHtmlUI(createdDate)}</div>
                  <div class="friendSharedTaskMeta">Daily avg: ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(entry.avgTimeLoggedThisWeekMs || 0))
                  )}</div>
                  <div class="friendSharedTaskMeta">Total logged: ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(entry.totalTimeLoggedMs || 0))
                  )}</div>
                </div>
                <div class="friendSharedTaskTrend" aria-label="Focus Trend chart">
                  <div class="friendSharedTaskTrendLabel">Focus Trend</div>
                  <svg viewBox="0 0 170 56" role="img" aria-label="Focus trend over this week">
                    ${trendBars}
                  </svg>
                  <div class="friendSharedTaskTrendDays" aria-hidden="true">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                </div>
              </div>
            </div>`;
          })
          .join("");
        const taskCount = row.summaries.length;
        const sharedCountLabel = `${taskCount} task${taskCount === 1 ? "" : "s"} shared with you`;
        return `<div class="friendEntryWrap">
          <details class="friendSharedTasksDetails" data-friend-uid="${escapeHtmlUI(row.friendUid)}"${row.isOpen ? " open" : ""}>
            <summary class="settingsDetailNote friendIdentityRow">
              <span class="friendIdentityProfileBtn friendIdentityAvatarBtn" role="button" tabindex="0" data-friend-profile-open="${escapeHtmlUI(
                row.friendUid
              )}" aria-label="Open ${escapeHtmlUI(row.alias)} profile">
                <img src="${escapeHtmlUI(row.avatarSrc)}" alt="" aria-hidden="true" class="friendIdentityAvatar" />
              </span>
              <span class="friendIdentityProfileBtn friendIdentityNameBtn" role="button" tabindex="0" data-friend-profile-open="${escapeHtmlUI(
                row.friendUid
              )}" aria-label="Open ${escapeHtmlUI(row.alias)} profile">
                <span class="friendIdentityNameBlock">
                  <span class="friendIdentityName">${escapeHtmlUI(row.alias)}</span>
                </span>
              </span>
              <span class="friendSharedTasksCountText">${escapeHtmlUI(sharedCountLabel)}</span>
            </summary>
            <div class="friendSharedTasksSection">
              ${
                summaryHtml
                  ? `<div class="friendSharedTasksGrid">${summaryHtml}</div>`
                  : `<div class="settingsDetailNote sharedTasksEmpty">No shared tasks.</div>`
              }
            </div>
          </details>
        </div>`;
      })
      .join("");
    wireFriendSharedTaskDetailsState();
  }

  function renderGroupsSharedByYouList() {
    const container = els.groupsSharedByYouList as HTMLElement | null;
    const titleEl = els.groupsSharedByYouTitle as HTMLElement | null;
    if (!container) return;
    const uniqueSharedTaskCount = new Set(
      ownSharedSummaries.map((entry) => String(entry.taskId || "").trim()).filter(Boolean)
    ).size;
    if (titleEl) {
      titleEl.textContent = `${uniqueSharedTaskCount} shared by you`;
    }
    if (!ownSharedSummaries.length) {
      container.classList.add("sharedTasksEmpty");
      container.textContent = "No shared tasks.";
      return;
    }

    const uid = currentUid();
    const friendNameByUid = new Map<string, string>();
    groupsFriendships.forEach((friendship) => {
      const users = friendship.users;
      if (!uid || users.indexOf(uid) === -1) return;
      const friendUid = users[0] === uid ? users[1] : users[0];
      if (!friendUid) return;
      const alias = String(friendship.profileByUid?.[friendUid]?.alias || "").trim();
      friendNameByUid.set(friendUid, alias || friendUid);
    });

    const sharedByTaskId = new Map<
      string,
      { taskId: string; taskName: string; taskMode: "mode1" | "mode2" | "mode3"; friendLabels: string[] }
    >();
    ownSharedSummaries.forEach((entry) => {
      const taskId = String(entry.taskId || "").trim();
      if (!taskId) return;
      const friendLabel = friendNameByUid.get(entry.friendUid) || String(entry.friendUid || "").trim() || "Unknown friend";
      const taskMode: "mode1" | "mode2" | "mode3" =
        entry.taskMode === "mode2" || entry.taskMode === "mode3" ? entry.taskMode : "mode1";
      const existing = sharedByTaskId.get(taskId);
      if (existing) {
        if (existing.friendLabels.indexOf(friendLabel) === -1) existing.friendLabels.push(friendLabel);
        return;
      }
      sharedByTaskId.set(taskId, {
        taskId,
        taskName: String(entry.taskName || "").trim() || "Untitled task",
        taskMode,
        friendLabels: [friendLabel],
      });
    });

    const listHtml = Array.from(sharedByTaskId.values())
      .sort((a, b) => a.taskName.localeCompare(b.taskName, undefined, { sensitivity: "base" }))
      .map((entry) => {
        const friendLabel = entry.friendLabels
          .slice()
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          .join(", ");
        return `<div class="friendSharedTaskCard isJumpCard friendSharedTaskCardMode-${escapeHtmlUI(
          entry.taskMode
        )}" role="button" tabindex="0" data-shared-owned-task-id="${escapeHtmlUI(entry.taskId)}" title="Open task">
          <div class="friendSharedTaskInfo">
            <div class="friendSharedTaskTitle">${escapeHtmlUI(entry.taskName)}</div>
            <div class="friendSharedTaskMeta">Shared with: ${escapeHtmlUI(friendLabel)}</div>
          </div>
          <div class="friendSharedTaskActions">
            <button class="btn btn-ghost small" type="button" data-friend-action="open-unshare-task" data-task-id="${escapeHtmlUI(entry.taskId)}">Unshare</button>
          </div>
        </div>`;
      })
      .join("");

    container.classList.remove("sharedTasksEmpty");
    container.innerHTML = `<div class="friendSharedTasksGrid">${listHtml}</div>`;
  }

  function renderGroupsPage() {
    renderFriendsFooterAlertBadge();
    renderGroupsRequestsList(els.groupsIncomingRequestsList as HTMLElement | null, groupsIncomingRequests, { incoming: true });
    renderGroupsRequestsList(els.groupsOutgoingRequestsList as HTMLElement | null, groupsOutgoingRequests, { incoming: false });
    renderGroupsFriendsList();
    renderGroupsSharedByYouList();
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = groupsLoading;
    if (els.friendRequestSendBtn) els.friendRequestSendBtn.disabled = groupsLoading;
    if (els.friendProfileDeleteBtn) els.friendProfileDeleteBtn.disabled = groupsLoading;
  }

  function renderFriendsFooterAlertBadge() {
    const badgeEl = els.footerTest2AlertBadge as HTMLElement | null;
    if (!badgeEl) return;
    const uid = currentUid();
    const count = uid ? Math.max(0, Number(groupsIncomingRequests.length) || 0) : 0;
    if (count <= 0) {
      badgeEl.style.display = "none";
      badgeEl.textContent = "";
      badgeEl.setAttribute("aria-label", "No incoming friend requests");
      return;
    }
    const countLabel = count > 99 ? "99+" : String(count);
    badgeEl.style.display = "inline-flex";
    badgeEl.textContent = countLabel;
    badgeEl.setAttribute("aria-label", `${count} incoming friend request${count === 1 ? "" : "s"}`);
  }

  async function refreshGroupsData(opts?: { preserveStatus?: boolean }) {
    const uid = currentUid();
    if (!uid) {
      groupsIncomingRequests = [];
      groupsOutgoingRequests = [];
      groupsFriendships = [];
      groupsSharedSummaries = [];
      ownSharedSummaries = [];
      friendProfileCacheByUid = {};
      setGroupsStatus("Sign in to use Groups.");
      renderGroupsPage();
      return;
    }
    const refreshSeq = ++groupsRefreshSeq;
    try {
      const snapshot = await loadGroupsSnapshot(uid);
      if (refreshSeq !== groupsRefreshSeq) return;
      applyGroupsSnapshot(snapshot);
      if (!opts?.preserveStatus) setGroupsStatus("Ready.");
    } catch {
      if (refreshSeq !== groupsRefreshSeq) return;
      if (!opts?.preserveStatus) setGroupsStatus("Could not load friend data.");
    } finally {
      renderGroupsPage();
    }
  }

  async function handleSendFriendRequest() {
    const uid = currentUid();
    const auth = getFirebaseAuthClient();
    const email = auth?.currentUser?.email || null;
    const receiverEmail = String(els.friendRequestEmailInput?.value || "").trim();
    setFriendRequestModalStatus("");
    setGroupsStatus("Sending request...");
    const result = await runGroupsBusy("Sending friend request...", "Friend request timed out. Please try again.", () =>
      sendFriendRequest(uid, email, receiverEmail)
    );
    if (!result.ok) {
      const message = result.timedOut ? result.message : "Could not send friend request.";
      setFriendRequestModalStatus(`Friend request failed: ${message}`, "error");
      setGroupsStatus(message);
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      const failureMessage = result.value.message || "Could not find a matching email.";
      setFriendRequestModalStatus(`Friend request failed: ${failureMessage}`, "error");
      setGroupsStatus(failureMessage);
      renderGroupsPage();
      return;
    }
    setFriendRequestModalStatus("Friend request success.", "success");
    setGroupsStatus("Friend request sent.");
    renderGroupsPage();
    void refreshGroupsData({ preserveStatus: true });
    window.setTimeout(() => {
      closeFriendRequestModal();
    }, 700);
  }

  async function handleFriendRequestAction(requestId: string, action: "approve" | "decline" | "cancel") {
    const uid = currentUid();
    if (!uid || !requestId) return;
    const pendingStatus =
      action === "approve" ? "Approving request..." : action === "decline" ? "Declining request..." : "Cancelling request...";
    setGroupsStatus(pendingStatus);
    const timeoutStatus =
      action === "approve"
        ? "Approving request timed out. Please try again."
        : action === "decline"
          ? "Declining request timed out. Please try again."
          : "Cancelling request timed out. Please try again.";
    const result = await runGroupsBusy(pendingStatus, timeoutStatus, async () =>
      action === "approve"
        ? await approveFriendRequest(requestId, uid)
        : action === "decline"
          ? await declineFriendRequest(requestId, uid)
          : await cancelOutgoingFriendRequest(requestId, uid)
    );
    if (!result.ok) {
      setGroupsStatus(result.timedOut ? result.message : "Could not update friend request.");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      setGroupsStatus(result.value.message || "Action failed.");
      renderGroupsPage();
      return;
    }
    const completeStatus =
      action === "approve"
        ? "Friend request approved."
        : action === "decline"
          ? "Friend request declined."
          : "Friend request cancelled.";
    setGroupsStatus(completeStatus);
    renderGroupsPage();
    void refreshGroupsData({ preserveStatus: true });
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

  function applyAppPage(page: AppPage, opts?: { pushNavStack?: boolean; syncUrl?: "replace" | "push" | false }) {
    if (currentAppPage === "tasks" && page !== "tasks") resetAllOpenHistoryChartSelections();
    if (page !== "tasks") clearTaskFlipStates();
    currentAppPage = page;
    if (opts?.pushNavStack) pushCurrentScreenToNavStack(page);
    document.body.setAttribute("data-app-page", page);
    els.appPageTasks?.classList.toggle("appPageOn", page === "tasks");
    els.appPageDashboard?.classList.toggle("appPageOn", page === "dashboard");
    els.appPageTest1?.classList.toggle("appPageOn", page === "test1");
    els.appPageTest2?.classList.toggle("appPageOn", page === "test2");
    if (els.modeSwitch) (els.modeSwitch as HTMLElement).style.display = page === "tasks" ? "flex" : "none";
    els.footerTasksBtn?.classList.toggle("isOn", page === "tasks");
    els.footerDashboardBtn?.classList.toggle("isOn", page === "dashboard");
    els.footerTest1Btn?.classList.toggle("isOn", page === "test1");
    els.footerTest2Btn?.classList.toggle("isOn", page === "test2");
    els.commandCenterTasksBtn?.classList.toggle("isOn", page === "tasks");
    els.commandCenterDashboardBtn?.classList.toggle("isOn", page === "dashboard");
    els.commandCenterGroupsBtn?.classList.toggle("isOn", page === "test2");
    if (els.commandCenterDashboardBtn) {
      if (page === "dashboard") els.commandCenterDashboardBtn.setAttribute("aria-current", "page");
      else els.commandCenterDashboardBtn.removeAttribute("aria-current");
    }
    if (els.signedInHeaderBadge) {
      els.signedInHeaderBadge.style.display = "inline-flex";
    }
    renderFriendsFooterAlertBadge();
    const syncUrlMode = opts?.syncUrl;
    const canSyncMainPageUrl = isTaskTimerMainAppPath(normalizedPathname());
    if (syncUrlMode && canSyncMainPageUrl) {
      try {
        const nextUrl = appPathForPage(page);
        if (syncUrlMode === "replace") window.history.replaceState({ page }, "", nextUrl);
        else window.history.pushState({ page }, "", nextUrl);
      } catch {
        // ignore history API failures
      }
    }
    closeTaskExportModal();
    closeShareTaskModal();
    if (page === "test2") {
      renderGroupsPage();
      void refreshGroupsData();
      return;
    }
    closeFriendProfileModal();
    closeFriendRequestModal();
    if (page === "tasks") {
      render();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (runtime.destroyed || currentAppPage !== "tasks") return;
          for (const taskId of openHistoryTaskIds) {
            renderHistory(taskId);
          }
        });
      });
      return;
    }
    if (page === "dashboard") {
      renderDashboardWidgets();
    }
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
    const setAddTaskError = (msg: string) => {
      if (!els.addTaskError) return;
      els.addTaskError.textContent = msg;
      els.addTaskError.classList.toggle("isOn", !!String(msg || "").trim());
    };
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
      saveDashboardWidgetState({
        cardSizes: getDashboardCardSizeMapForStorage(),
        avgSessionByTaskRange: dashboardAvgRange,
      });
      if (!isModeEnabled(currentMode)) applyMainMode("mode1");
      else applyModeAccent(currentMode);
      if (!isModeEnabled(editMoveTargetMode)) editMoveTargetMode = "mode1";
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
      if (opts?.closeOverlay) closeOverlay(els.categoryManagerOverlay as HTMLElement | null);
      else render();
    };
    const syncAddTaskMilestonesUi = () => {
      els.addTaskMsToggle?.classList.toggle("on", addTaskMilestonesEnabled);
      els.addTaskMsToggle?.setAttribute("aria-checked", String(addTaskMilestonesEnabled));
      els.addTaskMsArea?.classList.toggle("on", addTaskMilestonesEnabled);
      setAddTaskMilestoneUnitUi(addTaskMilestoneTimeUnit);
      syncAddTaskCheckpointAlertUi();
    };

    const syncAddTaskDurationUi = () => {
      addTaskNoTimeGoal = !!els.addTaskNoGoalCheckbox?.checked;
      if (els.addTaskStep2NextBtn) {
        els.addTaskStep2NextBtn.textContent = addTaskNoTimeGoal ? "Done" : "Next";
      }
      els.addTaskDurationRow?.classList.toggle("isDisabled", addTaskNoTimeGoal);
      els.addTaskDurationReadout?.classList.toggle("isDisabled", addTaskNoTimeGoal);
      if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.disabled = addTaskNoTimeGoal;
      if (addTaskNoTimeGoal) {
        const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
          if (!btn) return;
          btn.classList.toggle("isOn", isOn);
          btn.classList.toggle("isHidden", hidden);
          btn.disabled = true;
          btn.setAttribute("aria-pressed", isOn ? "true" : "false");
          btn.setAttribute("aria-hidden", hidden ? "true" : "false");
        };
        syncPill(els.addTaskDurationUnitMinute, addTaskDurationUnit === "minute");
        syncPill(els.addTaskDurationUnitHour, addTaskDurationUnit === "hour");
        syncPill(els.addTaskDurationPeriodDay, addTaskDurationPeriod === "day", Number(addTaskDurationValue) > getAddTaskDurationMaxForPeriod(addTaskDurationUnit, "day"));
        syncPill(els.addTaskDurationPeriodWeek, addTaskDurationPeriod === "week");
        syncAddTaskDurationReadout();
        return;
      }
      const parsedValue = Math.max(0, Math.floor(parseFloat(els.addTaskDurationValueInput?.value || "0") || 0));
      addTaskDurationValue = parsedValue;
      const maxDay = getAddTaskDurationMaxForPeriod(addTaskDurationUnit, "day");
      const canUseDay = Number(addTaskDurationValue) <= maxDay;
      addTaskDurationPeriod = canUseDay && addTaskDurationPeriod === "day" ? "day" : "week";
      if (els.addTaskDurationValueInput && String(parsedValue || "") !== String(els.addTaskDurationValueInput.value || "")) {
        els.addTaskDurationValueInput.value = String(parsedValue || 0);
      }
      const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
        if (!btn) return;
        btn.classList.toggle("isOn", isOn);
        btn.classList.toggle("isHidden", hidden);
        btn.disabled = hidden;
        btn.setAttribute("aria-pressed", isOn ? "true" : "false");
        btn.setAttribute("aria-hidden", hidden ? "true" : "false");
      };
      syncPill(els.addTaskDurationUnitMinute, addTaskDurationUnit === "minute");
      syncPill(els.addTaskDurationUnitHour, addTaskDurationUnit === "hour");
      syncPill(els.addTaskDurationPeriodDay, addTaskDurationPeriod === "day", !canUseDay);
      syncPill(els.addTaskDurationPeriodWeek, addTaskDurationPeriod === "week");
      syncAddTaskDurationReadout();
    };

    const setAddTaskCheckpointInfoOpen = (open: boolean) => {
      const dialog = els.addTaskCheckpointInfoDialog as HTMLElement | null;
      dialog?.classList.toggle("isOpen", open);
      if (els.addTaskCheckpointInfoBtn) {
        els.addTaskCheckpointInfoBtn.setAttribute("aria-expanded", String(open));
      }
    };
    const setAddTaskPresetIntervalsInfoOpen = (open: boolean) => {
      const dialog = els.addTaskPresetIntervalsInfoDialog as HTMLElement | null;
      dialog?.classList.toggle("isOpen", open);
      if (els.addTaskPresetIntervalsInfoBtn) {
        els.addTaskPresetIntervalsInfoBtn.setAttribute("aria-expanded", String(open));
      }
    };
    const setEditPresetIntervalsInfoOpen = (open: boolean) => {
      const dialog = els.editPresetIntervalsInfoDialog as HTMLElement | null;
      dialog?.classList.toggle("isOpen", open);
      if (els.editPresetIntervalsInfoBtn) {
        els.editPresetIntervalsInfoBtn.setAttribute("aria-expanded", String(open));
      }
    };
    const syncAddTaskWizardUi = () => {
      els.addTaskStep1?.classList.toggle("isActive", addTaskWizardStep === 1);
      els.addTaskStep2?.classList.toggle("isActive", addTaskWizardStep === 2);
      els.addTaskStep3?.classList.toggle("isActive", addTaskWizardStep === 3);
      if (els.addTaskWizardProgress) {
        els.addTaskWizardProgress.textContent = `Step ${addTaskWizardStep} of 3`;
      }
      els.addTaskStep1NextBtn?.classList.toggle("isHidden", addTaskWizardStep !== 1);
      els.addTaskStep2BackBtn?.classList.toggle("isHidden", addTaskWizardStep !== 2);
      els.addTaskStep2NextBtn?.classList.toggle("isHidden", addTaskWizardStep !== 2);
      els.addTaskStep3BackBtn?.classList.toggle("isHidden", addTaskWizardStep !== 3);
      els.addTaskConfirmBtn?.classList.toggle("isHidden", addTaskWizardStep !== 3);
      if (addTaskWizardStep !== 1) setAddTaskNameMenuOpen(false);
      syncAddTaskDurationUi();
    };

    const setAddTaskWizardStep = (step: 1 | 2 | 3) => {
      addTaskWizardStep = step;
      clearAddTaskValidationState();
      syncAddTaskWizardUi();
    };

    const validateAddTaskStep1 = () => {
      const name = (els.addTaskName?.value || "").trim();
      if (!name) {
        showAddTaskValidationError("Task name is required", { name: true });
        return false;
      }
      return true;
    };

    const validateAddTaskStep2 = () => {
      syncAddTaskDurationUi();
      if (addTaskNoTimeGoal) return true;
      if (!(Number(addTaskDurationValue) > 0)) {
        showAddTaskValidationError("Enter a time amount greater than 0", { duration: true });
        return false;
      }
      const maxWeek = getAddTaskDurationMaxForPeriod(addTaskDurationUnit, "week");
      if (Number(addTaskDurationValue) > maxWeek) {
        const unitLabel = addTaskDurationUnit === "minute" ? "minutes" : "hours";
        showAddTaskValidationError(`Enter ${maxWeek} ${unitLabel} or less per week`, { duration: true });
        return false;
      }
      return true;
    };

    function getAddTaskTimeGoalMinutes() {
      const value = Math.max(0, Number(addTaskDurationValue) || 0);
      if (!(value > 0) || addTaskNoTimeGoal) return 0;
      if (addTaskDurationUnit === "minute") {
        return addTaskDurationPeriod === "day" ? value : value * 7;
      }
      return addTaskDurationPeriod === "day" ? value * 60 : value * 60 * 7;
    }

    const validateAddTaskStep3 = () => {
      if (addTaskMilestonesEnabled && getAddTaskTimeGoalMinutes() <= 0) {
        showAddTaskValidationError("Set a time goal before enabling Time Checkpoints", { checkpoints: true });
        return false;
      }
      if (addTaskMilestonesEnabled && (!Array.isArray(addTaskMilestones) || addTaskMilestones.length === 0)) {
        showAddTaskValidationError("Add at least 1 checkpoint when Time Checkpoints is enabled", { checkpoints: true });
        return false;
      }
      if (addTaskMilestonesEnabled && hasNonPositiveCheckpoint(addTaskMilestones)) {
        showAddTaskValidationError("Checkpoint times must be greater than 0", { checkpoints: true, checkpointRows: true });
        return false;
      }
      if (
        addTaskMilestonesEnabled &&
        hasCheckpointAtOrAboveTimeGoal(
          addTaskMilestones,
          addTaskMilestoneTimeUnit === "day" ? 86400 : addTaskMilestoneTimeUnit === "minute" ? 60 : 3600,
          getAddTaskTimeGoalMinutes()
        )
      ) {
        showAddTaskValidationError("Checkpoint times must be less than the time goal", {
          checkpoints: true,
          checkpointRows: true,
        });
        return false;
      }
      if (addTaskMilestonesEnabled && addTaskPresetIntervalsEnabled && !(Number(addTaskPresetIntervalValue) > 0)) {
        showAddTaskValidationError("Enter a preset interval greater than 0", { presetInterval: true });
        return false;
      }
      return true;
    };

    const submitAddTaskWizard = () => {
      const name = (els.addTaskName?.value || "").trim();
      rememberCustomTaskName(name);
      setAddTaskError("");
      const nextOrder = (tasks.reduce((mx, t) => Math.max(mx, t.order || 0), 0) || 0) + 1;
      const newTask = makeTask(name, nextOrder);
      const addTaskCheckpointingEnabled = !!addTaskMilestonesEnabled && getAddTaskTimeGoalMinutes() > 0;
      newTask.milestonesEnabled = addTaskCheckpointingEnabled;
      newTask.milestoneTimeUnit = addTaskMilestoneTimeUnit;
      newTask.milestones = sortMilestones(addTaskMilestones.slice());
      newTask.checkpointSoundEnabled = addTaskCheckpointingEnabled && !!addTaskCheckpointSoundEnabled;
      newTask.checkpointSoundMode = addTaskCheckpointSoundMode === "repeat" ? "repeat" : "once";
      newTask.checkpointToastEnabled = addTaskCheckpointingEnabled && !!addTaskCheckpointToastEnabled;
      newTask.checkpointToastMode = addTaskCheckpointToastMode === "manual" ? "manual" : "auto5s";
      newTask.presetIntervalsEnabled = addTaskCheckpointingEnabled && !!addTaskPresetIntervalsEnabled;
      newTask.presetIntervalValue = Math.max(0, Number(addTaskPresetIntervalValue) || 0);
      newTask.timeGoalAction =
        addTaskTimeGoalAction === "resetLog" || addTaskTimeGoalAction === "resetNoLog" || addTaskTimeGoalAction === "confirmModal"
          ? addTaskTimeGoalAction
          : "confirmModal";
      newTask.timeGoalEnabled = !addTaskNoTimeGoal;
      newTask.timeGoalValue = addTaskNoTimeGoal ? 0 : Math.max(0, Number(addTaskDurationValue) || 0);
      newTask.timeGoalUnit = addTaskNoTimeGoal ? "hour" : addTaskDurationUnit;
      newTask.timeGoalPeriod = addTaskNoTimeGoal ? "week" : addTaskDurationPeriod;
      newTask.timeGoalMinutes = getAddTaskTimeGoalMinutes();
      tasks.push(newTask);
      closeAddTaskModal();
      save();
      render();
      jumpToTaskAndHighlight(String(newTask.id || ""));
    };

    const resetAddTaskWizardState = () => {
      addTaskWizardStep = 1;
      addTaskDurationValue = 5;
      addTaskDurationUnit = "hour";
      addTaskDurationPeriod = "week";
      addTaskNoTimeGoal = false;
      if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.value = String(addTaskDurationValue);
      if (els.addTaskNoGoalCheckbox) els.addTaskNoGoalCheckbox.checked = false;
      setAddTaskCheckpointInfoOpen(false);
      setAddTaskPresetIntervalsInfoOpen(false);
      syncAddTaskWizardUi();
    };

    const resetAddTaskMilestones = () => {
      addTaskMilestonesEnabled = false;
      addTaskMilestoneTimeUnit = defaultTaskTimerFormat;
      addTaskMilestones = [];
      addTaskCheckpointSoundEnabled = false;
      addTaskCheckpointSoundMode = "once";
      addTaskCheckpointToastEnabled = false;
      addTaskCheckpointToastMode = "auto5s";
      addTaskPresetIntervalsEnabled = false;
      addTaskPresetIntervalValue = 0;
      addTaskTimeGoalAction = "confirmModal";
      if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
      if (els.addTaskMsArea && "open" in (els.addTaskMsArea as any)) {
        (els.addTaskMsArea as HTMLDetailsElement).open = false;
      }
      clearAddTaskValidationState();
      syncAddTaskMilestonesUi();
    };

    const openAddTaskModal = () => {
      resetAddTaskMilestones();
      resetAddTaskWizardState();
      setAddTaskError("");
      renderAddTaskNameMenu("");
      setAddTaskNameMenuOpen(false);
      suppressAddTaskNameFocusOpen = true;
      openOverlay(els.addTaskOverlay as HTMLElement | null);
      setTimeout(() => {
        try {
          els.addTaskName?.focus();
        } catch {
          // ignore
        }
        suppressAddTaskNameFocusOpen = false;
      }, 60);
    };

    const closeAddTaskModal = () => {
      closeOverlay(els.addTaskOverlay as HTMLElement | null);
      if (els.addTaskName) els.addTaskName.value = "";
      setAddTaskNameMenuOpen(false);
      setAddTaskError("");
      resetAddTaskMilestones();
      resetAddTaskWizardState();
    };

    on(els.openAddTaskBtn, "click", openAddTaskModal);
    on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    on(els.addTaskStep1NextBtn, "click", () => {
      if (!validateAddTaskStep1()) return;
      setAddTaskWizardStep(2);
      try {
        els.addTaskDurationValueInput?.focus();
      } catch {
        // ignore
      }
    });
    on(els.addTaskStep2BackBtn, "click", () => {
      setAddTaskWizardStep(1);
      try {
        els.addTaskName?.focus();
      } catch {
        // ignore
      }
    });
    on(els.addTaskStep2NextBtn, "click", () => {
      if (!validateAddTaskStep2()) return;
      if (addTaskNoTimeGoal) {
        if (!validateAddTaskStep1()) return;
        submitAddTaskWizard();
        return;
      }
      setAddTaskWizardStep(3);
    });
    on(els.addTaskStep3BackBtn, "click", () => {
      setAddTaskWizardStep(2);
      try {
        els.addTaskDurationValueInput?.focus();
      } catch {
        // ignore
      }
    });
    on(els.addTaskDurationValueInput, "input", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    on(els.addTaskDurationValueInput, "change", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    on(els.addTaskDurationUnitMinute, "click", () => {
      clearAddTaskValidationState();
      addTaskDurationUnit = "minute";
      syncAddTaskDurationUi();
    });
    on(els.addTaskDurationUnitHour, "click", () => {
      clearAddTaskValidationState();
      addTaskDurationUnit = "hour";
      syncAddTaskDurationUi();
    });
    on(els.addTaskDurationPeriodDay, "click", () => {
      clearAddTaskValidationState();
      addTaskDurationPeriod = "day";
      syncAddTaskDurationUi();
    });
    on(els.addTaskDurationPeriodWeek, "click", () => {
      clearAddTaskValidationState();
      addTaskDurationPeriod = "week";
      syncAddTaskDurationUi();
    });
    on(els.addTaskNoGoalCheckbox, "change", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    on(els.addTaskCheckpointInfoBtn, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.addTaskCheckpointInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setAddTaskCheckpointInfoOpen(!isOpen);
    });
    on(els.addTaskPresetIntervalsInfoBtn, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.addTaskPresetIntervalsInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setAddTaskPresetIntervalsInfoOpen(!isOpen);
    });
    on(els.editPresetIntervalsInfoBtn, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.editPresetIntervalsInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setEditPresetIntervalsInfoOpen(!isOpen);
    });
    on(document as any, "click", (e: any) => {
      const target = e?.target as HTMLElement | null;
      if (target?.closest?.("#addTaskCheckpointInfoBtn")) return;
      if (target?.closest?.("#addTaskCheckpointInfoDialog")) return;
      if (target?.closest?.("#addTaskPresetIntervalsInfoBtn")) return;
      if (target?.closest?.("#addTaskPresetIntervalsInfoDialog")) return;
      if (target?.closest?.("#editPresetIntervalsInfoBtn")) return;
      if (target?.closest?.("#editPresetIntervalsInfoDialog")) return;
      setAddTaskCheckpointInfoOpen(false);
      setAddTaskPresetIntervalsInfoOpen(false);
      setEditPresetIntervalsInfoOpen(false);
    });

    on(els.addTaskMsToggle, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      addTaskMilestonesEnabled = !addTaskMilestonesEnabled;
      if (els.addTaskMsArea && "open" in (els.addTaskMsArea as any)) {
        const hasCheckpoints = Array.isArray(addTaskMilestones) && addTaskMilestones.length > 0;
        (els.addTaskMsArea as HTMLDetailsElement).open = !!addTaskMilestonesEnabled && !hasCheckpoints;
      }
      if (!addTaskMilestonesEnabled) {
        addTaskPresetIntervalsEnabled = false;
      }
      syncAddTaskMilestonesUi();
    });

    on(els.addTaskMsUnitDay, "click", () => {
      addTaskMilestoneTimeUnit = "day";
      setAddTaskMilestoneUnitUi("day");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskMsUnitHour, "click", () => {
      addTaskMilestoneTimeUnit = "hour";
      setAddTaskMilestoneUnitUi("hour");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskMsUnitMinute, "click", () => {
      addTaskMilestoneTimeUnit = "minute";
      setAddTaskMilestoneUnitUi("minute");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
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
    on(els.openFriendRequestModalBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (groupsLoading) return;
      openFriendRequestModal();
    });
    on(els.friendRequestCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendRequestModal();
    });
    on(els.friendRequestModal, "click", (e: any) => {
      if (e?.target === els.friendRequestModal) closeFriendRequestModal();
    });
    on(els.friendProfileCloseBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendProfileModal();
    });
    on(els.friendProfileModal, "click", (e: any) => {
      if (e?.target === els.friendProfileModal) closeFriendProfileModal();
    });
    on(els.friendProfileDeleteBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (groupsLoading) return;
      const fallbackName = String(els.friendProfileName?.textContent || "").trim();
      const friendName = String(activeFriendProfileName || fallbackName || "this user").trim();
      confirm("Delete Friend", `Are you sure you want to delete ${friendName} as a friend?`, {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          if (groupsLoading) return;
          const ownUid = String(currentUid() || "").trim();
          const friendUid = String(activeFriendProfileUid || "").trim();
          if (!ownUid) {
            closeConfirm();
            setGroupsStatus("Sign in to manage friends.");
            return;
          }
          if (!friendUid) {
            closeConfirm();
            setGroupsStatus("Friend account could not be resolved.");
            return;
          }
          closeConfirm();
          closeFriendProfileModal();
          setGroupsStatus(`Deleting ${friendName}...`);
          renderGroupsPage();
          void (async () => {
            const result = await runGroupsBusy(`Deleting ${friendName}...`, "Deleting friend timed out. Please try again.", () =>
              deleteFriendship(ownUid, friendUid)
            );
            if (!result.ok) {
              setGroupsStatus(result.timedOut ? result.message : "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            if (!result.value.ok) {
              setGroupsStatus(result.value.message || "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            activeFriendProfileUid = null;
            activeFriendProfileName = "";
            groupsFriendships = groupsFriendships.filter((row) => !row.users.includes(friendUid));
            groupsSharedSummaries = groupsSharedSummaries.filter(
              (row) => String(row.ownerUid || "").trim() !== friendUid && String(row.friendUid || "").trim() !== friendUid
            );
            ownSharedSummaries = ownSharedSummaries.filter((row) => String(row.friendUid || "").trim() !== friendUid);
            delete friendProfileCacheByUid[friendUid];
            setGroupsStatus(result.value.message || `${friendName} was removed from your friends.`);
            renderGroupsPage();
            void refreshGroupsData({ preserveStatus: true });
          })();
        },
      });
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isDeleteFriendConfirm");
    });
    on(els.friendRequestSendBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (groupsLoading) return;
      void handleSendFriendRequest();
    });
    on(els.friendRequestEmailInput, "keydown", (e: any) => {
      if (e?.key !== "Enter") return;
      e?.preventDefault?.();
      if (groupsLoading) return;
      void handleSendFriendRequest();
    });
    on(els.shareTaskCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeShareTaskModal();
    });
    on(els.shareTaskModal, "click", (e: any) => {
      if (e?.target === els.shareTaskModal) closeShareTaskModal();
    });
    on(els.shareTaskScopeSelect, "change", () => {
      syncShareTaskScopeUi();
      setShareTaskStatus("");
    });
    on(els.shareTaskConfirmBtn, "click", (e: any) => {
      e?.preventDefault?.();
      void submitShareTaskModal();
    });
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
    on(els.groupsIncomingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (groupsLoading) return;
      void handleFriendRequestAction(requestId, action);
    });
    on(els.groupsOutgoingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (groupsLoading) return;
      void handleFriendRequestAction(requestId, action);
    });
    on(els.groupsFriendsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-profile-open]") as HTMLElement | null;
      if (!btn) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const friendUid = String(btn.getAttribute("data-friend-profile-open") || "").trim();
      if (!friendUid) return;
      openFriendProfileModal(friendUid);
    });
    on(els.groupsFriendsList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const btn = e.target?.closest?.("[data-friend-profile-open]") as HTMLElement | null;
      if (!btn) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const friendUid = String(btn.getAttribute("data-friend-profile-open") || "").trim();
      if (!friendUid) return;
      openFriendProfileModal(friendUid);
    });
    on(els.groupsSharedByYouList, "click", (e: any) => {
      const unshareBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (unshareBtn) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const taskId = String(unshareBtn.getAttribute("data-task-id") || "").trim();
        if (!taskId) return;
        openUnshareTaskModal(taskId);
        return;
      }
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      jumpToTaskById(taskId);
    });
    on(els.groupsSharedByYouList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const actionBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (actionBtn) return;
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      e?.preventDefault?.();
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      jumpToTaskById(taskId);
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

    on(els.addTaskName, "input", () => {
      if ((els.addTaskName?.value || "").trim()) clearAddTaskValidationState();
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    on(els.addTaskName, "focus", () => {
      if (suppressAddTaskNameFocusOpen) return;
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    on(els.addTaskNameToggle, "click", (ev: any) => {
      ev.preventDefault?.();
      const isOpen = (els.addTaskNameMenu as HTMLElement | null)?.style.display === "block";
      if (!isOpen) renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(!isOpen);
      if (!isOpen) els.addTaskName?.focus();
    });
    on(els.addTaskNameMenu, "click", (ev: any) => {
      const item = ev.target?.closest?.("[data-add-task-name]");
      if (!item) return;
      const name = item.getAttribute("data-add-task-name") || "";
      if (els.addTaskName) {
        els.addTaskName.value = name;
        els.addTaskName.focus();
      }
      setAddTaskError("");
      setAddTaskNameMenuOpen(false);
    });

    on(els.addTaskPresetIntervalsToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0) return;
      addTaskPresetIntervalsEnabled = !addTaskPresetIntervalsEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalsToggleRow, "click", (e: any) => {
      if (
        !addTaskMilestonesEnabled ||
        getAddTaskTimeGoalMinutes() <= 0 ||
        e.target?.closest?.("#addTaskPresetIntervalsToggle") ||
        e.target?.closest?.("#addTaskPresetIntervalsInfoBtn") ||
        e.target?.closest?.("#addTaskPresetIntervalsInfoSlot") ||
        e.target?.closest?.("#addTaskPresetIntervalsInfoDialog")
      )
        return;
      addTaskPresetIntervalsEnabled = !addTaskPresetIntervalsEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalInput, "input", () => {
      addTaskPresetIntervalValue = Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0);
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskPresetIntervalInput, "change", () => {
      addTaskPresetIntervalValue = Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0);
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskFinalCheckpointActionSelect, "change", () => {
      addTaskTimeGoalAction =
        els.addTaskFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.addTaskFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.addTaskFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue";
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0 || !checkpointAlertSoundEnabled) return;
      addTaskCheckpointSoundEnabled = !addTaskCheckpointSoundEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundToggleRow, "click", (e: any) => {
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0 || !checkpointAlertSoundEnabled || e.target?.closest?.("#addTaskCheckpointSoundToggle")) return;
      addTaskCheckpointSoundEnabled = !addTaskCheckpointSoundEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointSoundModeSelect, "change", () => {
      addTaskCheckpointSoundMode = els.addTaskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0 || !checkpointAlertToastEnabled) return;
      addTaskCheckpointToastEnabled = !addTaskCheckpointToastEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastToggleRow, "click", (e: any) => {
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0 || !checkpointAlertToastEnabled || e.target?.closest?.("#addTaskCheckpointToastToggle")) return;
      addTaskCheckpointToastEnabled = !addTaskCheckpointToastEnabled;
      syncAddTaskCheckpointAlertUi();
    });
    on(els.addTaskCheckpointToastModeSelect, "change", () => {
      addTaskCheckpointToastMode = els.addTaskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskAddMsBtn, "click", () => {
      if (!addTaskMilestonesEnabled || getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      if (addTaskPresetIntervalsEnabled) {
        const interval = Math.max(0, Number(addTaskPresetIntervalValue) || 0);
        if (interval <= 0) {
          syncAddTaskCheckpointAlertUi();
          return;
        }
        const base = addTaskMilestones.length ? Number(addTaskMilestones[addTaskMilestones.length - 1]?.hours || 0) : 0;
        const nextHours = base + interval;
        if (
          isCheckpointAtOrAboveTimeGoal(
            nextHours,
            addTaskMilestoneTimeUnit === "day" ? 86400 : addTaskMilestoneTimeUnit === "minute" ? 60 : 3600,
            getAddTaskTimeGoalMinutes()
          )
        ) {
          showAddTaskValidationError("Checkpoint times must be less than the time goal", {
            checkpoints: true,
            checkpointRows: true,
          });
          syncAddTaskCheckpointAlertUi();
          return;
        }
        addTaskMilestones.push({ hours: nextHours, description: "" });
      } else {
        addTaskMilestones.push({ hours: 0, description: "" });
      }
      renderAddTaskMilestoneEditor();
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });

    on(els.addTaskForm, "submit", (e: any) => {
      e.preventDefault();
      clearAddTaskValidationState();
      if (addTaskWizardStep !== 3) return;
      if (!validateAddTaskStep1()) return;
      if (!validateAddTaskStep3()) return;
      submitAddTaskWizard();
    });

    on(els.taskList, "click", (e: any) => {
      const taskEl = e.target?.closest?.(".task");
      if (!taskEl) return;
      const i = parseInt(taskEl.dataset.index, 10);
      if (!Number.isFinite(i)) return;
      const taskId = String(taskEl.dataset.taskId || "").trim();
      const flipBtn = e.target?.closest?.("[data-task-flip]") as HTMLElement | null;
      if (flipBtn && taskId) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        setTaskFlipped(taskId, flipBtn.getAttribute("data-task-flip") === "open", taskEl as HTMLElement);
        return;
      }

      const btn = e.target?.closest?.("[data-action]");
      if (!btn) {
        const inTopRow = !!e.target?.closest?.(".row");
        const inActions = !!e.target?.closest?.(".actions");
        if (inTopRow && !inActions) {
          openFocusMode(i);
        }
        return;
      }
      const action = btn.getAttribute("data-action");

      if (action === "start") startTask(i);
      else if (action === "stop") stopTask(i);
      else if (action === "reset") resetTask(i);
      else if (action === "delete") deleteTask(i);
      else if (action === "edit") openEdit(i);
      else if (action === "history") openHistory(i);
      else if (action === "duplicate") duplicateTask(i);
      else if (action === "editName" || action === "focus") openFocusMode(i);
      else if (action === "collapse") toggleCollapse(i);
      else if (action === "exportTask") openTaskExportModal(i);
      else if (action === "shareTask") openShareTaskModal(i);
      else if (action === "unshareTask") {
        const t = tasks[i];
        if (!t) return;
        confirm("Unshare Task", "Unshare this task from all friends?", {
          okLabel: "Unshare",
          cancelLabel: "Cancel",
          onOk: () => {
            const uid = currentUid();
            if (!uid) {
              closeConfirm();
              return;
            }
            void deleteSharedTaskSummariesForTask(uid, String(t.id || ""))
              .then(async () => {
                await refreshOwnSharedSummaries();
                if (currentAppPage === "test2") await refreshGroupsData();
                render();
              })
              .finally(() => closeConfirm());
          },
        });
      }
      else if (action === "muteCheckpointAlert") {
        stopCheckpointRepeatAlert();
        return;
      }
      else if (action === "showSuppressedCheckpointAlert") {
        const suppressedAlert = getSuppressedFocusModeAlert(taskId);
        if (!suppressedAlert) return;
        enqueueCheckpointToast(suppressedAlert.title, suppressedAlert.text, {
          autoCloseMs: suppressedAlert.autoCloseMs,
          taskId: suppressedAlert.taskId,
          taskName: suppressedAlert.taskName,
          counterText: suppressedAlert.counterText,
          checkpointTimeText: suppressedAlert.checkpointTimeText,
          checkpointDescText: suppressedAlert.checkpointDescText,
          muteRepeatOnManualDismiss: suppressedAlert.muteRepeatOnManualDismiss,
        });
        clearSuppressedFocusModeAlert(taskId);
        render();
        return;
      }

      if (taskId) setTaskFlipped(taskId, false, taskEl as HTMLElement);
    });

    on(els.resetAllBtn, "click", resetAll);

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
      const insideAddNameMenu = ev.target?.closest?.("#addTaskNameCombo");
      if (!insideAddNameMenu) setAddTaskNameMenuOpen(false);
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

    on(els.taskList, "click", (ev: any) => {
      const rangeToggle = ev.target?.closest?.("[data-history-range-toggle]") as HTMLElement | null;
      if (rangeToggle) {
        const taskEl = rangeToggle.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        state.rangeDays = state.rangeDays === 14 ? 7 : 14;
        saveHistoryRangePref(taskId, state.rangeDays);
        state.page = 0;
        renderHistory(taskId);
        return;
      }
      const rangeModeBtn = ev.target?.closest?.("[data-history-range-mode]") as HTMLElement | null;
      if (rangeModeBtn) {
        const taskEl = rangeModeBtn.closest?.(".task") as HTMLElement | null;
        const taskId = taskEl?.getAttribute?.("data-task-id") || "";
        if (!taskId) return;
        const state = ensureHistoryViewState(taskId);
        const mode = rangeModeBtn.getAttribute("data-history-range-mode");
        state.rangeMode = mode === "day" ? "day" : "entries";
        saveHistoryRangeModePref(taskId, state.rangeMode);
        renderHistory(taskId);
        return;
      }

      const btn = ev.target?.closest?.("[data-history-action]");
      const action = btn?.getAttribute?.("data-history-action");
      if (!action) return;
      const taskEl = btn?.closest?.(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      if (action === "pin") {
        if (pinnedHistoryTaskIds.has(taskId)) pinnedHistoryTaskIds.delete(taskId);
        else pinnedHistoryTaskIds.add(taskId);
        savePinnedHistoryTaskIds();
        if (pinnedHistoryTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
        render();
        return;
      }
      if (action === "close") {
        resetHistoryChartSelectionToDefault(taskId);
        closeHistory(taskId);
        return;
      }
      if (action === "edit") {
        state.editMode = !state.editMode;
        renderHistory(taskId);
        return;
      }
      if (action === "older") {
        state.slideDir = "left";
        state.page += 1;
        renderHistory(taskId);
        return;
      }
      if (action === "newer") {
        state.slideDir = "right";
        state.page = Math.max(0, state.page - 1);
        renderHistory(taskId);
        return;
      }
      if (action === "manage") {
        navigateToAppRoute(`/tasktimer/history-manager?taskId=${encodeURIComponent(taskId)}`);
        return;
      }
      if (action === "analyse") {
        if (state.lockedAbsIndexes.size < 2) return;
        openHistoryAnalysisModal(taskId);
        return;
      }
      if (action === "clearLocks") {
        clearHistoryLockedSelections(taskId);
        renderHistory(taskId);
        return;
      }
      const lockedList = Array.from(state.lockedAbsIndexes.values());
      const deleteAbsIndex = state.selectedAbsIndex != null ? state.selectedAbsIndex : lockedList[lockedList.length - 1] ?? null;
      if (action !== "delete" || deleteAbsIndex == null) return;

      const all = getHistoryForTask(taskId);
      const e = all[deleteAbsIndex];
      if (!e) return;

      confirm("Delete Log Entry", `Delete this entry (${formatTime(e.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          const all2 = getHistoryForTask(taskId);
          if (deleteAbsIndex >= 0 && deleteAbsIndex < all2.length) {
            all2.splice(deleteAbsIndex, 1);
            historyByTaskId[taskId] = all2 as any;
            saveHistory(historyByTaskId);

            if (state.selectedAbsIndex === deleteAbsIndex) {
              state.selectedAbsIndex = null;
              state.selectedRelIndex = null;
              startHistorySelectionAnimation(taskId, null);
            } else if (state.selectedAbsIndex != null && state.selectedAbsIndex > deleteAbsIndex) {
              state.selectedAbsIndex -= 1;
            }
            if (state.lockedAbsIndexes.size > 0) {
              const nextLocked = new Set<number>();
              state.lockedAbsIndexes.forEach((idx) => {
                if (idx === deleteAbsIndex) return;
                nextLocked.add(idx > deleteAbsIndex ? idx - 1 : idx);
              });
              state.lockedAbsIndexes = nextLocked;
            }
            syncHistoryEntryNoteOverlayForSelection(taskId, state);

            const maxPage = Math.max(0, Math.ceil(all2.length / historyPageSize(taskId)) - 1);
            state.page = Math.min(state.page, maxPage);
            renderHistory(taskId);
          }
          closeConfirm();
        },
      });
    });

    on(els.taskList, "click", (ev: any) => {
      const canvas = ev.target?.closest?.(".historyChartInline") as HTMLCanvasElement | null;
      if (!canvas) return;
      const taskEl = canvas.closest(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let hit: any = null;
      for (let i = 0; i < state.barRects.length; i++) {
        const r = state.barRects[i];
        if (!r) continue;
        const hx = typeof r.hitX === "number" ? r.hitX : r.x;
        const hy = typeof r.hitY === "number" ? r.hitY : r.y;
        const hw = typeof r.hitW === "number" ? r.hitW : r.w;
        const hh = typeof r.hitH === "number" ? r.hitH : r.h;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) {
          hit = { rel: i, abs: r.absIndex };
          break;
        }
      }
      if (!hit) {
        for (let i = 0; i < state.labelHitRects.length; i++) {
          const r = state.labelHitRects[i];
          if (!r) continue;
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            hit = { rel: i, abs: r.absIndex };
            break;
          }
        }
      }

      if (hit) {
        const isSameTransient = state.selectedAbsIndex != null && state.selectedAbsIndex === hit.abs;
        const isSameLocked = state.lockedAbsIndexes.has(hit.abs);
        if (isSameLocked) {
          state.lockedAbsIndexes.delete(hit.abs);
          syncHistoryEntryNoteOverlayForSelection(taskId, state);
          const ui = getHistoryUi(taskId);
          const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
          if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
        } else if (isSameTransient) {
          state.lockedAbsIndexes.add(hit.abs);
          if (state.selectionClearTimer != null) {
            window.clearTimeout(state.selectionClearTimer);
            state.selectionClearTimer = null;
          }
          state.selectedRelIndex = null;
          state.selectedAbsIndex = null;
          startHistorySelectionAnimation(taskId, null);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
          const display = getHistoryDisplayForTask(taskId, state);
          const entry = display[hit.abs];
          if (entry) openHistoryEntryNoteOverlay(taskId, entry, state.rangeMode, state.lockedAbsIndexes);
        } else {
          state.selectedRelIndex = hit.rel;
          state.selectedAbsIndex = hit.abs;
          startHistorySelectionAnimation(taskId, hit.abs);
          scheduleHistorySelectionClear(taskId);
          const ui = getHistoryUi(taskId);
          if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
        }
      } else {
        clearHistoryChartSelection(taskId);
        const ui = getHistoryUi(taskId);
        const hasDeleteTargetNow = state.selectedRelIndex != null || state.lockedAbsIndexes.size > 0;
        if (ui?.deleteBtn) ui.deleteBtn.disabled = !hasDeleteTargetNow;
      }

      renderHistory(taskId);
    });
    on(els.taskList, "dblclick", (ev: any) => {
      const canvas = ev.target?.closest?.(".historyChartInline") as HTMLCanvasElement | null;
      if (!canvas) return;
      const taskEl = canvas.closest(".task") as HTMLElement | null;
      const taskId = taskEl?.getAttribute?.("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);

      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let hitAbs: number | null = null;

      for (let i = 0; i < state.barRects.length; i++) {
        const r = state.barRects[i];
        if (!r) continue;
        const hx = typeof r.hitX === "number" ? r.hitX : r.x;
        const hy = typeof r.hitY === "number" ? r.hitY : r.y;
        const hw = typeof r.hitW === "number" ? r.hitW : r.w;
        const hh = typeof r.hitH === "number" ? r.hitH : r.h;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) {
          hitAbs = typeof r.absIndex === "number" ? r.absIndex : null;
          break;
        }
      }

      if (hitAbs == null) {
        for (let i = 0; i < state.labelHitRects.length; i++) {
          const r = state.labelHitRects[i];
          if (!r) continue;
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            hitAbs = typeof r.absIndex === "number" ? r.absIndex : null;
            break;
          }
        }
      }

      if (hitAbs == null) return;
      const display = getHistoryDisplayForTask(taskId, state);
      const entry = display[hitAbs];
      if (entry) openHistoryEntryNoteOverlay(taskId, entry, state.rangeMode, state.lockedAbsIndexes);
    });

    let swipeStartX: number | null = null;
    let swipeStartY: number | null = null;
    let swipeWrap: HTMLElement | null = null;
    let swipePointerId: number | null = null;
    const clearHistorySwipeState = () => {
      swipeStartX = null;
      swipeStartY = null;
      swipeWrap = null;
      swipePointerId = null;
    };

    const runHistorySwipe = (endX: number, endY: number) => {
      if (!swipeWrap) return;
      if (swipeStartX === null || swipeStartY === null) return;

      const dx = endX - swipeStartX;
      const dy = endY - swipeStartY;

      const currentWrap = swipeWrap;
      clearHistorySwipeState();

      if (Math.abs(dx) < 24) return;
      if (Math.abs(dy) > 60) return;

      const taskId = currentWrap?.closest(".task")?.getAttribute("data-task-id") || "";
      if (!taskId) return;
      const state = ensureHistoryViewState(taskId);
      const rangeDays = state.rangeDays || 7;
      const cutoffMs = nowMs() - rangeDays * 24 * 60 * 60 * 1000;
      const visibleEntries = getHistoryForTask(taskId).filter((e: any) => (+e.ts || 0) >= cutoffMs);
      const total =
        state.rangeMode === "day"
          ? new Set(
              visibleEntries.map((e: any) => {
                const d = new Date(+e.ts || 0);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const da = String(d.getDate()).padStart(2, "0");
                return `${y}-${m}-${da}`;
              })
            ).size
          : visibleEntries.length;
      const pageSize = historyPageSize(taskId);
      const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

      if (dx < 0) {
        if (state.page < maxPage) {
          state.slideDir = "left";
          state.page += 1;
          renderHistory(taskId);
        }
      } else {
        if (state.page > 0) {
          state.slideDir = "right";
          state.page = Math.max(0, state.page - 1);
          renderHistory(taskId);
        }
      }
    };

    if ("PointerEvent" in window) {
      on(els.taskList, "pointerdown", (e: any) => {
        const wrap = e.target?.closest?.(".historyCanvasWrap") || null;
        if (!wrap) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (typeof e.pointerId === "number" && typeof e.target?.setPointerCapture === "function") {
          try {
            e.target.setPointerCapture(e.pointerId);
          } catch {
            // Ignore capture failures; delegated handlers still run.
          }
        }
        swipeWrap = wrap;
        swipePointerId = typeof e.pointerId === "number" ? e.pointerId : null;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
      });

      on(els.taskList, "pointerup", (e: any) => {
        if (!swipeWrap) return;
        if (swipePointerId != null && e.pointerId !== swipePointerId) return;
        runHistorySwipe(e.clientX, e.clientY);
      });

      on(window, "pointerup", (e: any) => {
        if (!swipeWrap) return;
        if (swipePointerId != null && e.pointerId !== swipePointerId) return;
        runHistorySwipe(e.clientX, e.clientY);
      });

      on(els.taskList, "pointercancel", () => {
        clearHistorySwipeState();
      });
      on(window, "pointercancel", () => {
        clearHistorySwipeState();
      });
    } else {
      on(
        els.taskList,
        "touchstart",
        (e: any) => {
          swipeWrap = e.target?.closest?.(".historyCanvasWrap") || null;
          if (!swipeWrap) return;
          if (!e.touches || !e.touches.length) return;
          swipeStartX = e.touches[0].clientX;
          swipeStartY = e.touches[0].clientY;
        },
        { passive: true }
      );

      on(
        els.taskList,
        "touchend",
        (e: any) => {
          const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
          if (!t) return;
          runHistorySwipe(t.clientX, t.clientY);
        },
        { passive: true }
      );

      on(els.taskList, "touchcancel", () => {
        clearHistorySwipeState();
      });
    }

    on(window, "resize", () => {
      for (const taskId of openHistoryTaskIds) {
        renderHistory(taskId);
      }
      if (currentAppPage === "dashboard") {
        renderDashboardWidgets();
      }
    });

    on(els.menuIcon, "click", () => {
      navigateToAppRoute("/tasktimer/settings");
    });
    on(els.dashboardEditBtn, "click", beginDashboardEditMode);
    on(els.dashboardEditCancelBtn, "click", cancelDashboardEditMode);
    on(els.dashboardEditDoneBtn, "click", commitDashboardEditMode);
    on(els.dashboardPanelMenuList, "change", (e: any) => {
      const categoryInput = e.target?.closest?.("input[data-dashboard-category-id]") as HTMLInputElement | null;
      if (categoryInput) {
        const modeAttr = String(categoryInput.getAttribute("data-dashboard-category-id") || "").trim();
        const mode: MainMode = modeAttr === "mode2" || modeAttr === "mode3" ? modeAttr : "mode1";
        const categoryMeta = getDashboardCategoryMeta();
        const includedCount = categoryMeta.reduce((count, row) => (isDashboardModeIncluded(row.mode) ? count + 1 : count), 0);
        const nextChecked = !!categoryInput.checked;
        if (!nextChecked && isDashboardModeIncluded(mode) && includedCount <= 1) {
          categoryInput.checked = true;
          syncDashboardPanelMenuState();
          return;
        }
        dashboardIncludedModes[mode] = nextChecked;
        ensureDashboardIncludedModesValid();
        syncDashboardPanelMenuState();
        saveDashboardWidgetState({
          cardSizes: getDashboardCardSizeMapForStorage(),
          avgSessionByTaskRange: dashboardAvgRange,
        });
        if (currentAppPage === "dashboard") {
          renderDashboardWidgets();
        }
        return;
      }
      const input = e.target?.closest?.("input[data-dashboard-panel-id]") as HTMLInputElement | null;
      if (!input) return;
      const cardId = String(input.getAttribute("data-dashboard-panel-id") || "").trim();
      if (!cardId) return;
      const meta = collectDashboardPanelMeta();
      const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
      const nextChecked = !!input.checked;
      if (!nextChecked && isDashboardCardVisible(cardId) && visibleCount <= 1) {
        input.checked = true;
        syncDashboardPanelMenuState();
        return;
      }
      dashboardCardVisibility[cardId] = nextChecked;
      applyDashboardCardVisibility();
      saveDashboardWidgetState({
        cardSizes: getDashboardCardSizeMapForStorage(),
        avgSessionByTaskRange: dashboardAvgRange,
      });
      if (currentAppPage === "dashboard") {
        renderDashboardWidgets();
      }
    });
    on(els.dashboardGrid, "click", (e: any) => {
      const sizeToggle = e.target?.closest?.("[data-dashboard-size-toggle]") as HTMLElement | null;
      if (sizeToggle) {
        if (!dashboardEditMode) return;
        const card = sizeToggle.closest(".dashboardCard") as HTMLElement | null;
        if (!card || !els.dashboardGrid?.contains(card)) return;
        const wasOpen = card.classList.contains("isSizeMenuOpen");
        closeDashboardCardSizeMenus();
        card.classList.toggle("isSizeMenuOpen", !wasOpen);
        syncDashboardCardSizeControlState();
        e.preventDefault();
        return;
      }
      const sizeOption = e.target?.closest?.(".dashboardSizeOption[data-dashboard-size]") as HTMLElement | null;
      if (sizeOption) {
        if (!dashboardEditMode) return;
        const card = sizeOption.closest(".dashboardCard") as HTMLElement | null;
        const cardId = String(card?.getAttribute("data-dashboard-id") || "");
        const nextSize = sanitizeDashboardCardSize(sizeOption.getAttribute("data-dashboard-size"), cardId);
        if (!card || !cardId || !nextSize) return;
        dashboardCardSizes[cardId] = nextSize;
        applyDashboardCardSizes();
        closeDashboardCardSizeMenus();
        if (currentAppPage === "dashboard") {
          renderDashboardWidgets();
        }
        e.preventDefault();
        return;
      }
      const densityBtn = e.target?.closest?.("[data-dashboard-timeline-density]") as HTMLElement | null;
      if (densityBtn) {
        const nextDensity = sanitizeDashboardTimelineDensity(densityBtn.getAttribute("data-dashboard-timeline-density"));
        if (nextDensity !== dashboardTimelineDensity) saveDashboardTimelineDensity(nextDensity);
        renderDashboardTimelineCard();
        e.preventDefault();
        return;
      }
      const btn = e.target?.closest?.("[data-dashboard-avg-range]") as HTMLElement | null;
      if (!btn) return;
      const nextRange = sanitizeDashboardAvgRange(btn.getAttribute("data-dashboard-avg-range"));
      const rangeMenu = btn.closest("details") as HTMLDetailsElement | null;
      if (rangeMenu) rangeMenu.open = false;
      if (nextRange === dashboardAvgRange) {
        renderDashboardWidgets();
        return;
      }
      saveDashboardAvgRange(nextRange);
      renderDashboardWidgets();
    });
    on(document as any, "click", (e: any) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (dashboardEditMode && !target.closest(".dashboardSizeControl")) {
        closeDashboardCardSizeMenus();
      }
      if (!target.closest("#dashboardPanelMenu")) {
        closeDashboardPanelMenu();
      }
      const avgRangeMenu = document.getElementById("dashboardAvgRangeMenu") as HTMLDetailsElement | null;
      if (avgRangeMenu && !target.closest("#dashboardAvgRangeMenu")) {
        avgRangeMenu.open = false;
      }
    });
    on(els.dashboardGrid, "dragstart", (e: any) => {
      if (!dashboardEditMode) return;
      if (e.target?.closest?.(".dashboardSizeControl")) return;
      closeDashboardCardSizeMenus();
      const card = e.target?.closest?.(".dashboardCard") as HTMLElement | null;
      if (!card || !els.dashboardGrid?.contains(card)) return;
      dashboardDragEl = card;
      card.classList.add("isDragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", card.getAttribute("data-dashboard-id") || "");
        } catch {
          // ignore
        }
      }
    });
    on(els.dashboardGrid, "dragover", (e: any) => {
      if (!dashboardEditMode) return;
      const grid = els.dashboardGrid;
      const dragging = dashboardDragEl;
      if (!grid || !dragging) return;
      const over = Array.from(grid.children).find((child) => child.contains(e.target as Node)) as HTMLElement | undefined;
      if (!over || over === dragging || !grid.contains(over)) return;
      e.preventDefault();
      const rect = over.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) grid.insertBefore(dragging, over);
      else grid.insertBefore(dragging, over.nextSibling);
    });
    on(els.dashboardGrid, "drop", (e: any) => {
      if (!dashboardEditMode) return;
      e.preventDefault();
    });
    on(els.dashboardGrid, "dragend", () => {
      if (dashboardDragEl) dashboardDragEl.classList.remove("isDragging");
      dashboardDragEl = null;
    });
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
    on(els.closeMenuBtn, "click", () => {
      if (els.menuOverlay) {
        closeOverlay(els.menuOverlay as HTMLElement | null);
        return;
      }
      const currentRoutePath = normalizeTaskTimerRoutePath(normalizedPathname());
      if (currentRoutePath === "/tasktimer/settings") {
        window.location.href = appPathForPage("dashboard");
        return;
      }
      handleAppBackNavigation();
    });
    on(els.themeSelect, "change", () => {
      const raw = String(els.themeSelect?.value || "").trim().toLowerCase();
      const next = normalizeThemeMode(raw);
      setThemeMode(next);
    });
    on(els.menuButtonStyleSelect, "change", () => {
      const raw = String(els.menuButtonStyleSelect?.value || "").trim().toLowerCase();
      const next: "parallelogram" | "square" = raw === "square" ? "square" : "parallelogram";
      setMenuButtonStyle(next);
    });
    on(els.preferencesLoadDefaultsBtn, "click", () => {
      defaultTaskTimerFormat = "hour";
      autoFocusOnTaskLaunchEnabled = false;
      taskView = "tile";
      dynamicColorsEnabled = true;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.appearanceLoadDefaultsBtn, "click", () => {
      setThemeMode("purple");
      setMenuButtonStyle("square");
    });
    on(els.taskDefaultFormatDay, "click", () => {
      defaultTaskTimerFormat = "day";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDefaultFormatHour, "click", () => {
      defaultTaskTimerFormat = "hour";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDefaultFormatMinute, "click", () => {
      defaultTaskTimerFormat = "minute";
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskViewList, "click", () => {
      applyTaskViewPreference("list");
      clearTaskFlipStates();
      render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });

    on(els.taskViewTile, "click", () => {
      applyTaskViewPreference("tile");
      clearTaskFlipStates();
      render();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskAutoFocusOnLaunchToggle, "click", () => {
      autoFocusOnTaskLaunchEnabled = !autoFocusOnTaskLaunchEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskAutoFocusOnLaunchToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskAutoFocusOnLaunchToggle")) return;
      autoFocusOnTaskLaunchEnabled = !autoFocusOnTaskLaunchEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDynamicColorsToggle, "click", () => {
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskDynamicColorsToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskDynamicColorsToggle")) return;
      dynamicColorsEnabled = !dynamicColorsEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointSoundToggle, "click", () => {
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      if (!checkpointAlertSoundEnabled) stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointSoundToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointSoundToggle")) return;
      checkpointAlertSoundEnabled = !checkpointAlertSoundEnabled;
      if (!checkpointAlertSoundEnabled) stopCheckpointRepeatAlert();
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointToastToggle, "click", () => {
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskCheckpointToastToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#taskCheckpointToastToggle")) return;
      checkpointAlertToastEnabled = !checkpointAlertToastEnabled;
      syncTaskSettingsUi();
      persistInlineTaskSettingsImmediate();
    });
    on(els.taskSettingsSaveBtn, "click", () => {
      saveDefaultTaskTimerFormat();
      saveAutoFocusOnTaskLaunchSetting();
      saveDynamicColorsSetting();
      saveCheckpointAlertSettings();
      render();
      closeOverlay(els.taskSettingsOverlay as HTMLElement | null);
    });
    const toggleCategoryEnabled = (mode: "mode2" | "mode3") => {
      modeEnabled[mode] = !modeEnabled[mode];
      syncModeLabelsUi();
      applyAndPersistModeSettingsImmediate();
    };
    on(els.categoryMode2Toggle, "click", () => toggleCategoryEnabled("mode2"));
    on(els.categoryMode3Toggle, "click", () => toggleCategoryEnabled("mode3"));
    on(els.categoryMode2ToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#categoryMode2Toggle")) return;
      toggleCategoryEnabled("mode2");
    });
    on(els.categoryMode3ToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#categoryMode3Toggle")) return;
      toggleCategoryEnabled("mode3");
    });
    on(els.categoryMode1Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode2Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode3Input, "change", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode1Input, "blur", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode2Input, "blur", () => applyAndPersistModeSettingsImmediate());
    on(els.categoryMode3Input, "blur", () => applyAndPersistModeSettingsImmediate());

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    on(els.categorySaveBtn, "click", () => {
      applyAndPersistModeSettingsImmediate({ closeOverlay: true });
    });
    on(els.categoryResetBtn, "click", () => {
      modeLabels = { ...DEFAULT_MODE_LABELS };
      modeEnabled = { ...DEFAULT_MODE_ENABLED };
      saveModeSettings();
      syncModeLabelsUi();
      applyModeAccent(currentMode);
      if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = getModeLabel(editMoveTargetMode);
    });
    const confirmDeleteCategory = (mode: MainMode) => {
      const label = getModeLabel(mode);
      const safeLabel = escapeHtmlUI(label);
      confirm("Delete Category Tasks", "", {
        okLabel: "Delete",
        textHtml: `<span class="confirmDanger">All tasks under the ${safeLabel} category will be deleted. Proceed?</span>`,
        onOk: () => {
          deleteTasksInMode(mode);
          closeConfirm();
        },
      });
    };
    on(els.categoryMode2TrashBtn, "click", () => confirmDeleteCategory("mode2"));
    on(els.categoryMode3TrashBtn, "click", () => confirmDeleteCategory("mode3"));

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
    on(window, "resize", () => {
      refreshHistoryEntryNoteOverlayPosition();
    });
    on(window, "scroll", () => {
      refreshHistoryEntryNoteOverlayPosition();
    }, { passive: true, capture: true });
    on(
      document,
      "click",
      (e: any) => {
        if (!isHistoryEntryNoteOverlayOpen()) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest?.("#historyEntryNoteOverlay")) return;
        if (isHistoryChartInteractionTarget(target)) return;
        closeHistoryEntryNoteOverlay();
      },
      { capture: true }
    );
    on(document, "click", (e: any) => {
      const copyBtn = e.target?.closest?.("[data-history-note-copy]") as HTMLButtonElement | null;
      if (!copyBtn) return;
      const text = String(copyBtn.getAttribute("data-history-note-copy") || "");
      void copyTextToClipboard(text).then((ok) => {
        const prev = copyBtn.textContent || "Copy";
        copyBtn.textContent = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          copyBtn.textContent = prev === "Copied" || prev === "Copy failed" ? "Copy" : prev;
        }, 1200);
      });
    });

    on(els.cancelEditBtn, "click", () => closeEdit(false));
    on(els.saveEditBtn, "click", () => closeEdit(true));
    on(els.editName, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      syncEditTaskDurationReadout(t);
      syncEditSaveAvailability(t);
    });
    const syncEditTimeGoalToggle = (nextEnabled: boolean) => {
      const t = getCurrentEditTask();
      if (!t) return;
      setEditTimeGoalEnabled(nextEnabled);
      clearEditValidationState();
      if (!nextEnabled && els.msArea && "open" in (els.msArea as any)) {
        (els.msArea as HTMLDetailsElement).open = false;
      }
      syncEditTaskTimeGoalUi(t);
      syncEditMilestoneSectionUi(t);
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    };
    on(els.editNoGoalCheckbox, "change", () => {
      syncEditTimeGoalToggle(isEditTimeGoalEnabled());
    });
    on(els.editTimeGoalToggle, "click", () => {
      syncEditTimeGoalToggle(!isEditTimeGoalEnabled());
    });
    on(els.editTimeGoalToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#editTimeGoalToggle")) return;
      syncEditTimeGoalToggle(!isEditTimeGoalEnabled());
    });
    on(els.editTaskDurationValueInput, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editTaskDurationValueInput, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editTaskDurationUnitMinute, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      editTaskDurationUnit = "minute";
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editTaskDurationUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      editTaskDurationUnit = "hour";
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editTaskDurationPeriodDay, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      editTaskDurationPeriod = "day";
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editTaskDurationPeriodWeek, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      editTaskDurationPeriod = "week";
      syncEditTaskTimeGoalUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editOverrideElapsedToggle, "click", () => {
      if (isEditElapsedOverrideEnabled()) {
        setEditElapsedOverrideEnabled(false);
        if (getCurrentEditTask()) syncEditSaveAvailability(getCurrentEditTask());
        return;
      }
      confirmEnableElapsedOverride();
    });
    on(els.editCheckpointSoundToggle, "click", () => {
      if (!checkpointAlertSoundEnabled || !editTaskHasActiveTimeGoal()) return;
      toggleSwitchElement(
        els.editCheckpointSoundToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null)
      );
    });
    on(els.editCheckpointSoundToggleRow, "click", (e: any) => {
      if (!checkpointAlertSoundEnabled || !editTaskHasActiveTimeGoal() || e.target?.closest?.("#editCheckpointSoundToggle")) return;
      toggleSwitchElement(
        els.editCheckpointSoundToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null)
      );
      const t = getCurrentEditTask();
      if (t) {
        t.checkpointSoundEnabled = isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
      }
    });
    on(els.editCheckpointSoundToggle, "click", () => {
      const t = getCurrentEditTask();
      if (t) {
        t.checkpointSoundEnabled = isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
      }
    });
    on(els.editCheckpointSoundModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editCheckpointToastToggle, "click", () => {
      if (!checkpointAlertToastEnabled || !editTaskHasActiveTimeGoal()) return;
      toggleSwitchElement(
        els.editCheckpointToastToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null)
      );
    });
    on(els.editCheckpointToastToggleRow, "click", (e: any) => {
      if (!checkpointAlertToastEnabled || !editTaskHasActiveTimeGoal() || e.target?.closest?.("#editCheckpointToastToggle")) return;
      toggleSwitchElement(
        els.editCheckpointToastToggle as HTMLElement | null,
        !isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null)
      );
      const t = getCurrentEditTask();
      if (t) {
        t.checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
      }
    });
    on(els.editCheckpointToastToggle, "click", () => {
      const t = getCurrentEditTask();
      if (t) {
        t.checkpointToastEnabled = isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
      }
    });
    on(els.editCheckpointToastModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointToastMode = els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalsToggle, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;
      maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalsToggleRow, "click", (e: any) => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;
      if (
        e.target?.closest?.("#editPresetIntervalsToggle") ||
        e.target?.closest?.("#editPresetIntervalsInfoBtn") ||
        e.target?.closest?.("#editPresetIntervalsInfoSlot") ||
        e.target?.closest?.("#editPresetIntervalsInfoDialog")
      )
        return;
      maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalInput, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editPresetIntervalInput, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    on(els.editFinalCheckpointActionSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.timeGoalAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue";
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });
    const onEditElapsedInputChanged = (input: HTMLInputElement | null, normalize: boolean) => {
      if (!isEditElapsedOverrideEnabled()) return;
      if (normalize) normalizeEditElapsedValue(input);
      const t = getCurrentEditTask();
      if (!t) return;
      clearEditValidationState();
      syncEditSaveAvailability(t);
    };
    on(els.editD, "input", () => onEditElapsedInputChanged(els.editD, false));
    on(els.editH, "input", () => onEditElapsedInputChanged(els.editH, false));
    on(els.editM, "input", () => onEditElapsedInputChanged(els.editM, false));
    on(els.editS, "input", () => onEditElapsedInputChanged(els.editS, false));
    on(els.editD, "change", () => onEditElapsedInputChanged(els.editD, true));
    on(els.editH, "change", () => onEditElapsedInputChanged(els.editH, true));
    on(els.editM, "change", () => onEditElapsedInputChanged(els.editM, true));
    on(els.editS, "change", () => onEditElapsedInputChanged(els.editS, true));
    on(els.editD, "focus", () => maybeAutoClearEditElapsedField(els.editD));
    on(els.editH, "focus", () => maybeAutoClearEditElapsedField(els.editH));
    on(els.editM, "focus", () => maybeAutoClearEditElapsedField(els.editM));
    on(els.editS, "focus", () => maybeAutoClearEditElapsedField(els.editS));
    on(els.editD, "click", () => maybeAutoClearEditElapsedField(els.editD));
    on(els.editH, "click", () => maybeAutoClearEditElapsedField(els.editH));
    on(els.editM, "click", () => maybeAutoClearEditElapsedField(els.editM));
    on(els.editS, "click", () => maybeAutoClearEditElapsedField(els.editS));

    on(els.elapsedPadOverlay, "click", (e: any) => {
      if (e.target === els.elapsedPadOverlay) closeElapsedPad(false);
    });
    on(els.elapsedPadCancelBtn, "click", () => closeElapsedPad(false));
    on(els.elapsedPadDoneBtn, "click", () => closeElapsedPad(true));

    document.querySelectorAll(".elapsedPadKey").forEach((btn) => {
      on(btn, "click", () => {
        const el = btn as HTMLElement;
        const digit = el.getAttribute("data-pad-digit");
        const action = el.getAttribute("data-pad-action");
        if (digit != null) {
          padAppendDigit(digit);
          return;
        }
        if (action === "back") {
          padBackspace();
          return;
        }
        if (action === "dot") {
          padAppendDot();
          return;
        }
        if (action === "clear") {
          padClear();
        }
      });
    });

    on(els.msArea?.querySelector?.("summary") as HTMLElement | null, "click", (e: any) => {
      const t = getCurrentEditTask();
      if (els.msArea && "open" in (els.msArea as any)) {
        if (!t || !editTaskHasActiveTimeGoal() || !t.milestonesEnabled) {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          (els.msArea as HTMLDetailsElement).open = false;
          return;
        }
        e?.preventDefault?.();
        e?.stopPropagation?.();
        (els.msArea as HTMLDetailsElement).open = true;
      }
    });

    on(els.msToggle, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;

      t.milestonesEnabled = !t.milestonesEnabled;
      if (els.msArea && "open" in (els.msArea as any)) {
        (els.msArea as HTMLDetailsElement).open = !!t.milestonesEnabled;
      }
      syncEditMilestoneSectionUi(t);
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);

      if (!t.milestonesEnabled) {
        t.presetIntervalsEnabled = false;
        toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, false);
        syncEditMilestoneSectionUi(t);
      }
    });

    on(els.msUnitDay, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;
      t.milestoneTimeUnit = "day";
      setMilestoneUnitUi("day");
      renderMilestoneEditor(t);
      syncEditSaveAvailability(t);
    });
    on(els.msUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;
      t.milestoneTimeUnit = "hour";
      setMilestoneUnitUi("hour");
      renderMilestoneEditor(t);
      syncEditSaveAvailability(t);
    });
    on(els.msUnitMinute, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) return;
      t.milestoneTimeUnit = "minute";
      setMilestoneUnitUi("minute");
      renderMilestoneEditor(t);
      syncEditSaveAvailability(t);
    });

    on(els.addMsBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !editTaskHasActiveTimeGoal()) {
        const currentTask = getCurrentEditTask();
        if (currentTask) syncEditCheckpointAlertUi(currentTask);
        return;
      }

      if (t.presetIntervalsEnabled) {
        if (!hasValidPresetInterval(t)) {
          syncEditCheckpointAlertUi(t);
          return;
        }
        if (!addMilestoneWithCurrentPreset(t, getEditTaskTimeGoalMinutes())) {
          showEditValidationError(t, "Checkpoint times must be less than the time goal.");
          syncEditCheckpointAlertUi(t);
          syncEditSaveAvailability(t);
          return;
        }
      } else {
        t.milestones = t.milestones || [];
        ensureMilestoneIdentity(t);
        const nextSeq = getPresetIntervalNextSeqNum(t);
        t.milestones.push({ id: cryptoRandomId(), createdSeq: nextSeq, hours: 0, description: "" });
        t.presetIntervalLastMilestoneId = t.milestones[t.milestones.length - 1]?.id || null;
        t.presetIntervalNextSeq = nextSeq + 1;
      }
      renderMilestoneEditor(t);
      clearEditValidationState();
      syncEditCheckpointAlertUi(t);
      syncEditSaveAvailability(t);
    });

    on(els.confirmCancelBtn, "click", closeConfirm);
    on(els.confirmAltBtn, "click", () => {
      if (typeof confirmActionAlt === "function") confirmActionAlt();
    });
    on(els.confirmOkBtn, "click", () => {
      if (typeof confirmAction === "function") confirmAction();
      else closeConfirm();
    });
    on(els.timeGoalCompleteUpdateGoalBtn, "click", () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      populateTimeGoalCompleteEditor(task);
      setTimeGoalCompleteEditorVisible(true);
    });
    on(els.timeGoalCompleteContinueCancelBtn, "click", () => {
      setTimeGoalCompleteEditorVisible(false);
    });
    on(els.timeGoalCompleteDurationValueInput, "input", syncTimeGoalCompleteDurationUnitUi);
    on(els.timeGoalCompleteDurationUnitMinute, "click", () => {
      timeGoalCompleteDurationUnit = "minute";
      syncTimeGoalCompleteDurationUnitUi();
    });
    on(els.timeGoalCompleteDurationUnitHour, "click", () => {
      timeGoalCompleteDurationUnit = "hour";
      syncTimeGoalCompleteDurationUnitUi();
    });
    on(els.timeGoalCompleteDurationPeriodDay, "click", () => {
      timeGoalCompleteDurationPeriod = "day";
      syncTimeGoalCompleteDurationUnitUi();
    });
    on(els.timeGoalCompleteDurationPeriodWeek, "click", () => {
      timeGoalCompleteDurationPeriod = "week";
      syncTimeGoalCompleteDurationUnitUi();
    });
    on(els.timeGoalCompleteSaveBtn, "click", async () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      openTimeGoalSaveNoteChoice(task);
    });
    on(els.timeGoalCompleteDiscardBtn, "click", async () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      await resolveTimeGoalCompletion(task, { logHistory: false });
    });
    on(els.timeGoalCompleteSaveNoteNoBtn, "click", async () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      persistPendingTimeGoalFlow(task, "main");
      await resolveTimeGoalCompletion(task, { logHistory: true });
    });
    on(els.timeGoalCompleteSaveNoteYesBtn, "click", () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      closeOverlay(els.timeGoalCompleteSaveNoteOverlay as HTMLElement | null);
      openTimeGoalNoteModal(task);
    });
    on(els.timeGoalCompleteNoteInput, "input", () => {
      const taskId = String(timeGoalModalTaskId || "").trim();
      if (!taskId) return;
      setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput?.value || ""));
    });
    on(els.timeGoalCompleteNoteDoneBtn, "click", async () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      const taskId = String(timeGoalModalTaskId || "").trim();
      if (!task || !taskId) return;
      setFocusSessionDraft(taskId, String(els.timeGoalCompleteNoteInput?.value || ""));
      closeOverlay(els.timeGoalCompleteNoteOverlay as HTMLElement | null);
      await resolveTimeGoalCompletion(task, { logHistory: true });
    });
    on(els.timeGoalCompleteContinueConfirmBtn, "click", () => {
      const task = tasks.find((row) => String(row.id || "") === String(timeGoalModalTaskId || ""));
      if (!task) return;
      const currentElapsedMs = Math.max(0, Math.floor(Number(timeGoalModalFrozenElapsedMs || 0) || 0));
      const nextGoalMinutes = getTimeGoalCompleteDurationMinutes();
      const rawValue = Math.max(1, Math.floor(Number(els.timeGoalCompleteDurationValueInput?.value || "1") || 1));
      task.timeGoalEnabled = nextGoalMinutes > 0;
      task.timeGoalValue = rawValue;
      task.timeGoalUnit = timeGoalCompleteDurationUnit;
      task.timeGoalPeriod = timeGoalCompleteDurationPeriod;
      task.timeGoalMinutes = nextGoalMinutes;
      resumeTaskAfterTimeGoalModal(task);
      if (!(nextGoalMinutes > 0) || nextGoalMinutes * 60 <= Math.floor(currentElapsedMs / 1000)) {
        timeGoalReminderAtMsByTaskId[String(task.id || "")] = nowMs() + getTimeGoalReminderDelayMs();
      } else {
        delete timeGoalReminderAtMsByTaskId[String(task.id || "")];
      }
      checkpointBaselineSecByTaskId[String(task.id || "")] = Math.floor(currentElapsedMs / 1000);
      closeOverlay(els.timeGoalCompleteOverlay as HTMLElement | null);
      clearPendingTimeGoalFlow();
      save();
      void syncSharedTaskSummariesForTask(String(task.id || "")).catch(() => {});
      render();
      openDeferredFocusModeTimeGoalModal();
    });
    on(els.checkpointToastHost, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "closeCheckpointToast") {
        dismissCheckpointToast({ manual: true });
        return;
      }
      if (action === "jumpToCheckpointTask") {
        dismissCheckpointToastAndJumpToTask();
      }
    });

    on(els.historyManagerBtn, "click", () => {
      navigateToAppRoute("/tasktimer/history-manager");
    });
    on(els.historyManagerExportBtn, "click", () => {
      exportHistoryManagerCsv();
    });
    on(els.historyManagerImportBtn, "click", () => {
      els.historyManagerImportFile?.click();
    });
    on(els.historyManagerImportFile, "change", (e: any) => {
      const f = e.target?.files && e.target.files[0] ? e.target.files[0] : null;
      e.target.value = "";
      if (f) importHistoryManagerCsvFromFile(f);
    });
    on(els.historyManagerGenerateBtn, "click", () => {
      if (!isArchitectUser()) {
        alert("Generate Test Data is architect-only.");
        return;
      }
      openHistoryManagerGenerateConfigDialog();
    });
    on(els.historyManagerBulkBtn, "click", () => {
      hmBulkEditMode = !hmBulkEditMode;
      if (!hmBulkEditMode) hmBulkSelectedRows = new Set<string>();
      renderHistoryManager();
    });
    on(els.historyManagerBulkDeleteBtn, "click", () => {
      const selected = Array.from(hmBulkSelectedRows);
      if (!selected.length) return;
      const byTask: Record<string, Set<string>> = {};
      selected.forEach((id) => {
        const firstSep = id.indexOf("|");
        if (firstSep <= 0) return;
        const taskId = id.slice(0, firstSep);
        const rowKey = id.slice(firstSep + 1);
        if (!byTask[taskId]) byTask[taskId] = new Set<string>();
        byTask[taskId].add(rowKey);
      });
      const taskCount = Object.keys(byTask).length;
      const entryCount = selected.length;
      confirm(
        "Delete Selected History",
        `${entryCount} entr${entryCount === 1 ? "y" : "ies"} across ${taskCount} task${
          taskCount === 1 ? "" : "s"
        } will be deleted. Continue?`,
        {
          okLabel: "Delete",
          cancelLabel: "Cancel",
          onOk: () => {
            historyByTaskId = loadHistory();
            Object.keys(byTask).forEach((taskId) => {
              const keys = byTask[taskId];
              const arr = (historyByTaskId[taskId] || []).slice();
              const next: any[] = [];
              arr.forEach((e: any) => {
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                if (keys.has(rowKey)) keys.delete(rowKey);
                else next.push(e);
              });
              historyByTaskId[taskId] = next;
              if (next.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
                delete (deletedTaskMeta as any)[taskId];
                saveDeletedMeta(deletedTaskMeta);
              }
            });
            saveHistory(historyByTaskId);
            void syncSharedTaskSummariesForTasks(Object.keys(byTask));
            hmBulkSelectedRows = new Set<string>();
            renderHistoryManager();
            closeConfirm();
            void refreshHistoryFromCloud()
              .then((nextHistory) => {
                historyByTaskId = nextHistory || {};
                renderHistoryManager();
              })
              .catch(() => {
                // Keep local post-delete state when cloud refresh is unavailable.
              });
          },
          onCancel: () => closeConfirm(),
        }
      );
    });
    on(els.historyManagerBackBtn, "click", () => {
      navigateToAppRoute("/tasktimer/settings");
    });
    on(els.focusModeBackBtn, "click", closeFocusMode);
    on(els.focusCheckpointToggle, "click", () => {
      if (!focusModeTaskId) return;
      const t = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
      if (!t) return;
      if (!hasFocusCheckpoints(t)) {
        syncFocusCheckpointToggle(t);
        return;
      }
      focusShowCheckpoints = !focusShowCheckpoints;
      syncFocusCheckpointToggle(t);
    });
    on(els.focusDial, "click", () => {
      if (!focusModeTaskId) return;
      const idx = tasks.findIndex((x) => String(x.id || "") === String(focusModeTaskId));
      if (idx < 0) return;
      const t = tasks[idx];
      if (!t) return;
      if (t.running) stopTask(idx);
      else startTask(idx);
    });
    on(els.focusResetBtn, "click", () => {
      if (!focusModeTaskId) return;
      const idx = tasks.findIndex((x) => String(x.id || "") === String(focusModeTaskId));
      if (idx < 0) return;
      resetTask(idx);
    });
    on(els.focusSessionNotesInput, "input", () => {
      if (!focusModeTaskId) return;
      scheduleFocusSessionNoteSave(String(focusModeTaskId || ""), String(els.focusSessionNotesInput?.value || ""));
    });
    on(els.hmList, "click", (ev: any) => {
      const bulkCheckbox = ev.target?.closest?.(".hmBulkCheckbox");
      if (bulkCheckbox) {
        ev.stopPropagation();
        return;
      }
      const sortBtn = ev.target?.closest?.(".hmSortBtn");
      if (sortBtn) {
        const key = sortBtn.getAttribute("data-hm-sort");
        if (key === "ts" || key === "ms") {
          if (hmSortKey === key) hmSortDir = hmSortDir === "asc" ? "desc" : "asc";
          else {
            hmSortKey = key;
            hmSortDir = "desc";
          }
          renderHistoryManager();
        }
        return;
      }

      const btn = ev.target?.closest?.(".hmDelBtn");
      if (!btn) return;

      const taskId = btn.getAttribute("data-task");
      const key = btn.getAttribute("data-key");
      if (!taskId || !key) return;

      const parts = key.split("|");
      const ts = parseInt(parts[0], 10);
      const ms = parseInt(parts[1], 10);
      const name = parts.slice(2).join("|");

      confirm("Delete Log Entry", "Delete this entry?", {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          historyByTaskId = loadHistory();
          const orig = historyByTaskId[taskId] || [];
          const pos = orig.findIndex(
            (e: any) => e.ts === ts && e.ms === ms && String(e.name || "") === String(name || "")
          );

          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            saveHistory(historyByTaskId);
            void syncSharedTaskSummariesForTask(taskId).catch(() => {});

            if (orig.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
              delete (deletedTaskMeta as any)[taskId];
              saveDeletedMeta(deletedTaskMeta);
            }
          }

          renderHistoryManager();
          closeConfirm();
        },
        onCancel: () => closeConfirm(),
      });
    });
    on(els.hmList, "change", (ev: any) => {
      if (!hmBulkEditMode) return;
      const el = ev.target as HTMLInputElement | null;
      if (!el || !el.classList || !el.classList.contains("hmBulkCheckbox")) return;
      const checked = !!el.checked;
      if (el.classList.contains("hmBulkTaskChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const ids = hmRowsByTask[taskId] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkDateChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const dateKey = el.getAttribute("data-date") || "";
        const ids = hmRowsByTaskDate[`${taskId}|${dateKey}`] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkRowChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const rowKey = el.getAttribute("data-key") || "";
        const id = `${taskId}|${rowKey}`;
        if (checked) hmBulkSelectedRows.add(id);
        else hmBulkSelectedRows.delete(id);
        renderHistoryManager();
      }
    });
  }

  function tick() {
    if (runtime.destroyed) return;

    const processedCheckpointTaskIds = new Set<string>();
    const taskList = els.taskList as HTMLElement | null;
    if (taskList) {
      const nodes = taskList.querySelectorAll(".task");
      nodes.forEach((node) => {
        const i = parseInt((node as HTMLElement).dataset.index || "0", 10);
        const t = tasks[i];
        if (!t) return;

        const timeEl = node.querySelector(".time");
        const elapsedMs = getElapsedMs(t);
        if (timeEl) (timeEl as HTMLElement).innerHTML = formatMainTaskElapsedHtml(elapsedMs, !!t.running);
        processCheckpointAlertsForTask(t, elapsedMs / 1000);
        processedCheckpointTaskIds.add(String(t.id || ""));

        const hasMilestones = t.milestonesEnabled && t.milestones && t.milestones.length > 0;
        const hasTimeGoal = !!t.timeGoalEnabled && Number(t.timeGoalMinutes || 0) > 0;
        if (hasMilestones || hasTimeGoal) {
          const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
          const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
          const maxSec = Math.max(maxValue * milestoneUnitSec(t), hasTimeGoal ? Number(t.timeGoalMinutes || 0) * 60 : 0, 1);
          const pct = Math.min((elapsedMs / 1000 / maxSec) * 100, 100);

          const fill = node.querySelector(".progressFill") as HTMLElement | null;
          if (fill) {
            fill.style.width = pct + "%";
            fill.style.background = dynamicColorsEnabled ? fillBackgroundForPct(pct) : getModeColor(taskModeOf(t));
          }

          if (hasMilestones) {
            const elapsedSec = elapsedMs / 1000;
            const mkTimes = node.querySelectorAll(".mkTime");

            mkTimes.forEach((mt) => {
              const txt = (mt.textContent || "").trim();
              const v = parseFloat(txt.replace(/[^0-9.]/g, "")) || 0;
              const reached = elapsedSec >= v * milestoneUnitSec(t);
              mt.classList.toggle("mkAch", reached);
              mt.classList.toggle("mkPend", !reached);
            });
          }
        }
      });
    }

    tasks.forEach((t) => {
      const taskId = String(t.id || "");
      if (!taskId || processedCheckpointTaskIds.has(taskId)) return;
      processCheckpointAlertsForTask(t, getElapsedMs(t) / 1000);
    });

    if (checkpointAutoResetDirty) {
      checkpointAutoResetDirty = false;
      save();
      render();
      if (focusModeTaskId) {
        const ft = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
        if (ft) {
          // Force a full checkpoint marker re-layout after auto-reset/log, since the dial
          // update was skipped in the same tick that triggered the reset.
          focusCheckpointSig = "";
          updateFocusDial(ft);
        }
      }
    }

    if (focusModeTaskId) {
      const ft = tasks.find((x) => String(x.id || "") === String(focusModeTaskId));
      if (ft) {
        updateFocusDial(ft);
      } else if (els.focusTaskName && focusModeTaskName) {
        els.focusTaskName.textContent = focusModeTaskName;
      }
    }

    if (activeCheckpointToast) {
      renderCheckpointToast();
    }
    if (currentAppPage === "dashboard") {
      renderDashboardWidgets({ includeAvgSession: false });
    }

    runtime.tickRaf = window.requestAnimationFrame(() => {
      runtime.tickTimeout = window.setTimeout(tick, 200);
    });
  }

  function hydrateUiStateFromCaches() {
    primeDashboardCacheFromShadow();
    deletedTaskMeta = loadDeletedMeta();
    loadHistoryIntoMemory();
    focusSessionNotesByTaskId = loadFocusSessionNotes();
    maybeRepairHistoryNotesInCloud();
    loadHistoryRangePrefs();
    load();
    loadAddTaskCustomNames();
    loadDefaultTaskTimerFormat();
    loadTaskViewPreference();
    loadAutoFocusOnTaskLaunchSetting();
    loadDynamicColorsSetting();
    loadCheckpointAlertSettings();
    loadDashboardWidgetState();
    loadThemePreference();
    loadMenuButtonStylePreference();
    // Keep Preferences controls in sync with hydrated cloud values on both
    // /tasktimer and /tasktimer/settings routes.
    syncTaskSettingsUi();
    loadPinnedHistoryTaskIds();
    loadModeLabels();
    backfillHistoryColorsFromSessionLogic();
    syncModeLabelsUi();
    applyMainMode("mode1");
    applyAppPage(getInitialAppPageFromLocation(initialAppPage), { syncUrl: "replace" });
    applyDashboardOrderFromStorage();
    applyDashboardCardSizes();
    renderDashboardPanelMenu();
    applyDashboardCardVisibility();
    applyDashboardEditMode();
    if (currentAppPage === "dashboard") {
      renderDashboardWidgets();
    }
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
        maybeRestorePendingTimeGoalFlow();
      });
    });
    render();
    maybeHandlePendingTaskJump();
    maybeOpenImportFromQuery();
    if (!els.taskList && els.historyManagerScreen) {
      openHistoryManager();
    }
    if (!runtime.tickStarted) {
      tick();
      runtime.tickStarted = true;
    }
  };

  bootstrap();
  void rehydrateFromCloudAndRender();

  return { destroy };
}
