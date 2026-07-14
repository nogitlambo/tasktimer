export type PendingTimeGoalCompletion = {
  taskId: string;
  periodKey: string;
  completedAtMs: number;
  elapsedMs: number;
};

function normalizeEntry(input: unknown): PendingTimeGoalCompletion | null {
  if (!input || typeof input !== "object") return null;
  const entry = input as Record<string, unknown>;
  const taskId = String(entry.taskId || "").trim();
  const periodKey = String(entry.periodKey || "").trim();
  const completedAtMs = Math.max(0, Math.floor(Number(entry.completedAtMs || 0) || 0));
  const elapsedMs = Math.max(0, Math.floor(Number(entry.elapsedMs || 0) || 0));
  if (!taskId || !periodKey || completedAtMs <= 0 || elapsedMs <= 0) return null;
  return { taskId, periodKey, completedAtMs, elapsedMs };
}

function readRawQueue(storageKey: string | null | undefined): PendingTimeGoalCompletion[] {
  if (typeof window === "undefined" || !storageKey) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((entry): entry is PendingTimeGoalCompletion => !!entry);
  } catch {
    return [];
  }
}

function writeRawQueue(storageKey: string | null | undefined, queue: PendingTimeGoalCompletion[]) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    if (queue.length) window.localStorage.setItem(storageKey, JSON.stringify(queue));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // ignore localStorage failures
  }
}

export function loadPendingTimeGoalCompletions(storageKey: string | null | undefined): PendingTimeGoalCompletion[] {
  return readRawQueue(storageKey);
}

export function enqueuePendingTimeGoalCompletion(storageKey: string | null | undefined, input: PendingTimeGoalCompletion): PendingTimeGoalCompletion[] {
  const nextEntry = normalizeEntry(input);
  if (!nextEntry) return readRawQueue(storageKey);
  const queue = readRawQueue(storageKey);
  const withoutDuplicate = queue.filter(
    (entry) => !(entry.taskId === nextEntry.taskId && entry.periodKey === nextEntry.periodKey)
  );
  const nextQueue = [...withoutDuplicate, nextEntry].slice(-20);
  writeRawQueue(storageKey, nextQueue);
  return nextQueue;
}

export function removePendingTimeGoalCompletion(
  storageKey: string | null | undefined,
  taskIdRaw: unknown,
  periodKeyRaw: unknown
): PendingTimeGoalCompletion[] {
  const taskId = String(taskIdRaw || "").trim();
  const periodKey = String(periodKeyRaw || "").trim();
  if (!taskId || !periodKey) return readRawQueue(storageKey);
  const nextQueue = readRawQueue(storageKey).filter(
    (entry) => !(entry.taskId === taskId && entry.periodKey === periodKey)
  );
  writeRawQueue(storageKey, nextQueue);
  return nextQueue;
}
