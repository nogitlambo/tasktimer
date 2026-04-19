import { describe, expect, it } from "vitest";

import { buildXpProgressArchieMessage, type RewardProgressV1 } from "./rewards";
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
      weekStarting: "monday",
      dashboardIncludedModes: { mode1: true, mode2: false, mode3: false },
      isModeEnabled: () => true,
      taskModeOf: () => "mode1",
      momentumEntitled: true,
    });

    expect(message).toContain("You are currently earning XP at a 2x multiplier.");
  });
});
