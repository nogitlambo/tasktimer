import type { HistoryByTaskId, LiveSessionsByTaskId, ProjectedHistoryByTaskId, ProjectedHistoryEntry } from "../lib/types";

function buildLiveHistoryEntry(taskId: string, session: LiveSessionsByTaskId[string]): ProjectedHistoryEntry | null {
  if (!session || String(session.taskId || "").trim() !== String(taskId || "").trim()) return null;
  const ts = Math.max(0, Math.floor(Number(session.updatedAtMs || session.startedAtMs || 0) || 0));
  const ms = Math.max(0, Math.floor(Number(session.elapsedMs || 0) || 0));
  if (ts <= 0) return null;
  return {
    ts,
    ms,
    name: String(session.name || "").trim() || "Task",
    ...(session.color ? { color: session.color } : {}),
    ...(session.note ? { note: session.note } : {}),
    isLiveSession: true,
    liveSessionId: String(session.sessionId || "").trim() || undefined,
    liveSessionStatus: "running",
  };
}

export function projectHistoryWithLiveSessions(
  historyByTaskId: HistoryByTaskId,
  liveSessionsByTaskId: LiveSessionsByTaskId
): ProjectedHistoryByTaskId {
  const projected: ProjectedHistoryByTaskId = {};
  const taskIds = new Set<string>([
    ...Object.keys(historyByTaskId || {}).filter(Boolean),
    ...Object.keys(liveSessionsByTaskId || {}).filter(Boolean),
  ]);
  taskIds.forEach((taskId) => {
    const finalized = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId].slice() : [];
    const liveEntry = buildLiveHistoryEntry(taskId, liveSessionsByTaskId?.[taskId]);
    const entries = liveEntry ? finalized.concat(liveEntry) : finalized;
    if (entries.length) projected[taskId] = entries;
  });
  return projected;
}

export function isProjectedLiveHistoryEntry(entry: unknown): entry is ProjectedHistoryEntry {
  return !!entry && typeof entry === "object" && !!(entry as ProjectedHistoryEntry).isLiveSession;
}
