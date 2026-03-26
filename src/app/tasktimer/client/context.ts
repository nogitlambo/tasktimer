import type { TaskTimerElements } from "./elements";
import type { TaskTimerRuntime } from "./runtime";
import type { AppPage, MainMode } from "./types";
import type { DeletedTaskMeta, HistoryByTaskId, Task } from "../lib/types";

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
  theme?: unknown;
  menuButtonStyle?: unknown;
  defaultTaskTimerFormat?: unknown;
  taskView?: unknown;
  autoFocusOnTaskLaunchEnabled?: unknown;
  dynamicColorsEnabled?: unknown;
  checkpointAlertSoundEnabled?: unknown;
  checkpointAlertToastEnabled?: unknown;
  modeSettings?: TaskTimerCachedModeSettings;
};

export type TaskTimerConfirmOptions = {
  okLabel?: string;
  cancelLabel?: string;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  textHtml?: string;
  onOk?: (() => void) | null;
  onCancel?: (() => void) | null;
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
  renderDashboardWidgets: (opts?: { includeAvgSession?: boolean }) => void;
  renderGroupsPage: () => void;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<void>;
  getOpenHistoryTaskIds: () => Iterable<string>;
  closeTopOverlayIfOpen: () => boolean;
  closeMobileDetailPanelIfOpen: () => boolean;
  showExitAppConfirm: () => void;
};

export type TaskTimerPreferencesContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  storageKeys: {
    THEME_KEY: string;
    TASK_VIEW_KEY: string;
    AUTO_FOCUS_ON_TASK_LAUNCH_KEY: string;
    MENU_BUTTON_STYLE_KEY: string;
    MODE_SETTINGS_KEY: string;
    DEFAULT_TASK_TIMER_FORMAT_KEY: string;
  };
  defaultModeLabels: Record<MainMode, string>;
  defaultModeEnabled: Record<MainMode, boolean>;
  defaultModeColors: Record<MainMode, string>;
  getThemeMode: () => "purple" | "cyan";
  setThemeModeState: (value: "purple" | "cyan") => void;
  getTaskView: () => "list" | "tile";
  setTaskViewState: (value: "list" | "tile") => void;
  getMenuButtonStyle: () => "parallelogram" | "square";
  setMenuButtonStyleState: (value: "parallelogram" | "square") => void;
  getDefaultTaskTimerFormat: () => "day" | "hour" | "minute";
  setDefaultTaskTimerFormatState: (value: "day" | "hour" | "minute") => void;
  getAutoFocusOnTaskLaunchEnabled: () => boolean;
  setAutoFocusOnTaskLaunchEnabledState: (value: boolean) => void;
  getDynamicColorsEnabled: () => boolean;
  setDynamicColorsEnabledState: (value: boolean) => void;
  getCheckpointAlertSoundEnabled: () => boolean;
  setCheckpointAlertSoundEnabledState: (value: boolean) => void;
  getCheckpointAlertToastEnabled: () => boolean;
  setCheckpointAlertToastEnabledState: (value: boolean) => void;
  getModeLabels: () => Record<MainMode, string>;
  setModeLabelsState: (value: Record<MainMode, string>) => void;
  getModeEnabled: () => Record<MainMode, boolean>;
  setModeEnabledState: (value: Record<MainMode, boolean>) => void;
  getCurrentMode: () => MainMode;
  getEditMoveTargetMode: () => MainMode;
  setEditMoveTargetModeState: (value: MainMode) => void;
  persistPreferencesToCloud: () => void;
  loadCachedPreferences: () => TaskTimerCachedPreferences | null | undefined;
  loadCachedTaskUi: () => unknown;
  getCloudPreferencesCache: () => TaskTimerCachedPreferences | null | undefined;
  saveDashboardWidgetState: (partialWidgets: Record<string, unknown>) => void;
  getDashboardCardSizeMapForStorage: () => Record<string, unknown>;
  getDashboardAvgRange: () => string;
  getCurrentEditTask: () => Task | null;
  syncEditCheckpointAlertUi: (task: Task) => void;
  applyMainMode: (mode: MainMode) => void;
  clearTaskFlipStates: () => void;
  render: () => void;
  renderDashboardPanelMenu: () => void;
  renderDashboardWidgets: (opts?: { includeAvgSession?: boolean }) => void;
  ensureDashboardIncludedModesValid: () => void;
  closeOverlay: (overlay: HTMLElement | null) => void;
  closeConfirm: () => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  deleteTasksInMode: (mode: MainMode) => void;
  escapeHtmlUI: (value: unknown) => string;
  stopCheckpointRepeatAlert: () => void;
  getCurrentAppPage: () => AppPage;
};

export type TaskTimerHistoryManagerSortKey = "ts" | "ms";
export type TaskTimerHistoryManagerSortDir = "asc" | "desc";

export type TaskTimerHistoryManagerContext = {
  els: TaskTimerElements;
  on: TaskTimerRuntime["on"];
  runtime: TaskTimerRuntime;
  getTasks: () => Task[];
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
  saveHistory: (history: HistoryByTaskId) => void;
  saveHistoryAndWait: (history: HistoryByTaskId) => Promise<void>;
  loadHistory: () => HistoryByTaskId;
  refreshHistoryFromCloud: () => Promise<HistoryByTaskId>;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  loadDeletedMeta: () => DeletedTaskMeta;
  load: () => void;
  render: () => void;
  navigateToAppRoute: (path: string) => void;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  escapeHtmlUI: (value: unknown) => string;
  syncSharedTaskSummariesForTasks: (taskIds: string[]) => Promise<void>;
  syncSharedTaskSummariesForTask: (taskId: string) => Promise<void>;
};
