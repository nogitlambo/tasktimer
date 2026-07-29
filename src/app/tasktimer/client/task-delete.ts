import { buildTaskStatusMeta, type DeletedTaskMeta, type Task } from "../lib/types";
import { nowMs } from "../lib/time";
import { buildDeleteTaskConfirmOptions } from "./confirm-actions";
import type { TaskTimerConfirmOptions } from "./context";
import { playDeleteAlertAudio } from "./delete-alert-audio";

const ARCHIVE_TASK_CONFIRM_TEXT =
  "Archiving a task removes it from your active tasks while preserving history. You can restore or permanently delete an archived task and associated history from History Manager. [under Settings > Data]";
const ARCHIVE_TASK_CONFIRM_TEXT_HTML =
  'Archiving a task removes it from your active tasks while preserving history. You can restore or permanently delete an archived task and associated history from <a href="/history-manager">History Manager</a>.<br><span class="confirmTextNote">[under Settings &gt; Data]</span>';

type CreateTaskDeleteOptions = {
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getHistoryByTaskId: () => Record<string, unknown[]>;
  setHistoryByTaskId: (value: Record<string, unknown[]>) => void;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  getConfirmOverlay: () => HTMLElement | null;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  saveHistory: (history: Record<string, unknown[]>, opts?: { allowDestructiveReplace?: boolean }) => void;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  deleteSharedTaskSummariesForTask: (ownerUid: string, taskId: string) => Promise<unknown>;
  refreshOwnSharedSummaries: () => Promise<unknown>;
  getCurrentUid: () => string | null;
  getFocusModeTaskId: () => string | null;
  closeFocusMode: () => void;
  showActionConfirmation: (message: string, durationMs?: number) => void;
  render: () => void;
};

export function createTaskTimerTaskDelete(options: CreateTaskDeleteOptions) {
  return function deleteTask(index: number) {
    const tasks = options.getTasks();
    const task = tasks[index];
    if (!task) return;
    const taskId = String(task.id || "");
    const historyByTaskId = options.getHistoryByTaskId();
    const hasTaskHistory = !!(taskId && Array.isArray(historyByTaskId?.[taskId]) && historyByTaskId[taskId].length > 0);

    const clearDeleteTaskConfirmState = () => {
      options.getConfirmOverlay()?.classList.remove("isDeleteTaskConfirm");
    };

    const archiveTask = () => {
      clearDeleteTaskConfirmState();
      const shouldCloseFocusMode = String(options.getFocusModeTaskId() || "").trim() === taskId;
      const nextTasks = tasks.filter((_, taskIndex) => taskIndex !== index);
      const nextDeletedTaskMeta = {
        ...(options.getDeletedTaskMeta() || {}),
        [taskId]: buildTaskStatusMeta(task, "archived", nowMs()),
      };
      options.setTasks(nextTasks);
      options.setDeletedTaskMeta(nextDeletedTaskMeta);
      options.saveDeletedMeta(nextDeletedTaskMeta);
      options.save({ deletedTaskIds: taskId ? [taskId] : [] });
      void options.deleteSharedTaskSummariesForTask(String(options.getCurrentUid() || ""), taskId).catch(() => {});
      void options.refreshOwnSharedSummaries().catch(() => {});
      if (shouldCloseFocusMode) options.closeFocusMode();
      options.render();
      options.closeConfirm();
      options.showActionConfirmation("Task archived.");
    };

    if (hasTaskHistory) {
      if (task.running) return;
      options.confirm(
        "Archive Task",
        ARCHIVE_TASK_CONFIRM_TEXT,
        {
          okLabel: "Archive",
          cancelLabel: "Cancel",
          overlayClassName: "isArchiveTaskConfirm",
          textHtml: ARCHIVE_TASK_CONFIRM_TEXT_HTML,
          onOk: archiveTask,
          onCancel: () => options.closeConfirm(),
        }
      );
      return;
    }

    const confirmConfig = buildDeleteTaskConfirmOptions({
      taskName: task.name || "this task",
      onDelete: () => {
        clearDeleteTaskConfirmState();
        const nextHistoryByTaskId = options.getHistoryByTaskId();
        const deletedTaskMeta = options.getDeletedTaskMeta();
        const hasNonEmptyHistory = !!(taskId && Array.isArray(nextHistoryByTaskId?.[taskId]) && nextHistoryByTaskId[taskId].length > 0);
        const hasDeletedTaskMeta = !!(taskId && deletedTaskMeta && deletedTaskMeta[taskId]);
        if (hasNonEmptyHistory) {
          options.closeConfirm();
          return;
        }

        const nextTasks = tasks.filter((_, taskIndex) => taskIndex !== index);
        options.setTasks(nextTasks);

        if (taskId && nextHistoryByTaskId && taskId in nextHistoryByTaskId) {
          delete nextHistoryByTaskId[taskId];
          options.saveHistory(nextHistoryByTaskId, { allowDestructiveReplace: true });
        }

        if (hasDeletedTaskMeta) {
          delete deletedTaskMeta[taskId];
          options.saveDeletedMeta(deletedTaskMeta);
        }

        options.save({ deletedTaskIds: taskId ? [taskId] : [] });
        void options.deleteSharedTaskSummariesForTask(String(options.getCurrentUid() || ""), taskId).catch(() => {});
        void options.refreshOwnSharedSummaries().catch(() => {});
        options.render();
        options.closeConfirm();
        options.showActionConfirmation("Task deleted.");
      },
      onCancel: () => {
        clearDeleteTaskConfirmState();
        options.closeConfirm();
      },
    });

    options.confirm(confirmConfig.title, confirmConfig.text, confirmConfig.options);
    options.getConfirmOverlay()?.classList.add("isDeleteTaskConfirm");
    playDeleteAlertAudio();
  };
}
