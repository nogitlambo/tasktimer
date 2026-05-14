import { afterEach, describe, expect, it, vi } from "vitest";

import {
  awardCompletedSessionXp,
  DEFAULT_REWARD_PROGRESS,
  getRankForXp,
  MIN_REWARD_ELIGIBLE_SESSION_MS,
  RANK_LADDER,
  normalizeRewardProgress,
} from "./rewards";
import type { Task } from "./types";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

describe("awardCompletedSessionXp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still awards session XP when the device clock is behind the latest ledger entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T09:50:00.000Z"));

    const progress = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 1,
      totalXpPrecise: 1,
      completedSessions: 1,
      lastAwardedAt: Date.parse("2026-05-05T10:00:00.000Z"),
      awardLedger: [
        {
          ts: Date.parse("2026-05-05T10:00:00.000Z"),
          dayKey: "2026-05-05",
          taskId: "task-older",
          xp: 1,
          baseXp: 1,
          multiplier: 1,
          eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          reason: "session",
          sourceKey: "session:task-older:1746439200000:0",
        },
      ],
    });

    const result = awardCompletedSessionXp(progress, {
      taskId: "task-new",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-new": [
          {
            ts: Date.now(),
            name: "Task New",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXp).toBe(2);
    expect(result.next.completedSessions).toBe(2);
  });

  it("does not apply a global daily session XP cap across different tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previousLedger = Array.from({ length: 12 }, (_, index) => {
      const ts = Date.parse("2026-05-05T08:00:00.000Z") + index * MIN_REWARD_ELIGIBLE_SESSION_MS;
      return {
        ts,
        dayKey: "2026-05-05",
        taskId: `task-${index}`,
        xp: 1,
        baseXp: 1,
        multiplier: 1,
        eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
        reason: "session" as const,
        sourceKey: `session:task-${index}:${ts}:0`,
      };
    });
    const progress = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 12,
      totalXpPrecise: 12,
      completedSessions: 12,
      lastAwardedAt: previousLedger[previousLedger.length - 1]?.ts,
      awardLedger: previousLedger,
    });

    const result = awardCompletedSessionXp(progress, {
      taskId: "task-new",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-new": [
          {
            ts: Date.now(),
            name: "Task New",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXp).toBe(13);
    expect(result.next.completedSessions).toBe(13);
  });

  it("awards one XP for a one-minute no-goal task session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXp).toBe(1);
    expect(result.next.completedSessions).toBe(1);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      taskId: "task-1",
      eligibleMs: MINUTE_MS,
      baseXp: 1,
      multiplier: 1,
    });
  });

  it("does not award XP below one minute but still counts the completed session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MINUTE_MS - 1,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MINUTE_MS - 1 }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(0);
    expect(result.next.totalXp).toBe(0);
    expect(result.next.completedSessions).toBe(1);
    expect(result.next.awardLedger).toEqual([]);
  });

  it("caps a no-goal task session at sixty minutes per day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 120 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const sessionEligibleMs = result.next.awardLedger
      .filter((entry) => entry.reason === "session")
      .reduce((sum, entry) => sum + entry.eligibleMs, 0);
    expect(sessionEligibleMs).toBe(60 * MINUTE_MS);
    expect(result.next.totalXp).toBe(60);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      eligibleMs: 60 * MINUTE_MS,
      baseXp: 60,
      multiplier: 1,
    });
  });

  it("caps a daily-goal task at its configured daily goal minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 45 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task({ timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 30 })],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(30);
    expect(result.next.totalXp).toBe(30);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      eligibleMs: 30 * MINUTE_MS,
      baseXp: 30,
    });
  });

  it("uses the sixty-minute fallback cap for weekly-goal tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 90 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task({ timeGoalEnabled: true, timeGoalPeriod: "week", timeGoalMinutes: 120 })],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const sessionEligibleMs = result.next.awardLedger
      .filter((entry) => entry.reason === "session")
      .reduce((sum, entry) => sum + entry.eligibleMs, 0);
    expect(sessionEligibleMs).toBe(60 * MINUTE_MS);
    expect(result.next.totalXp).toBeGreaterThanOrEqual(60);
  });

  it("persists extra logged time after the cap without awarding more session XP", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previous = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now() - MINUTE_MS,
      elapsedMs: 60 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now() - MINUTE_MS, name: "Focus", ms: 60 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    }).next;

    const result = awardCompletedSessionXp(previous, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: 10 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: 70 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
      completedSessionsDelta: 0,
    });

    expect(result.amount).toBe(0);
    expect(result.next.totalXp).toBe(60);
    expect(result.next.completedSessions).toBe(1);
  });

  it("applies Momentum multipliers without an advancedInsights entitlement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const awardedAt = Date.now();
    const historyByTaskId = {
      "task-1": Array.from({ length: 5 }, (_, index) => ({
        ts: awardedAt - index * DAY_MS,
        name: "Focus",
        ms: index === 0 ? MINUTE_MS : 5 * MINUTE_MS,
      })),
    };

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt,
      elapsedMs: MINUTE_MS,
      historyByTaskId,
      tasks: [task({ running: true, startMs: awardedAt - MINUTE_MS })],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1.5);
    expect(result.next.totalXpPrecise).toBe(1.5);
    expect(result.next.totalXp).toBe(1);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      baseXp: 1,
      multiplier: 1.5,
      xp: 1.5,
    });
  });
});

describe("rank ladder", () => {
  it("uses the configured unlock thresholds", () => {
    expect(RANK_LADDER.map(({ id, minXp }) => [id, minXp])).toEqual([
      ["unranked", 0],
      ["initiate", 10],
      ["operator", 60],
      ["technician", 240],
      ["engineer", 960],
      ["analyst", 2880],
      ["specialist", 5760],
      ["strategist", 8640],
      ["director", 12000],
      ["ascendent", 15600],
      ["commander", 18720],
      ["architect", 22460],
      ["overseer", 26900],
      ["visionary", 32280],
      ["sovereign", 38740],
      ["mythic", 50000],
    ]);
    expect(getRankForXp(9).id).toBe("unranked");
    expect(getRankForXp(10).id).toBe("initiate");
    expect(getRankForXp(59).id).toBe("initiate");
    expect(getRankForXp(60).id).toBe("operator");
    expect(getRankForXp(50000).id).toBe("mythic");
  });
});
