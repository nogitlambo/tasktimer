import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_REWARD_PROGRESS,
  MIN_REWARD_ELIGIBLE_SESSION_MS,
  normalizeRewardProgress,
  rebuildRewardProgressFromHistory,
  reconcileRewardProgressWithHistory,
} from "./rewards";

describe("rebuildRewardProgressFromHistory", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconstructs missing session XP from recorded history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = rebuildRewardProgressFromHistory({
      historyByTaskId: {
        "task-1": [
          {
            ts: Date.parse("2026-05-05T09:50:00.000Z"),
            name: "Focus",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [
        {
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
        },
      ],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.totalXp).toBe(1);
    expect(result.completedSessions).toBe(1);
    expect(result.currentRankId).toBe("unranked");
    expect(result.awardLedger).toHaveLength(1);
    expect(result.awardLedger[0]).toMatchObject({
      reason: "session",
      taskId: "task-1",
      xp: 1,
      eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
    });
  });

  it("preserves existing awarded XP when history has been deleted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const currentProgress = rebuildRewardProgressFromHistory({
      historyByTaskId: {
        "task-1": [
          {
            ts: Date.parse("2026-05-05T09:50:00.000Z"),
            name: "Focus",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [
        {
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
        },
      ],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const result = reconcileRewardProgressWithHistory({
      currentProgress,
      historyByTaskId: {},
      tasks: [],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result).toEqual(currentProgress);
  });

  it("reconstructs XP from history when rewards are missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = reconcileRewardProgressWithHistory({
      currentProgress: DEFAULT_REWARD_PROGRESS,
      historyByTaskId: {
        "task-1": [
          {
            ts: Date.parse("2026-05-05T09:50:00.000Z"),
            name: "Focus",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [
        {
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
        },
      ],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.totalXp).toBe(1);
    expect(result.completedSessions).toBe(1);
    expect(result.awardLedger).toHaveLength(1);
  });

  it("backfills missing rewards from history without reducing existing totals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const currentProgress = rebuildRewardProgressFromHistory({
      historyByTaskId: {
        "task-1": [
          {
            ts: Date.parse("2026-05-05T09:50:00.000Z"),
            name: "Focus",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [
        {
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
        },
      ],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const result = reconcileRewardProgressWithHistory({
      currentProgress,
      historyByTaskId: {
        "task-1": [
          {
            ts: Date.parse("2026-05-05T09:50:00.000Z"),
            name: "Focus",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
        "task-2": [
          {
            ts: Date.parse("2026-05-05T09:55:00.000Z"),
            name: "Deep Work",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [
        {
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
        },
        {
          id: "task-2",
          name: "Deep Work",
          order: 1,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          collapsed: false,
          milestonesEnabled: false,
          milestones: [],
          hasStarted: true,
        },
      ],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(normalizeRewardProgress(currentProgress).totalXp).toBe(1);
    expect(result.totalXp).toBe(2);
    expect(result.completedSessions).toBe(2);
    expect(result.awardLedger).toHaveLength(2);
  });
});
