import type { Task } from "../lib/types";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeOptimalProductivityPeriod,
  timeOfDayToMinutes,
} from "../lib/productivityPeriod";
import { renderTaskTimerSchedulePage } from "./schedule-render";
import { SCHEDULE_MINUTE_PX } from "./schedule-runtime";
import {
  clearTaskTimerPendingPushAction,
  handleTaskTimerArchieNavigate,
  maybeHandleTaskTimerPendingPushAction,
  subscribeToTaskTimerCheckpointAlertMuteSignals,
} from "./runtime-bridge";
import type { TaskTimerScheduleState } from "./schedule-runtime";
import type { TaskTimerMutableStore } from "./mutable-store";
import type { AppPage } from "./types";
import type { TaskTimerElements } from "./elements";

type CreateTaskTimerRuntimeCoordinatorOptions = {
  els: TaskTimerElements;
  scheduleState: TaskTimerMutableStore<TaskTimerScheduleState>;
  scheduleRuntime: unknown;
  escapeHtmlUI: (value: unknown) => string;
  getOptimalProductivityStartTime: () => string;
  getOptimalProductivityEndTime: () => string;
  renderTasksPage: () => void;
  getCloudSyncApi: () =>
    | {
        rehydrateFromCloudAndRender: (opts?: { force?: boolean }) => Promise<void>;
        initCloudRefreshSync: () => void;
      }
    | null;
  pendingPushActionKey: string;
  getTasks: () => Task[];
  startTaskByIndex: (index: number) => void;
  jumpToTaskById: (taskId: string) => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  applyAppPage: (page: AppPage, opts?: { pushNavStack?: boolean; syncUrl?: "replace" | "push" | false; skipDashboardRender?: boolean }) => void;
  navigateToAppRoute: (path: string) => void;
  checkpointRepeatActiveTaskId: () => string | null;
  stopCheckpointRepeatAlert: () => void;
  getHistoryInlineApi: () =>
    | {
        resetAllOpenHistoryChartSelections: () => void;
        renderHistory: (taskId: string) => void;
      }
    | null;
  windowRef: Window;
  getCurrentUid: () => string | null;
  getCurrentEmail: () => string | null;
  architectEmail: string;
};

export function escapeTaskTimerHtml(str: unknown) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getTaskTimerTileColumnCount(windowRef: Window) {
  if (typeof windowRef === "undefined") return 1;
  if (windowRef.matchMedia("(min-width: 1200px)").matches) return 3;
  if (windowRef.matchMedia("(min-width: 720px)").matches) return 2;
  return 1;
}

export function isTaskTimerArchitectUser(options: {
  getCurrentEmail: () => string | null;
  architectEmail: string;
}) {
  const email = options.getCurrentEmail();
  return String(email || "").trim().toLowerCase() === options.architectEmail.toLowerCase();
}

function getPresentScheduleDay(): TaskTimerScheduleState["selectedDay"] {
  const dayIndex = new Date().getDay();
  switch (dayIndex) {
    case 0:
      return "sun";
    case 1:
      return "mon";
    case 2:
      return "tue";
    case 3:
      return "wed";
    case 4:
      return "thu";
    case 5:
      return "fri";
    case 6:
      return "sat";
    default:
      return "mon";
  }
}

export function createTaskTimerRuntimeCoordinator(options: CreateTaskTimerRuntimeCoordinatorOptions) {
  let pendingScheduleEntryScroll = false;

  function requestScheduleEntryScroll() {
    pendingScheduleEntryScroll = true;
  }

  function renderSchedulePage() {
    const scheduleRuntime = options.scheduleRuntime as Parameters<typeof renderTaskTimerSchedulePage>[0]["scheduleRuntime"];
    const presentDay = pendingScheduleEntryScroll ? getPresentScheduleDay() : null;
    if (presentDay) {
      options.scheduleState.set("selectedDay", presentDay);
    }
    renderTaskTimerSchedulePage({
      els: options.els,
      state: options.scheduleState,
      scheduleRuntime,
      escapeHtmlUI: options.escapeHtmlUI,
      getOptimalProductivityStartTime: options.getOptimalProductivityStartTime,
      getOptimalProductivityEndTime: options.getOptimalProductivityEndTime,
    });
    if (!pendingScheduleEntryScroll || !options.els.scheduleGridScroller) return;
    pendingScheduleEntryScroll = false;
    const viewModel = scheduleRuntime.buildViewModel();
    const firstScheduledStartMinutes =
      viewModel.scheduled.find((entry) => entry.day === presentDay)?.startMinutes ?? null;
    const period = normalizeOptimalProductivityPeriod({
      optimalProductivityStartTime: options.getOptimalProductivityStartTime(),
      optimalProductivityEndTime: options.getOptimalProductivityEndTime(),
    });
    const targetMinutes = firstScheduledStartMinutes ?? timeOfDayToMinutes(period.startTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME);
    options.windowRef.requestAnimationFrame(() => {
      const scroller = options.els.scheduleGridScroller;
      if (!scroller) return;
      scroller.scrollTop = Math.max(0, targetMinutes * SCHEDULE_MINUTE_PX - 24);
    });
  }

  function render() {
    options.renderTasksPage();
    renderSchedulePage();
  }

  function rehydrateFromCloudAndRender(opts?: { force?: boolean }) {
    const cloudSyncApi = options.getCloudSyncApi();
    if (!cloudSyncApi) return Promise.resolve();
    return cloudSyncApi.rehydrateFromCloudAndRender(opts);
  }

  function initCloudRefreshSync() {
    options.getCloudSyncApi()?.initCloudRefreshSync();
  }

  function clearPendingPushAction() {
    clearTaskTimerPendingPushAction(options.pendingPushActionKey);
  }

  function maybeHandlePendingPushAction() {
    void maybeHandleTaskTimerPendingPushAction({
      getTasks: options.getTasks,
      clearPendingPushAction,
      startTaskByIndex: options.startTaskByIndex,
      jumpToTaskById: options.jumpToTaskById,
      maybeRestorePendingTimeGoalFlow: options.maybeRestorePendingTimeGoalFlow,
    });
  }

  function handleArchieNavigate(hrefRaw: unknown) {
    handleTaskTimerArchieNavigate(hrefRaw, {
      applyAppPage: options.applyAppPage,
      navigateToAppRoute: options.navigateToAppRoute,
    });
  }

  function subscribeToCheckpointAlertMuteSignals(
    unsubscribeRef: { current: (() => void) | null }
  ) {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    unsubscribeRef.current = subscribeToTaskTimerCheckpointAlertMuteSignals({
      checkpointRepeatActiveTaskId: options.checkpointRepeatActiveTaskId,
      stopCheckpointRepeatAlert: options.stopCheckpointRepeatAlert,
    });
  }

  function resetAllOpenHistoryChartSelections() {
    options.getHistoryInlineApi()?.resetAllOpenHistoryChartSelections();
  }

  function renderHistory(taskId: string) {
    options.getHistoryInlineApi()?.renderHistory(taskId);
  }

  return {
    renderSchedulePage,
    requestScheduleEntryScroll,
    render,
    rehydrateFromCloudAndRender,
    initCloudRefreshSync,
    clearPendingPushAction,
    maybeHandlePendingPushAction,
    handleArchieNavigate,
    subscribeToCheckpointAlertMuteSignals,
    resetAllOpenHistoryChartSelections,
    renderHistory,
    getTileColumnCount: () => getTaskTimerTileColumnCount(options.windowRef),
    isArchitectUser: () =>
      isTaskTimerArchitectUser({
        getCurrentEmail: options.getCurrentEmail,
        architectEmail: options.architectEmail,
      }),
  };
}
