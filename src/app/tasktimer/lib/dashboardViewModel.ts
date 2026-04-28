import type { DeletedTaskMeta, HistoryByTaskId, Task } from "./types";

type DashboardRenderSummaryInput = {
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  dynamicColorsEnabled: boolean;
  onboardingPreviewActive: boolean;
  currentDayKey: string;
  nowMs: number;
};

type DashboardRenderSummary = {
  taskCount: number;
  runningTaskCount: number;
  historyTaskCount: number;
  deletedTaskCount: number;
  currentDayKey: string;
  dynamicColorsEnabled: boolean;
  onboardingPreviewActive: boolean;
  fullSignature: string;
  liveSignature: string;
};

export function buildDashboardRenderSummary(input: DashboardRenderSummaryInput): DashboardRenderSummary {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const historyKeys = Object.keys(input.historyByTaskId || {}).sort();
  const deletedKeys = Object.keys(input.deletedTaskMeta || {}).sort();
  const runningTaskIds = tasks
    .filter((task) => !!task?.running)
    .map((task) => String(task.id || "").trim())
    .filter(Boolean)
    .sort();
  const taskIds = tasks
    .map((task) => String(task?.id || "").trim())
    .filter(Boolean)
    .sort();
  const taskTotals = tasks
    .map((task) => `${String(task?.id || "").trim()}:${Math.max(0, Number(task?.accumulatedMs || 0))}:${task?.running ? 1 : 0}`)
    .sort();
  const runningTaskLiveTotals = tasks
    .filter((task) => !!task?.running)
    .map((task) => {
      const taskId = String(task?.id || "").trim();
      const accumulatedMs = Math.max(0, Number(task?.accumulatedMs || 0));
      const startMs = Number(task?.startMs || 0);
      const liveElapsedMs =
        startMs > 0 ? accumulatedMs + Math.max(0, input.nowMs - startMs) : accumulatedMs;
      return `${taskId}:${Math.floor(liveElapsedMs / 1000)}`;
    })
    .filter(Boolean)
    .sort();

  const fullSignature = JSON.stringify({
    taskIds,
    taskTotals,
    historyKeys,
    deletedKeys,
    currentDayKey: input.currentDayKey,
    dynamicColorsEnabled: !!input.dynamicColorsEnabled,
    onboardingPreviewActive: !!input.onboardingPreviewActive,
  });

  const liveSignature = JSON.stringify({
    runningTaskIds,
    runningTaskLiveTotals,
    currentDayKey: input.currentDayKey,
    onboardingPreviewActive: !!input.onboardingPreviewActive,
  });

  return {
    taskCount: taskIds.length,
    runningTaskCount: runningTaskIds.length,
    historyTaskCount: historyKeys.length,
    deletedTaskCount: deletedKeys.length,
    currentDayKey: input.currentDayKey,
    dynamicColorsEnabled: !!input.dynamicColorsEnabled,
    onboardingPreviewActive: !!input.onboardingPreviewActive,
    fullSignature,
    liveSignature,
  };
}
