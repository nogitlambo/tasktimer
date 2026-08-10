export const TASK_COMPLETION_CHANGED_EVENT = "tasklaunch:task-completion-changed";

export type TaskCompletionChangedDetail = {
  taskId: string;
};

export function dispatchTaskCompletionChangedEvent(taskIdRaw: unknown, windowRef?: Window | null) {
  const taskId = String(taskIdRaw || "").trim();
  const targetWindow = windowRef || (typeof window !== "undefined" ? window : null);
  if (!taskId || !targetWindow) return;
  targetWindow.dispatchEvent(new CustomEvent<TaskCompletionChangedDetail>(TASK_COMPLETION_CHANGED_EVENT, { detail: { taskId } }));
}
