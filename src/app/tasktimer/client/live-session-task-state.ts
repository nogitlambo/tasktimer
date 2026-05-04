import type { LiveSessionsByTaskId, Task } from "../lib/types";

export function applyLiveSessionsToTasks(
  tasks: Task[],
  liveSessionsByTaskId: LiveSessionsByTaskId,
  nowMs: () => number
): Task[] {
  if (!Array.isArray(tasks) || !tasks.length) return tasks;
  const liveSessions = liveSessionsByTaskId || {};
  if (!Object.keys(liveSessions).length) return tasks;
  const nowValue = Math.max(0, Math.floor(Number(nowMs()) || 0));

  return tasks.map((task) => {
    const taskId = String(task?.id || "").trim();
    const liveSession = taskId ? liveSessions[taskId] : null;
    if (!task || !liveSession || String(liveSession.taskId || "").trim() !== taskId) return task;

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
}
