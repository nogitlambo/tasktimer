import { afterEach, describe, expect, it, vi } from "vitest";

import { MIN_REWARD_ELIGIBLE_SESSION_MS, rebuildRewardProgressFromHistory } from "./rewards";

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
});
