import type { Task } from "../lib/types";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeOptimalProductivityPeriod,
  timeOfDayToMinutes,
} from "../lib/productivityPeriod";
import { renderTaskTimerSchedulePage } from "./schedule-render";
import { SCHEDULE_MINUTE_PX, type TaskTimerScheduleViewModel } from "./schedule-runtime";
import {
  clearTaskTimerPendingPushAction,
  maybeHandleTaskTimerPendingPushAction,
  subscribeToTaskTimerCheckpointAlertMuteSignals,
} from "./runtime-bridge";
import type { TaskTimerScheduleState } from "./schedule-runtime";
import type { TaskTimerMutableStore } from "./mutable-store";
import type { AppPage } from "./types";
import type { TaskTimerElements } from "./elements";
import type { DashboardWeekStart } from "../lib/historyChart";
import { getTaskTimerTileColumnCount } from "./task-tile-columns";

type CreateTaskTimerRuntimeCoordinatorOptions = {
  els: TaskTimerElements;
  scheduleState: TaskTimerMutableStore<TaskTimerScheduleState>;
  scheduleRuntime: unknown;
  escapeHtmlUI: (value: unknown) => string;
  getWeekStarting: () => DashboardWeekStart;
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
        closeUnpinnedOpenHistoryCharts: () => void;
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

function isTaskTimerArchitectUser(options: {
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

function getFirstScheduledEntry(viewModel: Pick<TaskTimerScheduleViewModel, "scheduled">) {
  return viewModel.scheduled[0] ?? null;
}

function isScrollableY(node: HTMLElement | null | undefined) {
  if (!node) return false;
  return node.scrollHeight > node.clientHeight;
}

function resolveScheduleScrollContainer(preferredScroller: HTMLElement | null | undefined, scheduleGrid: HTMLElement | null | undefined) {
  if (preferredScroller && typeof preferredScroller.contains === "function" && preferredScroller.contains(scheduleGrid || null)) {
    return preferredScroller;
  }
  if (!scheduleGrid) return preferredScroller ?? null;
  let current = scheduleGrid.parentElement;
  while (current) {
    if (isScrollableY(current)) return current;
    current = current.parentElement;
  }
  return preferredScroller ?? scheduleGrid.parentElement;
}

export function resolveScheduleOpenFocus(options: {
  presentDay: TaskTimerScheduleState["selectedDay"] | null;
  viewModel: Pick<TaskTimerScheduleViewModel, "scheduled">;
}) {
  const firstScheduledOnPresentDay =
    options.presentDay != null ? options.viewModel.scheduled.find((entry) => entry.day === options.presentDay) ?? null : null;
  if (firstScheduledOnPresentDay) {
    return {
      day: firstScheduledOnPresentDay.day,
      startMinutes: firstScheduledOnPresentDay.startMinutes,
    };
  }

  const firstScheduledEntry = getFirstScheduledEntry(options.viewModel);
  if (firstScheduledEntry) {
    return {
      day: firstScheduledEntry.day,
      startMinutes: firstScheduledEntry.startMinutes,
    };
  }

  return {
    day: options.presentDay,
    startMinutes: null,
  };
}

export function resolveScheduleOpenScrollTargetMinutes(options: {
  presentDay: TaskTimerScheduleState["selectedDay"] | null;
  viewModel: Pick<TaskTimerScheduleViewModel, "scheduled">;
  optimalProductivityStartTime: string;
  optimalProductivityEndTime: string;
}) {
  const focus = resolveScheduleOpenFocus({
    presentDay: options.presentDay,
    viewModel: options.viewModel,
  });
  if (focus.startMinutes != null) return focus.startMinutes;

  const period = normalizeOptimalProductivityPeriod({
    optimalProductivityStartTime: options.optimalProductivityStartTime,
    optimalProductivityEndTime: options.optimalProductivityEndTime,
  });
  return timeOfDayToMinutes(period.startTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME);
}

function alignScheduleEntryToScrollTop(options: {
  scroller: HTMLElement;
  scheduleGrid: HTMLElement | null;
  presentDay: TaskTimerScheduleState["selectedDay"];
}) {
  if (!options.scheduleGrid || !options.presentDay || typeof options.scheduleGrid.querySelector !== "function") return false;
  const firstEntry = options.scheduleGrid.querySelector<HTMLElement>(
    `.scheduleTaskCard[data-schedule-task-day="${options.presentDay}"]`
  );
  if (!firstEntry) return false;

  const plannerHead = options.scheduleGrid.querySelector<HTMLElement>(".schedulePlannerHead");
  const headHeight = plannerHead?.offsetHeight ?? 0;
  const nextScrollTop =
    resolveScheduleEntryScrollTargetTop(options) ??
    Math.max(0, Number(firstEntry.offsetTop || 0) - headHeight);
  options.scroller.scrollTop = Math.max(0, nextScrollTop);
  return true;
}

function resolveScheduleEntryScrollTargetTop(options: {
  scroller: HTMLElement;
  scheduleGrid: HTMLElement | null;
  presentDay: TaskTimerScheduleState["selectedDay"];
}) {
  if (!options.scheduleGrid || !options.presentDay || typeof options.scheduleGrid.querySelector !== "function") return null;
  const firstEntry = options.scheduleGrid.querySelector<HTMLElement>(
    `.scheduleTaskCard[data-schedule-task-day="${options.presentDay}"]`
  );
  if (!firstEntry) return null;
  const plannerHead = options.scheduleGrid.querySelector<HTMLElement>(".schedulePlannerHead");
  const headHeight = plannerHead?.offsetHeight ?? 0;
  if (
    typeof options.scroller.getBoundingClientRect !== "function" ||
    typeof firstEntry.getBoundingClientRect !== "function"
  ) {
    return Math.max(0, Number(firstEntry.offsetTop || 0) - headHeight);
  }
  const scrollerRect = options.scroller.getBoundingClientRect();
  const entryRect = firstEntry.getBoundingClientRect();
  return Math.max(0, options.scroller.scrollTop + (entryRect.top - scrollerRect.top) - headHeight);
}

function isScheduleScrollNearTarget(scroller: HTMLElement, targetScrollTop: number) {
  return Math.abs(scroller.scrollTop - Math.max(0, targetScrollTop)) <= 2;
}

function attemptScheduleOpenScroll(options: {
  scroller: HTMLElement;
  scheduleGrid: HTMLElement | null;
  presentDay: TaskTimerScheduleState["selectedDay"];
  targetMinutes: number;
}) {
  const targetScrollTop =
    resolveScheduleEntryScrollTargetTop({
      scroller: options.scroller,
      scheduleGrid: options.scheduleGrid,
      presentDay: options.presentDay,
    }) ?? Math.max(0, options.targetMinutes * SCHEDULE_MINUTE_PX);
  const aligned = alignScheduleEntryToScrollTop({
    scroller: options.scroller,
    scheduleGrid: options.scheduleGrid,
    presentDay: options.presentDay,
  });
  if (!aligned) {
    options.scroller.scrollTop = targetScrollTop;
  }
  return isScheduleScrollNearTarget(options.scroller, targetScrollTop);
}

export function createTaskTimerRuntimeCoordinator(options: CreateTaskTimerRuntimeCoordinatorOptions) {
  let pendingScheduleEntryScroll = false;
  let pendingScheduleEntryScrollMode: "open" | "firstScheduled" = "open";
  let scheduleOpenFocusLock:
    | {
        day: TaskTimerScheduleState["selectedDay"];
        targetMinutes: number;
        expiresAtMs: number;
        lastAppliedScrollTop: number | null;
      }
    | null = null;
  let scheduleOpenFocusAttemptSeq = 0;

  function nowMs() {
    return Date.now();
  }

  function clearScheduleOpenFocusLock() {
    scheduleOpenFocusLock = null;
    scheduleOpenFocusAttemptSeq += 1;
  }

  function setScheduleOpenFocusLock(day: TaskTimerScheduleState["selectedDay"], targetMinutes: number) {
    scheduleOpenFocusLock = {
      day,
      targetMinutes,
      expiresAtMs: nowMs() + 3000,
      lastAppliedScrollTop: null,
    };
    scheduleOpenFocusAttemptSeq += 1;
  }

  function scheduleOpenFocusLockActive() {
    return !!scheduleOpenFocusLock && scheduleOpenFocusLock.expiresAtMs > nowMs();
  }

  function runScheduleOpenFocusAttempts() {
    if (!scheduleOpenFocusLockActive()) {
      clearScheduleOpenFocusLock();
      return;
    }
    const lock = scheduleOpenFocusLock;
    if (!lock) return;
    const attemptSeq = scheduleOpenFocusAttemptSeq;
    const delayMsList = [0, 32, 120, 260, 520, 900, 1400, 2200];
    const globalTimeout = typeof globalThis.setTimeout === "function" ? globalThis.setTimeout.bind(globalThis) : null;
    const scheduleTimeout =
      typeof options.windowRef.setTimeout === "function" ? options.windowRef.setTimeout.bind(options.windowRef) : globalTimeout;
    if (!scheduleTimeout) return;
    for (const delayMs of delayMsList) {
      scheduleTimeout(() => {
        if (attemptSeq !== scheduleOpenFocusAttemptSeq) return;
        if (!scheduleOpenFocusLockActive()) {
          clearScheduleOpenFocusLock();
          return;
        }
        const scroller = options.els.scheduleGridScroller;
        if (!scroller) return;
        const resolvedScroller = resolveScheduleScrollContainer(scroller, options.els.scheduleGrid);
        if (!resolvedScroller) return;
        if (
          lock.lastAppliedScrollTop != null &&
          Math.abs(resolvedScroller.scrollTop - lock.lastAppliedScrollTop) > 4 &&
          !isScheduleScrollNearTarget(resolvedScroller, lock.lastAppliedScrollTop)
        ) {
          clearScheduleOpenFocusLock();
          return;
        }
        const targetReached = attemptScheduleOpenScroll({
          scroller: resolvedScroller,
          scheduleGrid: options.els.scheduleGrid,
          presentDay: lock.day,
          targetMinutes: lock.targetMinutes,
        });
        lock.lastAppliedScrollTop = resolvedScroller.scrollTop;
        if (targetReached) {
          clearScheduleOpenFocusLock();
        }
      }, delayMs);
    }
  }

  function requestScheduleEntryScroll(mode: "open" | "firstScheduled" = "open") {
    pendingScheduleEntryScroll = true;
    pendingScheduleEntryScrollMode = mode;
    clearScheduleOpenFocusLock();
  }

  function renderSchedulePage() {
    const scheduleRuntime = options.scheduleRuntime as Parameters<typeof renderTaskTimerSchedulePage>[0]["scheduleRuntime"];
    const shouldResolveOpenFocus = pendingScheduleEntryScroll || scheduleOpenFocusLockActive();
    const presentDay =
      shouldResolveOpenFocus && pendingScheduleEntryScrollMode === "open" ? getPresentScheduleDay() : null;
    const viewModel = shouldResolveOpenFocus ? scheduleRuntime.buildViewModel() : null;
    const hasScheduledEntries = !!viewModel?.scheduled?.length;
    const focus = shouldResolveOpenFocus
      ? resolveScheduleOpenFocus({
          presentDay,
          viewModel: viewModel ?? { scheduled: [] },
        })
      : null;
    if (focus?.day) {
      options.scheduleState.set("selectedDay", focus.day);
    }
    renderTaskTimerSchedulePage({
      els: options.els,
      state: options.scheduleState,
      scheduleRuntime,
      escapeHtmlUI: options.escapeHtmlUI,
      getWeekStarting: options.getWeekStarting,
      getOptimalProductivityStartTime: options.getOptimalProductivityStartTime,
      getOptimalProductivityEndTime: options.getOptimalProductivityEndTime,
    });
    const resolvedScroller = resolveScheduleScrollContainer(options.els.scheduleGridScroller, options.els.scheduleGrid);
    if (!(pendingScheduleEntryScroll || scheduleOpenFocusLockActive()) || !resolvedScroller) return;
    if (!hasScheduledEntries || focus?.startMinutes == null) return;
    setScheduleOpenFocusLock(focus.day, focus.startMinutes);
    pendingScheduleEntryScroll = false;
    const targetMinutes = resolveScheduleOpenScrollTargetMinutes({
      presentDay: focus?.day ?? presentDay,
      viewModel: viewModel ?? { scheduled: [] },
      optimalProductivityStartTime: options.getOptimalProductivityStartTime(),
      optimalProductivityEndTime: options.getOptimalProductivityEndTime(),
    });
    let attemptsRemaining = 12;
    const runScrollAttempt = () => {
      options.windowRef.requestAnimationFrame(() => {
        const didReachTarget = attemptScheduleOpenScroll({
          scroller: resolvedScroller,
          scheduleGrid: options.els.scheduleGrid,
          presentDay: focus?.day ?? presentDay,
          targetMinutes,
        });
        if (scheduleOpenFocusLock) {
          scheduleOpenFocusLock.lastAppliedScrollTop = resolvedScroller.scrollTop;
        }
        if (didReachTarget || attemptsRemaining <= 0) {
          return;
        }
        attemptsRemaining -= 1;
        runScrollAttempt();
      });
    };
    runScrollAttempt();
    runScheduleOpenFocusAttempts();
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

  function closeUnpinnedOpenHistoryCharts() {
    options.getHistoryInlineApi()?.closeUnpinnedOpenHistoryCharts();
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
    subscribeToCheckpointAlertMuteSignals,
    resetAllOpenHistoryChartSelections,
    closeUnpinnedOpenHistoryCharts,
    renderHistory,
    getTileColumnCount: () => getTaskTimerTileColumnCount(options.windowRef),
    isArchitectUser: () =>
      isTaskTimerArchitectUser({
        getCurrentEmail: options.getCurrentEmail,
        architectEmail: options.architectEmail,
      }),
  };
}
