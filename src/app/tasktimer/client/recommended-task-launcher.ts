import type { Task } from "../lib/types";
import type { TaskLaunchResult, TaskStartOptions } from "./task-timer-lifecycle";

type RecommendedTaskLauncherOptions = {
  getTasks: () => Task[];
  jumpToTaskById: (taskId: string) => void;
  startTask: (taskIndex: number, options?: TaskStartOptions) => TaskLaunchResult;
};

export function launchRecommendedTaskById(
  taskId: string,
  options: RecommendedTaskLauncherOptions,
): TaskLaunchResult {
  const normalizedTaskId = String(taskId || "").trim();
  const taskIndex = options
    .getTasks()
    .findIndex((task) => String(task.id || "").trim() === normalizedTaskId);
  if (taskIndex < 0) return "not-found";

  return options.startTask(taskIndex, {
    // Do not navigate until the single-running-task guard has actually allowed
    // the launch. In particular, cancelling the switch confirmation must leave
    // the current timer and surface untouched.
    onStarted: () => options.jumpToTaskById(normalizedTaskId),
  });
}
