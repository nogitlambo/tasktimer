import type { Task } from "../lib/types";
import type { MainMode } from "./types";
import { escapeTaskTimerHtml } from "./runtime-coordinator";

type CreateTaskTimerRuntimeFacadeOptions = {
  getSessionApi: () =>
    | {
        getElapsedMs: (task: Task) => number;
        getTaskElapsedMs: (task: Task) => number;
      }
    | null;
  runtimeCoordinator: {
    renderSchedulePage: () => void;
    render: () => void;
    resetAllOpenHistoryChartSelections: () => void;
    renderHistory: (taskId: string) => void;
    subscribeToCheckpointAlertMuteSignals: (unsubscribeRef: { current: (() => void) | null }) => void;
  };
  getCurrentUid: () => string | null;
  getOwnSharedSummaries: () => Array<{ ownerUid: string; taskId: string }>;
  applyMainMode: (mode: MainMode) => void;
};

export function createTaskTimerRuntimeFacade(options: CreateTaskTimerRuntimeFacadeOptions) {
  return {
    escapeHtmlUI: (value: unknown) => escapeTaskTimerHtml(value),
    getElapsedMs: (task: Task) => options.getSessionApi()?.getElapsedMs(task) ?? 0,
    getTaskElapsedMs: (task: Task) => options.getSessionApi()?.getTaskElapsedMs(task) ?? 0,
    renderSchedulePage: () => options.runtimeCoordinator.renderSchedulePage(),
    render: () => options.runtimeCoordinator.render(),
    resetAllOpenHistoryChartSelections: () =>
      options.runtimeCoordinator.resetAllOpenHistoryChartSelections(),
    renderHistory: (taskId: string) => options.runtimeCoordinator.renderHistory(taskId),
    subscribeToCheckpointAlertMuteSignals: (unsubscribeRef: { current: (() => void) | null }) =>
      options.runtimeCoordinator.subscribeToCheckpointAlertMuteSignals(unsubscribeRef),
    isTaskSharedByOwner: (taskId: string) => {
      const uid = options.getCurrentUid();
      if (!uid || !taskId) return false;
      return options
        .getOwnSharedSummaries()
        .some((row) => row.ownerUid === uid && row.taskId === taskId);
    },
    applyMainMode: (mode: MainMode) => options.applyMainMode(mode),
  };
}
