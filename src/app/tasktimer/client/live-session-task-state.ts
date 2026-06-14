import type { LiveSessionsByTaskId, Task } from "../lib/types";
import { isTaskTimeGoalStartLockedToday, markTaskTimeGoalCompleted } from "../lib/timeGoalCompletion";

export type ClosedAppDailyTimeGoalCompletion = {
  taskId: string;
  completedAtMs: number;
  elapsedMs: number;
};

export type ApplyLiveSessionsToTasksResult = {
  tasks: Task[];
  closedAppDailyTimeGoalCompletions: ClosedAppDailyTimeGoalCompletion[];
};

function safeTimestamp(value: unknown, fallback = 0): number {
  const normalized = Math.floor(Number(value || 0) || 0);
  return normalized > 0 ? normalized : fallback;
}

function getDailyTimeGoalMs(task: Task | null | undefined): number {
  if (!(task?.timeGoalEnabled && task.timeGoalPeriod === "day")) return 0;
  const goalMinutes = Number(task.timeGoalMinutes || 0);
  return goalMinutes > 0 ? Math.max(0, Math.round(goalMinutes * 60_000)) : 0;
}

export function getClosedAppDailyTimeGoalCompletion(
  task: Task | null | undefined,
  liveSession: LiveSessionsByTaskId[string] | null | undefined,
  nowValueRaw: unknown
): ClosedAppDailyTimeGoalCompletion | null {
  const taskId = String(task?.id || "").trim();
  if (!task || !taskId || !liveSession || String(liveSession.taskId || "").trim() !== taskId) return null;
  if (liveSession.status && liveSession.status !== "running") return null;
  const goalMs = getDailyTimeGoalMs(task);
  if (!(goalMs > 0)) return null;

  const startedAtMs = safeTimestamp(liveSession.startedAtMs);
  if (!(startedAtMs > 0)) return null;
  if (isTaskTimeGoalStartLockedToday(task, startedAtMs)) return null;

  const nowValue = Math.max(0, Math.floor(Number(nowValueRaw || 0) || 0));
  const updatedAtMs = safeTimestamp(liveSession.updatedAtMs, startedAtMs || nowValue);
  const elapsedMs = Math.max(0, Math.floor(Number(liveSession.elapsedMs || 0) || 0));
  const observedElapsedMs = elapsedMs + Math.max(0, nowValue - updatedAtMs);
  if (observedElapsedMs < goalMs) return null;

  return {
    taskId,
    completedAtMs: startedAtMs,
    elapsedMs: goalMs,
  };
}

export function applyLiveSessionsToTasksWithCompletions(
  tasks: Task[],
  liveSessionsByTaskId: LiveSessionsByTaskId,
  nowMs: () => number
): ApplyLiveSessionsToTasksResult {
  if (!Array.isArray(tasks) || !tasks.length) return { tasks, closedAppDailyTimeGoalCompletions: [] };
  const liveSessions = liveSessionsByTaskId || {};
  if (!Object.keys(liveSessions).length) return { tasks, closedAppDailyTimeGoalCompletions: [] };
  const nowValue = Math.max(0, Math.floor(Number(nowMs()) || 0));
  const closedAppDailyTimeGoalCompletions: ClosedAppDailyTimeGoalCompletion[] = [];

  const nextTasks = tasks.map((task) => {
    const taskId = String(task?.id || "").trim();
    const liveSession = taskId ? liveSessions[taskId] : null;
    if (!task || !liveSession || String(liveSession.taskId || "").trim() !== taskId) return task;
    if (liveSession.status && liveSession.status !== "running") return task;

    const completion = getClosedAppDailyTimeGoalCompletion(task, liveSession, nowValue);
    if (completion) {
      closedAppDailyTimeGoalCompletions.push(completion);
      const completedTask: Task = {
        ...task,
        accumulatedMs: completion.elapsedMs,
        running: false,
        startMs: null,
        hasStarted: true,
        resumePendingSinceDayKey: null,
      };
      markTaskTimeGoalCompleted(completedTask, completion.completedAtMs, {
        reason: "goal",
        elapsedMs: completion.elapsedMs,
      });
      return completedTask;
    }

    if (isTaskTimeGoalStartLockedToday(task, nowValue)) return task;

    const updatedAtMs = Math.max(
      0,
      Math.floor(Number(liveSession.updatedAtMs || liveSession.startedAtMs || nowValue) || nowValue)
    );
    const elapsedMs = Math.max(0, Math.floor(Number(liveSession.elapsedMs || 0) || 0));

    return {
      ...task,
      accumulatedMs: elapsedMs,
      running: true,
      startMs: updatedAtMs,
      hasStarted: true,
    };
  });

  return {
    tasks: nextTasks,
    closedAppDailyTimeGoalCompletions,
  };
}

export function applyLiveSessionsToTasks(
  tasks: Task[],
  liveSessionsByTaskId: LiveSessionsByTaskId,
  nowMs: () => number
): Task[] {
  return applyLiveSessionsToTasksWithCompletions(tasks, liveSessionsByTaskId, nowMs).tasks;
}
