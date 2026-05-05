import type { RewardSessionSegment } from "../lib/rewards";
import { awardCompletedSessionXp } from "../lib/rewards";
import { computeMomentumSnapshot } from "../lib/momentum";
import { localDayKey } from "../lib/history";
import { nowMs } from "../lib/time";
import type { HistoryEntry, LiveTaskSession, Task } from "../lib/types";
import { normalizeCompletionDifficulty, type CompletionDifficulty } from "../lib/completionDifficulty";
import type { TaskTimerRewardsHistoryContext } from "./context";

type RewardSessionTracker = {
  taskId: string;
  untrackedMs: number;
  segments: RewardSessionSegment[];
  activeSegmentStartMs: number | null;
  activeMultiplier: number | null;
};

export function createTaskTimerRewardsHistory(ctx: TaskTimerRewardsHistoryContext) {
  const lastLiveSessionSyncAtByTaskId: Record<string, number> = {};
  const LIVE_SESSION_SYNC_INTERVAL_MS = 15_000;

  function rewardSessionTrackerStorageKey() {
    const uid = ctx.currentUid();
    return uid ? `${ctx.rewardSessionTrackersStorageKey}:${uid}` : ctx.rewardSessionTrackersStorageKey;
  }

  function normalizeRewardSessionTracker(rawTaskId: string, input: unknown): RewardSessionTracker | null {
    if (!input || typeof input !== "object") return null;
    const obj = input as Record<string, unknown>;
    const taskId = String(obj.taskId || rawTaskId || "").trim();
    if (!taskId) return null;
    const untrackedMs = Math.max(0, Math.floor(Number(obj.untrackedMs || 0) || 0));
    const activeSegmentStartMsRaw = Number(obj.activeSegmentStartMs || 0);
    const activeSegmentStartMs =
      Number.isFinite(activeSegmentStartMsRaw) && activeSegmentStartMsRaw > 0 ? Math.floor(activeSegmentStartMsRaw) : null;
    const activeMultiplierRaw = Number(obj.activeMultiplier || 0);
    const activeMultiplier = Number.isFinite(activeMultiplierRaw) && activeMultiplierRaw > 0 ? activeMultiplierRaw : null;
    const segments = Array.isArray(obj.segments)
      ? obj.segments
          .map((segment) => {
            if (!segment || typeof segment !== "object") return null;
            const seg = segment as Record<string, unknown>;
            const startMs = Math.max(0, Math.floor(Number(seg.startMs || 0) || 0));
            const endMs = Math.max(startMs, Math.floor(Number(seg.endMs || 0) || 0));
            const multiplier = Number.isFinite(Number(seg.multiplier)) ? Math.max(0, Number(seg.multiplier)) : 1;
            if (!(endMs > startMs)) return null;
            return { startMs, endMs, multiplier: multiplier > 0 ? multiplier : 1 };
          })
          .filter((segment): segment is RewardSessionSegment => !!segment)
      : [];
    return {
      taskId,
      untrackedMs,
      segments,
      activeSegmentStartMs,
      activeMultiplier,
    };
  }

  function loadRewardSessionTrackersFromStorage() {
    if (typeof window === "undefined") return {} as Record<string, RewardSessionTracker>;
    try {
      const raw = window.localStorage.getItem(rewardSessionTrackerStorageKey());
      if (!raw) return {} as Record<string, RewardSessionTracker>;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return {} as Record<string, RewardSessionTracker>;
      const next: Record<string, RewardSessionTracker> = {};
      Object.keys(parsed).forEach((taskId) => {
        const normalized = normalizeRewardSessionTracker(taskId, parsed[taskId]);
        if (normalized) next[normalized.taskId] = normalized;
      });
      return next;
    } catch {
      return {} as Record<string, RewardSessionTracker>;
    }
  }

  function persistRewardSessionTrackers() {
    if (typeof window === "undefined") return;
    try {
      const key = rewardSessionTrackerStorageKey();
      const trackersByTaskId = ctx.getRewardSessionTrackersByTaskId();
      const trackerIds = Object.keys(trackersByTaskId).filter(Boolean);
      if (!trackerIds.length) {
        window.localStorage.removeItem(key);
        return;
      }
      const payload: Record<string, RewardSessionTracker> = {};
      trackerIds.forEach((taskId) => {
        payload[taskId] = trackersByTaskId[taskId]!;
      });
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore localStorage failures
    }
  }

  function getMomentumMultiplierNow(nowValue = nowMs()) {
    if (!ctx.hasEntitlement("advancedInsights")) return 1;
    try {
      return computeMomentumSnapshot({
        tasks: ctx.getTasks(),
        historyByTaskId: ctx.getHistoryByTaskId(),
        weekStarting: ctx.getWeekStarting(),
        nowValue,
      }).multiplier;
    } catch {
      return 1;
    }
  }

  function getOrCreateRewardSessionTracker(task: Task | null | undefined) {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return null;
    const trackersByTaskId = ctx.getRewardSessionTrackersByTaskId();
    let tracker = trackersByTaskId[taskId] || null;
    if (!tracker) {
      tracker = {
        taskId,
        untrackedMs: 0,
        segments: [],
        activeSegmentStartMs: null,
        activeMultiplier: null,
      };
      trackersByTaskId[taskId] = tracker;
      ctx.setRewardSessionTrackersByTaskId(trackersByTaskId);
    }
    return tracker;
  }

  function openRewardSessionSegment(task: Task | null | undefined, startMsRaw?: number | null) {
    const tracker = getOrCreateRewardSessionTracker(task);
    if (!tracker) return;
    const startMs = Math.max(0, Math.floor(Number(startMsRaw ?? nowMs()) || 0));
    if (tracker.activeSegmentStartMs != null) return;
    tracker.activeSegmentStartMs = startMs;
    tracker.activeMultiplier = getMomentumMultiplierNow(startMs);
    persistRewardSessionTrackers();
  }

  function closeRewardSessionSegment(task: Task | null | undefined, endMsRaw?: number | null) {
    const tracker = getOrCreateRewardSessionTracker(task);
    if (!tracker || tracker.activeSegmentStartMs == null) return;
    const endMs = Math.max(tracker.activeSegmentStartMs, Math.floor(Number(endMsRaw ?? nowMs()) || 0));
    if (endMs > tracker.activeSegmentStartMs) {
      tracker.segments.push({
        startMs: tracker.activeSegmentStartMs,
        endMs,
        multiplier: tracker.activeMultiplier && tracker.activeMultiplier > 0 ? tracker.activeMultiplier : 1,
      });
    }
    tracker.activeSegmentStartMs = null;
    tracker.activeMultiplier = null;
    persistRewardSessionTrackers();
  }

  function syncRewardSessionTrackerForRunningTask(task: Task | null | undefined, nowValue = nowMs()) {
    const tracker = getOrCreateRewardSessionTracker(task);
    if (!tracker || !task?.running) return;
    if (tracker.activeSegmentStartMs == null) {
      openRewardSessionSegment(task, nowValue);
      return;
    }
    const nextMultiplier = getMomentumMultiplierNow(nowValue);
    if ((tracker.activeMultiplier || 1) === nextMultiplier) return;
    closeRewardSessionSegment(task, nowValue);
    openRewardSessionSegment(task, nowValue);
  }

  function clearRewardSessionTracker(taskIdRaw: string | null | undefined) {
    const taskId = String(taskIdRaw || "").trim();
    const trackersByTaskId = ctx.getRewardSessionTrackersByTaskId();
    if (!taskId || !trackersByTaskId[taskId]) return;
    delete trackersByTaskId[taskId];
    ctx.setRewardSessionTrackersByTaskId(trackersByTaskId);
    persistRewardSessionTrackers();
  }

  function getRewardSessionSegmentsForTask(task: Task | null | undefined, completedAtMs: number, elapsedMs: number): RewardSessionSegment[] {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return [];
    const tracker = getOrCreateRewardSessionTracker(task);
    if (!tracker) return [];
    if (task?.running && tracker.activeSegmentStartMs != null) {
      closeRewardSessionSegment(task, completedAtMs);
    }
    const closedSegments = tracker.segments
      .map((segment) => ({
        startMs: Math.max(0, Math.floor(Number(segment.startMs || 0) || 0)),
        endMs: Math.max(0, Math.floor(Number(segment.endMs || 0) || 0)),
        multiplier: Number.isFinite(Number(segment.multiplier)) ? Math.max(0, Number(segment.multiplier)) : 1,
      }))
      .filter((segment) => segment.endMs > segment.startMs)
      .sort((a, b) => a.startMs - b.startMs);
    const trackedMs = closedSegments.reduce((sum, segment) => sum + Math.max(0, segment.endMs - segment.startMs), 0);
    const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    const inferredUntrackedMs = Math.max(0, safeElapsedMs - trackedMs);
    const segments: RewardSessionSegment[] = [];
    if (inferredUntrackedMs > 0) {
      segments.push({
        startMs: Math.max(0, completedAtMs - safeElapsedMs),
        endMs: Math.max(0, completedAtMs - safeElapsedMs + inferredUntrackedMs),
        multiplier: 1,
      });
    }
    closedSegments.forEach((segment) => segments.push(segment));
    return segments.sort((a, b) => a.startMs - b.startMs);
  }

  function bootstrapRewardSessionTrackers() {
    const nextTrackers = loadRewardSessionTrackersFromStorage();
    ctx.setRewardSessionTrackersByTaskId(nextTrackers);
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId || !task?.hasStarted) return;
      const tracker = getOrCreateRewardSessionTracker(task);
      if (!tracker) return;
      if (task.running) {
        tracker.untrackedMs = Math.max(tracker.untrackedMs, Math.max(0, ctx.getTaskElapsedMs(task)));
        tracker.activeSegmentStartMs = nowMs();
        tracker.activeMultiplier = getMomentumMultiplierNow();
      } else {
        tracker.untrackedMs = Math.max(tracker.untrackedMs, Math.max(0, Number(task.accumulatedMs || 0) || 0));
      }
    });
    persistRewardSessionTrackers();
  }

  function downloadCsvFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function csvEscape(value: unknown): string {
    const text = String(value ?? "");
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function parseCsvRows(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let i = 0;
    let inQuotes = false;

    while (i < input.length) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(cell);
        cell = "";
        i += 1;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
        if (ch === "\r" && input[i + 1] === "\n") i += 2;
        else i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function addRangeMsToLocalDayMap(dayMap: Map<string, number>, startMs: number, endMs: number) {
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

  function canLogSession(task: Task) {
    if (!task.hasStarted) return false;
    return ctx.getTaskElapsedMs(task) > 0;
  }

  function escapeHtmlUI(str: unknown) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function appendHistory(taskId: string, entry: Record<string, unknown>) {
    if (!taskId) return;
    const historyByTaskId = ctx.getHistoryByTaskId();
    const completionDifficulty = normalizeCompletionDifficulty(entry?.completionDifficulty);
    const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId.trim() : "";
    const normalizedEntry: HistoryEntry = {
      ts: Number.isFinite(Number(entry?.ts)) ? Math.floor(Number(entry.ts)) : nowMs(),
      name: String(entry?.name || ""),
      ms: Number.isFinite(Number(entry?.ms)) ? Math.max(0, Math.floor(Number(entry.ms))) : 0,
      ...(entry?.color != null && String(entry.color).trim() ? { color: String(entry.color).trim() } : {}),
      ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
      ...(completionDifficulty ? { completionDifficulty } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
    if (!Array.isArray(historyByTaskId[taskId])) historyByTaskId[taskId] = [];
    if (normalizedEntry.sessionId && historyByTaskId[taskId]!.some((row) => row?.sessionId === normalizedEntry.sessionId)) {
      return;
    }
    historyByTaskId[taskId].push(normalizedEntry);
    ctx.appendHistoryEntry(taskId, normalizedEntry);
    ctx.saveHistoryLocally(historyByTaskId);
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
  }

  function getCurrentSessionNoteForTask(taskId: string): string {
    const taskKey = String(taskId || "");
    if (!taskKey) return "";
    return ctx.captureSessionNoteSnapshot(taskKey);
  }

  function buildLiveSession(task: Task, elapsedMsOverride?: number | null, noteOverride?: string): LiveTaskSession | null {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return null;
    const elapsedMs =
      elapsedMsOverride != null && Number.isFinite(Number(elapsedMsOverride))
        ? Math.max(0, Math.floor(Number(elapsedMsOverride) || 0))
        : Math.max(0, ctx.getTaskElapsedMs(task));
    const startedAtMs =
      Number.isFinite(Number(task.startMs || 0)) && Number(task.startMs || 0) > 0
        ? Math.floor(Number(task.startMs || 0))
        : Math.max(0, nowMs() - elapsedMs);
    const existing = ctx.getLiveSessionsByTaskId()[taskId];
    const note = String(noteOverride || getCurrentSessionNoteForTask(taskId) || "").trim();
    return {
      sessionId: String(existing?.sessionId || `${taskId}:${startedAtMs}`),
      taskId,
      name: String(task.name || "").trim() || "Task",
      startedAtMs,
      elapsedMs,
      updatedAtMs: nowMs(),
      status: "running",
      color: ctx.sessionColorForTaskMs(task, elapsedMs),
      ...(note ? { note } : {}),
    };
  }

  function upsertLiveSession(task: Task, opts?: { elapsedMs?: number; note?: string }) {
    const session = buildLiveSession(task, opts?.elapsedMs, opts?.note);
    if (!session) return;
    ctx.setLiveSessionsByTaskId({
      ...(ctx.getLiveSessionsByTaskId() || {}),
      [session.taskId]: session,
    });
    ctx.saveLiveSession(session);
  }

  function syncLiveSessionForTask(task: Task | null | undefined, nowValue = nowMs()) {
    if (!task?.running) return;
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    const lastSyncAt = Math.max(0, Math.floor(Number(lastLiveSessionSyncAtByTaskId[taskId] || 0) || 0));
    if (lastSyncAt > 0 && nowValue - lastSyncAt < LIVE_SESSION_SYNC_INTERVAL_MS) return;
    upsertLiveSession(task, { elapsedMs: ctx.getTaskElapsedMs(task) });
    lastLiveSessionSyncAtByTaskId[taskId] = nowValue;
  }

  function appendCompletedSessionHistory(
    task: Task,
    completedAtMs: number,
    elapsedMs: number,
    noteOverride?: string,
    completionDifficultyRaw?: CompletionDifficulty
  ) {
    const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs || 0) || 0));
    if (!task || !task.id || safeElapsedMs <= 0) return;
    const taskId = String(task.id || "");
    const liveSession = ctx.getLiveSessionsByTaskId()[taskId];
    const sessionId = typeof liveSession?.sessionId === "string" ? liveSession.sessionId.trim() : "";
    const liveNote = getCurrentSessionNoteForTask(taskId);
    const note = String(noteOverride || liveNote || "").trim();
    const completionDifficulty = normalizeCompletionDifficulty(completionDifficultyRaw);
    if (note) ctx.setFocusSessionDraft(taskId, note);
    appendHistory(task.id, {
      ts: completedAtMs,
      name: task.name,
      ms: safeElapsedMs,
      color: ctx.sessionColorForTaskMs(task, safeElapsedMs),
      ...(note ? { note } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(completionDifficulty ? { completionDifficulty } : {}),
    });
    ctx.clearFocusSessionDraft(taskId);
    if (String(ctx.getFocusModeTaskId() || "") === taskId) {
      ctx.syncFocusSessionNotesInput(taskId);
      ctx.syncFocusSessionNotesAccordion(taskId);
    }
    const nextAward = awardCompletedSessionXp(ctx.getRewardProgress(), {
      taskId,
      awardedAt: completedAtMs,
      elapsedMs: safeElapsedMs,
      historyByTaskId: ctx.getHistoryByTaskId(),
      tasks: ctx.getTasks(),
      weekStarting: ctx.getWeekStarting(),
      momentumEntitled: ctx.hasEntitlement("advancedInsights"),
      sessionSegments: getRewardSessionSegmentsForTask(task, completedAtMs, safeElapsedMs),
    });
    ctx.setRewardProgress(nextAward.next);
    clearRewardSessionTracker(taskId);
    const nextPrefs = {
      ...(ctx.getCloudPreferencesCache() || ctx.buildDefaultCloudPreferences()),
      rewards: nextAward.next,
    };
    ctx.setCloudPreferencesCache(nextPrefs);
    ctx.saveCloudPreferences(nextPrefs);
    const authUid = ctx.currentUid();
    if (authUid) {
      void ctx.syncOwnFriendshipProfile(authUid, { currentRankId: nextAward.next.currentRankId }).catch(() => {});
    }
  }

  function finalizeLiveSession(
    task: Task,
    opts?: { elapsedMs?: number; note?: string; completionDifficulty?: CompletionDifficulty }
  ) {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return 0;
    const liveSession = ctx.getLiveSessionsByTaskId()[taskId];
    const elapsedMs = Math.max(
      0,
      Math.floor(Number(opts?.elapsedMs ?? liveSession?.elapsedMs ?? ctx.getTaskElapsedMs(task)) || 0)
    );
    if (elapsedMs > 0) {
      appendCompletedSessionHistory(task, nowMs(), elapsedMs, opts?.note ?? liveSession?.note, opts?.completionDifficulty);
    }
    clearRewardSessionTracker(taskId);
    const next = { ...(ctx.getLiveSessionsByTaskId() || {}) };
    delete next[taskId];
    ctx.setLiveSessionsByTaskId(next);
    ctx.clearLiveSession(taskId);
    return elapsedMs;
  }

  return {
    rewardSessionTrackerStorageKey,
    normalizeRewardSessionTracker,
    loadRewardSessionTrackersFromStorage,
    persistRewardSessionTrackers,
    getMomentumMultiplierNow,
    getOrCreateRewardSessionTracker,
    openRewardSessionSegment,
    closeRewardSessionSegment,
    syncRewardSessionTrackerForRunningTask,
    clearRewardSessionTracker,
    getRewardSessionSegmentsForTask,
    bootstrapRewardSessionTrackers,
    downloadCsvFile,
    csvEscape,
    parseCsvRows,
    addRangeMsToLocalDayMap,
    canLogSession,
    escapeHtmlUI,
    appendHistory,
    upsertLiveSession,
    syncLiveSessionForTask,
    getCurrentSessionNoteForTask,
    appendCompletedSessionHistory,
    finalizeLiveSession,
  };
}
