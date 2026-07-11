import type { Task } from "./types";
import type { NativeCheckpointAlarm } from "./nativeTimerNotification";

function milestoneUnitSeconds(task: Task) {
  if (task.milestoneTimeUnit === "day") return 86400;
  if (task.milestoneTimeUnit === "minute") return 60;
  return 3600;
}

function checkpointLabel(targetSeconds: number) {
  if (targetSeconds % 3600 === 0) return `${targetSeconds / 3600}h checkpoint`;
  if (targetSeconds % 60 === 0) return `${targetSeconds / 60}m checkpoint`;
  return `${targetSeconds}s checkpoint`;
}

export function buildNativeCheckpointSchedule(input: {
  tasks: Task[];
  soundEnabled: boolean;
  soundMode: "once" | "repeat";
  nowMs?: number;
}): NativeCheckpointAlarm[] {
  if (!input.soundEnabled) return [];
  const nowMs = Math.max(0, Math.floor(Number(input.nowMs ?? Date.now()) || 0));
  const alarms: NativeCheckpointAlarm[] = [];
  input.tasks.forEach((task) => {
    const taskId = String(task?.id || "").trim();
    const startMs = Math.max(0, Math.floor(Number(task?.startMs || 0) || 0));
    const accumulatedMs = Math.max(0, Math.floor(Number(task?.accumulatedMs || 0) || 0));
    if (!taskId || !task.running || !startMs || !task.milestonesEnabled || !task.checkpointSoundEnabled) return;
    const unitSeconds = milestoneUnitSeconds(task);
    const goalSeconds = task.timeGoalEnabled && Number(task.timeGoalMinutes) > 0
      ? Math.round(Number(task.timeGoalMinutes) * 60)
      : Number.POSITIVE_INFINITY;
    (Array.isArray(task.milestones) ? task.milestones : []).forEach((milestone) => {
      if (milestone?.alertsEnabled === false) return;
      const targetSeconds = Math.max(0, Math.round(Number(milestone?.hours || 0) * unitSeconds));
      if (!targetSeconds || targetSeconds >= goalSeconds) return;
      const remainingMsAtStart = targetSeconds * 1000 - accumulatedMs;
      const triggerAtMs = startMs + remainingMsAtStart;
      if (triggerAtMs <= nowMs) return;
      alarms.push({
        taskId,
        taskName: String(task.name || "Task").trim() || "Task",
        checkpointKey: `${targetSeconds}`,
        checkpointLabel: checkpointLabel(targetSeconds),
        triggerAtMs,
        soundMode: input.soundMode === "repeat" ? "repeat" : "once",
      });
    });
  });
  return alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs || a.checkpointKey.localeCompare(b.checkpointKey));
}
