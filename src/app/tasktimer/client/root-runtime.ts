import type { Task } from "../lib/types";
import type { TaskTimerElements } from "./elements";
import {
  registerTaskTimerDashboardShellEvents,
  registerTaskTimerScheduleEvents,
  registerTaskTimerWindowRuntimeEvents,
} from "./global-events";
import type { TaskTimerRuntime } from "./runtime";
import {
  bootstrapTaskTimerRuntime,
  finishTaskTimerBootstrapUi,
  runInitialTaskTimerHydration,
} from "./tasktimer-bootstrap";
import { registerPrimaryClickAudio } from "./primary-click-audio";
import { registerSecondaryClickAudio } from "./secondary-click-audio";
import type { AppPage } from "./types";

type ScheduleDay = Task["plannedStartDay"];
type NonNullScheduleDay = NonNullable<ScheduleDay>;

type RegisterRootEventsOptions = {
  on: TaskTimerRuntime["on"];
  runtime: TaskTimerRuntime;
  els: TaskTimerElements;
  documentRef: Document;
  windowRef: Window;
  planChangedEvent: string;
  scheduleMinutePx: number;
  isScheduleMobileLayout: () => boolean;
  normalizeScheduleDay: (value: unknown) => ScheduleDay;
  tasks: () => Task[];
  isScheduleRenderableTask: (task: Task) => boolean;
  isRecurringDailyScheduleTask: (task: Task) => boolean;
  formatScheduleDayLabel: (day: NonNullScheduleDay) => string;
  save: () => void;
  render: () => void;
  renderSchedulePage: () => void;
  setScheduleSelectedDay: (day: NonNullScheduleDay) => void;
  setScheduleDragTaskId: (taskId: string | null) => void;
  setScheduleDragSourceDay: (day: NonNullScheduleDay | null) => void;
  getScheduleDragTaskId: () => string | null;
  getScheduleDragSourceDay: () => NonNullScheduleDay | null;
  clearScheduleDragPreview: () => void;
  setScheduleDragPointerOffsetMinutes: (value: number) => void;
  resolveScheduleDropStartMinutes: (dropZone: HTMLElement, clientY: unknown) => number;
  getScheduleDragPreviewDay: () => NonNullScheduleDay | null;
  getScheduleDragPreviewStartMinutes: () => number | null;
  setScheduleDragPreview: (day: NonNullScheduleDay, startMinutes: number) => void;
  currentAppPage: () => AppPage;
  moveTaskOnSchedule: (taskId: string, day: NonNullScheduleDay, startMinutes: number, sourceDay?: NonNullScheduleDay | null) => void;
  toggleTaskScheduleFlexible: (taskId: string) => { status: "missing" | "noop" | "updated"; flexible?: boolean };
  openOverlay: (overlay: HTMLElement | null) => void;
  getTaskView: () => "list" | "tile";
  hasTaskList: () => boolean;
  getTileColumnCount: () => number;
  getCurrentTileColumnCount: () => number;
  renderDashboardWidgetsWithBusy: () => void;
  renderGroupsPage: () => void;
  openHistoryManager: () => void;
  pendingPushEvent: string;
  maybeHandlePendingTaskJump: () => void;
  maybeHandlePendingPushAction: () => void;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<void>;
  maybeRestorePendingTimeGoalFlow: () => void;
  flushPendingCloudWrites: () => Promise<void>;
  registerAppShellEvents: () => void;
  registerGroupsEvents: () => void;
  registerAddTaskEvents: () => void;
  registerTaskEvents: () => void;
  registerTaskListUiEvents: () => void;
  registerDashboardEvents: () => void;
  registerPreferenceEvents: (args: { handleAppBackNavigation: () => boolean }) => void;
  getInteractionClickSoundEnabled: () => boolean;
  normalizedPathname: () => string;
  normalizeTaskTimerRoutePath: (path: string) => string;
  appPathForPage: (page: AppPage) => string;
  handleAppBackNavigation: () => boolean;
  registerHistoryInlineEvents: () => void;
  registerHistoryManagerEvents: () => void;
  registerSessionEvents: () => void;
  registerEditTaskEvents: () => void;
  registerPopupMenuEvents: () => void;
  registerImportExportEvents: () => void;
  isDashboardBusy: () => boolean;
  dashboardMenuFlipped: () => boolean;
  setDashboardRefreshPending: (value: boolean) => void;
  closeDashboardHeatSummaryCard: (opts?: { restoreFocus?: boolean }) => void;
  registerConfirmOverlayEvents: () => void;
};

type StartRootLifecycleOptions = {
  runtime: TaskTimerRuntime;
  hydrateUiStateFromCaches: (opts?: { skipDashboardWidgetsRender?: boolean }) => void;
  startInitialAuthHydration: (message?: string) => void;
  finishInitialAuthHydration: () => void;
  subscribeToCheckpointAlertMuteSignals: () => void;
  refreshOwnSharedSummaries: () => Promise<unknown>;
  reconcileOwnedSharedSummaryStates: () => void;
  render: () => void;
  currentAppPage: AppPage;
  openHistoryTaskIds: Set<string>;
  renderHistory: (taskId: string) => void;
  initMobileBackHandling: () => void;
  initCloudRefreshSync: () => void;
  wireEvents: () => void;
  maybeOpenImportFromQuery: () => void;
  syncDashboardMenuFlipUi: () => void;
  syncDashboardRefreshButtonUi: () => void;
  maybeHandlePendingPushAction: () => void;
  maybeHandlePendingTaskJump: () => void;
  hasTaskList: () => boolean;
  hasHistoryManagerScreen: () => boolean;
  openHistoryManager: () => void;
  tickApi: () => void;
  setDashboardRefreshPending: (value: boolean) => void;
  currentUid: () => string | null;
  rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<void>;
  flushPendingCloudWrites: () => Promise<void>;
};

export function registerTaskTimerRootEvents(options: RegisterRootEventsOptions) {
  const { on, els, documentRef, windowRef, runtime } = options;

  registerPrimaryClickAudio({ on, documentRef, isEnabled: options.getInteractionClickSoundEnabled });
  registerSecondaryClickAudio({ on, documentRef, isEnabled: options.getInteractionClickSoundEnabled });

  options.registerAppShellEvents();

  registerTaskTimerScheduleEvents({
    on,
    documentRef,
    scheduleMinutePx: options.scheduleMinutePx,
    isScheduleMobileLayout: options.isScheduleMobileLayout,
    normalizeScheduleDay: options.normalizeScheduleDay,
    tasks: options.tasks,
    isScheduleRenderableTask: options.isScheduleRenderableTask,
    isRecurringDailyScheduleTask: options.isRecurringDailyScheduleTask,
    formatScheduleDayLabel: options.formatScheduleDayLabel,
    save: options.save,
    render: options.render,
    setScheduleSelectedDay: options.setScheduleSelectedDay,
    renderSchedulePage: options.renderSchedulePage,
    setScheduleDragTaskId: options.setScheduleDragTaskId,
    setScheduleDragSourceDay: options.setScheduleDragSourceDay,
    getScheduleDragTaskId: options.getScheduleDragTaskId,
    getScheduleDragSourceDay: options.getScheduleDragSourceDay,
    clearScheduleDragPreview: options.clearScheduleDragPreview,
    setScheduleDragPointerOffsetMinutes: options.setScheduleDragPointerOffsetMinutes,
    resolveScheduleDropStartMinutes: options.resolveScheduleDropStartMinutes,
    getScheduleDragPreviewDay: options.getScheduleDragPreviewDay,
    getScheduleDragPreviewStartMinutes: options.getScheduleDragPreviewStartMinutes,
    setScheduleDragPreview: options.setScheduleDragPreview,
    currentAppPage: options.currentAppPage,
    moveTaskOnSchedule: options.moveTaskOnSchedule,
    toggleTaskScheduleFlexible: options.toggleTaskScheduleFlexible,
  });

  on(els.rewardsInfoOpenBtn, "click", (event: unknown) => {
    const e = event as { preventDefault?: () => void };
    e.preventDefault?.();
    options.openOverlay(els.rewardsInfoOverlay as HTMLElement | null);
  });

  on(windowRef, "resize", () => {
    if (options.currentAppPage() === "schedule") options.renderSchedulePage();
    if (options.getTaskView() !== "tile" || !options.hasTaskList()) return;
    const nextCount = options.getTileColumnCount();
    if (nextCount !== options.getCurrentTileColumnCount()) options.render();
  });

  on(windowRef, options.planChangedEvent, () => {
    if (runtime.destroyed) return;
    options.render();
    if (options.currentAppPage() === "dashboard") options.renderDashboardWidgetsWithBusy();
    if (options.currentAppPage() === "friends") options.renderGroupsPage();
    if (!options.hasTaskList() && !!els.historyManagerScreen) options.openHistoryManager();
  });

  registerTaskTimerWindowRuntimeEvents({
    on,
    windowRef,
    runtimeDestroyed: () => runtime.destroyed,
    pendingPushEvent: options.pendingPushEvent,
    maybeHandlePendingTaskJump: options.maybeHandlePendingTaskJump,
    maybeHandlePendingPushAction: options.maybeHandlePendingPushAction,
    rehydrateFromCloudAndRender: options.rehydrateFromCloudAndRender,
    maybeRestorePendingTimeGoalFlow: options.maybeRestorePendingTimeGoalFlow,
    flushPendingCloudWrites: options.flushPendingCloudWrites,
  });

  options.registerGroupsEvents();
  options.registerAddTaskEvents();
  options.registerTaskEvents();
  options.registerTaskListUiEvents();
  options.registerDashboardEvents();
  options.registerPreferenceEvents({
    handleAppBackNavigation: () => {
      const currentRoutePath = options.normalizeTaskTimerRoutePath(options.normalizedPathname());
      if (currentRoutePath === "/settings") {
        windowRef.location.href = options.appPathForPage("dashboard");
        return true;
      }
      return options.handleAppBackNavigation();
    },
  });
  options.registerHistoryInlineEvents();
  options.registerHistoryManagerEvents();
  options.registerSessionEvents();
  options.registerEditTaskEvents();
  options.registerPopupMenuEvents();
  options.registerImportExportEvents();

  registerTaskTimerDashboardShellEvents({
    on,
    dashboardRefreshBtn: els.dashboardRefreshBtn as EventTarget | null | undefined,
    dashboardHeatSummaryCloseBtn: els.dashboardHeatSummaryCloseBtn as EventTarget | null | undefined,
    isDashboardBusy: options.isDashboardBusy,
    dashboardMenuFlipped: options.dashboardMenuFlipped,
    setDashboardRefreshPending: options.setDashboardRefreshPending,
    rehydrateFromCloudAndRender: options.rehydrateFromCloudAndRender,
    closeDashboardHeatSummaryCard: options.closeDashboardHeatSummaryCard,
  });

  options.registerConfirmOverlayEvents();
}

export function startTaskTimerRootLifecycle(options: StartRootLifecycleOptions) {
  const finishBootstrapUi = () => {
    finishTaskTimerBootstrapUi({
      runtimeDestroyed: () => options.runtime.destroyed,
      render: options.render,
      maybeHandlePendingTaskJump: options.maybeHandlePendingTaskJump,
      maybeHandlePendingPushAction: options.maybeHandlePendingPushAction,
      hasTaskList: options.hasTaskList,
      hasHistoryManagerScreen: options.hasHistoryManagerScreen,
      openHistoryManager: options.openHistoryManager,
      tickStarted: () => options.runtime.tickStarted,
      tickApi: options.tickApi,
      setTickStarted: (value) => {
        options.runtime.tickStarted = value;
      },
    });
  };

  bootstrapTaskTimerRuntime({
    hydrateUiStateFromCaches: options.hydrateUiStateFromCaches,
    subscribeToCheckpointAlertMuteSignals: options.subscribeToCheckpointAlertMuteSignals,
    refreshOwnSharedSummaries: options.refreshOwnSharedSummaries,
    reconcileOwnedSharedSummaryStates: options.reconcileOwnedSharedSummaryStates,
    render: options.render,
    currentAppPage: options.currentAppPage,
    openHistoryTaskIds: options.openHistoryTaskIds,
    renderHistory: options.renderHistory,
    initMobileBackHandling: options.initMobileBackHandling,
    initCloudRefreshSync: options.initCloudRefreshSync,
    runtimeDestroyed: () => options.runtime.destroyed,
    eventsWired: () => options.runtime.eventsWired,
    setEventsWired: (value) => {
      options.runtime.eventsWired = value;
    },
    wireEvents: options.wireEvents,
    onWindowPendingPush: () => {},
    maybeOpenImportFromQuery: options.maybeOpenImportFromQuery,
    syncDashboardMenuFlipUi: options.syncDashboardMenuFlipUi,
    syncDashboardRefreshButtonUi: options.syncDashboardRefreshButtonUi,
  });

  runInitialTaskTimerHydration({
    currentAppPage: options.currentAppPage,
    finishBootstrapUi,
    setDashboardRefreshPending: options.setDashboardRefreshPending,
    currentUid: options.currentUid,
    startInitialAuthHydration: options.startInitialAuthHydration,
    finishInitialAuthHydration: options.finishInitialAuthHydration,
    rehydrateFromCloudAndRender: options.rehydrateFromCloudAndRender,
  });
}
