import type { Task } from "../lib/types";
import type { CompletionDifficulty } from "../lib/completionDifficulty";
import type { createTaskTimerRewardsHistory } from "./rewards-history";

type RewardHistoryApi = ReturnType<typeof createTaskTimerRewardsHistory>;

type CreateTaskTimerRewardSessionBridgeOptions = {
  getRewardsHistoryApi: () => RewardHistoryApi | null;
  getTaskElapsedMs: (task: Task) => number;
};

export function addRangeMsToLocalDayMap(dayMap: Map<string, number>, startMs: number, endMs: number, localDayKey: (value: number) => string) {
  const safeStart = Math.max(0, Math.floor(Number(startMs) || 0));
  const safeEnd = Math.max(0, Math.floor(Number(endMs) || 0));
  if (!(safeEnd > safeStart)) return;

  let cursor = safeStart;
  while (cursor < safeEnd) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);
    const nextDayStartMs = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    const sliceEnd = Math.min(safeEnd, nextDayStartMs);
    const sliceMs = Math.max(0, sliceEnd - cursor);
    if (sliceMs > 0) {
      const key = localDayKey(cursor);
      dayMap.set(key, (dayMap.get(key) || 0) + sliceMs);
    }
    cursor = sliceEnd;
  }
}

export function canLogRewardSession(task: Task, getTaskElapsedMs: (task: Task) => number) {
  if (!task.hasStarted) return false;
  return getTaskElapsedMs(task) > 0;
}

export function createTaskTimerRewardSessionBridge(options: CreateTaskTimerRewardSessionBridgeOptions) {
  return {
    openRewardSessionSegment(task: Task | null | undefined, startMsRaw?: number | null) {
      options.getRewardsHistoryApi()?.openRewardSessionSegment(task, startMsRaw);
    },
    closeRewardSessionSegment(task: Task | null | undefined, endMsRaw?: number | null) {
      options.getRewardsHistoryApi()?.closeRewardSessionSegment(task, endMsRaw);
    },
    clearRewardSessionTracker(taskIdRaw: string | null | undefined) {
      options.getRewardsHistoryApi()?.clearRewardSessionTracker(taskIdRaw);
    },
    appendCompletedSessionHistory(
      task: Task,
      completedAtMs: number,
      elapsedMs: number,
      noteOverride?: string,
      completionDifficulty?: CompletionDifficulty
    ) {
      options.getRewardsHistoryApi()?.appendCompletedSessionHistory(task, completedAtMs, elapsedMs, noteOverride, completionDifficulty);
    },
    csvEscape(value: unknown) {
      return options.getRewardsHistoryApi()?.csvEscape(value) ?? String(value ?? "");
    },
    parseCsvRows(input: string) {
      return options.getRewardsHistoryApi()?.parseCsvRows(input) ?? [];
    },
    downloadCsvFile(filename: string, text: string) {
      options.getRewardsHistoryApi()?.downloadCsvFile(filename, text);
    },
    bootstrapRewardSessionTrackers() {
      options.getRewardsHistoryApi()?.bootstrapRewardSessionTrackers();
    },
    canLogSession(task: Task) {
      return canLogRewardSession(task, options.getTaskElapsedMs);
    },
  };
}
