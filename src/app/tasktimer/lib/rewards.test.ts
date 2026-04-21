import { describe, expect, it } from "vitest";

import {
  awardDailyConsistencyBonus,
  awardTaskLaunchXp,
  awardWeeklyGoalBonuses,
  buildXpProgressArchieMessage,
  type RewardProgressV1,
} from "./rewards";
import type { HistoryByTaskId } from "./types";
import type { Task } from "./types";

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Deep Work",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function createProgress(overrides?: Partial<RewardProgressV1>): RewardProgressV1 {
  return {
    totalXp: 120,
    totalXpPrecise: 120,
    currentRankId: "rank-1",
    lastAwardedAt: null,
    completedSessions: 0,
    awardLedger: [],
    ...overrides,
  };
}

function createMomentumContext(tasks: Task[], historyByTaskId: HistoryByTaskId, now: number) {
  void now;
  return {
    historyByTaskId,
    tasks,
    weekStarting: "mon" as const,
    momentumEntitled: true,
  };
}

describe("reward helper multipliers", () => {
  it("multiplies daily consistency bonus when momentum is entitled and context is present", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const dayKey = "2026-04-17";
    const task = createTask({
      running: true,
      startMs: now - 30 * 60 * 1000,
      timeGoalEnabled: true,
      timeGoalMinutes: 180,
      timeGoalPeriod: "week",
    });
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        { ts: now - 5 * 60 * 60 * 1000, name: task.name, ms: 20 * 60 * 1000 },
        { ts: now - 30 * 60 * 1000, name: task.name, ms: 20 * 60 * 1000 },
        { ts: now - 26 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
        { ts: now - 50 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
      ],
    };

    const award = awardDailyConsistencyBonus(createProgress(), historyByTaskId, dayKey, now, createMomentumContext([task], historyByTaskId, now));

    expect(award.amount).toBe(6);
    expect(award.next.awardLedger).toEqual([
      expect.objectContaining({
        reason: "dailyConsistency",
        baseXp: 3,
        multiplier: 2,
        xp: 6,
        sourceKey: `daily:${dayKey}`,
      }),
    ]);
  });

  it("falls back to 1x daily consistency bonus without entitlement", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const historyByTaskId: HistoryByTaskId = {
      "task-1": [
        { ts: now - 3 * 60 * 60 * 1000, name: "Deep Work", ms: 20 * 60 * 1000 },
        { ts: now - 20 * 60 * 1000, name: "Deep Work", ms: 20 * 60 * 1000 },
      ],
    };

    const award = awardDailyConsistencyBonus(createProgress(), historyByTaskId, "2026-04-17", now, {
      ...createMomentumContext([createTask()], historyByTaskId, now),
      momentumEntitled: false,
    });

    expect(award.amount).toBe(3);
    expect(award.next.awardLedger[0]).toEqual(
      expect.objectContaining({
        baseXp: 3,
        multiplier: 1,
        xp: 3,
      })
    );
  });

  it("falls back to 1x daily consistency bonus when momentum context is incomplete", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const historyByTaskId: HistoryByTaskId = {
      "task-1": [
        { ts: now - 3 * 60 * 60 * 1000, name: "Deep Work", ms: 20 * 60 * 1000 },
        { ts: now - 20 * 60 * 1000, name: "Deep Work", ms: 20 * 60 * 1000 },
      ],
    };

    const award = awardDailyConsistencyBonus(createProgress(), historyByTaskId, "2026-04-17", now, {
      historyByTaskId,
      momentumEntitled: true,
    });

    expect(award.amount).toBe(3);
    expect(award.next.awardLedger[0]).toEqual(
      expect.objectContaining({
        baseXp: 3,
        multiplier: 1,
        xp: 3,
      })
    );
  });

  it("multiplies weekly goal bonuses when momentum is entitled and context is present", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const task = createTask({
      timeGoalEnabled: true,
      timeGoalMinutes: 180,
      timeGoalPeriod: "week",
    });
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        { ts: now - 30 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
        { ts: now - 26 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
        { ts: now - 50 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
      ],
    };

    const award = awardWeeklyGoalBonuses(createProgress(), historyByTaskId, [task], "mon", now, createMomentumContext([task], historyByTaskId, now));

    expect(award.amount).toBe(24);
    expect(award.next.awardLedger).toEqual([
      expect.objectContaining({
        reason: "weeklyGoal60",
        baseXp: 4,
        multiplier: 2,
        xp: 8,
      }),
      expect.objectContaining({
        reason: "weeklyGoal100",
        baseXp: 8,
        multiplier: 2,
        xp: 16,
      }),
    ]);
  });

  it("does not activate dormant launch XP awards", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const progress = createProgress();

    const award = awardTaskLaunchXp(progress, { taskId: "task-1", awardedAt: now });

    expect(award.amount).toBe(0);
    expect(award.next.awardLedger).toEqual([]);
    expect(award.next.totalXp).toBe(progress.totalXp);
  });
});

describe("buildXpProgressArchieMessage", () => {
  it("reports when no XP was earned in the last 24 hours", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const progress = createProgress({
      awardLedger: [
        {
          ts: now - 25 * 60 * 60 * 1000,
          dayKey: "2026-04-16",
          taskId: "task-1",
          xp: 40,
          baseXp: 40,
          multiplier: 1,
          eligibleMs: 3_600_000,
          reason: "session",
          sourceKey: "old-session",
        },
      ],
    });

    const message = buildXpProgressArchieMessage(progress, [createTask()], now);

    expect(message).toBe(
      "In the last 24 hours, you have not earned any XP yet. You are currently earning XP at the standard 1x rate."
    );
    expect(message).not.toContain("rank band");
    expect(message).not.toContain("next rank");
  });

  it("reports only the last 24 hours breakdown", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const progress = createProgress({
      awardLedger: [
        {
          ts: now - 2 * 60 * 60 * 1000,
          dayKey: "2026-04-17",
          taskId: "task-1",
          xp: 25,
          baseXp: 25,
          multiplier: 1,
          eligibleMs: 3_600_000,
          reason: "session",
          sourceKey: "recent-session",
        },
        {
          ts: now - 90 * 60 * 1000,
          dayKey: "2026-04-17",
          taskId: null,
          xp: 10,
          baseXp: 10,
          multiplier: 1,
          eligibleMs: 0,
          reason: "dailyConsistency",
          sourceKey: "recent-daily",
        },
        {
          ts: now - 26 * 60 * 60 * 1000,
          dayKey: "2026-04-16",
          taskId: null,
          xp: 99,
          baseXp: 99,
          multiplier: 1,
          eligibleMs: 0,
          reason: "launch",
          sourceKey: "old-launch",
        },
      ],
    });

    const message = buildXpProgressArchieMessage(progress, [createTask()], now);

    expect(message).toContain("In the last 24 hours, you earned 35 XP");
    expect(message).toContain("25 XP from session time on Deep Work");
    expect(message).toContain("10 XP from daily consistency");
    expect(message).toContain("You are currently earning XP at the standard 1x rate.");
    expect(message).not.toContain("99 XP");
    expect(message).not.toContain("rank band");
    expect(message).not.toContain("next rank");
  });

  it("reports the active multiplier when momentum boosts XP", () => {
    const now = new Date("2026-04-17T12:00:00.000Z").getTime();
    const task = createTask({
      running: true,
      startMs: now - 30 * 60 * 1000,
      timeGoalEnabled: true,
      timeGoalMinutes: 180,
      timeGoalPeriod: "week",
    });
    const progress = createProgress({
      awardLedger: [
        {
          ts: now - 2 * 60 * 60 * 1000,
          dayKey: "2026-04-17",
          taskId: task.id,
          xp: 25,
          baseXp: 25,
          multiplier: 1,
          eligibleMs: 3_600_000,
          reason: "session",
          sourceKey: "recent-session",
        },
      ],
    });

    const message = buildXpProgressArchieMessage(progress, [task], now, {
      historyByTaskId: {
        [task.id]: [
          { ts: now - 30 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
          { ts: now - 26 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
          { ts: now - 50 * 60 * 60 * 1000, name: task.name, ms: 90 * 60 * 1000 },
        ],
      },
      weekStarting: "mon",
      momentumEntitled: true,
    });

    expect(message).toContain("You are currently earning XP at a 2x multiplier.");
  });
});
