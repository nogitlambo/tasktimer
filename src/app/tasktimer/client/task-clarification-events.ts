import type { Task } from "../lib/types";

export const TASKTIMER_OPEN_TASK_CLARIFICATION_EVENT = "tasktimer:open-task-clarification";
export const TASKTIMER_START_TASK_BY_ID_EVENT = "tasktimer:start-task-by-id";

export type TaskClarificationOpenDetail = {
  taskId: string;
  title: string;
  taskType?: Task["taskType"];
  dueDate?: string | null;
};

export type TaskClarificationStartTaskDetail = { taskId: string };

export function createTaskClarificationOpenEvent(detail: TaskClarificationOpenDetail): CustomEvent<TaskClarificationOpenDetail> {
  return new CustomEvent(TASKTIMER_OPEN_TASK_CLARIFICATION_EVENT, { detail });
}

export function dispatchTaskClarificationOpenEvent(detail: TaskClarificationOpenDetail): boolean {
  if (typeof window === "undefined") return false;
  return window.dispatchEvent(createTaskClarificationOpenEvent(detail));
}

export function dispatchTaskClarificationStartTaskEvent(detail: TaskClarificationStartTaskDetail): boolean {
  if (typeof window === "undefined") return false;
  return window.dispatchEvent(createTaskClarificationStartTaskEvent(detail));
}

export function createTaskClarificationStartTaskEvent(detail: TaskClarificationStartTaskDetail): CustomEvent<TaskClarificationStartTaskDetail> {
  return new CustomEvent(TASKTIMER_START_TASK_BY_ID_EVENT, { detail });
}
