import type { DeletedTaskMeta, Task } from "../lib/types";
import { nowMs } from "../lib/time";
import { buildDeleteTaskConfirmOptions } from "./confirm-actions";
import type { TaskTimerConfirmOptions } from "./context";

type CreateTaskDeleteOptions = {
  getTasks: () => Task[];
  getHistoryByTaskId: () => Record<string, unknown[]>;
  setHistoryByTaskId: (value: Record<string, unknown[]>) => void;
  getDeletedTaskMeta: () => DeletedTaskMeta;
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  getConfirmOverlay: () => HTMLElement | null;
  getConfirmDeleteAllChecked: () => boolean;
  confirm: (title: string, text: string, opts: TaskTimerConfirmOptions) => void;
  closeConfirm: () => void;
  saveHistory: (history: Record<string, unknown[]>, opts?: { allowDestructiveReplace?: boolean }) => void;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  deleteSharedTaskSummariesForTask: (ownerUid: string, taskId: string) => Promise<unknown>;
  refreshOwnSharedSummaries: () => Promise<unknown>;
  getCurrentUid: () => string | null;
  render: () => void;
};

export function createTaskTimerTaskDelete(options: CreateTaskDeleteOptions) {
  return function deleteTask(index: number) {
    const tasks = options.getTasks();
    const task = tasks[index];
    if (!task) return;

    const clearDeleteTaskConfirmState = () => {
      options.getConfirmOverlay()?.classList.remove("isDeleteTaskConfirm");
    };

    const confirmConfig = buildDeleteTaskConfirmOptions({
      taskName: task.name || "this task",
      onDelete: () => {
        clearDeleteTaskConfirmState();
        const deleteHistory = options.getConfirmDeleteAllChecked();
        const taskId = String(task.id || "");
        const historyByTaskId = options.getHistoryByTaskId();
        const deletedTaskMeta = options.getDeletedTaskMeta();
        const hasTaskHistory = !!(taskId && Array.isArray(historyByTaskId?.[taskId]) && historyByTaskId[taskId].length > 0);
        const hasDeletedTaskMeta = !!(taskId && deletedTaskMeta && deletedTaskMeta[taskId]);

        tasks.splice(index, 1);

        if (deleteHistory) {
          if (taskId && historyByTaskId && taskId in historyByTaskId) delete historyByTaskId[taskId];
          if (hasTaskHistory) options.saveHistory(historyByTaskId, { allowDestructiveReplace: true });

          if (hasDeletedTaskMeta) {
            delete deletedTaskMeta[taskId];
            options.saveDeletedMeta(deletedTaskMeta);
          }
        } else {
          const nextDeletedTaskMeta = deletedTaskMeta || ({} as DeletedTaskMeta);
          nextDeletedTaskMeta[taskId] = { name: task.name, color: task.color || null, deletedAt: nowMs() };
          options.setDeletedTaskMeta(nextDeletedTaskMeta);
          options.saveDeletedMeta(nextDeletedTaskMeta);
        }

        options.save({ deletedTaskIds: taskId ? [taskId] : [] });
        void options.deleteSharedTaskSummariesForTask(String(options.getCurrentUid() || ""), taskId).catch(() => {});
        void options.refreshOwnSharedSummaries().catch(() => {});
        options.render();
        options.closeConfirm();
      },
      onCancel: () => {
        clearDeleteTaskConfirmState();
        options.closeConfirm();
      },
    });

    options.confirm(confirmConfig.title, confirmConfig.text, confirmConfig.options);
    options.getConfirmOverlay()?.classList.add("isDeleteTaskConfirm");
  };
}
