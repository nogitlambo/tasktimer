import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REWARD_PROGRESS, MIN_REWARD_ELIGIBLE_SESSION_MS, normalizeRewardProgress } from "../lib/rewards";
import { ACTIVE_SESSION_CLOUD_WRITE_INTERVAL_MS } from "../lib/storage";
import type { HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import { createTaskTimerRewardsHistory } from "./rewards-history";
import type { TaskTimerRewardsHistoryContext } from "./context";
import { TASKTIMER_RANK_PROMOTION_EVENT } from "./rank-promotion";

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

function createHarness(
  overrides: Partial<{ liveSessionsByTaskId: LiveSessionsByTaskId; elapsedMs: number; historyByTaskId: HistoryByTaskId; tasks: Task[]; focusModeTaskId: string | null }> = {}
) {
  const calls: string[] = [];
  const tasks = overrides.tasks || [task()];
  let historyByTaskId: HistoryByTaskId = overrides.historyByTaskId || {};
  let storedHistoryByTaskId: HistoryByTaskId = overrides.historyByTaskId || {};
  const savedHistoryArgs: HistoryByTaskId[] = [];
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
    setHistoryByTaskId: (value) => {
      historyByTaskId = value;
    },
    getLiveSessionsByTaskId: () => liveSessionsByTaskId,
    setLiveSessionsByTaskId: (value) => {
      liveSessionsByTaskId = value;
    },
    getDeletedTaskMeta: () => ({}),
    getWeekStarting: () => "mon",
    getOptimalProductivityDays: () => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
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
    getFocusModeTaskId: () => (Object.prototype.hasOwnProperty.call(overrides, "focusModeTaskId") ? overrides.focusModeTaskId || null : null),
    getCurrentPlan: () => "free",
    hasEntitlement: () => false,
    currentUid: () => "uid-1",
    getTaskElapsedMs: () => elapsedMs,
    sessionColorForTaskMs: () => "#00CFC8",
    historyEntryColorForTaskMs: () => "#ff8a3d",
    captureSessionNoteSnapshot: () => "",
    setFocusSessionDraft: (taskId, note) => calls.push(`set-focus-draft:${taskId}:${note}`),
    clearFocusSessionDraft: (taskId) => calls.push(`clear-focus-draft:${taskId}`),
    syncFocusSessionNotesInput: (taskId) => calls.push(`sync-focus-input:${taskId}`),
    syncFocusSessionNotesAccordion: (taskId) => calls.push(`sync-focus-accordion:${taskId}`),
    appendHistoryEntry: (taskId, entry) => calls.push(`append-history:${taskId}:${entry.ms}`),
    saveLiveSession: () => calls.push("save-live-session"),
    clearLiveSession: (taskId) => calls.push(`clear-live-session:${taskId}`),
    saveHistoryLocally: (history) => {
      savedHistoryArgs.push(history);
      storedHistoryByTaskId = history;
      calls.push("save-history");
    },
    saveHistory: (history) => {
      savedHistoryArgs.push(history);
      storedHistoryByTaskId = history;
      calls.push("replace-history");
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
    syncOwnFriendshipProfile: vi.fn(async (_uid: string, partial: { currentRankId?: string | null | undefined; totalXp?: number | null | undefined; completedTaskCount?: number | null | undefined }) => {
      calls.push(`sync-profile:${partial.currentRankId || ""}:${partial.totalXp ?? ""}`);
    }),
  });

  return {
    api,
    calls,
    tasks,
    getHistoryByTaskId: () => historyByTaskId,
    getStoredHistoryByTaskId: () => storedHistoryByTaskId,
    savedHistoryArgs,
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
    vi.unstubAllGlobals();
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

  it("awards XP and writes goal-length history for a completed 10-minute daily goal", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const completedAtMs = Date.now();
    const elapsedMs = 10 * 60 * 1000;
    const harness = createHarness({
      elapsedMs,
      tasks: [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 10,
        }),
      ],
    });

    const finalizedElapsedMs = harness.api.finalizeLiveSession(harness.tasks[0]!, {
      elapsedMs,
      completedAtMs,
    });

    expect(finalizedElapsedMs).toBe(elapsedMs);
    expect(harness.getHistoryByTaskId()["task-1"]).toEqual([
      expect.objectContaining({
        ts: completedAtMs,
        name: "Focus",
        ms: elapsedMs,
      }),
    ]);
    expect(harness.getRewardProgress().totalXp).toBe(5);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.calls).toContain("save-preferences:5");
  });

  it("logs time-goal stop history while deferring XP from the visible total", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      tasks: [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
        }),
      ],
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, {
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      deferTimeGoalXp: true,
    });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getRewardProgress().totalXp).toBe(0);
    expect(harness.getRewardProgress().completedSessions).toBe(0);
    expect(harness.getRewardProgress().pendingTimeGoalXp.byTaskId["task-1"]?.entries).toHaveLength(1);
    expect(harness.calls).toContain("save-preferences:0");
    expect(harness.calls.some((call) => call.startsWith("sync-profile:"))).toBe(false);
  });

  it("cashes out pending time-goal XP and clears the pending entry", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    harness.api.finalizeLiveSession(harness.tasks[0]!, {
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      deferTimeGoalXp: true,
    });
    const award = harness.api.applyPendingTimeGoalXpForTask("task-1");

    expect(award?.amount).toBe(1);
    expect(harness.getRewardProgress().totalXp).toBe(1);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.getRewardProgress().pendingTimeGoalXp.byTaskId["task-1"]).toBeUndefined();
    expect(harness.calls).toContain("sync-profile:unranked:1");
  });

  it("combines pending XP with the final resumed time-goal increment", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    harness.api.finalizeLiveSession(harness.tasks[0]!, {
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      deferTimeGoalXp: true,
    });

    vi.setSystemTime(new Date(Date.now() + MIN_REWARD_ELIGIBLE_SESSION_MS));
    harness.tasks[0]!.accumulatedMs = MIN_REWARD_ELIGIBLE_SESSION_MS;
    harness.setLiveSessionsByTaskId({
      "task-1": {
        sessionId: "session-2",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: Date.now(),
        elapsedMs: 2 * MIN_REWARD_ELIGIBLE_SESSION_MS,
        resumedFromMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
        updatedAtMs: Date.now(),
        status: "running",
      },
    });

    harness.api.applyPendingTimeGoalXpForTask("task-1");
    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: 2 * MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getHistoryByTaskId()["task-1"]?.[0]?.ms).toBe(2 * MIN_REWARD_ELIGIBLE_SESSION_MS);
    expect(harness.getRewardProgress().totalXp).toBe(2);
    expect(harness.getRewardProgress().pendingTimeGoalXp.byTaskId["task-1"]).toBeUndefined();
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

  it("keeps the focus draft and editor untouched when focused stop finalizes a note", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      focusModeTaskId: "task-1",
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS,
          elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          updatedAtMs: Date.now(),
          status: "running",
          note: "focused note",
        },
      },
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, {
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      preserveFocusSessionDraft: true,
    });

    expect(harness.getHistoryByTaskId()["task-1"]?.[0]).toMatchObject({ note: "focused note", sessionId: "session-1" });
    expect(harness.getLiveSessionsByTaskId()).toEqual({});
    expect(harness.calls).toContain("set-focus-draft:task-1:focused note");
    expect(harness.calls).toContain("clear-live-session:task-1");
    expect(harness.calls).not.toContain("clear-focus-draft:task-1");
    expect(harness.calls).not.toContain("sync-focus-input:task-1");
    expect(harness.calls).not.toContain("sync-focus-accordion:task-1");
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

  it("dispatches a rank promotion event only when a real session award promotes the rank", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const listener = vi.fn();
    const windowRef = new EventTarget();
    vi.stubGlobal("window", windowRef);
    vi.stubGlobal("CustomEvent", class<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    });
    windowRef.addEventListener(TASKTIMER_RANK_PROMOTION_EVENT, listener);
    const harness = createHarness({ elapsedMs: 10 * MIN_REWARD_ELIGIBLE_SESSION_MS });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: 10 * MIN_REWARD_ELIGIBLE_SESSION_MS });
    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });
    windowRef.removeEventListener(TASKTIMER_RANK_PROMOTION_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      previousRankId: "unranked",
      previousRankLabel: "Unranked",
      nextRankId: "initiate",
      nextRankLabel: "Initiate",
    });
  });

  it("updates the same same-day history row on resumed stops and awards only the elapsed delta", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const startedAtMs = Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS;
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs,
          elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          updatedAtMs: Date.now(),
          status: "running",
        },
      },
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS, note: "first", completionDifficulty: 3 });

    const secondElapsedMs = 2 * MIN_REWARD_ELIGIBLE_SESSION_MS;
    vi.setSystemTime(new Date(Date.now() + MIN_REWARD_ELIGIBLE_SESSION_MS));
    harness.tasks[0]!.accumulatedMs = MIN_REWARD_ELIGIBLE_SESSION_MS;
    harness.setLiveSessionsByTaskId({
      "task-1": {
        sessionId: "session-2",
        taskId: "task-1",
        name: "Focus",
        startedAtMs: Date.now(),
        elapsedMs: secondElapsedMs,
        resumedFromMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
        updatedAtMs: Date.now(),
        status: "running",
      },
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: secondElapsedMs, note: "second", completionDifficulty: 4 });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getHistoryByTaskId()["task-1"]?.[0]).toMatchObject({
      ms: secondElapsedMs,
      note: "second",
      completionDifficulty: 4,
      sessionId: "session-1",
    });
    expect(harness.getRewardProgress().totalXp).toBe(2);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.calls.filter((call) => call.startsWith("append-history:task-1:"))).toHaveLength(1);
    expect(harness.calls).toContain("replace-history");
  });

  it("does not append or award when a repeated finalization has unchanged elapsed time", () => {
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

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });
    harness.setLiveSessionsByTaskId({ "task-1": liveSession });
    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(1);
    expect(harness.getRewardProgress().totalXp).toBe(1);
    expect(harness.getRewardProgress().completedSessions).toBe(1);
    expect(harness.calls.filter((call) => call.startsWith("save-preferences:"))).toEqual(["save-preferences:1"]);
  });

  it("creates a new same-day row after reset has zeroed accumulated time", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const initialHistory: HistoryByTaskId = {
      "task-1": [{ ts: Date.now() - 60_000, name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS, sessionId: "before-reset" }],
    };
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: initialHistory,
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "after-reset",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - MIN_REWARD_ELIGIBLE_SESSION_MS,
          elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          updatedAtMs: Date.now(),
          status: "running",
        },
      },
    });
    harness.tasks[0]!.accumulatedMs = 0;

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(2);
    expect(harness.getHistoryByTaskId()["task-1"]?.[1]).toMatchObject({ sessionId: "after-reset", ms: MIN_REWARD_ELIGIBLE_SESSION_MS });
  });

  it("keeps cross-midnight completion on the stop day", () => {
    vi.setSystemTime(new Date("2026-05-03T00:05:00"));
    const harness = createHarness({ elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.getHistoryByTaskId()["task-1"]?.[0]?.ts).toBe(Date.now());
  });

  it("saves completed history with a new history snapshot so pending sync detects the append", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const initialHistory: HistoryByTaskId = {
      "task-1": [{ ts: Date.now() - 1_000, name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
    };
    const initialRows = initialHistory["task-1"]!;
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: initialHistory,
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.savedHistoryArgs).toHaveLength(1);
    expect(harness.savedHistoryArgs[0]).not.toBe(initialHistory);
    expect(harness.savedHistoryArgs[0]?.["task-1"]).not.toBe(initialRows);
    expect(harness.savedHistoryArgs[0]?.["task-1"]).toHaveLength(2);
    expect(initialRows).toHaveLength(1);
  });

  it("updates runtime history state before persisting the local snapshot", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const initialHistory: HistoryByTaskId = {
      "task-1": [{ ts: Date.now() - 1_000, name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
    };
    const harness = createHarness({
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: initialHistory,
    });

    harness.api.finalizeLiveSession(harness.tasks[0]!, { elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS });

    expect(harness.getHistoryByTaskId()["task-1"]).toHaveLength(2);
    expect(harness.getStoredHistoryByTaskId()["task-1"]).toHaveLength(2);
    expect(harness.getHistoryByTaskId()).toBe(harness.savedHistoryArgs[0]);
  });

  it("does not publish resumed live sessions with elapsed below the resume baseline", () => {
    vi.setSystemTime(new Date("2026-05-03T02:00:00Z"));
    const harness = createHarness({ elapsedMs: 0, tasks: [task({ running: true, accumulatedMs: 55, startMs: Date.now() })] });

    harness.api.upsertLiveSession(harness.tasks[0]!, { elapsedMs: 0, resumedFromMs: 55, forceCloudFlush: true, reason: "start" });

    expect(harness.getLiveSessionsByTaskId()["task-1"]).toMatchObject({
      elapsedMs: 55,
      resumedFromMs: 55,
    });
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
