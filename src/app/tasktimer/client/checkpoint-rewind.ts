import { localDayKey } from "../lib/history";
import type { HistoryByTaskId, HistoryEntry, Task } from "../lib/types";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getCheckpointTargetSeconds(
  task: Task | null | undefined,
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"],
  milestoneUnitSec: (task: Task) => number
): number[] {
  if (!task || !task.milestonesEnabled || !Array.isArray(task.milestones) || task.milestones.length === 0) return [];
  const unitSec = Math.max(0, Number(milestoneUnitSec(task)) || 0);
  if (!(unitSec > 0)) return [];
  const targets = sortMilestones((task.milestones || []).slice())
    .map((milestone) => Math.max(0, Math.round((Number(milestone?.hours) || 0) * unitSec)))
    .filter((value) => value > 0);
  return Array.from(new Set(targets)).sort((a, b) => a - b);
}

export function getPreviousCheckpointRewindTargetMs(
  task: Task | null | undefined,
  elapsedMs: number,
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"],
  milestoneUnitSec: (task: Task) => number
): number | null {
  const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const targets = getCheckpointTargetSeconds(task, sortMilestones, milestoneUnitSec);
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const targetMs = targets[index]! * 1000;
    if (targetMs < safeElapsedMs) return targetMs;
  }
  return null;
}

export function pruneCheckpointFiredKeysAfterTarget(
  task: Task | null | undefined,
  targetMs: number,
  firedKeysByTaskId: Record<string, Set<string>>,
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"],
  milestoneUnitSec: (task: Task) => number
) {
  const taskId = String(task?.id || "").trim();
  if (!taskId) return;
  const fired = firedKeysByTaskId[taskId];
  if (!fired) return;
  const targetSec = Math.max(0, Math.floor(Number(targetMs) || 0) / 1000);
  const validTargets = new Set(getCheckpointTargetSeconds(task, sortMilestones, milestoneUnitSec).map(String));
  for (const key of Array.from(fired)) {
    const checkpointSec = Math.max(0, Math.floor(Number(key) || 0));
    if (!validTargets.has(String(checkpointSec)) || checkpointSec > targetSec) fired.delete(key);
  }
  if (fired.size === 0) delete firedKeysByTaskId[taskId];
}

export function updateLatestSameDayHistoryElapsed(
  historyByTaskId: HistoryByTaskId,
  task: Task | null | undefined,
  nextElapsedMs: number
): HistoryByTaskId | null {
  const taskId = String(task?.id || "").trim();
  if (!taskId) return null;
  const dayKey = String(task?.resumePendingSinceDayKey || "").trim();
  if (!DAY_KEY_RE.test(dayKey)) return null;
  const entries = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
  if (!entries.length) return null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const ts = Math.max(0, Math.floor(Number(entry?.ts || 0) || 0));
    if (ts > 0 && localDayKey(ts) === dayKey) {
      const safeElapsedMs = Math.max(0, Math.floor(Number(nextElapsedMs) || 0));
      if (Math.max(0, Math.floor(Number(entry?.ms || 0) || 0)) === safeElapsedMs) return null;
      const nextEntries: HistoryEntry[] = entries.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ms: safeElapsedMs } : row
      );
      return {
        ...historyByTaskId,
        [taskId]: nextEntries,
      };
    }
  }
  return null;
}
