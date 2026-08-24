import type { Task } from "./types";

function normalizePositiveMs(value: unknown): number | null {
  if (!Number.isFinite(Number(value))) return null;
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
}

export function getNextLocalMidnightMs(nowMs = Date.now()): number {
  const nextMidnight = new Date(nowMs);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime();
}

export function getNextMidnightMsForTimezone(timezone: string, nowMs = Date.now()): number {
  let safeTimezone = String(timezone || "UTC").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone }).format(nowMs);
  } catch {
    safeTimezone = "UTC";
  }
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const currentParts = Object.fromEntries(dateFormatter.formatToParts(nowMs).map((part) => [part.type, part.value]));
  const currentDateMs = Date.UTC(Number(currentParts.year), Number(currentParts.month) - 1, Number(currentParts.day));
  const nextDate = new Date(currentDateMs + 86_400_000);
  const targetLocalMs = Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth(), nextDate.getUTCDate());
  const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidateMs = targetLocalMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(dateTimeFormatter.formatToParts(candidateMs).map((part) => [part.type, part.value]));
    const representedLocalMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const differenceMs = representedLocalMs - targetLocalMs;
    if (differenceMs === 0) break;
    candidateMs -= differenceMs;
  }
  return candidateMs;
}

export function isTaskMarkedDone(task: Task | null | undefined, nowMs = Date.now()): boolean {
  if (!normalizePositiveMs(task?.markedDoneAtMs)) return false;
  if (task?.taskType === "once-off") return true;
  const markedDoneUntilMs = normalizePositiveMs(task?.markedDoneUntilMs);
  return markedDoneUntilMs != null && markedDoneUntilMs > nowMs;
}

export function isCompletedOnceOffTask(task: Task | null | undefined): boolean {
  return task?.taskType === "once-off" && normalizePositiveMs(task.markedDoneAtMs) != null;
}

export function markTaskDone(task: Task, nowMs = Date.now()): void {
  task.markedDoneAtMs = Math.max(1, Math.floor(nowMs));
  task.markedDoneUntilMs = task.taskType === "once-off" ? null : getNextLocalMidnightMs(nowMs);
  task.nextBestActionSnoozedUntilMs = null;
}

export function clearTaskMarkedDone(task: Task): void {
  task.markedDoneAtMs = null;
  task.markedDoneUntilMs = null;
}

export function snoozeTaskForToday(task: Task, nowMs = Date.now()): number {
  const snoozedUntilMs = getNextLocalMidnightMs(nowMs);
  task.nextBestActionSnoozedUntilMs = snoozedUntilMs;
  return snoozedUntilMs;
}

export function isTaskSnoozedForNextBestAction(task: Task | null | undefined, nowMs = Date.now()): boolean {
  const snoozedUntilMs = normalizePositiveMs(task?.nextBestActionSnoozedUntilMs);
  return snoozedUntilMs != null && snoozedUntilMs > nowMs;
}
