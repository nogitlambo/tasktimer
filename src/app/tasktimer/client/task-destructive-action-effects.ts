import type { DeletedTaskMeta, Task } from "../lib/types";
import { isTaskTimeGoalCompletedToday, markTaskTimeGoalResetCompleted } from "../lib/timeGoalCompletion";
import { awardCompletedSessionXp } from "../lib/rewards";
import { captureXpAwardRectSnapshot, dispatchPendingXpAwardEvent } from "./xp-award-events";

type ConfirmOptions = {
  okLabel: string;
  cancelLabel?: string;
  textHtml?: string;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  dangerInputLabel?: string;
  dangerInputMatch?: string;
  dangerInputPlaceholder?: string;
  onOk: () => void | Promise<void>;
  onCancel?: () => void;
};

type TaskDestructiveActionEffectsOptions = {
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  getHistoryByTaskId: () => Record<string, unknown[]>;
  getRewardProgress: () => ReturnType<typeof awardCompletedSessionXp>["previous"];
  getWeekStarting: () => Parameters<typeof awardCompletedSessionXp>[1]["weekStarting"];
  getTaskElapsedMs: (task: Task) => number;
  setHistoryByTaskId: (history: Record<string, unknown[]>) => void;
  setDeletedTaskMeta: (meta: DeletedTaskMeta) => void;
  currentUid: () => string | null;
  getFocusModeTaskId: () => string | null;
  confirm: (title: string, text: string, opts: ConfirmOptions) => void;
  closeConfirm: () => void;
  getConfirmDeleteAllChecked: () => boolean;
  addConfirmOverlayClass: (className: string) => void;
  removeConfirmOverlayClass: (className: string) => void;
  setResetTaskConfirmBusy: (busy: boolean, success: boolean) => void;
  captureResetActionSessionNote: (taskId: string) => string;
  setFocusSessionDraft: (taskId: string, note: string) => void;
  resetTaskStateImmediate: (task: Task, opts?: { logHistory?: boolean; sessionNote?: string }) => void;
  save: (opts?: { deletedTaskIds?: string[] }) => void;
  saveHistory: (history: Record<string, unknown[]>, opts?: { allowDestructiveReplace?: boolean }) => void;
  saveDeletedMeta: (meta: DeletedTaskMeta) => void;
  render: () => void;
  renderDashboardWidgets: () => void;
  closeFocusMode: () => void;
  deleteSharedTaskSummariesForTask: (uid: string, taskId: string) => Promise<unknown>;
  refreshOwnSharedSummaries: () => Promise<unknown>;
  syncSharedTaskSummariesForTasks: (taskIds: string[]) => Promise<unknown>;
};

const RESET_TASK_CONFIRM_CLASS = "isResetTaskConfirm";
const RESET_ALL_DELETE_CONFIRM_CLASS = "isResetAllDeleteConfirm";

export function createTaskDestructiveActionEffects(options: TaskDestructiveActionEffectsOptions) {
  function getResetAwardPreview(task: Task) {
    const elapsedMs = Math.max(0, Math.floor(Number(options.getTaskElapsedMs(task)) || 0));
    const award = awardCompletedSessionXp(options.getRewardProgress(), {
      taskId: String(task.id || "").trim() || null,
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: options.getHistoryByTaskId() as Parameters<typeof awardCompletedSessionXp>[1]["historyByTaskId"],
      tasks: options.getTasks(),
      weekStarting: options.getWeekStarting(),
      momentumEntitled: true,
    });
    return {
      fromXp: award.previous.totalXp,
      toXp: award.next.totalXp,
      awardedXp: Math.max(0, Math.floor(Number(award.amount || 0) || 0)),
    };
  }

  function clearResetTaskConfirmState() {
    options.setResetTaskConfirmBusy(false, false);
    options.removeConfirmOverlayClass(RESET_TASK_CONFIRM_CLASS);
  }

  function resetTask(index: number) {
    const task = options.getTasks()[index];
    if (!task || task.running) return;
    if (isTaskTimeGoalCompletedToday(task)) return;
    if (Math.max(0, Math.floor(Number(options.getTaskElapsedMs(task)) || 0)) <= 0) return;
    const taskId = String(task.id || "");
    const rewardPreview = getResetAwardPreview(task);
    const shouldExitFocusModeAfterReset = String(options.getFocusModeTaskId() || "").trim() === taskId.trim();

    const resetConfirmText =
      rewardPreview.awardedXp > 0
        ? `Reset this task? You will still bank <span class="confirmAwardText" id="confirmResetTaskAwardText">+${rewardPreview.awardedXp}</span> XP for your logged time.`
        : "Reset this task? You will still bank 0 XP for your logged time.";

    options.confirm("Reset Task", "Reset this task?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      textHtml: resetConfirmText,
      onOk: async () => {
        options.setResetTaskConfirmBusy(true, false);
        const sessionNote = options.captureResetActionSessionNote(taskId);
        if (sessionNote) options.setFocusSessionDraft(taskId, sessionNote);
        try {
          if (rewardPreview.awardedXp > 0 && typeof window !== "undefined") {
            dispatchPendingXpAwardEvent(window, {
              ...rewardPreview,
              sourceModal: "resetConfirm",
              sourceTaskId: taskId || null,
              sourceOverlayId: "confirmOverlay",
              sourceElementKey: "confirmResetTaskAwardText",
              sourceRect: captureXpAwardRectSnapshot(document.getElementById("confirmResetTaskAwardText")),
            });
          }
          const resetElapsedMs = Math.max(0, Math.floor(Number(options.getTaskElapsedMs(task)) || 0));
          markTaskTimeGoalResetCompleted(task, Date.now(), resetElapsedMs);
          options.resetTaskStateImmediate(task, { logHistory: true, sessionNote });
          options.save();
          options.closeConfirm();
          if (shouldExitFocusModeAfterReset) options.closeFocusMode();
          else options.render();
        } finally {
          clearResetTaskConfirmState();
        }
      },
      onCancel: () => {
        clearResetTaskConfirmState();
        options.closeConfirm();
      },
    });

    options.setResetTaskConfirmBusy(false, false);
    options.addConfirmOverlayClass(RESET_TASK_CONFIRM_CLASS);
  }

  function showDeleteComplete(message: string) {
    options.confirm("Delete Complete", message, {
      okLabel: "Close",
      cancelLabel: "Done",
      onOk: () => options.closeConfirm(),
      onCancel: () => options.closeConfirm(),
    });
  }

  function renderAfterReset() {
    options.render();
    options.renderDashboardWidgets();
  }

  function resetAll() {
    const tasks = options.getTasks();
    options.confirm(
      "Delete Data",
      "This will permanently delete all task history and tasks (if selected below) from your account.",
      {
        okLabel: "Delete",
        checkboxLabel: "Also Delete All Tasks",
        checkboxChecked: false,
        dangerInputLabel: "",
        dangerInputMatch: "DELETE",
        dangerInputPlaceholder: "Enter 'DELETE' to proceed.",
        onOk: () => {
          const alsoDelete = options.getConfirmDeleteAllChecked();
          const affectedTaskIds = tasks.map((row) => String(row.id || "")).filter(Boolean);
          const uid = String(options.currentUid() || "");
          const historyByTaskId = options.getHistoryByTaskId();
          const deletedHistoryEntryCount = Object.values(historyByTaskId || {}).reduce(
            (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
            0
          );
          const deletedTaskCount = alsoDelete ? tasks.length : 0;
          const nextHistory = {} as Record<string, unknown[]>;
          const nextDeletedTaskMeta = {} as DeletedTaskMeta;
          options.setHistoryByTaskId(nextHistory);
          options.saveHistory(nextHistory, { allowDestructiveReplace: true });
          options.setDeletedTaskMeta(nextDeletedTaskMeta);
          options.saveDeletedMeta(nextDeletedTaskMeta);

          if (alsoDelete) {
            options.setTasks([]);
            options.save({ deletedTaskIds: affectedTaskIds });
            if (uid && affectedTaskIds.length) {
              void Promise.all(affectedTaskIds.map((taskId) => options.deleteSharedTaskSummariesForTask(uid, taskId).catch(() => {})))
                .then(() => options.refreshOwnSharedSummaries())
                .catch(() => {});
            }
            renderAfterReset();
            options.closeConfirm();
            showDeleteComplete(
              `${deletedTaskCount} task${deletedTaskCount === 1 ? "" : "s"} and ${deletedHistoryEntryCount} history entr${
                deletedHistoryEntryCount === 1 ? "y" : "ies"
              } deleted.`
            );
            return;
          }

          options.save();
          if (affectedTaskIds.length) void options.syncSharedTaskSummariesForTasks(affectedTaskIds).catch(() => {});
          renderAfterReset();
          options.closeConfirm();
          showDeleteComplete(`${deletedHistoryEntryCount} history entr${deletedHistoryEntryCount === 1 ? "y" : "ies"} deleted.`);
        },
      }
    );
    options.addConfirmOverlayClass(RESET_ALL_DELETE_CONFIRM_CLASS);
  }

  return {
    resetTask,
    resetAll,
  };
}
