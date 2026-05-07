import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REWARD_PROGRESS, MIN_REWARD_ELIGIBLE_SESSION_MS, normalizeRewardProgress } from "../lib/rewards";
import { ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS } from "../lib/storage";
import type { HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import { createTaskTimerRewardsHistory } from "./rewards-history";
import type { TaskTimerRewardsHistoryContext } from "./context";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    ...overrides,
  };
}

function createHarness(overrides: Partial<{ liveSessionsByTaskId: LiveSessionsByTaskId; elapsedMs: number }> = {}) {
  const calls: string[] = [];
  const tasks = [task()];
  let historyByTaskId: HistoryByTaskId = {};
  let liveSessionsByTaskId: LiveSessionsByTaskId = overrides.liveSessionsByTaskId || {};
  let rewardProgress = normalizeRewardProgress(DEFAULT_REWARD_PROGRESS);
  let rewardSessionTrackersByTaskId: ReturnType<TaskTimerRewardsHistoryContext["getRewardSessionTrackersByTaskId"]> = {
    "task-1": {
      taskId: "task-1",
      untrackedMs: 0,
      segments: [],
      activeSegmentStartMs: null,
      activeMultiplier: null,
    },
  };
  let cloudPreferencesCache: UserPreferencesV1 | null = null;
  const elapsedMs = overrides.elapsedMs ?? MIN_REWARD_ELIGIBLE_SESSION_MS;

  const api = createTaskTimerRewardsHistory({
    rewardSessionTrackersStorageKey: "taskticker_tasks_v1:rewardSessionTrackers",
    getTasks: () => tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getLiveSessionsByTaskId: () => liveSessionsByTaskId,
    setLiveSessionsByTaskId: (value) => {
      liveSessionsByTaskId = value;
    },
    getDeletedTaskMeta: () => ({}),
    getWeekStarting: () => "mon",
    getRewardProgress: () => rewardProgress,
    setRewardProgress: (value) => {
      rewardProgress = value;
    },
    getRewardSessionTrackersByTaskId: () => rewardSessionTrackersByTaskId,
    setRewardSessionTrackersByTaskId: (value) => {
      rewardSessionTrackersByTaskId = value;
    },
    getCloudPreferencesCache: () => cloudPreferencesCache,
    setCloudPreferencesCache: (value) => {
      cloudPreferencesCache = value;
    },
    getFocusModeTaskId: () => null,
    getCurrentPlan: () => "free",
    hasEntitlement: () => false,
    currentUid: () => "uid-1",
    getTaskElapsedMs: () => elapsedMs,
    sessionColorForTaskMs: () => "#00CFC8",
    captureSessionNoteSnapshot: () => "",
    setFocusSessionDraft: (taskId, note) => calls.push(`set-focus-draft:${taskId}:${note}`),
    clearFocusSessionDraft: (taskId) => calls.push(`clear-focus-draft:${taskId}`),
    syncFocusSessionNotesInput: (taskId) => calls.push(`sync-focus-input:${taskId}`),
    syncFocusSessionNotesAccordion: (taskId) => calls.push(`sync-focus-accordion:${taskId}`),
    appendHistoryEntry: (taskId, entry) => calls.push(`append-history:${taskId}:${entry.ms}`),
    saveLiveSession: () => calls.push("save-live-session"),
    clearLiveSession: (taskId) => calls.push(`clear-live-session:${taskId}`),
    saveHistoryLocally: (history) => {
      historyByTaskId = history;
      calls.push("save-history");
    },
    buildDefaultCloudPreferences: () =>
      ({
        schemaVersion: 1,
        rewards: normalizeRewardProgress(DEFAULT_REWARD_PROGRESS),
      }) as UserPreferencesV1,
    saveCloudPreferences: (prefs) => {
      cloudPreferencesCache = prefs;
      calls.push(`save-preferences:${prefs.rewards.totalXp}`);
    },
    syncSharedTaskSummariesForTask: vi.fn(async (taskId: string) => {
      calls.push(`sync-shared:${taskId}`);
    }),
    syncOwnFriendshipProfile: vi.fn(async (_uid: string, partial: { currentRankId?: string | null | undefined; totalXp?: number | null | undefined }) => {
      calls.push(`sync-profile:${partial.currentRankId || ""}:${partial.totalXp ?? ""}`);
    }),
  });

  return {
    api,
    calls,
    tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getLiveSessionsByTaskId: () => liveSessionsByTaskId,
    setLiveSessionsByTaskId: (value: LiveSessionsByTaskId) => {
      liveSessionsByTaskId = value;
    },
    getRewardProgress: () => rewardProgress,
    getRewardSessionTrackersByTaskId: () => rewardSessionTrackersByTaskId,
  };
}

describe("task timer rewards history", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("awards session XP and appends history without a live-session record", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    const elapsedMs = harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(elapsedMs).toBe(MIN_REWARD_ELIGIBLE_SESSION_MS);
    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getHistoryByTaskId()["task-1"]?.[0]).toMatchObject({ name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS });
    expect(harness.getRewardProgress().totalXp).toBe(1);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.getRewardSessionTrackersByTaskId()["task-1"]).toBeUndefined();
    expect(harness.getLiveSessionsByTaskId()["task-1"]).toBeUndefined();
    expect(harness.calls).toContain("clear-live-session:task-1");
    expect(harness.calls).toContain("save-preferences:1");
  });

  it("preserves live-session note behavior and clears live-session state", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS,
          elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          updatedAtMs: Date.now(),
          status: "running",
          note: "live note",
        },
      },
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!);

    expect(harness.getHistoryByTaskId()["task-1"]?.[0]).toMatchObject({ note: "live note", sessionId: "session-1" });
    expect(harness.getLiveSessionsByTaskId()).toEqual({});
    expect(harness.getRewardSessionTrackersByTaskId()).toEqual({});
    expect(harness.calls).toContain("set-focus-draft:task-1:live note");
    expect(harness.calls).toContain("clear-live-session:task-1");
  });

  it("appends sub-threshold sessions but awards 0 XP under current rules", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS - 1 });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS - 1 });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getRewardProgress().totalXp).toBe(0);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.calls).toContain("save-preferences:0");
  });

  it("deduplicates completed history for the same live session id", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const liveSession = {
      sessionId: "session-1",
      taskId: "task-1",
      name: "Focus",
      startedAtMs: Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS,
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      updatedAtMs: Date.now(),
      status: "running" as const,
    };
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      liveSessionsByTaskId: { "task-1": liveSession },
    });

    harness.api.appendCompletedSessionHistory(harness.tasks[0]!, Date.now(), MIN_REWARD_ELIGIBLE_SESSION_MS, undefined, 4);
    harness.setLiveSessionsByTaskId({ "task-1": liveSession });
    harness.api.appendCompletedSessionHistory(harness.tasks[0]!, Date.now(), MIN_REWARD_ELIGIBLE_SESSION_MS, undefined, 4);

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getHistoryByTaskId()["task-1"]?.[0]).toMatchObject({ sessionId: "session-1" });
    expect(harness.getRewardProgress().totalXp).toBe(1);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.calls.filter((call) => call.startsWith("append-history:task-1:"))).toHaveLength(1);
    expect(harness.calls.filter((call) => call.startsWith("save-preferences:"))).toEqual(["save-preferences:1"]);
  });

  it("throttles repeated live-session sync writes until the interval elapses", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });
    harness.tasks[0]!.running = true;
    harness.tasks[0]!.startMs = Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS;

    harness.api.syncLiveSessionForTask(harness.tasks[0]!, Date.now());
    harness.api.syncLiveSessionForTask(harness.tasks[0]!, Date.now() + 1_000);

    expect(harness.calls.filter((call) => call === "save-live-session")).toHaveLength(1);

    harness.api.syncLiveSessionForTask(harness.tasks[0]!, Date.now() + ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS);

    expect(harness.calls.filter((call) => call === "save-live-session")).toHaveLength(2);
  });
});
