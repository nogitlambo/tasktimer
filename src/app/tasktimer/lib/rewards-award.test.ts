import { describe, expect, it, vi } from "vitest";

import { awardCompletedSessionXp, DEFAULT_REWARD_PROGRESS, MIN_REWARD_ELIGIBLE_SESSION_MS, normalizeRewardProgress } from "./rewards";

describe("awardCompletedSessionXp", () => {
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
});
