import type { Task } from "../lib/types";
import { dispatchTaskCardAction } from "./task-card-view-model";

type TaskCardActionEffectsOptions = {
  getTasks: () => Task[];
  canUseAdvancedHistory: () => boolean;
  canUseSocialFeatures: () => boolean;
  showUpgradePrompt: (featureName: string, plan?: "pro") => void;
  startTask: (index: number) => void;
  stopTask: (index: number) => void;
  resetTask: (index: number) => void;
  archiveTask: (index: number) => void;
  deleteTask: (index: number) => void;
  openEdit: (index: number, sourceEl?: HTMLElement | null) => void;
  openHistory: (index: number) => void;
  openFocusMode: (index: number) => void;
  toggleCollapse: (index: number) => void;
  openTaskExportModal: (index: number) => void;
  openManualEntry: (taskId: string) => boolean;
  openShareTaskModal: (index: number) => void;
  confirm: (title: string, text: string, opts: { okLabel: string; cancelLabel: string; onOk: () => void }) => void;
  currentUid: () => string | null;
  closeConfirm: () => void;
  deleteSharedTaskSummariesForTask: (uid: string, taskId: string) => Promise<void>;
  refreshOwnSharedSummaries: () => Promise<void>;
  getCurrentAppPage: () => string;
  refreshGroupsData: () => Promise<void>;
  render: () => void;
  broadcastCheckpointAlertMute: (taskId: string) => void;
  stopCheckpointRepeatAlert: () => void;
  setTimeoutRef: (handler: () => void, timeout: number) => unknown;
};

type HandleTaskCardActionOptions = {
  action: string;
  taskIndex: number;
  taskId: string;
  sourceElement?: HTMLElement | null;
};

export function createTaskCardActionEffects(options: TaskCardActionEffectsOptions) {
  function confirmUnshareTask(taskIndex: number) {
    const task = options.getTasks()[taskIndex];
    if (!task) return;
    options.confirm("Unshare Task", "Unshare this task from all friends?", {
      okLabel: "Unshare",
      cancelLabel: "Cancel",
      onOk: () => {
        const uid = options.currentUid();
        if (!uid) {
          options.closeConfirm();
          return;
        }
        void options
          .deleteSharedTaskSummariesForTask(uid, String(task.id || ""))
          .then(async () => {
            await options.refreshOwnSharedSummaries();
            if (options.getCurrentAppPage() === "friends") await options.refreshGroupsData();
            options.render();
          })
          .finally(() => options.closeConfirm());
      },
    });
  }

  function handleAction({ action, taskIndex, taskId, sourceElement }: HandleTaskCardActionOptions) {
    return dispatchTaskCardAction({
      action,
      canUseAdvancedHistory: options.canUseAdvancedHistory(),
      canUseSocialFeatures: options.canUseSocialFeatures(),
      showUpgradePrompt: options.showUpgradePrompt,
      handlers: {
        start: () => options.startTask(taskIndex),
        stop: () => options.stopTask(taskIndex),
        reset: () => options.resetTask(taskIndex),
        archive: () => options.archiveTask(taskIndex),
        delete: () => options.deleteTask(taskIndex),
        edit: () => options.openEdit(taskIndex, sourceElement || null),
        history: () => options.openHistory(taskIndex),
        editName: () => options.openFocusMode(taskIndex),
        focus: () => options.openFocusMode(taskIndex),
        collapse: () => options.toggleCollapse(taskIndex),
        exportTask: () => options.openTaskExportModal(taskIndex),
        manualEntry: () => {
          if (!taskId) return;
          options.setTimeoutRef(() => {
            options.openManualEntry(taskId);
          }, 0);
        },
        shareTask: () => options.openShareTaskModal(taskIndex),
        unshareTask: () => confirmUnshareTask(taskIndex),
        muteCheckpointAlert: () => {
          if (taskId) options.broadcastCheckpointAlertMute(taskId);
          options.stopCheckpointRepeatAlert();
        },
      },
    });
  }

  return {
    handleAction,
  };
}
