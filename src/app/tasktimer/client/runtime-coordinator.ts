import type { DeletedTaskMeta, HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
import {
  clearTaskTimerPendingPushAction,
  maybeHandleTaskTimerPendingPushAction,
  subscribeToTaskTimerCheckpointAlertMuteSignals,
} from "./runtime-bridge";
import type { AppPage } from "./types";
import type { TaskTimerElements } from "./elements";
import { getTaskTimerTileColumnCount } from "./task-tile-columns";
import { renderSessionNotesPage } from "./session-notes-render";

type CreateTaskTimerRuntimeCoordinatorOptions = {
  els: TaskTimerElements;
  renderTasksPage: () => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  getLiveSessionsByTaskId: () => LiveSessionsByTaskId;
  getDeletedTaskMeta: () => DeletedTaskMeta;
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
  maybeRestorePendingTimeGoalFlow: (restoreContext?: { source?: "push" | "appRestore"; taskId?: string }) => void;
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

export function createTaskTimerRuntimeCoordinator(options: CreateTaskTimerRuntimeCoordinatorOptions) {
  function render() {
    options.renderTasksPage();
    renderSessionNotesPage({
      listEl: document.getElementById("sessionNotesList") as HTMLElement | null,
      tasks: options.getTasks(),
      historyByTaskId: options.getHistoryByTaskId(),
      liveSessionsByTaskId: options.getLiveSessionsByTaskId(),
      deletedTaskMeta: options.getDeletedTaskMeta(),
    });
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
